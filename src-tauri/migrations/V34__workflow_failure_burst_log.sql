-- Systemic failure burst intelligence (rate vs baseline, cooling, incident promotion).

CREATE TABLE IF NOT EXISTS workflow_failure_burst_log (
  burst_id TEXT PRIMARY KEY NOT NULL,
  source_module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  burst_start_time TEXT NOT NULL,
  burst_end_time TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  baseline_rate REAL NOT NULL,
  current_rate REAL NOT NULL,
  severity TEXT NOT NULL,
  root_cause_hint TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_failure_burst_module_time
  ON workflow_failure_burst_log (source_module, event_type, datetime(burst_start_time) DESC);
