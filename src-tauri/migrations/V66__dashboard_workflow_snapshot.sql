CREATE TABLE IF NOT EXISTS dashboard_workflow_snapshot (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    open_workflow_count INTEGER NOT NULL DEFAULT 0,
    active_workflow_count INTEGER NOT NULL DEFAULT 0,
    sla_breach_count INTEGER NOT NULL DEFAULT 0,
    recent_incident_count INTEGER NOT NULL DEFAULT 0,
    resolved_today_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS dashboard_workflow_sample_cache (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    workflow_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);
