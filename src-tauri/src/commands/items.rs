use crate::db::{DbState, Item};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_items(state: State<DbState>) -> Result<Vec<Item>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT * FROM items")
        .map_err(|e| e.to_string())?;
    let item_iter = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;

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
