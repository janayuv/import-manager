-- Incident lifecycle: alert → incident → assignment → resolution → audit.

CREATE TABLE IF NOT EXISTS workflow_incidents (
  incident_id TEXT PRIMARY KEY NOT NULL,
  alert_id TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_to TEXT NOT NULL DEFAULT 'unassigned',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_notes TEXT,
  escalation_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(alert_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_incidents_status
  ON workflow_incidents (status, datetime(updated_at) DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_incidents_severity
  ON workflow_incidents (severity, status);
CREATE INDEX IF NOT EXISTS idx_workflow_incidents_assigned
  ON workflow_incidents (assigned_to, status);

CREATE TABLE IF NOT EXISTS workflow_incident_notes (
  note_id TEXT PRIMARY KEY NOT NULL,
  incident_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_incident_notes_incident
  ON workflow_incident_notes (incident_id, datetime(created_at) ASC);

CREATE TABLE IF NOT EXISTS workflow_incident_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  incidents_opened INTEGER NOT NULL DEFAULT 0,
  incidents_resolved INTEGER NOT NULL DEFAULT 0,
  sum_resolution_minutes INTEGER NOT NULL DEFAULT 0,
  resolution_samples INTEGER NOT NULL DEFAULT 0,
  severity_fatal INTEGER NOT NULL DEFAULT 0,
  severity_critical INTEGER NOT NULL DEFAULT 0,
  severity_warning INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_incident_response_score (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  score REAL NOT NULL,
  avg_resolution_minutes REAL NOT NULL,
  backlog_open INTEGER NOT NULL,
  response_latency_minutes REAL NOT NULL,
  updated_at TEXT NOT NULL,
  factors_json TEXT NOT NULL DEFAULT '{}'
);

INSERT OR IGNORE INTO workflow_incident_response_score (id, score, avg_resolution_minutes, backlog_open, response_latency_minutes, updated_at, factors_json)
VALUES (1, 100.0, 0.0, 0, 0.0, strftime('%Y-%m-%d %H:%M:%S', 'now'), '{}');
