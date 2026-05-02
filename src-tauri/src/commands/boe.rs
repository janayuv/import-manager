use crate::commands::dashboard_cache;
use crate::commands::utils::{generate_id, BoeShipmentMap};
use crate::connection_manager::ConnectionManager;
use crate::correlation;
use crate::db::{
    Attachment, BoeDetails, BoeReconciliationReport, BoeShipment, BoeShipmentItem, DbState,
    NewBoePayload, ReconciledItemRow, ReconciliationTotals, SavedBoe,
};
use crate::services::boe_service::{
    analyze_boe_query_plans, ensure_json_size, get_boe_health_summary,
    index_recommendations_from_findings, reconcile_boe_attachments, recover_interrupted_boe_writes,
    round_money, sum_money, top_largest_json_rows, validate_boe_integrity, validate_boe_payload,
    validate_saved_boe_payload, validate_status, with_boe_write_queue, BoeError,
};
use rusqlite::{params, Error as RusqliteError};
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::Manager;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResult<T> {
    pub data: Vec<T>,
    pub total_count: i64,
}

static BOE_JSON_CACHE: OnceLock<Mutex<HashMap<String, SavedBoe>>> = OnceLock::new();

fn boe_json_cache_usage() -> usize {
    BOE_JSON_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map(|m| m.len())
        .unwrap_or(0)
}

fn log_timing(operation: &str, started: Instant, extra: &str) {
    let elapsed = started.elapsed().as_millis();
    if elapsed > 200 {
        log::warn!(
            target: "import_manager::boe",
            "operation={} duration_ms={} {}",
            operation,
            elapsed,
            extra
        );
    } else {
        log::info!(
            target: "import_manager::boe",
            "operation={} duration_ms={} {}",
            operation,
            elapsed,
            extra
        );
    }
}

fn lock_conn<'a>(
    state: &'a State<'_, DbState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state
        .db
        .lock()
        .map_err(|e| BoeError::DatabaseError(format!("Database lock failed: {e}")).to_string())
}

#[tauri::command]
pub fn get_boes(state: State<DbState>) -> Result<Vec<BoeDetails>, String> {
    let conn = lock_conn(&state)?;
    let started = Instant::now();
    let mut stmt = conn
        .prepare(
            "SELECT id, be_number, be_date, location, total_assessment_value, duty_amount, payment_date, duty_paid, challan_number, ref_id, transaction_id
             FROM boe_details
             ORDER BY be_date DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;
    let boe_iter = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    let data = boe_iter.map(|b| b.map_err(|e| e.to_string())).collect();
    log_timing("get_boes", started, "");
    data
}

#[tauri::command]
pub fn get_boes_paginated(
    page: i64,
    page_size: i64,
    _state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<PaginatedResult<BoeDetails>, String> {
    let conn = connection_manager.get_read_connection()?;
    let started = Instant::now();
    let safe_page = page.max(1);
    let safe_page_size = page_size.clamp(1, 100);
    let offset = (safe_page - 1) * safe_page_size;

    let total_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM boe_details", [], |row| row.get(0))
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, be_number, be_date, location, total_assessment_value, duty_amount, payment_date, duty_paid, challan_number, ref_id, transaction_id
             FROM boe_details
             ORDER BY be_date DESC, id DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;

    let rows = stmt
        .query_map(params![safe_page_size, offset], |row| {
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
        })
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;
    let data = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;
    connection_manager.track_query("get_boes_paginated", started, data.len());

    log_timing(
        "get_boes_paginated",
        started,
        &format!(
            "page={} page_size={} total_count={}",
            safe_page, safe_page_size, total_count
        ),
    );
    Ok(PaginatedResult { data, total_count })
}

// MODIFIED to accept the new payload without an ID
#[tauri::command]
pub fn add_boe(payload: NewBoePayload, state: State<DbState>) -> Result<String, String> {
    let started = Instant::now();
    let new_id = generate_id(Some("BOE".to_string()));
    if let Err(e) = validate_boe_payload(&BoeDetails {
        id: new_id.clone(),
        be_number: payload.be_number.clone(),
        be_date: payload.be_date.clone(),
        location: payload.location.clone(),
        total_assessment_value: payload.total_assessment_value,
        duty_amount: payload.duty_amount,
        payment_date: payload.payment_date.clone(),
        duty_paid: payload.duty_paid,
        challan_number: payload.challan_number.clone(),
        ref_id: payload.ref_id.clone(),
        transaction_id: payload.transaction_id.clone(),
    }) {
        let msg = e.to_string();
        if let Ok(conn) = state.db.lock() {
            crate::services::user_activity_audit::log_activity(
                &conn,
                None,
                "add_boe",
                Some("boe_details"),
                Some(&new_id),
                Some(&json!({ "error": msg }).to_string()),
                "FAILED",
            );
        }
        return Err(msg);
    }
    let inserted_id = new_id.clone();
    with_boe_write_queue(|| {
        let conn = lock_conn(&state).map_err(BoeError::DatabaseError)?;
        let id_for_log = new_id.clone();
        conn.execute(
            "INSERT INTO boe_details (id, be_number, be_date, location, total_assessment_value, duty_amount, payment_date, duty_paid, challan_number, ref_id, transaction_id) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                new_id, payload.be_number, payload.be_date, payload.location, payload.total_assessment_value,
                payload.duty_amount, payload.payment_date, payload.duty_paid, payload.challan_number,
                payload.ref_id, payload.transaction_id
            ],
        )
        .map_err(|e| {
            let msg = e.to_string();
            crate::services::user_activity_audit::log_activity(
                &conn,
                None,
                "add_boe",
                Some("boe_details"),
                Some(&id_for_log),
                Some(&json!({ "error": msg }).to_string()),
                "FAILED",
            );
            BoeError::DatabaseError(msg)
        })?;
        crate::services::user_activity_audit::log_activity(
            &conn,
            None,
            "add_boe",
            Some("boe_details"),
            Some(&id_for_log),
            Some(&format!("{{\"be_number\": \"{}\"}}", payload.be_number)),
            "SUCCESS",
        );
        let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
        Ok(())
    })
    .map_err(|e| e.to_string())?;
    log_timing("add_boe", started, &format!("boe_id={}", inserted_id));
    Ok(inserted_id)
}

#[tauri::command]
pub fn update_boe(boe: BoeDetails, state: State<DbState>) -> Result<(), String> {
    let started = Instant::now();
    if let Err(e) = validate_boe_payload(&boe) {
        let msg = e.to_string();
        if let Ok(conn) = state.db.lock() {
            crate::services::user_activity_audit::log_activity(
                &conn,
                None,
                "update_boe",
                Some("boe_details"),
                Some(&boe.id),
                Some(&json!({ "error": msg }).to_string()),
                "FAILED",
            );
        }
        return Err(msg);
    }
    let boe_id_timing = boe.id.clone();
    with_boe_write_queue(|| {
        let conn = lock_conn(&state).map_err(BoeError::DatabaseError)?;
        let bid = boe.id.clone();
        let bnum = boe.be_number.clone();
        conn.execute(
            "UPDATE boe_details SET be_number = ?2, be_date = ?3, location = ?4, total_assessment_value = ?5, duty_amount = ?6, payment_date = ?7, duty_paid = ?8, challan_number = ?9, ref_id = ?10, transaction_id = ?11
             WHERE id = ?1",
            params![
                boe.id, boe.be_number, boe.be_date, boe.location, boe.total_assessment_value,
                boe.duty_amount, boe.payment_date, boe.duty_paid, boe.challan_number,
                boe.ref_id, boe.transaction_id
            ],
        )
        .map_err(|e| {
            let msg = e.to_string();
            crate::services::user_activity_audit::log_activity(
                &conn,
                None,
                "update_boe",
                Some("boe_details"),
                Some(&bid),
                Some(&json!({ "error": msg }).to_string()),
                "FAILED",
            );
            BoeError::DatabaseError(msg)
        })?;
        crate::services::user_activity_audit::log_activity(
            &conn,
            None,
            "update_boe",
            Some("boe_details"),
            Some(&bid),
            Some(&format!("{{\"be_number\": \"{}\"}}", bnum)),
            "SUCCESS",
        );
        let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
        Ok(())
    })
    .map_err(|e| e.to_string())?;
    log_timing("update_boe", started, &format!("boe_id={}", boe_id_timing));
    Ok(())
}

pub(crate) fn delete_boe_db(conn: &rusqlite::Connection, id: &str) -> Result<(), String> {
    let id_for_log = id.to_string();
    conn.execute("DELETE FROM boe_details WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    crate::services::user_activity_audit::log_activity(
        conn,
        None,
        "delete_boe",
        Some("boe_details"),
        Some(&id_for_log),
        None,
        "SUCCESS",
    );
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(conn);
    Ok(())
}

#[tauri::command]
pub fn delete_boe(id: String, state: State<DbState>) -> Result<(), String> {
    let started = Instant::now();
    with_boe_write_queue(|| {
        let conn = lock_conn(&state).map_err(BoeError::DatabaseError)?;
        delete_boe_db(&conn, &id).map_err(BoeError::DatabaseError)
    })
    .map_err(|e| e.to_string())?;
    log_timing("delete_boe", started, &format!("boe_id={}", id));
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
    let attachments_json: Option<String> = row.get("attachments_json")?;

    let cache_key = format!(
        "{}:{}:{}:{}",
        id, form_values_json, item_inputs_json, calculation_result_json
    );
    if let Ok(cache) = BOE_JSON_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    // Deserialize the JSON strings back into their respective Rust structs
    let form_values = serde_json::from_str(&form_values_json).map_err(|e| {
        RusqliteError::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let item_inputs = serde_json::from_str(&item_inputs_json).map_err(|e| {
        RusqliteError::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let calculation_result = serde_json::from_str(&calculation_result_json).map_err(|e| {
        RusqliteError::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(e))
    })?;

    // Assemble the final SavedBoe struct
    let saved = SavedBoe {
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
    };
    if let Ok(mut cache) = BOE_JSON_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        if cache.len() > 500 {
            cache.clear();
        }
        cache.insert(cache_key, saved.clone());
    }
    Ok(saved)
}

#[tauri::command]
pub fn get_boe_calculations(state: State<DbState>) -> Result<Vec<SavedBoe>, String> {
    let conn = lock_conn(&state)?;
    let started = Instant::now();
    let mut stmt = conn
        .prepare(
            "SELECT id, shipment_id, boe_id, supplier_name, invoice_number, status, form_values_json, item_inputs_json, calculation_result_json, attachments_json
             FROM boe_calculations
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let boe_iter = stmt
        .query_map([], map_row_to_saved_boe)
        .map_err(|e| e.to_string())?;

    let result = boe_iter
        .collect::<Result<Vec<SavedBoe>, _>>()
        .map_err(|e| e.to_string());
    log_timing("get_boe_calculations", started, "");
    result
}

#[tauri::command]
pub fn get_boe_calculations_paginated(
    page: i64,
    page_size: i64,
    _state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<PaginatedResult<SavedBoe>, String> {
    let conn = connection_manager.get_read_connection()?;
    let safe_page = page.max(1);
    let safe_page_size = page_size.clamp(1, 100);
    let offset = (safe_page - 1) * safe_page_size;
    let started = Instant::now();

    let total_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM boe_calculations", [], |row| {
            row.get(0)
        })
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, shipment_id, boe_id, supplier_name, invoice_number, status, form_values_json, item_inputs_json, calculation_result_json, attachments_json
             FROM boe_calculations
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;
    let rows = stmt
        .query_map(params![safe_page_size, offset], map_row_to_saved_boe)
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;
    let data = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;
    connection_manager.track_query("get_boe_calculations_paginated", started, data.len());

    log_timing(
        "get_boe_calculations_paginated",
        started,
        &format!(
            "page={} page_size={} total_count={}",
            safe_page, safe_page_size, total_count
        ),
    );
    Ok(PaginatedResult { data, total_count })
}

#[tauri::command]
pub fn add_boe_calculation(payload: SavedBoe, state: State<DbState>) -> Result<String, String> {
    let cid = correlation::new_id();
    log::info!(
        target: "import_manager::boe",
        "event=add_boe_calculation correlation_id={} boe_calc_id={}",
        cid,
        payload.id,
    );
    let started = Instant::now();
    validate_saved_boe_payload(&payload).map_err(|e| correlation::annotate_err(&cid, e.to_string()))?;
    {
        let conn = lock_conn(&state)?;
        let shipment_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM shipments WHERE id = ?1",
                params![payload.shipment_id],
                |row| row.get(0),
            )
            .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;
        if shipment_exists == 0 {
            return Err(
                BoeError::ValidationError("shipment_id is invalid".to_string()).to_string(),
            );
        }
    }

    // Serialize the nested structs into JSON strings
    let form_values_json = serde_json::to_string(&payload.form_values)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    let item_inputs_json = serde_json::to_string(&payload.item_inputs)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    let calculation_result_json = serde_json::to_string(&payload.calculation_result)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    let attachments_json = serde_json::to_string(&payload.attachments)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    ensure_json_size("form_values_json", &form_values_json).map_err(|e| e.to_string())?;
    ensure_json_size("item_inputs_json", &item_inputs_json).map_err(|e| e.to_string())?;
    ensure_json_size("calculation_result_json", &calculation_result_json)
        .map_err(|e| e.to_string())?;
    ensure_json_size("attachments_json", &attachments_json).map_err(|e| e.to_string())?;

    let new_id = payload.id; // Use the ID generated by the frontend
    let result = with_boe_write_queue(|| {
        let mut conn = lock_conn(&state).map_err(BoeError::DatabaseError)?;
        let tx = conn
            .transaction()
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        tx.execute(
            "INSERT INTO boe_write_recovery (id, boe_calculation_id, operation, status) VALUES (?1, ?2, 'upsert_boe_calculation', 'pending')",
            params![format!("REC-{}-{}", new_id, chrono::Utc::now().timestamp_millis()), new_id],
        ).map_err(|e| BoeError::TransactionFailed(e.to_string()))?;

        tx.execute(
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
            attachments_json,
        ],
    ).map_err(|e| BoeError::TransactionFailed(e.to_string()))?;

        if let Some(attachments) = &payload.attachments {
            for att in attachments {
                tx.execute(
                "INSERT OR REPLACE INTO boe_attachments (id, boe_calculation_id, file_name, file_path, uploaded_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![att.id, new_id, att.file_name, att.url, att.uploaded_at],
            )
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
            }
            tx.execute(
                "DELETE FROM boe_items WHERE boe_calculation_id = ?1",
                params![new_id],
            )
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
            for item in &payload.calculation_result.calculated_items {
                let total = sum_money(&[item.bcd_value, item.sws_value, item.igst_value]);
                tx.execute(
                "INSERT INTO boe_items (id, boe_calculation_id, item_id, assessable_value, bcd_rate, sws_rate, igst_rate, total)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    format!("BOEI-{}-{}", &new_id, item.part_no),
                    &new_id,
                    &item.part_no,
                    item.assessable_value,
                    item.bcd_value,
                    item.sws_value,
                    item.igst_value,
                    total
                ],
            )
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
            }
        }

        // Automatically update shipment status to "Custom Clearance" when BOE entry is added
        // Only update if current status is not "delivered"
        tx.execute(
        "UPDATE shipments SET status = 'customs-clearance' WHERE id = ?1 AND status != 'delivered'",
        params![payload.shipment_id],
    )
    .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        tx.commit()
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        conn.execute(
            "UPDATE boe_write_recovery SET status = 'completed' WHERE boe_calculation_id = ?1 AND operation = 'upsert_boe_calculation' AND status = 'pending'",
            params![new_id],
        ).map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
        Ok(())
    });
    result.map_err(|e| correlation::annotate_err(&cid, e.to_string()))?;
    log_timing(
        "add_boe_calculation",
        started,
        &format!("boe_id={}", new_id),
    );
    Ok(new_id.to_string())
}

#[tauri::command]
pub fn update_boe_calculation(payload: SavedBoe, state: State<DbState>) -> Result<(), String> {
    let cid = correlation::new_id();
    log::info!(
        target: "import_manager::boe",
        "event=update_boe_calculation correlation_id={} boe_calc_id={}",
        cid,
        payload.id,
    );
    let started = Instant::now();
    validate_saved_boe_payload(&payload).map_err(|e| correlation::annotate_err(&cid, e.to_string()))?;

    // Serialize the nested structs into JSON strings
    let form_values_json = serde_json::to_string(&payload.form_values)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    let item_inputs_json = serde_json::to_string(&payload.item_inputs)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    let calculation_result_json = serde_json::to_string(&payload.calculation_result)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    let attachments_json = serde_json::to_string(&payload.attachments)
        .map_err(|e| BoeError::JsonParseError(e.to_string()).to_string())?;
    ensure_json_size("form_values_json", &form_values_json).map_err(|e| e.to_string())?;
    ensure_json_size("item_inputs_json", &item_inputs_json).map_err(|e| e.to_string())?;
    ensure_json_size("calculation_result_json", &calculation_result_json)
        .map_err(|e| e.to_string())?;
    ensure_json_size("attachments_json", &attachments_json).map_err(|e| e.to_string())?;

    let result = with_boe_write_queue(|| {
        let mut conn = lock_conn(&state).map_err(BoeError::DatabaseError)?;
        let tx = conn
            .transaction()
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        tx.execute(
            "INSERT INTO boe_write_recovery (id, boe_calculation_id, operation, status) VALUES (?1, ?2, 'upsert_boe_calculation', 'pending')",
            params![format!("REC-{}-{}", payload.id, chrono::Utc::now().timestamp_millis()), payload.id],
        ).map_err(|e| BoeError::TransactionFailed(e.to_string()))?;

        tx.execute(
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
            attachments_json,
        ],
    ).map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        tx.execute(
            "DELETE FROM boe_attachments WHERE boe_calculation_id = ?1",
            params![payload.id],
        )
        .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        if let Some(attachments) = &payload.attachments {
            for att in attachments {
                tx.execute(
                "INSERT OR REPLACE INTO boe_attachments (id, boe_calculation_id, file_name, file_path, uploaded_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![att.id, payload.id, att.file_name, att.url, att.uploaded_at],
            )
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
            }
            tx.execute(
                "DELETE FROM boe_items WHERE boe_calculation_id = ?1",
                params![payload.id],
            )
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
            for item in &payload.calculation_result.calculated_items {
                let total = sum_money(&[item.bcd_value, item.sws_value, item.igst_value]);
                tx.execute(
                "INSERT INTO boe_items (id, boe_calculation_id, item_id, assessable_value, bcd_rate, sws_rate, igst_rate, total)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    format!("BOEI-{}-{}", &payload.id, item.part_no),
                    &payload.id,
                    &item.part_no,
                    item.assessable_value,
                    item.bcd_value,
                    item.sws_value,
                    item.igst_value,
                    total
                ],
            )
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
            }
        }
        tx.commit()
            .map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        conn.execute(
            "UPDATE boe_write_recovery SET status = 'completed' WHERE boe_calculation_id = ?1 AND operation = 'upsert_boe_calculation' AND status = 'pending'",
            params![payload.id],
        ).map_err(|e| BoeError::TransactionFailed(e.to_string()))?;
        let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
        Ok(())
    });
    result.map_err(|e| correlation::annotate_err(&cid, e.to_string()))?;
    log_timing(
        "update_boe_calculation",
        started,
        &format!("boe_id={}", payload.id),
    );
    Ok(())
}

#[tauri::command]
pub fn delete_boe_calculation(id: String, state: State<DbState>) -> Result<(), String> {
    let conn = lock_conn(&state)?;
    conn.execute("DELETE FROM boe_calculations WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(())
}

// --- EFFICIENT COMMAND TO GET ALL DATA FOR THE BOE ENTRY SCREEN ---
#[tauri::command]
pub fn get_shipments_for_boe_entry(state: State<DbState>) -> Result<Vec<BoeShipment>, String> {
    let conn = lock_conn(&state)?;

    let sql = "
        SELECT 
            s.id, s.invoice_number, s.invoice_date, s.invoice_value, s.invoice_currency, s.incoterm, s.status,
            sup.supplier_name,
            i.part_number, i.item_description,
            ili.quantity, ili.unit_price,
            i.hsn_code,
            (ili.quantity * ili.unit_price) as line_total,
            COALESCE(ili.duty_percent, CAST(REPLACE(COALESCE(i.bcd, '0'), '%', '') AS REAL)) as actual_bcd_rate,
            COALESCE(ili.sws_percent, CAST(REPLACE(COALESCE(i.sws, '0'), '%', '') AS REAL)) as actual_sws_rate,
            COALESCE(ili.igst_percent, CAST(REPLACE(COALESCE(i.igst, '0'), '%', '') AS REAL)) as actual_igst_rate
        FROM shipments s
        JOIN suppliers sup ON s.supplier_id = sup.id
        JOIN invoices inv ON inv.shipment_id = s.id
        JOIN invoice_line_items ili ON ili.invoice_id = inv.id
        JOIN items i ON ili.item_id = i.id
        WHERE NOT EXISTS (
            SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id
        )
          AND inv.status = 'Finalized'
        ORDER BY s.invoice_date DESC, s.id, i.part_number;
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let mut shipments_map: HashMap<String, BoeShipment> = HashMap::new();

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,       // s.id
                row.get::<_, String>(1)?,       // s.invoice_number
                row.get::<_, String>(2)?,       // s.invoice_date
                row.get::<_, f64>(3)?,          // s.invoice_value
                row.get::<_, String>(4)?,       // s.invoice_currency
                row.get::<_, String>(5)?,       // s.incoterm
                row.get::<_, String>(6)?,       // s.status
                row.get::<_, String>(7)?,       // sup.supplier_name
                row.get::<_, String>(8)?,       // i.part_number
                row.get::<_, String>(9)?,       // i.item_description
                row.get::<_, f64>(10)?,         // qty
                row.get::<_, f64>(11)?,         // unit_price
                row.get::<_, String>(12)?,      // hsn_code
                row.get::<_, f64>(13)?,         // line_total
                row.get::<_, Option<f64>>(14)?, // actual_bcd_rate
                row.get::<_, Option<f64>>(15)?, // actual_sws_rate
                row.get::<_, Option<f64>>(16)?, // actual_igst_rate
            ))
        })
        .map_err(|e| e.to_string())?;

    for row_result in rows {
        let (
            shipment_id,
            invoice_number,
            invoice_date,
            invoice_value,
            invoice_currency,
            incoterm,
            status,
            supplier_name,
            part_no,
            description,
            qty,
            unit_price,
            hs_code,
            line_total,
            actual_bcd_rate,
            actual_sws_rate,
            actual_igst_rate,
        ) = row_result.map_err(|e| e.to_string())?;

        let shipment = shipments_map
            .entry(shipment_id.clone())
            .or_insert_with(|| BoeShipment {
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

#[tauri::command]
pub fn get_shipments_for_boe_entry_paginated(
    page: i64,
    page_size: i64,
    _state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<PaginatedResult<BoeShipment>, String> {
    let conn = connection_manager.get_read_connection()?;
    let safe_page = page.max(1);
    let safe_page_size = page_size.clamp(1, 100);
    let offset = (safe_page - 1) * safe_page_size;
    let started = Instant::now();

    let total_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments s
             JOIN invoices inv ON inv.shipment_id = s.id
             WHERE inv.status = 'Finalized'
               AND NOT EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id)",
            [],
            |row| row.get(0),
        )
        .map_err(|e| BoeError::DatabaseError(e.to_string()).to_string())?;

    let sql = "
        SELECT 
            s.id, s.invoice_number, s.invoice_date, s.invoice_value, s.invoice_currency, s.incoterm, s.status,
            sup.supplier_name,
            i.part_number, i.item_description,
            ili.quantity, ili.unit_price,
            i.hsn_code,
            (ili.quantity * ili.unit_price) as line_total,
            COALESCE(ili.duty_percent, CAST(REPLACE(COALESCE(i.bcd, '0'), '%', '') AS REAL)) as actual_bcd_rate,
            COALESCE(ili.sws_percent, CAST(REPLACE(COALESCE(i.sws, '0'), '%', '') AS REAL)) as actual_sws_rate,
            COALESCE(ili.igst_percent, CAST(REPLACE(COALESCE(i.igst, '0'), '%', '') AS REAL)) as actual_igst_rate
        FROM shipments s
        JOIN suppliers sup ON s.supplier_id = sup.id
        JOIN invoices inv ON inv.shipment_id = s.id
        JOIN invoice_line_items ili ON ili.invoice_id = inv.id
        JOIN items i ON ili.item_id = i.id
        WHERE s.id IN (
            SELECT s2.id
            FROM shipments s2
            JOIN invoices i2 ON i2.shipment_id = s2.id
            WHERE i2.status = 'Finalized'
              AND NOT EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s2.id)
            ORDER BY s2.invoice_date DESC, s2.id
            LIMIT ?1 OFFSET ?2
        )
        ORDER BY s.invoice_date DESC, s.id, i.part_number
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![safe_page_size, offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, f64>(10)?,
                row.get::<_, f64>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, f64>(13)?,
                row.get::<_, Option<f64>>(14)?,
                row.get::<_, Option<f64>>(15)?,
                row.get::<_, Option<f64>>(16)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut shipments_map: HashMap<String, BoeShipment> = HashMap::new();
    for row_result in rows {
        let (
            shipment_id,
            invoice_number,
            invoice_date,
            invoice_value,
            invoice_currency,
            incoterm,
            status,
            supplier_name,
            part_no,
            description,
            qty,
            unit_price,
            hs_code,
            line_total,
            actual_bcd_rate,
            actual_sws_rate,
            actual_igst_rate,
        ) = row_result.map_err(|e| e.to_string())?;
        let shipment = shipments_map
            .entry(shipment_id.clone())
            .or_insert_with(|| BoeShipment {
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
    let data: Vec<BoeShipment> = shipments_map.into_values().collect();
    connection_manager.track_query("get_shipments_for_boe_entry_paginated", started, data.len());
    log_timing(
        "get_shipments_for_boe_entry_paginated",
        started,
        &format!(
            "page={} page_size={} total_count={}",
            safe_page, safe_page_size, total_count
        ),
    );
    Ok(PaginatedResult { data, total_count })
}

// Include ALL shipments with items (no exclusion). For BOE Summary.
#[tauri::command]
pub fn get_shipments_for_boe_summary(state: State<DbState>) -> Result<Vec<BoeShipment>, String> {
    let conn = lock_conn(&state)?;
    let sql = "
        SELECT 
            s.id, s.invoice_number, s.invoice_date, s.invoice_value, s.invoice_currency, s.incoterm, s.status,
            sup.supplier_name,
            i.part_number, i.item_description,
            ili.quantity, ili.unit_price,
            i.hsn_code,
            (ili.quantity * ili.unit_price) as line_total,
            COALESCE(ili.duty_percent, CAST(REPLACE(COALESCE(i.bcd, '0'), '%', '') AS REAL)) as actual_bcd_rate,
            COALESCE(ili.sws_percent, CAST(REPLACE(COALESCE(i.sws, '0'), '%', '') AS REAL)) as actual_sws_rate,
            COALESCE(ili.igst_percent, CAST(REPLACE(COALESCE(i.igst, '0'), '%', '') AS REAL)) as actual_igst_rate
        FROM shipments s
        JOIN suppliers sup ON s.supplier_id = sup.id
        JOIN invoices inv ON inv.shipment_id = s.id
        JOIN invoice_line_items ili ON ili.invoice_id = inv.id
        JOIN items i ON ili.item_id = i.id
        ORDER BY s.invoice_date DESC, s.id, i.part_number;
    ";

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let mut shipments_map: HashMap<String, BoeShipment> = HashMap::new();
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,       // s.id
                row.get::<_, String>(1)?,       // s.invoice_number
                row.get::<_, String>(2)?,       // s.invoice_date
                row.get::<_, f64>(3)?,          // s.invoice_value
                row.get::<_, String>(4)?,       // s.invoice_currency
                row.get::<_, String>(5)?,       // s.incoterm
                row.get::<_, String>(6)?,       // s.status
                row.get::<_, String>(7)?,       // sup.supplier_name
                row.get::<_, String>(8)?,       // i.part_number
                row.get::<_, String>(9)?,       // i.item_description
                row.get::<_, f64>(10)?,         // qty
                row.get::<_, f64>(11)?,         // unit_price
                row.get::<_, String>(12)?,      // hsn_code
                row.get::<_, f64>(13)?,         // line_total
                row.get::<_, Option<f64>>(14)?, // actual_bcd_rate
                row.get::<_, Option<f64>>(15)?, // actual_sws_rate
                row.get::<_, Option<f64>>(16)?, // actual_igst_rate
            ))
        })
        .map_err(|e| e.to_string())?;

    for row_result in rows {
        let (
            shipment_id,
            invoice_number,
            invoice_date,
            invoice_value,
            invoice_currency,
            incoterm,
            status,
            supplier_name,
            part_no,
            description,
            qty,
            unit_price,
            hs_code,
            line_total,
            actual_bcd_rate,
            actual_sws_rate,
            actual_igst_rate,
        ) = row_result.map_err(|e| e.to_string())?;

        let shipment = shipments_map
            .entry(shipment_id.clone())
            .or_insert_with(|| BoeShipment {
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
    let conn = lock_conn(&state)?;
    validate_status(&status).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE boe_calculations SET status = ?2 WHERE id = ?1",
        params![id, status],
    )
    .map_err(|e| e.to_string())?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(())
}

// --- Persistence: append an attachment to a SavedBoe
#[tauri::command]
pub fn add_boe_attachment(
    id: String,
    attachment: Attachment,
    state: State<DbState>,
) -> Result<(), String> {
    let mut conn = lock_conn(&state)?;
    let tx = conn
        .transaction()
        .map_err(|e| BoeError::TransactionFailed(e.to_string()).to_string())?;
    // read current attachments
    let current_json: Option<String> = {
        let mut stmt = tx
            .prepare("SELECT attachments_json FROM boe_calculations WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![&id]).map_err(|e| e.to_string())?;
        let row = rows
            .next()
            .map_err(|e| e.to_string())?
            .ok_or("BOE not found")?;
        row.get(0).ok()
    };
    let mut list: Vec<Attachment> = current_json
        .and_then(|s| serde_json::from_str::<Vec<Attachment>>(&s).ok())
        .unwrap_or_default();
    list.push(attachment);
    let new_json = serde_json::to_string(&list).map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE boe_calculations SET attachments_json = ?2 WHERE id = ?1",
        params![id, new_json],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO boe_attachments (id, boe_calculation_id, file_name, file_path, uploaded_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![list.last().map(|a| a.id.clone()).unwrap_or_default(), id, list.last().map(|a| a.file_name.clone()).unwrap_or_default(), list.last().map(|a| a.url.clone()).unwrap_or_default(), list.last().map(|a| a.uploaded_at.clone()).unwrap_or_default()],
    )
    .map_err(|e| e.to_string())?;
    tx.commit()
        .map_err(|e| BoeError::TransactionFailed(e.to_string()).to_string())?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(())
}

// --- New: Server-side reconciliation for a given SavedBoe id ---
#[tauri::command]
pub fn get_boe_reconciliation(
    saved_boe_id: String,
    state: State<DbState>,
) -> Result<BoeReconciliationReport, String> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare("SELECT * FROM boe_calculations WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![saved_boe_id])
        .map_err(|e| e.to_string())?;
    let row = rows
        .next()
        .map_err(|e| e.to_string())?
        .ok_or("Saved BOE not found")?;
    let saved = map_row_to_saved_boe(row).map_err(|e| e.to_string())?;

    // Fetch shipment items with actual rates and qty/unit price/hs code
    let shipment = {
        let sql = "
            SELECT 
                i.part_number, i.item_description,
                ili.quantity, ili.unit_price,
                i.hsn_code,
                (ili.quantity * ili.unit_price) as line_total,
                COALESCE(ili.duty_percent, CAST(REPLACE(COALESCE(i.bcd, '0'), '%', '') AS REAL)) as actual_bcd_rate,
                COALESCE(ili.sws_percent, CAST(REPLACE(COALESCE(i.sws, '0'), '%', '') AS REAL)) as actual_sws_rate,
                COALESCE(ili.igst_percent, CAST(REPLACE(COALESCE(i.igst, '0'), '%', '') AS REAL)) as actual_igst_rate
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
                    row.get::<_, String>(0)?,      // part
                    row.get::<_, String>(1)?,      // desc
                    row.get::<_, f64>(2)?,         // qty
                    row.get::<_, f64>(3)?,         // unit_price
                    row.get::<_, String>(4)?,      // hsn
                    row.get::<_, f64>(5)?,         // line_total
                    row.get::<_, Option<f64>>(6)?, // bcd
                    row.get::<_, Option<f64>>(7)?, // sws
                    row.get::<_, Option<f64>>(8)?, // igst
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut map: BoeShipmentMap = HashMap::new();
        for r in it {
            let (part, desc, qty, price, hsn, line_total, bcd, sws, igst) =
                r.map_err(|e| e.to_string())?;
            map.insert(
                part.clone(),
                (
                    desc,
                    qty,
                    price,
                    hsn,
                    line_total,
                    bcd.unwrap_or(0.0),
                    sws.unwrap_or(0.0),
                    igst.unwrap_or(0.0),
                ),
            );
        }
        map
    };

    // Build reconciliation rows by matching calculated items to shipment items and itemInputs (for method)
    let mut rows_out: Vec<ReconciledItemRow> = Vec::new();
    let mut actual_total_sum = 0.0;
    let mut boe_total_sum = 0.0;
    let mut savings_sum = 0.0;

    for it in &saved.calculation_result.calculated_items {
        if let Some((
            desc,
            qty,
            unit_price,
            hs_code,
            _line_total,
            act_bcd_rate,
            act_sws_rate,
            act_igst_rate,
        )) = shipment.get(&it.part_no).cloned()
        {
            let assessable = it.assessable_value;
            let actual_bcd = round_money(assessable * (act_bcd_rate / 100.0));
            let actual_sws = round_money(actual_bcd * (act_sws_rate / 100.0));
            let actual_igst =
                round_money((assessable + actual_bcd + actual_sws) * (act_igst_rate / 100.0));
            let actual_total = sum_money(&[actual_bcd, actual_sws, actual_igst]);

            let boe_total = sum_money(&[it.bcd_value, it.sws_value, it.igst_value]);
            let method = saved
                .item_inputs
                .iter()
                .find(|ii| ii.part_no == it.part_no)
                .map(|ii| ii.calculation_method.clone())
                .unwrap_or_else(|| "Standard".to_string());
            let savings = if method == "Standard" {
                0.0
            } else {
                round_money((actual_total - boe_total).max(0.0))
            };

            actual_total_sum = sum_money(&[actual_total_sum, actual_total]);
            boe_total_sum = sum_money(&[boe_total_sum, boe_total]);
            savings_sum = sum_money(&[savings_sum, savings]);

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
pub fn save_boe_attachment_file(
    app: tauri::AppHandle,
    id: String,
    src_path: String,
) -> Result<String, String> {
    log::debug!("📄 [RUST] Starting BOE attachment file save...");
    log::debug!("📄 [RUST] BOE ID: {id}");
    log::debug!("📄 [RUST] Source path: {src_path}");

    let base = app.path().app_data_dir().map_err(|e| {
        log::debug!("❌ [RUST] Failed to get app data directory: {e}");
        e.to_string()
    })?;
    log::debug!("📄 [RUST] App data base directory: {base:?}");

    let attach_dir = base.join("attachments").join(&id);
    log::debug!("📄 [RUST] Attachment directory: {attach_dir:?}");

    std::fs::create_dir_all(&attach_dir).map_err(|e| {
        log::debug!("❌ [RUST] Failed to create attachment directory: {e}");
        e.to_string()
    })?;
    log::debug!("✅ [RUST] Attachment directory created successfully");

    let file_name = std::path::Path::new(&src_path)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| {
            log::debug!("❌ [RUST] Invalid source file name");
            "Invalid source file name".to_string()
        })?;
    log::debug!("📄 [RUST] Extracted filename: {file_name}");

    let dest_path = attach_dir.join(file_name);
    log::debug!("📄 [RUST] Destination path: {dest_path:?}");

    std::fs::copy(&src_path, &dest_path).map_err(|e| {
        log::debug!("❌ [RUST] Failed to copy file: {e}");
        e.to_string()
    })?;
    log::debug!("✅ [RUST] File copied successfully");

    let result_path = dest_path.to_string_lossy().to_string();
    log::debug!("✅ [RUST] Returning saved path: {result_path}");
    Ok(result_path)
}

// --- Save an item photo into app data attachments/items and return saved path ---
#[tauri::command]
pub fn save_item_photo_file(app: tauri::AppHandle, src_path: String) -> Result<String, String> {
    log::debug!("🖼️ [RUST] Starting item photo file save...");
    log::debug!("🖼️ [RUST] Source path: {src_path}");

    let base = app.path().app_data_dir().map_err(|e| {
        log::debug!("❌ [RUST] Failed to get app data directory: {e}");
        e.to_string()
    })?;
    log::debug!("🖼️ [RUST] App data base directory: {base:?}");

    let attach_dir = base.join("attachments").join("items");
    log::debug!("🖼️ [RUST] Item photo directory: {attach_dir:?}");

    std::fs::create_dir_all(&attach_dir).map_err(|e| {
        log::debug!("❌ [RUST] Failed to create item photo directory: {e}");
        e.to_string()
    })?;
    log::debug!("✅ [RUST] Item photo directory created successfully");

    let file_name = std::path::Path::new(&src_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("photo.png");
    log::debug!("🖼️ [RUST] Extracted filename: {file_name}");

    let dest_path = attach_dir.join(file_name);
    log::debug!("🖼️ [RUST] Destination path: {dest_path:?}");

    std::fs::copy(&src_path, &dest_path).map_err(|e| {
        log::debug!("❌ [RUST] Failed to copy item photo file: {e}");
        e.to_string()
    })?;
    log::debug!("✅ [RUST] Item photo file copied successfully");

    let result_path = dest_path.to_string_lossy().to_string();
    log::debug!("✅ [RUST] Returning saved item photo path: {result_path}");
    Ok(result_path)
}

/// Distinct shipment IDs that have at least one BOE calculation row (for shipment list filters).
#[tauri::command]
pub fn get_shipment_ids_with_boe_calculations(
    state: State<DbState>,
) -> Result<Vec<String>, String> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT shipment_id FROM boe_calculations
             WHERE shipment_id IS NOT NULL AND TRIM(shipment_id) != ''",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reconcile_boe_attachments_command(state: State<DbState>) -> Result<i64, String> {
    let conn = lock_conn(&state)?;
    let repaired = reconcile_boe_attachments(&conn).map_err(|e| e.to_string())?;
    Ok(repaired)
}

#[tauri::command]
pub fn validate_boe_integrity_command(state: State<DbState>) -> Result<serde_json::Value, String> {
    let conn = lock_conn(&state)?;
    let report = validate_boe_integrity(&conn).map_err(|e| e.to_string())?;
    serde_json::to_value(report).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_boe_largest_json_rows(
    limit: Option<i64>,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    let conn = lock_conn(&state)?;
    let rows = top_largest_json_rows(&conn, limit.unwrap_or(10)).map_err(|e| e.to_string())?;
    serde_json::to_value(rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn analyze_boe_query_plans_command(state: State<DbState>) -> Result<serde_json::Value, String> {
    let conn = lock_conn(&state)?;
    let findings = analyze_boe_query_plans(&conn).map_err(|e| e.to_string())?;
    let recommendations = index_recommendations_from_findings(&findings);
    let _ = crate::services::platform_reliability::save_index_recommendations(
        &conn,
        "boe_query_plan",
        &recommendations,
    );
    if !recommendations.is_empty() {
        for ddl in &recommendations {
            log::warn!(target: "import_manager::boe", "index_recommendation {}", ddl);
        }
    }
    serde_json::to_value(serde_json::json!({
        "findings": findings,
        "recommendations": recommendations
    }))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_boe_health_summary_command(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<serde_json::Value, String> {
    let conn = lock_conn(&state)?;
    let summary = get_boe_health_summary(
        &conn,
        connection_manager.db_path(),
        connection_manager.recent_metrics(),
        boe_json_cache_usage(),
    )
    .map_err(|e| e.to_string())?;
    serde_json::to_value(summary).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn recover_interrupted_boe_writes_command(state: State<DbState>) -> Result<i64, String> {
    let conn = lock_conn(&state)?;
    recover_interrupted_boe_writes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_global_integrity_command(
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    let conn = lock_conn(&state)?;
    let boe = validate_boe_integrity(&conn).map_err(|e| e.to_string())?;
    let orphan_calculations: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM boe_calculations bc LEFT JOIN boe_details bd ON bd.id = bc.boe_id WHERE bc.boe_id IS NOT NULL AND bd.id IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let orphan_invoices: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM invoices i LEFT JOIN shipments s ON s.id = i.shipment_id WHERE s.id IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    serde_json::to_value(serde_json::json!({
        "boe": boe,
        "orphanCalculations": orphan_calculations,
        "orphanInvoices": orphan_invoices
    }))
    .map_err(|e| e.to_string())
}
