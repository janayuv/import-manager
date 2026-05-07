//! Tauri commands for export/import of the backup AES key (`.imkey` files).

use crate::db::DbState;
use crate::ipc_error::IpcError;
use crate::security::Permission;
use std::fs;
use std::path::Path;
use tauri::State;
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

const IMKEY_NAME: &str = "backup_key.imkey";
const PERM_SETTINGS_MANAGE: Permission = Permission::BackupSettings;

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
) -> Result<(), IpcError> {
    let db = db_state
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()))?;
    crate::safety::guard_permission(&db, user_id.as_deref(), PERM_SETTINGS_MANAGE)?;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| IpcError::new("io", e.to_string()))?;
        }
    }
    crate::utils::backup_keyring::export_key_to_imkey_file(p)
        .map_err(|m| IpcError::new("backup_key_export_failed", m))
}

/// Native save dialog, then write `backup_key.imkey` at the chosen path.
#[tauri::command]
pub async fn export_backup_key(
    window: WebviewWindow,
    user_id: Option<String>,
    db_state: State<'_, DbState>,
) -> Result<(), IpcError> {
    let db = db_state
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()))?;
    crate::safety::guard_permission(&db, user_id.as_deref(), PERM_SETTINGS_MANAGE)?;
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
        .map_err(|e| IpcError::new("invalid_path", format!("Invalid save path: {}", e)))?;
    if let Some(parent) = path_buf.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| IpcError::new("io", e.to_string()))?;
        }
    }
    crate::utils::backup_keyring::export_key_to_imkey_file(&path_buf)
        .map_err(|m| IpcError::new("backup_key_export_failed", m))
}

/// Reads a `.imkey` file, validates, and stores in the keyring. `replace_confirmed` is required
/// to overwrite an existing key.
#[tauri::command]
pub async fn import_backup_key_from_path(
    path: String,
    replace_confirmed: bool,
    user_id: Option<String>,
    db_state: State<'_, DbState>,
) -> Result<(), IpcError> {
    let db = db_state
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()))?;
    crate::safety::guard_permission(&db, user_id.as_deref(), PERM_SETTINGS_MANAGE)?;
    crate::utils::backup_keyring::import_key_from_imkey_path(Path::new(&path), replace_confirmed)
        .map_err(|e| {
            log::error!(
                target: "import_manager::security",
                "Backup key import failed (path redacted): {}",
                e
            );
            IpcError::new("backup_key_import_failed", e)
        })
}
