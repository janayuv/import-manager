// In src-tauri/src/commands.rs

use crate::db::{DbState, Supplier, Shipment}; 
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_suppliers(state: State<DbState>) -> Result<Vec<Supplier>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM suppliers").map_err(|e| e.to_string())?;
    let supplier_iter = stmt.query_map([], |row| {
        Ok(Supplier {
            id: row.get(0)?,
            supplier_name: row.get(1)?,
            short_name: row.get(2)?,
            country: row.get(3)?,
            email: row.get(4)?,
            phone: row.get(5)?,
            beneficiary_name: row.get(6)?,
            bank_name: row.get(7)?,
            branch: row.get(8)?,
            bank_address: row.get(9)?,
            account_no: row.get(10)?,
            iban: row.get(11)?,
            swift_code: row.get(12)?,
            is_active: row.get(13)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut suppliers = Vec::new();
    for supplier in supplier_iter {
        suppliers.push(supplier.map_err(|e| e.to_string())?);
    }
    Ok(suppliers)
}

#[tauri::command]
pub fn add_supplier(state: State<DbState>, supplier: Supplier) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            supplier.id,
            supplier.supplier_name,
            supplier.short_name,
            supplier.country,
            supplier.email,
            supplier.phone,
            supplier.beneficiary_name,
            supplier.bank_name,
            supplier.branch,
            supplier.bank_address,
            supplier.account_no,
            supplier.iban,
            supplier.swift_code,
            supplier.is_active,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_supplier(state: State<DbState>, supplier: Supplier) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE suppliers SET supplier_name = ?2, short_name = ?3, country = ?4, email = ?5, phone = ?6, beneficiary_name = ?7, bank_name = ?8, branch = ?9, bank_address = ?10, account_no = ?11, iban = ?12, swift_code = ?13, is_active = ?14 WHERE id = ?1",
        params![
            supplier.id,
            supplier.supplier_name,
            supplier.short_name,
            supplier.country,
            supplier.email,
            supplier.phone,
            supplier.beneficiary_name,
            supplier.bank_name,
            supplier.branch,
            supplier.bank_address,
            supplier.account_no,
            supplier.iban,
            supplier.swift_code,
            supplier.is_active,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM shipments").map_err(|e| e.to_string())?;
    let shipment_iter = stmt.query_map([], |row| {
        Ok(Shipment {
            id: row.get(0)?, supplier_id: row.get(1)?, invoice_number: row.get(2)?,
            invoice_date: row.get(3)?, goods_category: row.get(4)?, invoice_value: row.get(5)?,
            invoice_currency: row.get(6)?, incoterm: row.get(7)?, shipment_mode: row.get(8)?,
            shipment_type: row.get(9)?, bl_awb_number: row.get(10)?, bl_awb_date: row.get(11)?,
            vessel_name: row.get(12)?, container_number: row.get(13)?, gross_weight_kg: row.get(14)?,
            etd: row.get(15)?, eta: row.get(16)?, status: row.get(17)?,
            date_of_delivery: row.get(18)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut shipments = Vec::new();
    for shipment in shipment_iter {
        shipments.push(shipment.map_err(|e| e.to_string())?);
    }
    Ok(shipments)
}

#[tauri::command]
pub fn add_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![
            shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
            shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
            shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
            shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
            shipment.container_number, shipment.gross_weight_kg, shipment.etd,
            shipment.eta, shipment.status, shipment.date_of_delivery,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE shipments SET supplier_id = ?2, invoice_number = ?3, invoice_date = ?4, goods_category = ?5, invoice_value = ?6, invoice_currency = ?7, incoterm = ?8, shipment_mode = ?9, shipment_type = ?10, bl_awb_number = ?11, bl_awb_date = ?12, vessel_name = ?13, container_number = ?14, gross_weight_kg = ?15, etd = ?16, eta = ?17, status = ?18, date_of_delivery = ?19 WHERE id = ?1",
        params![
            shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
            shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
            shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
            shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
            shipment.container_number, shipment.gross_weight_kg, shipment.etd,
            shipment.eta, shipment.status, shipment.date_of_delivery,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}