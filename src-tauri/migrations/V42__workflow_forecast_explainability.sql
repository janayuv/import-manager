-- Forecast explainability: triggers, summaries, explanation metrics, operator feedback.

ALTER TABLE workflow_failure_forecast ADD COLUMN primary_trigger TEXT NOT NULL DEFAULT '';
ALTER TABLE workflow_failure_forecast ADD COLUMN secondary_triggers_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE workflow_failure_forecast ADD COLUMN trend_summary TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS workflow_forecast_explanation_metrics (
    metric_date TEXT PRIMARY KEY NOT NULL,
    explanations_generated INTEGER NOT NULL DEFAULT 0,
    accurate_explanations INTEGER NOT NULL DEFAULT 0,
    misleading_explanations INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_forecast_explanation_score (
    id INTEGER PRIMARY KEY CHECK (id = 1) NOT NULL,
    explanation_accuracy_score REAL NOT NULL DEFAULT 0,
    accurate_explanations INTEGER NOT NULL DEFAULT 0,
    total_explanations INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workflow_forecast_explanation_score (id, explanation_accuracy_score, accurate_explanations, total_explanations, updated_at)
VALUES (1, 0, 0, 0, strftime('%Y-%m-%d %H:%M:%S', 'now'));

CREATE TABLE IF NOT EXISTS workflow_forecast_feedback (
    feedback_id TEXT PRIMARY KEY NOT NULL,
    forecast_id TEXT NOT NULL,
    feedback_kind TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    caller_role TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_wf_forecast_feedback_forecast
    ON workflow_forecast_feedback (forecast_id);

CREATE INDEX IF NOT EXISTS idx_wf_forecast_feedback_created
    ON workflow_forecast_feedback (datetime(created_at) DESC);
