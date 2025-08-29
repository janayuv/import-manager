use crate::Shipment;
use crate::DbState;
use rusqlite::params;
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

    Ok(())
}

#[tauri::command]
pub fn delete_shipment(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM shipments WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

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

    Ok(())
}

#[tauri::command]
pub fn get_unfinalized_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
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
pub fn freeze_shipment(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("UPDATE shipments SET is_frozen = 1 WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_shipment_status(state: State<DbState>, id: String, status: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("UPDATE shipments SET status = ?1 WHERE id = ?2", params![status, id])
        .map_err(|e| e.to_string())?;

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
            errors.push(format!("Row {}: Invoice value must be greater than 0", index + 1));
        }
    }
    
    Ok(errors)
}