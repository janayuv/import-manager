-- Single-operator incident engine: replaces V31 team-oriented tables.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS workflow_incident_notes;
DROP TABLE IF EXISTS workflow_incident_history;
DROP TABLE IF EXISTS workflow_incidents;
DROP TABLE IF EXISTS workflow_incident_metrics;
DROP TABLE IF EXISTS workflow_incident_response_score;

PRAGMA foreign_keys = ON;

CREATE TABLE workflow_incidents (
  incident_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  error_context_json TEXT NOT NULL DEFAULT '{}',
  source_module TEXT NOT NULL,
  linked_alert_id TEXT NOT NULL,
  trigger_event_type TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  resolved_at TEXT,
  root_cause_summary TEXT
);

CREATE INDEX idx_workflow_incidents_status ON workflow_incidents (status);
CREATE INDEX idx_workflow_incidents_severity ON workflow_incidents (severity);
CREATE INDEX idx_workflow_incidents_created_at ON workflow_incidents (datetime(created_at) DESC);
CREATE INDEX idx_workflow_incidents_correlation ON workflow_incidents (correlation_id);

CREATE TABLE workflow_incident_history (
  history_id TEXT PRIMARY KEY NOT NULL,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_timestamp TEXT NOT NULL,
  notes TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (incident_id) REFERENCES workflow_incidents(incident_id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_incident_history_incident ON workflow_incident_history (incident_id, datetime(event_timestamp));

CREATE TABLE workflow_incident_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  incidents_created_today INTEGER NOT NULL DEFAULT 0,
  incidents_resolved_today INTEGER NOT NULL DEFAULT 0,
  avg_resolution_time REAL NOT NULL DEFAULT 0,
  critical_incident_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
