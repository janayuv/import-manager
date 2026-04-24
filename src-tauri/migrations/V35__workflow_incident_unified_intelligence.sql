-- Unified incident intelligence: amplification counters, burst analytics, noise score.

ALTER TABLE workflow_incidents ADD COLUMN correlated_event_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workflow_incidents ADD COLUMN last_correlated_at TEXT;

UPDATE workflow_incidents SET correlation_key = replace(correlation_key, '|', ':') WHERE correlation_key LIKE '%|%';

ALTER TABLE workflow_incident_correlation_metrics ADD COLUMN bursts_detected INTEGER NOT NULL DEFAULT 0;

ALTER TABLE workflow_failure_burst_log ADD COLUMN confidence_score REAL NOT NULL DEFAULT 0.72;

CREATE TABLE IF NOT EXISTS workflow_incident_noise_score (
  metric_date TEXT PRIMARY KEY NOT NULL,
  noise_score REAL NOT NULL DEFAULT 0,
  total_alerts INTEGER NOT NULL DEFAULT 0,
  alerts_grouped INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
