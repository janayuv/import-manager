#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod commands;

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
            commands::update_item
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}