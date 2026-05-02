-- V71__user_activity_audit_logs.sql
CREATE TABLE IF NOT EXISTS user_activity_audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    action_name TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details_json TEXT,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_activity_timestamp ON user_activity_audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_activity_entity ON user_activity_audit_logs(entity_type, entity_id);
