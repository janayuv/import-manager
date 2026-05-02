use crate::connection_manager::ConnectionManager;
use crate::db::DbState;
use crate::desktop_session::DesktopSessionState;
use crate::services::user_activity_audit::UserActivityAuditLog;
use tauri::State;

#[tauri::command]
pub fn query_user_activity_logs(
    limit: Option<i64>,
    offset: Option<i64>,
    caller_user_id: String,
    session: State<'_, DesktopSessionState>,
    db: State<'_, DbState>,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<UserActivityAuditLog>, String> {
    session.assert_admin_caller(&db, caller_user_id.trim())?;
    let conn = manager.get_read_connection().map_err(|e| e.to_string())?;

    let limit_val = limit.unwrap_or(500).clamp(1, 2000);
    let offset_val = offset.unwrap_or(0).max(0);

    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, action_name, entity_type, entity_id, details_json, status, timestamp, severity \
             FROM user_activity_audit_logs ORDER BY timestamp DESC LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([limit_val, offset_val], |row| {
            Ok(UserActivityAuditLog {
                id: row.get(0)?,
                user_id: row.get(1)?,
                action_name: row.get(2)?,
                entity_type: row.get(3)?,
                entity_id: row.get(4)?,
                details_json: row.get(5)?,
                status: row.get(6)?,
                timestamp: row.get(7)?,
                severity: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut logs = Vec::new();
    for row in rows {
        logs.push(row.map_err(|e| e.to_string())?);
    }

    Ok(logs)
}
