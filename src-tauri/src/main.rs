#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(clippy::uninlined_format_args)]

mod commands;
mod db;
mod encryption;
mod expense;
mod migrations;

// Re-export commonly used types
pub use db::{
    BoeDetails, Expense, ExpenseType, Invoice, Item, ServiceProvider, Shipment, Supplier,
};

use crate::db::DbState;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

fn create_new_database(
    db_path: &std::path::Path,
) -> Result<Connection, Box<dyn std::error::Error>> {
    // Create the database
    let conn =
        Connection::open(db_path).map_err(|e| format!("Failed to create database file: {}", e))?;

    // Initialize the database schema
    db::init_schema(&conn).map_err(|e| format!("Failed to initialize database schema: {}", e))?;

    Ok(conn)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir)
                    .map_err(|e| format!("Failed to create app data dir: {}", e))?;
            }

            let db_path = data_dir.join("import-manager.db");

            // Check if we're using bundled SQLite (CI environment or bundled build)
            let using_bundled_sqlite = std::env::var("LIBSQLITE3_SYS_BUNDLED").is_ok() 
                || std::env::var("CI").is_ok();

            // If using bundled SQLite and database exists, check if it's encrypted
            if using_bundled_sqlite && db_path.exists() {
                // Try to open the database to see if it's encrypted
                match Connection::open(&db_path) {
                    Ok(_) => {
                        log::info!("Database opened successfully with bundled SQLite");
                    }
                    Err(_) => {
                        // Database is likely encrypted with SQLCipher, create backup and start fresh
                        log::warn!("Database appears to be encrypted with SQLCipher. Creating backup and starting fresh with bundled SQLite.");
                        let backup_path = data_dir.join("import-manager.db.sqlcipher-backup");
                        if let Err(e) = std::fs::copy(&db_path, &backup_path) {
                            log::error!("Failed to create backup: {}", e);
                            return Err(Box::new(e));
                        }

                        if let Err(e) = std::fs::remove_file(&db_path) {
                            log::error!("Failed to remove encrypted database: {}", e);
                            return Err(Box::new(e));
                        }

                        log::info!("Encrypted database backed up as import-manager.db.sqlcipher-backup");
                    }
                }
            }

            // Initialize database
            let mut db_connection = if db_path.exists() {
                // Database exists, try to open it
                match Connection::open(&db_path) {
                    Ok(conn) => conn,
                    Err(e) => {
                        log::warn!("Failed to open database: {}. Starting fresh.", e);
                        // Remove the corrupted database and start fresh
                        if let Err(e) = std::fs::remove_file(&db_path) {
                            log::error!("Failed to remove corrupted database: {}", e);
                            return Err(Box::new(e));
                        }
                        create_new_database(&db_path)?
                    }
                }
            } else {
                // No database exists, create a new one
                create_new_database(&db_path)?
            };

            // Run migrations
            if let Err(e) = migrations::DatabaseMigrations::run_migrations(&mut db_connection) {
                log::error!("Failed to run database migrations: {}", e);
                return Err(Box::new(e));
            }

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
            commands::update_shipment_status_on_invoice_add,
            commands::update_shipment_status_on_boe_add,
            commands::check_and_update_ready_for_delivery,
            commands::migrate_shipment_statuses,
            // Validation commands
            commands::validate_shipment_import,
            commands::check_supplier_exists,


        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            log::error!("Error while running tauri application: {}", e);
            Box::new(e) as Box<dyn std::error::Error>
        })
}
