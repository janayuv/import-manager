#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod encryption;
mod expense;
mod migrations;

use crate::db::DbState;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

fn create_new_encrypted_database(
    db_path: &std::path::Path,
    encryption: &encryption::DatabaseEncryption,
) -> Connection {
    // Generate a new encryption key
    let key = encryption::DatabaseEncryption::generate_key();
    encryption
        .store_key(&key)
        .expect("Failed to store encryption key");

    // Create the encrypted database
    let conn = Connection::open(db_path).expect("Failed to create database file");

    // Enable encryption with SQLCipher
    conn.execute_batch(&format!(
        "PRAGMA cipher_page_size = 4096;
         PRAGMA kdf_iter = 256000;
         PRAGMA cipher_hmac_algorithm = HMAC_SHA512;
         PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512;
         PRAGMA key = \"x'{}'\";",
        hex::encode(&key)
    ))
    .expect("Failed to enable encryption");

    // Initialize the database schema
    db::init_schema(&conn).expect("Failed to initialize database schema");

    conn
}

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
            let encryption = encryption::DatabaseEncryption::new();
            
            // Check if database exists and needs migration
            if db_path.exists() {
                match encryption::DatabaseEncryption::is_encrypted(&db_path) {
                    Ok(false) => {
                        // Database exists but is not encrypted - migrate it
                        let backup_path = data_dir.join("import-manager.db.backup");
                        std::fs::copy(&db_path, &backup_path).expect("Failed to create backup");
                        
                        let encrypted_path = data_dir.join("import-manager.db.encrypted");
                        encryption.migrate_to_encrypted(&db_path, &encrypted_path)
                            .expect("Failed to migrate database to encrypted");
                        
                        // Replace original with encrypted version
                        std::fs::remove_file(&db_path).expect("Failed to remove plaintext database");
                        std::fs::rename(&encrypted_path, &db_path).expect("Failed to rename encrypted database");
                        
                        log::info!("Database migrated to encrypted format. Backup saved as import-manager.db.backup");
                    }
                    Ok(true) => {
                        // Database is already encrypted
                        log::info!("Using existing encrypted database");
                    }
                    Err(_) => {
                        // Database might be corrupted, start fresh
                        log::warn!("Database appears corrupted, starting fresh");
                        if db_path.exists() {
                            std::fs::remove_file(&db_path).expect("Failed to remove corrupted database");
                        }
                    }
                }
            }
            
            // Initialize database (will create encrypted if new)
            let mut db_connection = if db_path.exists() {
                // Database exists, check if it's encrypted
                match encryption::DatabaseEncryption::is_encrypted(&db_path) {
                    Ok(true) => {
                        // Database is encrypted, try to open it
                        match encryption.open_encrypted(&db_path) {
                            Ok(conn) => conn,
                            Err(e) => {
                                log::warn!("Failed to open encrypted database: {}. Starting fresh.", e);
                                // Remove the corrupted/encrypted database and start fresh
                                std::fs::remove_file(&db_path).expect("Failed to remove corrupted database");
                                create_new_encrypted_database(&db_path, &encryption)
                            }
                        }
                    }
                    Ok(false) => {
                        // Database exists but is plaintext - migrate it
                        let backup_path = data_dir.join("import-manager.db.backup");
                        std::fs::copy(&db_path, &backup_path).expect("Failed to create backup");
                        
                        let encrypted_path = data_dir.join("import-manager.db.encrypted");
                        encryption.migrate_to_encrypted(&db_path, &encrypted_path)
                            .expect("Failed to migrate database to encrypted");
                        
                        // Replace original with encrypted version
                        std::fs::remove_file(&db_path).expect("Failed to remove plaintext database");
                        std::fs::rename(&encrypted_path, &db_path).expect("Failed to rename encrypted database");
                        
                        log::info!("Database migrated to encrypted format. Backup saved as import-manager.db.backup");
                        
                        // Open the newly encrypted database
                        encryption.open_encrypted(&db_path).expect("Failed to open migrated encrypted database")
                    }
                    Err(_) => {
                        // Database might be corrupted, start fresh
                        log::warn!("Database appears corrupted, starting fresh");
                        if db_path.exists() {
                            std::fs::remove_file(&db_path).expect("Failed to remove corrupted database");
                        }
                        create_new_encrypted_database(&db_path, &encryption)
                    }
                }
            } else {
                // No database exists, create a new encrypted one
                create_new_encrypted_database(&db_path, &encryption)
            };
            
            // Run migrations
            migrations::DatabaseMigrations::run_migrations(&mut db_connection)
                .expect("Failed to run database migrations");
            
            app.manage(DbState { db: Mutex::new(db_connection) });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Supplier commands
            commands::get_suppliers,
            commands::add_supplier,
            commands::update_supplier,
                        commands::add_suppliers_bulk,            
            // Shipment commands
            commands::get_shipments,
            commands::get_active_shipments,
            commands::add_shipment,
            commands::update_shipment,
            commands::add_shipments_bulk,
            
            // Item Master commands
            commands::get_items,
            commands::add_item,
            commands::add_items_bulk,
            commands::update_item,
            
            // Invoice commands
            commands::get_invoices,
            commands::add_invoice,
            commands::add_invoices_bulk,
            commands::update_invoice,
            commands::delete_invoice,
            commands::get_unfinalized_shipments,

            // BOE Details commands
            commands::get_boes,
            commands::add_boe,
            commands::update_boe,
            commands::delete_boe,

            // BOE Calculation commands
            commands::get_boe_calculations,
            commands::add_boe_calculation,
            commands::update_boe_calculation,
            commands::delete_boe_calculation,
            commands::get_shipments_for_boe_entry,
            commands::get_shipments_for_boe_summary,
            commands::update_boe_status,
            commands::add_boe_attachment,
            commands::get_boe_reconciliation,
            commands::save_boe_attachment_file,
            commands::save_item_photo_file,

            // --- Generic and Specific Option Commands ---
            commands::add_option, // The new generic command for adding any option

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
            commands::add_purchase_uom,
            
            // New shipment-specific option commands
            commands::get_incoterms,
            commands::add_incoterm,
            commands::get_shipment_modes,
            commands::add_shipment_mode,
            commands::get_shipment_types,
            commands::add_shipment_type,
            commands::get_shipment_statuses,
            commands::add_shipment_status,

            // --- Expense Module Commands ---
            commands::get_service_providers,
            commands::add_service_provider,
            commands::get_expense_types,
            commands::add_expense_type,
            commands::add_expense_type_with_rates,
            commands::debug_expense_types,
            commands::fix_expense_types,
            commands::fix_existing_expenses,
            commands::fix_lcl_charges_rate,
            commands::clear_expense_data,
            commands::debug_expense_data,
            commands::debug_expense_data_counts,
            commands::create_test_expense_data,
            commands::cleanup_orphaned_expenses,
            commands::get_expense_invoices_for_shipment,
            commands::get_expenses_for_invoice,
            commands::get_expenses_for_shipment,
            commands::add_expense_invoice_with_expenses,
            commands::check_expense_invoice_exists,
            commands::add_expense,
            commands::update_expense,
            commands::delete_expense,
            commands::attach_invoice_to_expense,
            commands::add_expenses_bulk,
            commands::delete_expense_invoice,
            commands::cleanup_orphaned_expense_invoices,
            commands::generate_shipment_expense_report,
            commands::generate_monthly_gst_summary,
            
            // New production-grade expense commands
            expense::create_expense_invoice,
            expense::preview_expense_invoice,
            expense::combine_expense_duplicates,
            expense::get_expense_invoice,
            
            // Expense Reporting Commands
            commands::generate_detailed_expense_report,
            commands::generate_expense_summary_by_type,
            commands::generate_expense_summary_by_provider,
            commands::generate_expense_summary_by_shipment,
            commands::generate_expense_summary_by_month,
            commands::debug_expense_report_filters,
            commands::debug_expense_dates,
            // --- User Context ---
            commands::get_current_user_info,
            commands::get_user_context,
            // --- Reports ---
            commands::get_report,
            // Freeze shipment
            commands::freeze_shipment,
            // Update shipment status
            commands::update_shipment_status,
            // Validation commands
            commands::validate_shipment_import,
            commands::check_supplier_exists,
            

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
