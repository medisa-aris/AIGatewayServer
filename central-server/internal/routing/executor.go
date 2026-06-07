package routing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"central-server/internal/catalog"
)

const (
	providerTimeout = 60 * time.Second
	// fallback cost per token when no pricing table is consulted ($0.000002 USD)
	defaultCostPerToken = 0.000002
)

// Executor runs live RouteRequest executions: it validates via the existing
// dry-run Service, then augments the message, calls the upstream provider, and
// persists the full audit trail (route_logs, request_logs, budget_consumptions,
// guardrail_violations).
type Executor struct {
	data      DataWriter
	resources map[string]catalog.Resource
	validator *Service
	log       *slog.Logger
}

// NewExecutor constructs an Executor with its dependencies injected.
// data must implement DataWriter (satisfied by *store.Store).
func NewExecutor(data DataWriter, resources map[string]catalog.Resource, log *slog.Logger) (*Executor, error) {
	if data == nil {
		return nil, errors.New("routing.NewExecutor: data source is required")
	}
	if len(resources) == 0 {
		return nil, errors.New("routing.NewExecutor: resources catalog is required")
	}
	if log == nil {
		log = slog.New(slog.NewTextHandler(noopWriter{}, nil))
	}
	validator, err := NewService(data, resources, log)
	if err != nil {
		return nil, err
	}
	return &Executor{data: data, resources: resources, validator: validator, log: log}, nil
}

// Execute runs the full live routing pipeline for a single request.
//
// Pipeline stages:
//  1. Validate via RouteRequestTest (access + guardrails)
//  2. If blocked: write route_log with status="blocked", return early
//  3. Write guardrail_violations for any PII matches found
//  4. Augment message with skill bodies (message_request)
//  5. Optionally fetch MCP context and append to message_request
//  6. Load proxy endpoint + provider account
//  7. Call upstream LLM provider
//  8. Write route_log, request_log, budget_consumptions
//  9. Return RouteRequestResult
func (e *Executor) Execute(ctx context.Context, in RouteRequestInput) (*RouteRequestResult, error) {
	started := time.Now()

	if strings.TrimSpace(in.APIKey) == "" && strings.TrimSpace(in.APIKeyID) == "" {
		return nil, ErrInvalidAPIKey
	}
	if strings.TrimSpace(in.EndpointID) == "" {
		return nil, errors.New("endpoint_id is required for live execution")
	}

	// --- Stage 1: validate (dry-run reuse) ---
	testReport, err := e.validator.RouteRequestTest(ctx, RouteRequestTestInput{
		APIKey:      in.APIKey,
		APIKeyID:    in.APIKeyID,
		Message:     in.Message,
		EndpointID:  in.EndpointID,
		MCPServerID: in.MCPServerID,
	})
	if err != nil {
		return nil, err
	}

	checksJSON, _ := json.Marshal(testReport.Checks)

	// --- Stage 2: blocked early exit ---
	if !testReport.Allowed {
		row, writeErr := e.writeRouteLog(ctx, writeRouteLogArgs{
			userID:           testReport.UserID,
			orgID:            testReport.OrgID,
			proxyEndpointID:  in.EndpointID,
			mcpServerID:      in.MCPServerID,
			messageInquiry:   in.Message,
			messageRequest:   in.Message,
			pipelineChecks:   checksJSON,
			violationIDs:     []byte("[]"),
			status:           "blocked",
			latencyMs:        int(time.Since(started).Milliseconds()),
		})
		routeLogID := ""
		requestID := ""
		if writeErr == nil && row != nil {
			routeLogID = stringField(row, "id")
			requestID = stringField(row, "request_id")
		}
		return &RouteRequestResult{
			RouteLogID: routeLogID,
			RequestID:  requestID,
			Allowed:    false,
			Status:     "blocked",
			Checks:     testReport.Checks,
			LatencyMs:  int(time.Since(started).Milliseconds()),
		}, nil
	}

	// --- Stage 3: write guardrail violations for PII matches ---
	violationIDs := e.writeGuardrailViolations(ctx, testReport.Checks, testReport.UserID)
	violationIDsJSON, _ := json.Marshal(violationIDs)

	// --- Stage 4: augment message with skill bodies ---
	messageRequest := e.augmentWithSkills(ctx, in.Message, testReport.OrgID)

	// --- Stage 4.5: redact PII before the message leaves the gateway ---
	messageRequest = e.redactPII(ctx, messageRequest, testReport.UserID, testReport.OrgID)

	// --- Stage 5: optionally fetch MCP context ---
	if in.MCPServerID != "" {
		messageRequest = e.augmentWithMCP(ctx, messageRequest, in.MCPServerID)
	}

	// --- Stage 6: load proxy endpoint + provider account ---
	endpoint, err := e.get(ctx, "proxy-endpoints", in.EndpointID)
	if err != nil {
		return nil, fmt.Errorf("routing.Execute: load endpoint: %w", err)
	}
	providerAccountID := stringField(endpoint, "provider_account_id")
	if providerAccountID == "" {
		return e.errorResult(ctx, in, testReport, checksJSON, violationIDsJSON, started,
			"proxy endpoint has no provider account configured")
	}

	account, err := e.get(ctx, "provider-accounts", providerAccountID)
	if err != nil {
		return e.errorResult(ctx, in, testReport, checksJSON, violationIDsJSON, started,
			"provider account not found")
	}

	dialect := stringField(endpoint, "dialect")
	if dialect == "" {
		dialect = stringField(account, "provider_type")
	}

	// model comes from extra_config.model_id in the provider account, or falls
	// back to the account's name as an identifier
	modelID := extraConfigModel(account)

	// --- Stage 7: call upstream LLM provider ---
	provCtx, cancel := context.WithTimeout(ctx, providerTimeout)
	defer cancel()

	output, promptTokens, completionTokens, provErr := callProvider(provCtx, account, dialect, messageRequest)

	latencyMs := int(time.Since(started).Milliseconds())
	cost := float64(promptTokens+completionTokens) * defaultCostPerToken

	// --- Stage 8: persist audit trail ---
	status := "allowed"
	errMsg := ""
	if provErr != nil {
		status = "error"
		errMsg = provErr.Error()
		e.log.Warn("upstream provider call failed", slog.Any("error", provErr))
	}

	resolvedAPIKeyID := in.APIKeyID
	if resolvedAPIKeyID == "" {
		resolvedAPIKeyID = e.resolveAPIKeyID(ctx, in.APIKey)
	}

	routeLogRow, _ := e.writeRouteLog(ctx, writeRouteLogArgs{
		userID:             testReport.UserID,
		orgID:              testReport.OrgID,
		apiKeyID:           resolvedAPIKeyID,
		proxyEndpointID:    in.EndpointID,
		providerAccountID:  providerAccountID,
		modelID:            modelID,
		mcpServerID:        in.MCPServerID,
		messageInquiry:     in.Message,
		messageRequest:     messageRequest,
		messageOutput:      output,
		pipelineChecks:     checksJSON,
		violationIDs:       violationIDsJSON,
		status:             status,
		promptTokens:       promptTokens,
		completionTokens:   completionTokens,
		cost:               cost,
		latencyMs:          latencyMs,
		errorMessage:       errMsg,
	})

	routeLogID := ""
	requestID := ""
	if routeLogRow != nil {
		routeLogID = stringField(routeLogRow, "id")
		requestID = stringField(routeLogRow, "request_id")
	}

	e.writeRequestLog(ctx, requestLog{
		requestID:         requestID,
		userID:            testReport.UserID,
		apiKeyID:          resolvedAPIKeyID,
		inputTokens:       promptTokens,
		outputTokens:      completionTokens,
		cost:              cost,
		latencyMs:         latencyMs,
		statusCode:        statusCodeFromStatus(status),
		errorMessage:      errMsg,
	})

	e.writeBudgetConsumption(ctx, testReport.UserID, requestID, cost)

	// --- Stage 9: return ---
	return &RouteRequestResult{
		RouteLogID:       routeLogID,
		RequestID:        requestID,
		Allowed:          true,
		Status:           status,
		Output:           output,
		Checks:           testReport.Checks,
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		Cost:             cost,
		LatencyMs:        latencyMs,
		ErrorMessage:     errMsg,
	}, nil
}

// ---------------------------------------------------------------------------
// Provider calling
// ---------------------------------------------------------------------------

// callProvider dispatches to OpenAI-compatible or Anthropic based on dialect/
// provider_type. Returns the text output and token counts from the response.
// A non-nil error means the provider returned an error or the response was
// unreadable; the caller treats this as status="error" but still logs the row.
func callProvider(ctx context.Context, account map[string]any, dialect, message string) (output string, promptTokens, completionTokens int, err error) {
	apiKey := stringField(account, "api_key")
	endpointURL := stringField(account, "endpoint_url")
	providerType := stringField(account, "provider_type")

	effective := dialect
	if effective == "" {
		effective = providerType
	}

	switch strings.ToLower(effective) {
	case "anthropic":
		return callAnthropic(ctx, apiKey, endpointURL, extraConfigModel(account), message)
	default:
		// openai, azure, ollama, mistral, and any unknown dialect all use the
		// OpenAI-compatible chat completions API.
		return callOpenAICompat(ctx, apiKey, endpointURL, extraConfigModel(account), message)
	}
}

func callOpenAICompat(ctx context.Context, apiKey, baseURL, model, message string) (string, int, int, error) {
	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}
	if model == "" {
		model = "gpt-4o-mini"
	}

	body, _ := json.Marshal(map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "user", "content": message},
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(baseURL, "/")+"/v1/chat/completions",
		bytes.NewReader(body))
	if err != nil {
		return "", 0, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", 0, 0, fmt.Errorf("provider request: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", 0, 0, fmt.Errorf("provider returned %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", 0, 0, fmt.Errorf("parse response: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", 0, 0, errors.New("provider returned no choices")
	}

	return result.Choices[0].Message.Content,
		result.Usage.PromptTokens,
		result.Usage.CompletionTokens,
		nil
}

func callAnthropic(ctx context.Context, apiKey, baseURL, model, message string) (string, int, int, error) {
	if baseURL == "" {
		baseURL = "https://api.anthropic.com"
	}
	if model == "" {
		model = "claude-haiku-4-5-20251001"
	}

	body, _ := json.Marshal(map[string]any{
		"model":      model,
		"max_tokens": 4096,
		"messages": []map[string]any{
			{"role": "user", "content": message},
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(baseURL, "/")+"/v1/messages",
		bytes.NewReader(body))
	if err != nil {
		return "", 0, 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", 0, 0, fmt.Errorf("provider request: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", 0, 0, fmt.Errorf("provider returned %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", 0, 0, fmt.Errorf("parse response: %w", err)
	}

	var sb strings.Builder
	for _, block := range result.Content {
		if block.Type == "text" {
			sb.WriteString(block.Text)
		}
	}
	return sb.String(), result.Usage.InputTokens, result.Usage.OutputTokens, nil
}

// ---------------------------------------------------------------------------
// Message augmentation
// ---------------------------------------------------------------------------

// redactPII applies regex-based PII masking to the message before it is sent
// to the upstream provider. It mirrors the detection logic in Service.checkPII
// but actually replaces matches with the configured masking style.
// Non-regex detection methods are skipped (same as the dry-run).
// On any error the original message is returned unchanged.
func (e *Executor) redactPII(ctx context.Context, message, userID, orgID string) string {
	// Collect applicable guardrail profiles (same logic as the validator).
	roleIDs, err := e.validator.loadRoleIDs(ctx, userID)
	if err != nil {
		return message
	}
	profiles, err := e.validator.applicableProfiles(ctx, userID, orgID, roleIDs)
	if err != nil {
		return message
	}
	if len(profiles) == 0 {
		return message
	}

	result := message
	seen := map[string]bool{}

	for _, profile := range profiles {
		links, err := e.list(ctx, "guardrail-profile-pii-objects", map[string]string{
			"guardrail_profile_id": stringField(profile, "id"),
		})
		if err != nil {
			continue
		}
		for _, link := range links {
			objID := stringField(link, "pii_object_id")
			if objID == "" || seen[objID] {
				continue
			}
			seen[objID] = true

			obj, err := e.get(ctx, "pii-objects", objID)
			if err != nil {
				continue
			}
			if active, ok := obj["is_active"].(bool); ok && !active {
				continue
			}
			if stringField(obj, "detection_method") != "regex" {
				continue
			}
			pattern := stringField(obj, "pattern")
			re, err := regexp.Compile(pattern)
			if err != nil {
				e.log.Warn("skipping invalid PII regex during redaction",
					slog.String("pii_object", stringField(obj, "name")),
					slog.Any("error", err))
				continue
			}

			replacement := maskReplacement(stringField(obj, "masking_style"), stringField(obj, "name"))
			result = re.ReplaceAllString(result, replacement)
		}
	}

	return result
}

// maskReplacement returns the replacement string for a given masking_style.
func maskReplacement(style, name string) string {
	switch strings.ToLower(style) {
	case "redact":
		return "[REDACTED]"
	case "hash":
		return "[HASHED]"
	case "tokenize":
		return "[TOKEN]"
	default: // "replace" and anything else
		label := strings.ToUpper(strings.ReplaceAll(name, " ", "_"))
		if label == "" {
			label = "PII"
		}
		return "[" + label + "]"
	}
}

// augmentWithSkills prepends skill bodies for any skills referenced in the
// message (by /slug or substring). Skills that cannot be loaded are silently
// skipped — the original message is returned unchanged on any error.
func (e *Executor) augmentWithSkills(ctx context.Context, message, orgID string) string {
	skills, err := e.list(ctx, "skills", map[string]string{"org_id": orgID})
	if err != nil {
		return message
	}
	referenced := referencedSkills(message, skills)
	if len(referenced) == 0 {
		return message
	}

	var sb strings.Builder
	for _, skill := range referenced {
		if body := stringField(skill, "body"); body != "" {
			sb.WriteString("---\nSkill: ")
			sb.WriteString(stringField(skill, "name"))
			sb.WriteString("\n")
			sb.WriteString(body)
			sb.WriteString("\n---\n")
		}
	}
	if sb.Len() == 0 {
		return message
	}
	sb.WriteString(message)
	return sb.String()
}

// augmentWithMCP calls the MCP server's endpoint to retrieve context and
// appends it to the message. On any error the original message is returned.
func (e *Executor) augmentWithMCP(ctx context.Context, message, mcpServerID string) string {
	server, err := e.get(ctx, "mcp-servers", mcpServerID)
	if err != nil {
		return message
	}
	endpointURL := stringField(server, "endpoint_url")
	if endpointURL == "" {
		return message
	}

	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, endpointURL, nil)
	if err != nil {
		return message
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return message
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if err != nil || len(raw) == 0 {
		return message
	}

	return message + "\n\n[MCP Context]\n" + string(raw)
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

type writeRouteLogArgs struct {
	userID             string
	orgID              string
	apiKeyID           string
	proxyEndpointID    string
	providerAccountID  string
	modelID            string
	mcpServerID        string
	messageInquiry     string
	messageRequest     string
	messageOutput      string
	pipelineChecks     []byte
	violationIDs       []byte
	status             string
	promptTokens       int
	completionTokens   int
	cost               float64
	latencyMs          int
	errorMessage       string
}

func (e *Executor) writeRouteLog(ctx context.Context, a writeRouteLogArgs) (map[string]any, error) {
	resource, ok := e.resources["route-logs"]
	if !ok {
		return nil, fmt.Errorf("routing.writeRouteLog: route-logs resource not in catalog")
	}

	payload := map[string]any{
		"message_inquiry":          a.messageInquiry,
		"message_request":          a.messageRequest,
		"pipeline_checks":          json.RawMessage(a.pipelineChecks),
		"guardrail_violation_ids":  json.RawMessage(a.violationIDs),
		"status":                   a.status,
		"prompt_tokens":            a.promptTokens,
		"completion_tokens":        a.completionTokens,
		"cost":                     a.cost,
		"latency_ms":               a.latencyMs,
		"completed_at":             time.Now().UTC().Format(time.RFC3339Nano),
	}
	if a.userID != "" {
		payload["user_id"] = a.userID
	}
	if a.orgID != "" {
		payload["org_id"] = a.orgID
	}
	if a.apiKeyID != "" {
		payload["api_key_id"] = a.apiKeyID
	}
	if a.proxyEndpointID != "" {
		payload["proxy_endpoint_id"] = a.proxyEndpointID
	}
	if a.providerAccountID != "" {
		payload["provider_account_id"] = a.providerAccountID
	}
	if a.modelID != "" {
		payload["model_id"] = a.modelID
	}
	if a.mcpServerID != "" {
		payload["mcp_server_id"] = a.mcpServerID
	}
	if a.messageOutput != "" {
		payload["message_output"] = a.messageOutput
	}
	if a.errorMessage != "" {
		payload["error_message"] = a.errorMessage
	}

	row, err := e.data.Create(ctx, resource, payload)
	if err != nil {
		e.log.Warn("failed to write route_log", slog.Any("error", err))
		return nil, err
	}
	return row, nil
}

type requestLog struct {
	requestID    string
	userID       string
	apiKeyID     string
	inputTokens  int
	outputTokens int
	cost         float64
	latencyMs    int
	statusCode   int
	errorMessage string
}

func (e *Executor) writeRequestLog(ctx context.Context, rl requestLog) {
	resource, ok := e.resources["request-logs"]
	if !ok {
		return
	}
	if rl.userID == "" {
		return
	}

	payload := map[string]any{
		"user_id":         rl.userID,
		"method":          "POST",
		"path":            "/api/v1/route-request",
		"input_tokens":    rl.inputTokens,
		"output_tokens":   rl.outputTokens,
		"cost":            rl.cost,
		"latency_ms":      rl.latencyMs,
		"status_code":     rl.statusCode,
		"request_headers": json.RawMessage("{}"),
		"response_headers": json.RawMessage("{}"),
	}
	if rl.requestID != "" {
		payload["request_id"] = rl.requestID
	}
	if rl.apiKeyID != "" {
		payload["api_key_id"] = rl.apiKeyID
	}
	if rl.errorMessage != "" {
		payload["error_message"] = rl.errorMessage
	}

	if _, err := e.data.Create(ctx, resource, payload); err != nil {
		e.log.Warn("failed to write request_log", slog.Any("error", err))
	}
}

func (e *Executor) writeBudgetConsumption(ctx context.Context, userID, requestID string, cost float64) {
	if userID == "" || cost <= 0 {
		return
	}
	resource, ok := e.resources["budget-consumptions"]
	if !ok {
		return
	}

	userBudgets, err := e.list(ctx, "user-budgets", map[string]string{
		"user_id": userID,
		"status":  "active",
	})
	if err != nil || len(userBudgets) == 0 {
		return
	}
	ub := userBudgets[0]
	userBudgetID := stringField(ub, "id")
	budgetID := stringField(ub, "budget_id")

	payload := map[string]any{
		"user_budget_id": userBudgetID,
		"user_id":        userID,
		"amount":         cost,
		"currency":       "USD",
		"usage_type":     "inference",
		"quantity":       1,
		"status":         "settled",
		"consumed_at":    time.Now().UTC().Format(time.RFC3339Nano),
	}
	if requestID != "" {
		payload["request_id"] = requestID
	}

	if _, err := e.data.Create(ctx, resource, payload); err != nil {
		e.log.Warn("failed to write budget_consumption", slog.Any("error", err))
		return
	}

	// Decrement remaining_amount on the user_budget.
	ubResource, ok := e.resources["user-budgets"]
	if !ok {
		return
	}
	remaining := toFloat(ub["remaining_amount"]) - cost
	if remaining < 0 {
		remaining = 0
	}
	newStatus := "active"
	if remaining <= 0 {
		newStatus = "exhausted"
	}
	update := map[string]any{
		"remaining_amount": remaining,
		"status":           newStatus,
	}
	_ = budgetID // referenced for future FK linking; not needed for the update
	if _, err := e.data.Update(ctx, ubResource, userBudgetID, update); err != nil {
		e.log.Warn("failed to update user_budget remaining_amount", slog.Any("error", err))
	}
}

// writeGuardrailViolations inserts a guardrail_violations row for each PII
// warn check and returns the list of created violation IDs.
func (e *Executor) writeGuardrailViolations(ctx context.Context, checks []CheckResult, userID string) []string {
	resource, ok := e.resources["guardrail-violations"]
	if !ok {
		return nil
	}

	ids := []string{}
	for _, check := range checks {
		if check.Step != "guardrail_pii" || check.Status != StatusWarn {
			continue
		}
		payload := map[string]any{
			"rule_type":                "pii",
			"severity":                 "medium",
			"triggered_content_snippet": check.Message,
			"action_taken":             "masked",
			"triggered_at":             time.Now().UTC().Format(time.RFC3339Nano),
		}
		if detailsJSON, err := json.Marshal(check.Details); err == nil {
			payload["metadata"] = json.RawMessage(detailsJSON)
		}
		row, err := e.data.Create(ctx, resource, payload)
		if err != nil {
			e.log.Warn("failed to write guardrail_violation", slog.Any("error", err))
			continue
		}
		if id := stringField(row, "id"); id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

// resolveAPIKeyID looks up the api_keys row ID for the given raw key.
// Returns "" on any error — it is only used for audit trail enrichment.
func (e *Executor) resolveAPIKeyID(ctx context.Context, apiKey string) string {
	hash := sha256Hex(strings.TrimSpace(apiKey))
	rows, err := e.list(ctx, "api-keys", map[string]string{"key_hash": hash})
	if err != nil || len(rows) == 0 {
		return ""
	}
	return stringField(rows[0], "id")
}

// errorResult writes a route_log with status="error" and returns an
// appropriate RouteRequestResult. Used when the pipeline can't proceed.
func (e *Executor) errorResult(
	ctx context.Context,
	in RouteRequestInput,
	testReport *RouteRequestTestReport,
	checksJSON, violationIDsJSON []byte,
	started time.Time,
	errMsg string,
) (*RouteRequestResult, error) {
	latencyMs := int(time.Since(started).Milliseconds())
	row, _ := e.writeRouteLog(ctx, writeRouteLogArgs{
		userID:          testReport.UserID,
		orgID:           testReport.OrgID,
		proxyEndpointID: in.EndpointID,
		mcpServerID:     in.MCPServerID,
		messageInquiry:  in.Message,
		messageRequest:  in.Message,
		pipelineChecks:  checksJSON,
		violationIDs:    violationIDsJSON,
		status:          "error",
		latencyMs:       latencyMs,
		errorMessage:    errMsg,
	})
	routeLogID := ""
	requestID := ""
	if row != nil {
		routeLogID = stringField(row, "id")
		requestID = stringField(row, "request_id")
	}
	return &RouteRequestResult{
		RouteLogID:   routeLogID,
		RequestID:    requestID,
		Allowed:      false,
		Status:       "error",
		Checks:       testReport.Checks,
		LatencyMs:    latencyMs,
		ErrorMessage: errMsg,
	}, nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (e *Executor) list(ctx context.Context, name string, filters map[string]string) ([]map[string]any, error) {
	resource, ok := e.resources[name]
	if !ok {
		return nil, fmt.Errorf("routing: unknown resource %q", name)
	}
	return e.data.List(ctx, resource, filters, maxRows, 0)
}

func (e *Executor) get(ctx context.Context, name, id string) (map[string]any, error) {
	resource, ok := e.resources[name]
	if !ok {
		return nil, fmt.Errorf("routing: unknown resource %q", name)
	}
	return e.data.Get(ctx, resource, id)
}

// extraConfigModel extracts the model identifier from a provider_account row.
// It looks in extra_config.model_id, then falls back to name.
func extraConfigModel(account map[string]any) string {
	if ec, ok := account["extra_config"]; ok {
		switch v := ec.(type) {
		case map[string]any:
			if m, ok := v["model_id"].(string); ok && m != "" {
				return m
			}
		case string:
			var m map[string]any
			if json.Unmarshal([]byte(v), &m) == nil {
				if id, ok := m["model_id"].(string); ok && id != "" {
					return id
				}
			}
		}
	}
	return ""
}

func statusCodeFromStatus(status string) int {
	switch status {
	case "allowed":
		return http.StatusOK
	case "blocked":
		return http.StatusForbidden
	default:
		return http.StatusInternalServerError
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
