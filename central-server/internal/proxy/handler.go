package proxy

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"central-server/internal/routing"
)

// newEndpointHandler builds an http.Handler for one proxy endpoint.
// It registers a /health route plus the dialect-specific inference route.
func newEndpointHandler(dialect, endpointID string, executor *routing.Executor, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()

	h := &endpointHandler{
		dialect:    strings.ToLower(dialect),
		endpointID: endpointID,
		executor:   executor,
		log:        log,
	}

	mux.HandleFunc("GET /health", h.health)

	switch h.dialect {
	case "anthropic":
		mux.HandleFunc("POST /v1/messages", h.handleAnthropic)
	case "ollama":
		mux.HandleFunc("POST /api/chat", h.handleOllama)
	case "azure":
		// Go 1.22 ServeMux supports {wildcard} path segments.
		mux.HandleFunc("POST /openai/deployments/{deployment}/chat/completions", h.handleOpenAI)
	default: // "openai" and any unknown dialect
		mux.HandleFunc("POST /v1/chat/completions", h.handleOpenAI)
	}

	return mux
}

type endpointHandler struct {
	dialect    string
	endpointID string
	executor   *routing.Executor
	log        *slog.Logger
}

// ── Health ────────────────────────────────────────────────────────────────────

func (h *endpointHandler) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// ── Request body shapes ───────────────────────────────────────────────────────

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type anthropicRequest struct {
	Model     string        `json:"model"`
	MaxTokens int           `json:"max_tokens"`
	Messages  []chatMessage `json:"messages"`
}

type ollamaRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

// lastUserMessage returns the content of the last message with role "user",
// falling back to the last message of any role, or "" when messages is empty.
func lastUserMessage(messages []chatMessage) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if strings.EqualFold(messages[i].Role, "user") {
			return messages[i].Content
		}
	}
	if len(messages) > 0 {
		return messages[len(messages)-1].Content
	}
	return ""
}

// bearerToken extracts the token from an "Authorization: Bearer <token>" value.
func bearerToken(h string) string {
	const prefix = "Bearer "
	if strings.HasPrefix(h, prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}

// ── OpenAI handler (also used for Azure) ─────────────────────────────────────

func (h *endpointHandler) handleOpenAI(w http.ResponseWriter, r *http.Request) {
	var req openAIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "invalid_request_error", "request body must be valid JSON")
		return
	}

	apiKey := bearerToken(r.Header.Get("Authorization"))
	if apiKey == "" {
		writeOpenAIError(w, http.StatusUnauthorized, "invalid_api_key", "no API key provided — set Authorization: Bearer <key>")
		return
	}

	message := lastUserMessage(req.Messages)
	if message == "" {
		writeOpenAIError(w, http.StatusBadRequest, "invalid_request_error", "messages must contain at least one user message")
		return
	}

	result, err := h.executor.Execute(r.Context(), routing.RouteRequestInput{
		APIKey:     apiKey,
		Message:    message,
		EndpointID: h.endpointID,
	})
	if err != nil {
		if errors.Is(err, routing.ErrInvalidAPIKey) {
			writeOpenAIError(w, http.StatusUnauthorized, "invalid_api_key", "API key is invalid, inactive, or expired")
			return
		}
		h.log.Warn("proxy openai: execute error", slog.Any("error", err))
		writeOpenAIError(w, http.StatusInternalServerError, "server_error", "internal routing error")
		return
	}

	switch result.Status {
	case "blocked":
		writeOpenAIError(w, http.StatusForbidden, "access_denied", "request was blocked by gateway policy")
	case "error":
		msg := result.ErrorMessage
		if msg == "" {
			msg = "upstream provider error"
		}
		writeOpenAIError(w, http.StatusBadGateway, "upstream_error", msg)
	default:
		resp := map[string]any{
			"id":      "chatcmpl-" + result.RequestID,
			"object":  "chat.completion",
			"model":   req.Model,
			"choices": []map[string]any{
				{
					"index": 0,
					"message": map[string]any{
						"role":    "assistant",
						"content": result.Output,
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]any{
				"prompt_tokens":     result.PromptTokens,
				"completion_tokens": result.CompletionTokens,
				"total_tokens":      result.PromptTokens + result.CompletionTokens,
			},
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// ── Anthropic handler ─────────────────────────────────────────────────────────

func (h *endpointHandler) handleAnthropic(w http.ResponseWriter, r *http.Request) {
	var req anthropicRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAnthropicError(w, http.StatusBadRequest, "invalid_request_error", "request body must be valid JSON")
		return
	}

	// Anthropic uses x-api-key; also accept Authorization: Bearer for compatibility.
	apiKey := r.Header.Get("x-api-key")
	if apiKey == "" {
		apiKey = bearerToken(r.Header.Get("Authorization"))
	}
	if apiKey == "" {
		writeAnthropicError(w, http.StatusUnauthorized, "authentication_error", "no API key provided — set x-api-key header")
		return
	}

	message := lastUserMessage(req.Messages)
	if message == "" {
		writeAnthropicError(w, http.StatusBadRequest, "invalid_request_error", "messages must contain at least one user message")
		return
	}

	result, err := h.executor.Execute(r.Context(), routing.RouteRequestInput{
		APIKey:     apiKey,
		Message:    message,
		EndpointID: h.endpointID,
	})
	if err != nil {
		if errors.Is(err, routing.ErrInvalidAPIKey) {
			writeAnthropicError(w, http.StatusUnauthorized, "authentication_error", "API key is invalid, inactive, or expired")
			return
		}
		h.log.Warn("proxy anthropic: execute error", slog.Any("error", err))
		writeAnthropicError(w, http.StatusInternalServerError, "api_error", "internal routing error")
		return
	}

	switch result.Status {
	case "blocked":
		writeAnthropicError(w, http.StatusForbidden, "permission_error", "request was blocked by gateway policy")
	case "error":
		msg := result.ErrorMessage
		if msg == "" {
			msg = "upstream provider error"
		}
		writeAnthropicError(w, http.StatusBadGateway, "api_error", msg)
	default:
		resp := map[string]any{
			"id":    "msg_" + result.RequestID,
			"type":  "message",
			"role":  "assistant",
			"model": req.Model,
			"content": []map[string]any{
				{"type": "text", "text": result.Output},
			},
			"stop_reason": "end_turn",
			"usage": map[string]any{
				"input_tokens":  result.PromptTokens,
				"output_tokens": result.CompletionTokens,
			},
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// ── Ollama handler ────────────────────────────────────────────────────────────

func (h *endpointHandler) handleOllama(w http.ResponseWriter, r *http.Request) {
	var req ollamaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "request body must be valid JSON"})
		return
	}

	// Ollama clients are typically keyless; gateway auth still requires a key.
	apiKey := bearerToken(r.Header.Get("Authorization"))
	if apiKey == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "no API key provided — set Authorization: Bearer <key>"})
		return
	}

	message := lastUserMessage(req.Messages)
	if message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "messages must contain at least one user message"})
		return
	}

	result, err := h.executor.Execute(r.Context(), routing.RouteRequestInput{
		APIKey:     apiKey,
		Message:    message,
		EndpointID: h.endpointID,
	})
	if err != nil {
		if errors.Is(err, routing.ErrInvalidAPIKey) {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "API key is invalid, inactive, or expired"})
			return
		}
		h.log.Warn("proxy ollama: execute error", slog.Any("error", err))
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "internal routing error"})
		return
	}

	switch result.Status {
	case "blocked":
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "request was blocked by gateway policy"})
	case "error":
		msg := result.ErrorMessage
		if msg == "" {
			msg = "upstream provider error"
		}
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": msg})
	default:
		model := req.Model
		if model == "" {
			model = "gateway-routed"
		}
		resp := map[string]any{
			"model": model,
			"message": map[string]any{
				"role":    "assistant",
				"content": result.Output,
			},
			"done":              true,
			"prompt_eval_count": result.PromptTokens,
			"eval_count":        result.CompletionTokens,
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

// ── Response helpers ──────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeOpenAIError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"message": message,
			"type":    "error",
			"code":    code,
		},
	})
}

func writeAnthropicError(w http.ResponseWriter, status int, errType, message string) {
	writeJSON(w, status, map[string]any{
		"type":  "error",
		"error": map[string]any{"type": errType, "message": message},
	})
}
