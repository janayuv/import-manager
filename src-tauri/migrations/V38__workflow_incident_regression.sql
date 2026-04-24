-- Post-stabilization recurrence (regression) tracking and fragility scoring.

CREATE TABLE IF NOT EXISTS workflow_incident_regression (
  regression_id TEXT PRIMARY KEY NOT NULL,
  correlation_id TEXT,
  incident_id TEXT NOT NULL,
  source_module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  regression_detected_at TEXT NOT NULL,
  time_since_stabilization_minutes INTEGER NOT NULL,
  severity TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wf_regression_detected
  ON workflow_incident_regression (datetime(regression_detected_at) DESC);

CREATE INDEX IF NOT EXISTS idx_wf_regression_scope
  ON workflow_incident_regression (source_module, event_type);

CREATE TABLE IF NOT EXISTS workflow_incident_regression_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  regressions_detected INTEGER NOT NULL DEFAULT 0,
  avg_regression_time_minutes REAL NOT NULL DEFAULT 0,
  regression_frequency REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_regression_risk_score (
  id INTEGER PRIMARY KEY CHECK (id = 1) NOT NULL,
  regression_risk REAL NOT NULL DEFAULT 0,
  regressions_detected INTEGER NOT NULL DEFAULT 0,
  stabilizations_detected INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workflow_regression_risk_score (id, regression_risk, regressions_detected, stabilizations_detected, updated_at)
VALUES (1, 0, 0, 0, strftime('%Y-%m-%d %H:%M:%S', 'now'));
