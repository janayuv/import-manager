-- Deployment safety: conflict audit, risk assessments, risk timeline.
-- Enforcement is opt-out: set app_metadata workflow_deploy_prod_safety_enforcement to '0' to disable production gates.

CREATE TABLE IF NOT EXISTS deployment_conflict_log (
    id TEXT PRIMARY KEY NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    rule_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    related_version_id TEXT,
    conflict_type TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_deployment_conflict_rule_time
    ON deployment_conflict_log (rule_id, datetime(detected_at) DESC);

CREATE TABLE IF NOT EXISTS deployment_risk_assessment (
    assessment_id TEXT PRIMARY KEY NOT NULL,
    assessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    risk_score REAL NOT NULL,
    risk_level TEXT NOT NULL,
    safe_to_deploy INTEGER NOT NULL,
    assessment_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (rule_id, version_id, tenant_id, environment_id)
);

CREATE INDEX IF NOT EXISTS idx_deployment_risk_assessment_rule
    ON deployment_risk_assessment (rule_id, datetime(assessed_at) DESC);

CREATE TABLE IF NOT EXISTS deployment_risk_timeline (
    id TEXT PRIMARY KEY NOT NULL,
    deployment_time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
    risk_score REAL NOT NULL,
    risk_level TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    result TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_deployment_risk_timeline_env_time
    ON deployment_risk_timeline (environment_id, datetime(deployment_time) DESC);

-- Default ON for new installs; set to '0' to opt out of automatic production safety blocking.
INSERT INTO app_metadata (key, value)
SELECT 'workflow_deploy_prod_safety_enforcement', '1'
WHERE NOT EXISTS (
    SELECT 1 FROM app_metadata WHERE key = 'workflow_deploy_prod_safety_enforcement'
);
