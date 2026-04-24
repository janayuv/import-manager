-- Missed schedule expectations, missed-run alerts, recovery audit, drift metrics, recovery scores.

CREATE TABLE IF NOT EXISTS workflow_job_schedule_expectations (
    job_id TEXT PRIMARY KEY NOT NULL,
    expected_interval_minutes INTEGER NOT NULL,
    grace_period_minutes INTEGER NOT NULL,
    last_expected_run_at TEXT,
    max_recovery_attempts INTEGER NOT NULL DEFAULT 5,
    recovery_delay_sec INTEGER NOT NULL DEFAULT 120,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT OR IGNORE INTO workflow_job_schedule_expectations (job_id, expected_interval_minutes, grace_period_minutes, last_expected_run_at, max_recovery_attempts, recovery_delay_sec)
VALUES
    ('automation_cycle', 1440, 120, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 5, 120),
    ('maintenance_cleanup', 1440, 120, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 5, 180),
    ('risk_evaluation', 1440, 120, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 5, 120),
    ('observability_update', 1440, 120, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 5, 120);

CREATE TABLE IF NOT EXISTS workflow_job_missed_alerts (
    alert_id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    expected_time TEXT NOT NULL,
    detected_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    recovery_triggered INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_wf_job_missed_job_status
    ON workflow_job_missed_alerts (job_id, status, datetime(detected_time) DESC);

CREATE TABLE IF NOT EXISTS workflow_job_recovery_log (
    recovery_id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    alert_id TEXT,
    recovery_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    result TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_wf_job_recovery_job_time
    ON workflow_job_recovery_log (job_id, datetime(recovery_time) DESC);

CREATE TABLE IF NOT EXISTS daily_missed_job_metrics (
    metric_date TEXT PRIMARY KEY NOT NULL,
    missed_runs INTEGER NOT NULL DEFAULT 0,
    recovery_success INTEGER NOT NULL DEFAULT 0,
    recovery_failures INTEGER NOT NULL DEFAULT 0,
    drift_warnings INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS workflow_job_recovery_score (
    job_id TEXT PRIMARY KEY NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    missed_jobs INTEGER NOT NULL DEFAULT 0,
    recovered_jobs INTEGER NOT NULL DEFAULT 0,
    window_days INTEGER NOT NULL DEFAULT 30,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);
