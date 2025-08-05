#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod commands;
extern crate paste;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir).expect("Failed to create app data dir");
            }
            let db_path = data_dir.join("import-manager.db");
            let db_connection = db::init(&db_path).expect("Database initialization failed");
            app.manage(db::DbState { db: std::sync::Mutex::new(db_connection) });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Supplier commands (already exist)
            commands::get_suppliers,
            commands::add_supplier,
            commands::update_supplier,
            // NEW: Shipment commands
            commands::get_shipments,
            commands::add_shipment,
            commands::update_shipment,
            // Item Master commands
            commands::get_items,
            commands::add_item,
            commands::update_item,
                        // --- ADD THE NEW INVOICE COMMANDS ---
            commands::get_invoices,
            commands::add_invoice,
            commands::update_invoice,
            commands::delete_invoice,
            commands::get_unfinalized_shipments,

            commands::get_boes,
            commands::add_boe,
            commands::update_boe,
            commands::delete_boe,

                        // --- NEW: BOE CALCULATION COMMANDS ---
            commands::get_boe_calculations,
            commands::add_boe_calculation,
            commands::update_boe_calculation,
            commands::delete_boe_calculation,
            commands::get_shipments_for_boe_entry,

                        commands::get_units,
                        commands::get_units,
            commands::add_unit,
            commands::get_currencies,
            commands::add_currency,
            commands::get_countries,
            commands::add_country,
            commands::get_bcd_rates,
            commands::add_bcd_rate,
            commands::get_sws_rates,
            commands::add_sws_rate,
            commands::get_igst_rates,
            commands::add_igst_rate,
            commands::get_categories,
            commands::add_category,
            commands::get_end_uses,
            commands::add_end_use,
            commands::get_purchase_uoms,
            commands::add_purchase_uom
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}