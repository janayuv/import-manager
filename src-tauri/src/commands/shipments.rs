#![allow(clippy::uninlined_format_args)]
use crate::db::{DbState, Shipment};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM shipments")
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
pub fn get_active_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM shipments WHERE is_frozen = 0")
        .map_err(|e| e.to_string())?;
    let shipments = stmt
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

    let mut out = Vec::new();
    for s in shipments {
        out.push(s.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn add_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery, is_frozen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        params![
            shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
            shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
            shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
            shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
            shipment.container_number, shipment.gross_weight_kg, shipment.etd,
            shipment.eta, shipment.status, shipment.date_of_delivery, shipment.is_frozen,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE shipments SET supplier_id = ?2, invoice_number = ?3, invoice_date = ?4, goods_category = ?5, invoice_value = ?6, invoice_currency = ?7, incoterm = ?8, shipment_mode = ?9, shipment_type = ?10, bl_awb_number = ?11, bl_awb_date = ?12, vessel_name = ?13, container_number = ?14, gross_weight_kg = ?15, etd = ?16, eta = ?17, status = ?18, date_of_delivery = ?19, is_frozen = ?20 WHERE id = ?1",
        params![
            shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
            shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
            shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
            shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
            shipment.container_number, shipment.gross_weight_kg, shipment.etd,
            shipment.eta, shipment.status, shipment.date_of_delivery, shipment.is_frozen,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn freeze_shipment(
    state: State<DbState>,
    shipment_id: String,
    frozen: bool,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE shipments SET is_frozen = ?2 WHERE id = ?1",
        params![shipment_id, if frozen { 1 } else { 0 }],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_shipment_status(
    state: State<DbState>,
    shipment_id: String,
    status: String,
    date_of_delivery: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    if let Some(delivery_date) = date_of_delivery {
        conn.execute(
            "UPDATE shipments SET status = ?2, date_of_delivery = ?3 WHERE id = ?1",
            params![shipment_id, status, delivery_date],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE shipments SET status = ?2 WHERE id = ?1",
            params![shipment_id, status],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn add_shipments_bulk(state: State<DbState>, shipments: Vec<Shipment>) -> Result<(), String> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for shipment in shipments {
        tx.execute(
            "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
                shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
                shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
                shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
                shipment.container_number, shipment.gross_weight_kg, shipment.etd,
                shipment.eta, shipment.status, shipment.date_of_delivery,
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_unfinalized_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT s.* FROM shipments s
         LEFT JOIN invoices i ON s.id = i.shipment_id AND i.status = 'Finalized'
         WHERE i.id IS NULL",
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

    shipment_iter
        .collect::<Result<Vec<Shipment>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_shipment_import(
    shipments: Vec<Shipment>,
    state: State<DbState>,
) -> Result<Vec<String>, String> {
    let conn = state.db.lock().unwrap();
    let mut errors = Vec::new();

    for (index, shipment) in shipments.iter().enumerate() {
        let row_num = index + 1;

        // Check for empty or invalid supplier_id
        if shipment.supplier_id.is_empty() || shipment.supplier_id == "#N/A" {
            errors.push(format!(
                "Row {}: Column 'supplier_id' has invalid value '{}'",
                row_num, shipment.supplier_id
            ));
        } else {
            // Check if supplier exists in database
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) FROM suppliers WHERE id = ?",
                    params![shipment.supplier_id],
                    |row| Ok(row.get::<_, i64>(0)? > 0),
                )
                .map_err(|e| e.to_string())?;

            if !exists {
                errors.push(format!(
                    "Row {}: Column 'supplier_id' references non-existent supplier '{}'",
                    row_num, shipment.supplier_id
                ));
            }
        }

        // Check for empty shipment ID
        if shipment.id.is_empty() {
            errors.push(format!("Row {row_num}: Column 'id' is empty"));
        }

        // Check for empty invoice_number
        if shipment.invoice_number.is_empty() {
            errors.push(format!("Row {row_num}: Column 'invoice_number' is empty"));
        }

        // Check for empty invoice_date
        if shipment.invoice_date.is_empty() {
            errors.push(format!("Row {row_num}: Column 'invoice_date' is empty"));
        }

        // Check for empty goods_category
        if shipment.goods_category.is_empty() {
            errors.push(format!("Row {row_num}: Column 'goods_category' is empty"));
        }

        // Check for invalid invoice_value
        if shipment.invoice_value <= 0.0 {
            errors.push(format!(
                "Row {}: Column 'invoice_value' has invalid value '{}'",
                row_num, shipment.invoice_value
            ));
        }

        // Check for empty invoice_currency
        if shipment.invoice_currency.is_empty() {
            errors.push(format!("Row {row_num}: Column 'invoice_currency' is empty"));
        }

        // Check for empty incoterm
        if shipment.incoterm.is_empty() {
            errors.push(format!("Row {row_num}: Column 'incoterm' is empty"));
        }

        // Optional fields - only validate if provided and not empty
        // For truly optional fields, we don't validate if they're None or empty strings

        // Check for invalid gross_weight_kg (optional field - only if provided)
        if let Some(gross_weight_kg) = shipment.gross_weight_kg {
            if gross_weight_kg <= 0.0 {
                errors.push(format!(
                    "Row {}: Column 'gross_weight_kg' has invalid value '{}'",
                    row_num, gross_weight_kg
                ));
            }
        }
    }

    Ok(errors)
}
