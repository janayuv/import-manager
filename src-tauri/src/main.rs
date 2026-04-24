#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(clippy::uninlined_format_args)]

mod commands;
mod db;
mod encryption;
mod expense;
mod migrations;
mod playwright_db;
mod restore_control;
mod utils;

// Re-export commonly used types
pub use db::{
    BoeDetails, Expense, ExpenseType, Invoice, Item, ServiceProvider, Shipment, Supplier,
};

use crate::db::DbState;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .clear_targets()
                .max_file_size(5 * 1024 * 1024)
                .rotation_strategy(RotationStrategy::KeepSome(5))
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("app.log".into()),
                    }),
                ])
                .build(),
        )
        // Native file + message/confirm dialogs (JS: @tauri-apps/plugin-dialog via src/lib/tauri-bridge.ts).
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            log::info!(
                target: "import_manager",
                "Import Manager v{} started (build {} commit {})",
                env!("CARGO_PKG_VERSION"),
                env!("IMPORT_MANAGER_BUILD_DATE"),
                env!("IMPORT_MANAGER_GIT_HASH"),
            );

            let data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir)
                    .map_err(|e| format!("Failed to create app data dir: {}", e))?;
            }

            let db_path = data_dir.join(playwright_db::active_db_filename());

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
                        db::create_new_database(&db_path)
                            .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?
                    }
                }
            } else {
                // No database exists, create a new one
                db::create_new_database(&db_path)
                    .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?
            };

            // Run migrations
            if let Err(e) = migrations::DatabaseMigrations::run_migrations(&mut db_connection) {
                log::error!("Failed to run database migrations: {}", e);
                return Err(Box::new(e));
            }

            if let Err(e) = commands::recycle_bin::cleanup_expired_recycle_records(
                &db_connection,
            ) {
                log::error!(
                    target: "import_manager::recycle_bin",
                    "cleanup_expired_recycle_records failed (startup continues): {}",
                    e
                );
            }

            if let Err(e) = commands::db_maintenance::run_database_maintenance(&db_connection) {
                log::error!(
                    target: "import_manager::database",
                    "run_database_maintenance failed (startup continues): {}",
                    e
                );
            }

            if let Err(e) = db::ensure_audit_logs_table_name_column(&db_connection) {
                log::warn!(
                    "audit_logs tableName column ensure failed (app continues): {}",
                    e
                );
            }

            crate::commands::reference_scan::run_startup_fk_diagnostics(&db_connection);

            app.manage(DbState { db: Mutex::new(db_connection) });

            let app_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                tauri::async_runtime::block_on(crate::commands::tick_backup_schedules(
                    app_handle.clone(),
                ));
                crate::commands::dashboard_cache::tick_dashboard_maintenance(&app_handle);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_shell_version,
            commands::log_client_event,
            commands::get_app_metadata_value,
            commands::set_app_metadata_value,
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
            commands::bulk_finalize_invoices,
            commands::delete_invoice,
            commands::get_unfinalized_shipments,

            // BOE Details commands
            commands::get_boes,
            commands::add_boe,
            commands::update_boe,
            commands::delete_boe,

            // BOE Calculation commands
            commands::get_boe_calculations,
            commands::get_shipment_ids_with_boe_calculations,
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
            commands::get_shipment_ids_with_expense_lines,
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
            commands::get_dashboard_metrics,
            commands::get_kpi_metadata,
            commands::get_kpi_snapshot_history,
            commands::get_kpi_alert_rules,
            commands::save_kpi_alert_rule,
            commands::log_dashboard_activity,
            commands::get_dashboard_activity_log,
            commands::query_dashboard_activity_log,
            commands::exception_workflow::list_exception_cases,
            commands::exception_workflow::update_exception_case,
            commands::exception_workflow::add_exception_note,
            commands::exception_workflow::list_exception_notes,
            commands::exception_workflow::get_exception_lifecycle_events,
            commands::exception_workflow::record_exception_viewed,
            commands::exception_workflow::bulk_resolve_exception_cases,
            commands::exception_reliability::validate_exception_integrity_command,
            commands::exception_reliability::revalidate_open_exceptions_command,
            commands::exception_reliability::simulate_exception_load_command,
            commands::exception_reliability::simulate_rule_execution_command,
            commands::exception_reliability::get_exception_reliability_report,
            commands::workflow_observability::get_workflow_health_summary,
            commands::workflow_observability::get_workflow_maintenance_history,
            commands::workflow_observability::run_recovery_readiness_check,
            commands::workflow_observability::reconstruct_exception_lifecycle,
            commands::workflow_observability::get_reliability_diagnostics,
            commands::workflow_observability::get_predictive_workflow_risk,
            commands::workflow_observability::get_audit_verification_summary,
            commands::workflow_automation::list_workflow_decision_rules,
            commands::workflow_automation::set_workflow_decision_rule_enabled,
            commands::workflow_automation::set_workflow_automation_master_enabled,
            commands::workflow_automation::set_automation_guardrails,
            commands::workflow_automation::set_adaptive_sla_apply_enabled,
            commands::workflow_automation::apply_adaptive_sla_decision,
            commands::workflow_automation::query_workflow_automation_log,
            commands::workflow_automation::get_automation_health,
            commands::workflow_automation::get_automation_impact_summary,
            commands::workflow_automation::list_adaptive_sla_adjustments,
            commands::workflow_automation::list_workflow_rule_change_log,
            commands::workflow_automation::run_workflow_automation_cycle_command,
            commands::workflow_automation::analyze_workflow_efficiency_command,
            commands::workflow_automation::suggest_resolution_actions_command,
            commands::workflow_automation::rollback_automation_action,
            commands::workflow_automation::list_rule_effectiveness_metrics,
            commands::workflow_automation::get_rule_performance_dashboard,
            commands::workflow_automation::list_automation_decision_feedback,
            commands::workflow_automation::list_rule_safety_index,
            commands::workflow_automation::list_automation_stability_alerts,
            commands::workflow_automation::acknowledge_automation_stability_alert,
            commands::workflow_automation::list_automation_benchmark_history,
            commands::workflow_automation::list_automation_roi_metrics,
            commands::workflow_automation::generate_rule_optimization_recommendations_command,
            commands::workflow_automation::generate_automation_learning_suggestions_command,
            commands::workflow_automation::simulate_multiple_rule_sets_command,
            commands::workflow_rule_deployment::list_workflow_rule_versions,
            commands::workflow_rule_deployment::create_workflow_rule_version,
            commands::workflow_rule_deployment::compare_rule_versions_command,
            commands::workflow_rule_deployment::create_workflow_rule_staging,
            commands::workflow_rule_deployment::update_workflow_rule_staging_status,
            commands::workflow_rule_deployment::list_workflow_rule_staging,
            commands::workflow_rule_deployment::submit_rule_version_approval,
            commands::workflow_rule_deployment::record_rule_approval_decision,
            commands::workflow_rule_deployment::list_workflow_rule_approvals,
            commands::workflow_rule_deployment::deploy_rule_version_command,
            commands::workflow_rule_deployment::validate_deployment_safety_command,
            commands::workflow_rule_deployment::run_deployment_dry_run_command,
            commands::workflow_rule_deployment::get_deployment_safety_dashboard_command,
            commands::workflow_rule_deployment::get_smart_deployment_recommendations_command,
            commands::workflow_rule_deployment::generate_deployment_safety_audit_report_command,
            commands::workflow_rule_deployment::list_deployment_conflict_log_command,
            commands::workflow_rule_deployment::list_deployment_risk_timeline_command,
            commands::workflow_rule_deployment::set_deployment_prod_safety_enforcement_command,
            commands::workflow_rule_deployment::rollback_rule_version_command,
            commands::workflow_rule_deployment::list_workflow_rule_deployment_log,
            commands::workflow_rule_deployment::set_canary_rule_deployment,
            commands::workflow_rule_deployment::clear_canary_rule_deployment,
            commands::workflow_rule_deployment::list_canary_rule_deployments,
            commands::workflow_rule_deployment::set_deployment_freeze,
            commands::workflow_rule_deployment::get_deployment_freeze_status,
            commands::workflow_rule_deployment::set_deployment_requires_approval,
            commands::workflow_rule_deployment::list_rule_deployment_impact_metrics,
            commands::workflow_rule_deployment::refresh_rule_deployment_impact_metrics,
            commands::workflow_rule_deployment::validate_rule_deployment_command,
            commands::workflow_multienv::list_workflow_environments,
            commands::workflow_multienv::list_workflow_tenants,
            commands::workflow_multienv::get_workflow_execution_context,
            commands::workflow_multienv::set_workflow_active_tenant,
            commands::workflow_multienv::set_workflow_execution_environment,
            commands::workflow_multienv::list_workflow_environment_deployment_log,
            commands::workflow_multienv::get_environment_health_dashboard,
            commands::workflow_multienv::get_tenant_performance_dashboard,
            commands::workflow_multienv::promote_rule_version_command,
            commands::workflow_automation::list_rule_execution_cost_estimates,
            commands::workflow_automation::upsert_rule_execution_cost_estimate,
            commands::workflow_automation::get_automation_cost_limits,
            commands::workflow_automation::set_automation_cost_limits,
            commands::workflow_automation::list_rule_cost_efficiency_metrics,
            commands::workflow_automation::list_automation_capacity_load,
            commands::workflow_automation::list_daily_automation_economics_index,
            commands::workflow_automation::detect_inefficient_rules_command,
            commands::workflow_automation::generate_cost_optimization_suggestions_command,
            commands::workflow_automation::predictive_capacity_forecast_command,
            commands::workflow_automation::get_automation_cost_vs_benefit_dashboard,
            commands::workflow_job_monitoring::list_workflow_background_jobs_command,
            commands::workflow_job_monitoring::list_workflow_job_execution_log_command,
            commands::workflow_job_monitoring::get_background_job_health_dashboard_command,
            commands::workflow_job_monitoring::retry_failed_job_command,
            commands::workflow_job_monitoring::simulate_background_jobs_command,
            commands::workflow_job_monitoring::detect_job_failures_command,
            commands::workflow_job_monitoring::list_workflow_job_alert_log_command,
            commands::workflow_job_monitoring::list_workflow_job_failure_alerts_command,
            commands::workflow_job_monitoring::detect_missed_job_runs_command,
            commands::workflow_job_monitoring::recover_missed_job_command,
            commands::workflow_job_monitoring::get_missed_schedule_dashboard_command,
            commands::workflow_job_monitoring::list_workflow_job_missed_alerts_command,
            commands::workflow_job_monitoring::set_workflow_background_job_enabled_command,
            commands::workflow_job_monitoring::reset_job_schedule_anchor_command,
            commands::workflow_job_monitoring::recovery_guard_override_reenable_command,
            commands::workflow_job_monitoring::update_job_schedule_expectations_command,
            commands::workflow_job_monitoring::retry_latest_failed_job_command,
            commands::workflow_job_monitoring::get_job_failure_insights_command,
            commands::workflow_job_monitoring::export_workflow_job_recovery_log_csv_command,
            commands::workflow_job_monitoring::get_workflow_job_dependencies_tree_command,
            commands::workflow_job_monitoring::get_job_execution_timeline_command,
            commands::workflow_job_monitoring::list_workflow_job_schedule_expectations_command,
            commands::workflow_job_monitoring::list_workflow_job_manual_override_log_command,
            commands::workflow_production_observability::get_system_metrics_command,
            commands::workflow_production_observability::get_system_health_command,
            commands::workflow_production_observability::list_workflow_alert_signal_log_command,
            commands::workflow_production_observability::get_workflow_alert_signal_dashboard_command,
            commands::workflow_production_observability::simulate_alert_event_command,
            commands::workflow_production_observability::export_metrics_snapshot_csv_command,
            commands::workflow_incident_management::get_operations_center_dashboard_command,
            commands::workflow_incident_management::submit_workflow_forecast_feedback_command,
            commands::workflow_incident_management::acknowledge_workflow_forecast_actions_command,
            commands::workflow_incident_management::get_workflow_incident_detail_command,
            commands::workflow_incident_management::append_workflow_incident_resolution_note_command,
            commands::workflow_incident_management::resolve_workflow_incident_command,
            commands::workflow_incident_management::export_workflow_incidents_report_csv_command,
            commands::workflow_incident_management::refresh_workflow_incident_metrics_command,
            commands::workflow_incident_management::get_correlated_incident_timeline_command,
            commands::workflow_incident_management::scan_systemic_failure_bursts_command,
            commands::workflow_incident_management::detect_stabilization_phase_command,
            commands::workflow_incident_management::start_manual_incident_suppression_command,
            commands::workflow_incident_management::debug_trigger_failure_command,
            commands::get_exception_trend_history,
            commands::set_kpi_snapshot_retention_days,
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

            // Database Management commands
            commands::create_audit_log,
            commands::get_audit_logs,
            commands::get_database_stats,
            commands::has_backup_key_in_keyring,
            commands::export_backup_key,
            commands::export_backup_key_to_path,
            commands::import_backup_key_from_path,
            commands::create_backup,
            commands::get_backup_history,
            commands::soft_delete_record,
            commands::get_reference_counts,
            commands::preview_delete_dependencies,
            commands::get_soft_delete_tables,
            commands::get_recycle_bin_deleted_count,
            commands::get_application_logs,
            commands::get_deleted_records,
            commands::restore_deleted_records,
            commands::permanently_delete_records,
            commands::hard_delete_record,
            commands::preview_restore,
            commands::restore_database,
            commands::browse_table_data,
            commands::update_record,
        commands::bulk_search_records,
        commands::bulk_delete_records,
        commands::create_backup_schedule,
        commands::get_backup_schedules,
        commands::update_backup_schedule,
        commands::delete_backup_schedule,
            commands::run_scheduled_backup,
            commands::google_drive_status,
            commands::google_drive_refresh_profile,
            commands::google_drive_connect,
            commands::google_drive_disconnect,
            commands::google_drive_reset_cancel,
            commands::google_drive_cancel_operation,
            commands::create_user_role,
        commands::get_user_roles,
        commands::update_user_role,
        commands::delete_user_role,
        commands::check_user_permission,
        commands::get_user_permissions,

            commands::reset_test_database,

        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            log::error!("Error while running tauri application: {}", e);
            Box::new(e) as Box<dyn std::error::Error>
        })
}
