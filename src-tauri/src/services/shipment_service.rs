use crate::Shipment;
use chrono::{Local, NaiveDate, NaiveDateTime};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashSet;
use std::time::Instant;
use uuid::Uuid;

const DEFAULT_SHIPMENT_STATUS: &str = "docs-rcvd";
const STARTUP_INVALID_DATE_SIGNATURE_KEY: &str = "shipment.invalid_date_rows.startup_signature.v1";
const STARTUP_INVALID_DATE_LAST_COUNT_KEY: &str =
    "shipment.invalid_date_rows.startup_last_count.v1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResult<T> {
    pub data: Vec<T>,
    pub total_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentItemLite {
    pub id: String,
    pub invoice_id: String,
    pub item_id: String,
    pub part_number: String,
    pub item_description: String,
    pub quantity: f64,
    pub unit_price: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentExceptionSummary {
    pub overdue_count: i64,
    pub boe_missing_count: i64,
    pub expense_missing_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentStatusTotal {
    pub status: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentQueryPlanFinding {
    pub query_name: String,
    pub details: Vec<String>,
    pub has_full_scan: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidShipmentDateRow {
    pub id: String,
    pub invoice_date: String,
    pub eta: Option<String>,
    pub issues: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimezoneConsistencyReport {
    pub system_offset_minutes: i32,
    pub sqlite_offset_minutes: i32,
    pub sqlite_now_utc: String,
    pub sqlite_now_local: String,
    pub mismatch_detected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentDateNormalizationProposal {
    pub shipment_id: String,
    pub current_invoice_date: String,
    pub current_eta: Option<String>,
    pub proposed_invoice_date: Option<String>,
    pub proposed_eta: Option<String>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentDateNormalizationDryRunReport {
    pub proposals: Vec<ShipmentDateNormalizationProposal>,
    pub total_candidates: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentDateNormalizationApplyReport {
    pub batch_id: String,
    pub rows_updated: i64,
    pub rows_skipped: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentStartupDateStabilizationReport {
    pub rows_repaired: i64,
    pub rows_skipped: i64,
    pub invalid_remaining: usize,
    pub repeated_signature: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentTimezoneRiskRow {
    pub shipment_id: String,
    pub invoice_date: String,
    pub eta: Option<String>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentTimezoneValidationReport {
    pub timezone_check: TimezoneConsistencyReport,
    pub risky_rows: Vec<ShipmentTimezoneRiskRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentQueryPlanBaseline {
    pub id: String,
    pub summary: String,
    pub findings_json: String,
    pub created_at: String,
}

pub fn validate_iso_date(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("date is required".to_string());
    }
    NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| format!("Invalid ISO date format: {trimmed} (expected YYYY-MM-DD)"))
}

fn normalize_date_candidate(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let formats = [
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d.%m.%Y", "%Y.%m.%d",
    ];
    for fmt in formats {
        if let Ok(d) = NaiveDate::parse_from_str(trimmed, fmt) {
            return Some(d.format("%Y-%m-%d").to_string());
        }
    }
    None
}

fn unresolved_signature(rows: &[InvalidShipmentDateRow]) -> String {
    let mut parts: Vec<String> = rows
        .iter()
        .map(|r| {
            format!(
                "{}|{}|{}",
                r.id,
                r.invoice_date.trim(),
                r.eta.as_deref().unwrap_or("").trim()
            )
        })
        .collect();
    parts.sort();
    parts.join(";")
}

fn upsert_app_metadata_value(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_metadata (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn map_shipment_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Shipment> {
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
}

pub fn fetch_shipments(conn: &Connection) -> Result<Vec<Shipment>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, supplier_id, invoice_number, invoice_date, goods_category,
             invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type,
             bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg,
             etd, eta, status, date_of_delivery, is_frozen
             FROM shipments
             ORDER BY invoice_date DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;

    let shipment_iter = stmt
        .query_map([], map_shipment_row)
        .map_err(|e| e.to_string())?;
    shipment_iter
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
pub fn fetch_shipments_paginated(
    conn: &Connection,
    page: i64,
    page_size: i64,
    status: Option<&str>,
    supplier_id: Option<&str>,
    date_from: Option<&str>,
    date_to: Option<&str>,
    overdue_only: Option<bool>,
    boe_missing_only: Option<bool>,
    expense_missing_only: Option<bool>,
) -> Result<PaginatedResult<Shipment>, String> {
    let safe_page = page.max(1);
    let safe_page_size = page_size.clamp(1, 100);
    let offset = (safe_page - 1) * safe_page_size;
    let status_filter = status.map(str::trim).filter(|s| !s.is_empty());
    let supplier_filter = supplier_id.map(str::trim).filter(|s| !s.is_empty());
    let date_from_filter = date_from.map(str::trim).filter(|s| !s.is_empty());
    let date_to_filter = date_to.map(str::trim).filter(|s| !s.is_empty());
    let overdue_flag = overdue_only.unwrap_or(false);
    let boe_missing_flag = boe_missing_only.unwrap_or(false);
    let expense_missing_flag = expense_missing_only.unwrap_or(false);

    let where_clause = "
        WHERE (?1 IS NULL OR lower(s.status)=lower(?1))
          AND (?2 IS NULL OR s.supplier_id=?2)
          AND (?3 IS NULL OR s.invoice_date >= ?3)
          AND (?4 IS NULL OR s.invoice_date <= ?4)
          AND (?5 = 0 OR (s.eta IS NOT NULL AND trim(s.eta) != '' AND s.eta < CURRENT_DATE AND lower(COALESCE(s.status, '')) != 'delivered'))
          AND (?6 = 0 OR NOT EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id))
          AND (?7 = 0 OR NOT EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = s.id))
    ";

    let count_sql = format!("SELECT COUNT(*) FROM shipments s {where_clause}");
    let total_count: i64 = conn
        .query_row(
            &count_sql,
            params![
                status_filter,
                supplier_filter,
                date_from_filter,
                date_to_filter,
                overdue_flag,
                boe_missing_flag,
                expense_missing_flag
            ],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let query = format!(
        "SELECT s.id, s.supplier_id, s.invoice_number, s.invoice_date, s.goods_category,
         s.invoice_value, s.invoice_currency, s.incoterm, s.shipment_mode, s.shipment_type,
         s.bl_awb_number, s.bl_awb_date, s.vessel_name, s.container_number, s.gross_weight_kg,
         s.etd, s.eta, s.status, s.date_of_delivery, s.is_frozen
         FROM shipments s
         {where_clause}
         ORDER BY s.invoice_date DESC, s.id DESC
         LIMIT ?8 OFFSET ?9"
    );
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let shipment_iter = stmt
        .query_map(
            params![
                status_filter,
                supplier_filter,
                date_from_filter,
                date_to_filter,
                overdue_flag,
                boe_missing_flag,
                expense_missing_flag,
                safe_page_size,
                offset
            ],
            map_shipment_row,
        )
        .map_err(|e| e.to_string())?;
    let data = shipment_iter
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(PaginatedResult { data, total_count })
}

pub fn shipment_exception_summary(conn: &Connection) -> Result<ShipmentExceptionSummary, String> {
    let overdue_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments
             WHERE eta IS NOT NULL
               AND trim(eta) != ''
               AND eta < CURRENT_DATE
               AND lower(COALESCE(status, '')) != 'delivered'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let boe_missing_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments s
             WHERE NOT EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id)",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let expense_missing_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments s
             WHERE NOT EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = s.id)",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ShipmentExceptionSummary {
        overdue_count,
        boe_missing_count,
        expense_missing_count,
    })
}

pub fn shipment_totals_by_status(conn: &Connection) -> Result<Vec<ShipmentStatusTotal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(NULLIF(trim(status), ''), 'unknown') AS status, COUNT(*)
             FROM shipments
             GROUP BY COALESCE(NULLIF(trim(status), ''), 'unknown')
             ORDER BY COUNT(*) DESC, status ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ShipmentStatusTotal {
                status: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn recent_shipments(
    conn: &Connection,
    limit: i64,
    status: Option<&str>,
) -> Result<Vec<Shipment>, String> {
    let safe_limit = limit.clamp(1, 200);
    let status_filter = status.map(str::trim).filter(|s| !s.is_empty());
    let sql = if status_filter.is_some() {
        "SELECT id, supplier_id, invoice_number, invoice_date, goods_category,
         invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type,
         bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg,
         etd, eta, status, date_of_delivery, is_frozen
         FROM shipments
         WHERE lower(status)=lower(?1)
         ORDER BY invoice_date DESC, id DESC
         LIMIT ?2"
    } else {
        "SELECT id, supplier_id, invoice_number, invoice_date, goods_category,
         invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type,
         bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg,
         etd, eta, status, date_of_delivery, is_frozen
         FROM shipments
         ORDER BY invoice_date DESC, id DESC
         LIMIT ?1"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = if let Some(status_value) = status_filter {
        stmt.query_map(params![status_value, safe_limit], map_shipment_row)
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map(params![safe_limit], map_shipment_row)
            .map_err(|e| e.to_string())?
    };
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn analyze_shipment_query_plans(
    conn: &Connection,
) -> Result<Vec<ShipmentQueryPlanFinding>, String> {
    let queries = vec![
        (
            "get_shipments_paginated",
            "SELECT s.id FROM shipments s
             WHERE (?1 IS NULL OR lower(s.status)=lower(?1))
               AND (?2 IS NULL OR s.supplier_id=?2)
               AND (?3 IS NULL OR s.invoice_date >= ?3)
               AND (?4 IS NULL OR s.invoice_date <= ?4)
             ORDER BY s.invoice_date DESC, s.id DESC
             LIMIT ?5 OFFSET ?6",
        ),
        (
            "shipment_exception_summary_overdue",
            "SELECT COUNT(*) FROM shipments
             WHERE eta IS NOT NULL
               AND trim(eta) != ''
               AND eta < CURRENT_DATE
               AND lower(COALESCE(status, '')) != 'delivered'",
        ),
        (
            "recent_shipments",
            "SELECT id FROM shipments ORDER BY invoice_date DESC, id DESC LIMIT 50",
        ),
    ];
    let mut findings = Vec::new();
    for (name, sql) in queries {
        let explain_sql = format!("EXPLAIN QUERY PLAN {sql}");
        let mut stmt = conn.prepare(&explain_sql).map_err(|e| e.to_string())?;
        let details_iter = stmt
            .query_map([], |row| {
                let detail: String = row.get(3)?;
                Ok(detail)
            })
            .map_err(|e| e.to_string())?;
        let details = details_iter
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let has_full_scan = details.iter().any(|d| {
            d.to_uppercase().contains("SCAN") && !d.to_uppercase().contains("USING INDEX")
        });
        findings.push(ShipmentQueryPlanFinding {
            query_name: name.to_string(),
            details,
            has_full_scan,
        });
    }
    Ok(findings)
}

pub fn detect_invalid_date_rows(conn: &Connection) -> Result<Vec<InvalidShipmentDateRow>, String> {
    let mut stmt = conn
        .prepare("SELECT id, invoice_date, eta FROM shipments ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let invoice_date: String = row.get(1)?;
            let eta: Option<String> = row.get(2)?;
            Ok((id, invoice_date, eta))
        })
        .map_err(|e| e.to_string())?;
    let mut invalid = Vec::new();
    for row in rows {
        let (id, invoice_date, eta) = row.map_err(|e| e.to_string())?;
        let mut issues = Vec::new();
        if let Err(e) = validate_iso_date(&invoice_date) {
            issues.push(format!("invoice_date: {e}"));
        }
        if let Some(eta_value) = eta.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if let Err(e) = validate_iso_date(eta_value) {
                issues.push(format!("eta: {e}"));
            } else if let (Ok(inv), Ok(eta_date)) = (
                NaiveDate::parse_from_str(invoice_date.trim(), "%Y-%m-%d"),
                NaiveDate::parse_from_str(eta_value, "%Y-%m-%d"),
            ) {
                if inv > eta_date {
                    issues.push("invoice_date is after eta".to_string());
                }
            }
        }
        if !issues.is_empty() {
            invalid.push(InvalidShipmentDateRow {
                id,
                invoice_date,
                eta,
                issues,
            });
        }
    }
    if !invalid.is_empty() {
        let sample_ids = invalid
            .iter()
            .take(15)
            .map(|r| r.id.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        let more = invalid.len().saturating_sub(15);
        log::warn!(
            target: "import_manager::shipment",
            "invalid shipment date rows detected count={} sample_ids={} more={}",
            invalid.len(),
            sample_ids,
            more
        );
    }
    Ok(invalid)
}

pub fn invalid_shipment_dates_csv(conn: &Connection) -> Result<String, String> {
    let rows = detect_invalid_date_rows(conn)?;
    let mut csv = String::from("shipment_id,invoice_date,eta,issues\n");
    for row in rows {
        let issues = row.issues.join(" | ").replace('"', "'");
        let eta = row.eta.unwrap_or_default().replace('"', "'");
        let invoice_date = row.invoice_date.replace('"', "'");
        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\"\n",
            row.id.replace('"', "'"),
            invoice_date,
            eta,
            issues
        ));
    }
    Ok(csv)
}

pub fn normalize_shipment_dates_dry_run(
    conn: &Connection,
) -> Result<ShipmentDateNormalizationDryRunReport, String> {
    let mut stmt = conn
        .prepare("SELECT id, invoice_date, eta FROM shipments ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let invoice_date: String = row.get(1)?;
            let eta: Option<String> = row.get(2)?;
            Ok((id, invoice_date, eta))
        })
        .map_err(|e| e.to_string())?;
    let mut proposals = Vec::new();
    for row in rows {
        let (id, invoice_date, eta) = row.map_err(|e| e.to_string())?;
        let mut reasons = Vec::new();
        let normalized_invoice = if validate_iso_date(&invoice_date).is_ok() {
            None
        } else {
            let candidate = normalize_date_candidate(&invoice_date);
            if candidate.is_some() {
                reasons.push("invoice_date non-ISO convertible".to_string());
            } else {
                reasons.push("invoice_date non-ISO not convertible".to_string());
            }
            candidate
        };
        let normalized_eta =
            if let Some(eta_raw) = eta.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                if validate_iso_date(eta_raw).is_ok() {
                    None
                } else {
                    let candidate = normalize_date_candidate(eta_raw);
                    if candidate.is_some() {
                        reasons.push("eta non-ISO convertible".to_string());
                    } else {
                        reasons.push("eta non-ISO not convertible".to_string());
                    }
                    candidate
                }
            } else {
                None
            };
        if normalized_invoice.is_some() || normalized_eta.is_some() {
            proposals.push(ShipmentDateNormalizationProposal {
                shipment_id: id,
                current_invoice_date: invoice_date,
                current_eta: eta,
                proposed_invoice_date: normalized_invoice,
                proposed_eta: normalized_eta,
                reasons,
            });
        }
    }
    Ok(ShipmentDateNormalizationDryRunReport {
        total_candidates: proposals.len(),
        proposals,
    })
}

pub fn apply_shipment_date_normalization(
    conn: &mut Connection,
) -> Result<ShipmentDateNormalizationApplyReport, String> {
    let dry_run = normalize_shipment_dates_dry_run(conn)?;
    let batch_id = format!("SHIP-DATE-NORM-{}", Uuid::new_v4());
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut rows_updated = 0_i64;
    let mut rows_skipped = 0_i64;
    for proposal in dry_run.proposals {
        let new_invoice = proposal
            .proposed_invoice_date
            .clone()
            .unwrap_or_else(|| proposal.current_invoice_date.clone());
        let new_eta = match (&proposal.current_eta, &proposal.proposed_eta) {
            (_, Some(v)) => Some(v.clone()),
            (Some(v), None) => Some(v.clone()),
            (None, None) => None,
        };
        if validate_iso_date(&new_invoice).is_err()
            || new_eta
                .as_deref()
                .map(validate_iso_date)
                .transpose()
                .is_err()
        {
            rows_skipped += 1;
            continue;
        }
        let snapshot_json = serde_json::json!({
            "shipmentId": proposal.shipment_id,
            "oldInvoiceDate": proposal.current_invoice_date,
            "oldEta": proposal.current_eta,
            "newInvoiceDate": new_invoice,
            "newEta": new_eta,
            "reasons": proposal.reasons,
        })
        .to_string();
        tx.execute(
            "INSERT INTO shipment_date_normalization_audit (id, batch_id, shipment_id, old_invoice_date, new_invoice_date, old_eta, new_eta, snapshot_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                format!("SDNA-{}", Uuid::new_v4()),
                batch_id,
                proposal.shipment_id,
                proposal.current_invoice_date,
                new_invoice,
                proposal.current_eta,
                new_eta,
                snapshot_json
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE shipments SET invoice_date = ?1, eta = ?2 WHERE id = ?3",
            params![new_invoice, new_eta, proposal.shipment_id],
        )
        .map_err(|e| e.to_string())?;
        rows_updated += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ShipmentDateNormalizationApplyReport {
        batch_id,
        rows_updated,
        rows_skipped,
    })
}

pub fn stabilize_shipment_dates_on_startup(
    conn: &mut Connection,
) -> Result<ShipmentStartupDateStabilizationReport, String> {
    let apply = apply_shipment_date_normalization(conn)?;
    let invalid = detect_invalid_date_rows(conn)?;
    let signature = unresolved_signature(&invalid);
    let previous_signature: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            params![STARTUP_INVALID_DATE_SIGNATURE_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let repeated_signature = previous_signature
        .as_deref()
        .map(|v| v == signature)
        .unwrap_or(false);
    upsert_app_metadata_value(conn, STARTUP_INVALID_DATE_SIGNATURE_KEY, &signature)?;
    upsert_app_metadata_value(
        conn,
        STARTUP_INVALID_DATE_LAST_COUNT_KEY,
        &invalid.len().to_string(),
    )?;

    if invalid.is_empty() {
        if apply.rows_updated > 0 {
            log::info!(
                target: "import_manager::shipment",
                "startup shipment-date stabilization repaired_rows={} unresolved_rows=0",
                apply.rows_updated
            );
        }
    } else if repeated_signature {
        log::info!(
            target: "import_manager::shipment",
            "startup shipment-date stabilization unresolved_count={} (unchanged since last startup)",
            invalid.len()
        );
    } else {
        let sample_ids = invalid
            .iter()
            .take(10)
            .map(|r| r.id.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        log::warn!(
            target: "import_manager::shipment",
            "startup shipment-date stabilization unresolved_count={} sample_ids={} repaired_rows={} skipped_rows={}",
            invalid.len(),
            sample_ids,
            apply.rows_updated,
            apply.rows_skipped
        );
    }

    Ok(ShipmentStartupDateStabilizationReport {
        rows_repaired: apply.rows_updated,
        rows_skipped: apply.rows_skipped,
        invalid_remaining: invalid.len(),
        repeated_signature,
    })
}

pub fn timezone_validation_report(
    conn: &Connection,
) -> Result<ShipmentTimezoneValidationReport, String> {
    let timezone_check = check_timezone_consistency(conn)?;
    let mut stmt = conn
        .prepare("SELECT id, invoice_date, eta FROM shipments ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let invoice_date: String = row.get(1)?;
            let eta: Option<String> = row.get(2)?;
            Ok((id, invoice_date, eta))
        })
        .map_err(|e| e.to_string())?;
    let mut risky_rows = Vec::new();
    for row in rows {
        let (id, invoice_date, eta) = row.map_err(|e| e.to_string())?;
        let mut reasons = Vec::new();
        if invoice_date.contains('T') || invoice_date.contains(' ') {
            reasons.push("invoice_date contains time component".to_string());
        }
        if let Some(eta_value) = eta.as_deref() {
            if eta_value.contains('T') || eta_value.contains(' ') {
                reasons.push("eta contains time component".to_string());
            }
            if eta_value.ends_with('Z') || eta_value.contains('+') {
                reasons.push("eta looks timezone-qualified".to_string());
            }
        }
        if timezone_check.mismatch_detected {
            reasons.push("system/sqlite timezone offset mismatch detected".to_string());
        }
        if !reasons.is_empty() {
            risky_rows.push(ShipmentTimezoneRiskRow {
                shipment_id: id,
                invoice_date,
                eta,
                reasons,
            });
        }
    }
    Ok(ShipmentTimezoneValidationReport {
        timezone_check,
        risky_rows,
    })
}

pub fn check_timezone_consistency(conn: &Connection) -> Result<TimezoneConsistencyReport, String> {
    let sqlite_now_utc: String = conn
        .query_row("SELECT strftime('%Y-%m-%d %H:%M:%S','now')", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;
    let sqlite_now_local: String = conn
        .query_row(
            "SELECT strftime('%Y-%m-%d %H:%M:%S','now','localtime')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let utc_dt = NaiveDateTime::parse_from_str(&sqlite_now_utc, "%Y-%m-%d %H:%M:%S")
        .map_err(|e| e.to_string())?;
    let local_dt = NaiveDateTime::parse_from_str(&sqlite_now_local, "%Y-%m-%d %H:%M:%S")
        .map_err(|e| e.to_string())?;
    let sqlite_offset_minutes = (local_dt - utc_dt).num_minutes() as i32;
    let system_offset_minutes = Local::now().offset().local_minus_utc() / 60;
    let mismatch_detected = sqlite_offset_minutes != system_offset_minutes;
    if mismatch_detected {
        log::warn!(
            target: "import_manager::shipment",
            "timezone mismatch detected system_offset_minutes={} sqlite_offset_minutes={}",
            system_offset_minutes,
            sqlite_offset_minutes
        );
    }
    Ok(TimezoneConsistencyReport {
        system_offset_minutes,
        sqlite_offset_minutes,
        sqlite_now_utc,
        sqlite_now_local,
        mismatch_detected,
    })
}

pub fn log_shipment_query_plan_readiness(findings: &[ShipmentQueryPlanFinding]) -> bool {
    let has_scan = findings.iter().any(|f| f.has_full_scan);
    if has_scan {
        let names = findings
            .iter()
            .filter(|f| f.has_full_scan)
            .map(|f| f.query_name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        log::warn!(
            target: "import_manager::shipment",
            "shipment query plan readiness: scans_detected={}",
            names
        );
    } else {
        log::info!(
            target: "import_manager::shipment",
            "shipment query plan readiness: no_full_scan_detected"
        );
    }
    !has_scan
}

pub fn snapshot_shipment_query_plan_baseline(
    conn: &Connection,
) -> Result<ShipmentQueryPlanBaseline, String> {
    let findings = analyze_shipment_query_plans(conn)?;
    let scans = findings.iter().filter(|f| f.has_full_scan).count();
    let summary = format!(
        "shipment_query_plan_baseline findings={} full_scans={}",
        findings.len(),
        scans
    );
    let findings_json = serde_json::to_string(&findings).map_err(|e| e.to_string())?;
    let id = format!("SQPB-{}", Uuid::new_v4());
    conn.execute(
        "INSERT INTO shipment_query_plan_baseline (id, summary, findings_json) VALUES (?1, ?2, ?3)",
        params![id, summary, findings_json],
    )
    .map_err(|e| e.to_string())?;
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM shipment_query_plan_baseline WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(ShipmentQueryPlanBaseline {
        id,
        summary,
        findings_json,
        created_at,
    })
}

pub fn shipment_index_recommendations_from_findings(
    findings: &[ShipmentQueryPlanFinding],
) -> Vec<String> {
    let mut recommendations = Vec::new();
    let has_full_scan = findings.iter().any(|f| f.has_full_scan);
    if has_full_scan {
        recommendations.push(
            "CREATE INDEX IF NOT EXISTS idx_shipments_invoice_date ON shipments(invoice_date);"
                .to_string(),
        );
        recommendations.push(
            "CREATE INDEX IF NOT EXISTS idx_shipments_status_invoice_date ON shipments(status, invoice_date);"
                .to_string(),
        );
    }
    recommendations.sort();
    recommendations.dedup();
    recommendations
}

pub fn simulate_shipment_items_dual_write(
    conn: &Connection,
    shipment_id: &str,
) -> Result<String, String> {
    let started = Instant::now();
    let table_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='shipment_items'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if table_exists == 0 {
        return Ok("shipment_items table not present; dual-write dry-run skipped".to_string());
    }
    let source_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM invoice_line_items li
             JOIN invoices inv ON inv.id = li.invoice_id
             WHERE inv.shipment_id = ?1",
            params![shipment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let target_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipment_items WHERE shipment_id = ?1",
            params![shipment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let missing_item_refs: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM shipment_items si
             LEFT JOIN items i ON i.id = si.item_id
             WHERE si.shipment_id = ?1 AND i.id IS NULL",
            params![shipment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let missing_shipment_refs: i64 = conn
        .query_row(
            "SELECT COUNT(*)
             FROM shipment_items si
             LEFT JOIN shipments s ON s.id = si.shipment_id
             WHERE si.shipment_id = ?1 AND s.id IS NULL",
            params![shipment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let quantity_mapping_mismatch_rows: i64 = conn
        .query_row(
            "WITH source_items AS (
                SELECT li.item_id, SUM(li.quantity) AS total_qty
                FROM invoice_line_items li
                JOIN invoices inv ON inv.id = li.invoice_id
                WHERE inv.shipment_id = ?1
                GROUP BY li.item_id
             ),
             target_items AS (
                SELECT si.item_id, SUM(si.quantity) AS total_qty
                FROM shipment_items si
                WHERE si.shipment_id = ?1
                GROUP BY si.item_id
             )
             SELECT COUNT(*)
             FROM source_items src
             LEFT JOIN target_items tgt ON tgt.item_id = src.item_id
             WHERE tgt.item_id IS NULL OR ABS(src.total_qty - tgt.total_qty) > 0.00001",
            params![shipment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let extra_target_items_without_source: i64 = conn
        .query_row(
            "WITH source_items AS (
                SELECT DISTINCT li.item_id
                FROM invoice_line_items li
                JOIN invoices inv ON inv.id = li.invoice_id
                WHERE inv.shipment_id = ?1
             )
             SELECT COUNT(*)
             FROM shipment_items si
             LEFT JOIN source_items src ON src.item_id = si.item_id
             WHERE si.shipment_id = ?1 AND src.item_id IS NULL",
            params![shipment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let msg = format!(
        "dual-write dry-run validated shipment_id={} source_items={} target_items={} missing_item_refs={} missing_shipment_refs={} quantity_mapping_mismatch_rows={} extra_target_items_without_source={} elapsed_ms={}",
        shipment_id,
        source_rows,
        target_rows,
        missing_item_refs,
        missing_shipment_refs,
        quantity_mapping_mismatch_rows,
        extra_target_items_without_source,
        started.elapsed().as_millis()
    );
    Ok(msg)
}

pub fn check_shipment_duplicate(
    conn: &Connection,
    shipment_id: Option<&str>,
    invoice_number: &str,
    exclude_id: Option<&str>,
) -> Result<bool, String> {
    let id_duplicate = if let Some(id) = shipment_id {
        if id.trim().is_empty() {
            false
        } else {
            let sql = if exclude_id.is_some() {
                "SELECT COUNT(*) FROM shipments WHERE id = ?1 AND id != ?2"
            } else {
                "SELECT COUNT(*) FROM shipments WHERE id = ?1"
            };
            let count: i64 = if let Some(ex) = exclude_id {
                conn.query_row(sql, params![id, ex], |row| row.get(0))
                    .map_err(|e| e.to_string())?
            } else {
                conn.query_row(sql, params![id], |row| row.get(0))
                    .map_err(|e| e.to_string())?
            };
            count > 0
        }
    } else {
        false
    };
    let invoice_duplicate_sql = if exclude_id.is_some() {
        "SELECT COUNT(*) FROM shipments WHERE lower(invoice_number)=lower(?1) AND id != ?2"
    } else {
        "SELECT COUNT(*) FROM shipments WHERE lower(invoice_number)=lower(?1)"
    };
    let invoice_count: i64 = if let Some(ex) = exclude_id {
        conn.query_row(invoice_duplicate_sql, params![invoice_number, ex], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?
    } else {
        conn.query_row(invoice_duplicate_sql, params![invoice_number], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?
    };
    Ok(id_duplicate || invoice_count > 0)
}

pub fn fetch_shipment_items_by_shipment_id(
    conn: &Connection,
    shipment_id: &str,
) -> Result<Vec<ShipmentItemLite>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT li.id, li.invoice_id, li.item_id, COALESCE(i.part_number, ''), COALESCE(i.item_description, ''),
                    li.quantity, li.unit_price
             FROM invoice_line_items li
             JOIN invoices inv ON inv.id = li.invoice_id
             LEFT JOIN items i ON i.id = li.item_id
             WHERE inv.shipment_id = ?1
             ORDER BY li.invoice_id, li.id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![shipment_id], |row| {
            Ok(ShipmentItemLite {
                id: row.get(0)?,
                invoice_id: row.get(1)?,
                item_id: row.get(2)?,
                part_number: row.get(3)?,
                item_description: row.get(4)?,
                quantity: row.get(5)?,
                unit_price: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn resolve_status_for_save(shipment: &Shipment) -> String {
    shipment
        .status
        .clone()
        .unwrap_or_else(|| DEFAULT_SHIPMENT_STATUS.to_string())
}

fn validate_status(conn: &Connection, status: &str) -> Result<(), String> {
    let in_option_table: Option<String> = conn
        .query_row(
            "SELECT value FROM shipment_statuses WHERE lower(value) = lower(?1) LIMIT 1",
            [status],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if in_option_table.is_some() {
        return Ok(());
    }
    let allowed: HashSet<&str> = HashSet::from([
        "docs-rcvd",
        "docu-received",
        "in-transit",
        "customs-clearance",
        "ready-dly",
        "delivered",
        "cancelled",
        "finalized",
        "closed",
        "completed",
    ]);
    if allowed.contains(status.to_lowercase().as_str()) {
        Ok(())
    } else {
        Err(format!("Invalid shipment status: {status}"))
    }
}

fn validate_shipment_write(conn: &Connection, shipment: &Shipment) -> Result<(), String> {
    if shipment.id.trim().is_empty() {
        return Err("Shipment ID is required".to_string());
    }
    if shipment.supplier_id.trim().is_empty() {
        return Err("Supplier ID is required".to_string());
    }
    let supplier_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM suppliers WHERE id = ?1",
            [shipment.supplier_id.as_str()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if supplier_exists == 0 {
        return Err(format!("Supplier not found: {}", shipment.supplier_id));
    }
    if shipment.invoice_number.trim().is_empty() {
        return Err("Invoice number is required".to_string());
    }
    if shipment.invoice_date.trim().is_empty() {
        return Err("Invoice date is required".to_string());
    }
    validate_iso_date(&shipment.invoice_date)?;
    if let Some(eta_value) = shipment
        .eta
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        validate_iso_date(eta_value)?;
        let invoice_date = NaiveDate::parse_from_str(shipment.invoice_date.trim(), "%Y-%m-%d")
            .map_err(|e| e.to_string())?;
        let eta_date =
            NaiveDate::parse_from_str(eta_value, "%Y-%m-%d").map_err(|e| e.to_string())?;
        if invoice_date > eta_date {
            return Err("Invalid date range: invoice_date must be on or before eta".to_string());
        }
    }
    if shipment.invoice_value <= 0.0 {
        return Err("Invoice value must be greater than 0".to_string());
    }
    validate_status(conn, &resolve_status_for_save(shipment))?;
    let invalid_invoice_links: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM invoices WHERE shipment_id = ?1 AND (id IS NULL OR trim(id) = '')",
            [shipment.id.as_str()],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if invalid_invoice_links > 0 {
        return Err(format!(
            "Invalid invoice linkage detected for shipment {}",
            shipment.id
        ));
    }
    Ok(())
}

pub fn add_shipment_with_validation(
    conn: &mut Connection,
    shipment: &Shipment,
) -> Result<(), String> {
    validate_shipment_write(conn, shipment)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let status = resolve_status_for_save(shipment);
    tx.execute(
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
            status,
            shipment.date_of_delivery,
            shipment.is_frozen,
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

pub fn update_shipment_with_validation(
    conn: &mut Connection,
    shipment: &Shipment,
) -> Result<(), String> {
    validate_shipment_write(conn, shipment)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
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
            resolve_status_for_save(shipment),
            shipment.date_of_delivery,
            shipment.is_frozen,
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
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
            );
            CREATE TABLE shipment_date_normalization_audit (
                id TEXT PRIMARY KEY,
                batch_id TEXT NOT NULL,
                shipment_id TEXT NOT NULL,
                old_invoice_date TEXT NOT NULL,
                new_invoice_date TEXT NOT NULL,
                old_eta TEXT,
                new_eta TEXT,
                snapshot_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'))
            );
            CREATE TABLE app_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn insert_shipment(conn: &Connection, id: &str, invoice_date: &str, eta: Option<&str>) {
        conn.execute(
            "INSERT INTO shipments
             (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, status, is_frozen, eta)
             VALUES (?1, 'sup1', ?2, ?3, 'Category', 100.0, 'USD', 'EXW', 'docs-rcvd', 0, ?4)",
            params![id, format!("INV-{id}"), invoice_date, eta],
        )
        .unwrap();
    }

    #[test]
    fn startup_stabilization_repairs_known_legacy_format() {
        let mut conn = setup_db();
        insert_shipment(&conn, "s-legacy", "02/05/2026", Some("03/05/2026"));
        let report = stabilize_shipment_dates_on_startup(&mut conn).unwrap();
        assert_eq!(report.invalid_remaining, 0);
        assert_eq!(report.rows_repaired, 1);
        let got: (String, Option<String>) = conn
            .query_row(
                "SELECT invoice_date, eta FROM shipments WHERE id = 's-legacy'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(got.0, "2026-05-02");
        assert_eq!(got.1.as_deref(), Some("2026-05-03"));
    }

    #[test]
    fn startup_stabilization_keeps_ambiguous_invalid_dates() {
        let mut conn = setup_db();
        insert_shipment(&conn, "s-bad", "not-a-date", None);
        let report = stabilize_shipment_dates_on_startup(&mut conn).unwrap();
        assert_eq!(report.rows_repaired, 0);
        assert_eq!(report.invalid_remaining, 1);
        let raw: String = conn
            .query_row(
                "SELECT invoice_date FROM shipments WHERE id = 's-bad'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(raw, "not-a-date");
    }

    #[test]
    fn startup_stabilization_handles_empty_optional_eta() {
        let mut conn = setup_db();
        insert_shipment(&conn, "s-empty", "2026-05-02", Some(""));
        let report = stabilize_shipment_dates_on_startup(&mut conn).unwrap();
        assert_eq!(report.invalid_remaining, 0);
        assert_eq!(report.rows_repaired, 0);
    }

    #[test]
    fn repeated_startup_marks_unchanged_signature() {
        let mut conn = setup_db();
        insert_shipment(&conn, "s-repeat", "xx/yy/zzzz", None);
        let first = stabilize_shipment_dates_on_startup(&mut conn).unwrap();
        let second = stabilize_shipment_dates_on_startup(&mut conn).unwrap();
        assert_eq!(first.invalid_remaining, 1);
        assert_eq!(second.invalid_remaining, 1);
        assert!(!first.repeated_signature);
        assert!(second.repeated_signature);
    }

    #[test]
    fn known_legacy_date_shapes_are_convertible() {
        assert_eq!(
            normalize_date_candidate("31-12-2025").as_deref(),
            Some("2025-12-31")
        );
        assert_eq!(
            normalize_date_candidate("2025/12/31").as_deref(),
            Some("2025-12-31")
        );
    }
}
