use crate::db::{DbState, Supplier};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_suppliers(state: State<DbState>) -> Result<Vec<Supplier>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM suppliers")
        .map_err(|e| e.to_string())?;
    let supplier_iter = stmt
        .query_map([], |row| {
            let supplier = Supplier {
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
            };

            Ok(supplier)
        })
        .map_err(|e| e.to_string())?;

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
pub fn add_suppliers_bulk(state: State<DbState>, suppliers: Vec<Supplier>) -> Result<(), String> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for supplier in suppliers {
        tx.execute(
            "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn check_supplier_exists(state: State<DbState>, supplier_id: String) -> Result<bool, String> {
    let conn = state.db.lock().unwrap();
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM suppliers WHERE id = ?",
            params![supplier_id],
            |row| Ok(row.get::<_, i64>(0)? > 0),
        )
        .map_err(|e| e.to_string())?;

    Ok(exists)
}
