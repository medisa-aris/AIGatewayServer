package routing

import (
	"context"
	"errors"
	"testing"

	"central-server/internal/catalog"
)

// stubSource is an in-memory DataSource. tables maps a resource name to its
// rows; List applies equality filters in Go and Get matches on the id column.
type stubSource struct {
	tables map[string][]map[string]any
}

// List returns rows of the resource whose columns equal every filter value.
func (s *stubSource) List(ctx context.Context, resource catalog.Resource, filters map[string]string, limit, offset int) ([]map[string]any, error) {
	out := []map[string]any{}
	for _, row := range s.tables[resource.Name] {
		match := true
		for col, want := range filters {
			if got := asString(row[col]); got != want {
				match = false
				break
			}
		}
		if match {
			out = append(out, row)
		}
	}
	return out, nil
}

// Get returns the first row of the resource whose id equals the argument.
func (s *stubSource) Get(ctx context.Context, resource catalog.Resource, id string) (map[string]any, error) {
	for _, row := range s.tables[resource.Name] {
		if asString(row["id"]) == id {
			return row, nil
		}
	}
	return nil, errors.New("not found")
}

// asString coerces stub cell values to their string form for filter matching.
func asString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return ""
	}
}

// validKey is the raw API key whose hash seeds the stub api_keys table.
const validKey = "sk-test-123"

// newStub builds a Service over a stub data source preloaded with one active
// user, key, endpoint (org-granted), MCP server (role-granted), skill, and a
// regex PII object (SSN) linked to the org default guardrail profile.
func newStub() (*Service, *stubSource) {
	src := &stubSource{tables: map[string][]map[string]any{
		"api-keys": {{"id": "k1", "user_id": "u1", "org_id": "o1", "key_hash": sha256Hex(validKey), "is_active": true}},
		"users":    {{"id": "u1", "org_id": "o1", "name": "Dewi"}},
		"user-roles": {{"id": "ur1", "user_id": "u1", "role_id": "r1"}},

		"proxy-endpoints":     {{"id": "e1", "name": "Ollama", "virtual_model_id": ""}},
		"org-proxy-endpoints": {{"id": "ope1", "org_id": "o1", "proxy_endpoint_id": "e1"}},

		"mcp-servers": {{"id": "m1", "name": "github-tools"}},
		"role-mcps":   {{"id": "rm1", "role_id": "r1", "mcp_server_id": "m1", "access_level": "execute"}},

		"skills":      {{"id": "s1", "org_id": "o1", "slug": "pdf-extractor", "name": "PDF Extractor"}},
		"role-skills": {{"id": "rs1", "role_id": "r1", "skill_id": "s1", "can_invoke": true}},

		"guardrail-profiles":            {{"id": "g1", "org_id": "o1", "is_default": true, "budget_id": "b1"}},
		"guardrail-profile-pii-objects": {{"id": "gp1", "guardrail_profile_id": "g1", "pii_object_id": "p1"}},
		"pii-objects":                   {{"id": "p1", "name": "SSN", "detection_method": "regex", "pattern": `\b\d{3}-\d{2}-\d{4}\b`, "masking_style": "redact", "is_active": true}},

		"budgets":     {{"id": "b1", "name": "Pool", "remaining_amount": "142.50", "currency": "USD"}},
		"rate-limits": {{"id": "rl1", "scope": "user", "scope_id": "u1", "limit_type": "rpm", "limit_value": "60", "window_seconds": "60", "is_active": true}},
	}}
	svc, _ := NewService(src, catalog.Resources(), nil)
	return svc, src
}

// stepStatus returns the status recorded for a step, or "" when absent.
func stepStatus(report *RouteRequestTestReport, step string) string {
	for _, c := range report.Checks {
		if c.Step == step {
			return c.Status
		}
	}
	return ""
}

// TestRouteRequestTestHappyPath verifies a fully permitted request with a PII warning.
func TestRouteRequestTestHappyPath(t *testing.T) {
	svc, _ := newStub()

	report, err := svc.RouteRequestTest(context.Background(), RouteRequestTestInput{
		APIKey:      validKey,
		Message:     "summarize this, my ssn is 123-45-6789 using /pdf-extractor",
		MCPServerID: "m1",
		EndpointID:  "e1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	cases := map[string]string{
		"resolve_user":     StatusPass,
		"endpoint_access":  StatusPass,
		"mcp_access":       StatusPass,
		"skill_access":     StatusPass,
		"guardrail_pii":    StatusWarn, // SSN matched → masked, non-blocking
		"guardrail_budget": StatusPass,
		"guardrail_rate":   StatusPass,
	}
	for step, want := range cases {
		if got := stepStatus(report, step); got != want {
			t.Errorf("step %s: want %s, got %s", step, want, got)
		}
	}
	if !report.Allowed {
		t.Errorf("expected Allowed=true (PII warn must not block), got false")
	}
}

// TestRouteRequestTestInvalidKey verifies an unknown key yields ErrInvalidAPIKey.
func TestRouteRequestTestInvalidKey(t *testing.T) {
	svc, _ := newStub()

	_, err := svc.RouteRequestTest(context.Background(), RouteRequestTestInput{APIKey: "wrong"})
	if !errors.Is(err, ErrInvalidAPIKey) {
		t.Fatalf("expected ErrInvalidAPIKey, got %v", err)
	}
}

// TestRouteRequestTestDeniedMCP verifies a missing MCP grant fails and blocks.
func TestRouteRequestTestDeniedMCP(t *testing.T) {
	svc, src := newStub()
	src.tables["role-mcps"] = nil // revoke the role grant

	report, err := svc.RouteRequestTest(context.Background(), RouteRequestTestInput{
		APIKey: validKey, MCPServerID: "m1", EndpointID: "e1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := stepStatus(report, "mcp_access"); got != StatusFail {
		t.Errorf("mcp_access: want fail, got %s", got)
	}
	if report.Allowed {
		t.Errorf("expected Allowed=false when MCP denied")
	}
}

// TestRouteRequestTestExhaustedBudget verifies a zero-balance budget fails.
func TestRouteRequestTestExhaustedBudget(t *testing.T) {
	svc, src := newStub()
	src.tables["budgets"] = []map[string]any{{"id": "b1", "name": "Pool", "remaining_amount": "0", "currency": "USD"}}

	report, err := svc.RouteRequestTest(context.Background(), RouteRequestTestInput{
		APIKey: validKey, EndpointID: "e1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := stepStatus(report, "guardrail_budget"); got != StatusFail {
		t.Errorf("guardrail_budget: want fail, got %s", got)
	}
	if report.Allowed {
		t.Errorf("expected Allowed=false when budget exhausted")
	}
}

// TestRouteRequestTestSkipsOptional verifies blank endpoint/MCP yield skips.
func TestRouteRequestTestSkipsOptional(t *testing.T) {
	svc, _ := newStub()

	report, err := svc.RouteRequestTest(context.Background(), RouteRequestTestInput{APIKey: validKey, Message: "hello"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := stepStatus(report, "endpoint_access"); got != StatusSkip {
		t.Errorf("endpoint_access: want skip, got %s", got)
	}
	if got := stepStatus(report, "mcp_access"); got != StatusSkip {
		t.Errorf("mcp_access: want skip, got %s", got)
	}
	if !report.Allowed {
		t.Errorf("expected Allowed=true for skipped optionals")
	}
}
