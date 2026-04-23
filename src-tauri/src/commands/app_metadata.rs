//! `app_metadata` key/value access (e.g. `db_version`).

use crate::commands::db_management::with_sqlite_retry;
use crate::db::DbState;
use rusqlite::params;
use rusqlite::OptionalExtension;
use tauri::State;

#[tauri::command]
pub fn get_app_metadata_value(
    db_state: State<'_, DbState>,
    key: String,
) -> Result<Option<String>, String> {
    with_sqlite_retry("get_app_metadata_value", || {
        let k = key.clone();
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT value FROM app_metadata WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        let value = stmt
            .query_row(params![k], |row| row.get::<_, String>(0))
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(value)
    })
}

#[tauri::command]
pub fn set_app_metadata_value(
    db_state: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    with_sqlite_retry("set_app_metadata_value", || {
        let k = key.clone();
        let v = value.clone();
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO app_metadata (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, v],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}
