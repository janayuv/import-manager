-- ERP-style dashboard: metrics cache, KPI alerts, exception trends, activity audit, permissions, compliance materialization.

CREATE TABLE IF NOT EXISTS dashboard_metrics_cache (
    cache_key TEXT PRIMARY KEY NOT NULL,
    metrics_payload TEXT NOT NULL,
    snapshot_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_metrics_cache_expires
    ON dashboard_metrics_cache (expires_at);

CREATE TABLE IF NOT EXISTS kpi_alert_rules (
    id TEXT PRIMARY KEY NOT NULL,
    kpi_name TEXT NOT NULL,
    threshold_value REAL NOT NULL,
    comparison_operator TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_kpi_alert_rules_kpi ON kpi_alert_rules (kpi_name);

CREATE TABLE IF NOT EXISTS kpi_alert_log (
    alert_id TEXT PRIMARY KEY NOT NULL,
    kpi_name TEXT NOT NULL,
    current_value REAL NOT NULL,
    threshold_value REAL NOT NULL,
    severity TEXT NOT NULL,
    triggered_at TEXT NOT NULL,
    resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_kpi_alert_log_kpi ON kpi_alert_log (kpi_name);
CREATE INDEX IF NOT EXISTS idx_kpi_alert_log_resolved ON kpi_alert_log (resolved_at);

CREATE TABLE IF NOT EXISTS daily_exception_summary (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    overdue_count INTEGER NOT NULL DEFAULT 0,
    missing_boe_count INTEGER NOT NULL DEFAULT 0,
    missing_expense_count INTEGER NOT NULL DEFAULT 0,
    missing_document_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS role_dashboard_permissions (
    role TEXT NOT NULL,
    widget_key TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (role, widget_key)
);

CREATE TABLE IF NOT EXISTS dashboard_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    action_type TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_dashboard_activity_log_ts ON dashboard_activity_log (timestamp DESC);

CREATE TABLE IF NOT EXISTS shipment_compliance_score (
    shipment_id TEXT PRIMARY KEY NOT NULL,
    score REAL NOT NULL,
    required_slots INTEGER NOT NULL,
    satisfied_slots INTEGER NOT NULL,
    computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipment_compliance_score ON shipment_compliance_score (score);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('kpi_snapshot_retention_days', '365');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('kpi_retention_last_run', '');

-- Seed KPI alert rules (absolute thresholds; admin can edit)
INSERT OR IGNORE INTO kpi_alert_rules (id, kpi_name, threshold_value, comparison_operator, severity, enabled) VALUES
('rule-pending', 'pending_shipments', 10, 'GT', 'warning', 1),
('rule-overdue', 'overdue_eta', 5, 'GT', 'warning', 1);

-- Role → widget visibility (widget_key matches frontend sections)
INSERT OR IGNORE INTO role_dashboard_permissions (role, widget_key, visible) VALUES
('admin', 'kpis', 1), ('admin', 'charts', 1), ('admin', 'exceptions', 1), ('admin', 'finance', 1), ('admin', 'compliance', 1), ('admin', 'history', 1), ('admin', 'forecast', 1),
('operations', 'kpis', 1), ('operations', 'charts', 1), ('operations', 'exceptions', 1), ('operations', 'finance', 0), ('operations', 'compliance', 1), ('operations', 'history', 1), ('operations', 'forecast', 1),
('finance', 'kpis', 1), ('finance', 'charts', 1), ('finance', 'exceptions', 1), ('finance', 'finance', 1), ('finance', 'compliance', 1), ('finance', 'history', 1), ('finance', 'forecast', 1),
('viewer', 'kpis', 1), ('viewer', 'charts', 1), ('viewer', 'exceptions', 0), ('viewer', 'finance', 0), ('viewer', 'compliance', 1), ('viewer', 'history', 0), ('viewer', 'forecast', 0);
