package routing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"time"

	"central-server/internal/catalog"
)

// maxRows bounds every internal list lookup. The catalog API caps lists at 500
// rows and a dry-run test never needs to page past that.
const maxRows = 500

// Service evaluates dry-run routing and guardrail checks against gateway data.
//
// It is read-only and safe for concurrent use: it holds no mutable state and
// every operation derives entirely from its arguments.
type Service struct {
	data      DataSource
	resources map[string]catalog.Resource
	log       *slog.Logger
}

// NewService constructs a Service with its dependencies injected.
//
// data — read-only gateway data access (typically *store.Store).
// resources — the catalog whitelist used to resolve table definitions.
// log — structured logger; if nil a no-op logger is substituted.
// Returns an error if data or resources is nil/empty.
func NewService(data DataSource, resources map[string]catalog.Resource, log *slog.Logger) (*Service, error) {
	if data == nil {
		return nil, errors.New("routing.NewService: data source is required")
	}
	if len(resources) == 0 {
		return nil, errors.New("routing.NewService: resources catalog is required")
	}
	if log == nil {
		log = slog.New(slog.NewTextHandler(noopWriter{}, nil))
	}
	return &Service{data: data, resources: resources, log: log}, nil
}

// RouteRequestTest runs the full validation pipeline and returns a complete
// report. It does not stop at the first failed check: each stage records its
// result and the pipeline continues, so the trace always shows every step.
//
// ctx — controls the deadline for all database lookups.
// in — the request under test; MCPServerID and EndpointID may be blank.
//
// It returns a non-nil error only when the pipeline cannot meaningfully
// proceed: ErrInvalidAPIKey when the key does not resolve, or a wrapped
// infrastructure error when a required lookup fails.
func (s *Service) RouteRequestTest(ctx context.Context, in RouteRequestTestInput) (*RouteRequestTestReport, error) {
	report := &RouteRequestTestReport{Allowed: true, Checks: []CheckResult{}}

	user, err := s.resolveUser(ctx, in, report)
	if err != nil {
		return nil, err
	}
	report.UserID = stringField(user, "id")
	report.UserName = stringField(user, "name")
	if report.UserName == "" {
		report.UserName = stringField(user, "email")
	}
	report.OrgID = stringField(user, "org_id")
	if report.OrgID != "" {
		if org, err := s.get(ctx, "organizations", report.OrgID); err == nil {
			report.OrgName = stringField(org, "name")
		}
	}

	roleIDs, err := s.loadRoleIDs(ctx, report.UserID)
	if err != nil {
		return nil, err
	}

	if err := s.checkEndpointAccess(ctx, in.EndpointID, report.UserID, report.OrgID, roleIDs, report); err != nil {
		return nil, err
	}
	if err := s.checkMCPAccess(ctx, in.MCPServerID, report.UserID, report.OrgID, roleIDs, report); err != nil {
		return nil, err
	}
	if err := s.checkSkillAccess(ctx, in.Message, report.UserID, report.OrgID, roleIDs, report); err != nil {
		return nil, err
	}
	if err := s.checkGuardrails(ctx, in.Message, report.UserID, report.OrgID, roleIDs, report); err != nil {
		return nil, err
	}

	return report, nil
}

// resolveUser resolves the api_keys row from the input and loads its owner.
//
// Two lookup paths are supported:
//   - APIKeyID non-blank: fetch the api_keys row directly by UUID primary key.
//     Used by the Testing modal which shows a dropdown of stored keys; the raw
//     key is never persisted so the hash lookup is not possible there.
//   - APIKey non-blank: SHA-256 hash the raw key and match against key_hash.
//     Used by programmatic callers who supply the actual secret.
//
// It appends the "resolve_user" check and returns the user row.
// A missing, inactive, or expired key yields ErrInvalidAPIKey.
func (s *Service) resolveUser(ctx context.Context, in RouteRequestTestInput, report *RouteRequestTestReport) (map[string]any, error) {
	var key map[string]any

	switch {
	case strings.TrimSpace(in.APIKeyID) != "":
		// Direct ID lookup — Testing modal passes the api_keys.id UUID.
		var err error
		key, err = s.get(ctx, "api-keys", strings.TrimSpace(in.APIKeyID))
		if err != nil {
			return nil, ErrInvalidAPIKey
		}

	case strings.TrimSpace(in.APIKey) != "":
		// Hash-based lookup — programmatic callers supply the raw key.
		hash := sha256Hex(strings.TrimSpace(in.APIKey))
		keys, err := s.list(ctx, "api-keys", map[string]string{"key_hash": hash})
		if err != nil {
			return nil, fmt.Errorf("routing.resolveUser: %w", err)
		}
		if len(keys) == 0 {
			return nil, ErrInvalidAPIKey
		}
		key = keys[0]

	default:
		return nil, ErrInvalidAPIKey
	}

	if active, ok := key["is_active"].(bool); ok && !active {
		return nil, ErrInvalidAPIKey
	}
	if expired(key["expires_at"]) {
		return nil, ErrInvalidAPIKey
	}

	userID := stringField(key, "user_id")
	user, err := s.get(ctx, "users", userID)
	if err != nil {
		return nil, fmt.Errorf("routing.resolveUser: load user: %w", err)
	}

	name := stringField(user, "name")
	if name == "" {
		name = stringField(user, "email")
	}
	s.append(report, CheckResult{
		Step:    "resolve_user",
		Status:  StatusPass,
		Message: fmt.Sprintf("API key resolved to user %q", name),
		Details: map[string]any{
			"user_id":    userID,
			"org_id":     stringField(user, "org_id"),
			"key_name":   stringField(key, "name"),
			"key_scope":  stringField(key, "scope"),
			"expires_at": key["expires_at"],
		},
	})
	return user, nil
}

// loadRoleIDs returns the active (unexpired) role ids granted to the user via
// user_roles. It is internal context for the access checks and is not itself
// recorded as a trace step.
func (s *Service) loadRoleIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.list(ctx, "user-roles", map[string]string{"user_id": userID})
	if err != nil {
		return nil, fmt.Errorf("routing.loadRoleIDs: %w", err)
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if expired(row["expires_at"]) {
			continue
		}
		if id := stringField(row, "role_id"); id != "" {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// checkEndpointAccess records whether the user may reach the proxy endpoint.
// Access is granted by a direct user grant, an org grant, or — when the
// endpoint targets a virtual model — a role grant on that virtual model.
func (s *Service) checkEndpointAccess(ctx context.Context, endpointID, userID, orgID string, roleIDs []string, report *RouteRequestTestReport) error {
	if strings.TrimSpace(endpointID) == "" {
		s.append(report, CheckResult{Step: "endpoint_access", Status: StatusSkip, Message: "No endpoint supplied"})
		return nil
	}

	endpoint, err := s.get(ctx, "proxy-endpoints", endpointID)
	if err != nil {
		s.append(report, CheckResult{
			Step:    "endpoint_access",
			Status:  StatusFail,
			Message: "Endpoint not found",
			Details: map[string]any{"endpoint_id": endpointID},
		})
		report.Allowed = false
		return nil
	}
	name := stringField(endpoint, "name")

	// Direct user grant.
	if rows, err := s.list(ctx, "user-proxy-endpoints", map[string]string{"user_id": userID, "proxy_endpoint_id": endpointID}); err != nil {
		return fmt.Errorf("routing.checkEndpointAccess: user grant: %w", err)
	} else if len(rows) > 0 {
		s.grantEndpoint(report, name, endpointID, "user")
		return nil
	}

	// Org grant.
	if rows, err := s.list(ctx, "org-proxy-endpoints", map[string]string{"org_id": orgID, "proxy_endpoint_id": endpointID}); err != nil {
		return fmt.Errorf("routing.checkEndpointAccess: org grant: %w", err)
	} else if len(rows) > 0 {
		s.grantEndpoint(report, name, endpointID, "org")
		return nil
	}

	// Role grant via the endpoint's virtual model.
	if vmID := stringField(endpoint, "virtual_model_id"); vmID != "" && len(roleIDs) > 0 {
		grants, err := s.list(ctx, "role-virtual-models", map[string]string{"virtual_model_id": vmID})
		if err != nil {
			return fmt.Errorf("routing.checkEndpointAccess: role grant: %w", err)
		}
		if matchAnyRole(grants, roleIDs) {
			s.grantEndpoint(report, name, endpointID, "role")
			return nil
		}
	}

	s.append(report, CheckResult{
		Step:    "endpoint_access",
		Status:  StatusFail,
		Message: fmt.Sprintf("User has no grant for endpoint %q", name),
		Details: map[string]any{"endpoint_id": endpointID, "checked": []string{"user", "org", "role"}},
	})
	report.Allowed = false
	return nil
}

// grantEndpoint appends a successful endpoint_access check.
func (s *Service) grantEndpoint(report *RouteRequestTestReport, name, endpointID, via string) {
	s.append(report, CheckResult{
		Step:    "endpoint_access",
		Status:  StatusPass,
		Message: fmt.Sprintf("Endpoint %q permitted via %s grant", name, via),
		Details: map[string]any{"endpoint_id": endpointID, "grant": via},
	})
}

// checkMCPAccess records whether the user may use the requested MCP server,
// checking direct user, org, and role grants in turn.
func (s *Service) checkMCPAccess(ctx context.Context, mcpID, userID, orgID string, roleIDs []string, report *RouteRequestTestReport) error {
	if strings.TrimSpace(mcpID) == "" {
		s.append(report, CheckResult{Step: "mcp_access", Status: StatusSkip, Message: "No MCP server supplied"})
		return nil
	}

	server, err := s.get(ctx, "mcp-servers", mcpID)
	if err != nil {
		s.append(report, CheckResult{
			Step:    "mcp_access",
			Status:  StatusFail,
			Message: "MCP server not found",
			Details: map[string]any{"mcp_server_id": mcpID},
		})
		report.Allowed = false
		return nil
	}
	name := stringField(server, "name")

	if rows, err := s.list(ctx, "user-mcp-servers", map[string]string{"user_id": userID, "mcp_server_id": mcpID}); err != nil {
		return fmt.Errorf("routing.checkMCPAccess: user grant: %w", err)
	} else if len(rows) > 0 {
		s.grantMCP(report, name, mcpID, "user", nil)
		return nil
	}

	if rows, err := s.list(ctx, "org-mcp-servers", map[string]string{"org_id": orgID, "mcp_server_id": mcpID}); err != nil {
		return fmt.Errorf("routing.checkMCPAccess: org grant: %w", err)
	} else if len(rows) > 0 {
		s.grantMCP(report, name, mcpID, "org", nil)
		return nil
	}

	if len(roleIDs) > 0 {
		grants, err := s.list(ctx, "role-mcps", map[string]string{"mcp_server_id": mcpID})
		if err != nil {
			return fmt.Errorf("routing.checkMCPAccess: role grant: %w", err)
		}
		if match := firstRoleMatch(grants, roleIDs); match != nil {
			s.grantMCP(report, name, mcpID, "role", map[string]any{
				"access_level":  match["access_level"],
				"allowed_tools": match["allowed_tools"],
			})
			return nil
		}
	}

	s.append(report, CheckResult{
		Step:    "mcp_access",
		Status:  StatusFail,
		Message: fmt.Sprintf("User has no grant for MCP server %q", name),
		Details: map[string]any{"mcp_server_id": mcpID, "checked": []string{"user", "org", "role"}},
	})
	report.Allowed = false
	return nil
}

// grantMCP appends a successful mcp_access check, merging any extra detail.
func (s *Service) grantMCP(report *RouteRequestTestReport, name, mcpID, via string, extra map[string]any) {
	details := map[string]any{"mcp_server_id": mcpID, "grant": via}
	for k, v := range extra {
		details[k] = v
	}
	s.append(report, CheckResult{
		Step:    "mcp_access",
		Status:  StatusPass,
		Message: fmt.Sprintf("MCP server %q permitted via %s grant", name, via),
		Details: details,
	})
}

// checkSkillAccess detects skills referenced in the message (by slug as
// "/slug" or by name/slug substring) and verifies the user may invoke each via
// a direct user, org, or role grant. With no skill referenced it passes.
func (s *Service) checkSkillAccess(ctx context.Context, message, userID, orgID string, roleIDs []string, report *RouteRequestTestReport) error {
	skills, err := s.list(ctx, "skills", map[string]string{"org_id": orgID})
	if err != nil {
		return fmt.Errorf("routing.checkSkillAccess: load skills: %w", err)
	}

	referenced := referencedSkills(message, skills)
	if len(referenced) == 0 {
		s.append(report, CheckResult{
			Step:    "skill_access",
			Status:  StatusPass,
			Message: "No skill referenced in message",
			Details: map[string]any{"referenced": []string{}},
		})
		return nil
	}

	names := make([]string, 0, len(referenced))
	denied := make([]string, 0)
	for _, skill := range referenced {
		skillID := stringField(skill, "id")
		slug := stringField(skill, "slug")
		names = append(names, slug)

		allowed, err := s.skillGranted(ctx, skillID, userID, orgID, roleIDs)
		if err != nil {
			return err
		}
		if !allowed {
			denied = append(denied, slug)
		}
	}

	if len(denied) > 0 {
		s.append(report, CheckResult{
			Step:    "skill_access",
			Status:  StatusFail,
			Message: fmt.Sprintf("User lacks access to skill(s): %s", strings.Join(denied, ", ")),
			Details: map[string]any{"referenced": names, "denied": denied},
		})
		report.Allowed = false
		return nil
	}

	s.append(report, CheckResult{
		Step:    "skill_access",
		Status:  StatusPass,
		Message: fmt.Sprintf("%d skill(s) referenced, all permitted", len(names)),
		Details: map[string]any{"referenced": names},
	})
	return nil
}

// skillGranted reports whether the user may invoke a skill via any grant tier.
// Direct user/org grants imply invocation; role grants must set can_invoke.
func (s *Service) skillGranted(ctx context.Context, skillID, userID, orgID string, roleIDs []string) (bool, error) {
	if rows, err := s.list(ctx, "user-skills", map[string]string{"user_id": userID, "skill_id": skillID}); err != nil {
		return false, fmt.Errorf("routing.skillGranted: user grant: %w", err)
	} else if len(rows) > 0 {
		return true, nil
	}
	if rows, err := s.list(ctx, "org-skills", map[string]string{"org_id": orgID, "skill_id": skillID}); err != nil {
		return false, fmt.Errorf("routing.skillGranted: org grant: %w", err)
	} else if len(rows) > 0 {
		return true, nil
	}
	if len(roleIDs) > 0 {
		grants, err := s.list(ctx, "role-skills", map[string]string{"skill_id": skillID})
		if err != nil {
			return false, fmt.Errorf("routing.skillGranted: role grant: %w", err)
		}
		if match := firstRoleMatch(grants, roleIDs); match != nil {
			if invoke, ok := match["can_invoke"].(bool); ok {
				return invoke, nil
			}
			return true, nil
		}
	}
	return false, nil
}

// checkGuardrails resolves the guardrail profiles that apply to the user and
// runs the PII, budget, and rate sub-checks. Each sub-check is its own trace
// step. PII and rate findings warn (do not block); budget exhaustion fails.
func (s *Service) checkGuardrails(ctx context.Context, message, userID, orgID string, roleIDs []string, report *RouteRequestTestReport) error {
	profiles, err := s.applicableProfiles(ctx, userID, orgID, roleIDs)
	if err != nil {
		return err
	}

	if err := s.checkPII(ctx, message, profiles, report); err != nil {
		return err
	}
	if err := s.checkBudget(ctx, userID, profiles, report); err != nil {
		return err
	}
	if err := s.checkRate(ctx, userID, orgID, roleIDs, report); err != nil {
		return err
	}
	return nil
}

// applicableProfiles returns the distinct guardrail profiles binding to the
// user: the org default, every role-bound profile, and every user-bound profile.
func (s *Service) applicableProfiles(ctx context.Context, userID, orgID string, roleIDs []string) ([]map[string]any, error) {
	seen := map[string]bool{}
	out := []map[string]any{}

	add := func(id string) error {
		if id == "" || seen[id] {
			return nil
		}
		profile, err := s.get(ctx, "guardrail-profiles", id)
		if err != nil {
			return nil // a dangling reference is non-fatal for a dry run
		}
		seen[id] = true
		out = append(out, profile)
		return nil
	}

	defaults, err := s.list(ctx, "guardrail-profiles", map[string]string{"org_id": orgID, "is_default": "true"})
	if err != nil {
		return nil, fmt.Errorf("routing.applicableProfiles: defaults: %w", err)
	}
	for _, p := range defaults {
		id := stringField(p, "id")
		if !seen[id] {
			seen[id] = true
			out = append(out, p)
		}
	}

	for _, roleID := range roleIDs {
		bindings, err := s.list(ctx, "role-guardrails", map[string]string{"role_id": roleID})
		if err != nil {
			return nil, fmt.Errorf("routing.applicableProfiles: role bindings: %w", err)
		}
		for _, b := range bindings {
			if err := add(stringField(b, "guardrail_profile_id")); err != nil {
				return nil, err
			}
		}
	}

	userBindings, err := s.list(ctx, "user-guardrails", map[string]string{"user_id": userID})
	if err != nil {
		return nil, fmt.Errorf("routing.applicableProfiles: user bindings: %w", err)
	}
	for _, b := range userBindings {
		if err := add(stringField(b, "guardrail_profile_id")); err != nil {
			return nil, err
		}
	}

	return out, nil
}

// checkPII runs every regex-based PII object linked to the applicable profiles
// against the message, reporting matches that would be masked. Non-regex
// detection methods (ner/llm) cannot run in a dry run and are reported as such.
func (s *Service) checkPII(ctx context.Context, message string, profiles []map[string]any, report *RouteRequestTestReport) error {
	type piiMatch struct {
		Name  string `json:"name"`
		Style string `json:"style"`
		Count int    `json:"count"`
	}
	matches := []piiMatch{}
	skipped := []string{}
	seen := map[string]bool{}

	for _, profile := range profiles {
		links, err := s.list(ctx, "guardrail-profile-pii-objects", map[string]string{"guardrail_profile_id": stringField(profile, "id")})
		if err != nil {
			return fmt.Errorf("routing.checkPII: links: %w", err)
		}
		for _, link := range links {
			objID := stringField(link, "pii_object_id")
			if objID == "" || seen[objID] {
				continue
			}
			seen[objID] = true

			obj, err := s.get(ctx, "pii-objects", objID)
			if err != nil {
				continue
			}
			if active, ok := obj["is_active"].(bool); ok && !active {
				continue
			}

			name := stringField(obj, "name")
			if stringField(obj, "detection_method") != "regex" {
				skipped = append(skipped, name)
				continue
			}
			pattern := stringField(obj, "pattern")
			re, err := regexp.Compile(pattern)
			if err != nil {
				s.log.Warn("skipping invalid PII regex", slog.String("pii_object", name), slog.Any("error", err))
				skipped = append(skipped, name)
				continue
			}
			if found := re.FindAllString(message, -1); len(found) > 0 {
				matches = append(matches, piiMatch{Name: name, Style: stringField(obj, "masking_style"), Count: len(found)})
			}
		}
	}

	details := map[string]any{"matches": matches}
	if len(skipped) > 0 {
		details["skipped"] = skipped
		details["skipped_reason"] = "non-regex detection (ner/llm) cannot be evaluated in a dry run"
	}

	if len(matches) > 0 {
		total := 0
		for _, m := range matches {
			total += m.Count
		}
		s.append(report, CheckResult{
			Step:    "guardrail_pii",
			Status:  StatusWarn,
			Message: fmt.Sprintf("%d PII match(es) will be masked", total),
			Details: details,
		})
		return nil
	}

	s.append(report, CheckResult{
		Step:    "guardrail_pii",
		Status:  StatusPass,
		Message: "No PII detected in message",
		Details: details,
	})
	return nil
}

// checkBudget reports whether any budget available to the user still has funds.
// It considers per-user allocations and any budget bound to an applicable
// profile. It fails only when every applicable budget is exhausted.
func (s *Service) checkBudget(ctx context.Context, userID string, profiles []map[string]any, report *RouteRequestTestReport) error {
	type budgetState struct {
		Name      string  `json:"name"`
		Remaining float64 `json:"remaining"`
		Currency  string  `json:"currency"`
		Source    string  `json:"source"`
	}
	states := []budgetState{}
	seen := map[string]bool{}

	addBudget := func(id, source string) error {
		if id == "" || seen[id] {
			return nil
		}
		seen[id] = true
		budget, err := s.get(ctx, "budgets", id)
		if err != nil {
			return nil
		}
		states = append(states, budgetState{
			Name:      stringField(budget, "name"),
			Remaining: toFloat(budget["remaining_amount"]),
			Currency:  stringField(budget, "currency"),
			Source:    source,
		})
		return nil
	}

	userBudgets, err := s.list(ctx, "user-budgets", map[string]string{"user_id": userID})
	if err != nil {
		return fmt.Errorf("routing.checkBudget: user budgets: %w", err)
	}
	for _, ub := range userBudgets {
		status := stringField(ub, "status")
		remaining := toFloat(ub["remaining_amount"])
		// The user_budgets.remaining_amount column defaults to 0 in the DB schema.
		// When a budget allocation is created via the UI without explicitly setting
		// remaining_amount, it starts at 0 even though the funds haven't been touched.
		// For 'active' allocations, fall back to allocated_amount so a freshly created
		// allocation isn't immediately treated as exhausted.
		if remaining == 0 && status == "active" {
			if alloc := toFloat(ub["allocated_amount"]); alloc > 0 {
				remaining = alloc
			}
		}
		if status == "frozen" || status == "exhausted" {
			states = append(states, budgetState{
				Name:      "allocation " + stringField(ub, "id"),
				Remaining: remaining,
				Currency:  stringField(ub, "currency"),
				Source:    "user:" + status,
			})
			continue
		}
		states = append(states, budgetState{
			Name:      "allocation " + stringField(ub, "id"),
			Remaining: remaining,
			Currency:  stringField(ub, "currency"),
			Source:    "user",
		})
	}

	for _, profile := range profiles {
		if err := addBudget(stringField(profile, "budget_id"), "profile"); err != nil {
			return err
		}
	}

	if len(states) == 0 {
		s.append(report, CheckResult{
			Step:    "guardrail_budget",
			Status:  StatusPass,
			Message: "No budget constraint applies",
			Details: map[string]any{"budgets": states},
		})
		return nil
	}

	hasFunds := false
	for _, st := range states {
		if st.Remaining > 0 {
			hasFunds = true
			break
		}
	}

	if !hasFunds {
		s.append(report, CheckResult{
			Step:    "guardrail_budget",
			Status:  StatusFail,
			Message: "All applicable budgets are exhausted",
			Details: map[string]any{"budgets": states},
		})
		report.Allowed = false
		return nil
	}

	s.append(report, CheckResult{
		Step:    "guardrail_budget",
		Status:  StatusPass,
		Message: "Budget available",
		Details: map[string]any{"budgets": states},
	})
	return nil
}

// checkRate reports the rate-limit rules that apply to the user by scope
// precedence (user → role → org → global). A dry run cannot count a live
// window, so it reports the configured policy and always passes.
func (s *Service) checkRate(ctx context.Context, userID, orgID string, roleIDs []string, report *RouteRequestTestReport) error {
	type rateRule struct {
		Type    string `json:"type"`
		Value   int    `json:"value"`
		Window  int    `json:"window_seconds"`
		Scope   string `json:"scope"`
		ScopeID string `json:"scope_id,omitempty"`
	}
	rules := []rateRule{}

	collect := func(scope, scopeID string) error {
		filters := map[string]string{"scope": scope, "is_active": "true"}
		if scopeID != "" {
			filters["scope_id"] = scopeID
		}
		rows, err := s.list(ctx, "rate-limits", filters)
		if err != nil {
			return fmt.Errorf("routing.checkRate: %s: %w", scope, err)
		}
		for _, row := range rows {
			rules = append(rules, rateRule{
				Type:    stringField(row, "limit_type"),
				Value:   toInt(row["limit_value"]),
				Window:  toInt(row["window_seconds"]),
				Scope:   scope,
				ScopeID: scopeID,
			})
		}
		return nil
	}

	if err := collect("user", userID); err != nil {
		return err
	}
	for _, roleID := range roleIDs {
		if err := collect("role", roleID); err != nil {
			return err
		}
	}
	if err := collect("org", orgID); err != nil {
		return err
	}
	if err := collect("global", ""); err != nil {
		return err
	}

	if len(rules) == 0 {
		s.append(report, CheckResult{
			Step:    "guardrail_rate",
			Status:  StatusPass,
			Message: "No rate limit configured",
			Details: map[string]any{"limits": rules},
		})
		return nil
	}

	s.append(report, CheckResult{
		Step:    "guardrail_rate",
		Status:  StatusPass,
		Message: fmt.Sprintf("%d rate limit rule(s) apply (configured policy; live usage not evaluated in dry run)", len(rules)),
		Details: map[string]any{"limits": rules},
	})
	return nil
}

// list resolves a catalog resource by name and runs an equality-filtered list.
func (s *Service) list(ctx context.Context, name string, filters map[string]string) ([]map[string]any, error) {
	resource, ok := s.resources[name]
	if !ok {
		return nil, fmt.Errorf("routing: unknown resource %q", name)
	}
	return s.data.List(ctx, resource, filters, maxRows, 0)
}

// get resolves a catalog resource by name and fetches one row by id.
func (s *Service) get(ctx context.Context, name, id string) (map[string]any, error) {
	resource, ok := s.resources[name]
	if !ok {
		return nil, fmt.Errorf("routing: unknown resource %q", name)
	}
	return s.data.Get(ctx, resource, id)
}

// append records a check on the report.
func (s *Service) append(report *RouteRequestTestReport, check CheckResult) {
	report.Checks = append(report.Checks, check)
}

// --- pure helpers -----------------------------------------------------------

// sha256Hex returns the lowercase hex SHA-256 digest of s, matching the scheme
// the web-console BFF uses to hash API keys before lookup.
func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// referencedSkills returns skills whose slug appears as "/slug" or whose slug
// or name occurs as a case-insensitive substring of the message.
func referencedSkills(message string, skills []map[string]any) []map[string]any {
	lower := strings.ToLower(message)
	out := []map[string]any{}
	for _, skill := range skills {
		slug := strings.ToLower(stringField(skill, "slug"))
		name := strings.ToLower(stringField(skill, "name"))
		if slug != "" && (strings.Contains(lower, "/"+slug) || strings.Contains(lower, slug)) {
			out = append(out, skill)
			continue
		}
		if name != "" && strings.Contains(lower, name) {
			out = append(out, skill)
		}
	}
	return out
}

// matchAnyRole reports whether any grant row's role_id is in roleIDs.
func matchAnyRole(grants []map[string]any, roleIDs []string) bool {
	return firstRoleMatch(grants, roleIDs) != nil
}

// firstRoleMatch returns the first grant row whose role_id is in roleIDs.
func firstRoleMatch(grants []map[string]any, roleIDs []string) map[string]any {
	set := map[string]bool{}
	for _, id := range roleIDs {
		set[id] = true
	}
	for _, grant := range grants {
		if set[stringField(grant, "role_id")] {
			return grant
		}
	}
	return nil
}

// expired reports whether a timestamp value is in the past. A nil/blank value
// (no expiry) is never expired.
func expired(value any) bool {
	str := stringField(map[string]any{"v": value}, "v")
	if str == "" {
		return false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05.999999Z07:00"} {
		if t, err := time.Parse(layout, str); err == nil {
			return t.Before(time.Now())
		}
	}
	return false
}

// stringField returns row[key] as a string, coercing common scalar types.
func stringField(row map[string]any, key string) string {
	switch v := row[key].(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", v)
	}
}

// toFloat coerces a value to float64, tolerating the string form PostgreSQL
// uses for NUMERIC columns.
func toFloat(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		f, _ := strconv.ParseFloat(v, 64)
		return f
	default:
		return 0
	}
}

// toInt coerces a value to int, tolerating float and string forms.
func toInt(value any) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		n, _ := strconv.Atoi(v)
		return n
	default:
		return 0
	}
}

// noopWriter discards log output for a nil-logger fallback.
type noopWriter struct{}

// Write satisfies io.Writer by discarding all bytes.
func (noopWriter) Write(p []byte) (int, error) { return len(p), nil }
