-- Automation optimization: effectiveness aggregates, feedback, safety, rollback audit, stability, benchmarking, ROI.

ALTER TABLE workflow_automation_log ADD COLUMN cases_resolved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_automation_log ADD COLUMN cases_assigned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_automation_log ADD COLUMN priority_adjustments INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_automation_log ADD COLUMN sla_improvements INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_automation_log ADD COLUMN resolution_time_reduction_hours REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rule_effectiveness_metrics (
    rule_id TEXT NOT NULL,
    metric_date TEXT NOT NULL,
    actions_taken INTEGER NOT NULL DEFAULT 0,
    successful_actions INTEGER NOT NULL DEFAULT 0,
    failed_actions INTEGER NOT NULL DEFAULT 0,
    cases_resolved INTEGER NOT NULL DEFAULT 0,
    cases_assigned INTEGER NOT NULL DEFAULT 0,
    priority_adjustments INTEGER NOT NULL DEFAULT 0,
    sla_improvements INTEGER NOT NULL DEFAULT 0,
    avg_resolution_time_saved REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    PRIMARY KEY (rule_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_rule_effectiveness_date ON rule_effectiveness_metrics (metric_date DESC);

CREATE TABLE IF NOT EXISTS automation_decision_feedback (
    id TEXT PRIMARY KEY NOT NULL,
    source_automation_id TEXT NOT NULL DEFAULT '',
    rule_id TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    decision_result TEXT NOT NULL DEFAULT '{}',
    resolution_success INTEGER NOT NULL DEFAULT 0,
    follow_up_required INTEGER NOT NULL DEFAULT 0,
    resolution_time_hours REAL,
    helpful INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_feedback_source
    ON automation_decision_feedback (source_automation_id)
    WHERE length(trim(source_automation_id)) > 0;

CREATE INDEX IF NOT EXISTS idx_automation_feedback_rule ON automation_decision_feedback (rule_id, datetime(created_at) DESC);
CREATE INDEX IF NOT EXISTS idx_automation_feedback_target ON automation_decision_feedback (target_entity);

CREATE TABLE IF NOT EXISTS rule_safety_index (
    rule_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    safety_score REAL NOT NULL,
    factors_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    PRIMARY KEY (rule_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_rule_safety_date ON rule_safety_index (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS rollback_action_log (
    id TEXT PRIMARY KEY NOT NULL,
    original_automation_id TEXT NOT NULL,
    rollback_type TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    performed_at TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_rollback_target ON rollback_action_log (target_entity, datetime(performed_at) DESC);

CREATE TABLE IF NOT EXISTS automation_stability_alert (
    id TEXT PRIMARY KEY NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    acknowledged INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stability_alert_open ON automation_stability_alert (acknowledged, datetime(created_at) DESC);

CREATE TABLE IF NOT EXISTS automation_benchmark_history (
    id TEXT PRIMARY KEY NOT NULL,
    period_type TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_automation_benchmark_period ON automation_benchmark_history (period_type, datetime(period_start) DESC);

CREATE TABLE IF NOT EXISTS automation_roi_metrics (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    time_saved_hours_estimate REAL NOT NULL DEFAULT 0,
    manual_workload_reduction_pct REAL NOT NULL DEFAULT 0,
    sla_compliance_improvement_pct REAL NOT NULL DEFAULT 0,
    resolution_speed_increase_pct REAL NOT NULL DEFAULT 0,
    factors_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_last_benchmark_week', '');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_last_benchmark_month', '');
