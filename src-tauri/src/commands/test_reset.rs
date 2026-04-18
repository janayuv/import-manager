use crate::db::{self, DbState};
use crate::migrations::DatabaseMigrations;
use crate::playwright_db;
use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager, State};

fn playwright_reset_enabled() -> bool {
    option_env!("IMPORT_MANAGER_PLAYWRIGHT_BUILD").unwrap_or("0") == "1"
}

fn seed_minimal_test_data(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "INSERT INTO user_roles (user_id, role, permissions) VALUES (?1, ?2, ?3)",
        params!["admin-001", "admin", Option::<&str>::None],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Test-only: delete the playwright SQLite file, recreate schema, run migrations, and seed RBAC.
///
/// Only succeeds when the binary was built with `VITE_PLAYWRIGHT=1` (see `build.rs`), which also
/// switches the runtime database file to `import-manager.playwright.db`.
#[tauri::command]
pub fn reset_test_database(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    if !playwright_reset_enabled() {
        return Err(
            "reset_test_database is only available when the Tauri crate was built with VITE_PLAYWRIGHT=1"
                .to_string(),
        );
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    let db_path = data_dir.join(playwright_db::active_db_filename());

    {
        let mut guard = state.db.lock().map_err(|e| e.to_string())?;
        let placeholder = Connection::open_in_memory().map_err(|e| e.to_string())?;
        let _old = std::mem::replace(&mut *guard, placeholder);
    }

    if db_path.exists() {
        std::fs::remove_file(&db_path)
            .map_err(|e| format!("Failed to remove test database: {e}"))?;
    }

    let mut new_conn = db::create_new_database(&db_path)?;
    DatabaseMigrations::run_migrations(&mut new_conn).map_err(|e| e.to_string())?;
    seed_minimal_test_data(&new_conn)?;

    {
        let mut guard = state.db.lock().map_err(|e| e.to_string())?;
        *guard = new_conn;
    }

    log::info!("Test database reset completed");
    Ok(())
}
