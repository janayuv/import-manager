-- Multi-environment registry, tenant isolation, environment-scoped rule versions, env deployment log.

CREATE TABLE IF NOT EXISTS workflow_environments (
    environment_id TEXT PRIMARY KEY NOT NULL,
    environment_name TEXT NOT NULL,
    environment_type TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT OR IGNORE INTO workflow_environments (environment_id, environment_name, environment_type, is_active)
VALUES
    ('env-dev', 'DEV', 'DEV', 1),
    ('env-test', 'TEST', 'TEST', 1),
    ('env-prod', 'PROD', 'PROD', 1);

CREATE TABLE IF NOT EXISTS workflow_tenants (
    tenant_id TEXT PRIMARY KEY NOT NULL,
    tenant_name TEXT NOT NULL,
    tenant_status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

INSERT OR IGNORE INTO workflow_tenants (tenant_id, tenant_name, tenant_status)
VALUES ('tenant-default', 'Default organization', 'ACTIVE');

-- Live decision rules: tenant scope (PK rule_id unchanged — one row per rule id per tenant in practice).
ALTER TABLE workflow_decision_rules ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-default';

CREATE INDEX IF NOT EXISTS idx_workflow_decision_rules_tenant
    ON workflow_decision_rules (tenant_id, rule_type, enabled, priority DESC);

-- Rebuild workflow_rule_versions with tenant + environment scope (unique per tenant/env/rule/vn).
CREATE TABLE IF NOT EXISTS workflow_rule_versions_new (
    version_id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-default',
    environment_id TEXT NOT NULL DEFAULT 'env-prod',
    version_number INTEGER NOT NULL,
    rule_definition_json TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    is_active INTEGER NOT NULL DEFAULT 0,
    change_reason TEXT NOT NULL DEFAULT '',
    UNIQUE (tenant_id, environment_id, rule_id, version_number)
);

INSERT INTO workflow_rule_versions_new (
    version_id, rule_id, tenant_id, environment_id, version_number,
    rule_definition_json, created_by, created_at, is_active, change_reason
)
SELECT
    version_id,
    rule_id,
    'tenant-default',
    'env-prod',
    version_number,
    rule_definition_json,
    created_by,
    created_at,
    is_active,
    change_reason
FROM workflow_rule_versions;

DROP TABLE workflow_rule_versions;
ALTER TABLE workflow_rule_versions_new RENAME TO workflow_rule_versions;

CREATE INDEX IF NOT EXISTS idx_workflow_rule_versions_rule_env
    ON workflow_rule_versions (tenant_id, environment_id, rule_id, version_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_rule_versions_one_active
    ON workflow_rule_versions (tenant_id, environment_id, rule_id)
    WHERE is_active = 1;

-- Environment-level deployment traceability
CREATE TABLE IF NOT EXISTS workflow_environment_deployment_log (
    deployment_id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_wf_env_deploy_env_time
    ON workflow_environment_deployment_log (environment_id, datetime(timestamp) DESC);

CREATE INDEX IF NOT EXISTS idx_wf_env_deploy_tenant
    ON workflow_environment_deployment_log (tenant_id, datetime(timestamp) DESC);

-- Canary: tenant scope (rebuild unique constraint)
CREATE TABLE IF NOT EXISTS canary_rule_deployment_new (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'tenant-default',
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    sample_size_percentage REAL NOT NULL DEFAULT 10,
    deployment_status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    UNIQUE (tenant_id, rule_id)
);

INSERT INTO canary_rule_deployment_new (id, tenant_id, rule_id, version_id, sample_size_percentage, deployment_status, created_at)
SELECT id, 'tenant-default', rule_id, version_id, sample_size_percentage, deployment_status, created_at
FROM canary_rule_deployment;

DROP TABLE canary_rule_deployment;
ALTER TABLE canary_rule_deployment_new RENAME TO canary_rule_deployment;

-- Automation log: tenant attribution for tenant dashboards (optional filter).
ALTER TABLE workflow_automation_log ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-default';

CREATE INDEX IF NOT EXISTS idx_workflow_automation_log_tenant_time
    ON workflow_automation_log (tenant_id, datetime(executed_at) DESC);

INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_active_tenant_id', 'tenant-default');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_execution_environment_id', 'env-prod');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_rule_version_default_environment_id', 'env-prod');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_deploy_require_capacity_headroom', '1');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('workflow_deploy_simulation_gate_enabled', '0');
