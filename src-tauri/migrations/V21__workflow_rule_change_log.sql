-- Audit trail for automation rule configuration changes.

CREATE TABLE IF NOT EXISTS workflow_rule_change_log (
    change_id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    changed_by TEXT NOT NULL DEFAULT '',
    change_type TEXT NOT NULL,
    previous_value TEXT NOT NULL DEFAULT '',
    new_value TEXT NOT NULL DEFAULT '',
    changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_rule_change_rule
    ON workflow_rule_change_log (rule_id, changed_at DESC);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_pause_duration_minutes', '60');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_last_cycle_at', '');
