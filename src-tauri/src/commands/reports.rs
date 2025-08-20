use crate::db::DbState;
use crate::expense::{ExpenseReportFilters, ExpenseReportResponse, ExpenseSummaryByType, ExpenseSummaryByProvider, ExpenseSummaryByShipment, ExpenseSummaryByMonth, ExpenseService};

use tauri::State;

#[derive(serde::Serialize, Debug)]
pub struct ReportRow {
    pub supplier: String,
    pub invoice_no: String,
    pub invoice_date: String,
    pub part_no: String,
    pub description: String,
    pub unit: String,
    pub qty: f64,
    pub unit_price: f64,
    pub assessable_value: f64,
    pub bcd_amount: f64,
    pub sws_amount: f64,
    pub igst_amount: f64,
    pub expenses_total: f64,
    pub ldc_per_qty: f64,
}

#[derive(serde::Serialize, Debug)]
pub struct ReportTotals {
    pub qty: f64,
    pub assessable_value: f64,
    pub bcd_amount: f64,
    pub sws_amount: f64,
    pub igst_amount: f64,
    pub expenses_total: f64,
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    #[allow(dead_code)] // Intentionally unused for now, can be implemented later
    pub supplier_id: Option<String>,
    pub supplier: Option<String>,
    pub invoice_no: Option<String>,
    pub part_no: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub sort_by: Option<String>,   // column name
    pub sort_direction: Option<String>,  // asc|desc
    pub include_totals: Option<bool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportResponse {
    pub rows: Vec<ReportRow>,
    pub page: u32,
    pub page_size: u32,
    pub total_rows: u32,
    pub totals: Option<ReportTotals>,
}

#[allow(unused_assignments)]
fn build_report_where(filters: &ReportFilters) -> (String, Vec<(String, String)>) {
    let mut conditions = Vec::new();
    let mut params = Vec::new();
    let mut idx = 1;

    println!("=== build_report_where called ===");
    println!("Filters: {filters:?}");

    if let Some(start_date) = &filters.start_date {
        println!("Adding start_date filter: {start_date}");
        conditions.push(format!("invoice_date >= ?{idx}"));
        params.push((format!("start_date_{idx}"), start_date.clone()));
        idx += 1;
    }

    if let Some(end_date) = &filters.end_date {
        println!("Adding end_date filter: {end_date}");
        conditions.push(format!("invoice_date <= ?{idx}"));
        params.push((format!("end_date_{idx}"), end_date.clone()));
        idx += 1;
    }

    if let Some(supplier) = &filters.supplier {
        if !supplier.is_empty() {
            println!("Adding supplier filter: {supplier}");
            conditions.push(format!("supplier LIKE ?{idx}"));
            params.push((format!("supplier_{idx}"), format!("%{supplier}%")));
            idx += 1;
        }
    }

    if let Some(invoice_no) = &filters.invoice_no {
        if !invoice_no.is_empty() {
            println!("Adding invoice_no filter: {invoice_no}");
            conditions.push(format!("invoice_no LIKE ?{idx}"));
            params.push((format!("invoice_no_{idx}"), format!("%{invoice_no}%")));
            idx += 1;
        }
    }

    if let Some(part_no) = &filters.part_no {
        if !part_no.is_empty() {
            println!("Adding part_no filter: {part_no}");
            conditions.push(format!("part_no LIKE ?{idx}"));
            params.push((format!("part_no_{idx}"), format!("%{part_no}%")));
            idx += 1;
        }
    }

    // Note: supplier_id field is available but not currently used in filtering
    // This can be implemented late

    let where_sql = if conditions.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conditions.join(" AND "))
    };

    println!("Final WHERE SQL: {where_sql}");
    println!("Final params: {params:?}");

    (where_sql, params)
}

#[tauri::command]
pub fn get_report(filters: ReportFilters, state: State<DbState>) -> Result<ReportResponse, String> {
    let conn = state.db.lock().unwrap();
    
    // Debug logging
    println!("=== get_report called ===");
    println!("Filters: {filters:?}");

    let (where_sql, params) = build_report_where(&filters);
    
    // Debug logging
    println!("Where SQL: {where_sql}");
    println!("Params: {params:?}");

    // Determine sort column and direction
    let sort_col = match filters.sort_by.as_deref() {
        Some("supplier") => "supplier",
        Some("invoice_no") => "invoice_no",
        Some("invoice_date") => "invoice_date",
        Some("part_no") => "part_no",
        Some("description") => "description",
        Some("unit") => "unit",
        Some("qty") => "qty",
        Some("unit_price") => "unit_price",
        Some("assessable_value") => "assessable_value",
        Some("bcd_amount") => "bcd_amount",
        Some("sws_amount") => "sws_amount",
        Some("igst_amount") => "igst_amount",
        Some("expenses_total") => "expenses_total",
        Some("ldc_per_qty") => "ldc_per_qty",
        _ => "invoice_date"
    };
    
    let sort_dir = if filters.sort_direction.as_deref() == Some("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let page = filters.page.unwrap_or(1);
    let page_size = filters.page_size.unwrap_or(50);
    let offset = (page - 1) * page_size;

    // Debug logging
    println!("Sort: {sort_col} {sort_dir}");
    println!("Page: {page}, PageSize: {page_size}, Offset: {offset}");

    // Total rows
    let count_sql = format!("SELECT COUNT(1) FROM report_view{where_sql}");
    println!("Count SQL: {count_sql}");
    
    let mut count_stmt = conn.prepare(&count_sql).map_err(|e| {
        println!("Error preparing count statement: {e}");
        e.to_string()
    })?;
    
    let mut count_query = count_stmt.query(rusqlite::params_from_iter(params.iter().map(|(_, v)| v))).map_err(|e| {
        println!("Error executing count query: {e}");
        e.to_string()
    })?;
    
    let total_rows: u32 = if let Some(row) = count_query.next().map_err(|e| e.to_string())? {
        let count: i64 = row.get(0).map_err(|e| e.to_string())?;
        println!("Total rows found: {count}");
        count as u32
    } else {
        println!("No rows found in count query");
        0
    };

    // Data rows
    let sql = format!(
        "SELECT 
            supplier, invoice_no, invoice_date, part_no, description, unit, 
            printf('%.2f', qty) as qty,
            printf('%.4f', unit_price) as unit_price,
            printf('%.2f', assessable_value) as assessable_value,
            printf('%.2f', bcd_amount) as bcd_amount,
            printf('%.2f', sws_amount) as sws_amount,
            printf('%.2f', igst_amount) as igst_amount,
            printf('%.2f', expenses_total) as expenses_total,
            printf('%.2f', ldc_per_qty) as ldc_per_qty
        FROM report_view{} ORDER BY {} {} LIMIT ?{} OFFSET ?{}",
        where_sql,
        sort_col,
        sort_dir,
        params.len() + 1,
        params.len() + 2
    );
    
    println!("Data SQL: {sql}");
    
    let mut stmt = conn.prepare(&sql).map_err(|e| {
        println!("Error preparing data statement: {e}");
        e.to_string()
    })?;

    let mut param_values: Vec<String> = params.iter().map(|(_, v)| v.clone()).collect();
    param_values.push(page_size.to_string());
    param_values.push(offset.to_string());
    
    println!("Final param values: {param_values:?}");

    let rows_iter = stmt
        .query_map(rusqlite::params_from_iter(param_values.iter()), |row| {
            let report_row = ReportRow {
                supplier: row.get(0)?,
                invoice_no: row.get(1)?,
                invoice_date: row.get(2)?,
                part_no: row.get(3)?,
                description: row.get(4)?,
                unit: row.get(5)?,
                qty: row.get::<_, String>(6)?.parse::<f64>().unwrap_or(0.0),
                unit_price: row.get::<_, String>(7)?.parse::<f64>().unwrap_or(0.0),
                assessable_value: row.get::<_, String>(8)?.parse::<f64>().unwrap_or(0.0),
                bcd_amount: row.get::<_, String>(9)?.parse::<f64>().unwrap_or(0.0),
                sws_amount: row.get::<_, String>(10)?.parse::<f64>().unwrap_or(0.0),
                igst_amount: row.get::<_, String>(11)?.parse::<f64>().unwrap_or(0.0),
                expenses_total: row.get::<_, String>(12)?.parse::<f64>().unwrap_or(0.0),
                ldc_per_qty: row.get::<_, String>(13)?.parse::<f64>().unwrap_or(0.0),
            };
            println!("Row parsed: {report_row:?}");
            Ok(report_row)
        })
        .map_err(|e| {
            println!("Error in query_map: {e}");
            e.to_string()
        })?;

    let rows = rows_iter.collect::<Result<Vec<_>, _>>().map_err(|e| {
        println!("Error collecting rows: {e}");
        e.to_string()
    })?;
    
    println!("Total rows collected: {}", rows.len());

    // Calculate totals if requested
    let mut totals = None;
    if filters.include_totals.unwrap_or(false) {
        let totals_sql = format!(
            "SELECT 
                printf('%.2f', SUM(qty)) as total_qty,
                printf('%.2f', SUM(assessable_value)) as total_assessable_value,
                printf('%.2f', SUM(bcd_amount)) as total_bcd_amount,
                printf('%.2f', SUM(sws_amount)) as total_sws_amount,
                printf('%.2f', SUM(igst_amount)) as total_igst_amount,
                printf('%.2f', SUM(expenses_total)) as total_expenses_total
            FROM report_view{where_sql}"
        );
        
        println!("Totals SQL: {totals_sql}");
        
        let mut totals_stmt = conn.prepare(&totals_sql).map_err(|e| e.to_string())?;
        let mut totals_query = totals_stmt.query(rusqlite::params_from_iter(params.iter().map(|(_, v)| v))).map_err(|e| e.to_string())?;
        
        if let Some(totals_row) = totals_query.next().map_err(|e| e.to_string())? {
            totals = Some(ReportTotals {
                qty: totals_row.get::<_, String>(0).map_err(|e| e.to_string())?.parse::<f64>().unwrap_or(0.0),
                assessable_value: totals_row.get::<_, String>(1).map_err(|e| e.to_string())?.parse::<f64>().unwrap_or(0.0),
                bcd_amount: totals_row.get::<_, String>(2).map_err(|e| e.to_string())?.parse::<f64>().unwrap_or(0.0),
                sws_amount: totals_row.get::<_, String>(3).map_err(|e| e.to_string())?.parse::<f64>().unwrap_or(0.0),
                igst_amount: totals_row.get::<_, String>(4).map_err(|e| e.to_string())?.parse::<f64>().unwrap_or(0.0),
                expenses_total: totals_row.get::<_, String>(5).map_err(|e| e.to_string())?.parse::<f64>().unwrap_or(0.0),
            });
            println!("Totals calculated: {totals:?}");
        }
    }

    println!("=== get_report completed ===");
    Ok(ReportResponse { rows, page, page_size, total_rows, totals })
}

// ============================================================================
// EXPENSE REPORTING COMMANDS
// ============================================================================

/// Generate detailed expense report with filters
#[tauri::command]
pub fn generate_expense_report(
    filters: ExpenseReportFilters,
    state: State<DbState>,
) -> Result<ExpenseReportResponse, String> {
    let conn = state.db.lock().unwrap();
    ExpenseService::generate_expense_report(&conn, &filters)
        .map_err(|e| e.to_string())
}

/// Generate summary report grouped by expense type
#[tauri::command]
pub fn generate_expense_summary_by_type(
    filters: ExpenseReportFilters,
    state: State<DbState>,
) -> Result<Vec<ExpenseSummaryByType>, String> {
    let conn = state.db.lock().unwrap();
    ExpenseService::generate_summary_by_type(&conn, &filters)
        .map_err(|e| e.to_string())
}

/// Generate summary report grouped by service provider
#[tauri::command]
pub fn generate_expense_summary_by_provider(
    filters: ExpenseReportFilters,
    state: State<DbState>,
) -> Result<Vec<ExpenseSummaryByProvider>, String> {
    let conn = state.db.lock().unwrap();
    ExpenseService::generate_summary_by_provider(&conn, &filters)
        .map_err(|e| e.to_string())
}

/// Generate summary report grouped by shipment
#[tauri::command]
pub fn generate_expense_summary_by_shipment(
    filters: ExpenseReportFilters,
    state: State<DbState>,
) -> Result<Vec<ExpenseSummaryByShipment>, String> {
    let conn = state.db.lock().unwrap();
    ExpenseService::generate_summary_by_shipment(&conn, &filters)
        .map_err(|e| e.to_string())
}

/// Generate summary report grouped by month
#[tauri::command]
pub fn generate_expense_summary_by_month(
    filters: ExpenseReportFilters,
    state: State<DbState>,
) -> Result<Vec<ExpenseSummaryByMonth>, String> {
    let conn = state.db.lock().unwrap();
    ExpenseService::generate_summary_by_month(&conn, &filters)
        .map_err(|e| e.to_string())
}
