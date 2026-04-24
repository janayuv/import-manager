-- Rule-driven workflow automation, adaptive SLA snapshots, efficiency scoring, audit trail.

CREATE TABLE IF NOT EXISTS workflow_decision_rules (
    rule_id TEXT PRIMARY KEY NOT NULL,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    condition_expression TEXT NOT NULL DEFAULT '{}',
    action_type TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_rules_type_enabled
    ON workflow_decision_rules (rule_type, enabled, priority DESC);

CREATE TABLE IF NOT EXISTS workflow_automation_log (
    automation_id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL DEFAULT '',
    action_taken TEXT NOT NULL,
    target_entity TEXT NOT NULL DEFAULT '',
    executed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    execution_result TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_automation_executed
    ON workflow_automation_log (executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_automation_action_hour
    ON workflow_automation_log (action_taken, executed_at DESC);

CREATE TABLE IF NOT EXISTS adaptive_sla_adjustments (
    id TEXT PRIMARY KEY NOT NULL,
    exception_type TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    previous_hours REAL NOT NULL DEFAULT 24,
    adjusted_hours REAL NOT NULL DEFAULT 24,
    factors_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    UNIQUE (exception_type, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_adaptive_sla_date
    ON adaptive_sla_adjustments (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS daily_workflow_efficiency_score (
    snapshot_date TEXT NOT NULL PRIMARY KEY,
    efficiency_score REAL NOT NULL,
    factors_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

ALTER TABLE exception_cases ADD COLUMN assignment_method TEXT NOT NULL DEFAULT 'MANUAL';

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_automation_master_enabled', '1');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_max_auto_resolve_per_hour', '40');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_max_auto_escalate_per_hour', '15');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_max_priority_adjust_per_cycle', '80');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_paused_until', '');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_last_pause_reason', '');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('automation_adaptive_sla_apply', '0');

-- Safe default rules (condition JSON interpreted by workflow_automation engine).
INSERT OR IGNORE INTO workflow_decision_rules (rule_id, rule_name, rule_type, condition_expression, action_type, priority, enabled)
VALUES
    ('rule-auto-resolve-overdue-delivered', 'Resolve OVERDUE when shipment delivered', 'AUTO_RESOLVE',
     '{"exceptionTypes":["OVERDUE_ETA"],"predicate":"shipment_delivered"}', 'AUTO_RESOLVE', 100, 1),
    ('rule-auto-resolve-boe-present', 'Resolve MISSING_BOE when BOE exists', 'AUTO_RESOLVE',
     '{"exceptionTypes":["MISSING_BOE"],"predicate":"has_boe"}', 'AUTO_RESOLVE', 99, 1),
    ('rule-auto-resolve-expense-present', 'Resolve MISSING_EXPENSE when expenses exist', 'AUTO_RESOLVE',
     '{"exceptionTypes":["MISSING_EXPENSE"],"predicate":"has_expenses"}', 'AUTO_RESOLVE', 98, 1),
    ('rule-auto-assign-load-balance', 'Assign unassigned cases (load balance)', 'AUTO_ASSIGN',
     '{"strategy":"load_balance","roles":["admin","user"]}', 'AUTO_ASSIGN', 50, 1),
    ('rule-priority-recurrence', 'Raise priority on recurrence', 'PRIORITY_ADJUST',
     '{"when":"recurrence_flag","minPriority":"HIGH"}', 'PRIORITY_ADJUST', 40, 1),
    ('rule-auto-escalate-sla', 'Allow SLA escalation pass (engine)', 'AUTO_ESCALATE',
     '{"useExistingEngine":true}', 'AUTO_ESCALATE', 30, 1);
