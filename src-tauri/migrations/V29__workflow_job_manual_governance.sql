-- Manual operator governance: recovery guard overrides and audit trail.

CREATE TABLE IF NOT EXISTS workflow_job_manual_override_log (
    id TEXT PRIMARY KEY NOT NULL,
    job_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    caller_role TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_wf_job_manual_override_job_time
    ON workflow_job_manual_override_log (job_id, datetime(created_at) DESC);
