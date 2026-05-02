use crate::commands::dashboard_cache;
use crate::connection_manager::ConnectionManager;
use crate::services::platform_reliability::save_index_recommendations;
use crate::services::shipment_service::{
    add_shipment_with_validation, analyze_shipment_query_plans, apply_shipment_date_normalization,
    check_shipment_duplicate as check_shipment_duplicate_service, check_timezone_consistency,
    detect_invalid_date_rows, fetch_shipment_items_by_shipment_id, fetch_shipments,
    fetch_shipments_paginated, invalid_shipment_dates_csv, log_shipment_query_plan_readiness,
    normalize_shipment_dates_dry_run, recent_shipments, shipment_exception_summary,
    shipment_index_recommendations_from_findings, shipment_totals_by_status,
    simulate_shipment_items_dual_write, snapshot_shipment_query_plan_baseline,
    timezone_validation_report, update_shipment_with_validation, InvalidShipmentDateRow,
    PaginatedResult, ShipmentDateNormalizationApplyReport, ShipmentDateNormalizationDryRunReport,
    ShipmentExceptionSummary, ShipmentItemLite, ShipmentQueryPlanBaseline,
    ShipmentQueryPlanFinding, ShipmentStatusTotal, ShipmentTimezoneValidationReport,
    TimezoneConsistencyReport,
};
use crate::correlation;
use crate::ipc_error::IpcError;
use crate::DbState;
use crate::Shipment;
use chrono::{NaiveDate, Utc};
use rusqlite::{params, Connection, ToSql};
use std::collections::HashSet;
use std::time::Instant;
use tauri::State;

#[tauri::command]
pub fn get_shipments(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<Vec<Shipment>, IpcError> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let shipments = fetch_shipments(&conn)?;

    connection_manager.track_query("get_shipments", started, shipments.len());
    let _ = state; // keep signature-compatible DI pattern
    Ok(shipments)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn get_shipments_paginated(
    page: i64,
    page_size: i64,
    status: Option<String>,
    supplier_id: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    overdue_only: Option<bool>,
    boe_missing_only: Option<bool>,
    expense_missing_only: Option<bool>,
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<PaginatedResult<Shipment>, IpcError> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let result = fetch_shipments_paginated(
        &conn,
        page,
        page_size,
        status.as_deref(),
        supplier_id.as_deref(),
        date_from.as_deref(),
        date_to.as_deref(),
        overdue_only,
        boe_missing_only,
        expense_missing_only,
    )?;
    connection_manager.track_query("get_shipments_paginated", started, result.data.len());
    let _ = state;
    Ok(PaginatedResult {
        data: result.data,
        total_count: result.total_count,
    })
}

#[tauri::command]
pub fn check_shipment_duplicate(
    shipment_id: Option<String>,
    invoice_number: String,
    exclude_id: Option<String>,
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<bool, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let is_duplicate = check_shipment_duplicate_service(
        &conn,
        shipment_id.as_deref(),
        &invoice_number,
        exclude_id.as_deref(),
    )?;
    connection_manager.track_query("check_shipment_duplicate", started, 1);
    let _ = state;
    Ok(is_duplicate)
}

#[tauri::command]
pub fn get_shipment_items_by_shipment_id(
    shipment_id: String,
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<Vec<ShipmentItemLite>, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let items = fetch_shipment_items_by_shipment_id(&conn, &shipment_id)?;
    connection_manager.track_query("get_shipment_items_by_shipment_id", started, items.len());
    let _ = state;
    Ok(items)
}

#[tauri::command]
pub fn get_shipment_exception_summary(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<ShipmentExceptionSummary, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let summary = shipment_exception_summary(&conn)?;
    connection_manager.track_query("get_shipment_exception_summary", started, 1);
    let _ = state;
    Ok(summary)
}

#[tauri::command]
pub fn get_shipment_totals_by_status(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<Vec<ShipmentStatusTotal>, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let totals = shipment_totals_by_status(&conn)?;
    connection_manager.track_query("get_shipment_totals_by_status", started, totals.len());
    let _ = state;
    Ok(totals)
}

#[tauri::command]
pub fn get_recent_shipments(
    limit: Option<i64>,
    status: Option<String>,
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<Vec<Shipment>, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let data = recent_shipments(&conn, limit.unwrap_or(20), status.as_deref())?;
    connection_manager.track_query("get_recent_shipments", started, data.len());
    let _ = state;
    Ok(data)
}

#[tauri::command]
pub fn analyze_shipment_query_plans_command(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<Vec<ShipmentQueryPlanFinding>, String> {
    let started = Instant::now();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let findings = analyze_shipment_query_plans(&conn)?;
    let recommendations = shipment_index_recommendations_from_findings(&findings);
    if !recommendations.is_empty() {
        let _ = save_index_recommendations(&conn, "shipment_query_plan_scan", &recommendations);
    }
    let _ = log_shipment_query_plan_readiness(&findings);
    connection_manager.track_query(
        "analyze_shipment_query_plans_command",
        started,
        findings.len(),
    );
    Ok(findings)
}

#[tauri::command]
pub fn simulate_shipment_items_dual_write_command(
    shipment_id: String,
    state: State<DbState>,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    simulate_shipment_items_dual_write(&conn, &shipment_id)
}

#[tauri::command]
pub fn detect_invalid_shipment_date_rows_command(
    state: State<DbState>,
) -> Result<Vec<InvalidShipmentDateRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    detect_invalid_date_rows(&conn)
}

#[tauri::command]
pub fn check_shipment_timezone_consistency_command(
    state: State<DbState>,
) -> Result<TimezoneConsistencyReport, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    check_timezone_consistency(&conn)
}

#[tauri::command]
pub fn export_invalid_shipment_dates_csv_command(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    invalid_shipment_dates_csv(&conn)
}

#[tauri::command]
pub fn normalize_shipment_dates_dry_run_command(
    state: State<DbState>,
) -> Result<ShipmentDateNormalizationDryRunReport, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    normalize_shipment_dates_dry_run(&conn)
}

#[tauri::command]
pub fn apply_shipment_date_normalization_command(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<ShipmentDateNormalizationApplyReport, String> {
    let started = Instant::now();
    let report = connection_manager.with_global_write_queue(|| {
        let mut conn = state.db.lock().map_err(|e| e.to_string())?;
        apply_shipment_date_normalization(&mut conn)
    })?;
    connection_manager.track_query(
        "apply_shipment_date_normalization_command",
        started,
        report.rows_updated as usize,
    );
    Ok(report)
}

#[tauri::command]
pub fn shipment_timezone_validation_report_command(
    state: State<DbState>,
) -> Result<ShipmentTimezoneValidationReport, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    timezone_validation_report(&conn)
}

#[tauri::command]
pub fn snapshot_shipment_query_plan_baseline_command(
    state: State<DbState>,
) -> Result<ShipmentQueryPlanBaseline, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    snapshot_shipment_query_plan_baseline(&conn)
}

#[tauri::command]
#[allow(dead_code)]
pub fn get_shipment_by_id(
    state: State<DbState>,
    id: String,
    connection_manager: State<ConnectionManager>,
) -> Result<Option<Shipment>, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
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
        Ok(shipment) => {
            connection_manager.track_query("get_shipment_by_id", started, 1);
            let _ = state;
            Ok(Some(shipment))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn add_shipment(
    state: State<DbState>,
    shipment: Shipment,
    connection_manager: State<ConnectionManager>,
) -> Result<(), String> {
    let started = Instant::now();
    connection_manager.with_global_write_queue(|| {
        let mut conn = state.db.lock().map_err(|e| e.to_string())?;
        add_shipment_with_validation(&mut conn, &shipment)?;
        let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
        Ok(())
    })?;
    connection_manager.track_query("add_shipment", started, 1);
    Ok(())
}

#[tauri::command]
pub fn update_shipment(
    state: State<DbState>,
    shipment: Shipment,
    connection_manager: State<ConnectionManager>,
) -> Result<(), String> {
    let started = Instant::now();
    connection_manager.with_global_write_queue(|| {
        let mut conn = state.db.lock().map_err(|e| e.to_string())?;
        update_shipment_with_validation(&mut conn, &shipment)?;
        let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
        Ok(())
    })?;
    connection_manager.track_query("update_shipment", started, 1);
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
pub fn get_active_shipments(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<Vec<Shipment>, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
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

    connection_manager.track_query("get_active_shipments", started, shipments.len());
    let _ = state;
    Ok(shipments)
}

const SHIPMENT_BULK_INSERT_BATCH_SIZE: usize = 500;

const SHIPMENT_INSERT_SQL_PREFIX: &str = "INSERT INTO shipments (
                id, supplier_id, invoice_number, invoice_date, goods_category, 
                invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, 
                bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, 
                etd, eta, status, date_of_delivery, is_frozen
            ) ";

const SHIPMENT_ROW_VALUES_PLACEHOLDERS: &str =
    "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

fn push_shipment_sql_params<'a>(buf: &mut Vec<&'a dyn ToSql>, s: &'a Shipment) {
    buf.push(&s.id);
    buf.push(&s.supplier_id);
    buf.push(&s.invoice_number);
    buf.push(&s.invoice_date);
    buf.push(&s.goods_category);
    buf.push(&s.invoice_value);
    buf.push(&s.invoice_currency);
    buf.push(&s.incoterm);
    buf.push(&s.shipment_mode);
    buf.push(&s.shipment_type);
    buf.push(&s.bl_awb_number);
    buf.push(&s.bl_awb_date);
    buf.push(&s.vessel_name);
    buf.push(&s.container_number);
    buf.push(&s.gross_weight_kg);
    buf.push(&s.etd);
    buf.push(&s.eta);
    buf.push(&s.status);
    buf.push(&s.date_of_delivery);
    buf.push(&s.is_frozen);
}

fn log_shipment_bulk_import_failed(conn: &Connection, error_message: &str) {
    let details = serde_json::json!({ "error": error_message }).to_string();
    crate::services::user_activity_audit::log_activity(
        conn,
        None,
        "shipment_bulk_import",
        Some("shipment"),
        None,
        Some(&details),
        "FAILED",
    );
}

fn build_shipment_batch_insert_sql(row_count: usize) -> String {
    let mut sql = String::with_capacity(
        SHIPMENT_INSERT_SQL_PREFIX.len()
            + 8
            + row_count * (SHIPMENT_ROW_VALUES_PLACEHOLDERS.len() + 1),
    );
    sql.push_str(SHIPMENT_INSERT_SQL_PREFIX);
    sql.push_str("VALUES ");
    for i in 0..row_count {
        if i > 0 {
            sql.push(',');
        }
        sql.push_str(SHIPMENT_ROW_VALUES_PLACEHOLDERS);
    }
    sql
}

/// Inserts shipment rows in a transaction. On any error the transaction is rolled back when this
/// returns and `conn` is free for follow-up logging.
fn run_shipment_bulk_import_transaction(
    conn: &mut Connection,
    shipments: Vec<Shipment>,
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Transaction start failed: {}", e))?;

    let single_row_insert = format!(
        "{}VALUES {}",
        SHIPMENT_INSERT_SQL_PREFIX, SHIPMENT_ROW_VALUES_PLACEHOLDERS
    );

    let mut row_offset = 0usize;
    for chunk in shipments.chunks(SHIPMENT_BULK_INSERT_BATCH_SIZE) {
        let batch_sql = build_shipment_batch_insert_sql(chunk.len());
        let mut flat_params: Vec<&dyn ToSql> = Vec::with_capacity(chunk.len() * 20);
        for s in chunk {
            push_shipment_sql_params(&mut flat_params, s);
        }

        if let Err(batch_err) = tx.execute(batch_sql.as_str(), flat_params.as_slice()) {
            for (i, shipment) in chunk.iter().enumerate() {
                let mut row_params: Vec<&dyn ToSql> = Vec::with_capacity(20);
                push_shipment_sql_params(&mut row_params, shipment);
                if let Err(e) = tx.execute(single_row_insert.as_str(), row_params.as_slice()) {
                    return Err(format!(
                        "Insert failed at row {}: {}",
                        row_offset + i + 1,
                        e
                    ));
                }
            }
            return Err(format!(
                "Insert failed at row {}: {}",
                row_offset + 1,
                batch_err
            ));
        }

        row_offset += chunk.len();
    }

    tx.commit()
        .map_err(|e| format!("Transaction commit failed: {}", e))?;
    Ok(())
}

pub(crate) fn add_shipments_bulk_inner(
    conn: &mut Connection,
    shipments: Vec<Shipment>,
    file_name: String,
    total_rows: usize,
    skipped_rows: usize,
    error_rows: usize,
) -> Result<(), String> {
    let inserted_rows_on_success = shipments.len();
    if let Err(msg) = run_shipment_bulk_import_transaction(conn, shipments) {
        let _ = insert_shipment_import_log(
            conn,
            file_name.clone(),
            total_rows,
            0,
            skipped_rows,
            error_rows,
            "FAILED".to_string(),
        );
        log_shipment_bulk_import_failed(conn, &msg);
        return Err(msg);
    }

    let _ = insert_shipment_import_log(
        conn,
        file_name,
        total_rows,
        inserted_rows_on_success,
        skipped_rows,
        error_rows,
        "SUCCESS".to_string(),
    );

    crate::services::user_activity_audit::log_activity(
        conn,
        None,
        "shipment_bulk_import",
        Some("shipment"),
        None,
        Some(&format!(
            "{{\"inserted_rows\": {}}}",
            inserted_rows_on_success
        )),
        "SUCCESS",
    );

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(conn);

    Ok(())
}

#[tauri::command]
pub fn add_shipments_bulk(
    state: State<DbState>,
    shipments: Vec<Shipment>,
    file_name: String,
    total_rows: usize,
    skipped_rows: usize,
    error_rows: usize,
) -> Result<(), String> {
    let cid = correlation::new_id();
    log::info!(
        target: "import_manager::shipments",
        "event=add_shipments_bulk correlation_id={} count={} file={}",
        cid,
        shipments.len(),
        file_name,
    );
    let mut conn = state.db.lock().unwrap();
    add_shipments_bulk_inner(
        &mut conn,
        shipments,
        file_name,
        total_rows,
        skipped_rows,
        error_rows,
    )
    .map_err(|e| correlation::annotate_err(&cid, e))
}

fn insert_shipment_import_log(
    conn: &Connection,
    file_name: String,
    total_rows: usize,
    inserted_rows: usize,
    skipped_rows: usize,
    error_rows: usize,
    status: String,
) -> Result<(), String> {
    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO shipment_import_log (
            file_name,
            total_rows,
            inserted_rows,
            skipped_rows,
            error_rows,
            status,
            created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            file_name,
            total_rows as i64,
            inserted_rows as i64,
            skipped_rows as i64,
            error_rows as i64,
            status,
            created_at
        ],
    )
    .map_err(|e| format!("Failed to log shipment import result: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn log_shipment_import_result(
    state: State<DbState>,
    file_name: String,
    total_rows: usize,
    inserted_rows: usize,
    skipped_rows: usize,
    error_rows: usize,
    status: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    insert_shipment_import_log(
        &conn,
        file_name,
        total_rows,
        inserted_rows,
        skipped_rows,
        error_rows,
        status,
    )
}

#[tauri::command]
pub fn get_unfinalized_shipments(
    state: State<DbState>,
    connection_manager: State<ConnectionManager>,
) -> Result<Vec<Shipment>, String> {
    let started = Instant::now();
    let conn = connection_manager.get_read_connection()?;
    let shipments = fetch_unfinalized_shipments(&conn)?;
    connection_manager.track_query("get_unfinalized_shipments", started, shipments.len());
    let _ = state;
    println!(
        "get_unfinalized_shipments found {} available shipments",
        shipments.len()
    );
    Ok(shipments)
}

fn fetch_unfinalized_shipments(conn: &Connection) -> Result<Vec<Shipment>, String> {
    let start = Instant::now();
    // We want shipments that:
    // 1. Are not frozen (is_frozen = 0)
    // 2. Are not in a terminal status (delivered, cancelled, finalized, closed)
    // 3. DO NOT have an associated invoice yet
    let query_sql =
        "SELECT s.id, s.supplier_id, s.invoice_number, s.invoice_date, s.goods_category, 
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

    let mut stmt = conn.prepare(query_sql).map_err(|e| e.to_string())?;

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
pub fn validate_shipment_import(
    shipments: Vec<Shipment>,
    state: State<DbState>,
) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    let conn = state.db.lock().unwrap();

    let mut supplier_ids = HashSet::new();
    let mut supplier_stmt = conn
        .prepare(
            "SELECT id FROM suppliers WHERE deleted_at IS NULL
             UNION
             SELECT id FROM service_providers WHERE deleted_at IS NULL",
        )
        .map_err(|e| {
            let msg = format!("Failed to prepare supplier lookup: {}", e);
            log_shipment_bulk_import_failed(&conn, &msg);
            msg
        })?;
    let supplier_rows = supplier_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| {
            let msg = format!("Failed to query supplier IDs: {}", e);
            log_shipment_bulk_import_failed(&conn, &msg);
            msg
        })?;
    for supplier_id in supplier_rows {
        supplier_ids.insert(supplier_id.map_err(|e| format!("Failed to read supplier ID: {}", e))?);
    }

    for (index, shipment) in shipments.iter().enumerate() {
        if shipment.invoice_number.is_empty() {
            errors.push(format!("Row {}: Invoice number is required", index + 1));
        }
        let supplier_id = shipment.supplier_id.trim();
        if supplier_id.is_empty() {
            errors.push(format!("Row {}: Supplier ID is required", index + 1));
        } else if !supplier_ids.contains(supplier_id) {
            errors.push(format!(
                "Row {}: Supplier ID '{}' does not exist",
                index + 1,
                shipment.supplier_id
            ));
        }
        let invoice_date = shipment.invoice_date.trim();
        if invoice_date.is_empty() {
            errors.push(format!("Row {}: Invoice date is required", index + 1));
        } else if NaiveDate::parse_from_str(invoice_date, "%Y-%m-%d").is_err() {
            errors.push(format!(
                "Row {}: Invalid invoice date format. Use YYYY-MM-DD",
                index + 1
            ));
        }
        if shipment.invoice_value <= 0.0 {
            errors.push(format!(
                "Row {}: Invoice value must be greater than 0",
                index + 1
            ));
        }

        let optional_date_fields = [
            (
                "B/L date",
                shipment.bl_awb_date.as_deref().map(str::trim).unwrap_or(""),
            ),
            ("ETD", shipment.etd.as_deref().map(str::trim).unwrap_or("")),
            ("ETA", shipment.eta.as_deref().map(str::trim).unwrap_or("")),
            (
                "Date of delivery",
                shipment
                    .date_of_delivery
                    .as_deref()
                    .map(str::trim)
                    .unwrap_or(""),
            ),
        ];
        for (label, date_value) in optional_date_fields {
            if !date_value.is_empty() && NaiveDate::parse_from_str(date_value, "%Y-%m-%d").is_err()
            {
                errors.push(format!(
                    "Row {}: Invalid {} format. Use YYYY-MM-DD",
                    index + 1,
                    label
                ));
            }
        }
    }

    if !errors.is_empty() {
        let details = serde_json::json!({
            "error": "validation failed",
            "validation_errors": errors.clone(),
        })
        .to_string();
        crate::services::user_activity_audit::log_activity(
            &conn,
            None,
            "shipment_bulk_import",
            Some("shipment"),
            None,
            Some(&details),
            "FAILED",
        );
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
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE invoices (
                id TEXT PRIMARY KEY NOT NULL,
                shipment_id TEXT NOT NULL,
                status TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

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
        )
        .unwrap();

        let available = fetch_unfinalized_shipments(&conn).unwrap();

        assert_eq!(available.len(), 1);
        assert_eq!(available[0].id, "s1");
    }
}
