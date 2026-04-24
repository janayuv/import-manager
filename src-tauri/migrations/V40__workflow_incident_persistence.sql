-- Persistent failure pressure: elevated rate after stabilization without sustained recovery.

CREATE TABLE IF NOT EXISTS workflow_incident_persistence (
  persistence_id TEXT PRIMARY KEY NOT NULL,
  correlation_id TEXT,
  incident_id TEXT NOT NULL,
  source_module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  persistence_detected_at TEXT NOT NULL,
  failure_rate REAL NOT NULL,
  expected_rate REAL NOT NULL,
  severity TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wf_persistence_detected
  ON workflow_incident_persistence (datetime(persistence_detected_at) DESC);

CREATE INDEX IF NOT EXISTS idx_wf_persistence_scope
  ON workflow_incident_persistence (source_module, event_type);

CREATE TABLE IF NOT EXISTS workflow_persistent_failure_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  persistent_failures_detected INTEGER NOT NULL DEFAULT 0,
  avg_persistence_duration REAL NOT NULL DEFAULT 0,
  persistence_frequency REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_persistence_risk_score (
  id INTEGER PRIMARY KEY CHECK (id = 1) NOT NULL,
  persistence_risk REAL NOT NULL DEFAULT 0,
  persistent_failures_detected INTEGER NOT NULL DEFAULT 0,
  total_incidents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workflow_persistence_risk_score (id, persistence_risk, persistent_failures_detected, total_incidents, updated_at)
VALUES (1, 0, 0, 0, strftime('%Y-%m-%d %H:%M:%S', 'now'));
