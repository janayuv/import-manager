use crate::db::{DbState, BoeDetails, NewBoePayload, SavedBoe, BoeShipment, BoeShipmentItem, BoeReconciliationReport, ReconciledItemRow, ReconciliationTotals, Attachment};
use crate::commands::utils::{generate_id, BoeShipmentMap};
use rusqlite::{params, Error as RusqliteError};
use tauri::State;
use tauri::Manager;
use std::collections::HashMap;

#[tauri::command]
pub fn get_boes(state: State<DbState>) -> Result<Vec<BoeDetails>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM boe_details").map_err(|e| e.to_string())?;
    let boe_iter = stmt.query_map([], |row| {
        Ok(BoeDetails {
            id: row.get(0)?,
            be_number: row.get(1)?,
            be_date: row.get(2)?,
            location: row.get(3)?,
            total_assessment_value: row.get(4)?,
            duty_amount: row.get(5)?,
            payment_date: row.get(6)?,
            duty_paid: row.get(7)?,
            challan_number: row.get(8)?,
            ref_id: row.get(9)?,
            transaction_id: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;

    boe_iter.map(|b| b.map_err(|e| e.to_string())).collect()
}

// MODIFIED to accept the new payload without an ID
#[tauri::command]
pub fn add_boe(payload: NewBoePayload, state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();
    let new_id = generate_id("BOE");
    conn.execute(
        "INSERT INTO boe_details (id, be_number, be_date, location, total_assessment_value, duty_amount, payment_date, duty_paid, challan_number, ref_id, transaction_id) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            new_id, payload.be_number, payload.be_date, payload.location, payload.total_assessment_value,
            payload.duty_amount, payload.payment_date, payload.duty_paid, payload.challan_number,
            payload.ref_id, payload.transaction_id
        ],
    ).map_err(|e| e.to_string())?;
    Ok(new_id)
}

#[tauri::command]
pub fn update_boe(boe: BoeDetails, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE boe_details SET be_number = ?2, be_date = ?3, location = ?4, total_assessment_value = ?5, duty_amount = ?6, payment_date = ?7, duty_paid = ?8, challan_number = ?9, ref_id = ?10, transaction_id = ?11
         WHERE id = ?1",
        params![
            boe.id, boe.be_number, boe.be_date, boe.location, boe.total_assessment_value,
            boe.duty_amount, boe.payment_date, boe.duty_paid, boe.challan_number,
            boe.ref_id, boe.transaction_id
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_boe(id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM boe_details WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// --- BOE CALCULATION COMMANDS ---
// ============================================================================

fn map_row_to_saved_boe(row: &rusqlite::Row) -> Result<SavedBoe, RusqliteError> {
    // Read the plain fields from the database row
    let id: String = row.get("id")?;
    let shipment_id: String = row.get("shipment_id")?;
    let boe_id: Option<String> = row.get("boe_id")?; // <-- ADDED
    let supplier_name: String = row.get("supplier_name")?;
    let invoice_number: String = row.get("invoice_number")?;
    let status: String = row.get("status")?;
    
    // Read the JSON strings from the database row
    let form_values_json: String = row.get("form_values_json")?;
    let item_inputs_json: String = row.get("item_inputs_json")?;
    let calculation_result_json: String = row.get("calculation_result_json")?;
    let attachments_json: Option<String> = row.get("attachments_json").ok();

    // Deserialize the JSON strings back into their respective Rust structs
    let form_values = serde_json::from_str(&form_values_json)
        .map_err(|e| RusqliteError::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e)))?;
    let item_inputs = serde_json::from_str(&item_inputs_json)
        .map_err(|e| RusqliteError::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(e)))?;
    let calculation_result = serde_json::from_str(&calculation_result_json)
        .map_err(|e| RusqliteError::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(e)))?;

    // Assemble the final SavedBoe struct
    Ok(SavedBoe {
        id,
        shipment_id,
        boe_id, // <-- ADDED
        supplier_name,
        invoice_number,
        status,
        form_values,
        item_inputs,
        calculation_result,
        attachments: attachments_json.and_then(|s| serde_json::from_str(&s).ok()),
    })
}

#[tauri::command]
pub fn get_boe_calculations(state: State<DbState>) -> Result<Vec<SavedBoe>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM boe_calculations ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let boe_iter = stmt
        .query_map([], map_row_to_saved_boe)
        .map_err(|e| e.to_string())?;

    boe_iter.collect::<Result<Vec<SavedBoe>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_boe_calculation(payload: SavedBoe, state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();
    
    // Serialize the nested structs into JSON strings
    let form_values_json = serde_json::to_string(&payload.form_values).map_err(|e| e.to_string())?;
    let item_inputs_json = serde_json::to_string(&payload.item_inputs).map_err(|e| e.to_string())?;
    let calculation_result_json = serde_json::to_string(&payload.calculation_result).map_err(|e| e.to_string())?;
    
    let new_id = payload.id; // Use the ID generated by the frontend

    conn.execute(
        "INSERT INTO boe_calculations (id, shipment_id, boe_id, supplier_name, invoice_number, status, form_values_json, item_inputs_json, calculation_result_json, attachments_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            new_id,
            payload.shipment_id,
            payload.boe_id, // <-- ADDED
            payload.supplier_name,
            payload.invoice_number,
            payload.status,
            form_values_json,
            item_inputs_json,
            calculation_result_json,
            serde_json::to_string(&payload.attachments).unwrap_or("null".into()),
        ],
    ).map_err(|e| e.to_string())?;

    // Automatically update shipment status to "Custom Clearance" when BOE entry is added
    conn.execute(
        "UPDATE shipments SET status = 'custom-clearance' WHERE id = ?1",
        params![payload.shipment_id],
    ).map_err(|e| e.to_string())?;

    Ok(new_id.to_string())
}

#[tauri::command]
pub fn update_boe_calculation(payload: SavedBoe, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    // Serialize the nested structs into JSON strings
    let form_values_json = serde_json::to_string(&payload.form_values).map_err(|e| e.to_string())?;
    let item_inputs_json = serde_json::to_string(&payload.item_inputs).map_err(|e| e.to_string())?;
    let calculation_result_json = serde_json::to_string(&payload.calculation_result).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE boe_calculations 
         SET shipment_id = ?2, boe_id = ?3, supplier_name = ?4, invoice_number = ?5, status = ?6, form_values_json = ?7, item_inputs_json = ?8, calculation_result_json = ?9, attachments_json = ?10
         WHERE id = ?1",
        params![
            payload.id,
            payload.shipment_id,
            payload.boe_id, // <-- ADDED
            payload.supplier_name,
            payload.invoice_number,
            payload.status,
            form_values_json,
            item_inputs_json,
            calculation_result_json,
            serde_json::to_string(&payload.attachments).unwrap_or("null".into()),
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn delete_boe_calculation(id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM boe_calculations WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- EFFICIENT COMMAND TO GET ALL DATA FOR THE BOE ENTRY SCREEN ---
#[tauri::command]
pub fn get_shipments_for_boe_entry(state: State<DbState>) -> Result<Vec<BoeShipment>, String> {
    let conn = state.db.lock().unwrap();

    let sql = "
        SELECT 
            s.id, s.invoice_number, s.invoice_date, s.invoice_value, s.invoice_currency, s.incoterm, s.status,
            sup.supplier_name,
            i.part_number, i.item_description,
            ili.quantity, ili.unit_price,
            i.hsn_code,
            (ili.quantity * ili.unit_price) as line_total,
            CAST(REPLACE(i.bcd, '%', '') AS REAL) as actual_bcd_rate,
            CAST(REPLACE(i.sws, '%', '') AS REAL) as actual_sws_rate,
            CAST(REPLACE(i.igst, '%', '') AS REAL) as actual_igst_rate
        FROM shipments s
        JOIN suppliers sup ON s.supplier_id = sup.id
        JOIN invoices inv ON inv.shipment_id = s.id
        JOIN invoice_line_items ili ON ili.invoice_id = inv.id
        JOIN items i ON ili.item_id = i.id
        WHERE s.id NOT IN (SELECT shipment_id FROM boe_calculations)
        ORDER BY s.invoice_date DESC, s.id, i.part_number;
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let mut shipments_map: HashMap<String, BoeShipment> = HashMap::new();

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?, // s.id
            row.get::<_, String>(1)?, // s.invoice_number
            row.get::<_, String>(2)?, // s.invoice_date
            row.get::<_, f64>(3)?,    // s.invoice_value
            row.get::<_, String>(4)?, // s.invoice_currency
            row.get::<_, String>(5)?, // s.incoterm
            row.get::<_, String>(6)?, // s.status
            row.get::<_, String>(7)?, // sup.supplier_name
            row.get::<_, String>(8)?, // i.part_number
            row.get::<_, String>(9)?, // i.item_description
            row.get::<_, f64>(10)?,   // qty
            row.get::<_, f64>(11)?,   // unit_price
            row.get::<_, String>(12)?, // hsn_code
            row.get::<_, f64>(13)?,   // line_total
            row.get::<_, Option<f64>>(14)?, // actual_bcd_rate
            row.get::<_, Option<f64>>(15)?, // actual_sws_rate
            row.get::<_, Option<f64>>(16)?  // actual_igst_rate
        ))
    }).map_err(|e| e.to_string())?;

    for row_result in rows {
        let (
            shipment_id, invoice_number, invoice_date, invoice_value, invoice_currency, incoterm, status,
            supplier_name, part_no, description, qty, unit_price, hs_code, line_total, actual_bcd_rate, actual_sws_rate, actual_igst_rate
        ) = row_result.map_err(|e| e.to_string())?;

        let shipment = shipments_map.entry(shipment_id.clone()).or_insert_with(|| BoeShipment {
            id: shipment_id,
            invoice_number,
            invoice_date,
            invoice_value,
            invoice_currency,
            incoterm,
            status,
            supplier_name,
            items: Vec::new(),
        });

        shipment.items.push(BoeShipmentItem {
            part_no,
            description,
            qty,
            unit_price,
            hs_code,
            line_total,
            actual_bcd_rate: actual_bcd_rate.unwrap_or(0.0),
            actual_sws_rate: actual_sws_rate.unwrap_or(0.0),
            actual_igst_rate: actual_igst_rate.unwrap_or(0.0),
        });
    }

    Ok(shipments_map.into_values().collect())
}

// Include ALL shipments with items (no exclusion). For BOE Summary.
#[tauri::command]
pub fn get_shipments_for_boe_summary(state: State<DbState>) -> Result<Vec<BoeShipment>, String> {
    let conn = state.db.lock().unwrap();
    let sql = "
        SELECT 
            s.id, s.invoice_number, s.invoice_date, s.invoice_value, s.invoice_currency, s.incoterm, s.status,
            sup.supplier_name,
            i.part_number, i.item_description,
            ili.quantity, ili.unit_price,
            i.hsn_code,
            (ili.quantity * ili.unit_price) as line_total,
            CAST(REPLACE(i.bcd, '%', '') AS REAL) as actual_bcd_rate,
            CAST(REPLACE(i.sws, '%', '') AS REAL) as actual_sws_rate,
            CAST(REPLACE(i.igst, '%', '') AS REAL) as actual_igst_rate
        FROM shipments s
        JOIN suppliers sup ON s.supplier_id = sup.id
        JOIN invoices inv ON inv.shipment_id = s.id
        JOIN invoice_line_items ili ON ili.invoice_id = inv.id
        JOIN items i ON ili.item_id = i.id
        ORDER BY s.invoice_date DESC, s.id, i.part_number;
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let mut shipments_map: HashMap<String, BoeShipment> = HashMap::new();
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?, // s.id
            row.get::<_, String>(1)?, // s.invoice_number
            row.get::<_, String>(2)?, // s.invoice_date
            row.get::<_, f64>(3)?,    // s.invoice_value
            row.get::<_, String>(4)?, // s.invoice_currency
            row.get::<_, String>(5)?, // s.incoterm
            row.get::<_, String>(6)?, // s.status
            row.get::<_, String>(7)?, // sup.supplier_name
            row.get::<_, String>(8)?, // i.part_number
            row.get::<_, String>(9)?, // i.item_description
            row.get::<_, f64>(10)?,   // qty
            row.get::<_, f64>(11)?,   // unit_price
            row.get::<_, String>(12)?, // hsn_code
            row.get::<_, f64>(13)?,   // line_total
            row.get::<_, Option<f64>>(14)?, // actual_bcd_rate
            row.get::<_, Option<f64>>(15)?, // actual_sws_rate
            row.get::<_, Option<f64>>(16)?  // actual_igst_rate
        ))
    }).map_err(|e| e.to_string())?;

    for row_result in rows {
        let (
            shipment_id, invoice_number, invoice_date, invoice_value, invoice_currency, incoterm, status,
            supplier_name, part_no, description, qty, unit_price, hs_code, line_total, actual_bcd_rate, actual_sws_rate, actual_igst_rate
        ) = row_result.map_err(|e| e.to_string())?;

        let shipment = shipments_map.entry(shipment_id.clone()).or_insert_with(|| BoeShipment {
            id: shipment_id,
            invoice_number,
            invoice_date,
            invoice_value,
            invoice_currency,
            incoterm,
            status,
            supplier_name,
            items: Vec::new(),
        });

        shipment.items.push(BoeShipmentItem {
            part_no,
            description,
            qty,
            unit_price,
            hs_code,
            line_total,
            actual_bcd_rate: actual_bcd_rate.unwrap_or(0.0),
            actual_sws_rate: actual_sws_rate.unwrap_or(0.0),
            actual_igst_rate: actual_igst_rate.unwrap_or(0.0),
        });
    }

    Ok(shipments_map.into_values().collect())
}

// --- Persistence: update status of a SavedBoe
#[tauri::command]
pub fn update_boe_status(id: String, status: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute("UPDATE boe_calculations SET status = ?2 WHERE id = ?1", params![id, status])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Persistence: append an attachment to a SavedBoe
#[tauri::command]
pub fn add_boe_attachment(id: String, attachment: Attachment, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    // read current attachments
    let mut stmt = conn.prepare("SELECT attachments_json FROM boe_calculations WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![&id]).map_err(|e| e.to_string())?;
    let row = rows.next().map_err(|e| e.to_string())?.ok_or("BOE not found")?;
    let current_json: Option<String> = row.get(0).ok();
    let mut list: Vec<Attachment> = current_json
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    list.push(attachment);
    let new_json = serde_json::to_string(&list).map_err(|e| e.to_string())?;
    conn.execute("UPDATE boe_calculations SET attachments_json = ?2 WHERE id = ?1", params![id, new_json])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- New: Server-side reconciliation for a given SavedBoe id ---
#[tauri::command]
pub fn get_boe_reconciliation(saved_boe_id: String, state: State<DbState>) -> Result<BoeReconciliationReport, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM boe_calculations WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![saved_boe_id]).map_err(|e| e.to_string())?;
    let row = rows.next().map_err(|e| e.to_string())?.ok_or("Saved BOE not found")?;
    let saved = map_row_to_saved_boe(row).map_err(|e| e.to_string())?;

    // Fetch shipment items with actual rates and qty/unit price/hs code
    let shipment = {
        let sql = "
            SELECT 
                i.part_number, i.item_description,
                ili.quantity, ili.unit_price,
                i.hsn_code,
                (ili.quantity * ili.unit_price) as line_total,
                CAST(REPLACE(i.bcd, '%', '') AS REAL) as actual_bcd_rate,
                CAST(REPLACE(i.sws, '%', '') AS REAL) as actual_sws_rate,
                CAST(REPLACE(i.igst, '%', '') AS REAL) as actual_igst_rate
            FROM invoices inv
            JOIN invoice_line_items ili ON ili.invoice_id = inv.id
            JOIN items i ON ili.item_id = i.id
            WHERE inv.shipment_id = ?1
            ORDER BY i.part_number
        ";
        let mut st = conn.prepare(sql).map_err(|e| e.to_string())?;
        let it = st
            .query_map(params![&saved.shipment_id], |row| {
                Ok((
                    row.get::<_, String>(0)?, // part
                    row.get::<_, String>(1)?, // desc
                    row.get::<_, f64>(2)?,    // qty
                    row.get::<_, f64>(3)?,    // unit_price
                    row.get::<_, String>(4)?, // hsn
                    row.get::<_, f64>(5)?,    // line_total
                    row.get::<_, Option<f64>>(6)?, // bcd
                    row.get::<_, Option<f64>>(7)?, // sws
                    row.get::<_, Option<f64>>(8)?, // igst
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut map: BoeShipmentMap = HashMap::new();
        for r in it {
            let (part, desc, qty, price, hsn, line_total, bcd, sws, igst) = r.map_err(|e| e.to_string())?;
            map.insert(part.clone(), (desc, qty, price, hsn, line_total, bcd.unwrap_or(0.0), sws.unwrap_or(0.0), igst.unwrap_or(0.0)));
        }
        map
    };

    // Build reconciliation rows by matching calculated items to shipment items and itemInputs (for method)
    let mut rows_out: Vec<ReconciledItemRow> = Vec::new();
    let mut actual_total_sum = 0.0;
    let mut boe_total_sum = 0.0;
    let mut savings_sum = 0.0;

    for it in &saved.calculation_result.calculated_items {
        if let Some((desc, qty, unit_price, hs_code, _line_total, act_bcd_rate, act_sws_rate, act_igst_rate)) = shipment.get(&it.part_no).cloned() {
            let assessable = it.assessable_value;
            let actual_bcd = assessable * (act_bcd_rate / 100.0);
            let actual_sws = actual_bcd * (act_sws_rate / 100.0);
            let actual_igst = (assessable + actual_bcd + actual_sws) * (act_igst_rate / 100.0);
            let actual_total = actual_bcd + actual_sws + actual_igst;

            let boe_total = it.bcd_value + it.sws_value + it.igst_value;
            let method = saved.item_inputs.iter().find(|ii| ii.part_no == it.part_no).map(|ii| ii.calculation_method.clone()).unwrap_or_else(|| "Standard".to_string());
            let savings = if method == "Standard" { 0.0 } else { (actual_total - boe_total).max(0.0) };

            actual_total_sum += actual_total;
            boe_total_sum += boe_total;
            savings_sum += savings;

            rows_out.push(ReconciledItemRow {
                part_no: it.part_no.clone(),
                description: desc,
                qty,
                unit_price,
                hs_code,
                assessable_value: assessable,
                actual_bcd,
                actual_sws,
                actual_igst,
                actual_total,
                boe_bcd: it.bcd_value,
                boe_sws: it.sws_value,
                boe_igst: it.igst_value,
                boe_total,
                method,
                savings,
            });
        }
    }

    let report = BoeReconciliationReport {
        saved_boe_id: saved.id,
        shipment_id: saved.shipment_id,
        supplier_name: saved.supplier_name,
        invoice_number: saved.invoice_number,
        items: rows_out,
        totals: ReconciliationTotals {
            actual_total: actual_total_sum,
            boe_total: boe_total_sum,
            savings_total: savings_sum,
        },
    };

    Ok(report)
}

// --- Save a picked file to app data attachments/<BOE_ID>/ and return the saved path ---
#[tauri::command]
pub fn save_boe_attachment_file(app: tauri::AppHandle, id: String, src_path: String) -> Result<String, String> {
    println!("📄 [RUST] Starting BOE attachment file save...");
    println!("📄 [RUST] BOE ID: {id}");
    println!("📄 [RUST] Source path: {src_path}");
    
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            println!("❌ [RUST] Failed to get app data directory: {e}");
            e.to_string()
        })?;
    println!("📄 [RUST] App data base directory: {base:?}");
    
    let attach_dir = base.join("attachments").join(&id);
    println!("📄 [RUST] Attachment directory: {attach_dir:?}");
    
    std::fs::create_dir_all(&attach_dir).map_err(|e| {
        println!("❌ [RUST] Failed to create attachment directory: {e}");
        e.to_string()
    })?;
    println!("✅ [RUST] Attachment directory created successfully");

    let file_name = std::path::Path::new(&src_path)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| {
            println!("❌ [RUST] Invalid source file name");
            "Invalid source file name".to_string()
        })?;
    println!("📄 [RUST] Extracted filename: {file_name}");

    let dest_path = attach_dir.join(file_name);
    println!("📄 [RUST] Destination path: {dest_path:?}");
    
    std::fs::copy(&src_path, &dest_path).map_err(|e| {
        println!("❌ [RUST] Failed to copy file: {e}");
        e.to_string()
    })?;
    println!("✅ [RUST] File copied successfully");
    
    let result_path = dest_path.to_string_lossy().to_string();
    println!("✅ [RUST] Returning saved path: {result_path}");
    Ok(result_path)
}

// --- Save an item photo into app data attachments/items and return saved path ---
#[tauri::command]
pub fn save_item_photo_file(app: tauri::AppHandle, src_path: String) -> Result<String, String> {
    println!("🖼️ [RUST] Starting item photo file save...");
    println!("🖼️ [RUST] Source path: {src_path}");
    
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            println!("❌ [RUST] Failed to get app data directory: {e}");
            e.to_string()
        })?;
    println!("🖼️ [RUST] App data base directory: {base:?}");
    
    let attach_dir = base.join("attachments").join("items");
    println!("🖼️ [RUST] Item photo directory: {attach_dir:?}");
    
    std::fs::create_dir_all(&attach_dir).map_err(|e| {
        println!("❌ [RUST] Failed to create item photo directory: {e}");
        e.to_string()
    })?;
    println!("✅ [RUST] Item photo directory created successfully");

    let file_name = std::path::Path::new(&src_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("photo.png");
    println!("🖼️ [RUST] Extracted filename: {file_name}");

    let dest_path = attach_dir.join(file_name);
    println!("🖼️ [RUST] Destination path: {dest_path:?}");
    
    std::fs::copy(&src_path, &dest_path).map_err(|e| {
        println!("❌ [RUST] Failed to copy item photo file: {e}");
        e.to_string()
    })?;
    println!("✅ [RUST] Item photo file copied successfully");
    
    let result_path = dest_path.to_string_lossy().to_string();
    println!("✅ [RUST] Returning saved item photo path: {result_path}");
    Ok(result_path)
}
