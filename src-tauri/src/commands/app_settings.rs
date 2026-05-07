use crate::db::DbState;
use crate::ipc_error::IpcError;
use crate::security::Permission;
use rusqlite::{params, OptionalExtension};
use tauri::State;

const LINE_TOTAL_DECIMALS_KEY: &str = "line_total_decimals";
const INVOICE_TOTAL_DECIMALS_KEY: &str = "invoice_total_decimals";
const DEFAULT_DECIMALS: u8 = 2;
const PERM_SETTINGS_MANAGE: Permission = Permission::BackupSettings;

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceCalculationSettings {
    pub line_total_decimals: u8,
    pub invoice_total_decimals: u8,
}

fn sanitize_decimals(value: Option<String>) -> u8 {
    match value.as_deref().unwrap_or("").trim().parse::<u8>().ok() {
        Some(0) => 0,
        Some(2) => 2,
        _ => DEFAULT_DECIMALS,
    }
}

fn upsert_setting(db: &rusqlite::Connection, key: &str, value: u8) -> Result<(), String> {
    db.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = datetime('now')",
        params![key, value.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_setting(db: &rusqlite::Connection, key: &str) -> Result<Option<String>, String> {
    db.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn read_invoice_calculation_settings(
    db: &rusqlite::Connection,
) -> Result<InvoiceCalculationSettings, String> {
    let line_total_decimals = sanitize_decimals(get_setting(db, LINE_TOTAL_DECIMALS_KEY)?);
    let invoice_total_decimals = sanitize_decimals(get_setting(db, INVOICE_TOTAL_DECIMALS_KEY)?);

    Ok(InvoiceCalculationSettings {
        line_total_decimals,
        invoice_total_decimals,
    })
}

fn write_invoice_calculation_settings(
    db: &mut rusqlite::Connection,
    line_total_decimals: u8,
    invoice_total_decimals: u8,
) -> Result<InvoiceCalculationSettings, String> {
    if !matches!(line_total_decimals, 0 | 2) {
        return Err("line_total_decimals must be 0 or 2".to_string());
    }
    if !matches!(invoice_total_decimals, 0 | 2) {
        return Err("invoice_total_decimals must be 0 or 2".to_string());
    }

    let tx = db.transaction().map_err(|e| e.to_string())?;
    upsert_setting(&tx, LINE_TOTAL_DECIMALS_KEY, line_total_decimals)?;
    upsert_setting(&tx, INVOICE_TOTAL_DECIMALS_KEY, invoice_total_decimals)?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(InvoiceCalculationSettings {
        line_total_decimals,
        invoice_total_decimals,
    })
}

#[tauri::command]
pub fn get_invoice_calculation_settings(
    state: State<DbState>,
) -> Result<InvoiceCalculationSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    read_invoice_calculation_settings(&db)
}

#[tauri::command]
pub fn set_invoice_calculation_settings(
    line_total_decimals: u8,
    invoice_total_decimals: u8,
    user_id: Option<String>,
    state: State<DbState>,
) -> Result<InvoiceCalculationSettings, IpcError> {
    let mut db = state
        .db
        .lock()
        .map_err(|e| IpcError::new("internal", e.to_string()))?;
    crate::safety::guard_permission(&db, user_id.as_deref(), PERM_SETTINGS_MANAGE)?;
    write_invoice_calculation_settings(&mut db, line_total_decimals, invoice_total_decimals)
        .map_err(|m| IpcError::new("validation", m))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        conn.execute(
            "CREATE TABLE app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
            [],
        )
        .expect("create app_settings table");
        conn
    }

    #[test]
    fn invoice_calculation_settings_default_to_two_when_missing_or_invalid() {
        let conn = setup_conn();
        let settings =
            read_invoice_calculation_settings(&conn).expect("read settings should succeed");
        assert_eq!(settings.line_total_decimals, 2);
        assert_eq!(settings.invoice_total_decimals, 2);

        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)",
            params![LINE_TOTAL_DECIMALS_KEY, "7"],
        )
        .expect("insert invalid line total");
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)",
            params![INVOICE_TOTAL_DECIMALS_KEY, "abc"],
        )
        .expect("insert invalid invoice total");

        let settings =
            read_invoice_calculation_settings(&conn).expect("read settings should succeed");
        assert_eq!(settings.line_total_decimals, 2);
        assert_eq!(settings.invoice_total_decimals, 2);
    }

    #[test]
    fn invoice_calculation_settings_accept_zero_and_two() {
        let mut conn = setup_conn();

        let updated = write_invoice_calculation_settings(&mut conn, 0, 2)
            .expect("write settings should succeed");
        assert_eq!(updated.line_total_decimals, 0);
        assert_eq!(updated.invoice_total_decimals, 2);

        let persisted =
            read_invoice_calculation_settings(&conn).expect("read settings should succeed");
        assert_eq!(persisted.line_total_decimals, 0);
        assert_eq!(persisted.invoice_total_decimals, 2);
    }

    #[test]
    fn invoice_calculation_settings_reject_invalid_values() {
        let mut conn = setup_conn();

        let err = write_invoice_calculation_settings(&mut conn, 1, 2)
            .expect_err("line decimals=1 must fail");
        assert!(err.contains("line_total_decimals"));

        let err = write_invoice_calculation_settings(&mut conn, 2, 3)
            .expect_err("invoice decimals=3 must fail");
        assert!(err.contains("invoice_total_decimals"));
    }
}
