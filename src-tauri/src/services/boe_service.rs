use crate::connection_manager::QueryMetric;
use crate::db::{BoeDetails, SavedBoe};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use thiserror::Error;
// cspell:words igst BOEI

const MAX_JSON_BYTES: usize = 1_048_576;
const LARGE_JSON_WARN_BYTES: usize = 786_432;
const ALLOWED_STATUSES: &[&str] = &[
    "Awaiting BOE Data",
    "Discrepancy Found",
    "Reconciled",
    "Investigation",
    "Closed",
];

#[derive(Debug, Error)]
pub enum BoeError {
    #[error("DatabaseError: {0}")]
    DatabaseError(String),
    #[error("JsonParseError: {0}")]
    JsonParseError(String),
    #[error("ValidationError: {0}")]
    ValidationError(String),
    #[error("TransactionFailed: {0}")]
    TransactionFailed(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonPayloadInfo {
    pub boe_id: String,
    pub shipment_id: String,
    pub total_json_size: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoeIntegrityReport {
    pub orphan_attachment_rows: i64,
    pub invalid_shipment_refs: i64,
    pub invalid_status_rows: i64,
    pub mismatched_total_rows: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPlanFinding {
    pub query_name: String,
    pub detail: String,
    pub full_scan_risk: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoeHealthSummary {
    pub db_size_bytes: u64,
    pub total_db_rows: i64,
    pub boe_count: i64,
    pub boe_calculation_count: i64,
    pub largest_json_size: i64,
    pub slow_query_count: usize,
    pub slow_query_rate: f64,
    pub json_cache_usage: usize,
    pub recovery_pending_events: i64,
    pub recovery_completed_events: i64,
    pub recent_query_metrics: Vec<QueryMetric>,
}

static BOE_WRITE_QUEUE: OnceLock<Mutex<()>> = OnceLock::new();
static LARGE_JSON_STREAK: AtomicUsize = AtomicUsize::new(0);

pub fn with_boe_write_queue<T, F>(f: F) -> Result<T, BoeError>
where
    F: FnOnce() -> Result<T, BoeError>,
{
    let queue = BOE_WRITE_QUEUE.get_or_init(|| Mutex::new(()));
    let _guard = queue
        .lock()
        .map_err(|e| BoeError::TransactionFailed(format!("boe write queue poisoned: {e}")))?;
    f()
}

impl From<rusqlite::Error> for BoeError {
    fn from(value: rusqlite::Error) -> Self {
        Self::DatabaseError(value.to_string())
    }
}

impl From<serde_json::Error> for BoeError {
    fn from(value: serde_json::Error) -> Self {
        Self::JsonParseError(value.to_string())
    }
}

pub fn validate_boe_payload(payload: &BoeDetails) -> Result<(), BoeError> {
    if payload.be_number.trim().is_empty() {
        return Err(BoeError::ValidationError(
            "be_number is required".to_string(),
        ));
    }
    if payload.be_date.trim().is_empty() {
        return Err(BoeError::ValidationError("be_date is required".to_string()));
    }
    if payload.location.trim().is_empty() {
        return Err(BoeError::ValidationError(
            "location is required".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_saved_boe_payload(payload: &SavedBoe) -> Result<(), BoeError> {
    if payload.shipment_id.trim().is_empty() {
        return Err(BoeError::ValidationError(
            "shipment_id is required".to_string(),
        ));
    }
    if payload.invoice_number.trim().is_empty() {
        return Err(BoeError::ValidationError(
            "invoice_number is required".to_string(),
        ));
    }
    if payload.supplier_name.trim().is_empty() {
        return Err(BoeError::ValidationError(
            "supplier_name is required".to_string(),
        ));
    }
    if !ALLOWED_STATUSES.iter().any(|s| *s == payload.status) {
        return Err(BoeError::ValidationError(format!(
            "invalid status transition target: {}",
            payload.status
        )));
    }
    Ok(())
}

pub fn validate_status(status: &str) -> Result<(), BoeError> {
    if ALLOWED_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(BoeError::ValidationError(format!(
            "invalid status: {status}"
        )))
    }
}

pub fn ensure_json_size(label: &str, json: &str) -> Result<(), BoeError> {
    let size = json.len();
    if size > MAX_JSON_BYTES {
        return Err(BoeError::ValidationError(format!(
            "{label} exceeds safe size limit ({MAX_JSON_BYTES} bytes)"
        )));
    }
    if size > LARGE_JSON_WARN_BYTES {
        let streak = LARGE_JSON_STREAK.fetch_add(1, Ordering::SeqCst) + 1;
        log::warn!(
            target: "import_manager::boe",
            "large_json_payload label={} size_bytes={} streak={}",
            label,
            size,
            streak
        );
        if streak >= 3 {
            return Err(BoeError::ValidationError(
                "Payload processing throttled due to repeated oversized JSON records".to_string(),
            ));
        }
    } else {
        LARGE_JSON_STREAK.store(0, Ordering::SeqCst);
    }
    Ok(())
}

pub fn round_money(value: f64) -> f64 {
    crate::services::decimal_money::round_money(value)
}

pub fn sum_money(values: &[f64]) -> f64 {
    crate::services::decimal_money::sum_money(values)
}

pub fn reconcile_boe_attachments(conn: &Connection) -> Result<i64, BoeError> {
    let mut repaired = 0_i64;
    let mut stmt = conn.prepare(
        "SELECT id, attachments_json FROM boe_calculations WHERE attachments_json IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
    })?;
    for row in rows {
        let (boe_id, attachments_json) = row?;
        let Some(raw) = attachments_json else {
            continue;
        };
        let parsed: Vec<crate::db::Attachment> = serde_json::from_str(&raw).unwrap_or_default();
        for attachment in parsed {
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM boe_attachments WHERE id = ?1",
                params![attachment.id],
                |r| r.get(0),
            )?;
            if exists == 0 {
                conn.execute(
                    "INSERT INTO boe_attachments (id, boe_calculation_id, file_name, file_path, uploaded_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        attachment.id,
                        boe_id,
                        attachment.file_name,
                        attachment.url,
                        attachment.uploaded_at
                    ],
                )?;
                repaired += 1;
            }
        }
    }
    Ok(repaired)
}

pub fn run_boe_maintenance(conn: &Connection) -> Result<(), BoeError> {
    let repaired = reconcile_boe_attachments(conn)?;
    if repaired > 0 {
        log::warn!(
            target: "import_manager::boe",
            "maintenance=reconcile_boe_attachments repaired_rows={}",
            repaired
        );
    }
    conn.execute("ANALYZE boe_calculations", [])?;
    conn.execute("ANALYZE boe_details", [])?;
    let oversized_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM boe_calculations
         WHERE length(item_inputs_json) > ?1 OR length(calculation_result_json) > ?1 OR length(COALESCE(attachments_json, '')) > ?1",
        params![MAX_JSON_BYTES as i64],
        |r| r.get(0),
    )?;
    if oversized_count > 0 {
        log::warn!(
            target: "import_manager::boe",
            "maintenance=oversized_json_detected records={}",
            oversized_count
        );
    }
    Ok(())
}

pub fn top_largest_json_rows(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<JsonPayloadInfo>, BoeError> {
    let mut stmt = conn.prepare(
        "SELECT id, shipment_id,
         length(COALESCE(item_inputs_json, '')) + length(COALESCE(calculation_result_json, '')) + length(COALESCE(attachments_json, '')) AS total_json_size
         FROM boe_calculations
         ORDER BY total_json_size DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit.max(1)], |row| {
        Ok(JsonPayloadInfo {
            boe_id: row.get(0)?,
            shipment_id: row.get(1)?,
            total_json_size: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(BoeError::from)
}

pub fn validate_boe_integrity(conn: &Connection) -> Result<BoeIntegrityReport, BoeError> {
    let orphan_attachment_rows: i64 = conn.query_row(
        "SELECT COUNT(*) FROM boe_attachments ba
         LEFT JOIN boe_calculations bc ON bc.id = ba.boe_calculation_id
         WHERE bc.id IS NULL",
        [],
        |r| r.get(0),
    )?;
    let invalid_shipment_refs: i64 = conn.query_row(
        "SELECT COUNT(*) FROM boe_calculations bc
         LEFT JOIN shipments s ON s.id = bc.shipment_id
         WHERE s.id IS NULL",
        [],
        |r| r.get(0),
    )?;
    let invalid_status_rows: i64 = conn.query_row(
        "SELECT COUNT(*) FROM boe_calculations
         WHERE status NOT IN ('Awaiting BOE Data', 'Discrepancy Found', 'Reconciled', 'Investigation', 'Closed')",
        [],
        |r| r.get(0),
    )?;
    // Partial JSON extraction: parse only customsDutyTotal from payload JSON
    let mut mismatched_total_rows = 0_i64;
    let mut stmt = conn.prepare("SELECT id, calculation_result_json FROM boe_calculations")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (_id, json) = row?;
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) {
            let total = value
                .get("customsDutyTotal")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if !total.is_finite() {
                mismatched_total_rows += 1;
            }
        } else {
            mismatched_total_rows += 1;
        }
    }
    Ok(BoeIntegrityReport {
        orphan_attachment_rows,
        invalid_shipment_refs,
        invalid_status_rows,
        mismatched_total_rows,
    })
}

pub fn analyze_boe_query_plans(conn: &Connection) -> Result<Vec<QueryPlanFinding>, BoeError> {
    let queries = [
        ("boe_list", "EXPLAIN QUERY PLAN SELECT id, be_number, be_date FROM boe_details ORDER BY be_date DESC LIMIT 50"),
        ("boe_calc_list", "EXPLAIN QUERY PLAN SELECT id, shipment_id, status FROM boe_calculations ORDER BY created_at DESC LIMIT 50"),
        ("boe_shipments", "EXPLAIN QUERY PLAN SELECT s.id FROM shipments s JOIN invoices i ON i.shipment_id = s.id WHERE i.status='Finalized'"),
    ];
    let mut findings = Vec::new();
    for (query_name, sql) in queries {
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(3))?;
        for detail in rows {
            let detail = detail?;
            let full_scan_risk = detail.to_ascii_uppercase().contains("SCAN");
            if full_scan_risk {
                log::warn!(
                    target: "import_manager::boe",
                    "query_plan_risk query={} detail={}",
                    query_name,
                    detail
                );
            }
            findings.push(QueryPlanFinding {
                query_name: query_name.to_string(),
                detail,
                full_scan_risk,
            });
        }
    }
    Ok(findings)
}

pub fn index_recommendations_from_findings(findings: &[QueryPlanFinding]) -> Vec<String> {
    let mut recommendations = Vec::new();
    for finding in findings {
        if !finding.full_scan_risk {
            continue;
        }
        let detail = finding.detail.to_ascii_lowercase();
        if detail.contains("boe_calculations") {
            recommendations.push(
                "CREATE INDEX IF NOT EXISTS idx_boe_calc_created_status ON boe_calculations(created_at, status);"
                    .to_string(),
            );
        }
        if detail.contains("boe_details") {
            recommendations.push(
                "CREATE INDEX IF NOT EXISTS idx_boe_details_date_number ON boe_details(be_date, be_number);"
                    .to_string(),
            );
        }
        if detail.contains("shipments") {
            recommendations.push(
                "CREATE INDEX IF NOT EXISTS idx_shipments_invoice_date_status ON shipments(invoice_date, status);"
                    .to_string(),
            );
        }
    }
    recommendations.sort();
    recommendations.dedup();
    recommendations
}

pub fn recover_interrupted_boe_writes(conn: &Connection) -> Result<i64, BoeError> {
    let mut repaired = 0_i64;
    let mut stmt = conn.prepare(
        "SELECT id, boe_calculation_id, operation FROM boe_write_recovery WHERE status = 'pending'",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<String>>(1)?,
            r.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (event_id, boe_calc_id, operation) = row?;
        if operation == "upsert_boe_calculation" {
            if let Some(boe_id) = boe_calc_id {
                // Rehydrate secondary tables from source-of-truth JSON.
                let _ = reconcile_boe_attachments(conn)?;
                conn.execute(
                    "DELETE FROM boe_items WHERE boe_calculation_id = ?1",
                    params![&boe_id],
                )?;
                let calc_json: Option<String> = conn
                    .query_row(
                        "SELECT calculation_result_json FROM boe_calculations WHERE id = ?1",
                        params![&boe_id],
                        |r| r.get(0),
                    )
                    .ok();
                if let Some(json) = calc_json {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) {
                        if let Some(items) = value.get("calculatedItems").and_then(|v| v.as_array())
                        {
                            for item in items {
                                let part =
                                    item.get("partNo").and_then(|v| v.as_str()).unwrap_or("");
                                let assessable = item
                                    .get("assessableValue")
                                    .and_then(|v| v.as_f64())
                                    .unwrap_or(0.0);
                                let bcd =
                                    item.get("bcdValue").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                let sws =
                                    item.get("swsValue").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                let igst = item
                                    .get("igstValue")
                                    .and_then(|v| v.as_f64())
                                    .unwrap_or(0.0);
                                let total = sum_money(&[bcd, sws, igst]);
                                conn.execute(
                                    "INSERT OR REPLACE INTO boe_items (id, boe_calculation_id, item_id, assessable_value, bcd_rate, sws_rate, igst_rate, total)
                                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                                    params![
                                        format!("BOEI-{}-{}", boe_id, part),
                                        &boe_id,
                                        part,
                                        assessable,
                                        bcd,
                                        sws,
                                        igst,
                                        total
                                    ],
                                )?;
                            }
                        }
                    }
                }
            }
        }
        conn.execute(
            "UPDATE boe_write_recovery SET status = 'completed' WHERE id = ?1",
            params![event_id],
        )?;
        repaired += 1;
    }
    Ok(repaired)
}

pub fn get_boe_health_summary(
    conn: &Connection,
    db_path: &std::path::Path,
    metrics: Vec<QueryMetric>,
    json_cache_usage: usize,
) -> Result<BoeHealthSummary, BoeError> {
    let boe_count: i64 = conn.query_row("SELECT COUNT(*) FROM boe_details", [], |r| r.get(0))?;
    let boe_calculation_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM boe_calculations", [], |r| r.get(0))?;
    let largest_json_size: i64 = conn.query_row(
        "SELECT COALESCE(MAX(length(COALESCE(item_inputs_json, '')) + length(COALESCE(calculation_result_json, '')) + length(COALESCE(attachments_json, ''))), 0) FROM boe_calculations",
        [],
        |r| r.get(0),
    )?;
    let db_size_bytes = std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    let total_db_rows: i64 = conn.query_row(
        "SELECT
         (SELECT COUNT(*) FROM suppliers) +
         (SELECT COUNT(*) FROM shipments) +
         (SELECT COUNT(*) FROM invoices) +
         (SELECT COUNT(*) FROM invoice_line_items) +
         (SELECT COUNT(*) FROM items) +
         (SELECT COUNT(*) FROM boe_details) +
         (SELECT COUNT(*) FROM boe_calculations)",
        [],
        |r| r.get(0),
    )?;
    let recovery_pending_events: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM boe_write_recovery WHERE status = 'pending'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let recovery_completed_events: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM boe_write_recovery WHERE status = 'completed'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let slow_query_count = metrics.iter().filter(|m| m.duration_ms > 200).count();
    let slow_query_rate = if metrics.is_empty() {
        0.0
    } else {
        slow_query_count as f64 / metrics.len() as f64
    };
    Ok(BoeHealthSummary {
        db_size_bytes,
        total_db_rows,
        boe_count,
        boe_calculation_count,
        largest_json_size,
        slow_query_count,
        slow_query_rate,
        json_cache_usage,
        recovery_pending_events,
        recovery_completed_events,
        recent_query_metrics: metrics,
    })
}

#[cfg(test)]
mod boe_money_tests {
    use super::{round_money, sum_money};

    #[test]
    fn boe_value_components_use_shared_decimal_helpers() {
        // Same path as invoice-style totals; values chosen to avoid binary f64 drift at cents.
        assert!((sum_money(&[10.006, 3.004]) - 13.01).abs() < 1e-9);
        assert!((round_money(10.006) - 10.01).abs() < 1e-9);
    }
}
