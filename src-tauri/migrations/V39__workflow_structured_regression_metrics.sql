-- Structured-triggered regression rollups (complement to alert-based regression).

CREATE TABLE IF NOT EXISTS workflow_structured_regression_metrics (
  metric_date TEXT PRIMARY KEY NOT NULL,
  structured_regressions_detected INTEGER NOT NULL DEFAULT 0,
  avg_structured_regression_time REAL NOT NULL DEFAULT 0,
  structured_regression_ratio REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
