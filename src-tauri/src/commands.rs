// In src-tauri/src/commands.rs

use crate::db::{DbState, Supplier, Shipment, Item, Invoice, InvoiceLineItem, NewInvoicePayload, BoeDetails,NewBoePayload}; 
use rusqlite::{params, Transaction};
use tauri::State;
use rand::Rng;


fn generate_id(prefix: &str) -> String {
    let random_part: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(8)
        .map(char::from)
        .collect();
    format!("{}-{}", prefix, random_part)
}

#[tauri::command]
pub fn get_suppliers(state: State<DbState>) -> Result<Vec<Supplier>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM suppliers").map_err(|e| e.to_string())?;
    let supplier_iter = stmt.query_map([], |row| {
        Ok(Supplier {
            id: row.get(0)?,
            supplier_name: row.get(1)?,
            short_name: row.get(2)?,
            country: row.get(3)?,
            email: row.get(4)?,
            phone: row.get(5)?,
            beneficiary_name: row.get(6)?,
            bank_name: row.get(7)?,
            branch: row.get(8)?,
            bank_address: row.get(9)?,
            account_no: row.get(10)?,
            iban: row.get(11)?,
            swift_code: row.get(12)?,
            is_active: row.get(13)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut suppliers = Vec::new();
    for supplier in supplier_iter {
        suppliers.push(supplier.map_err(|e| e.to_string())?);
    }
    Ok(suppliers)
}

#[tauri::command]
pub fn add_supplier(state: State<DbState>, supplier: Supplier) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            supplier.id,
            supplier.supplier_name,
            supplier.short_name,
            supplier.country,
            supplier.email,
            supplier.phone,
            supplier.beneficiary_name,
            supplier.bank_name,
            supplier.branch,
            supplier.bank_address,
            supplier.account_no,
            supplier.iban,
            supplier.swift_code,
            supplier.is_active,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_supplier(state: State<DbState>, supplier: Supplier) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE suppliers SET supplier_name = ?2, short_name = ?3, country = ?4, email = ?5, phone = ?6, beneficiary_name = ?7, bank_name = ?8, branch = ?9, bank_address = ?10, account_no = ?11, iban = ?12, swift_code = ?13, is_active = ?14 WHERE id = ?1",
        params![
            supplier.id,
            supplier.supplier_name,
            supplier.short_name,
            supplier.country,
            supplier.email,
            supplier.phone,
            supplier.beneficiary_name,
            supplier.bank_name,
            supplier.branch,
            supplier.bank_address,
            supplier.account_no,
            supplier.iban,
            supplier.swift_code,
            supplier.is_active,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM shipments").map_err(|e| e.to_string())?;
    let shipment_iter = stmt.query_map([], |row| {
        Ok(Shipment {
            id: row.get(0)?, supplier_id: row.get(1)?, invoice_number: row.get(2)?,
            invoice_date: row.get(3)?, goods_category: row.get(4)?, invoice_value: row.get(5)?,
            invoice_currency: row.get(6)?, incoterm: row.get(7)?, shipment_mode: row.get(8)?,
            shipment_type: row.get(9)?, bl_awb_number: row.get(10)?, bl_awb_date: row.get(11)?,
            vessel_name: row.get(12)?, container_number: row.get(13)?, gross_weight_kg: row.get(14)?,
            etd: row.get(15)?, eta: row.get(16)?, status: row.get(17)?,
            date_of_delivery: row.get(18)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut shipments = Vec::new();
    for shipment in shipment_iter {
        shipments.push(shipment.map_err(|e| e.to_string())?);
    }
    Ok(shipments)
}

#[tauri::command]
pub fn add_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![
            shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
            shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
            shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
            shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
            shipment.container_number, shipment.gross_weight_kg, shipment.etd,
            shipment.eta, shipment.status, shipment.date_of_delivery,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_shipment(state: State<DbState>, shipment: Shipment) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE shipments SET supplier_id = ?2, invoice_number = ?3, invoice_date = ?4, goods_category = ?5, invoice_value = ?6, invoice_currency = ?7, incoterm = ?8, shipment_mode = ?9, shipment_type = ?10, bl_awb_number = ?11, bl_awb_date = ?12, vessel_name = ?13, container_number = ?14, gross_weight_kg = ?15, etd = ?16, eta = ?17, status = ?18, date_of_delivery = ?19 WHERE id = ?1",
        params![
            shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
            shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
            shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
            shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
            shipment.container_number, shipment.gross_weight_kg, shipment.etd,
            shipment.eta, shipment.status, shipment.date_of_delivery,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_items(state: State<DbState>) -> Result<Vec<Item>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT * FROM items").map_err(|e| e.to_string())?;
    let item_iter = stmt.query_map([], |row| {
        Ok(Item {
            id: row.get(0)?,
            part_number: row.get(1)?,
            item_description: row.get(2)?,
            unit: row.get(3)?,
            currency: row.get(4)?,
            unit_price: row.get(5)?,
            hsn_code: row.get(6)?,
            supplier_id: row.get(7)?,
            is_active: row.get(8)?,
            country_of_origin: row.get(9)?,
            bcd: row.get(10)?,
            sws: row.get(11)?,
            igst: row.get(12)?,
            technical_write_up: row.get(13)?,
            category: row.get(14)?,
            end_use: row.get(15)?,
            net_weight_kg: row.get(16)?,
            purchase_uom: row.get(17)?,
            gross_weight_per_uom_kg: row.get(18)?,
            photo_path: row.get(19)?,
        })
    }).map_err(|e| e.to_string())?;

    item_iter.map(|i| i.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn add_item(item: Item, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO items (id, part_number, item_description, unit, currency, unit_price, hsn_code, supplier_id, is_active, country_of_origin, bcd, sws, igst, technical_write_up, category, end_use, net_weight_kg, purchase_uom, gross_weight_per_uom_kg, photo_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        params![item.id, item.part_number, item.item_description, item.unit, item.currency, item.unit_price, item.hsn_code, item.supplier_id, item.is_active, item.country_of_origin, item.bcd, item.sws, item.igst, item.technical_write_up, item.category, item.end_use, item.net_weight_kg, item.purchase_uom, item.gross_weight_per_uom_kg, item.photo_path],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_item(item: Item, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE items SET part_number = ?2, item_description = ?3, unit = ?4, currency = ?5, unit_price = ?6, hsn_code = ?7, supplier_id = ?8, is_active = ?9, country_of_origin = ?10, bcd = ?11, sws = ?12, igst = ?13, technical_write_up = ?14, category = ?15, end_use = ?16, net_weight_kg = ?17, purchase_uom = ?18, gross_weight_per_uom_kg = ?19, photo_path = ?20 WHERE id = ?1",
        params![item.id, item.part_number, item.item_description, item.unit, item.currency, item.unit_price, item.hsn_code, item.supplier_id, item.is_active, item.country_of_origin, item.bcd, item.sws, item.igst, item.technical_write_up, item.category, item.end_use, item.net_weight_kg, item.purchase_uom, item.gross_weight_per_uom_kg, item.photo_path],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

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

#[tauri::command]
pub fn get_unfinalized_shipments(state: State<DbState>) -> Result<Vec<Shipment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT s.* FROM shipments s
         LEFT JOIN invoices i ON s.id = i.shipment_id AND i.status = 'Finalized'
         WHERE i.id IS NULL"
    ).map_err(|e| e.to_string())?;
    
    let shipment_iter = stmt.query_map([], |row| {
        Ok(Shipment {
            id: row.get(0)?, supplier_id: row.get(1)?, invoice_number: row.get(2)?,
            invoice_date: row.get(3)?, goods_category: row.get(4)?, invoice_value: row.get(5)?,
            invoice_currency: row.get(6)?, incoterm: row.get(7)?, shipment_mode: row.get(8)?,
            shipment_type: row.get(9)?, bl_awb_number: row.get(10)?, bl_awb_date: row.get(11)?,
            vessel_name: row.get(12)?, container_number: row.get(13)?, gross_weight_kg: row.get(14)?,
            etd: row.get(15)?, eta: row.get(16)?, status: row.get(17)?,
            date_of_delivery: row.get(18)?,
        })
    }).map_err(|e| e.to_string())?;

    shipment_iter.collect::<Result<Vec<Shipment>, _>>().map_err(|e| e.to_string())
}

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