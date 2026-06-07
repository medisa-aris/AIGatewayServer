-- Migration 014: route_logs table
--
-- Records every live RouteRequest execution: the full pipeline trace,
-- the original and augmented messages, the provider response, and all
-- billing/telemetry counters. Each row links back to request_logs via
-- the shared request_id UUID.

CREATE TABLE route_logs (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id              UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    user_id                 UUID        REFERENCES users(id)             ON DELETE SET NULL,
    org_id                  UUID,
    api_key_id              UUID        REFERENCES api_keys(id)          ON DELETE SET NULL,
    proxy_endpoint_id       UUID        REFERENCES proxy_endpoints(id)   ON DELETE SET NULL,
    provider_account_id     UUID        REFERENCES provider_accounts(id) ON DELETE SET NULL,
    model_id                TEXT,
    mcp_server_id           UUID,
    message_inquiry         TEXT        NOT NULL,
    message_request         TEXT        NOT NULL,
    message_output          TEXT,
    pipeline_checks         JSONB       NOT NULL DEFAULT '[]',
    guardrail_violation_ids JSONB       NOT NULL DEFAULT '[]',
    status                  TEXT        NOT NULL CHECK (status IN ('allowed', 'blocked', 'error')),
    prompt_tokens           INTEGER     NOT NULL DEFAULT 0,
    completion_tokens       INTEGER     NOT NULL DEFAULT 0,
    cost                    NUMERIC(12,8) NOT NULL DEFAULT 0,
    latency_ms              INTEGER     NOT NULL DEFAULT 0,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    error_message           TEXT
);

CREATE INDEX idx_route_logs_user_id    ON route_logs(user_id);
CREATE INDEX idx_route_logs_started_at ON route_logs(started_at DESC);
CREATE INDEX idx_route_logs_status     ON route_logs(status);

COMMENT ON TABLE route_logs IS 'Full audit trail for live RouteRequest executions.';
COMMENT ON COLUMN route_logs.message_inquiry  IS 'Original user message before skill/MCP augmentation.';
COMMENT ON COLUMN route_logs.message_request  IS 'Augmented message actually sent to the upstream provider.';
COMMENT ON COLUMN route_logs.message_output   IS 'Raw text output returned by the upstream provider.';
COMMENT ON COLUMN route_logs.pipeline_checks  IS 'Ordered CheckResult array from the guardrail/access pipeline.';
