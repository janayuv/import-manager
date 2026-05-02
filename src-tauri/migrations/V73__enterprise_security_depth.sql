-- V73__enterprise_security_depth.sql — v0.3.2 enterprise security depth
-- Persistent lockout, policy versioning, password history depth setting,
-- user activity severity classification.

CREATE TABLE IF NOT EXISTS auth_lockout_state (
    user_id TEXT PRIMARY KEY NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_lockout_state_locked_until
    ON auth_lockout_state (locked_until);

CREATE TABLE IF NOT EXISTS security_policy_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    policy_json TEXT NOT NULL,
    password_rules_json TEXT,
    changed_by TEXT,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_security_policy_versions_changed_at
    ON security_policy_versions (changed_at DESC);

-- Classify security-relevant audit rows (INFO | WARNING | SECURITY | CRITICAL)
ALTER TABLE user_activity_audit_logs ADD COLUMN severity TEXT NOT NULL DEFAULT 'INFO';

INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
    ('auth.password_history_depth', '5', datetime('now')),
    ('security.policy_version', '0', datetime('now'));
