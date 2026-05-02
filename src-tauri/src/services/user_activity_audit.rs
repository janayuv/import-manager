use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserActivityAuditLog {
    pub id: String,
    pub user_id: Option<String>,
    pub action_name: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub details_json: Option<String>,
    pub status: String,
    pub timestamp: String,
}

pub fn log_activity(
    conn: &Connection,
    user_id: Option<&str>,
    action_name: &str,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    details_json: Option<&str>,
    status: &str,
) {
    let id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();

    let res = conn.execute(
        "INSERT INTO user_activity_audit_logs (id, user_id, action_name, entity_type, entity_id, details_json, status, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, user_id, action_name, entity_type, entity_id, details_json, status, timestamp],
    );

    if let Err(e) = res {
        log::warn!("Failed to log user activity ({}): {}", action_name, e);
    }
}
