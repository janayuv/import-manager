-- Version-controlled rule deployment, staging, approvals, deployment log, canary, impact metrics.

CREATE TABLE IF NOT EXISTS workflow_rule_versions (
    version_id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    rule_definition_json TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    is_active INTEGER NOT NULL DEFAULT 0,
    change_reason TEXT NOT NULL DEFAULT '',
    UNIQUE (rule_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_workflow_rule_versions_rule
    ON workflow_rule_versions (rule_id, version_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_rule_versions_one_active
    ON workflow_rule_versions (rule_id)
    WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS workflow_rule_staging (
    staging_id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    staging_environment TEXT NOT NULL DEFAULT 'default',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    status TEXT NOT NULL DEFAULT 'DRAFT'
);

CREATE INDEX IF NOT EXISTS idx_workflow_rule_staging_rule ON workflow_rule_staging (rule_id, datetime(created_at) DESC);

CREATE TABLE IF NOT EXISTS workflow_rule_deployment_log (
    deployment_id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    deployed_by TEXT NOT NULL,
    deployment_status TEXT NOT NULL,
    deployment_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    rollback_flag INTEGER NOT NULL DEFAULT 0,
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workflow_rule_deploy_rule ON workflow_rule_deployment_log (rule_id, datetime(deployment_time) DESC);

CREATE TABLE IF NOT EXISTS workflow_rule_approvals (
    approval_id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    approved_by TEXT NOT NULL DEFAULT '',
    approval_status TEXT NOT NULL DEFAULT 'PENDING',
    approval_time TEXT,
    requested_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_rule_approvals_rule ON workflow_rule_approvals (rule_id, approval_status);

CREATE TABLE IF NOT EXISTS canary_rule_deployment (
    id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    sample_size_percentage REAL NOT NULL DEFAULT 10,
    deployment_status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    UNIQUE (rule_id)
);

CREATE TABLE IF NOT EXISTS rule_deployment_impact_metrics (
    id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    snapshot_at TEXT NOT NULL,
    failure_rate REAL NOT NULL DEFAULT 0,
    cost_units_delta REAL NOT NULL DEFAULT 0,
    resolution_gain_delta REAL NOT NULL DEFAULT 0,
    execution_count INTEGER NOT NULL DEFAULT 0,
    factors_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (rule_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_rule_deploy_impact_version ON rule_deployment_impact_metrics (version_id, snapshot_at DESC);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_rule_deployment_frozen', '0');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_rule_deployment_requires_approval', '0');

-- Seed version 1 from current rules (deterministic version_id for idempotency).
INSERT OR IGNORE INTO workflow_rule_versions (
    version_id, rule_id, version_number, rule_definition_json, created_by, created_at, is_active, change_reason
)
SELECT
    rule_id || ':v:1',
    rule_id,
    1,
    json_object(
        'ruleName', rule_name,
        'ruleType', rule_type,
        'conditionExpression', condition_expression,
        'actionType', action_type,
        'priority', priority,
        'enabled', enabled
    ),
    'system',
    strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'),
    1,
    'Initial snapshot from workflow_decision_rules'
FROM workflow_decision_rules;
