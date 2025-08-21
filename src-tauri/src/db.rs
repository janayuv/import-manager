// In src-tauri/src/db.rs

use rusqlite::{Connection, Result}; // Removed unused 'params'
use serde::{Deserialize, Serialize};
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
    pub shipment_mode: Option<String>,
    pub shipment_type: Option<String>,
    pub bl_awb_number: Option<String>,
    pub bl_awb_date: Option<String>,
    pub vessel_name: Option<String>,
    pub container_number: Option<String>,
    pub gross_weight_kg: Option<f64>,
    pub etd: Option<String>,
    pub eta: Option<String>,
    pub status: Option<String>,
    pub date_of_delivery: Option<String>,
    pub is_frozen: bool,
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

// --- NEW EXPENSE MODULE STRUCTS ---

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServiceProvider {
    pub id: String,
    pub name: String,
    pub gstin: Option<String>,
    pub state: Option<String>,
    pub contact_person: Option<String>,
    pub contact_email: Option<String>,
    pub contact_phone: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseType {
    pub id: String,
    pub name: String,
    pub default_cgst_rate: i32, // Now in basis points (900 = 9.00%)
    pub default_sgst_rate: i32, // Now in basis points (900 = 9.00%)
    pub default_igst_rate: i32, // Now in basis points (900 = 9.00%)
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Expense {
    pub id: String,
    pub expense_invoice_id: String, // NEW: Reference to expense_invoice instead of shipment_id
    pub expense_type_id: String,
    pub amount: f64,
    pub cgst_rate: f64,
    pub sgst_rate: f64,
    pub igst_rate: f64,
    pub tds_rate: f64,
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub tds_amount: f64,
    pub total_amount: f64,
    pub remarks: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseAttachment {
    pub id: String,
    pub expense_id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_type: Option<String>,
    pub uploaded_at: String,
    pub uploaded_by: Option<String>,
}

// NEW: Expense Invoice structure to support multiple expenses per invoice
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseInvoice {
    pub id: String,
    pub shipment_id: String,
    pub service_provider_id: String,
    pub invoice_no: String,
    pub invoice_date: String,
    pub total_amount: f64,
    pub total_cgst_amount: f64,
    pub total_sgst_amount: f64,
    pub total_igst_amount: f64,
    pub remarks: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// NEW: Combined structure for expense with invoice data
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseWithInvoice {
    pub id: String,
    pub expense_invoice_id: String,
    pub expense_type_id: String,
    pub amount: f64,
    pub cgst_rate: f64,
    pub sgst_rate: f64,
    pub igst_rate: f64,
    pub tds_rate: f64,
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub tds_amount: f64,
    pub total_amount: f64,
    pub remarks: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub service_provider_id: String,
    pub invoice_no: String,
    pub invoice_date: String,
}

// --- INVOICE UPLOAD STRUCTS ---
// Simplified structures for invoice upload functionality

pub struct DbState {
    pub db: Mutex<Connection>,
}

// Database schema initialization function (for use with existing connections)
pub fn init_schema(conn: &Connection) -> Result<()> {
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
            status TEXT, date_of_delivery TEXT, is_frozen BOOLEAN NOT NULL DEFAULT 0,
            FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
        )",
        [],
    )?;
    // Migration: add is_frozen if missing
    let _ = conn.execute(
        "ALTER TABLE shipments ADD COLUMN is_frozen BOOLEAN NOT NULL DEFAULT 0",
        [],
    );

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
    let _ = conn.execute(
        "ALTER TABLE boe_calculations ADD COLUMN status TEXT NOT NULL DEFAULT 'Awaiting BOE Data'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE boe_calculations ADD COLUMN attachments_json TEXT",
        [],
    );

    // Migration for expenses table: add expense_invoice_id column if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN expense_invoice_id TEXT",
        [],
    );
    // Migration for expenses table: add service_provider_id column if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN service_provider_id TEXT",
        [],
    );
    // MODIFIED: Create tables for all the dropdown options.
    let option_tables = vec![
        "units",
        "currencies",
        "countries",
        "bcd_rates",
        "sws_rates",
        "igst_rates",
        "categories",
        "end_uses",
        "purchase_uoms",
        "incoterms",
        "shipment_modes",
        "shipment_types",
        "shipment_statuses",
    ];

    for table_name in option_tables {
        conn.execute(
            &format!(
                "CREATE TABLE IF NOT EXISTS {table_name} (
                    value TEXT PRIMARY KEY NOT NULL,
                    label TEXT NOT NULL UNIQUE
                )"
            ),
            [],
        )?;
    }

    // --- EXPENSE MODULE TABLES ---

    conn.execute(
        "CREATE TABLE IF NOT EXISTS service_providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            gstin TEXT UNIQUE,
            state TEXT,
            contact_person TEXT,
            contact_email TEXT,
            contact_phone TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS expense_types (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            default_cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
            default_sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
            default_igst_rate DECIMAL(5, 2) DEFAULT 0.00,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            expense_invoice_id TEXT NOT NULL,
            shipment_id TEXT NOT NULL,
            service_provider_id TEXT NOT NULL,
            invoice_no TEXT NOT NULL,
            invoice_date DATE NOT NULL,
            expense_type_id TEXT NOT NULL,
            amount DECIMAL(12, 2) NOT NULL,
            cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
            sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
            igst_rate DECIMAL(5, 2) DEFAULT 0.00,
            tds_rate DECIMAL(5, 2) DEFAULT 0.00,
            cgst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * cgst_rate / 100) STORED,
            sgst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * sgst_rate / 100) STORED,
            igst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * igst_rate / 100) STORED,
            tds_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * tds_rate / 100) STORED,
            total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount + (amount * (cgst_rate + sgst_rate + igst_rate) / 100)) STORED,
            remarks TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (expense_invoice_id) REFERENCES expense_invoices(id),
            FOREIGN KEY (shipment_id) REFERENCES shipments(id),
            FOREIGN KEY (service_provider_id) REFERENCES service_providers(id),
            FOREIGN KEY (expense_type_id) REFERENCES expense_types(id),
            UNIQUE(expense_invoice_id, expense_type_id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS expense_invoices (
            id TEXT PRIMARY KEY,
            shipment_id TEXT NOT NULL,
            service_provider_id TEXT NOT NULL,
            invoice_no TEXT NOT NULL,
            invoice_date DATE NOT NULL,
            total_amount DECIMAL(12, 2) NOT NULL,
            total_cgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            total_sgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            total_igst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            remarks TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shipment_id) REFERENCES shipments(id),
            FOREIGN KEY (service_provider_id) REFERENCES service_providers(id),
            UNIQUE(service_provider_id, invoice_no)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS expense_attachments (
            id TEXT PRIMARY KEY,
            expense_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_type TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            uploaded_by TEXT,
            FOREIGN KEY (expense_id) REFERENCES expenses(id)
        )",
        [],
    )?;

    // Migration: Add new columns to expense_invoices table if they don't exist
    let _ = conn.execute("ALTER TABLE expense_invoices ADD COLUMN total_cgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00", []);
    let _ = conn.execute("ALTER TABLE expense_invoices ADD COLUMN total_sgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00", []);
    let _ = conn.execute("ALTER TABLE expense_invoices ADD COLUMN total_igst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00", []);

    // Migration: Add basis points rate columns to expense_types table for production-grade module
    let _ = conn.execute(
        "ALTER TABLE expense_types ADD COLUMN default_cgst_rate_bp INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_types ADD COLUMN default_sgst_rate_bp INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_types ADD COLUMN default_igst_rate_bp INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_types ADD COLUMN default_tds_rate_bp INTEGER DEFAULT 0",
        [],
    );

    // Migration: Add missing columns to expenses table if they don't exist
    let _ = conn.execute("ALTER TABLE expenses ADD COLUMN shipment_id TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN service_provider_id TEXT",
        [],
    );
    let _ = conn.execute("ALTER TABLE expenses ADD COLUMN invoice_no TEXT", []);
    let _ = conn.execute("ALTER TABLE expenses ADD COLUMN invoice_date DATE", []);

    // Migration: Add new columns for production-grade expense module
    // Add paise-based columns to expense_invoices table
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN total_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN total_cgst_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN total_sgst_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN total_igst_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN total_tds_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN net_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN idempotency_key TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN version INTEGER DEFAULT 1",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN currency TEXT DEFAULT 'INR'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expense_invoices ADD COLUMN invoice_number TEXT",
        [],
    );

    // Add paise-based columns to expenses table
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN cgst_rate INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN sgst_rate INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN igst_rate INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN tds_rate INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN cgst_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN sgst_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN igst_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN tds_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN total_amount_paise INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE expenses ADD COLUMN net_amount_paise INTEGER DEFAULT 0",
        [],
    );

    // Migration: Update existing expense_invoices to have proper tax totals and handle NULL values
    let _ = conn.execute("
        UPDATE expense_invoices 
        SET total_amount = COALESCE(total_amount, 0.00),
            total_cgst_amount = COALESCE((
                SELECT SUM(COALESCE(cgst_amount, 0.00)) 
                FROM expenses 
                WHERE expense_invoice_id = expense_invoices.id
            ), 0.00),
            total_sgst_amount = COALESCE((
                SELECT SUM(COALESCE(sgst_amount, 0.00)) 
                FROM expenses 
                WHERE expense_invoice_id = expense_invoices.id
            ), 0.00),
            total_igst_amount = COALESCE((
                SELECT SUM(COALESCE(igst_amount, 0.00)) 
                FROM expenses 
                WHERE expense_invoice_id = expense_invoices.id
            ), 0.00)
        WHERE total_amount IS NULL OR total_cgst_amount IS NULL OR total_sgst_amount IS NULL OR total_igst_amount IS NULL
    ", []);

    // Migration: Ensure all expense_invoices have valid total_amount values
    // This handles the case where the NOT NULL constraint is violated
    let _ = conn.execute(
        "
        UPDATE expense_invoices 
        SET total_amount = 0.00
        WHERE total_amount IS NULL
    ",
        [],
    );

    // Migration: Populate missing data in existing expenses records and handle NULL values
    let _ = conn.execute("
        UPDATE expenses 
        SET shipment_id = COALESCE(shipment_id, (
            SELECT shipment_id 
            FROM expense_invoices 
            WHERE expense_invoices.id = expenses.expense_invoice_id
        )),
        service_provider_id = COALESCE(service_provider_id, (
            SELECT service_provider_id 
            FROM expense_invoices 
            WHERE expense_invoices.id = expenses.expense_invoice_id
        )),
        invoice_no = COALESCE(invoice_no, (
            SELECT invoice_no 
            FROM expense_invoices 
            WHERE expense_invoices.id = expenses.expense_invoice_id
        )),
        invoice_date = COALESCE(invoice_date, (
            SELECT invoice_date 
            FROM expense_invoices 
            WHERE expense_invoices.id = expenses.expense_invoice_id
        )),
        amount = COALESCE(amount, 0.00),
        cgst_amount = COALESCE(cgst_amount, 0.00),
        sgst_amount = COALESCE(sgst_amount, 0.00),
        igst_amount = COALESCE(igst_amount, 0.00),
        tds_amount = COALESCE(tds_amount, 0.00),
        total_amount = COALESCE(total_amount, 0.00),
        net_amount = COALESCE(net_amount, 0.00)
        WHERE shipment_id IS NULL OR service_provider_id IS NULL OR invoice_no IS NULL OR invoice_date IS NULL
           OR amount IS NULL OR cgst_amount IS NULL OR sgst_amount IS NULL OR igst_amount IS NULL 
           OR tds_amount IS NULL OR total_amount IS NULL OR net_amount IS NULL
    ", []);

    // Migration: Populate paise-based columns from existing decimal columns
    let _ = conn.execute(
        "
        UPDATE expense_invoices 
        SET total_amount_paise = CASE 
            WHEN total_amount IS NOT NULL THEN CAST(total_amount * 100 AS INTEGER)
            ELSE 0
        END,
        total_cgst_amount_paise = CASE 
            WHEN total_cgst_amount IS NOT NULL THEN CAST(total_cgst_amount * 100 AS INTEGER)
            ELSE 0
        END,
        total_sgst_amount_paise = CASE 
            WHEN total_sgst_amount IS NOT NULL THEN CAST(total_sgst_amount * 100 AS INTEGER)
            ELSE 0
        END,
        total_igst_amount_paise = CASE 
            WHEN total_igst_amount IS NOT NULL THEN CAST(total_igst_amount * 100 AS INTEGER)
            ELSE 0
        END,
        total_tds_amount_paise = 0,
        net_amount_paise = CASE 
            WHEN total_amount IS NOT NULL THEN CAST(total_amount * 100 AS INTEGER)
            ELSE 0
        END,
        invoice_number = COALESCE(invoice_no, '')
        WHERE total_amount_paise IS NULL
    ",
        [],
    );

    let _ = conn.execute(
        "
        UPDATE expenses 
        SET amount_paise = CASE 
            WHEN amount IS NOT NULL THEN CAST(amount * 100 AS INTEGER)
            ELSE 0
        END,
        cgst_rate = CASE 
            WHEN cgst_rate IS NOT NULL THEN CAST(cgst_rate * 100 AS INTEGER)
            ELSE 0
        END,
        sgst_rate = CASE 
            WHEN sgst_rate IS NOT NULL THEN CAST(sgst_rate * 100 AS INTEGER)
            ELSE 0
        END,
        igst_rate = CASE 
            WHEN igst_rate IS NOT NULL THEN CAST(igst_rate * 100 AS INTEGER)
            ELSE 0
        END,
        tds_rate = CASE 
            WHEN tds_rate IS NOT NULL THEN CAST(tds_rate * 100 AS INTEGER)
            ELSE 0
        END,
        cgst_amount_paise = CASE 
            WHEN cgst_amount IS NOT NULL THEN CAST(cgst_amount * 100 AS INTEGER)
            ELSE 0
        END,
        sgst_amount_paise = CASE 
            WHEN sgst_amount IS NOT NULL THEN CAST(sgst_amount * 100 AS INTEGER)
            ELSE 0
        END,
        igst_amount_paise = CASE 
            WHEN igst_amount IS NOT NULL THEN CAST(igst_amount * 100 AS INTEGER)
            ELSE 0
        END,
        tds_amount_paise = CASE 
            WHEN tds_amount IS NOT NULL THEN CAST(tds_amount * 100 AS INTEGER)
            ELSE 0
        END,
        total_amount_paise = CASE 
            WHEN total_amount IS NOT NULL THEN CAST(total_amount * 100 AS INTEGER)
            ELSE 0
        END,
        net_amount_paise = CASE 
            WHEN net_amount IS NOT NULL THEN CAST(net_amount * 100 AS INTEGER)
            ELSE 0
        END
        WHERE amount_paise IS NULL
    ",
        [],
    );

    // Migration: Populate basis points rate columns in expense_types table
    let _ = conn.execute(
        "
        UPDATE expense_types 
        SET default_cgst_rate_bp = CASE 
            WHEN default_cgst_rate IS NOT NULL THEN CAST(default_cgst_rate * 100 AS INTEGER)
            ELSE 0
        END,
        default_sgst_rate_bp = CASE 
            WHEN default_sgst_rate IS NOT NULL THEN CAST(default_sgst_rate * 100 AS INTEGER)
            ELSE 0
        END,
        default_igst_rate_bp = CASE 
            WHEN default_igst_rate IS NOT NULL THEN CAST(default_igst_rate * 100 AS INTEGER)
            ELSE 0
        END,
        default_tds_rate_bp = CASE 
            WHEN default_tds_rate IS NOT NULL THEN CAST(default_tds_rate * 100 AS INTEGER)
            ELSE 0
        END
        WHERE default_cgst_rate_bp IS NULL
    ",
        [],
    );

    // ----------------------------------------------------------------------------
    // Report View: source from boe_calculations (JSON results) joined to invoices
    // ----------------------------------------------------------------------------
    // We recreate the view at startup to ensure it stays up-to-date with schema changes
    let _ = conn.execute("DROP VIEW IF EXISTS report_view", []);

    conn.execute(
        r#"
        CREATE VIEW IF NOT EXISTS report_view AS
        WITH 
        boe_items AS (
            SELECT
                bc.id AS boe_calc_id,
                bc.shipment_id,
                bc.supplier_name,
                bc.invoice_number,
                json_extract(item.value, '$.partNo') AS part_no,
                json_extract(item.value, '$.description') AS boe_description,
                CAST(json_extract(item.value, '$.assessableValue') AS REAL) AS boe_assessable_value,
                CAST(json_extract(item.value, '$.bcdValue') AS REAL) AS boe_bcd_amount,
                CAST(json_extract(item.value, '$.swsValue') AS REAL) AS boe_sws_amount,
                CAST(json_extract(item.value, '$.igstValue') AS REAL) AS boe_igst_amount
            FROM boe_calculations bc
            JOIN json_each(json_extract(bc.calculation_result_json, '$.calculatedItems')) AS item
        ),
        shipment_expenses AS (
            SELECT ei.shipment_id, 
                   SUM(e.amount) AS shipment_expenses_basic,
                   SUM(e.total_amount) AS shipment_expenses_total
            FROM expense_invoices ei
            JOIN expenses e ON e.expense_invoice_id = ei.id
            GROUP BY ei.shipment_id
        ),
        boe_assessable AS (
            SELECT shipment_id, SUM(boe_assessable_value) AS shipment_boe_assessable_total
            FROM boe_items
            GROUP BY shipment_id
        )
        SELECT 
            sup.supplier_name AS supplier,
            s.supplier_id AS supplier_id,
            s.invoice_number AS invoice_no,
            s.invoice_date AS invoice_date,
            bi.part_no AS part_no,
            COALESCE(i.item_description, bi.boe_description) AS description,
            i.unit AS unit,
            ili.quantity AS qty,
            ili.unit_price AS unit_price,
            bi.boe_assessable_value AS assessable_value,
            bi.boe_bcd_amount AS bcd_amount,
            bi.boe_sws_amount AS sws_amount,
            bi.boe_igst_amount AS igst_amount,
            -- Expense allocation proportional by BOE assessable value per shipment (BASIC VALUE - excluding GST)
            COALESCE(se.shipment_expenses_basic, 0.0) * 
              (bi.boe_assessable_value / NULLIF(ba.shipment_boe_assessable_total, 0)) AS expenses_total,
            -- LDC per qty: (assessable + bcd + sws + expenses_basic) / qty
            (
              (bi.boe_assessable_value + bi.boe_bcd_amount + bi.boe_sws_amount
               + (COALESCE(se.shipment_expenses_basic, 0.0) * (bi.boe_assessable_value / NULLIF(ba.shipment_boe_assessable_total, 0))))
            ) / NULLIF(ili.quantity, 0) AS ldc_per_qty
        FROM boe_items bi
        JOIN shipments s ON s.id = bi.shipment_id
        JOIN suppliers sup ON sup.id = s.supplier_id
        JOIN invoices inv ON inv.shipment_id = s.id
        JOIN items i ON i.part_number = bi.part_no
        JOIN invoice_line_items ili ON ili.invoice_id = inv.id AND ili.item_id = i.id
        LEFT JOIN shipment_expenses se ON se.shipment_id = s.id
        LEFT JOIN boe_assessable ba ON ba.shipment_id = s.id;
        "#,
        [],
    )?;

    // Insert sample data if the suppliers table is empty
    let supplier_count: i32 =
        conn.query_row("SELECT COUNT(*) FROM suppliers", [], |row| row.get(0))?;

    if supplier_count == 0 {
        // Insert sample suppliers
        let sample_suppliers = vec![
            (
                "Sup-001",
                "Clean and Science Co.Ltd Korea",
                "CSC Korea",
                "S.Korea",
                "Clean and Science@gmail.com",
                "123456789",
                "Clean and Science Co.Ltd Korea",
                "Korea Exchange Bank",
                "Seoul Main Branch",
                "123 Seoul Street, Seoul, Korea",
                "1234567890",
                "KOEXKRSE",
                "KOEXKRSE",
                true,
            ),
            (
                "Sup-002",
                "CNF Co., LTD.",
                "CNF",
                "Czech Republic",
                "cnf@gmail.com",
                "123456789",
                "CNF Co., LTD.",
                "Ceska Narodni Banka",
                "Prague Branch",
                "456 Prague Avenue, Prague, Czech Republic",
                "0987654321",
                "CZEKCNB",
                "CZEKCNB",
                true,
            ),
            (
                "Sup-003",
                "CTS CZECH REPUBLIC",
                "CTS",
                "Czech Republic",
                "cts@gmail.com",
                "123456789",
                "CTS CZECH REPUBLIC",
                "Ceska Narodni Banka",
                "Brno Branch",
                "789 Brno Street, Brno, Czech Republic",
                "1122334455",
                "CZEKCNB",
                "CZEKCNB",
                true,
            ),
            (
                "Sup-004",
                "DUCI SARL",
                "DUCI",
                "France",
                "duci@gmail.com",
                "123456789",
                "DUCI SARL",
                "Banque de France",
                "Paris Branch",
                "321 Paris Boulevard, Paris, France",
                "5544332211",
                "FRBNFRPP",
                "FRBNFRPP",
                true,
            ),
            (
                "Sup-005",
                "DY ELACEN CO LTD",
                "DY ELACEN",
                "France",
                "dyelacen@gmail.com",
                "123456789",
                "DY ELACEN CO LTD",
                "Credit Agricole",
                "Lyon Branch",
                "654 Lyon Street, Lyon, France",
                "6677889900",
                "CRLYFRPP",
                "CRLYFRPP",
                true,
            ),
            (
                "Sup-006",
                "DY ELACEN CO LTD - VIETNAM",
                "DY ELACEN VN",
                "Vietnam",
                "dyelacenvn@gmail.com",
                "123456789",
                "DY ELACEN CO LTD - VIETNAM",
                "Vietcombank",
                "Ho Chi Minh Branch",
                "987 Ho Chi Minh Avenue, Ho Chi Minh, Vietnam",
                "7788990011",
                "VNVTCBVX",
                "VNVTCBVX",
                true,
            ),
            (
                "Sup-007",
                "EARTH PANDA ADVANCE MAGNETIC",
                "Earth Panda",
                "China",
                "earthpanda@gmail.com",
                "123456789",
                "EARTH PANDA ADVANCE MAGNETIC",
                "Bank of China",
                "Shanghai Branch",
                "147 Shanghai Road, Shanghai, China",
                "8899001122",
                "CNBKCNBJ",
                "CNBKCNBJ",
                true,
            ),
            (
                "Sup-008",
                "EFFBE FRANCE SAS HABSHEIM - FRANCE",
                "EFFBE",
                "France",
                "effbe@gmail.com",
                "123456789",
                "EFFBE FRANCE SAS HABSHEIM - FRANCE",
                "BNP Paribas",
                "Strasbourg Branch",
                "258 Strasbourg Street, Strasbourg, France",
                "9900112233",
                "BNPAFRPP",
                "BNPAFRPP",
                true,
            ),
            (
                "Sup-009",
                "Essence Fastening Systems (Shanghai) Co. Ltd.",
                "Essence",
                "China",
                "essence@gmail.com",
                "123456789",
                "Essence Fastening Systems (Shanghai) Co. Ltd.",
                "Industrial and Commercial Bank of China",
                "Shanghai Branch",
                "369 Shanghai Avenue, Shanghai, China",
                "0011223344",
                "ICBKCNBJ",
                "ICBKCNBJ",
                true,
            ),
            (
                "Sup-010",
                "FERGUSON LTD",
                "Ferguson",
                "UK",
                "ferguson@gmail.com",
                "123456789",
                "FERGUSON LTD",
                "Barclays Bank",
                "London Branch",
                "741 London Street, London, UK",
                "1122334455",
                "BARCGB22",
                "BARCGB22",
                true,
            ),
            (
                "Sup-011",
                "Fraenkidche Pipe-Systems(Shanghai) Co. Ltd",
                "Fraenkidche",
                "China",
                "fraenkidche@gmail.com",
                "123456789",
                "Fraenkidche Pipe-Systems(Shanghai) Co. Ltd",
                "China Construction Bank",
                "Shanghai Branch",
                "852 Shanghai Boulevard, Shanghai, China",
                "2233445566",
                "PCBCCNBJ",
                "PCBCCNBJ",
                true,
            ),
        ];

        for supplier in sample_suppliers {
            conn.execute(
                "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                rusqlite::params![
                    supplier.0, supplier.1, supplier.2, supplier.3, supplier.4, supplier.5,
                    supplier.6, supplier.7, supplier.8, supplier.9, supplier.10, supplier.11,
                    supplier.12, supplier.13
                ],
            )?;
        }
    }

    // Sample expense types removed - will be entered manually
    // let count: i32 = conn.query_row("SELECT COUNT(*) FROM expense_types", [], |row| row.get(0))?;
    // if count == 0 {
    //     // Sample data removed - expense types will be entered manually
    // }

    // Sample service providers removed - will be entered manually
    // let count: i32 = conn.query_row("SELECT COUNT(*) FROM service_providers", [], |row| row.get(0))?;
    // if count == 0 {
    //     // Sample data removed - service providers will be entered manually
    // }

    Ok(())
}
