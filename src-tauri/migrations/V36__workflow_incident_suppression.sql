-- Intelligent incident suppression after bursts / manual ops (noise reduction).

CREATE TABLE IF NOT EXISTS workflow_incident_suppression (
  suppression_id TEXT PRIMARY KEY NOT NULL,
  correlation_id TEXT,
  incident_id TEXT,
  source_module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  suppression_start TEXT NOT NULL,
  suppression_end TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  suppressed_event_count INTEGER NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0.55,
  release_history_logged INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wf_suppression_lookup
  ON workflow_incident_suppression (source_module, event_type, datetime(suppression_end));

CREATE TABLE IF NOT EXISTS workflow_incident_suppression_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  alerts_suppressed INTEGER NOT NULL DEFAULT 0,
  suppression_windows INTEGER NOT NULL DEFAULT 0,
  noise_reduction_gain REAL NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0.55,
  updated_at TEXT NOT NULL
);
