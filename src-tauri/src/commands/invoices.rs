use crate::commands::dashboard_cache;
use crate::commands::utils::generate_id;
use crate::db::{DbState, Invoice, InvoiceLineItem, NewInvoicePayload};
use rusqlite::{params, params_from_iter, Connection, Transaction};
use std::collections::HashMap;
use std::time::Instant;
use tauri::State;

fn sanitize_invoice_decimals(value: u8) -> u8 {
    match value {
        0 => 0,
        2 => 2,
        _ => 2,
    }
}

fn round_with_decimals(value: f64, decimals: u8) -> f64 {
    let factor = 10_f64.powi(decimals as i32);
    (value * factor).round() / factor
}

fn invoice_match_tolerance(decimals: u8) -> f64 {
    if decimals == 0 { 0.5 } else { 0.01 }
}

fn parse_pct_from_item_str(s: &Option<String>) -> f64 {
    s.as_ref()
        .map(|v| {
            let t = v.trim().trim_end_matches('%').trim();
            t.parse::<f64>().unwrap_or(0.0)
        })
        .unwrap_or(0.0)
}

fn item_master_tax_strings(
    conn: &Connection,
    item_id: &str,
) -> (Option<String>, Option<String>, Option<String>) {
    conn.query_row(
        "SELECT bcd, sws, igst FROM items WHERE id = ?1",
        params![item_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .unwrap_or((None, None, None))
}

/// Combine stored line rates (if any) with Item Master fallback.
fn merge_tax_rates(
    duty: Option<f64>,
    sws: Option<f64>,
    igst: Option<f64>,
    bcd_s: &Option<String>,
    sws_s: &Option<String>,
    igst_s: &Option<String>,
) -> (f64, f64, f64) {
    (
        duty.unwrap_or_else(|| parse_pct_from_item_str(bcd_s)),
        sws.unwrap_or_else(|| parse_pct_from_item_str(sws_s)),
        igst.unwrap_or_else(|| parse_pct_from_item_str(igst_s)),
    )
}

fn fetch_invoices(db: &Connection) -> Result<Vec<Invoice>, String> {
    let mut stmt = db
        .prepare(
            "SELECT 
                i.id AS invoice_id,
                i.shipment_id,
                i.status,
                s.invoice_number,
                s.invoice_date,
                s.invoice_value,
                COALESCE(i.line_total_decimals, 2) AS line_total_decimals,
                COALESCE(i.invoice_total_decimals, 2) AS invoice_total_decimals,
                li.id AS line_id,
                li.item_id,
                li.quantity,
                li.unit_price,
                COALESCE(li.duty_percent, CAST(REPLACE(it.bcd, '%', '') AS REAL), 0.0) AS duty_percent,
                COALESCE(li.sws_percent, CAST(REPLACE(it.sws, '%', '') AS REAL), 0.0) AS sws_percent,
                COALESCE(li.igst_percent, CAST(REPLACE(it.igst, '%', '') AS REAL), 0.0) AS igst_percent
             FROM invoices i
             JOIN shipments s
                ON i.shipment_id = s.id
             LEFT JOIN invoice_line_items li
                ON li.invoice_id = i.id
             LEFT JOIN items it
                ON li.item_id = it.id
             ORDER BY i.id",
        )
        .map_err(|e| e.to_string())?;

    let row_iter = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, u8>(6)?,
                row.get::<_, u8>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<f64>>(10)?,
                row.get::<_, Option<f64>>(11)?,
                row.get::<_, Option<f64>>(12)?,
                row.get::<_, Option<f64>>(13)?,
                row.get::<_, Option<f64>>(14)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut invoices = Vec::new();
    let mut invoice_index_by_id: HashMap<String, usize> = HashMap::new();

    for row_result in row_iter {
        let (
            invoice_id,
            shipment_id,
            status,
            invoice_number,
            invoice_date,
            shipment_total,
            line_total_decimals,
            invoice_total_decimals,
            line_id,
            item_id,
            quantity,
            unit_price,
            duty_percent,
            sws_percent,
            igst_percent,
        ) = row_result.map_err(|e| e.to_string())?;

        let idx = if let Some(existing_idx) = invoice_index_by_id.get(&invoice_id).copied() {
            existing_idx
        } else {
            let new_idx = invoices.len();
            invoice_index_by_id.insert(invoice_id.clone(), new_idx);
            invoices.push(Invoice {
                id: invoice_id.clone(),
                shipment_id,
                status,
                invoice_number,
                invoice_date,
                shipment_total,
                line_total_decimals: sanitize_invoice_decimals(line_total_decimals),
                invoice_total_decimals: sanitize_invoice_decimals(invoice_total_decimals),
                calculated_total: 0.0,
                line_items: Vec::new(),
            });
            new_idx
        };

        if let (Some(line_id), Some(item_id), Some(quantity), Some(unit_price)) =
            (line_id, item_id, quantity, unit_price)
        {
            invoices[idx].line_items.push(InvoiceLineItem {
                id: line_id,
                item_id,
                quantity,
                unit_price,
                duty_percent: duty_percent.unwrap_or(0.0),
                sws_percent: sws_percent.unwrap_or(0.0),
                igst_percent: igst_percent.unwrap_or(0.0),
            });
        }
    }

    for invoice in &mut invoices {
        let line_decimals = sanitize_invoice_decimals(invoice.line_total_decimals);
        let invoice_decimals = sanitize_invoice_decimals(invoice.invoice_total_decimals);
        let sum_of_line_totals: f64 = invoice
            .line_items
            .iter()
            .map(|li| round_with_decimals(li.quantity * li.unit_price, line_decimals))
            .sum();
        invoice.calculated_total = round_with_decimals(sum_of_line_totals, invoice_decimals);
    }

    println!(
        "Loaded {} invoices using optimized JOIN",
        invoices.len()
    );

    Ok(invoices)
}

#[tauri::command]
pub fn get_invoices(state: State<DbState>) -> Result<Vec<Invoice>, String> {
    let start = Instant::now();
    let db = state.db.lock().unwrap();
    let result = fetch_invoices(&db);
    println!("get_invoices execution time: {:?}", start.elapsed());
    result
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkFinalizeInvoicesInput {
    pub invoice_ids: Vec<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkFinalizeInvoicesResult {
    pub finalized: u32,
    pub failed: u32,
    pub error_messages: Vec<String>,
}

#[tauri::command]
pub fn bulk_finalize_invoices(
    input: BulkFinalizeInvoicesInput,
    state: State<DbState>,
) -> Result<BulkFinalizeInvoicesResult, String> {
    let start = Instant::now();
    let mut db = state.db.lock().unwrap();
    let invoices = fetch_invoices(&db)?;

    let invoice_by_id: HashMap<&str, &Invoice> =
        invoices.iter().map(|inv| (inv.id.as_str(), inv)).collect();

    let mut valid_invoice_ids: Vec<String> = Vec::new();
    let mut failed = 0u32;
    let mut error_messages = Vec::new();

    for id in &input.invoice_ids {
        let Some(inv) = invoice_by_id.get(id.as_str()).copied() else {
            failed += 1;
            error_messages.push(format!("Invoice not found: {id}"));
            continue;
        };

        if inv.status != "Draft" {
            failed += 1;
            error_messages.push(format!("{}: not in Draft status", inv.invoice_number));
            continue;
        }

        let inv_decimals = sanitize_invoice_decimals(inv.invoice_total_decimals);
        let rounded_shipment_total = round_with_decimals(inv.shipment_total, inv_decimals);
        if (rounded_shipment_total - inv.calculated_total).abs() >= invoice_match_tolerance(inv_decimals) {
            failed += 1;
            error_messages.push(format!(
                "{}: shipment total does not match calculated total",
                inv.invoice_number
            ));
            continue;
        }

        valid_invoice_ids.push(inv.id.clone());
    }

    let mut finalized = 0u32;

    if !valid_invoice_ids.is_empty() {
        let tx = db.transaction().map_err(|e| e.to_string())?;

        let placeholders = std::iter::repeat("?")
            .take(valid_invoice_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "UPDATE invoices SET status = 'Finalized' WHERE status = 'Draft' AND id IN ({})",
            placeholders
        );

        match tx.execute(
            &sql,
            params_from_iter(valid_invoice_ids.iter().map(|id| id.as_str())),
        ) {
            Ok(changed_rows) => {
                tx.commit().map_err(|e| e.to_string())?;
                finalized = changed_rows as u32;
                if changed_rows < valid_invoice_ids.len() {
                    let delta = (valid_invoice_ids.len() - changed_rows) as u32;
                    failed += delta;
                    error_messages.push(format!(
                        "{delta} invoice(s) could not be finalized due to concurrent status changes"
                    ));
                }
            }
            Err(e) => {
                let _ = tx.rollback();
                failed += valid_invoice_ids.len() as u32;
                error_messages.push(e.to_string());
            }
        }
    }

    println!(
        "Bulk finalized {} invoices in one transaction",
        finalized
    );

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&db);
    println!("bulk_finalize_invoices time: {:?}", start.elapsed());

    Ok(BulkFinalizeInvoicesResult {
        finalized,
        failed,
        error_messages,
    })
}

pub(crate) fn execute_add_invoice(
    tx: &Transaction,
    payload: &NewInvoicePayload,
) -> Result<String, rusqlite::Error> {
    let invoice_id = generate_id(Some("INV".to_string()));

    tx.execute(
        "INSERT INTO invoices (id, shipment_id, status, line_total_decimals, invoice_total_decimals) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            &invoice_id,
            &payload.shipment_id,
            &payload.status,
            sanitize_invoice_decimals(payload.line_total_decimals),
            sanitize_invoice_decimals(payload.invoice_total_decimals)
        ],
    )?;

    for line_item in &payload.line_items {
        let line_item_id = generate_id(Some("ILI".to_string()));
        let (bcd_s, sws_s, igst_s) = item_master_tax_strings(tx, &line_item.item_id);
        let (d, s, ig) = merge_tax_rates(
            line_item.duty_percent,
            line_item.sws_percent,
            line_item.igst_percent,
            &bcd_s,
            &sws_s,
            &igst_s,
        );
        tx.execute(
            "INSERT INTO invoice_line_items (id, invoice_id, item_id, quantity, unit_price, duty_percent, sws_percent, igst_percent) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                line_item_id,
                &invoice_id,
                &line_item.item_id,
                line_item.quantity,
                line_item.unit_price,
                d,
                s,
                ig
            ],
        )?;
    }

    // Automatically update shipment status to "In Transit" when invoice is added
    // Only update if current status is not "delivered"
    tx.execute(
        "UPDATE shipments SET status = 'in-transit' WHERE id = ?1 AND status != 'delivered'",
        params![&payload.shipment_id],
    )?;

    Ok(invoice_id)
}

#[tauri::command]
pub fn add_invoice(payload: NewInvoicePayload, state: State<DbState>) -> Result<String, String> {
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;

    match execute_add_invoice(&tx, &payload) {
        Ok(id) => {
            tx.commit().map_err(|e| e.to_string())?;
            let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&db);
            Ok(id)
        }
        Err(e) => {
            tx.rollback().map_err(|e| e.to_string())?;
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn add_invoices_bulk(
    payloads: Vec<NewInvoicePayload>,
    state: State<DbState>,
) -> Result<Vec<String>, String> {
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let mut new_ids = Vec::new();

    for payload in &payloads {
        match execute_add_invoice(&tx, payload) {
            Ok(id) => new_ids.push(id),
            Err(e) => {
                tx.rollback().map_err(|e| e.to_string())?;
                return Err(e.to_string());
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&db);
    Ok(new_ids)
}

fn execute_update_invoice(
    tx: &Transaction,
    id: &str,
    payload: &NewInvoicePayload,
) -> Result<(), rusqlite::Error> {
    tx.execute(
        "UPDATE invoices SET shipment_id = ?1, status = ?2, line_total_decimals = ?3, invoice_total_decimals = ?4 WHERE id = ?5",
        params![
            &payload.shipment_id,
            &payload.status,
            sanitize_invoice_decimals(payload.line_total_decimals),
            sanitize_invoice_decimals(payload.invoice_total_decimals),
            &id
        ],
    )?;

    tx.execute(
        "DELETE FROM invoice_line_items WHERE invoice_id = ?1",
        params![id],
    )?;

    for line_item in &payload.line_items {
        let line_item_id = generate_id(Some("ILI".to_string()));
        let (bcd_s, sws_s, igst_s) = item_master_tax_strings(tx, &line_item.item_id);
        let (d, s, ig) = merge_tax_rates(
            line_item.duty_percent,
            line_item.sws_percent,
            line_item.igst_percent,
            &bcd_s,
            &sws_s,
            &igst_s,
        );
        tx.execute(
            "INSERT INTO invoice_line_items (id, invoice_id, item_id, quantity, unit_price, duty_percent, sws_percent, igst_percent) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![line_item_id, id, &line_item.item_id, line_item.quantity, line_item.unit_price, d, s, ig],
        )?;
    }

    Ok(())
}

#[tauri::command]
pub fn update_invoice(
    id: String,
    payload: NewInvoicePayload,
    state: State<DbState>,
) -> Result<(), String> {
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;

    match execute_update_invoice(&tx, &id, &payload) {
        Ok(_) => {
            tx.commit().map_err(|e| e.to_string())?;
            let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&db);
            Ok(())
        }
        Err(e) => {
            tx.rollback().map_err(|e| e.to_string())?;
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn delete_invoice(id: String, state: State<DbState>) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM invoices WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&db);
    Ok(())
}
