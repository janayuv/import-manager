-- Workflow reliability: integrity log, SLA escalation, metrics, backlog, recurrence, activity checksums.

CREATE TABLE IF NOT EXISTS exception_integrity_log (
    id TEXT PRIMARY KEY NOT NULL,
    exception_id TEXT NOT NULL DEFAULT '',
    issue_type TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    details TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_exception_integrity_detected
    ON exception_integrity_log (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_exception_integrity_type
    ON exception_integrity_log (issue_type);

CREATE TABLE IF NOT EXISTS exception_sla_escalation_rules (
    exception_type TEXT NOT NULL,
    sla_hours INTEGER NOT NULL DEFAULT 0,
    escalation_level INTEGER NOT NULL DEFAULT 1,
    notify_role TEXT NOT NULL DEFAULT 'admin',
    PRIMARY KEY (exception_type, escalation_level)
);

INSERT OR IGNORE INTO exception_sla_escalation_rules (exception_type, sla_hours, escalation_level, notify_role) VALUES
    ('OVERDUE_ETA', 0, 1, 'admin'),
    ('MISSING_BOE', 0, 1, 'admin'),
    ('MISSING_EXPENSE', 0, 1, 'admin');

CREATE TABLE IF NOT EXISTS exception_escalation_log (
    id TEXT PRIMARY KEY NOT NULL,
    exception_case_id TEXT NOT NULL,
    exception_type TEXT NOT NULL,
    escalation_level INTEGER NOT NULL DEFAULT 1,
    notify_role TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    FOREIGN KEY (exception_case_id) REFERENCES exception_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exception_escalation_case
    ON exception_escalation_log (exception_case_id, created_at);

CREATE TABLE IF NOT EXISTS exception_sla_metrics (
    snapshot_date TEXT NOT NULL PRIMARY KEY,
    avg_resolution_hours REAL,
    sla_compliance_rate REAL NOT NULL DEFAULT 0,
    sla_breach_count INTEGER NOT NULL DEFAULT 0,
    resolution_backlog INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS exception_backlog_snapshot (
    snapshot_date TEXT NOT NULL PRIMARY KEY,
    open_count INTEGER NOT NULL DEFAULT 0,
    in_progress_count INTEGER NOT NULL DEFAULT 0,
    critical_count INTEGER NOT NULL DEFAULT 0,
    resolved_today INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS exception_recurrence_counts (
    exception_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    total_opens INTEGER NOT NULL DEFAULT 0,
    last_opened_at TEXT,
    PRIMARY KEY (exception_type, entity_id)
);

CREATE TABLE IF NOT EXISTS exception_resolution_analytics (
    snapshot_date TEXT NOT NULL PRIMARY KEY,
    avg_resolution_hours REAL,
    p90_resolution_hours REAL,
    resolved_count INTEGER NOT NULL DEFAULT 0,
    resolutions_by_user_json TEXT NOT NULL DEFAULT '{}',
    common_delay_hours REAL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

ALTER TABLE exception_cases ADD COLUMN escalated_at TEXT;
ALTER TABLE exception_cases ADD COLUMN escalation_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exception_cases ADD COLUMN workflow_timeout_flag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exception_cases ADD COLUMN recurrence_flag INTEGER NOT NULL DEFAULT 0;

ALTER TABLE dashboard_activity_log ADD COLUMN checksum TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_in_progress_timeout_days', '7');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('exception_escalation_cooldown_hours', '24');
