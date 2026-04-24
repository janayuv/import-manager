-- Incident correlation: stable key for grouping + daily correlation KPIs.

ALTER TABLE workflow_incidents ADD COLUMN correlation_key TEXT NOT NULL DEFAULT '';

UPDATE workflow_incidents
SET correlation_key = trim(source_module) || '|' || trim(trigger_event_type) || '|' ||
  CASE
    WHEN json_extract(error_context_json, '$.entityId') IS NOT NULL
      AND trim(json_extract(error_context_json, '$.entityId')) != ''
    THEN trim(json_extract(error_context_json, '$.entityId'))
    ELSE '__global__'
  END
WHERE correlation_key = '';

CREATE INDEX IF NOT EXISTS idx_workflow_incidents_correlation_key
  ON workflow_incidents (correlation_key, status);

CREATE TABLE workflow_incident_correlation_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  alerts_grouped INTEGER NOT NULL DEFAULT 0,
  incidents_created INTEGER NOT NULL DEFAULT 0,
  noise_reduction_ratio REAL NOT NULL DEFAULT 0,
  burst_signals_emitted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
