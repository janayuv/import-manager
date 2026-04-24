-- Background job registry, execution history, alerts, performance, dependencies, reliability.

CREATE TABLE IF NOT EXISTS workflow_background_jobs (
    job_id TEXT PRIMARY KEY NOT NULL,
    job_name TEXT NOT NULL,
    job_type TEXT NOT NULL,
    schedule_type TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    expected_duration_ms INTEGER NOT NULL DEFAULT 120000,
    max_retries INTEGER NOT NULL DEFAULT 3,
    retry_delay_sec INTEGER NOT NULL DEFAULT 120,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT OR IGNORE INTO workflow_background_jobs (job_id, job_name, job_type, schedule_type, is_enabled, expected_duration_ms, max_retries, retry_delay_sec)
VALUES
    ('automation_cycle', 'Workflow automation cycle', 'AUTOMATION', 'DAILY', 1, 180000, 3, 120),
    ('deployment_safety_checks', 'Deployment safety checks', 'SAFETY', 'DAILY', 1, 60000, 2, 300),
    ('maintenance_cleanup', 'Retention and daily exception maintenance', 'MAINTENANCE', 'DAILY', 1, 300000, 2, 300),
    ('cost_metrics_aggregation', 'Daily automation economics index', 'METRICS', 'DAILY', 1, 90000, 3, 120),
    ('risk_evaluation', 'Deployment risk signals rollup', 'RISK', 'DAILY', 1, 60000, 2, 300),
    ('observability_update', 'Workflow observability completion', 'OBSERVABILITY', 'DAILY', 1, 120000, 2, 120);

CREATE TABLE IF NOT EXISTS workflow_job_execution_log (
    execution_id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    records_processed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    execution_time_ms INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_wf_job_exec_job_time
    ON workflow_job_execution_log (job_id, datetime(started_at) DESC);

CREATE TABLE IF NOT EXISTS workflow_job_failure_alerts (
    alert_id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    alert_type TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wf_job_failure_job_time
    ON workflow_job_failure_alerts (job_id, datetime(detected_at) DESC);

CREATE TABLE IF NOT EXISTS workflow_job_performance_metrics (
    id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    window_label TEXT NOT NULL,
    avg_execution_ms REAL,
    max_execution_ms REAL,
    records_processed_total INTEGER,
    failure_rate REAL,
    retry_rate REAL,
    samples INTEGER,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    UNIQUE (job_id, window_label)
);

CREATE TABLE IF NOT EXISTS workflow_job_dependencies (
    id TEXT PRIMARY KEY NOT NULL,
    parent_job_id TEXT NOT NULL,
    dependent_job_id TEXT NOT NULL,
    dependency_type TEXT NOT NULL,
    UNIQUE (parent_job_id, dependent_job_id)
);

INSERT OR IGNORE INTO workflow_job_dependencies (id, parent_job_id, dependent_job_id, dependency_type)
VALUES
    ('dep-1', 'maintenance_cleanup', 'observability_update', 'SEQUENTIAL'),
    ('dep-2', 'maintenance_cleanup', 'automation_cycle', 'SEQUENTIAL'),
    ('dep-3', 'automation_cycle', 'cost_metrics_aggregation', 'SEQUENTIAL');

CREATE TABLE IF NOT EXISTS workflow_job_alert_log (
    id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT,
    execution_id TEXT,
    alert_level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wf_job_alert_time ON workflow_job_alert_log (datetime(created_at) DESC);

CREATE TABLE IF NOT EXISTS workflow_job_reliability_score (
    job_id TEXT PRIMARY KEY NOT NULL,
    score REAL NOT NULL,
    success_rate REAL,
    failure_rate REAL,
    retry_frequency REAL,
    sample_executions INTEGER,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);
