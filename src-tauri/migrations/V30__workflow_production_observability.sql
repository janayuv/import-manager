-- Production observability: structured events, runtime counters, alert signals, timing samples, reliability score.

CREATE TABLE IF NOT EXISTS workflow_structured_event_log (
  id TEXT PRIMARY KEY NOT NULL,
  timestamp TEXT NOT NULL,
  module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_id TEXT,
  severity TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_structured_event_ts
  ON workflow_structured_event_log (datetime(timestamp) DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_structured_event_module
  ON workflow_structured_event_log (module, datetime(timestamp) DESC);

CREATE TABLE IF NOT EXISTS workflow_runtime_metrics (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  jobs_executed INTEGER NOT NULL DEFAULT 0,
  jobs_failed INTEGER NOT NULL DEFAULT 0,
  jobs_recovered INTEGER NOT NULL DEFAULT 0,
  deployments_blocked INTEGER NOT NULL DEFAULT 0,
  deployments_succeeded INTEGER NOT NULL DEFAULT 0,
  recovery_attempts INTEGER NOT NULL DEFAULT 0,
  risk_evaluations INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workflow_runtime_metrics (id, jobs_executed, jobs_failed, jobs_recovered, deployments_blocked, deployments_succeeded, recovery_attempts, risk_evaluations, updated_at)
VALUES (1, 0, 0, 0, 0, 0, 0, 0, strftime('%Y-%m-%d %H:%M:%S', 'now'));

CREATE TABLE IF NOT EXISTS workflow_alert_signal_log (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  entity_id TEXT,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_alert_signal_created
  ON workflow_alert_signal_log (datetime(created_at) DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_alert_signal_severity
  ON workflow_alert_signal_log (severity, datetime(created_at) DESC);

CREATE TABLE IF NOT EXISTS performance_timing_metrics (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  entity_id TEXT,
  duration_ms INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_performance_timing_cat
  ON performance_timing_metrics (category, datetime(recorded_at) DESC);

CREATE TABLE IF NOT EXISTS system_reliability_score (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  score REAL NOT NULL,
  success_rate REAL NOT NULL,
  failure_rate REAL NOT NULL,
  recovery_success_rate REAL NOT NULL,
  sample_window_days INTEGER NOT NULL DEFAULT 30,
  updated_at TEXT NOT NULL,
  factors_json TEXT NOT NULL DEFAULT '{}'
);

INSERT OR IGNORE INTO system_reliability_score (id, score, success_rate, failure_rate, recovery_success_rate, sample_window_days, updated_at, factors_json)
VALUES (1, 1.0, 1.0, 0.0, 1.0, 30, strftime('%Y-%m-%d %H:%M:%S', 'now'), '{}');
