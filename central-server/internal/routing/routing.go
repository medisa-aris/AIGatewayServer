// Package routing implements a dry-run request validator for the AI Gateway.
//
// Given a user's API key, a message, and the MCP server / proxy endpoint a
// request targets, RouteRequestTest replays — without contacting any upstream
// provider — the authorization and guardrail decisions a real gateway request
// would face: identity resolution, endpoint access, MCP access, skill access,
// and the PII / budget / rate guardrails. It returns an ordered, self-describing
// report whose Checks slice is designed to render directly as a step-by-step
// trace in the web-console "Testing" modal.
//
// The package is read-only: it never mutates gateway data and performs no
// schema changes. Every lookup goes through the generic DataSource (satisfied
// by *store.Store) so no resource-specific SQL lives here.
package routing

import (
	"context"
	"errors"

	"central-server/internal/catalog"
)

// Check status values. They map 1:1 to the trace badge colours rendered by the
// web-console modal (pass=green, fail=red, warn=amber, skip=grey).
const (
	// StatusPass marks a check the request satisfies.
	StatusPass = "pass"
	// StatusFail marks a mandatory check the request violates; it flips Allowed to false.
	StatusFail = "fail"
	// StatusWarn marks a non-blocking finding (e.g. PII that will be masked).
	StatusWarn = "warn"
	// StatusSkip marks a check that did not apply (e.g. no endpoint supplied).
	StatusSkip = "skip"
)

// ErrInvalidAPIKey reports that the supplied API key did not resolve to an
// active, unexpired user. The pipeline cannot continue without an identity, so
// RouteRequestTest returns this error rather than a partial report.
var ErrInvalidAPIKey = errors.New("api key is invalid, inactive, or expired")

// RouteRequestTestInput carries the parameters of a single dry-run route test.
//
// MCPServerID and EndpointID are optional: when blank, their respective checks
// are recorded as StatusSkip rather than failing.
//
// Identity resolution: exactly one of APIKey or APIKeyID must be non-blank.
//   - APIKey — raw user API key; SHA-256 hashed before lookup, never stored.
//   - APIKeyID — api_keys.id UUID; used by the Testing modal which cannot
//     access the raw key (only the hash is stored).
type RouteRequestTestInput struct {
	APIKey      string // raw user API key (mutually exclusive with APIKeyID)
	APIKeyID    string // api_keys.id UUID — alternative to raw key for the Testing modal
	Message     string // user prompt; scanned for skill references and PII
	MCPServerID string // mcp_servers.id the request wants to use (optional)
	EndpointID  string // proxy_endpoints.id the request targets (optional)
}

// CheckResult is one stage of the validation pipeline.
//
// Step is a stable machine-readable identifier (e.g. "resolve_user"); Message
// is a human-readable summary for the trace; Details carries structured,
// step-specific context the UI can expand.
type CheckResult struct {
	Step    string         `json:"step"`
	Status  string         `json:"status"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

// RouteRequestTestReport is the full result of a dry-run route test.
//
// Allowed is true only when no mandatory check (user, endpoint, mcp, skill,
// budget) failed; StatusWarn findings (PII, rate) do not flip it.
type RouteRequestTestReport struct {
	Allowed  bool          `json:"allowed"`
	UserID   string        `json:"user_id,omitempty"`
	UserName string        `json:"user_name,omitempty"`
	OrgID    string        `json:"org_id,omitempty"`
	OrgName  string        `json:"org_name,omitempty"`
	Checks   []CheckResult `json:"checks"`
}

// DataSource is the read-only subset of *store.Store the router depends on.
//
// Defining it here (rather than importing the concrete store) keeps the routing
// package decoupled and trivially testable with an in-memory stub.
type DataSource interface {
	// List returns rows for a resource, applying equality filters (column → value).
	List(ctx context.Context, resource catalog.Resource, filters map[string]string, limit int, offset int) ([]map[string]any, error)
	// Get returns a single row by UUID primary key.
	Get(ctx context.Context, resource catalog.Resource, id string) (map[string]any, error)
}

// DataWriter extends DataSource with write operations needed for live execution.
type DataWriter interface {
	DataSource
	Create(ctx context.Context, resource catalog.Resource, payload map[string]any) (map[string]any, error)
	Update(ctx context.Context, resource catalog.Resource, id string, payload map[string]any) (map[string]any, error)
}

// RouteRequestInput carries the parameters of a live route execution.
//
// EndpointID is required; MCPServerID is optional.
// Identity resolution: exactly one of APIKey or APIKeyID must be non-blank
// (same semantics as RouteRequestTestInput).
type RouteRequestInput struct {
	APIKey      string // raw user API key; SHA-256 hashed before lookup, never stored
	APIKeyID    string // api_keys.id UUID — alternative to raw key for the Testing modal
	Message     string // original user message (stored as message_inquiry)
	EndpointID  string // proxy_endpoints.id — required for live execution
	MCPServerID string // mcp_servers.id — optional
}

// RouteRequestResult is returned by Executor.Execute after the full pipeline.
type RouteRequestResult struct {
	RouteLogID       string        `json:"route_log_id"`
	RequestID        string        `json:"request_id"`
	Allowed          bool          `json:"allowed"`
	Status           string        `json:"status"`
	Output           string        `json:"output,omitempty"`
	Checks           []CheckResult `json:"checks"`
	PromptTokens     int           `json:"prompt_tokens"`
	CompletionTokens int           `json:"completion_tokens"`
	Cost             float64       `json:"cost"`
	LatencyMs        int           `json:"latency_ms"`
	ErrorMessage     string        `json:"error_message,omitempty"`
}
