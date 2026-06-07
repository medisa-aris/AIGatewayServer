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

	"central-server/internal/catalog"
	"central-server/internal/store"
)

// GatewayStore defines the storage operations required by the HTTP API.
type GatewayStore interface {
	Health(ctx context.Context) error
	List(ctx context.Context, resource catalog.Resource, orgID string, limit int, offset int) ([]map[string]any, error)
	Get(ctx context.Context, resource catalog.Resource, id string) (map[string]any, error)
	Create(ctx context.Context, resource catalog.Resource, payload map[string]any) (map[string]any, error)
	Update(ctx context.Context, resource catalog.Resource, id string, payload map[string]any) (map[string]any, error)
	Delete(ctx context.Context, resource catalog.Resource, id string) error
}

// Server handles HTTP requests for the AI Gateway API.
type Server struct {
	logger    *slog.Logger
	store     GatewayStore
	resources map[string]catalog.Resource
}

// New creates a configured HTTP API server.
func New(logger *slog.Logger, store GatewayStore, resources map[string]catalog.Resource) *Server {
	return &Server{logger: logger, store: store, resources: resources}
}

// Handler returns the root HTTP handler with all routes mounted.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /api/v1/resources", s.resourceIndex)
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
		orgID := r.URL.Query().Get("org_id")

		items, err := s.store.List(ctx, resource, orgID, limit, offset)
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

// writeStoreError translates store errors into HTTP responses.
func (s *Server) writeStoreError(w http.ResponseWriter, resource catalog.Resource, err error) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		writeError(w, http.StatusNotFound, "resource item was not found")
	case errors.Is(err, store.ErrNoColumns):
		writeError(w, http.StatusBadRequest, "payload has no writable columns")
	default:
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
