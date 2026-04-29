use crate::db::{DbState, Supplier};
use rusqlite::params;
use std::time::Instant;
use tauri::State;

#[tauri::command]
pub fn get_suppliers(
    state: State<DbState>,
    limit: Option<i64>,
    offset: Option<i64>,
    search_text: Option<String>,
) -> Result<Vec<Supplier>, String> {
    let started = Instant::now();
    let conn = state.db.lock().unwrap();
    let base_query = "SELECT
            id,
            supplier_name,
            country,
            email,
            phone,
            is_active
         FROM suppliers
         WHERE deleted_at IS NULL";

    let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<Supplier> {
        let supplier = Supplier {
            id: row.get(0)?,
            supplier_name: row.get(1)?,
            short_name: None,
            country: row.get(2)?,
            email: row.get(3)?,
            phone: row.get(4)?,
            beneficiary_name: None,
            bank_name: None,
            branch: None,
            bank_address: None,
            account_no: None,
            iban: None,
            swift_code: None,
            is_active: row.get(5)?,
        };
        Ok(supplier)
    };

    let trimmed_search = search_text
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let search_was_applied = trimmed_search.is_some();

    let mut suppliers = Vec::new();
    if let Some(search_value) = trimmed_search {
        if let Some(limit_value) = limit {
            let offset_value = offset.unwrap_or(0);
            let query = format!(
                "{base_query}
                 AND supplier_name LIKE ?1 || '%'
                 COLLATE NOCASE
                 ORDER BY supplier_name COLLATE NOCASE ASC
                 LIMIT ?2 OFFSET ?3"
            );
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
            let supplier_iter = stmt
                .query_map(params![search_value, limit_value, offset_value], map_row)
                .map_err(|e| e.to_string())?;

            for supplier in supplier_iter {
                suppliers.push(supplier.map_err(|e| e.to_string())?);
            }
        } else {
            let query = format!(
                "{base_query}
                 AND supplier_name LIKE ?1 || '%'
                 COLLATE NOCASE
                 ORDER BY supplier_name COLLATE NOCASE ASC"
            );
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
            let supplier_iter = stmt
                .query_map(params![search_value], map_row)
                .map_err(|e| e.to_string())?;

            for supplier in supplier_iter {
                suppliers.push(supplier.map_err(|e| e.to_string())?);
            }
        }
    } else {
        if let Some(limit_value) = limit {
            let offset_value = offset.unwrap_or(0);
            let query = format!(
                "{base_query}
                 ORDER BY supplier_name COLLATE NOCASE ASC
                 LIMIT ?1 OFFSET ?2"
            );
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
            let supplier_iter = stmt
                .query_map(params![limit_value, offset_value], map_row)
                .map_err(|e| e.to_string())?;

            for supplier in supplier_iter {
                suppliers.push(supplier.map_err(|e| e.to_string())?);
            }
        } else {
            let query = format!("{base_query} ORDER BY supplier_name COLLATE NOCASE ASC");
            let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
            let supplier_iter = stmt.query_map([], map_row).map_err(|e| e.to_string())?;

            for supplier in supplier_iter {
                suppliers.push(supplier.map_err(|e| e.to_string())?);
            }
        }
    }

    let elapsed_ms = started.elapsed().as_millis();
    if search_was_applied {
        log::info!(
            target: "import_manager::suppliers",
            "supplier_search execution time: {} ms",
            elapsed_ms
        );
    } else {
        log::info!(
            target: "import_manager::suppliers",
            "get_suppliers execution time: {} ms",
            elapsed_ms
        );
    }
    Ok(suppliers)
}

#[tauri::command]
pub fn get_suppliers_count(
    state: State<DbState>,
    search_text: Option<String>,
) -> Result<i64, String> {
    let conn = state.db.lock().unwrap();
    let base_query = "SELECT COUNT(*) FROM suppliers WHERE deleted_at IS NULL";

    let trimmed_search = search_text
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    if let Some(search_value) = trimmed_search {
        let query = format!(
            "{base_query}
             AND supplier_name LIKE ?1 || '%'
             COLLATE NOCASE"
        );
        let count = conn
            .query_row(&query, params![search_value], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(count)
    } else {
        let count = conn
            .query_row(base_query, [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(count)
    }
}

#[tauri::command]
pub fn get_deleted_suppliers(state: State<DbState>) -> Result<Vec<Supplier>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT
                id,
                supplier_name,
                short_name,
                country,
                email,
                phone,
                beneficiary_name,
                bank_name,
                branch,
                bank_address,
                account_no,
                iban,
                swift_code,
                is_active
             FROM suppliers
             WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC",
        )
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
pub fn generate_supplier_id(state: State<DbState>) -> Result<String, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let max_id: Option<i64> = {
        let mut stmt = tx
            .prepare(
                "
                SELECT MAX(
                    CAST(
                        SUBSTR(id, 5) AS INTEGER
                    )
                )
                FROM suppliers
                ",
            )
            .map_err(|e| e.to_string())?;

        stmt.query_row([], |row| row.get(0)).unwrap_or(None)
    };

    let next = max_id.unwrap_or(0) + 1;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!("Sup-{:03}", next))
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
pub fn add_suppliers_bulk(state: State<DbState>, suppliers: Vec<Supplier>) -> Result<usize, String> {
    let started = Instant::now();
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut count = 0usize;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO suppliers (
                    id,
                    supplier_name,
                    short_name,
                    country,
                    email,
                    phone,
                    beneficiary_name,
                    bank_name,
                    branch,
                    bank_address,
                    account_no,
                    iban,
                    swift_code,
                    is_active
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            )
            .map_err(|e| e.to_string())?;

        for supplier in suppliers {
            stmt.execute(
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
            )
            .map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::suppliers",
        "supplier_bulk_import execution time: {} ms (inserted: {})",
        started.elapsed().as_millis(),
        count
    );
    Ok(count)
}

#[tauri::command]
pub fn delete_supplier(state: State<DbState>, supplier_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let linked_shipments: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments WHERE supplier_id = ?1",
            params![supplier_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if linked_shipments > 0 {
        return Err("Supplier used in shipments — cannot delete".to_string());
    }

    conn.execute(
        "
        UPDATE suppliers
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?1
        ",
        params![supplier_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn restore_supplier(state: State<DbState>, supplier_id: String) -> Result<(), String> {
    let started = Instant::now();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "
        UPDATE suppliers
        SET deleted_at = NULL
        WHERE id = ?1 AND deleted_at IS NOT NULL
        ",
        params![supplier_id],
    )
    .map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::suppliers",
        "supplier_restore execution time: {} ms",
        started.elapsed().as_millis()
    );
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
