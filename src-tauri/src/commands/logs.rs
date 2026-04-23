//! Read application log file from the Tauri log directory (tauri-plugin-log `app.log`).

use tauri::Manager;

const TAIL_MAX_LINES: usize = 500;

/// Returns the last up to [TAIL_MAX_LINES] lines of `app.log`, or an empty list if the file is missing.
#[tauri::command]
pub fn get_application_logs(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let path = log_dir.join("app.log");
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = content
        .lines()
        .map(std::string::ToString::to_string)
        .collect();
    let n = lines.len();
    if n <= TAIL_MAX_LINES {
        Ok(lines)
    } else {
        Ok(lines[n - TAIL_MAX_LINES..].to_vec())
    }
}
