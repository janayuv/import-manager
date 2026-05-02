use crate::connection_manager::{ConnectionManager, QueryMetric};
use crate::services::boe_service::{
    get_boe_health_summary, index_recommendations_from_findings, recover_interrupted_boe_writes,
    validate_boe_integrity,
};
use rusqlite::{params, Connection};
use serde::Serialize;
use sysinfo::System;
use uuid::Uuid;

const MEMORY_WATERMARK_BYTES: u64 = 1_200_000_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemIntegrityReport {
    pub boe_orphan_attachment_rows: i64,
    pub boe_invalid_shipment_refs: i64,
    pub boe_invalid_status_rows: i64,
    pub boe_mismatched_total_rows: i64,
    pub orphan_invoices: i64,
    pub orphan_invoice_lines: i64,
    pub orphan_boe_calculations: i64,
    pub orphan_shipment_items: i64,
    pub missing_shipment_supplier_links: i64,
    pub invalid_shipment_status_rows: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformHealthSummary {
    pub process_memory_bytes: u64,
    pub memory_watermark_exceeded: bool,
    pub boe_health: serde_json::Value,
    pub pending_recovery_ops: i64,
    pub index_recommendation_count: i64,
}

#[allow(dead_code)]
pub fn record_write_start(
    conn: &Connection,
    module: &str,
    operation: &str,
    entity_id: Option<&str>,
) -> Result<String, String> {
    let id = format!("WRJ-{}", Uuid::new_v4());
    conn.execute(
        "INSERT INTO write_recovery_journal (id, module, operation, entity_id, status) VALUES (?1, ?2, ?3, ?4, 'started')",
        params![id, module, operation, entity_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[allow(dead_code)]
pub fn record_write_finish(conn: &Connection, id: &str, status: &str, err: Option<&str>) {
    let _ = conn.execute(
        "UPDATE write_recovery_journal SET status = ?2, error_message = ?3, finished_at = (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')) WHERE id = ?1",
        params![id, status, err],
    );
}

pub fn recover_interrupted_writes(conn: &Connection) -> Result<i64, String> {
    let mut fixed = 0_i64;
    // BOE specialized recovery first.
    fixed += recover_interrupted_boe_writes(conn).map_err(|e| e.to_string())?;
    // Mark stale started journal rows as failed so they are visible.
    let changed = conn
        .execute(
            "UPDATE write_recovery_journal SET status='failed', finished_at=(strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')), error_message=COALESCE(error_message, 'auto-marked during startup recovery')
             WHERE status='started'",
            [],
        )
        .map_err(|e| e.to_string())?;
    fixed += changed as i64;
    Ok(fixed)
}

pub fn process_memory_bytes() -> u64 {
    let mut sys = System::new_all();
    sys.refresh_all();
    if let Ok(pid) = sysinfo::get_current_pid() {
        if let Some(proc_) = sys.process(pid) {
            return proc_.memory() * 1024;
        }
    }
    0
}

pub fn enforce_memory_watermark(json_cache_usage: usize) {
    let mem = process_memory_bytes();
    if mem > MEMORY_WATERMARK_BYTES {
        log::warn!(
            target: "import_manager::reliability",
            "memory watermark exceeded bytes={} json_cache_usage={}",
            mem,
            json_cache_usage
        );
    }
}

pub fn validate_system_integrity(conn: &Connection) -> Result<SystemIntegrityReport, String> {
    let boe = validate_boe_integrity(conn).map_err(|e| e.to_string())?;
    let orphan_invoices: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM invoices i LEFT JOIN shipments s ON s.id=i.shipment_id WHERE s.id IS NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let orphan_invoice_lines: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM invoice_line_items li LEFT JOIN invoices i ON i.id=li.invoice_id WHERE i.id IS NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let orphan_boe_calculations: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM boe_calculations bc LEFT JOIN boe_details bd ON bd.id = bc.boe_id WHERE bc.boe_id IS NOT NULL AND bd.id IS NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let shipment_items_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shipment_items'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let orphan_shipment_items: i64 = if shipment_items_exists > 0 {
        conn.query_row(
            "SELECT COUNT(*) FROM shipment_items si LEFT JOIN shipments s ON s.id = si.shipment_id WHERE s.id IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0
    };
    let missing_shipment_supplier_links: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments s LEFT JOIN suppliers sp ON sp.id = s.supplier_id WHERE sp.id IS NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let invalid_shipment_status_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments
             WHERE status IS NOT NULL
               AND trim(status) != ''
               AND lower(status) NOT IN (
                    'docs-rcvd', 'docu-received', 'in-transit', 'customs-clearance',
                    'ready-dly', 'delivered', 'cancelled', 'finalized', 'closed', 'completed'
               )
               AND lower(status) NOT IN (SELECT lower(value) FROM shipment_statuses)",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(SystemIntegrityReport {
        boe_orphan_attachment_rows: boe.orphan_attachment_rows,
        boe_invalid_shipment_refs: boe.invalid_shipment_refs,
        boe_invalid_status_rows: boe.invalid_status_rows,
        boe_mismatched_total_rows: boe.mismatched_total_rows,
        orphan_invoices,
        orphan_invoice_lines,
        orphan_boe_calculations,
        orphan_shipment_items,
        missing_shipment_supplier_links,
        invalid_shipment_status_rows,
    })
}

pub fn save_index_recommendations(
    conn: &Connection,
    source_query: &str,
    recommendations: &[String],
) -> Result<(), String> {
    for ddl in recommendations {
        conn.execute(
            "INSERT INTO index_recommendation_history (id, recommendation_sql, source_query) VALUES (?1, ?2, ?3)",
            params![format!("IDXREC-{}", Uuid::new_v4()), ddl, source_query],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn get_index_recommendation_history_count(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM index_recommendation_history",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

pub fn platform_health_summary(
    conn: &Connection,
    connection_manager: &ConnectionManager,
    json_cache_usage: usize,
) -> Result<PlatformHealthSummary, String> {
    let metrics: Vec<QueryMetric> = connection_manager.recent_metrics();
    let boe_health = get_boe_health_summary(
        conn,
        connection_manager.db_path(),
        metrics,
        json_cache_usage,
    )
    .map_err(|e| e.to_string())?;
    let boe_health_value = serde_json::to_value(boe_health).map_err(|e| e.to_string())?;
    let pending_recovery_ops: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM write_recovery_journal WHERE status='started'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let process_memory_bytes = process_memory_bytes();
    Ok(PlatformHealthSummary {
        process_memory_bytes,
        memory_watermark_exceeded: process_memory_bytes > MEMORY_WATERMARK_BYTES,
        boe_health: boe_health_value,
        pending_recovery_ops,
        index_recommendation_count: get_index_recommendation_history_count(conn),
    })
}

#[allow(dead_code)]
pub fn derived_index_recommendations_for_boe_scan(
    findings: &[crate::services::boe_service::QueryPlanFinding],
) -> Vec<String> {
    index_recommendations_from_findings(findings)
}
