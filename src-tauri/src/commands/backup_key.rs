//! Tauri commands for export/import of the backup AES key (`.imkey` files).

use std::fs;
use std::path::Path;
use rusqlite::params;
use tauri::State;
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;
use crate::db::DbState;

const IMKEY_NAME: &str = "backup_key.imkey";
const PERM_SETTINGS_MANAGE: &str = "settings.manage";

fn role_allows_permission(role: &str, permission: &str) -> bool {
    match role {
        "admin" => true,
        "db_manager" => matches!(permission, "settings.manage"),
        _ => false,
    }
}

fn ensure_command_permission(
    db: &rusqlite::Connection,
    actor_user_id: Option<&str>,
    permission: &str,
) -> Result<(), String> {
    let Some(actor) = actor_user_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return Err("Permission denied: missing user context.".to_string());
    };
    if actor.eq_ignore_ascii_case("system") || actor.eq_ignore_ascii_case("scheduler") {
        return Ok(());
    }
    let role: String = db
        .query_row(
            "SELECT role FROM user_roles WHERE user_id = ?",
            params![actor],
            |row| row.get(0),
        )
        .map_err(|_| "Permission denied: user role not configured.".to_string())?;
    if role_allows_permission(&role, permission) {
        Ok(())
    } else {
        Err(format!(
            "Permission denied: '{}' requires '{}'.",
            actor, permission
        ))
    }
}

/// True if a backup encryption key is already stored in the OS keyring.
#[tauri::command]
pub async fn has_backup_key_in_keyring() -> Result<bool, String> {
    Ok(crate::utils::backup_keyring::get_raw_backup_key_silent()
        .map(|s| !s.is_empty())
        .unwrap_or(false))
}

/// Writes the key from the keyring to the given path. Caller may use a save dialog for `path`.
#[tauri::command]
pub async fn export_backup_key_to_path(
    path: String,
    user_id: Option<String>,
    db_state: State<'_, DbState>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, user_id.as_deref(), PERM_SETTINGS_MANAGE)?;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    crate::utils::backup_keyring::export_key_to_imkey_file(p)
}

/// Native save dialog, then write `backup_key.imkey` at the chosen path.
#[tauri::command]
pub async fn export_backup_key(
    window: WebviewWindow,
    user_id: Option<String>,
    db_state: State<'_, DbState>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, user_id.as_deref(), PERM_SETTINGS_MANAGE)?;
    let path = window
        .dialog()
        .file()
        .add_filter("Import Manager key", &["imkey"])
        .set_file_name(IMKEY_NAME)
        .set_title("Export backup encryption key")
        .blocking_save_file();
    let Some(file_path) = path else {
        return Ok(());
    };
    let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Invalid save path: {}", e))?;
    if let Some(parent) = path_buf.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    crate::utils::backup_keyring::export_key_to_imkey_file(&path_buf)
}

/// Reads a `.imkey` file, validates, and stores in the keyring. `replace_confirmed` is required
/// to overwrite an existing key.
#[tauri::command]
pub async fn import_backup_key_from_path(
    path: String,
    replace_confirmed: bool,
    user_id: Option<String>,
    db_state: State<'_, DbState>,
) -> Result<(), String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    ensure_command_permission(&db, user_id.as_deref(), PERM_SETTINGS_MANAGE)?;
    crate::utils::backup_keyring::import_key_from_imkey_path(Path::new(&path), replace_confirmed)
}
