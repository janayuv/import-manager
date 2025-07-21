// In src-tauri/src/db.rs

use serde::{Serialize, Deserialize};
use rusqlite::{Connection, Result}; // Removed unused 'params'
use std::sync::Mutex;

// This struct must match the TypeScript type definition
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: String,
    pub supplier_name: String,
    pub short_name: Option<String>,
    pub country: String,
    pub email: String,
    pub phone: Option<String>,
    pub beneficiary_name: Option<String>,
    pub bank_name: Option<String>,
    pub branch: Option<String>,
    pub bank_address: Option<String>,
    pub account_no: Option<String>,
    pub iban: Option<String>,
    pub swift_code: Option<String>,
    pub is_active: bool,
}

// A struct to hold our database connection state
pub struct DbState {
    pub db: Mutex<Connection>,
}

// Database initialization function
pub fn init(db_path: &std::path::Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            supplier_name TEXT NOT NULL,
            short_name TEXT,
            country TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            beneficiary_name TEXT,
            bank_name TEXT,
            branch TEXT,
            bank_address TEXT,
            account_no TEXT,
            iban TEXT,
            swift_code TEXT,
            is_active BOOLEAN NOT NULL
        )",
        [],
    )?;
    Ok(conn)
}