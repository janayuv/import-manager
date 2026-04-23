//! Tauri commands for export/import of the backup AES key (`.imkey` files).

use std::fs;
use std::path::Path;
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

const IMKEY_NAME: &str = "backup_key.imkey";

/// True if a backup encryption key is already stored in the OS keyring.
#[tauri::command]
pub async fn has_backup_key_in_keyring() -> Result<bool, String> {
    Ok(crate::utils::backup_keyring::get_raw_backup_key_silent()
        .map(|s| !s.is_empty())
        .unwrap_or(false))
}

/// Writes the key from the keyring to the given path. Caller may use a save dialog for `path`.
#[tauri::command]
pub async fn export_backup_key_to_path(path: String) -> Result<(), String> {
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
pub async fn export_backup_key(window: WebviewWindow) -> Result<(), String> {
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
) -> Result<(), String> {
    crate::utils::backup_keyring::import_key_from_imkey_path(Path::new(&path), replace_confirmed)
}
