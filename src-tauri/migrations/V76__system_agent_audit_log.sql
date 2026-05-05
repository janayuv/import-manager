-- System agent audit log and default settings.

CREATE TABLE IF NOT EXISTS system_agent_audit_log (
    audit_id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    session_id TEXT NOT NULL DEFAULT '',
    caller_user_id TEXT NOT NULL DEFAULT '',
    caller_role TEXT NOT NULL DEFAULT '',
    intent_route TEXT NOT NULL DEFAULT '',
    matched_rule_id TEXT NOT NULL DEFAULT '',
    llm_used INTEGER NOT NULL DEFAULT 0,
    policy_decision_json TEXT NOT NULL DEFAULT '{}',
    limiter_bucket TEXT NOT NULL DEFAULT '',
    was_blocked INTEGER NOT NULL DEFAULT 0,
    grounding_ok INTEGER,
    tools_attempted_json TEXT NOT NULL DEFAULT '[]',
    tools_executed_json TEXT NOT NULL DEFAULT '[]',
    confidence REAL,
    trace_checksum TEXT NOT NULL DEFAULT '',
    snapshot_checksum TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_system_agent_audit_created_at
    ON system_agent_audit_log (datetime(created_at) DESC);

CREATE INDEX IF NOT EXISTS idx_system_agent_audit_route
    ON system_agent_audit_log (intent_route, datetime(created_at) DESC);

INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('system_agent_enabled', '0', datetime('now'));
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('system_agent_deepseek_model', 'deepseek-chat', datetime('now'));
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('system_agent_deepseek_base_url', 'https://api.deepseek.com/chat/completions', datetime('now'));
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('system_agent_confidence_threshold_mutate', '0.75', datetime('now'));
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('system_agent_max_llm_calls_per_day', '250', datetime('now'));
INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('system_agent_max_llm_calls_per_session', '30', datetime('now'));

PRAGMA user_version = 76;
