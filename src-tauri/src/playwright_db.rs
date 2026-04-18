//! When the Tauri crate is built with `VITE_PLAYWRIGHT=1`, the app uses an isolated
//! SQLite file so `reset_test_database` never touches the normal `import-manager.db`.

pub const PLAYWRIGHT_DB_FILENAME: &str = "import-manager.playwright.db";
pub const DEFAULT_DB_FILENAME: &str = "import-manager.db";

pub fn active_db_filename() -> &'static str {
    match option_env!("IMPORT_MANAGER_PLAYWRIGHT_BUILD") {
        Some("1") => PLAYWRIGHT_DB_FILENAME,
        _ => DEFAULT_DB_FILENAME,
    }
}
