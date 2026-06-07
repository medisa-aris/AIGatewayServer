package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"central-server/internal/catalog"
	"central-server/internal/routing"
	"central-server/internal/store"
	"github.com/jackc/pgx/v5/pgconn"
)

// RouteTester runs dry-run routing and guardrail validation for a request.
type RouteTester interface {
	RouteRequestTest(ctx context.Context, in routing.RouteRequestTestInput) (*routing.RouteRequestTestReport, error)
}

// RouteExecutor runs live routing pipeline executions.
type RouteExecutor interface {
	Execute(ctx context.Context, in routing.RouteRequestInput) (*routing.RouteRequestResult, error)
}

// Reloader signals the proxy manager to immediately reconcile its listeners.
// It may be nil; the proxy-reload endpoint returns 503 when it is.
type Reloader interface {
	Reload()
}

// GatewayStore defines the storage operations required by the HTTP API.
type GatewayStore interface {
	Health(ctx context.Context) error
	Schema(ctx context.Context) (columns []map[string]any, foreignKeys []map[string]any, err error)
	List(ctx context.Context, resource catalog.Resource, filters map[string]string, limit int, offset int) ([]map[string]any, error)
	Get(ctx context.Context, resource catalog.Resource, id string) (map[string]any, error)
	Create(ctx context.Context, resource catalog.Resource, payload map[string]any) (map[string]any, error)
	Update(ctx context.Context, resource catalog.Resource, id string, payload map[string]any) (map[string]any, error)
	Delete(ctx context.Context, resource catalog.Resource, id string) error
	// SearchUsers returns users whose name or email contains q (ILIKE), scoped to orgID.
	SearchUsers(ctx context.Context, orgID, q string, limit int) ([]map[string]any, error)
}

// Server handles HTTP requests for the AI Gateway API.
type Server struct {
	logger    *slog.Logger
	logLevel  *slog.LevelVar
	store     GatewayStore
	router    RouteTester
	executor  RouteExecutor
	reloader  Reloader
	resources map[string]catalog.Resource
}

// New creates a configured HTTP API server.
//
// router and executor may be nil; their respective endpoints will return 503
// rather than panicking. reloader may be nil; the proxy-reload endpoint
// returns 503 when it is. logLevel may be nil; the log-level endpoints will
// return 503 when it is.
func New(logger *slog.Logger, logLevel *slog.LevelVar, store GatewayStore, router RouteTester, executor RouteExecutor, reloader Reloader, resources map[string]catalog.Resource) *Server {
	return &Server{logger: logger, logLevel: logLevel, store: store, router: router, executor: executor, reloader: reloader, resources: resources}
}

// Handler returns the root HTTP handler with all routes mounted.
// The dedicated /api/v1/users/search route is registered before the generic
// /api/v1/ prefix so Go's ServeMux selects the more-specific pattern.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /api/v1/resources", s.resourceIndex)
	mux.HandleFunc("GET /api/schema", s.schema)
	mux.HandleFunc("GET /api/v1/users/search", s.userSearch)
	mux.HandleFunc("POST /api/v1/route-test", s.routeTest)
	mux.HandleFunc("POST /api/v1/route-request", s.routeRequest)
	mux.HandleFunc("POST /api/v1/proxy-reload", s.proxyReload)
	mux.HandleFunc("GET /api/v1/log-level", s.getLogLevel)
	mux.HandleFunc("PUT /api/v1/log-level", s.setLogLevel)
	mux.HandleFunc("/api/v1/", s.resource)
	return s.recover(s.cors(mux))
}

// health returns process liveness.
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

// ready returns database readiness.
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), defaultTimeout)
	defer cancel()

	if err := s.store.Health(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database is not ready")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ready"})
}

// resourceIndex returns the list of available API resources.
func (s *Server) resourceIndex(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"resources": catalog.Names(s.resources)})
}

// schema returns all public table columns and FK relationships from
// information_schema, enabling the web-console ERD page to render a live
// entity-relationship diagram without a direct database connection.
func (s *Server) schema(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), defaultTimeout)
	defer cancel()

	cols, fks, err := s.store.Schema(ctx)
	if err != nil {
		s.logger.Error("schema query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "schema query failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"columns":      cols,
		"foreign_keys": fks,
	})
}

// resource dispatches collection and item CRUD operations.
func (s *Server) resource(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "resource is required")
		return
	}

	resource, ok := s.resources[parts[0]]
	if !ok {
		writeError(w, http.StatusNotFound, "resource is not available")
		return
	}

	switch {
	case len(parts) == 1:
		s.collection(w, r, resource)
	case len(parts) == 2:
		s.item(w, r, resource, parts[1])
	default:
		writeError(w, http.StatusNotFound, "route is not available")
	}
}

// collection handles list and create operations.
func (s *Server) collection(w http.ResponseWriter, r *http.Request, resource catalog.Resource) {
	ctx, cancel := context.WithTimeout(r.Context(), defaultTimeout)
	defer cancel()

	switch r.Method {
	case http.MethodGet:
		limit := boundedInt(r.URL.Query().Get("limit"), 100, 1, 500)
		offset := boundedInt(r.URL.Query().Get("offset"), 0, 0, 100000)

		filters := map[string]string{}
		for _, col := range resource.Columns {
			if val := r.URL.Query().Get(col); val != "" {
				filters[col] = val
			}
		}

		items, err := s.store.List(ctx, resource, filters, limit, offset)
		if err != nil {
			s.logger.Error("failed to list resource", "resource", resource.Name, "error", err)
			writeError(w, http.StatusInternalServerError, "failed to list resource")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": items, "limit": limit, "offset": offset})
	case http.MethodPost:
		payload, err := readPayload(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		item, err := s.store.Create(ctx, resource, payload)
		if err != nil {
			s.writeStoreError(w, resource, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"data": item})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method is not allowed")
	}
}

// item handles get, patch, and delete operations.
func (s *Server) item(w http.ResponseWriter, r *http.Request, resource catalog.Resource, id string) {
	ctx, cancel := context.WithTimeout(r.Context(), defaultTimeout)
	defer cancel()

	switch r.Method {
	case http.MethodGet:
		item, err := s.store.Get(ctx, resource, id)
		if err != nil {
			s.writeStoreError(w, resource, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": item})
	case http.MethodPatch:
		payload, err := readPayload(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		item, err := s.store.Update(ctx, resource, id, payload)
		if err != nil {
			s.writeStoreError(w, resource, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"data": item})
	case http.MethodDelete:
		if err := s.store.Delete(ctx, resource, id); err != nil {
			s.writeStoreError(w, resource, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method is not allowed")
	}
}

// userSearch handles GET /api/v1/users/search?q=<text>&org_id=<uuid>[&limit=N].
// It performs a case-insensitive substring match on users.name and users.email
// scoped to the given organisation. Returns an empty array when q is blank.
//
// Query params:
//
//	q      — search text (required when non-empty results are wanted)
//	org_id — organisation UUID (required)
//	limit  — max rows to return, 1–100, default 20
func (s *Server) userSearch(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), defaultTimeout)
	defer cancel()

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	orgID := strings.TrimSpace(r.URL.Query().Get("org_id"))
	limit := boundedInt(r.URL.Query().Get("limit"), 20, 1, 100)

	if orgID == "" {
		writeError(w, http.StatusBadRequest, "org_id is required")
		return
	}
	if q == "" {
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}

	users, err := s.store.SearchUsers(ctx, orgID, q, limit)
	if err != nil {
		s.logger.Error("user search failed", slog.String("org_id", orgID), slog.Any("error", err))
		writeError(w, http.StatusInternalServerError, "user search failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": users})
}

// routeTest handles POST /api/v1/route-test. It runs a dry-run validation of a
// gateway request — identity, endpoint, MCP, skill, and PII/budget/rate
// guardrails — and returns an ordered trace report. No upstream provider is
// contacted and no gateway data is mutated.
//
// Request body:
//
//	{
//	  "api_key":       "<raw key>",   // mutually exclusive with api_key_id
//	  "api_key_id":    "<uuid>",      // api_keys.id — used by the Testing modal
//	  "message":       "...",
//	  "mcp_server_id": "<uuid>",      // optional
//	  "endpoint_id":   "<uuid>"       // optional
//	}
//
// Exactly one of api_key or api_key_id is required.
// mcp_server_id and endpoint_id are optional.
func (s *Server) routeTest(w http.ResponseWriter, r *http.Request) {
	if s.router == nil {
		writeError(w, http.StatusServiceUnavailable, "route testing is not available")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), defaultTimeout)
	defer cancel()

	var body struct {
		APIKey      string `json:"api_key"`
		APIKeyID    string `json:"api_key_id"`
		Message     string `json:"message"`
		MCPServerID string `json:"mcp_server_id"`
		EndpointID  string `json:"endpoint_id"`
	}
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be a JSON object")
		return
	}
	if strings.TrimSpace(body.APIKey) == "" && strings.TrimSpace(body.APIKeyID) == "" {
		writeError(w, http.StatusBadRequest, "api_key or api_key_id is required")
		return
	}

	report, err := s.router.RouteRequestTest(ctx, routing.RouteRequestTestInput{
		APIKey:      body.APIKey,
		APIKeyID:    body.APIKeyID,
		Message:     body.Message,
		MCPServerID: body.MCPServerID,
		EndpointID:  body.EndpointID,
	})
	if err != nil {
		if errors.Is(err, routing.ErrInvalidAPIKey) {
			writeError(w, http.StatusUnauthorized, "api key is invalid, inactive, or expired")
			return
		}
		s.logger.Error("route test failed", slog.Any("error", err))
		writeError(w, http.StatusInternalServerError, "route test failed")
		return
	}

	writeJSON(w, http.StatusOK, report)
}

// routeRequest handles POST /api/v1/route-request. It runs the full live
// routing pipeline: validates access and guardrails, augments the message with
// skill bodies and optional MCP context, calls the upstream LLM provider, and
// persists route_logs, request_logs, and budget_consumptions records.
//
// Request body:
//
//	{
//	  "api_key":       "<raw key>",  // mutually exclusive with api_key_id
//	  "api_key_id":    "<uuid>",     // api_keys.id — used by the Testing modal
//	  "message":       "...",
//	  "endpoint_id":   "<uuid>",     // required
//	  "mcp_server_id": "<uuid>"      // optional
//	}
//
// Exactly one of api_key or api_key_id is required. endpoint_id is required.
func (s *Server) routeRequest(w http.ResponseWriter, r *http.Request) {
	if s.executor == nil {
		writeError(w, http.StatusServiceUnavailable, "route execution is not available")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()

	var body struct {
		APIKey      string `json:"api_key"`
		APIKeyID    string `json:"api_key_id"`
		Message     string `json:"message"`
		EndpointID  string `json:"endpoint_id"`
		MCPServerID string `json:"mcp_server_id"`
	}
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be a JSON object")
		return
	}
	if strings.TrimSpace(body.APIKey) == "" && strings.TrimSpace(body.APIKeyID) == "" {
		writeError(w, http.StatusBadRequest, "api_key or api_key_id is required")
		return
	}
	if strings.TrimSpace(body.EndpointID) == "" {
		writeError(w, http.StatusBadRequest, "endpoint_id is required")
		return
	}

	result, err := s.executor.Execute(ctx, routing.RouteRequestInput{
		APIKey:      body.APIKey,
		APIKeyID:    body.APIKeyID,
		Message:     body.Message,
		EndpointID:  body.EndpointID,
		MCPServerID: body.MCPServerID,
	})
	if err != nil {
		if errors.Is(err, routing.ErrInvalidAPIKey) {
			writeError(w, http.StatusUnauthorized, "api key is invalid, inactive, or expired")
			return
		}
		s.logger.Error("route request failed", slog.Any("error", err))
		writeError(w, http.StatusInternalServerError, "route request failed")
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// proxyReload handles POST /api/v1/proxy-reload. It signals the proxy manager
// to immediately reconcile its listeners without waiting for the next poll tick.
// This is called by the web-console after the Enable AI Proxy toggle changes,
// so the effect is instant rather than waiting up to 3 seconds.
func (s *Server) proxyReload(w http.ResponseWriter, r *http.Request) {
	if s.reloader == nil {
		writeError(w, http.StatusServiceUnavailable, "proxy manager is not available")
		return
	}
	s.reloader.Reload()
	writeJSON(w, http.StatusOK, map[string]any{"status": "reload queued"})
}

// getLogLevel handles GET /api/v1/log-level.
// Returns the current log level as a JSON object: {"level":"INFO"}.
func (s *Server) getLogLevel(w http.ResponseWriter, r *http.Request) {
	if s.logLevel == nil {
		writeError(w, http.StatusServiceUnavailable, "log level control is not available")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"level": s.logLevel.Level().String()})
}

// setLogLevel handles PUT /api/v1/log-level.
// Accepts {"level":"DEBUG|INFO|WARN|ERROR"} and updates the running logger level.
func (s *Server) setLogLevel(w http.ResponseWriter, r *http.Request) {
	if s.logLevel == nil {
		writeError(w, http.StatusServiceUnavailable, "log level control is not available")
		return
	}

	var body struct {
		Level string `json:"level"`
	}
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "request body must be a JSON object")
		return
	}

	var level slog.Level
	if err := level.UnmarshalText([]byte(strings.ToUpper(strings.TrimSpace(body.Level)))); err != nil {
		writeError(w, http.StatusBadRequest, "level must be one of DEBUG, INFO, WARN, ERROR")
		return
	}

	s.logLevel.Set(level)
	s.logger.Info("log level changed", "level", level.String())
	writeJSON(w, http.StatusOK, map[string]any{"level": level.String()})
}

// writeStoreError translates store errors into HTTP responses.
func (s *Server) writeStoreError(w http.ResponseWriter, resource catalog.Resource, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "resource item was not found")
	case errors.Is(err, store.ErrNoColumns):
		writeError(w, http.StatusBadRequest, "payload has no writable columns")
	default:
		// Inspect PostgreSQL-specific error codes before falling back to 500.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23505": // unique_violation
				writeError(w, http.StatusConflict, "record already exists")
				return
			case "23514": // check_violation
				writeError(w, http.StatusBadRequest, "value is not allowed by column constraint: "+pgErr.ConstraintName)
				return
			case "23503": // foreign_key_violation
				writeError(w, http.StatusBadRequest, "referenced record does not exist")
				return
			case "23502": // not_null_violation
				writeError(w, http.StatusBadRequest, "required field is missing: "+pgErr.ColumnName)
				return
			}
		}
		s.logger.Error("store operation failed", "resource", resource.Name, "error", err)
		writeError(w, http.StatusInternalServerError, "store operation failed")
	}
}

// cors applies permissive CORS headers for local gateway clients.
func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// recover logs panics and returns a stable error response.
func (s *Server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if value := recover(); value != nil {
				s.logger.Error("request panic recovered", "panic", value)
				writeError(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// readPayload decodes a JSON object request body.
func readPayload(r *http.Request) (map[string]any, error) {
	defer r.Body.Close()

	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return nil, errors.New("request body must be a JSON object")
	}
	if payload == nil {
		return nil, errors.New("request body must be a JSON object")
	}
	return payload, nil
}

// boundedInt parses an integer query value and clamps it to a range.
func boundedInt(raw string, fallback int, minimum int, maximum int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}
