// In src-tauri/src/commands.rs

use crate::db::{DbState, Supplier, Shipment, Item, Invoice, InvoiceLineItem, NewInvoicePayload, BoeDetails,NewBoePayload, SavedBoe, BoeShipment, BoeShipmentItem, SelectOption, BoeReconciliationReport, ReconciledItemRow, ReconciliationTotals, Attachment}; 
use rusqlite::{params, Transaction, Error as RusqliteError};
use tauri::State;
use tauri::Manager; // for app.path()
use rand::Rng;
use std::collections::HashMap;


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

// ============================================================================
// --- GENERIC OPTION COMMANDS (INTERNAL HELPERS) ---
// ============================================================================

fn get_options_from_table(table_name: &str, state: &State<DbState>) -> Result<Vec<SelectOption>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare(&format!("SELECT value, label FROM {}", table_name))
        .map_err(|e| e.to_string())?;
    
    let option_iter = stmt
        .query_map([], |row| {
            Ok(SelectOption { // Use the correct struct name `SelectOption`
                value: row.get(0)?,
                label: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    option_iter.collect::<Result<Vec<SelectOption>, _>>().map_err(|e| e.to_string())
}

fn add_option_to_table(table_name: &str, option: SelectOption, state: &State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        &format!("INSERT OR IGNORE INTO {} (value, label) VALUES (?1, ?2)", table_name),
        params![option.value, option.label],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// --- SPECIFIC TAURI COMMANDS FOR OPTIONS ---
// ============================================================================

// FIX: This macro now defines separate get and add commands correctly.
macro_rules! define_option_commands {
    ($($get_name:ident, $add_name:ident, $table_name:expr),*) => {
        $(
            #[tauri::command]
            pub fn $get_name(state: State<DbState>) -> Result<Vec<SelectOption>, String> {
                get_options_from_table($table_name, &state)
            }

            #[tauri::command]
            pub fn $add_name(option: SelectOption, state: State<DbState>) -> Result<(), String> {
                add_option_to_table($table_name, option, &state)
            }
        )*
    };
}

// Define all get and add commands for each option type
define_option_commands!(
    get_units, add_unit, "units",
    get_currencies, add_currency, "currencies",
    get_countries, add_country, "countries",
    get_bcd_rates, add_bcd_rate, "bcd_rates",
    get_sws_rates, add_sws_rate, "sws_rates",
    get_igst_rates, add_igst_rate, "igst_rates",
    get_categories, add_category, "categories",
    get_end_uses, add_end_use, "end_uses",
    get_purchase_uoms, add_purchase_uom, "purchase_uoms",
    // NEW: Add commands for shipment options
    get_incoterms, add_incoterm, "incoterms",
    get_shipment_modes, add_shipment_mode, "shipment_modes",
    get_shipment_types, add_shipment_type, "shipment_types",
    get_shipment_statuses, add_shipment_status, "shipment_statuses"
);

// NEW: Generic command to add an option from the frontend, called by the Shipment form.
#[tauri::command]
pub fn add_option(option_type: String, option: SelectOption, state: State<DbState>) -> Result<(), String> {
    let table_name = match option_type.as_str() {
        "category" => "categories",
        "currency" => "currencies",
        "incoterm" => "incoterms",
        "mode" => "shipment_modes",
        "type" => "shipment_types",
        "status" => "shipment_statuses",
        _ => return Err(format!("Unknown option type: {}", option_type)),
    };
    add_option_to_table(table_name, option, &state)
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
pub fn add_suppliers_bulk(state: State<DbState>, suppliers: Vec<Supplier>) -> Result<(), String> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for supplier in suppliers {
        tx.execute(
            "INSERT INTO suppliers (id, supplier_name, short_name, country, email, phone, beneficiary_name, bank_name, branch, bank_address, account_no, iban, swift_code, is_active) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
    }

    tx.commit().map_err(|e| e.to_string())?;
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
pub fn add_shipments_bulk(state: State<DbState>, shipments: Vec<Shipment>) -> Result<(), String> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for shipment in shipments {
        tx.execute(
            "INSERT INTO shipments (id, supplier_id, invoice_number, invoice_date, goods_category, invoice_value, invoice_currency, incoterm, shipment_mode, shipment_type, bl_awb_number, bl_awb_date, vessel_name, container_number, gross_weight_kg, etd, eta, status, date_of_delivery) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![
                shipment.id, shipment.supplier_id, shipment.invoice_number, shipment.invoice_date,
                shipment.goods_category, shipment.invoice_value, shipment.invoice_currency,
                shipment.incoterm, shipment.shipment_mode, shipment.shipment_type,
                shipment.bl_awb_number, shipment.bl_awb_date, shipment.vessel_name,
                shipment.container_number, shipment.gross_weight_kg, shipment.etd,
                shipment.eta, shipment.status, shipment.date_of_delivery,
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
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
pub fn add_items_bulk(state: State<DbState>, items: Vec<Item>) -> Result<(), String> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    for item in items {
        tx.execute(
            "INSERT INTO items (id, part_number, item_description, unit, currency, unit_price, hsn_code, supplier_id, is_active, country_of_origin, bcd, sws, igst, technical_write_up, category, end_use, net_weight_kg, purchase_uom, gross_weight_per_uom_kg, photo_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
            params![item.id, item.part_number, item.item_description, item.unit, item.currency, item.unit_price, item.hsn_code, item.supplier_id, item.is_active, item.country_of_origin, item.bcd, item.sws, item.igst, item.technical_write_up, item.category, item.end_use, item.net_weight_kg, item.purchase_uom, item.gross_weight_per_uom_kg, item.photo_path],
        ).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
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
        .unwrap_or_else(|| Vec::new());
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
    let saved = super::commands::map_row_to_saved_boe(&row).map_err(|e| e.to_string())?;

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
        let mut map: HashMap<String, (String, f64, f64, String, f64, f64, f64, f64)> = HashMap::new();
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
            let method = saved.item_inputs.iter().find(|ii| ii.part_no == it.part_no).map(|ii| ii.calculation_method.clone()).unwrap_or_else(|| "Standard".into());
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
                actual_bcd: actual_bcd,
                actual_sws: actual_sws,
                actual_igst: actual_igst,
                actual_total: actual_total,
                boe_bcd: it.bcd_value,
                boe_sws: it.sws_value,
                boe_igst: it.igst_value,
                boe_total: boe_total,
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
    println!("📄 [RUST] BOE ID: {}", id);
    println!("📄 [RUST] Source path: {}", src_path);
    
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            println!("❌ [RUST] Failed to get app data directory: {}", e);
            e.to_string()
        })?;
    println!("📄 [RUST] App data base directory: {:?}", base);
    
    let attach_dir = base.join("attachments").join(&id);
    println!("📄 [RUST] Attachment directory: {:?}", attach_dir);
    
    std::fs::create_dir_all(&attach_dir).map_err(|e| {
        println!("❌ [RUST] Failed to create attachment directory: {}", e);
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
    println!("📄 [RUST] Extracted filename: {}", file_name);

    let dest_path = attach_dir.join(file_name);
    println!("📄 [RUST] Destination path: {:?}", dest_path);
    
    std::fs::copy(&src_path, &dest_path).map_err(|e| {
        println!("❌ [RUST] Failed to copy file: {}", e);
        e.to_string()
    })?;
    println!("✅ [RUST] File copied successfully");
    
    let result_path = dest_path.to_string_lossy().to_string();
    println!("✅ [RUST] Returning saved path: {}", result_path);
    Ok(result_path)
}

// --- Save an item photo into app data attachments/items and return saved path ---
#[tauri::command]
pub fn save_item_photo_file(app: tauri::AppHandle, src_path: String) -> Result<String, String> {
    println!("🖼️ [RUST] Starting item photo file save...");
    println!("🖼️ [RUST] Source path: {}", src_path);
    
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            println!("❌ [RUST] Failed to get app data directory: {}", e);
            e.to_string()
        })?;
    println!("🖼️ [RUST] App data base directory: {:?}", base);
    
    let attach_dir = base.join("attachments").join("items");
    println!("🖼️ [RUST] Item photo directory: {:?}", attach_dir);
    
    std::fs::create_dir_all(&attach_dir).map_err(|e| {
        println!("❌ [RUST] Failed to create item photo directory: {}", e);
        e.to_string()
    })?;
    println!("✅ [RUST] Item photo directory created successfully");

    let file_name = std::path::Path::new(&src_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("photo.png");
    println!("🖼️ [RUST] Extracted filename: {}", file_name);

    let dest_path = attach_dir.join(file_name);
    println!("🖼️ [RUST] Destination path: {:?}", dest_path);
    
    std::fs::copy(&src_path, &dest_path).map_err(|e| {
        println!("❌ [RUST] Failed to copy item photo file: {}", e);
        e.to_string()
    })?;
    println!("✅ [RUST] Item photo file copied successfully");
    
    let result_path = dest_path.to_string_lossy().to_string();
    println!("✅ [RUST] Returning saved item photo path: {}", result_path);
    Ok(result_path)
}
