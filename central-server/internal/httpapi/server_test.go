package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"central-server/internal/catalog"
)

// fakeStore records API calls and returns configurable test data.
type fakeStore struct {
	healthErr error
	listItems []map[string]any
	getItem   map[string]any
	createErr error
	updateErr error
	deleteErr error

	lastResource string
	lastOrgID    string
	lastLimit    int
	lastOffset   int
	lastID       string
	lastPayload  map[string]any
}

// Health returns the configured readiness error.
func (f *fakeStore) Health(ctx context.Context) error {
	return f.healthErr
}

// List records list inputs and returns configured rows.
func (f *fakeStore) List(ctx context.Context, resource catalog.Resource, orgID string, limit int, offset int) ([]map[string]any, error) {
	f.lastResource = resource.Name
	f.lastOrgID = orgID
	f.lastLimit = limit
	f.lastOffset = offset
	return f.listItems, nil
}

// Get records the requested id and returns configured row data.
func (f *fakeStore) Get(ctx context.Context, resource catalog.Resource, id string) (map[string]any, error) {
	f.lastResource = resource.Name
	f.lastID = id
	if f.getItem == nil {
		return nil, sql.ErrNoRows
	}
	return f.getItem, nil
}

// Create records the payload and returns it as row data.
func (f *fakeStore) Create(ctx context.Context, resource catalog.Resource, payload map[string]any) (map[string]any, error) {
	f.lastResource = resource.Name
	f.lastPayload = payload
	if f.createErr != nil {
		return nil, f.createErr
	}
	return payload, nil
}

// Update records the id and payload and returns the payload as row data.
func (f *fakeStore) Update(ctx context.Context, resource catalog.Resource, id string, payload map[string]any) (map[string]any, error) {
	f.lastResource = resource.Name
	f.lastID = id
	f.lastPayload = payload
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	return payload, nil
}

// Delete records the id and returns the configured delete error.
func (f *fakeStore) Delete(ctx context.Context, resource catalog.Resource, id string) error {
	f.lastResource = resource.Name
	f.lastID = id
	return f.deleteErr
}

// TestHealthReturnsOK verifies the liveness endpoint does not depend on storage.
func TestHealthReturnsOK(t *testing.T) {
	server := newTestServer(&fakeStore{})

	response := request(server, http.MethodGet, "/healthz", nil)

	assertStatus(t, response, http.StatusOK)
	assertJSONField(t, response, "status", "ok")
}

// TestReadyReturnsUnavailableWhenStoreFails verifies readiness reflects database health.
func TestReadyReturnsUnavailableWhenStoreFails(t *testing.T) {
	server := newTestServer(&fakeStore{healthErr: errors.New("database down")})

	response := request(server, http.MethodGet, "/readyz", nil)

	assertStatus(t, response, http.StatusServiceUnavailable)
	assertJSONField(t, response, "error", "database is not ready")
}

// TestResourceIndexReturnsResourceNames verifies the public resource catalog route.
func TestResourceIndexReturnsResourceNames(t *testing.T) {
	server := newTestServer(&fakeStore{})

	response := request(server, http.MethodGet, "/api/v1/resources", nil)

	assertStatus(t, response, http.StatusOK)
	body := decodeBody(t, response)
	resources, ok := body["resources"].([]any)
	if !ok || len(resources) == 0 {
		t.Fatalf("expected resources list, got %#v", body["resources"])
	}
}

// TestListResourcePassesQueryOptions verifies collection list routing and query parsing.
func TestListResourcePassesQueryOptions(t *testing.T) {
	store := &fakeStore{listItems: []map[string]any{{"id": "org-1", "name": "Acme"}}}
	server := newTestServer(store)

	response := request(server, http.MethodGet, "/api/v1/organizations?limit=2&offset=3&org_id=a111", nil)

	assertStatus(t, response, http.StatusOK)
	if store.lastResource != "organizations" || store.lastLimit != 2 || store.lastOffset != 3 || store.lastOrgID != "a111" {
		t.Fatalf("unexpected list call: resource=%s limit=%d offset=%d org=%s", store.lastResource, store.lastLimit, store.lastOffset, store.lastOrgID)
	}
}

// TestGetResourceReturnsItem verifies item lookup routing.
func TestGetResourceReturnsItem(t *testing.T) {
	store := &fakeStore{getItem: map[string]any{"id": "org-1", "name": "Acme"}}
	server := newTestServer(store)

	response := request(server, http.MethodGet, "/api/v1/organizations/org-1", nil)

	assertStatus(t, response, http.StatusOK)
	if store.lastID != "org-1" {
		t.Fatalf("expected id org-1, got %s", store.lastID)
	}
}

// TestCreateResourcePassesPayload verifies create routing and JSON decoding.
func TestCreateResourcePassesPayload(t *testing.T) {
	store := &fakeStore{}
	server := newTestServer(store)

	response := request(server, http.MethodPost, "/api/v1/organizations", map[string]any{"name": "Acme", "slug": "acme"})

	assertStatus(t, response, http.StatusCreated)
	if store.lastPayload["name"] != "Acme" || store.lastPayload["slug"] != "acme" {
		t.Fatalf("unexpected payload: %#v", store.lastPayload)
	}
}

// TestPatchResourcePassesPayload verifies patch routing and JSON decoding.
func TestPatchResourcePassesPayload(t *testing.T) {
	store := &fakeStore{}
	server := newTestServer(store)

	response := request(server, http.MethodPatch, "/api/v1/organizations/org-1", map[string]any{"tier": "enterprise"})

	assertStatus(t, response, http.StatusOK)
	if store.lastID != "org-1" || store.lastPayload["tier"] != "enterprise" {
		t.Fatalf("unexpected patch call: id=%s payload=%#v", store.lastID, store.lastPayload)
	}
}

// TestDeleteResourceReturnsNoContent verifies delete routing.
func TestDeleteResourceReturnsNoContent(t *testing.T) {
	store := &fakeStore{}
	server := newTestServer(store)

	response := request(server, http.MethodDelete, "/api/v1/organizations/org-1", nil)

	assertStatus(t, response, http.StatusNoContent)
	if store.lastID != "org-1" {
		t.Fatalf("expected delete id org-1, got %s", store.lastID)
	}
}

// TestAllResourcesSupportList verifies every catalog resource exposes collection GET.
func TestAllResourcesSupportList(t *testing.T) {
	for resourceName := range catalog.Resources() {
		t.Run(resourceName, func(t *testing.T) {
			store := &fakeStore{listItems: []map[string]any{{"id": "row-1"}}}
			server := newTestServer(store)

			response := request(server, http.MethodGet, "/api/v1/"+resourceName+"?limit=7&offset=11&org_id=org-1", nil)

			assertStatus(t, response, http.StatusOK)
			if store.lastResource != resourceName {
				t.Fatalf("expected resource %s, got %s", resourceName, store.lastResource)
			}
			if store.lastLimit != 7 || store.lastOffset != 11 || store.lastOrgID != "org-1" {
				t.Fatalf("unexpected list options: limit=%d offset=%d org=%s", store.lastLimit, store.lastOffset, store.lastOrgID)
			}
		})
	}
}

// TestAllResourcesSupportGet verifies every catalog resource exposes item GET.
func TestAllResourcesSupportGet(t *testing.T) {
	for resourceName := range catalog.Resources() {
		t.Run(resourceName, func(t *testing.T) {
			store := &fakeStore{getItem: map[string]any{"id": "row-1"}}
			server := newTestServer(store)

			response := request(server, http.MethodGet, "/api/v1/"+resourceName+"/row-1", nil)

			assertStatus(t, response, http.StatusOK)
			if store.lastResource != resourceName || store.lastID != "row-1" {
				t.Fatalf("unexpected get call: resource=%s id=%s", store.lastResource, store.lastID)
			}
		})
	}
}

// TestAllResourcesSupportCreate verifies every catalog resource exposes collection POST.
func TestAllResourcesSupportCreate(t *testing.T) {
	payload := map[string]any{"id": "row-1", "name": "Gateway Test"}
	for resourceName := range catalog.Resources() {
		t.Run(resourceName, func(t *testing.T) {
			store := &fakeStore{}
			server := newTestServer(store)

			response := request(server, http.MethodPost, "/api/v1/"+resourceName, payload)

			assertStatus(t, response, http.StatusCreated)
			if store.lastResource != resourceName {
				t.Fatalf("expected resource %s, got %s", resourceName, store.lastResource)
			}
			if !reflect.DeepEqual(store.lastPayload, payload) {
				t.Fatalf("unexpected create payload: %#v", store.lastPayload)
			}
		})
	}
}

// TestAllResourcesSupportPatch verifies every catalog resource exposes item PATCH.
func TestAllResourcesSupportPatch(t *testing.T) {
	payload := map[string]any{"is_active": false}
	for resourceName := range catalog.Resources() {
		t.Run(resourceName, func(t *testing.T) {
			store := &fakeStore{}
			server := newTestServer(store)

			response := request(server, http.MethodPatch, "/api/v1/"+resourceName+"/row-1", payload)

			assertStatus(t, response, http.StatusOK)
			if store.lastResource != resourceName || store.lastID != "row-1" {
				t.Fatalf("unexpected patch call: resource=%s id=%s", store.lastResource, store.lastID)
			}
			if !reflect.DeepEqual(store.lastPayload, payload) {
				t.Fatalf("unexpected patch payload: %#v", store.lastPayload)
			}
		})
	}
}

// TestAllResourcesSupportDelete verifies every catalog resource exposes item DELETE.
func TestAllResourcesSupportDelete(t *testing.T) {
	for resourceName := range catalog.Resources() {
		t.Run(resourceName, func(t *testing.T) {
			store := &fakeStore{}
			server := newTestServer(store)

			response := request(server, http.MethodDelete, "/api/v1/"+resourceName+"/row-1", nil)

			assertStatus(t, response, http.StatusNoContent)
			if store.lastResource != resourceName || store.lastID != "row-1" {
				t.Fatalf("unexpected delete call: resource=%s id=%s", store.lastResource, store.lastID)
			}
		})
	}
}

// TestUnknownResourceReturnsNotFound verifies unknown resources are rejected.
func TestUnknownResourceReturnsNotFound(t *testing.T) {
	server := newTestServer(&fakeStore{})

	response := request(server, http.MethodGet, "/api/v1/not-real", nil)

	assertStatus(t, response, http.StatusNotFound)
}

// TestInvalidJSONReturnsBadRequest verifies malformed write bodies fail early.
func TestInvalidJSONReturnsBadRequest(t *testing.T) {
	server := newTestServer(&fakeStore{})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/organizations", bytes.NewBufferString("{"))
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)

	assertStatus(t, recorder.Result(), http.StatusBadRequest)
}

// newTestServer creates an API server with a quiet logger and catalog resources.
func newTestServer(store GatewayStore) *Server {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New(logger, store, catalog.Resources())
}

// request executes an HTTP request against the test server.
func request(server *Server, method string, path string, body map[string]any) *http.Response {
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}

	req := httptest.NewRequest(method, path, reader)
	recorder := httptest.NewRecorder()
	server.Handler().ServeHTTP(recorder, req)
	return recorder.Result()
}

// assertStatus fails the test when the response status differs from expected.
func assertStatus(t *testing.T, response *http.Response, expected int) {
	t.Helper()
	if response.StatusCode != expected {
		t.Fatalf("expected status %d, got %d", expected, response.StatusCode)
	}
}

// assertJSONField verifies one top-level JSON response field.
func assertJSONField(t *testing.T, response *http.Response, field string, expected any) {
	t.Helper()
	body := decodeBody(t, response)
	if body[field] != expected {
		t.Fatalf("expected %s=%#v, got %#v", field, expected, body[field])
	}
}

// decodeBody decodes a JSON response body into a map.
func decodeBody(t *testing.T, response *http.Response) map[string]any {
	t.Helper()

	defer response.Body.Close()
	var body map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	return body
}
