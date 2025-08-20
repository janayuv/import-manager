use crate::db::{DbState, Invoice, InvoiceLineItem, NewInvoicePayload};
use crate::commands::utils::generate_id;
use rusqlite::{params, Transaction};
use tauri::State;

#[tauri::command]
pub fn get_invoices(state: State<DbState>) -> Result<Vec<Invoice>, String> {
    let db = state.db.lock().unwrap();
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
            .prepare("SELECT id, item_id, quantity, unit_price FROM invoice_line_items WHERE invoice_id = ?1")
            .map_err(|e| e.to_string())?;
        
        let line_item_iter = line_item_stmt.query_map(params![&id], |row| {
            Ok(InvoiceLineItem {
                id: row.get(0)?,
                item_id: row.get(1)?,
                quantity: row.get(2)?,
                unit_price: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;

        let line_items: Vec<InvoiceLineItem> = line_item_iter.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
        
        let calculated_total = line_items.iter().map(|li| li.quantity * li.unit_price).sum();

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

fn execute_add_invoice(tx: &Transaction, payload: &NewInvoicePayload) -> Result<String, rusqlite::Error> {
    let invoice_id = generate_id("INV");

    tx.execute(
        "INSERT INTO invoices (id, shipment_id, status) VALUES (?1, ?2, ?3)",
        params![&invoice_id, &payload.shipment_id, &payload.status],
    )?;

    for line_item in &payload.line_items {
        let line_item_id = generate_id("ILI");
        tx.execute(
            "INSERT INTO invoice_line_items (id, invoice_id, item_id, quantity, unit_price) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![line_item_id, &invoice_id, &line_item.item_id, line_item.quantity, line_item.unit_price],
        )?;
    }
    
    // Automatically update shipment status to "In Transit" when invoice is added
    tx.execute(
        "UPDATE shipments SET status = 'in-transit' WHERE id = ?1",
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
            Ok(id)
        }
        Err(e) => {
            tx.rollback().map_err(|e| e.to_string())?;
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn add_invoices_bulk(payloads: Vec<NewInvoicePayload>, state: State<DbState>) -> Result<Vec<String>, String> {
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
    Ok(new_ids)
}

fn execute_update_invoice(tx: &Transaction, id: &str, payload: &NewInvoicePayload) -> Result<(), rusqlite::Error> {
     tx.execute(
        "UPDATE invoices SET shipment_id = ?1, status = ?2 WHERE id = ?3",
        params![&payload.shipment_id, &payload.status, &id],
    )?;

    tx.execute("DELETE FROM invoice_line_items WHERE invoice_id = ?1", params![id])?;

    for line_item in &payload.line_items {
        let line_item_id = generate_id("ILI");
        tx.execute(
            "INSERT INTO invoice_line_items (id, invoice_id, item_id, quantity, unit_price) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![line_item_id, id, &line_item.item_id, line_item.quantity, line_item.unit_price],
        )?;
    }

    Ok(())
}

#[tauri::command]
pub fn update_invoice(id: String, payload: NewInvoicePayload, state: State<DbState>) -> Result<(), String> {
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;

    match execute_update_invoice(&tx, &id, &payload) {
        Ok(_) => {
            tx.commit().map_err(|e| e.to_string())?;
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
    Ok(())
}
