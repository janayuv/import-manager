-- Automation cost intelligence, capacity snapshots, economics index, cost guardrails.

ALTER TABLE workflow_automation_log ADD COLUMN actual_execution_time_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_automation_log ADD COLUMN records_processed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_automation_log ADD COLUMN estimated_cost_units REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rule_execution_cost_estimate (
    rule_id TEXT NOT NULL DEFAULT '',
    action_type TEXT NOT NULL,
    estimated_cpu_cost REAL NOT NULL DEFAULT 1,
    estimated_io_cost REAL NOT NULL DEFAULT 1,
    estimated_time_ms REAL NOT NULL DEFAULT 50,
    estimated_memory_cost REAL NOT NULL DEFAULT 1,
    cost_weight REAL NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    PRIMARY KEY (rule_id, action_type)
);

CREATE INDEX IF NOT EXISTS idx_rule_exec_cost_action ON rule_execution_cost_estimate (action_type);

CREATE TABLE IF NOT EXISTS rule_cost_efficiency_metrics (
    rule_id TEXT NOT NULL,
    metric_date TEXT NOT NULL,
    total_cost_units REAL NOT NULL DEFAULT 0,
    total_actions INTEGER NOT NULL DEFAULT 0,
    total_resolution_gain REAL NOT NULL DEFAULT 0,
    cost_per_resolution REAL NOT NULL DEFAULT 0,
    efficiency_score REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    PRIMARY KEY (rule_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_rule_cost_eff_date ON rule_cost_efficiency_metrics (metric_date DESC);

CREATE TABLE IF NOT EXISTS automation_capacity_load (
    id TEXT PRIMARY KEY NOT NULL,
    snapshot_at TEXT NOT NULL,
    current_active_rules INTEGER NOT NULL DEFAULT 0,
    actions_per_cycle INTEGER NOT NULL DEFAULT 0,
    records_processed_per_cycle INTEGER NOT NULL DEFAULT 0,
    peak_cycle_duration_ms INTEGER NOT NULL DEFAULT 0,
    queue_depth INTEGER NOT NULL DEFAULT 0,
    load_percentage REAL NOT NULL DEFAULT 0,
    load_state TEXT NOT NULL DEFAULT 'LOW',
    total_cost_units_cycle REAL NOT NULL DEFAULT 0,
    factors_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_capacity_load_snapshot ON automation_capacity_load (datetime(snapshot_at) DESC);

CREATE TABLE IF NOT EXISTS automation_cost_limits (
    id TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
    max_cost_units_per_cycle REAL NOT NULL DEFAULT 500000,
    max_execution_time_per_cycle_ms INTEGER NOT NULL DEFAULT 120000,
    max_records_processed_per_cycle INTEGER NOT NULL DEFAULT 500000,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT OR IGNORE INTO automation_cost_limits (id, max_cost_units_per_cycle, max_execution_time_per_cycle_ms, max_records_processed_per_cycle)
VALUES ('default', 500000, 120000, 500000);

CREATE TABLE IF NOT EXISTS daily_automation_economics_index (
    snapshot_date TEXT PRIMARY KEY NOT NULL,
    benefit_score REAL NOT NULL DEFAULT 0,
    cost_score REAL NOT NULL DEFAULT 0,
    efficiency_gain REAL NOT NULL DEFAULT 0,
    economics_index REAL NOT NULL DEFAULT 0,
    factors_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_cycle_started_at', '');

-- Global default cost weights by engine action (rule_id '' = fallback).
INSERT OR IGNORE INTO rule_execution_cost_estimate
    (rule_id, action_type, estimated_cpu_cost, estimated_io_cost, estimated_time_ms, estimated_memory_cost, cost_weight, updated_at)
VALUES
    ('', 'AUTO_RESOLVE', 1, 1, 45, 1, 1.0, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    ('', 'AUTO_ASSIGN', 1.2, 1.8, 120, 1.2, 2.0, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    ('', 'PRIORITY_ADJUST', 1, 1, 35, 1, 1.0, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    ('', 'AUTO_ESCALATE', 1.5, 2, 200, 1.5, 2.5, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    ('', 'ADAPTIVE_SLA', 2, 2.5, 350, 2, 3.5, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    ('', 'AUTO_REPAIR', 1.1, 1.4, 90, 1.1, 1.8, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    ('', 'AUTOMATION_CYCLE_SUMMARY', 0.5, 0.5, 20, 0.5, 0.3, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'));

-- Per-rule rows inherit rule_type as action_type proxy where applicable (AUTO_RESOLVE rules share weight).
INSERT OR IGNORE INTO rule_execution_cost_estimate
    (rule_id, action_type, estimated_cpu_cost, estimated_io_cost, estimated_time_ms, estimated_memory_cost, cost_weight, updated_at)
SELECT
    r.rule_id,
    r.rule_type,
    1,
    1,
    CASE r.rule_type
        WHEN 'AUTO_RESOLVE' THEN 45
        WHEN 'AUTO_ASSIGN' THEN 120
        WHEN 'PRIORITY_ADJUST' THEN 35
        WHEN 'AUTO_ESCALATE' THEN 200
        ELSE 60
    END,
    1,
    CASE r.rule_type
        WHEN 'AUTO_RESOLVE' THEN 1.0
        WHEN 'AUTO_ASSIGN' THEN 2.0
        WHEN 'PRIORITY_ADJUST' THEN 1.0
        WHEN 'AUTO_ESCALATE' THEN 2.5
        ELSE 1.5
    END,
    strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
FROM workflow_decision_rules r;
