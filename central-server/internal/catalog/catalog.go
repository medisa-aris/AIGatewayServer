package catalog

import "sort"

// Resource describes one API-exposed database table.
type Resource struct {
	Name    string   `json:"name"`
	Table   string   `json:"table"`
	Columns []string `json:"columns"`
}

// Resources returns the complete whitelist of API resources and database columns.
func Resources() map[string]Resource {
	return map[string]Resource{
		"api-keys":               resource("api-keys", "api_keys", "id", "user_id", "org_id", "key_hash", "name", "scope", "created_at", "expires_at", "last_used_at", "is_active", "permissions"),
		"budget-consumptions":    resource("budget-consumptions", "budget_consumptions", "id", "user_budget_id", "user_id", "request_id", "amount", "currency", "usage_type", "quantity", "consumed_at", "status"),
		"budgets":                resource("budgets", "budgets", "id", "org_id", "name", "total_amount", "remaining_amount", "currency", "period", "period_start", "period_end", "is_active", "is_shared"),
		"guardrail-profiles":          resource("guardrail-profiles", "guardrail_profiles", "id", "org_id", "name", "description", "is_default", "entity_type", "entity_id", "budget_id", "rate_limit_id", "content_policy", "pii_rules", "topic_filters", "rate_limits", "custom_rules", "is_active", "created_at"),
		"guardrail-profile-pii-objects": resource("guardrail-profile-pii-objects", "guardrail_profile_pii_objects", "id", "guardrail_profile_id", "pii_object_id", "created_at"),
		"guardrail-violations":        resource("guardrail-violations", "guardrail_violations", "id", "request_id", "guardrail_profile_id", "rule_type", "severity", "triggered_content_snippet", "action_taken", "triggered_at", "metadata"),
		"mcp-capabilities":       resource("mcp-capabilities", "mcp_capabilities", "id", "mcp_server_id", "capability_type", "config"),
		"mcp-servers":            resource("mcp-servers", "mcp_servers", "id", "org_id", "name", "slug", "transport", "endpoint_url", "auth_config", "status", "is_active", "created_at"),
		"mcp-tools":              resource("mcp-tools", "mcp_tools", "id", "mcp_server_id", "name", "description", "input_schema", "is_active"),
		"model-versions":         resource("model-versions", "model_versions", "id", "model_id", "version", "deployment_status", "config", "released_at"),
		"models":                 resource("models", "models", "id", "org_id", "provider_id", "model_id", "name", "modality", "capabilities", "max_tokens", "context_window", "deployment_name", "is_active", "created_at"),
		"organizations":          resource("organizations", "organizations", "id", "name", "slug", "tier", "created_at", "updated_at", "is_active", "settings", "billing_email"),
		"pricing-tiers":          resource("pricing-tiers", "pricing_tiers", "id", "model_id", "tier_name", "input_price", "output_price", "cached_price", "currency", "effective_from", "effective_to"),
		"prompt-deployments":     resource("prompt-deployments", "prompt_deployments", "id", "version_id", "deployed_by", "endpoint_alias", "runtime_config", "is_active", "deployed_at"),
		"prompt-registries":      resource("prompt-registries", "prompt_registries", "id", "org_id", "name", "slug", "description", "visibility", "category", "tags", "is_active", "created_at"),
		"prompt-versions":        resource("prompt-versions", "prompt_versions", "id", "registry_id", "author_id", "version_number", "prompt_template", "variables", "metadata", "status", "created_at"),
		"request-logs":           resource("request-logs", "request_logs", "id", "request_id", "user_id", "api_key_id", "model_id", "virtual_model_id", "prompt_registry_id", "mcp_server_id", "guardrail_profile_id", "matched_rule_id", "started_at", "completed_at", "method", "path", "status_code", "input_tokens", "output_tokens", "cached_tokens", "cost", "latency_ms", "request_headers", "response_headers", "error_message", "trace_id", "region"),
		"route-logs":             resource("route-logs", "route_logs", "id", "request_id", "user_id", "org_id", "api_key_id", "proxy_endpoint_id", "provider_account_id", "model_id", "mcp_server_id", "message_inquiry", "message_request", "message_output", "pipeline_checks", "guardrail_violation_ids", "status", "prompt_tokens", "completion_tokens", "cost", "latency_ms", "started_at", "completed_at", "error_message"),
		"role-budgets":           resource("role-budgets", "role_budgets", "id", "role_id", "budget_id", "max_budget_per_user", "max_budget_per_request", "spend_scope", "can_override"),
		"role-guardrails":        resource("role-guardrails", "role_guardrails", "id", "role_id", "guardrail_profile_id", "is_mandatory", "can_bypass", "bypass_approval"),
		"role-mcps":              resource("role-mcps", "role_mcps", "id", "role_id", "mcp_server_id", "access_level", "can_configure", "allowed_tools", "allowed_resources"),
		"role-models":            resource("role-models", "role_models", "id", "role_id", "model_id", "access_level", "can_fine_tune", "max_quota_per_request"),
		"role-permissions":       resource("role-permissions", "role_permissions", "id", "role_id", "resource", "action", "condition", "is_active"),
		"role-prompt-registries": resource("role-prompt-registries", "role_prompt_registries", "id", "role_id", "prompt_registry_id", "access_level", "can_fork", "can_deploy"),
		"role-virtual-models":    resource("role-virtual-models", "role_virtual_models", "id", "role_id", "virtual_model_id", "access_level", "can_modify_routing"),
		"roles":                  resource("roles", "roles", "id", "org_id", "name", "description", "scope", "is_system", "is_active", "created_at"),
		"sessions":               resource("sessions", "sessions", "id", "user_id", "token_hash", "ip_address", "user_agent", "started_at", "expires_at", "last_activity_at", "is_active"),
		"user-budgets":           resource("user-budgets", "user_budgets", "id", "user_id", "role_budget_id", "budget_id", "allocated_amount", "consumed_amount", "remaining_amount", "status", "allocated_at", "reset_at"),
		"user-roles":             resource("user-roles", "user_roles", "id", "user_id", "role_id", "granted_by", "granted_at", "expires_at", "context"),
		"users":                  resource("users", "users", "id", "org_id", "email", "name", "auth_provider", "external_id", "last_login_at", "is_active"),
		"virtual-model-rules":    resource("virtual-model-rules", "virtual_model_rules", "id", "virtual_model_id", "target_model_id", "priority", "rule_type", "condition", "parameters", "is_active", "created_at"),
		"virtual-models":         resource("virtual-models", "virtual_models", "id", "org_id", "name", "slug", "description", "default_model_id", "is_active", "created_at", "routing_config"),

		// Added by migration 003
		"proxy-settings":  resource("proxy-settings", "proxy_settings", "id", "org_id", "is_enabled", "bind_address", "created_at", "updated_at"),
		"proxy-endpoints": resource("proxy-endpoints", "proxy_endpoints", "id", "org_id", "provider_account_id", "dialect", "port", "session_ttl", "name", "is_active", "created_at", "updated_at", "target_type", "virtual_model_id"),

		// Added by migration 002
		"provider-accounts": resource("provider-accounts", "provider_accounts",
			"id", "org_id", "name", "slug", "provider_type", "api_key",
			"endpoint_url", "region", "extra_config", "is_active", "created_at", "updated_at"),

		// Added by migration 001
		"pii-objects":  resource("pii-objects", "pii_objects", "id", "org_id", "name", "description", "detection_method", "pattern", "masking_style", "replacement_text", "min_confidence", "is_active", "created_at"),
		"rate-limits":  resource("rate-limits", "rate_limits", "id", "org_id", "name", "scope", "scope_id", "limit_type", "limit_value", "window_seconds", "is_active", "priority", "created_at", "updated_at"),
		"role-skills":  resource("role-skills", "role_skills", "id", "role_id", "skill_id", "access_level", "can_invoke", "can_edit", "granted_at"),
		"skills":       resource("skills", "skills", "id", "org_id", "name", "slug", "description", "version", "frontmatter", "body", "status", "created_by", "created_at", "updated_at"),

		// Added by migration 013 — Proxy Services direct user/org assignments
		"user-proxy-endpoints": resource("user-proxy-endpoints", "user_proxy_endpoints", "id", "user_id", "proxy_endpoint_id", "created_at"),
		"user-mcp-servers":     resource("user-mcp-servers", "user_mcp_servers", "id", "user_id", "mcp_server_id", "created_at"),
		"user-skills":          resource("user-skills", "user_skills", "id", "user_id", "skill_id", "created_at"),
		"user-guardrails":      resource("user-guardrails", "user_guardrails", "id", "user_id", "guardrail_profile_id", "created_at"),
		"org-proxy-endpoints":  resource("org-proxy-endpoints", "org_proxy_endpoints", "id", "org_id", "proxy_endpoint_id", "created_at"),
		"org-mcp-servers":      resource("org-mcp-servers", "org_mcp_servers", "id", "org_id", "mcp_server_id", "created_at"),
		"org-skills":           resource("org-skills", "org_skills", "id", "org_id", "skill_id", "created_at"),
		"org-guardrails":       resource("org-guardrails", "org_guardrails", "id", "org_id", "guardrail_profile_id", "created_at"),
	}
}

// Names returns the sorted public resource names.
func Names(resources map[string]Resource) []string {
	names := make([]string, 0, len(resources))
	for name := range resources {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// resource creates one Resource value.
func resource(name string, table string, columns ...string) Resource {
	return Resource{Name: name, Table: table, Columns: columns}
}
