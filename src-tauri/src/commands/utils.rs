use crate::db::{DbState, SelectOption};
use rusqlite::params;
use tauri::State;

use std::collections::HashMap;

// Type aliases to reduce complexity
pub type BoeShipmentMap = HashMap<String, (String, f64, f64, String, f64, f64, f64, f64)>;
pub type ExpenseTypeRow = (
    String,
    String,
    f64,
    f64,
    f64,
    Option<i32>,
    Option<i32>,
    Option<i32>,
);

#[tauri::command]
pub fn generate_id(prefix: Option<String>) -> String {
    use uuid::Uuid;
    let id = Uuid::new_v4().to_string();
    match prefix {
        Some(p) => format!("{}-{}", p, &id[0..8]),
        None => id,
    }
}

#[tauri::command]
pub fn get_current_user_info() -> Result<serde_json::Value, String> {
    // This command will be called from the frontend to get user info
    // The frontend will pass the user information as a parameter
    // For now, we'll return a default user structure
    let user_info = serde_json::json!({
        "id": "admin-001",
        "username": "admin",
        "name": "Administrator",
        "email": "admin@importmanager.com",
        "role": "admin"
    });

    Ok(user_info)
}

#[tauri::command]
pub fn get_user_context() -> Result<serde_json::Value, String> {
    // This command will be called from the frontend to get user context
    // The frontend will pass the user information as a parameter
    // For now, we'll return a default user context
    let user_context = serde_json::json!({
        "userId": "admin-001",
        "userName": "Administrator",
        "userRole": "admin",
        "timestamp": chrono::Utc::now().to_rfc3339()
    });

    Ok(user_context)
}

// ============================================================================
// --- GENERIC OPTION COMMANDS (INTERNAL HELPERS) ---
// ============================================================================

pub fn get_options_from_table(
    table_name: &str,
    state: &State<DbState>,
) -> Result<Vec<SelectOption>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(&format!("SELECT value, label FROM {table_name}"))
        .map_err(|e| e.to_string())?;

    let option_iter = stmt
        .query_map([], |row| {
            Ok(SelectOption {
                // Use the correct struct name `SelectOption`
                value: row.get(0)?,
                label: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    option_iter
        .collect::<Result<Vec<SelectOption>, _>>()
        .map_err(|e| e.to_string())
}

pub fn add_option_to_table(
    table_name: &str,
    option: SelectOption,
    state: &State<DbState>,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        &format!("INSERT OR IGNORE INTO {table_name} (value, label) VALUES (?1, ?2)"),
        params![option.value, option.label],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
