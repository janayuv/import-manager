use crate::connection_manager::ConnectionManager;
use crate::db::DbState;
use crate::services::platform_reliability::{
    enforce_memory_watermark, platform_health_summary, recover_interrupted_writes,
    validate_system_integrity,
};
use tauri::State;

#[tauri::command]
pub fn recover_interrupted_writes_command(state: State<DbState>) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    recover_interrupted_writes(&conn)
}

#[tauri::command]
pub fn validate_system_integrity_command(
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let report = validate_system_integrity(&conn)?;
    serde_json::to_value(report).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_platform_health_summary_command(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let summary = platform_health_summary(&conn, &connection_manager, 0)?;
    serde_json::to_value(summary).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_memory_guard_command() -> Result<(), String> {
    enforce_memory_watermark(0);
    Ok(())
}
