#![allow(clippy::uninlined_format_args)]
use crate::commands::utils::generate_id;
use crate::db::{
    DbState, Expense, ExpenseAttachment, ExpenseInvoice, ExpenseType, ExpenseWithInvoice,
    ServiceProvider,
};
use rusqlite::params;
use tauri::Manager;
use tauri::State;
use uuid::Uuid;

// --- Service Provider Commands ---
#[allow(dead_code)]
#[tauri::command]
pub fn get_service_providers(state: State<DbState>) -> Result<Vec<ServiceProvider>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, gstin, state, contact_person, contact_email, contact_phone FROM service_providers ORDER BY name")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(ServiceProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                gstin: row.get(2)?,
                state: row.get(3)?,
                contact_person: row.get(4)?,
                contact_email: row.get(5)?,
                contact_phone: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    iter.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[allow(dead_code)]
#[tauri::command]
pub fn add_service_provider(
    name: String,
    state: State<DbState>,
) -> Result<ServiceProvider, String> {
    let db = state.db.lock().unwrap();
    let new_service_provider = ServiceProvider {
        id: Uuid::new_v4().to_string(),
        name,
        gstin: None,
        state: None,
        contact_person: None,
        contact_email: None,
        contact_phone: None,
    };

    db.execute(
        "INSERT INTO service_providers (id, name) VALUES (?1, ?2)",
        rusqlite::params![&new_service_provider.id, &new_service_provider.name],
    )
    .map_err(|e| e.to_string())?;

    Ok(new_service_provider)
}

// --- Expense Type Commands ---
#[allow(dead_code)]
#[tauri::command]
pub fn get_expense_types(state: State<DbState>) -> Result<Vec<ExpenseType>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, COALESCE(default_cgst_rate_bp, default_cgst_rate * 100) as default_cgst_rate, COALESCE(default_sgst_rate_bp, default_sgst_rate * 100) as default_sgst_rate, COALESCE(default_igst_rate_bp, default_igst_rate * 100) as default_igst_rate, is_active FROM expense_types ORDER BY name")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(ExpenseType {
                id: row.get(0)?,
                name: row.get(1)?,
                default_cgst_rate: row.get(2)?,
                default_sgst_rate: row.get(3)?,
                default_igst_rate: row.get(4)?,
                is_active: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    iter.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[allow(dead_code)]
#[tauri::command]
pub fn debug_expense_types(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();

    // Check if expense_types table exists
    let table_exists: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='expense_types'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if table_exists == 0 {
        return Ok("expense_types table does not exist".to_string());
    }

    // Get all columns in expense_types table
    let mut stmt = conn
        .prepare("PRAGMA table_info(expense_types)")
        .map_err(|e| e.to_string())?;

    let columns: Vec<String> = stmt
        .query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut result = format!("Columns in expense_types table: {columns:?}\n");

    // Get all expense types with their rates
    let mut stmt = conn
        .prepare("SELECT id, name, default_cgst_rate, default_sgst_rate, default_igst_rate, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp FROM expense_types")
        .map_err(|e| e.to_string())?;

    let expense_types: Vec<crate::commands::utils::ExpenseTypeRow> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    result.push_str(&format!("Found {} expense types:\n", expense_types.len()));

    for (id, name, cgst_old, sgst_old, igst_old, cgst_bp, sgst_bp, igst_bp) in expense_types {
        result.push_str(&format!(
            "ID: {id}, Name: {name}, Old rates (CGST: {cgst_old}, SGST: {sgst_old}, IGST: {igst_old}), Basis points (CGST: {cgst_bp:?}, SGST: {sgst_bp:?}, IGST: {igst_bp:?})\n"
        ));
    }

    Ok(result)
}

#[allow(dead_code)]
#[tauri::command]
pub fn fix_expense_types(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();

    // Define the correct rates for common expense types
    let expense_type_fixes = vec![
        ("Transport Charges-FCL", 900, 900, 0),
        ("Transport Charges-LCL", 900, 900, 0),
        ("CFS Charges-FCL", 900, 900, 0),
        ("Clearing&Forwarding-Air", 900, 900, 0),
        ("Clearing&Forwarding-Sea", 900, 900, 0),
        ("Customs Duty", 900, 900, 0),
        ("Freight Charges", 0, 0, 1800),
        ("Handling Charges", 900, 900, 0),
        ("Storage Charges", 900, 900, 0),
        ("Documentation Charges", 900, 900, 0),
        ("Warehouse Charges-Air", 900, 900, 0), // Added this one from the screenshot
        ("LCL Charges", 900, 900, 0),           // Added this one from the screenshot
    ];

    let mut result = String::new();
    let mut updated_count = 0;

    for (name, cgst_rate, sgst_rate, igst_rate) in expense_type_fixes {
        // Check if this expense type exists
        let exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM expense_types WHERE name = ?",
                [name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if exists > 0 {
            // Update existing expense type
            conn.execute(
                "UPDATE expense_types SET 
                    default_cgst_rate_bp = ?, 
                    default_sgst_rate_bp = ?, 
                    default_igst_rate_bp = ?
                 WHERE name = ?",
                rusqlite::params![cgst_rate, sgst_rate, igst_rate, name],
            )
            .map_err(|e| e.to_string())?;

            result.push_str(&format!(
                "Updated: {} (CGST: {}%, SGST: {}%, IGST: {}%)\n",
                name,
                cgst_rate / 100,
                sgst_rate / 100,
                igst_rate / 100
            ));
            updated_count += 1;
        } else {
            // Create new expense type
            conn.execute(
                "INSERT INTO expense_types (id, name, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp, is_active) 
                 VALUES (?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    Uuid::new_v4().to_string(),
                    name,
                    cgst_rate,
                    sgst_rate,
                    igst_rate,
                    true
                ],
            )
            .map_err(|e| e.to_string())?;

            result.push_str(&format!(
                "Created: {} (CGST: {}%, SGST: {}%, IGST: {}%)\n",
                name,
                cgst_rate / 100,
                sgst_rate / 100,
                igst_rate / 100
            ));
            updated_count += 1;
        }
    }

    result.push_str(&format!(
        "\nTotal expense types processed: {updated_count}\n"
    ));

    Ok(result)
}

#[allow(dead_code)]
#[tauri::command]
pub fn debug_expense_data(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();

    let mut result = String::new();

    // Check expense_invoices table
    let invoice_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM expense_invoices", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);
    result.push_str(&format!("Expense invoices count: {}\n", invoice_count));

    // Check expenses table
    let expense_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM expenses", [], |row| row.get(0))
        .unwrap_or(0);
    result.push_str(&format!("Expenses count: {}\n", expense_count));

    // Get sample data from expenses table
    if expense_count > 0 {
        let mut stmt = conn.prepare("SELECT id, expense_invoice_id, amount, cgst_amount, sgst_amount, igst_amount, tds_amount, total_amount FROM expenses LIMIT 3").unwrap();
        let rows = stmt.query_map([], |row| {
            Ok(format!("ID: {}, Invoice: {}, Amount: {}, CGST: {}, SGST: {}, IGST: {}, TDS: {}, Total: {}", 
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, f64>(7)?
            ))
        }).unwrap();

        result.push_str("Sample expense data:\n");
        for row in rows {
            result.push_str(&format!("  {}\n", row.unwrap()));
        }
    }

    // Check if amount_paise columns exist
    let has_amount_paise: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('expenses') WHERE name = 'amount_paise'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    result.push_str(&format!(
        "Has amount_paise column: {}\n",
        has_amount_paise > 0
    ));

    Ok(result)
}

#[allow(dead_code)]
#[tauri::command]
pub fn clear_expense_data(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();

    // Clear existing expense types and service providers
    conn.execute("DELETE FROM expense_types", [])
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM service_providers", [])
        .map_err(|e| e.to_string())?;

    Ok(
        "Expense types and service providers cleared successfully. You can now add them manually."
            .to_string(),
    )
}

#[allow(dead_code)]
#[tauri::command]
pub fn cleanup_orphaned_expenses(state: State<DbState>) -> Result<String, String> {
    let mut conn = state.db.lock().unwrap();
    let mut result = String::new();

    // Count before cleanup
    let before_invoice_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM expense_invoices", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);
    let before_expense_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM expenses", [], |row| row.get(0))
        .unwrap_or(0);

    result.push_str("Before cleanup:\n");
    result.push_str(&format!("  Expense invoices: {}\n", before_invoice_count));
    result.push_str(&format!("  Expenses: {}\n", before_expense_count));

    // Collect orphaned data first
    let mut orphaned_expenses = Vec::new();
    let mut orphaned_invoices = Vec::new();

    // Find orphaned expenses
    {
        let mut stmt = conn
            .prepare(
                "SELECT e.id, e.expense_invoice_id 
             FROM expenses e 
             LEFT JOIN expense_invoices ei ON e.expense_invoice_id = ei.id 
             WHERE ei.id IS NULL",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (expense_id, invoice_id) = row.map_err(|e| e.to_string())?;
            orphaned_expenses.push((expense_id.clone(), invoice_id.clone()));
            result.push_str(&format!(
                "  Orphaned expense: ID={}, Invoice={}\n",
                expense_id, invoice_id
            ));
        }
    }

    // Find orphaned invoices
    {
        let mut stmt = conn
            .prepare(
                "SELECT ei.id, ei.invoice_number 
             FROM expense_invoices ei 
             LEFT JOIN expenses e ON ei.id = e.expense_invoice_id 
             WHERE e.id IS NULL",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (invoice_id, invoice_number) = row.map_err(|e| e.to_string())?;
            orphaned_invoices.push((invoice_id.clone(), invoice_number.clone()));
            result.push_str(&format!(
                "  Orphaned invoice: ID={}, Number={}\n",
                invoice_id, invoice_number
            ));
        }
    }

    // Start transaction for deletions
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Delete orphaned expenses
    let deleted_orphaned = tx
        .execute(
            "DELETE FROM expenses 
         WHERE expense_invoice_id NOT IN (SELECT id FROM expense_invoices)",
            [],
        )
        .map_err(|e| e.to_string())?;

    // Delete orphaned invoices
    let deleted_orphaned_invoices = tx
        .execute(
            "DELETE FROM expense_invoices 
         WHERE id NOT IN (SELECT DISTINCT expense_invoice_id FROM expenses)",
            [],
        )
        .map_err(|e| e.to_string())?;

    // Commit transaction
    tx.commit().map_err(|e| e.to_string())?;

    // Count after cleanup
    let after_invoice_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM expense_invoices", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);
    let after_expense_count: i32 = conn
        .query_row("SELECT COUNT(*) FROM expenses", [], |row| row.get(0))
        .unwrap_or(0);

    result.push_str("\nCleanup completed:\n");
    result.push_str(&format!(
        "  Deleted {} orphaned expenses\n",
        deleted_orphaned
    ));
    result.push_str(&format!(
        "  Deleted {} orphaned invoices\n",
        deleted_orphaned_invoices
    ));
    result.push_str(&format!(
        "  Found {} orphaned expenses\n",
        orphaned_expenses.len()
    ));
    result.push_str(&format!(
        "  Found {} orphaned invoices\n",
        orphaned_invoices.len()
    ));
    result.push_str("\nAfter cleanup:\n");
    result.push_str(&format!("  Expense invoices: {}\n", after_invoice_count));
    result.push_str(&format!("  Expenses: {}\n", after_expense_count));

    Ok(result)
}

#[allow(dead_code)]
#[tauri::command]
pub fn fix_existing_expenses(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();

    // Determine schema: legacy (amount, decimal percent) vs new (amount_paise, basis points)
    let has_amount_paise: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('expenses') WHERE name = 'amount_paise'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let mut report = String::new();

    if has_amount_paise > 0 {
        // New schema: basis points stored as integers
        // Find expenses with out-of-range rates
        let mut stmt = conn
            .prepare(
                "SELECT id, expense_type_id, amount_paise, cgst_rate, sgst_rate, igst_rate, tds_rate
                 FROM expenses
                 WHERE cgst_rate > 10000 OR sgst_rate > 10000 OR igst_rate > 10000 OR tds_rate > 10000
                    OR cgst_rate < 0 OR sgst_rate < 0 OR igst_rate < 0 OR tds_rate < 0",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<(String, String, i64, i32, i32, i32, i32)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        report.push_str(&format!(
            "Found {} expenses to fix (new schema)\n",
            rows.len()
        ));

        let mut fixed = 0;
        for (id, expense_type_id, amount_paise, _cgst, _sgst, _igst, _tds) in rows {
            // Get defaults (basis points)
            if let Ok((dc, ds, di)) = conn.query_row(
                "SELECT default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp FROM expense_types WHERE id = ?",
                [&expense_type_id],
                |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?, row.get::<_, i32>(2)?)),
            ) {
                let cgst_amount = (amount_paise * dc as i64) / 10000;
                let sgst_amount = (amount_paise * ds as i64) / 10000;
                let igst_amount = (amount_paise * di as i64) / 10000;
                let tds_rate = 0i32; // leave zero unless you handle defaults later
                let tds_amount = (amount_paise * tds_rate as i64) / 10000;
                let total_amount = amount_paise + cgst_amount + sgst_amount + igst_amount;
                let net_amount = total_amount - tds_amount;

                conn.execute(
                    "UPDATE expenses SET 
                        cgst_rate = ?, sgst_rate = ?, igst_rate = ?, tds_rate = ?,
                        cgst_amount_paise = ?, sgst_amount_paise = ?, igst_amount_paise = ?, tds_amount_paise = ?,
                        total_amount_paise = ?, net_amount_paise = ?
                     WHERE id = ?",
                    rusqlite::params![
                        dc, ds, di, tds_rate,
                        cgst_amount, sgst_amount, igst_amount, tds_amount,
                        total_amount, net_amount,
                        id,
                    ],
                )
                .map_err(|e| e.to_string())?;

                fixed += 1;
            }
        }

        report.push_str(&format!("Fixed {} expenses (new schema)\n", fixed));
    } else {
        // Legacy schema: percent decimals in rates, generated amount columns
        // Fix rows that have basis points accidentally stored in percent columns (>100)
        let updated = conn
            .execute(
                "UPDATE expenses SET 
                    cgst_rate = (SELECT default_cgst_rate_bp FROM expense_types et WHERE et.id = expenses.expense_type_id) / 100.0,
                    sgst_rate = (SELECT default_sgst_rate_bp FROM expense_types et WHERE et.id = expenses.expense_type_id) / 100.0,
                    igst_rate = (SELECT default_igst_rate_bp FROM expense_types et WHERE et.id = expenses.expense_type_id) / 100.0
                 WHERE cgst_rate > 100 OR sgst_rate > 100 OR igst_rate > 100",
                [],
            )
            .map_err(|e| e.to_string())?;

        report.push_str(&format!(
            "Normalized {} legacy expenses to percent\n",
            updated
        ));
        // Amount columns are generated in legacy schema; no recomputation needed
    }

    Ok(report)
}

#[allow(dead_code)]
#[tauri::command]
pub fn fix_lcl_charges_rate(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();

    let mut result = String::new();

    // Check if LCL Charges exists and get its current rates
    let current_rates: Option<(String, i32, i32, i32)> = conn
        .query_row(
            "SELECT id, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp FROM expense_types WHERE name = 'LCL Charges'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                ))
            }
        )
        .ok();

    if let Some((_id, cgst, sgst, igst)) = current_rates {
        result.push_str(&format!(
            "Current LCL Charges rates: CGST={}bp ({}%), SGST={}bp ({}%), IGST={}bp ({}%)\n",
            cgst,
            cgst / 100,
            sgst,
            sgst / 100,
            igst,
            igst / 100
        ));

        // Update to correct rates
        conn.execute(
            "UPDATE expense_types SET 
                default_cgst_rate_bp = ?, 
                default_sgst_rate_bp = ?, 
                default_igst_rate_bp = ?
             WHERE name = 'LCL Charges'",
            rusqlite::params![900, 900, 0],
        )
        .map_err(|e| e.to_string())?;

        result
            .push_str("Updated LCL Charges to: CGST=900bp (9%), SGST=900bp (9%), IGST=0bp (0%)\n");
    } else {
        // Create LCL Charges if it doesn't exist
        conn.execute(
            "INSERT INTO expense_types (id, name, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp, is_active) 
             VALUES (?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                "LCL Charges",
                900,
                900,
                0,
                true
            ],
        )
        .map_err(|e| e.to_string())?;

        result.push_str(
            "Created LCL Charges with: CGST=900bp (9%), SGST=900bp (9%), IGST=0bp (0%)\n",
        );
    }

    Ok(result)
}

#[allow(dead_code)]
#[tauri::command]
pub fn add_expense_type(name: String, state: State<DbState>) -> Result<ExpenseType, String> {
    let db = state.db.lock().unwrap();
    let new_expense_type = ExpenseType {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        default_cgst_rate: 0,
        default_sgst_rate: 0,
        default_igst_rate: 0,
        is_active: true,
    };

    db.execute(
        "INSERT INTO expense_types (id, name, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp, is_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![&new_expense_type.id, &new_expense_type.name, &new_expense_type.default_cgst_rate, &new_expense_type.default_sgst_rate, &new_expense_type.default_igst_rate, &new_expense_type.is_active],
    )
    .map_err(|e| e.to_string())?;

    Ok(new_expense_type)
}

#[allow(dead_code)]
#[tauri::command]
pub fn add_expense_type_with_rates(
    name: String,
    cgst_rate: i32,
    sgst_rate: i32,
    igst_rate: i32,
    state: State<DbState>,
) -> Result<ExpenseType, String> {
    let db = state.db.lock().unwrap();
    let new_expense_type = ExpenseType {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        default_cgst_rate: cgst_rate,
        default_sgst_rate: sgst_rate,
        default_igst_rate: igst_rate,
        is_active: true,
    };

    db.execute(
        "INSERT INTO expense_types (id, name, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp, is_active) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![&new_expense_type.id, &new_expense_type.name, &new_expense_type.default_cgst_rate, &new_expense_type.default_sgst_rate, &new_expense_type.default_igst_rate, &new_expense_type.is_active],
    )
    .map_err(|e| e.to_string())?;

    Ok(new_expense_type)
}

// --- Expense Commands ---
// NEW: Get expense invoices for a shipment
#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn get_expense_invoices_for_shipment(
    shipment_id: String,
    state: State<DbState>,
) -> Result<Vec<ExpenseInvoice>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, shipment_id, service_provider_id, invoice_no, invoice_date, total_amount, total_cgst_amount, total_sgst_amount, total_igst_amount, remarks, created_by, created_at, updated_at FROM expense_invoices WHERE shipment_id = ?1 ORDER BY invoice_date")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(params![shipment_id], |row| {
            Ok(ExpenseInvoice {
                id: row.get(0)?,
                shipment_id: row.get(1)?,
                service_provider_id: row.get(2)?,
                invoice_no: row.get(3)?,
                invoice_date: row.get(4)?,
                total_amount: row.get(5)?,
                total_cgst_amount: row.get(6)?,
                total_sgst_amount: row.get(7)?,
                total_igst_amount: row.get(8)?,
                remarks: row.get(9)?,
                created_by: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    iter.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

// NEW: Check if an expense invoice already exists
#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn check_expense_invoice_exists(
    service_provider_id: String,
    invoice_no: String,
    state: State<DbState>,
) -> Result<bool, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT COUNT(*) FROM expense_invoices WHERE service_provider_id = ?1 AND invoice_no = ?2")
        .map_err(|e| e.to_string())?;

    let count: i32 = stmt
        .query_row(params![service_provider_id, invoice_no], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(count > 0)
}

// NEW: Get expenses for a specific expense invoice
#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn get_expenses_for_invoice(
    expense_invoice_id: String,
    state: State<DbState>,
) -> Result<Vec<Expense>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, expense_invoice_id, expense_type_id, amount, cgst_rate, sgst_rate, igst_rate, tds_rate, cgst_amount, sgst_amount, igst_amount, tds_amount, total_amount, remarks, created_by, created_at, updated_at FROM expenses WHERE expense_invoice_id = ?1 ORDER BY created_at")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(params![expense_invoice_id], |row| {
            Ok(Expense {
                id: row.get(0)?,
                expense_invoice_id: row.get(1)?,
                expense_type_id: row.get(2)?,
                amount: row.get(3)?,
                cgst_rate: row.get(4)?,
                sgst_rate: row.get(5)?,
                igst_rate: row.get(6)?,
                tds_rate: row.get(7)?,
                cgst_amount: row.get(8)?,
                sgst_amount: row.get(9)?,
                igst_amount: row.get(10)?,
                tds_amount: row.get(11)?,
                total_amount: row.get(12)?,
                remarks: row.get(13)?,
                created_by: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    iter.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

// UPDATED: Get all expenses for a shipment (including invoice details)
#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn get_expenses_for_shipment(
    shipment_id: String,
    state: State<DbState>,
) -> Result<Vec<ExpenseWithInvoice>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT e.id, e.expense_invoice_id, e.expense_type_id, e.amount, e.cgst_rate, e.sgst_rate, e.igst_rate, e.tds_rate, e.cgst_amount, e.sgst_amount, e.igst_amount, e.tds_amount, e.total_amount, e.remarks, e.created_by, e.created_at, e.updated_at, ei.service_provider_id, ei.invoice_no, ei.invoice_date FROM expenses e JOIN expense_invoices ei ON e.expense_invoice_id = ei.id WHERE ei.shipment_id = ?1 ORDER BY ei.invoice_date, e.created_at")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(params![shipment_id], |row| {
            Ok(ExpenseWithInvoice {
                id: row.get(0)?,
                expense_invoice_id: row.get(1)?,
                expense_type_id: row.get(2)?,
                amount: row.get(3)?,
                cgst_rate: row.get(4)?,
                sgst_rate: row.get(5)?,
                igst_rate: row.get(6)?,
                tds_rate: row.get(7)?,
                cgst_amount: row.get(8)?,
                sgst_amount: row.get(9)?,
                igst_amount: row.get(10)?,
                tds_amount: row.get(11)?,
                total_amount: row.get(12)?,
                remarks: row.get(13)?,
                created_by: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
                service_provider_id: row.get(17)?,
                invoice_no: row.get(18)?,
                invoice_date: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?;

    iter.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

// --- File Attachment Commands ---
#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn attach_invoice_to_expense(
    app: tauri::AppHandle,
    expense_id: String,
    src_path: String,
    file_type: Option<String>,
    user_id: Option<String>,
    state: State<DbState>,
) -> Result<ExpenseAttachment, String> {
    // 1. Get base path and create directory
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let attach_dir = base.join("attachments").join("expenses").join(&expense_id);
    std::fs::create_dir_all(&attach_dir).map_err(|e| e.to_string())?;

    // 2. Copy file
    let file_name = std::path::Path::new(&src_path)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Invalid source file name")?
        .to_string();
    let dest_path = attach_dir.join(&file_name);
    std::fs::copy(&src_path, &dest_path).map_err(|e| e.to_string())?;

    // 3. Create database record
    let conn = state.db.lock().unwrap();
    let new_id = generate_id(Some("ATT".to_string()));
    let now = chrono::Utc::now().to_rfc3339();

    let new_attachment = ExpenseAttachment {
        id: new_id,
        expense_id: expense_id.clone(),
        file_name,
        file_path: dest_path.to_string_lossy().to_string(),
        file_type,
        uploaded_at: now,
        uploaded_by: user_id,
    };

    conn.execute(
        "INSERT INTO expense_attachments (id, expense_id, file_name, file_path, file_type, uploaded_at, uploaded_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &new_attachment.id,
            &new_attachment.expense_id,
            &new_attachment.file_name,
            &new_attachment.file_path,
            &new_attachment.file_type,
            &new_attachment.uploaded_at,
            &new_attachment.uploaded_by,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(new_attachment)
}

// --- Reporting Commands ---
#[tauri::command]
pub fn generate_shipment_expense_report(
    shipment_id: String,
    state: State<DbState>,
) -> Result<Vec<Expense>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT 
            e.id,
            e.expense_invoice_id,
            e.expense_type_id,
            e.amount,
            e.cgst_rate,
            e.sgst_rate,
            e.igst_rate,
            e.tds_rate,
            e.cgst_amount,
            e.sgst_amount,
            e.igst_amount,
            e.tds_amount,
            e.total_amount,
            e.remarks,
            e.created_by,
            e.created_at,
            e.updated_at
        FROM expenses e
        INNER JOIN expense_invoices ei ON e.expense_invoice_id = ei.id
        WHERE ei.shipment_id = ?
        ORDER BY ei.invoice_date DESC, e.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let expenses = stmt
        .query_map([&shipment_id], |row| {
            Ok(Expense {
                id: row.get(0)?,
                expense_invoice_id: row.get(1)?,
                expense_type_id: row.get(2)?,
                amount: row.get(3)?,
                cgst_rate: row.get(4)?,
                sgst_rate: row.get(5)?,
                igst_rate: row.get(6)?,
                tds_rate: row.get(7)?,
                cgst_amount: row.get(8)?,
                sgst_amount: row.get(9)?,
                igst_amount: row.get(10)?,
                tds_amount: row.get(11)?,
                total_amount: row.get(12)?,
                remarks: row.get(13)?,
                created_by: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(expenses)
}

#[tauri::command]
pub fn generate_monthly_gst_summary(
    month: u32,
    year: i32,
    state: State<DbState>,
) -> Result<Vec<Expense>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT 
            e.id,
            e.expense_invoice_id,
            e.expense_type_id,
            e.amount,
            e.cgst_rate,
            e.sgst_rate,
            e.igst_rate,
            e.tds_rate,
            e.cgst_amount,
            e.sgst_amount,
            e.igst_amount,
            e.tds_amount,
            e.total_amount,
            e.remarks,
            e.created_by,
            e.created_at,
            e.updated_at
        FROM expenses e
        INNER JOIN expense_invoices ei ON e.expense_invoice_id = ei.id
        WHERE strftime('%m', ei.invoice_date) = ? AND strftime('%Y', ei.invoice_date) = ?
        ORDER BY ei.invoice_date DESC, e.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let month_str = format!("{:02}", month);
    let year_str = format!("{}", year);

    let expenses = stmt
        .query_map([&month_str, &year_str], |row| {
            Ok(Expense {
                id: row.get(0)?,
                expense_invoice_id: row.get(1)?,
                expense_type_id: row.get(2)?,
                amount: row.get(3)?,
                cgst_rate: row.get(4)?,
                sgst_rate: row.get(5)?,
                igst_rate: row.get(6)?,
                tds_rate: row.get(7)?,
                cgst_amount: row.get(8)?,
                sgst_amount: row.get(9)?,
                igst_amount: row.get(10)?,
                tds_amount: row.get(11)?,
                total_amount: row.get(12)?,
                remarks: row.get(13)?,
                created_by: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(expenses)
}

// --- Expense Payload for individual expenses within an invoice
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExpensePayload {
    pub expense_invoice_id: String,
    pub expense_type_id: String,
    pub amount: f64,
    pub cgst_rate: Option<f64>,
    pub sgst_rate: Option<f64>,
    pub igst_rate: Option<f64>,
    pub tds_rate: Option<f64>,
    pub remarks: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BulkExpensePayload {
    pub shipment_id: String,
    pub currency: String,
    pub expenses: Vec<BulkExpenseItem>,
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BulkExpenseItem {
    pub expense_type_name: String,
    pub service_provider_id: String,
    pub invoice_no: String,
    pub invoice_date: String,
    pub amount: f64,
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub tds_amount: f64,
    pub remarks: Option<String>,
}

// --- Expense Payload for new expenses (without expense_invoice_id)
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewExpensePayload {
    pub expense_type_id: String,
    pub amount: f64,
    pub cgst_rate: Option<f64>,
    pub sgst_rate: Option<f64>,
    pub igst_rate: Option<f64>,
    pub tds_rate: Option<f64>,
    pub remarks: Option<String>,
}

// --- Combined payload for creating expense invoice with multiple expenses
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseInvoiceWithExpensesPayload {
    pub shipment_id: String,
    pub service_provider_id: String,
    pub invoice_no: String,
    pub invoice_date: String,
    pub remarks: Option<String>,
    pub expenses: Vec<NewExpensePayload>,
}

// --- Helper function to update invoice total
fn update_invoice_total(conn: &rusqlite::Connection, invoice_id: &str) -> Result<(), String> {
    // Calculate the totals from the database-generated amounts
    let mut stmt = conn
        .prepare(
            "SELECT 
        SUM(amount + cgst_amount + sgst_amount + igst_amount) as total_amount,
        SUM(cgst_amount) as total_cgst_amount,
        SUM(sgst_amount) as total_sgst_amount,
        SUM(igst_amount) as total_igst_amount
        FROM expenses WHERE expense_invoice_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let (invoice_total, total_cgst, total_sgst, total_igst): (f64, f64, f64, f64) = stmt
        .query_row(params![invoice_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?;

    // Update the expense invoice with the correct totals (TDS is NOT subtracted from total)
    conn.execute(
        "UPDATE expense_invoices SET total_amount = ?1, total_cgst_amount = ?2, total_sgst_amount = ?3, total_igst_amount = ?4 WHERE id = ?5",
        params![&invoice_total, &total_cgst, &total_sgst, &total_igst, invoice_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// --- NEW: Create expense invoice with multiple expenses
#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn add_expense_invoice_with_expenses(
    payload: ExpenseInvoiceWithExpensesPayload,
    state: State<'_, DbState>,
) -> Result<ExpenseInvoice, String> {
    let mut conn = state.db.lock().unwrap();

    // First, check if an expense invoice with the same service provider and invoice number already exists
    let existing_invoice_id = {
        let mut stmt = conn.prepare("SELECT id FROM expense_invoices WHERE service_provider_id = ?1 AND invoice_no = ?2")
            .map_err(|e| e.to_string())?;

        stmt.query_row(
            params![&payload.service_provider_id, &payload.invoice_no],
            |row| row.get::<_, String>(0),
        )
        .ok()
    };

    let invoice_id = if let Some(existing_id) = existing_invoice_id {
        // Update existing invoice and delete its expenses
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE expense_invoices SET shipment_id = ?1, invoice_date = ?2, remarks = ?3 WHERE id = ?4",
            params![
                &payload.shipment_id,
                &payload.invoice_date,
                &payload.remarks,
                &existing_id,
            ],
        ).map_err(|e| e.to_string())?;

        // Delete existing expenses for this invoice
        tx.execute(
            "DELETE FROM expenses WHERE expense_invoice_id = ?1",
            params![&existing_id],
        )
        .map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        existing_id
    } else {
        // Create new expense invoice
        let new_invoice_id = generate_id(Some("EINV".to_string()));

        let tx = conn.transaction().map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO expense_invoices (id, shipment_id, service_provider_id, invoice_no, invoice_date, total_amount, remarks)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &new_invoice_id,
                &payload.shipment_id,
                &payload.service_provider_id,
                &payload.invoice_no,
                &payload.invoice_date,
                &0.0, // Placeholder total, will be updated after expenses are created
                &payload.remarks,
            ],
        ).map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        new_invoice_id
    };

    // Create individual expenses in a separate transaction
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for expense_payload in &payload.expenses {
        let expense_id = generate_id(Some("EXP".to_string()));

        tx.execute(
            "INSERT INTO expenses (id, expense_invoice_id, shipment_id, service_provider_id, invoice_no, invoice_date, expense_type_id, amount, cgst_rate, sgst_rate, igst_rate, tds_rate, remarks, created_by)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                &expense_id,
                &invoice_id,
                &payload.shipment_id,
                &payload.service_provider_id,
                &payload.invoice_no,
                &payload.invoice_date,
                &expense_payload.expense_type_id,
                &expense_payload.amount,
                &expense_payload.cgst_rate.unwrap_or(0.0),
                &expense_payload.sgst_rate.unwrap_or(0.0),
                &expense_payload.igst_rate.unwrap_or(0.0),
                &expense_payload.tds_rate.unwrap_or(0.0),
                &expense_payload.remarks,
                Option::<String>::None, // created_by
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    // Update the invoice total and fetch the result
    update_invoice_total(&conn, &invoice_id)?;

    // Fetch the created expense invoice
    let mut stmt = conn.prepare("SELECT id, shipment_id, service_provider_id, invoice_no, invoice_date, total_amount, total_cgst_amount, total_sgst_amount, total_igst_amount, remarks, created_by, created_at, updated_at FROM expense_invoices WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let expense_invoice = stmt
        .query_row(params![invoice_id], |row| {
            Ok(ExpenseInvoice {
                id: row.get(0)?,
                shipment_id: row.get(1)?,
                service_provider_id: row.get(2)?,
                invoice_no: row.get(3)?,
                invoice_date: row.get(4)?,
                total_amount: row.get(5)?,
                total_cgst_amount: row.get(6)?,
                total_sgst_amount: row.get(7)?,
                total_igst_amount: row.get(8)?,
                remarks: row.get(9)?,
                created_by: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(expense_invoice)
}

// --- NEW: Add individual expense to existing invoice
#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn add_expense(payload: ExpensePayload, state: State<'_, DbState>) -> Result<Expense, String> {
    let conn = state.db.lock().unwrap();

    let new_id = generate_id(Some("EXP".to_string()));

    // Get the invoice details to get shipment_id, service_provider_id, invoice_no, and invoice_date
    let mut stmt = conn.prepare("SELECT shipment_id, service_provider_id, invoice_no, invoice_date FROM expense_invoices WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let (shipment_id, service_provider_id, invoice_no, invoice_date): (
        String,
        String,
        String,
        String,
    ) = stmt
        .query_row(params![&payload.expense_invoice_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO expenses (id, expense_invoice_id, shipment_id, service_provider_id, invoice_no, invoice_date, expense_type_id, amount, cgst_rate, sgst_rate, igst_rate, tds_rate, remarks, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            &new_id,
            &payload.expense_invoice_id,
            &shipment_id,
            &service_provider_id,
            &invoice_no,
            &invoice_date,
            &payload.expense_type_id,
            &payload.amount,
            &payload.cgst_rate.unwrap_or(0.0),
            &payload.sgst_rate.unwrap_or(0.0),
            &payload.igst_rate.unwrap_or(0.0),
            &payload.tds_rate.unwrap_or(0.0),
            &payload.remarks,
            Option::<String>::None, // created_by
        ],
    ).map_err(|e| e.to_string())?;

    // Update the invoice total
    update_invoice_total(&conn, &payload.expense_invoice_id)?;

    // Fetch the newly created record to get generated values
    let mut stmt = conn.prepare("SELECT id, expense_invoice_id, expense_type_id, amount, cgst_rate, sgst_rate, igst_rate, tds_rate, cgst_amount, sgst_amount, igst_amount, tds_amount, total_amount, remarks, created_by, created_at, updated_at FROM expenses WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let expense = stmt
        .query_row(params![new_id], |row| {
            Ok(Expense {
                id: row.get(0)?,
                expense_invoice_id: row.get(1)?,
                expense_type_id: row.get(2)?,
                amount: row.get(3)?,
                cgst_rate: row.get(4)?,
                sgst_rate: row.get(5)?,
                igst_rate: row.get(6)?,
                tds_rate: row.get(7)?,
                cgst_amount: row.get(8)?,
                sgst_amount: row.get(9)?,
                igst_amount: row.get(10)?,
                tds_amount: row.get(11)?,
                total_amount: row.get(12)?,
                remarks: row.get(13)?,
                created_by: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(expense)
}

#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn update_expense(
    id: String,
    payload: ExpensePayload,
    state: State<'_, DbState>,
) -> Result<Expense, String> {
    let conn = state.db.lock().unwrap();

    // First, get the expense_invoice_id before updating
    let mut stmt = conn
        .prepare("SELECT expense_invoice_id FROM expenses WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let expense_invoice_id: String = stmt
        .query_row(params![&id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE expenses 
         SET expense_type_id = ?2, amount = ?3, cgst_rate = ?4, sgst_rate = ?5, igst_rate = ?6, tds_rate = ?7, remarks = ?8, updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
         WHERE id = ?1",
        params![
            &id,
            &payload.expense_type_id,
            &payload.amount,
            &payload.cgst_rate.unwrap_or(0.0),
            &payload.sgst_rate.unwrap_or(0.0),
            &payload.igst_rate.unwrap_or(0.0),
            &payload.tds_rate.unwrap_or(0.0),
            &payload.remarks,
        ],
    ).map_err(|e| e.to_string())?;

    // Update the invoice total
    update_invoice_total(&conn, &expense_invoice_id)?;

    // Fetch the updated record to get generated values
    let mut stmt = conn.prepare("SELECT id, expense_invoice_id, expense_type_id, amount, cgst_rate, sgst_rate, igst_rate, tds_rate, cgst_amount, sgst_amount, igst_amount, tds_amount, total_amount, remarks, created_by, created_at, updated_at FROM expenses WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let expense = stmt
        .query_row(params![id], |row| {
            Ok(Expense {
                id: row.get(0)?,
                expense_invoice_id: row.get(1)?,
                expense_type_id: row.get(2)?,
                amount: row.get(3)?,
                cgst_rate: row.get(4)?,
                sgst_rate: row.get(5)?,
                igst_rate: row.get(6)?,
                tds_rate: row.get(7)?,
                cgst_amount: row.get(8)?,
                sgst_amount: row.get(9)?,
                igst_amount: row.get(10)?,
                tds_amount: row.get(11)?,
                total_amount: row.get(12)?,
                remarks: row.get(13)?,
                created_by: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(expense)
}

#[tauri::command]
#[allow(dead_code)] // This is called from the frontend
pub fn delete_expense(id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();

    // First, get the expense_invoice_id before deleting
    let mut stmt = conn
        .prepare("SELECT expense_invoice_id FROM expenses WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let expense_invoice_id: String = stmt
        .query_row(params![&id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Optional: First, delete any associated attachments to maintain data integrity
    conn.execute(
        "DELETE FROM expense_attachments WHERE expense_id = ?1",
        params![&id],
    )
    .map_err(|e| e.to_string())?;

    // Then, delete the expense itself
    let rows_affected = conn
        .execute("DELETE FROM expenses WHERE id = ?1", params![&id])
        .map_err(|e| e.to_string())?;

    if rows_affected == 0 {
        return Err("Expense not found".to_string());
    }

    // Update the invoice total
    update_invoice_total(&conn, &expense_invoice_id)?;

    Ok(())
}

#[tauri::command]
pub fn add_expenses_bulk(
    payload: BulkExpensePayload,
    state: State<DbState>,
) -> Result<String, String> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Group expenses by unique service provider + invoice number combinations
    let mut invoice_groups: std::collections::HashMap<String, Vec<&BulkExpenseItem>> =
        std::collections::HashMap::new();

    for expense in &payload.expenses {
        let key = format!("{}|{}", expense.service_provider_id, expense.invoice_no);
        invoice_groups.entry(key).or_default().push(expense);
    }

    let mut created_invoice_ids = Vec::new();

    // Process each unique invoice group
    for (_key, expenses) in invoice_groups {
        let first_expense = expenses[0];

        // Create a unique invoice ID for this group
        let invoice_id = generate_id(Some("EXP-INV".to_string()));
        created_invoice_ids.push(invoice_id.clone());

        // Calculate totals for this invoice group
        let mut total_basic = 0.0f64;
        let mut total_cgst = 0.0f64;
        let mut total_sgst = 0.0f64;
        let mut total_igst = 0.0f64;
        let mut total_tds = 0.0f64;

        for expense in &expenses {
            total_basic += expense.amount;
            total_cgst += expense.cgst_amount;
            total_sgst += expense.sgst_amount;
            total_igst += expense.igst_amount;
            total_tds += expense.tds_amount;
        }

        let total_amount = total_basic + total_cgst + total_sgst + total_igst;
        let net_amount = total_amount - total_tds;

        // Compute paise totals for new module compatibility
        let total_amount_paise = (total_amount * 100.0).round() as i64;
        let total_cgst_amount_paise = (total_cgst * 100.0).round() as i64;
        let total_sgst_amount_paise = (total_sgst * 100.0).round() as i64;
        let total_igst_amount_paise = (total_igst * 100.0).round() as i64;
        let total_tds_amount_paise = (total_tds * 100.0).round() as i64;
        let net_amount_paise = (net_amount * 100.0).round() as i64;

        // Insert expense invoice for this group
        tx.execute(
            "INSERT INTO expense_invoices (
                id, shipment_id, service_provider_id, invoice_no, invoice_date,
                total_amount, total_cgst_amount, total_sgst_amount, total_igst_amount,
                total_amount_paise, total_cgst_amount_paise, total_sgst_amount_paise, total_igst_amount_paise,
                total_tds_amount_paise, net_amount_paise, currency, invoice_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &invoice_id,
                &payload.shipment_id,
                &first_expense.service_provider_id,
                &first_expense.invoice_no,
                &first_expense.invoice_date,
                total_amount,
                total_cgst,
                total_sgst,
                total_igst,
                total_amount_paise,
                total_cgst_amount_paise,
                total_sgst_amount_paise,
                total_igst_amount_paise,
                total_tds_amount_paise,
                net_amount_paise,
                &payload.currency,
                &first_expense.invoice_no,
            ],
        ).map_err(|e| e.to_string())?;

        // Insert individual expenses for this invoice group
        for expense in &expenses {
            let expense_id = generate_id(Some("EXP".to_string()));

            // Map type name -> id (case-insensitive)
            let expense_type_id: String = tx
                .query_row(
                    "SELECT id FROM expense_types WHERE lower(name) = lower(?)",
                    params![&expense.expense_type_name],
                    |r| r.get(0),
                )
                .map_err(|e| {
                    format!(
                        "Expense type '{}' not found: {}",
                        expense.expense_type_name, e
                    )
                })?;

            // Derive percentage rates from amounts; guard divide-by-zero
            let (cgst_rate, sgst_rate, igst_rate, tds_rate) = if expense.amount > 0.0 {
                (
                    (expense.cgst_amount / expense.amount) * 100.0,
                    (expense.sgst_amount / expense.amount) * 100.0,
                    (expense.igst_amount / expense.amount) * 100.0,
                    (expense.tds_amount / expense.amount) * 100.0,
                )
            } else {
                (0.0, 0.0, 0.0, 0.0)
            };

            // Paise and basis points for new module
            let amount_paise = (expense.amount * 100.0).round() as i64;
            let cgst_rate_bp = (cgst_rate * 100.0).round() as i32;
            let sgst_rate_bp = (sgst_rate * 100.0).round() as i32;
            let igst_rate_bp = (igst_rate * 100.0).round() as i32;
            let tds_rate_bp = (tds_rate * 100.0).round() as i32;

            // Insert expense with individual invoice details
            tx.execute(
                "INSERT INTO expenses (
                    id, expense_invoice_id, shipment_id, service_provider_id, invoice_no, invoice_date,
                    expense_type_id, amount, cgst_rate, sgst_rate, igst_rate, tds_rate, remarks,
                    amount_paise, cgst_amount_paise, sgst_amount_paise, igst_amount_paise, tds_amount_paise, total_amount_paise, net_amount_paise
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0)",
                params![
                    &expense_id,
                    &invoice_id,
                    &payload.shipment_id,
                    &expense.service_provider_id,
                    &expense.invoice_no,
                    &expense.invoice_date,
                    &expense_type_id,
                    expense.amount,
                    cgst_rate,
                    sgst_rate,
                    igst_rate,
                    tds_rate,
                    &expense.remarks,
                    amount_paise,
                ],
            ).map_err(|e| e.to_string())?;

            // Update paise totals for this line
            let cgst_amount_paise = (amount_paise as i128 * cgst_rate_bp as i128 / 10000) as i64;
            let sgst_amount_paise = (amount_paise as i128 * sgst_rate_bp as i128 / 10000) as i64;
            let igst_amount_paise = (amount_paise as i128 * igst_rate_bp as i128 / 10000) as i64;
            let tds_amount_paise = (amount_paise as i128 * tds_rate_bp as i128 / 10000) as i64;
            let total_amount_paise_line =
                amount_paise + cgst_amount_paise + sgst_amount_paise + igst_amount_paise;
            let net_amount_paise_line = total_amount_paise_line - tds_amount_paise;

            tx.execute(
                "UPDATE expenses SET 
                    cgst_amount_paise = ?, sgst_amount_paise = ?, igst_amount_paise = ?, tds_amount_paise = ?,
                    total_amount_paise = ?, net_amount_paise = ?
                 WHERE id = ?",
                params![
                    cgst_amount_paise,
                    sgst_amount_paise,
                    igst_amount_paise,
                    tds_amount_paise,
                    total_amount_paise_line,
                    net_amount_paise_line,
                    &expense_id,
                ],
            ).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    // Return the first invoice ID for backward compatibility
    Ok(created_invoice_ids
        .first()
        .unwrap_or(&"".to_string())
        .clone())
}

#[tauri::command]
pub fn delete_expense_invoice(invoice_id: String, state: State<DbState>) -> Result<(), String> {
    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // First, delete all expense attachments for expenses in this invoice
    tx.execute(
        "DELETE FROM expense_attachments 
         WHERE expense_id IN (
             SELECT id FROM expenses WHERE expense_invoice_id = ?1
         )",
        params![&invoice_id],
    )
    .map_err(|e| e.to_string())?;

    // Then, delete all expenses for this invoice
    let _expenses_deleted = tx
        .execute(
            "DELETE FROM expenses WHERE expense_invoice_id = ?1",
            params![&invoice_id],
        )
        .map_err(|e| e.to_string())?;

    // Finally, delete the expense invoice itself
    let invoice_deleted = tx
        .execute(
            "DELETE FROM expense_invoices WHERE id = ?1",
            params![&invoice_id],
        )
        .map_err(|e| e.to_string())?;

    // Check if the invoice was found and deleted
    if invoice_deleted == 0 {
        return Err("Expense invoice not found".to_string());
    }

    // Commit the transaction
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn debug_expense_data_counts(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();

    let mut result = String::new();

    // Count expense invoices
    let invoice_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM expense_invoices", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;
    result.push_str(&format!("Expense invoices count: {}\n", invoice_count));

    // Count expenses
    let expense_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM expenses", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    result.push_str(&format!("Expenses count: {}\n", expense_count));

    // Count service providers
    let provider_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM service_providers", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;
    result.push_str(&format!("Service providers count: {}\n", provider_count));

    // Count expense types
    let type_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM expense_types", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    result.push_str(&format!("Expense types count: {}\n", type_count));

    // Check if there are any orphaned expenses (expenses without valid invoice)
    let orphaned_expenses: i64 = conn.query_row(
        "SELECT COUNT(*) FROM expenses e LEFT JOIN expense_invoices ei ON e.expense_invoice_id = ei.id WHERE ei.id IS NULL",
        [],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    result.push_str(&format!("Orphaned expenses count: {}\n", orphaned_expenses));

    // Check if there are any expense invoices without valid shipment
    let invalid_shipment_invoices: i64 = conn.query_row(
        "SELECT COUNT(*) FROM expense_invoices ei LEFT JOIN shipments s ON ei.shipment_id = s.id WHERE s.id IS NULL",
        [],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    result.push_str(&format!(
        "Expense invoices with invalid shipment: {}\n",
        invalid_shipment_invoices
    ));

    Ok(result)
}

#[tauri::command]
pub fn create_test_expense_data(state: State<DbState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();
    let mut result = String::new();

    // Check if test data already exists
    let existing_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM expense_invoices", [], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    if existing_count > 0 {
        result.push_str(&format!(
            "Test data already exists: {} expense invoices found. Skipping creation.\n",
            existing_count
        ));
        return Ok(result);
    }

    // Create test service providers
    let test_providers = vec![
        (
            "provider1",
            "ABC Logistics",
            "GST001",
            "Karnataka",
            "John Doe",
            "john@abc.com",
            "1234567890",
        ),
        (
            "provider2",
            "XYZ Transport",
            "GST002",
            "Maharashtra",
            "Jane Smith",
            "jane@xyz.com",
            "0987654321",
        ),
    ];

    for (id, name, gstin, state, contact_person, email, phone) in test_providers {
        conn.execute(
            "INSERT INTO service_providers (id, name, gstin, state, contact_person, contact_email, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![id, name, gstin, state, contact_person, email, phone],
        ).map_err(|e| e.to_string())?;
    }
    result.push_str("Created 2 test service providers\n");

    // Create test expense types
    let test_types = vec![
        ("type1", "Transport Charges", 900, 900, 0), // 9% CGST, 9% SGST
        ("type2", "Customs Duty", 900, 900, 0),      // 9% CGST, 9% SGST
        ("type3", "Documentation", 900, 900, 0),     // 9% CGST, 9% SGST
    ];

    for (id, name, cgst, sgst, igst) in test_types {
        conn.execute(
            "INSERT INTO expense_types (id, name, default_cgst_rate_bp, default_sgst_rate_bp, default_igst_rate_bp, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            params![id, name, cgst, sgst, igst, true],
        ).map_err(|e| e.to_string())?;
    }
    result.push_str("Created 3 test expense types\n");

    // Create test expense invoices and expenses
    let test_invoices = vec![
        (
            "inv1",
            "provider1",
            "INV001",
            "2025-01-15",
            "2025-01-15",
            100000,
            9000,
            9000,
            0,
            0,
        ), // 1000 rupees
        (
            "inv2",
            "provider1",
            "INV002",
            "2025-01-20",
            "2025-01-20",
            150000,
            13500,
            13500,
            0,
            0,
        ), // 1500 rupees
        (
            "inv3",
            "provider2",
            "INV003",
            "2025-02-10",
            "2025-02-10",
            80000,
            7200,
            7200,
            0,
            0,
        ), // 800 rupees
    ];

    let mut invoice_count = 0;
    let mut expense_count = 0;

    for (
        inv_id,
        provider_id,
        inv_no,
        inv_date,
        shipment_id,
        amount_paise,
        cgst_paise,
        sgst_paise,
        igst_paise,
        tds_paise,
    ) in test_invoices
    {
        // Create expense invoice
        conn.execute(
            "INSERT INTO expense_invoices (id, shipment_id, service_provider_id, invoice_number, invoice_no, invoice_date, currency, total_amount_paise, total_cgst_amount_paise, total_sgst_amount_paise, total_igst_amount_paise, total_tds_amount_paise, net_amount_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![inv_id, shipment_id, provider_id, inv_no, inv_no, inv_date, "INR", amount_paise, cgst_paise, sgst_paise, igst_paise, tds_paise, amount_paise + cgst_paise + sgst_paise + igst_paise - tds_paise],
        ).map_err(|e| e.to_string())?;
        invoice_count += 1;

        // Create expense line item
        let expense_id = format!("exp{}", invoice_count);
        let expense_type_id = if invoice_count == 1 {
            "type1"
        } else if invoice_count == 2 {
            "type2"
        } else {
            "type3"
        };

        conn.execute(
            "INSERT INTO expenses (id, expense_invoice_id, shipment_id, service_provider_id, invoice_no, invoice_date, expense_type_id, amount_paise, cgst_rate, sgst_rate, igst_rate, tds_rate, cgst_amount_paise, sgst_amount_paise, igst_amount_paise, tds_amount_paise, total_amount_paise, net_amount_paise, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                expense_id,
                inv_id,
                shipment_id,
                provider_id,
                inv_no,
                inv_date,
                expense_type_id,
                amount_paise,
                900, // 9% CGST
                900, // 9% SGST
                0,   // 0% IGST
                0,   // 0% TDS
                cgst_paise,
                sgst_paise,
                igst_paise,
                tds_paise,
                amount_paise + cgst_paise + sgst_paise + igst_paise,
                amount_paise + cgst_paise + sgst_paise + igst_paise - tds_paise,
                format!("Test expense {}", invoice_count)
            ],
        ).map_err(|e| e.to_string())?;
        expense_count += 1;
    }

    result.push_str(&format!(
        "Created {} test expense invoices with {} expenses\n",
        invoice_count, expense_count
    ));
    result.push_str("Test data created successfully!\n");

    Ok(result)
}

#[tauri::command]
pub fn cleanup_orphaned_expense_invoices(state: State<DbState>) -> Result<String, String> {
    let mut conn = state.db.lock().unwrap();

    // First, find orphaned expense invoices (those with no associated expenses)
    let orphaned_invoices: Vec<(String, String, String)> = {
        let mut stmt = conn.prepare(
            "SELECT id, invoice_no, service_provider_id 
             FROM expense_invoices 
             WHERE id NOT IN (SELECT DISTINCT expense_invoice_id FROM expenses WHERE expense_invoice_id IS NOT NULL)"
        ).map_err(|e| e.to_string())?;

        let x = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        x
    };

    let mut result = format!(
        "Found {} orphaned expense invoices:\n",
        orphaned_invoices.len()
    );

    for (id, invoice_no, service_provider_id) in &orphaned_invoices {
        result.push_str(&format!(
            "  - ID: {}, Invoice: {}, Provider: {}\n",
            id, invoice_no, service_provider_id
        ));
    }

    if !orphaned_invoices.is_empty() {
        // Delete orphaned expense invoices in a transaction
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        let deleted_count = tx.execute(
            "DELETE FROM expense_invoices 
             WHERE id NOT IN (SELECT DISTINCT expense_invoice_id FROM expenses WHERE expense_invoice_id IS NOT NULL)",
            []
        ).map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;

        result.push_str(&format!(
            "\nDeleted {} orphaned expense invoices successfully.\n",
            deleted_count
        ));
    } else {
        result.push_str("\nNo orphaned expense invoices found.\n");
    }

    Ok(result)
}
