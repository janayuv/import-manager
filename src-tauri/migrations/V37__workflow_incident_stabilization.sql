-- Stabilization phases: quiet → stabilizing → confirmed (recovery trust signals).

CREATE TABLE IF NOT EXISTS workflow_incident_stabilization (
  stabilization_id TEXT PRIMARY KEY NOT NULL,
  correlation_id TEXT,
  incident_id TEXT,
  source_module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stabilization_start TEXT NOT NULL,
  stabilization_confirmed TEXT,
  stability_duration_minutes INTEGER NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wf_stabilization_scope
  ON workflow_incident_stabilization (source_module, event_type, datetime(stabilization_start) DESC);

CREATE TABLE IF NOT EXISTS workflow_incident_stabilization_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  stabilizations_detected INTEGER NOT NULL DEFAULT 0,
  avg_stabilization_time REAL NOT NULL DEFAULT 0,
  false_recovery_rate REAL NOT NULL DEFAULT 0,
  stability_confidence_avg REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_system_stability_score (
  id INTEGER PRIMARY KEY CHECK (id = 1) NOT NULL,
  stability_score REAL NOT NULL DEFAULT 0,
  successful_stabilizations INTEGER NOT NULL DEFAULT 0,
  total_incidents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workflow_system_stability_score (id, stability_score, successful_stabilizations, total_incidents, updated_at)
VALUES (1, 0, 0, 0, strftime('%Y-%m-%d %H:%M:%S', 'now'));
