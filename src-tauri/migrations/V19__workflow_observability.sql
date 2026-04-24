-- Observability: maintenance history, health scores, simulation reports, resolution efficiency.

CREATE TABLE IF NOT EXISTS workflow_maintenance_history (
    run_id TEXT PRIMARY KEY NOT NULL,
    job_name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    status TEXT NOT NULL,
    records_processed INTEGER NOT NULL DEFAULT 0,
    errors_detected INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workflow_maint_completed
    ON workflow_maintenance_history (completed_at DESC);

CREATE TABLE IF NOT EXISTS daily_workflow_health_score (
    snapshot_date TEXT NOT NULL PRIMARY KEY,
    health_score REAL NOT NULL,
    factors_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS workflow_simulation_reports (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    inserted INTEGER NOT NULL DEFAULT 0,
    cleaned INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    peak_load INTEGER NOT NULL DEFAULT 0,
    failure_rate REAL NOT NULL DEFAULT 0,
    recovery_success INTEGER NOT NULL DEFAULT 1,
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_sim_completed
    ON workflow_simulation_reports (completed_at DESC);

CREATE TABLE IF NOT EXISTS resolution_efficiency_metrics (
    snapshot_date TEXT NOT NULL,
    user_id TEXT NOT NULL,
    resolutions_count INTEGER NOT NULL DEFAULT 0,
    avg_resolution_hours REAL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    PRIMARY KEY (snapshot_date, user_id)
);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('last_workflow_maintenance_at', '');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('last_integrity_check_at', '');
