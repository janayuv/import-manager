use crate::commands::dashboard_cache;
use crate::DbState;
use crate::Shipment;
use rusqlite::{params, Connection};
use std::time::Instant;
use tauri::State;

#[tauri::command]
pub fn get_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, supplier_id, invoice_number, invoice_date, goods_category, 
            invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, 
            bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, 
            etd, eta, status, date_of_delivery, is_frozen 
            FROM shipments ORDER BY invoice_date DESC",
        )
        .map_err(|e| e.to_string())?;

    let shipment_iter = stmt
        .query_map([], |row| {
            Ok(Shipment {
                id: row.get(0)?,
                supplier_id: row.get(1)?,
                invoice_number: row.get(2)?,
                invoice_date: row.get(3)?,
                goods_category: row.get(4)?,
                invoice_value: row.get(5)?,
                invoice_currency: row.get(6)?,
                incoterm: row.get(7)?,
                shipment_mode: row.get(8)?,
                shipment_type: row.get(9)?,
                bl_awb_number: row.get(10)?,
                bl_awb_date: row.get(11)?,
                vessel_name: row.get(12)?,
                container_number: row.get(13)?,
                gross_weight_kg: row.get(14)?,
                etd: row.get(15)?,
                eta: row.get(16)?,
                status: row.get(17)?,
                date_of_delivery: row.get(18)?,
                is_frozen: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut shipments = Vec::new();
    for shipment in shipment_iter {
        shipments.push(shipment.map_err(|e| e.to_string())?);
    }

    Ok(shipments)
}

#[tauri::command]
#[allow(dead_code)]
pub fn get_shipment_by_id(state: State<DbState>, id: String) -> Result<Option<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, supplier_id, invoice_number, invoice_date, goods_category, 
            invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, 
            bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, 
            etd, eta, status, date_of_delivery, is_frozen 
            FROM shipments WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let shipment_result = stmt.query_row([id], |row| {
        Ok(Shipment {
            id: row.get(0)?,
            supplier_id: row.get(1)?,
            invoice_number: row.get(2)?,
            invoice_date: row.get(3)?,
            goods_category: row.get(4)?,
            invoice_value: row.get(5)?,
            invoice_currency: row.get(6)?,
            incoterm: row.get(7)?,
            shipment_mode: row.get(8)?,
            shipment_type: row.get(9)?,
            bl_awb_number: row.get(10)?,
            bl_awb_date: row.get(11)?,
            vessel_name: row.get(12)?,
            container_number: row.get(13)?,
            gross_weight_kg: row.get(14)?,
            etd: row.get(15)?,
            eta: row.get(16)?,
            status: row.get(17)?,
            date_of_delivery: row.get(18)?,
            is_frozen: row.get(19)?,
        })
    });

    match shipment_result {
        Ok(shipment) => Ok(Some(shipment)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn add_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    // Set initial status to "docs-rcvd" if not provided
    let initial_status = shipment.status.as_deref().unwrap_or("docs-rcvd");

    conn.execute(
        "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery, is_frozen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        params![
            shipment.id,
            shipment.supplier_id,
            shipment.invoice_number,
            shipment.invoice_date,
            shipment.goods_category,
            shipment.invoice_value,
            shipment.invoice_currency,
            shipment.incoterm,
            shipment.shipment_mode,
            shipment.shipment_type,
            shipment.bl_awb_number,
            shipment.bl_awb_date,
            shipment.vessel_name,
            shipment.container_number,
            shipment.gross_weight_kg,
            shipment.etd,
            shipment.eta,
            initial_status,
            shipment.date_of_delivery,
            shipment.is_frozen,
        ],
    )
    .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn update_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE shipments SET supplier_id = ?2, invoice_number = ?3, invoice_date = ?4, goods_category = ?5, invoice_value = ?6, invoice_currency = ?7, incoterm = ?8, shipment_mode = ?9, shipment_type = ?10, bl_awb_number = ?11, bl_awb_date = ?12, vessel_name = ?13, container_number = ?14, gross_weight_kg = ?15, etd = ?16, eta = ?17, status = ?18, date_of_delivery = ?19, is_frozen = ?20 WHERE id = ?1",
        params![
            shipment.id,
            shipment.supplier_id,
            shipment.invoice_number,
            shipment.invoice_date,
            shipment.goods_category,
            shipment.invoice_value,
            shipment.invoice_currency,
            shipment.incoterm,
            shipment.shipment_mode,
            shipment.shipment_type,
            shipment.bl_awb_number,
            shipment.bl_awb_date,
            shipment.vessel_name,
            shipment.container_number,
            shipment.gross_weight_kg,
            shipment.etd,
            shipment.eta,
            shipment.status,
            shipment.date_of_delivery,
            shipment.is_frozen,
        ],
    )
    .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
#[allow(dead_code)]
pub fn delete_shipment(state: State<DbState>, id: String) -> Result<(), String> {
    let _trace = crate::commands::reference_scan::HardDeleteFnLogGuard::new(
        "delete_shipment",
        "shipments",
        &id,
        "n/a",
    );
    let mut conn = state.db.lock().unwrap();
    crate::commands::reference_scan::log_hard_delete_fk_cascade_impact(&conn, "shipments")
        .map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::hard_delete",
        "[HARD_DELETE] Begin transaction"
    );
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    crate::commands::reference_scan::delete_fk_dependent_children(&tx, "shipments", &[id.clone()])?;
    let exec_started = std::time::Instant::now();
    tx.execute("DELETE FROM shipments WHERE id = ?1", params![id.as_str()])
        .map_err(|e| e.to_string())?;
    let exec_ms = exec_started.elapsed().as_millis();
    if exec_ms > 500 {
        log::warn!(
            target: "import_manager::hard_delete",
            "[HARD_DELETE WARNING] Slow DELETE for ID={} took {} ms",
            id,
            exec_ms
        );
    }
    tx.commit().map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::hard_delete",
        "[HARD_DELETE] Commit transaction"
    );

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn update_shipment_status_on_invoice_add(
    state: State<DbState>,
    shipment_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    // Only update if current status is not "delivered"
    conn.execute(
        "UPDATE shipments SET status = 'in-transit' WHERE id = ?1 AND status != 'delivered'",
        params![shipment_id],
    )
    .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn update_shipment_status_on_boe_add(
    state: State<DbState>,
    shipment_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    // Only update if current status is not "delivered"
    conn.execute(
        "UPDATE shipments SET status = 'customs-clearance' WHERE id = ?1 AND status != 'delivered'",
        params![shipment_id],
    )
    .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn check_and_update_ready_for_delivery(state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    // Get current date
    let today = chrono::Utc::now().date_naive();

    // Update shipments to "ready-dly" if:
    // 1. They have BOE entries with dates
    // 2. BOE date + 7 days <= today
    // 3. Current status is not "delivered"
    let sql = "
        UPDATE shipments 
        SET status = 'ready-dly'
        WHERE id IN (
            SELECT DISTINCT s.id 
            FROM shipments s
            INNER JOIN boe_details bd ON s.id = bd.shipment_id
            WHERE s.status != 'delivered'
              AND bd.be_date IS NOT NULL
              AND date(bd.be_date, '+7 days') <= date(?1)
        )
    ";

    conn.execute(sql, params![today.to_string()])
        .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn migrate_shipment_statuses(state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    // Update legacy status values to new standardized values
    conn.execute(
        "UPDATE shipments SET status = 'docs-rcvd' WHERE status = 'docu-received'",
        [],
    )
    .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn get_active_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, supplier_id, invoice_number, invoice_date, goods_category, 
            invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, 
            bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, 
            etd, eta, status, date_of_delivery, is_frozen 
            FROM shipments WHERE is_frozen = 0 ORDER BY invoice_date DESC",
        )
        .map_err(|e| e.to_string())?;

    let shipment_iter = stmt
        .query_map([], |row| {
            Ok(Shipment {
                id: row.get(0)?,
                supplier_id: row.get(1)?,
                invoice_number: row.get(2)?,
                invoice_date: row.get(3)?,
                goods_category: row.get(4)?,
                invoice_value: row.get(5)?,
                invoice_currency: row.get(6)?,
                incoterm: row.get(7)?,
                shipment_mode: row.get(8)?,
                shipment_type: row.get(9)?,
                bl_awb_number: row.get(10)?,
                bl_awb_date: row.get(11)?,
                vessel_name: row.get(12)?,
                container_number: row.get(13)?,
                gross_weight_kg: row.get(14)?,
                etd: row.get(15)?,
                eta: row.get(16)?,
                status: row.get(17)?,
                date_of_delivery: row.get(18)?,
                is_frozen: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut shipments = Vec::new();
    for shipment in shipment_iter {
        shipments.push(shipment.map_err(|e| e.to_string())?);
    }

    Ok(shipments)
}

#[tauri::command]
pub fn add_shipments_bulk(state: State<DbState>, shipments: Vec<Shipment>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    for shipment in shipments {
        conn.execute(
            "INSERT INTO shipments (
                id, supplier_id, invoice_number, invoice_date, goods_category, 
                invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, 
                bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, 
                etd, eta, status, date_of_delivery, is_frozen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                shipment.id,
                shipment.supplier_id,
                shipment.invoice_number,
                shipment.invoice_date,
                shipment.goods_category,
                shipment.invoice_value,
                shipment.invoice_currency,
                shipment.incoterm,
                shipment.shipment_mode,
                shipment.shipment_type,
                shipment.bl_awb_number,
                shipment.bl_awb_date,
                shipment.vessel_name,
                shipment.container_number,
                shipment.gross_weight_kg,
                shipment.etd,
                shipment.eta,
                shipment.status,
                shipment.date_of_delivery,
                shipment.is_frozen,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn get_unfinalized_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let shipments = fetch_unfinalized_shipments(&conn)?;
    println!("get_unfinalized_shipments found {} available shipments", shipments.len());
    Ok(shipments)
}

fn fetch_unfinalized_shipments(conn: &Connection) -> Result<Vec<Shipment>, String> {
    let start = Instant::now();
    // We want shipments that:
    // 1. Are not frozen (is_frozen = 0)
    // 2. Are not in a terminal status (delivered, cancelled, finalized, closed)
    // 3. DO NOT have an associated invoice yet
    let query_sql = "SELECT s.id, s.supplier_id, s.invoice_number, s.invoice_date, s.goods_category, 
            s.invoice_value, s.invoice_currency, s.incoterm, s.shipment_mode, s.shipment_type, 
            s.bl_awb_number, s.bl_awb_date, s.vessel_name, s.container_number, s.gross_weight_kg, 
            s.etd, s.eta, s.status, s.date_of_delivery, s.is_frozen 
            FROM shipments s
            LEFT JOIN invoices i ON s.id = i.shipment_id
            WHERE s.is_frozen = 0 
            AND i.id IS NULL
            AND s.status NOT IN ('delivered', 'cancelled', 'finalized', 'closed', 'completed')
            ORDER BY s.invoice_date DESC";

    if cfg!(debug_assertions) {
        let explain_sql = format!("EXPLAIN QUERY PLAN {query_sql}");
        let mut explain_stmt = conn.prepare(&explain_sql).map_err(|e| e.to_string())?;
        let rows = explain_stmt
            .query_map([], |row| {
                let detail: String = row.get(3)?;
                Ok(detail)
            })
            .map_err(|e| e.to_string())?;

        println!("Shipment Query Planner Output:");
        for row in rows {
            println!("{:?}", row.map_err(|e| e.to_string())?);
        }
    }

    let mut stmt = conn
        .prepare(query_sql)
        .map_err(|e| e.to_string())?;

    let shipment_iter = stmt
        .query_map([], |row| {
            Ok(Shipment {
                id: row.get(0)?,
                supplier_id: row.get(1)?,
                invoice_number: row.get(2)?,
                invoice_date: row.get(3)?,
                goods_category: row.get(4)?,
                invoice_value: row.get(5)?,
                invoice_currency: row.get(6)?,
                incoterm: row.get(7)?,
                shipment_mode: row.get(8)?,
                shipment_type: row.get(9)?,
                bl_awb_number: row.get(10)?,
                bl_awb_date: row.get(11)?,
                vessel_name: row.get(12)?,
                container_number: row.get(13)?,
                gross_weight_kg: row.get(14)?,
                etd: row.get(15)?,
                eta: row.get(16)?,
                status: row.get(17)?,
                date_of_delivery: row.get(18)?,
                is_frozen: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut shipments = Vec::new();
    for shipment in shipment_iter {
        shipments.push(shipment.map_err(|e| e.to_string())?);
    }

    println!("fetch_unfinalized_shipments time: {:?}", start.elapsed());

    Ok(shipments)
}

#[tauri::command]
pub fn freeze_shipment(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE shipments SET is_frozen = 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn update_shipment_status(
    state: State<DbState>,
    id: String,
    status: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE shipments SET status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);

    Ok(())
}

#[tauri::command]
pub fn validate_shipment_import(shipments: Vec<Shipment>) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();

    for (index, shipment) in shipments.iter().enumerate() {
        if shipment.invoice_number.is_empty() {
            errors.push(format!("Row {}: Invoice number is required", index + 1));
        }
        if shipment.supplier_id.is_empty() {
            errors.push(format!("Row {}: Supplier ID is required", index + 1));
        }
        if shipment.invoice_date.is_empty() {
            errors.push(format!("Row {}: Invoice date is required", index + 1));
        }
        if shipment.invoice_value <= 0.0 {
            errors.push(format!(
                "Row {}: Invoice value must be greater than 0",
                index + 1
            ));
        }
    }

    Ok(errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE shipments (
                id TEXT PRIMARY KEY,
                supplier_id TEXT NOT NULL,
                invoice_number TEXT NOT NULL,
                invoice_date TEXT NOT NULL,
                goods_category TEXT NOT NULL,
                invoice_value REAL NOT NULL,
                invoice_currency TEXT NOT NULL,
                incoterm TEXT NOT NULL,
                shipment_mode TEXT,
                shipment_type TEXT,
                bl_awb_number TEXT,
                bl_awb_date TEXT,
                vessel_name TEXT,
                container_number TEXT,
                gross_weight_kg REAL,
                etd TEXT,
                eta TEXT,
                status TEXT,
                date_of_delivery TEXT,
                is_frozen BOOLEAN NOT NULL DEFAULT 0
            )",
            [],
        ).unwrap();

        conn.execute(
            "CREATE TABLE invoices (
                id TEXT PRIMARY KEY NOT NULL,
                shipment_id TEXT NOT NULL,
                status TEXT NOT NULL
            )",
            [],
        ).unwrap();

        conn
    }

    #[test]
    fn test_fetch_available_shipments() {
        let conn = setup_test_db();

        // 1. Available shipment
        conn.execute(
            "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, status, is_frozen)
             VALUES ('s1', 'sup1', 'INV-001', '2023-01-01', 'Category', 100.0, 'USD', 'EXW', 'docs-rcvd', 0)",
            [],
        ).unwrap();

        // 2. Frozen shipment (should be excluded)
        conn.execute(
            "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, status, is_frozen)
             VALUES ('s2', 'sup1', 'INV-002', '2023-01-01', 'Category', 100.0, 'USD', 'EXW', 'docs-rcvd', 1)",
            [],
        ).unwrap();

        // 3. Delivered shipment (should be excluded)
        conn.execute(
            "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, status, is_frozen)
             VALUES ('s3', 'sup1', 'INV-003', '2023-01-01', 'Category', 100.0, 'USD', 'EXW', 'delivered', 0)",
            [],
        ).unwrap();

        // 4. Shipment with invoice (should be excluded)
        conn.execute(
            "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, status, is_frozen)
             VALUES ('s4', 'sup1', 'INV-004', '2023-01-01', 'Category', 100.0, 'USD', 'EXW', 'docs-rcvd', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO invoices (id, shipment_id, status) VALUES ('inv1', 's4', 'Draft')",
            [],
        ).unwrap();

        let available = fetch_unfinalized_shipments(&conn).unwrap();

        assert_eq!(available.len(), 1);
        assert_eq!(available[0].id, "s1");
    }
}
