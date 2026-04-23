//! Shell version and client-originated log lines (no secrets; truncated).

/// Tauri / Cargo package version; matches [package].version in Cargo.toml and tauri.conf.json when released together.
#[tauri::command]
pub fn get_shell_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

const MAX_LOG_LINE: usize = 2000;

/// Forward UI log lines to the Rust `log` facade (and log-dir file). Sanitized: length-capped, no custom targets.
#[tauri::command]
pub fn log_client_event(level: String, message: String) {
    let safe: String = message.chars().take(MAX_LOG_LINE).collect();
    let lvl = level.to_lowercase();
    match lvl.as_str() {
        "error" => log::error!(target: "import_manager::client", "{}", safe),
        "warn" => log::warn!(target: "import_manager::client", "{}", safe),
        _ => log::info!(target: "import_manager::client", "{}", safe),
    }
}
