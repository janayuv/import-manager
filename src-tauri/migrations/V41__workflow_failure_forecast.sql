-- Failure forecasting: trend + regression + persistence → probability, metrics, risk score.

CREATE TABLE IF NOT EXISTS workflow_failure_forecast (
    forecast_id TEXT PRIMARY KEY NOT NULL,
    source_module TEXT NOT NULL,
    event_type TEXT NOT NULL,
    forecast_time TEXT NOT NULL,
    predicted_failure_probability REAL NOT NULL,
    confidence_score REAL NOT NULL,
    forecast_horizon_minutes INTEGER NOT NULL DEFAULT 30,
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wf_failure_forecast_scope_time
    ON workflow_failure_forecast (source_module, event_type, datetime(forecast_time) DESC);

CREATE TABLE IF NOT EXISTS workflow_failure_forecast_metrics (
    metric_date TEXT PRIMARY KEY NOT NULL,
    forecasts_generated INTEGER NOT NULL DEFAULT 0,
    forecast_accuracy REAL NOT NULL DEFAULT 0,
    forecast_false_positive_rate REAL NOT NULL DEFAULT 0,
    prediction_accuracy_score REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_forecast_risk_score (
    id INTEGER PRIMARY KEY CHECK (id = 1) NOT NULL,
    forecast_risk_score REAL NOT NULL DEFAULT 0,
    high_risk_forecasts INTEGER NOT NULL DEFAULT 0,
    total_forecasts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workflow_forecast_risk_score (id, forecast_risk_score, high_risk_forecasts, total_forecasts, updated_at)
VALUES (1, 0, 0, 0, strftime('%Y-%m-%d %H:%M:%S', 'now'));
