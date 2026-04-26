use crate::commands::dashboard_cache;
use crate::commands::utils::generate_id;
use crate::db::{DbState, Invoice, InvoiceLineItem, NewInvoiceLineItemPayload, NewInvoicePayload};
use rusqlite::{params, Connection, Transaction};
use tauri::State;

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
                i.id, i.shipment_id, i.status,
                s.invoice_number, s.invoice_date, s.invoice_value
             FROM invoices i
             JOIN shipments s ON i.shipment_id = s.id",
        )
        .map_err(|e| e.to_string())?;

    let invoice_iter = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, f64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut invoices = Vec::new();
    for invoice_result in invoice_iter {
        let (id, shipment_id, status, invoice_number, invoice_date, shipment_total) =
            invoice_result.map_err(|e| e.to_string())?;

        let mut line_item_stmt = db
            .prepare(
                "SELECT id, item_id, quantity, unit_price, duty_percent, sws_percent, igst_percent \
                 FROM invoice_line_items WHERE invoice_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let line_item_iter = line_item_stmt
            .query_map(params![&id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                    row.get::<_, Option<f64>>(5)?,
                    row.get::<_, Option<f64>>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let raw_rows: Vec<_> = line_item_iter
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;

        let mut line_items: Vec<InvoiceLineItem> = Vec::with_capacity(raw_rows.len());

        for (line_id, item_id, quantity, unit_price, duty_db, sws_db, igst_db) in raw_rows {
            let (bcd_s, sws_s, igst_s) = item_master_tax_strings(db, &item_id);
            let (d, s, ig) = merge_tax_rates(duty_db, sws_db, igst_db, &bcd_s, &sws_s, &igst_s);

            if duty_db.is_none() || sws_db.is_none() || igst_db.is_none() {
                db.execute(
                    "UPDATE invoice_line_items SET duty_percent = ?2, sws_percent = ?3, igst_percent = ?4 WHERE id = ?1",
                    params![&line_id, d, s, ig],
                )
                .map_err(|e| e.to_string())?;
            }

            line_items.push(InvoiceLineItem {
                id: line_id,
                item_id,
                quantity,
                unit_price,
                duty_percent: d,
                sws_percent: s,
                igst_percent: ig,
            });
        }

        let calculated_total = line_items
            .iter()
            .map(|li| li.quantity * li.unit_price)
            .sum();

        invoices.push(Invoice {
            id,
            shipment_id,
            status,
            invoice_number,
            invoice_date,
            shipment_total,
            calculated_total,
            line_items,
        });
    }

    Ok(invoices)
}

#[tauri::command]
pub fn get_invoices(state: State<DbState>) -> Result<Vec<Invoice>, String> {
    let db = state.db.lock().unwrap();
    fetch_invoices(&db)
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
    let mut db = state.db.lock().unwrap();
    let invoices = fetch_invoices(&db)?;
    const TOLERANCE: f64 = 0.01;

    let mut finalized = 0u32;
    let mut failed = 0u32;
    let mut error_messages = Vec::new();

    for id in &input.invoice_ids {
        let Some(inv) = invoices.iter().find(|i| &i.id == id) else {
            failed += 1;
            error_messages.push(format!("Invoice not found: {id}"));
            continue;
        };

        if inv.status != "Draft" {
            failed += 1;
            error_messages.push(format!("{}: not in Draft status", inv.invoice_number));
            continue;
        }

        if (inv.shipment_total - inv.calculated_total).abs() >= TOLERANCE {
            failed += 1;
            error_messages.push(format!(
                "{}: shipment total does not match calculated total",
                inv.invoice_number
            ));
            continue;
        }

        let payload = NewInvoicePayload {
            shipment_id: inv.shipment_id.clone(),
            status: "Finalized".to_string(),
            line_items: inv
                .line_items
                .iter()
                .map(|li| NewInvoiceLineItemPayload {
                    item_id: li.item_id.clone(),
                    quantity: li.quantity,
                    unit_price: li.unit_price,
                    duty_percent: Some(li.duty_percent),
                    sws_percent: Some(li.sws_percent),
                    igst_percent: Some(li.igst_percent),
                })
                .collect(),
        };

        let tx = match db.transaction() {
            Ok(t) => t,
            Err(e) => {
                failed += 1;
                error_messages.push(e.to_string());
                continue;
            }
        };

        match execute_update_invoice(&tx, &inv.id, &payload) {
            Ok(()) => {
                if let Err(e) = tx.commit() {
                    failed += 1;
                    error_messages.push(format!("{}: {e}", inv.invoice_number));
                    continue;
                }
                finalized += 1;
            }
            Err(e) => {
                let _ = tx.rollback();
                failed += 1;
                error_messages.push(format!("{}: {e}", inv.invoice_number));
            }
        }
    }

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&db);

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
        "INSERT INTO invoices (id, shipment_id, status) VALUES (?1, ?2, ?3)",
        params![&invoice_id, &payload.shipment_id, &payload.status],
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
        "UPDATE invoices SET shipment_id = ?1, status = ?2 WHERE id = ?3",
        params![&payload.shipment_id, &payload.status, &id],
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
