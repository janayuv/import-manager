-- Preventive action recommendations, acknowledgments, effectiveness, and reliability scoring.

ALTER TABLE workflow_failure_forecast ADD COLUMN recommended_actions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE workflow_failure_forecast ADD COLUMN action_priority TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE workflow_failure_forecast ADD COLUMN action_effectiveness_score REAL;

CREATE TABLE IF NOT EXISTS workflow_forecast_action_log (
    log_id TEXT PRIMARY KEY NOT NULL,
    forecast_id TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    acknowledged_at TEXT NOT NULL,
    caller_role TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_wf_forecast_action_log_forecast
    ON workflow_forecast_action_log (forecast_id);

CREATE INDEX IF NOT EXISTS idx_wf_forecast_action_log_time
    ON workflow_forecast_action_log (datetime(acknowledged_at) DESC);

CREATE TABLE IF NOT EXISTS workflow_forecast_action_metrics (
    metric_date TEXT PRIMARY KEY NOT NULL,
    actions_generated INTEGER NOT NULL DEFAULT 0,
    actions_acknowledged INTEGER NOT NULL DEFAULT 0,
    actions_effective INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_preventive_reliability_score (
    id INTEGER PRIMARY KEY CHECK (id = 1) NOT NULL,
    preventive_reliability_score REAL NOT NULL DEFAULT 0,
    prevented_failures INTEGER NOT NULL DEFAULT 0,
    total_forecasts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workflow_preventive_reliability_score (id, preventive_reliability_score, prevented_failures, total_forecasts, updated_at)
VALUES (1, 0, 0, 0, strftime('%Y-%m-%d %H:%M:%S', 'now'));
