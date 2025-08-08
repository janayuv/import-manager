// In src-tauri/src/db.rs

use serde::{Serialize, Deserialize};
use rusqlite::{Connection, Result}; // Removed unused 'params'
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}
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
#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceLineItem {
    pub id: String,
    pub item_id: String,
    pub quantity: f64,
    pub unit_price: f64,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: String,
    pub shipment_id: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub status: String,
    pub calculated_total: f64,
    pub shipment_total: f64,
    pub line_items: Vec<InvoiceLineItem>,
}

// Structs for receiving data from the frontend
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewInvoicePayload {
    pub shipment_id: String,
    pub status: String,
    pub line_items: Vec<NewInvoiceLineItemPayload>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewInvoiceLineItemPayload {
    pub item_id: String,
    pub quantity: f64,
    pub unit_price: f64,
}

// --- BOE STRUCTS ---
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoeDetails {
    pub id: String,
    pub be_number: String,
    pub be_date: String,
    pub location: String,
    pub total_assessment_value: f64,
    pub duty_amount: f64,
    pub payment_date: Option<String>,
    pub duty_paid: Option<f64>,
    pub challan_number: Option<String>,
    pub ref_id: Option<String>,
    pub transaction_id: Option<String>,
}

// NEW struct for receiving new BOE data from the frontend (without ID)
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBoePayload {
    pub be_number: String,
    pub be_date: String,
    pub location: String,
    pub total_assessment_value: f64,
    pub duty_amount: f64,
    pub payment_date: Option<String>,
    pub duty_paid: Option<f64>,
    pub challan_number: Option<String>,
    pub ref_id: Option<String>,
    pub transaction_id: Option<String>,
}

// ============================================================================
// --- BOE CALCULATION STRUCTS ---
// These structs precisely match the TypeScript types in the frontend.
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub document_type: String,
    pub file_name: String,
    pub url: String,
    pub uploaded_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FormValues {
    pub supplier_name: String,
    pub shipment_id: String,
    pub exchange_rate: f64,
    pub freight_cost: f64,
    pub exw_cost: f64,
    pub insurance_rate: f64,
    pub interest: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoeItemInput {
    pub part_no: String,
    pub calculation_method: String, // "Standard", "CEPA", "Rodtep"
    pub boe_bcd_rate: f64,
    pub boe_sws_rate: f64,
    pub boe_igst_rate: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CalculatedDutyItem {
    pub part_no: String,
    pub description: String,
    pub assessable_value: f64,
    pub bcd_value: f64,
    pub sws_value: f64,
    pub igst_value: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CalculationResult {
    pub calculated_items: Vec<CalculatedDutyItem>,
    pub bcd_total: f64,
    pub sws_total: f64,
    pub igst_total: f64,
    pub interest: f64,
    pub customs_duty_total: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedBoe {
    pub id: String,
    pub shipment_id: String,
    pub boe_id: Option<String>,
    pub invoice_number: String,
    pub supplier_name: String,
    pub status: String,
    pub form_values: FormValues,
    pub item_inputs: Vec<BoeItemInput>,
    pub calculation_result: CalculationResult,
    pub attachments: Option<Vec<Attachment>>,
}

// --- Structs for the specialized BOE Entry command ---
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoeShipmentItem {
    pub part_no: String,
    pub description: String,
    pub qty: f64,
    pub unit_price: f64,
    pub hs_code: String,
    pub line_total: f64,
    pub actual_bcd_rate: f64,
    pub actual_sws_rate: f64,
    pub actual_igst_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoeShipment {
    pub id: String,
    pub supplier_name: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub invoice_value: f64,
    pub invoice_currency: String,
    pub incoterm: String,
    pub status: String,
    pub items: Vec<BoeShipmentItem>,
}

// --- Reconciliation output types ---
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReconciledItemRow {
    pub part_no: String,
    pub description: String,
    pub qty: f64,
    pub unit_price: f64,
    pub hs_code: String,
    pub assessable_value: f64,
    pub actual_bcd: f64,
    pub actual_sws: f64,
    pub actual_igst: f64,
    pub actual_total: f64,
    pub boe_bcd: f64,
    pub boe_sws: f64,
    pub boe_igst: f64,
    pub boe_total: f64,
    pub method: String,
    pub savings: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReconciliationTotals {
    pub actual_total: f64,
    pub boe_total: f64,
    pub savings_total: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoeReconciliationReport {
    pub saved_boe_id: String,
    pub shipment_id: String,
    pub supplier_name: String,
    pub invoice_number: String,
    pub items: Vec<ReconciledItemRow>,
    pub totals: ReconciliationTotals,
}
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
    conn.execute(
        "CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY NOT NULL,
            shipment_id TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS invoice_line_items (
            id TEXT PRIMARY KEY NOT NULL,
            invoice_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit_price REAL NOT NULL,
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(id)
        )",
        [],
    )?;
   
        conn.execute(
        "CREATE TABLE IF NOT EXISTS boe_details (
            id TEXT PRIMARY KEY NOT NULL,
            be_number TEXT NOT NULL,
            be_date TEXT NOT NULL,
            location TEXT NOT NULL,
            total_assessment_value REAL NOT NULL,
            duty_amount REAL NOT NULL,
            payment_date TEXT,
            duty_paid REAL,
            challan_number TEXT,
            ref_id TEXT,
            transaction_id TEXT,
            UNIQUE(be_number, be_date)
        )",
        [],
    )?;

    
    // --- NEW: TABLE FOR BOE CALCULATIONS ---
    conn.execute(
        "CREATE TABLE IF NOT EXISTS boe_calculations (
            id TEXT PRIMARY KEY NOT NULL,
            shipment_id TEXT NOT NULL,
            boe_id TEXT, -- <-- ADDED: New column for the BOE ID link
            supplier_name TEXT NOT NULL,
            invoice_number TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Awaiting BOE Data',
            form_values_json TEXT NOT NULL,
            item_inputs_json TEXT NOT NULL,
            calculation_result_json TEXT NOT NULL,
            attachments_json TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
            FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Attempt to migrate existing table to include new columns (no-op if already present)
    let _ = conn.execute("ALTER TABLE boe_calculations ADD COLUMN status TEXT NOT NULL DEFAULT 'Awaiting BOE Data'", []);
    let _ = conn.execute("ALTER TABLE boe_calculations ADD COLUMN attachments_json TEXT", []);
    // MODIFIED: Create tables for all the dropdown options.
    let option_tables = vec![
        "units", "currencies", "countries", "bcd_rates", "sws_rates",
        "igst_rates", "categories", "end_uses", "purchase_uoms",
        "incoterms", "shipment_modes", "shipment_types", "shipment_statuses"
    ];

    for table_name in option_tables {
        conn.execute(
            &format!(
                "CREATE TABLE IF NOT EXISTS {} (
                    value TEXT PRIMARY KEY NOT NULL,
                    label TEXT NOT NULL UNIQUE
                )",
                table_name
            ),
            [],
        )?;
    }
    

    Ok(conn)
}
