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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shipment {
    pub id: String,
    pub supplier_id: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub goods_category: String,
    pub invoice_value: f64, // Use f64 for floating point numbers
    pub invoice_currency: String,
    pub incoterm: String,
    pub shipment_mode: String,
    pub shipment_type: String,
    pub bl_awb_number: String,
    pub bl_awb_date: String,
    pub vessel_name: String,
    pub container_number: Option<String>,
    pub gross_weight_kg: f64,
    pub etd: String,
    pub eta: String,
    pub status: String,
    pub date_of_delivery: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub part_number: String,
    pub item_description: String,
    pub unit: String,
    pub currency: String,
    pub unit_price: f64,
    pub hsn_code: String,
    pub supplier_id: Option<String>,
    pub is_active: bool,
    pub country_of_origin: Option<String>,
    pub bcd: Option<String>,
    pub sws: Option<String>,
    pub igst: Option<String>,
    pub technical_write_up: Option<String>,
    pub category: Option<String>,
    pub end_use: Option<String>,
    pub net_weight_kg: Option<f64>,
    pub purchase_uom: Option<String>,
    pub gross_weight_per_uom_kg: Option<f64>,
    pub photo_path: Option<String>,
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS shipments (
            id TEXT PRIMARY KEY, supplier_id TEXT NOT NULL, invoice_number TEXT NOT NULL,
            invoice_date TEXT NOT NULL, goods_category TEXT NOT NULL, invoice_value REAL NOT NULL,
            invoice_currency TEXT NOT NULL, incoterm TEXT NOT NULL, shipment_mode TEXT,
            shipment_type TEXT, bl_awb_number TEXT, bl_awb_date TEXT, vessel_name TEXT,
            container_number TEXT, gross_weight_kg REAL, etd TEXT, eta TEXT,
            status TEXT, date_of_delivery TEXT,
            FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            part_number TEXT NOT NULL UNIQUE,
            item_description TEXT NOT NULL,
            unit TEXT NOT NULL,
            currency TEXT NOT NULL,
            unit_price REAL NOT NULL,
            hsn_code TEXT NOT NULL,
            supplier_id TEXT,
            is_active BOOLEAN NOT NULL,
            country_of_origin TEXT,
            bcd TEXT,
            sws TEXT,
            igst TEXT,
            technical_write_up TEXT,
            category TEXT,
            end_use TEXT,
            net_weight_kg REAL,
            purchase_uom TEXT,
            gross_weight_per_uom_kg REAL,
            photo_path TEXT,
            FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
        )",
        [],
    )?;

    Ok(conn)
}