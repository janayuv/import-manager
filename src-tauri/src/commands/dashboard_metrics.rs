#![allow(clippy::uninlined_format_args)]
//! Dashboard aggregates and KPI governance (ERP-style direction).

use crate::commands::dashboard_cache::{
    read_cached_metrics_json, write_metrics_cache,
};
use crate::commands::exception_reliability::log_integrity_issue;
use crate::commands::utils::dashboard_activity_checksum;
use crate::db::DbState;
use chrono::Utc;
use rusqlite::{params, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardMetricsFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub supplier_id: Option<String>,
    /// When set, restricts shipment-based metrics to this ISO currency code.
    pub currency: Option<String>,
    /// 1–12; month in which fiscal year starts (e.g. 4 = April). Used only when `fiscal_year` is set.
    #[serde(default)]
    pub fiscal_year_start_month: Option<u8>,
    /// When set (e.g. 2025), `start_date`/`end_date` are overridden to that Indian-style FY if not already set.
    pub fiscal_year: Option<i32>,
    /// Optional role for `role_dashboard_permissions` (does not affect cache key).
    #[serde(default)]
    pub user_role: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardException {
    pub kind: String,
    pub severity: String,
    pub message: String,
    pub count: i64,
    #[serde(default)]
    pub exception_type: String,
    /// `aggregate` for rolled-up dashboard rows; `shipment` when a single entity is targeted.
    #[serde(default)]
    pub entity_type: String,
    #[serde(default)]
    pub navigation_target: String,
    /// Full client route including query string (e.g. `/shipment?overdue=true`).
    #[serde(default)]
    pub navigation_url: String,
    #[serde(default)]
    pub filter_parameters: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub entity_id: Option<String>,
    /// Sample shipment IDs in scope (capped) for drill-down / entity workflows.
    #[serde(default)]
    pub sample_shipment_ids: Vec<String>,
}

fn shipment_exception_navigation_url(
    navigation_target: &str,
    filter_parameters: &serde_json::Map<String, serde_json::Value>,
) -> String {
    let base = if navigation_target.trim().is_empty() {
        "/shipment"
    } else {
        navigation_target.trim()
    };
    if filter_parameters.is_empty() {
        return base.to_string();
    }
    let mut pairs = Vec::new();
    for (k, v) in filter_parameters {
        let val = match v {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Number(n) => n.to_string(),
            _ => continue,
        };
        pairs.push(format!("{k}={val}"));
    }
    if pairs.is_empty() {
        base.to_string()
    } else {
        format!("{}?{}", base, pairs.join("&"))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonthlySummaryRow {
    pub period: String,
    pub shipments: i64,
    pub value: f64,
    pub duty_savings: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct KpiActiveAlert {
    pub kpi_name: String,
    pub current_value: f64,
    pub threshold_value: f64,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DailyExceptionSummaryRow {
    pub snapshot_date: String,
    pub overdue_count: i64,
    pub missing_boe_count: i64,
    pub missing_expense_count: i64,
    pub missing_document_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct KpiForecastPoint {
    pub date: String,
    pub projected_total_shipments: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct KpiForecastBlock {
    pub points: Vec<KpiForecastPoint>,
    pub basis_days: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DashboardErpExtras {
    #[serde(default)]
    pub overdue_eta_count: i64,
    #[serde(default)]
    pub active_kpi_alerts: Vec<KpiActiveAlert>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub exception_trend: Vec<DailyExceptionSummaryRow>,
    #[serde(default)]
    pub dashboard_permissions: HashMap<String, bool>,
    #[serde(default)]
    pub avg_compliance_score: f64,
    #[serde(default)]
    pub compliance_low_count: i64,
    #[serde(default)]
    pub kpi_forecast: Option<KpiForecastBlock>,
    #[serde(default)]
    pub entity_exceptions: Vec<crate::commands::exception_workflow::EntityExceptionDto>,
    #[serde(default)]
    pub exception_workflow: crate::commands::exception_workflow::ExceptionWorkflowSummary,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DashboardMetricsResponse {
    pub snapshot_at: String,
    pub total_suppliers: i64,
    pub total_items: i64,
    pub total_shipments: i64,
    pub pending_shipments: i64,
    pub delivered_shipments: i64,
    pub reconciled_boes: i64,
    pub total_invoice_value: f64,
    pub avg_transit_days: Option<f64>,
    pub expense_total: f64,
    pub duty_total: f64,
    pub total_duty_savings_estimate: f64,
    pub landed_cost_total: f64,
    pub monthly_summary: Vec<MonthlySummaryRow>,
    pub exceptions: Vec<DashboardException>,
    /// Counts for lightweight document / field compliance (Phase D-lite).
    pub document_compliance: DocumentComplianceSummary,
    #[serde(default)]
    pub erp: DashboardErpExtras,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentComplianceSummary {
    pub shipments_missing_eta: i64,
    pub shipments_missing_etd: i64,
    pub shipments_without_boe_row: i64,
    pub shipments_without_expense: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KpiMetadataRow {
    pub kpi_name: String,
    pub formula: String,
    pub description: String,
    pub unit: String,
    pub last_updated: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KpiSnapshotQuery {
    pub kpi_name: Option<String>,
    pub limit_days: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KpiSnapshotHistoryRow {
    pub snapshot_date: String,
    pub kpi_name: String,
    pub value: f64,
    pub created_at: String,
}

struct ShipmentScope {
    where_sql: String,
    params: Vec<String>,
}

impl ShipmentScope {
    fn from_filters(f: &DashboardMetricsFilters) -> Self {
        let mut parts = vec!["1=1".to_string()];
        let mut params = Vec::new();

        let has_start = f
            .start_date
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let has_end = f
            .end_date
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);

        if has_start || has_end {
            if let Some(sd) = &f.start_date {
                if !sd.trim().is_empty() {
                    parts.push("s.invoice_date >= ?".to_string());
                    params.push(sd.trim().to_string());
                }
            }
            if let Some(ed) = &f.end_date {
                if !ed.trim().is_empty() {
                    parts.push("s.invoice_date <= ?".to_string());
                    params.push(ed.trim().to_string());
                }
            }
        } else if let Some(fy) = f.fiscal_year {
            let m = i32::from(f.fiscal_year_start_month.unwrap_or(4).clamp(1, 12));
            let (start_y, start_m, end_y, end_m) = if m == 4 {
                (fy - 1, 4, fy, 3)
            } else if m == 1 {
                (fy, 1, fy, 12)
            } else {
                (fy - 1, m, fy, m - 1)
            };
            let start = format!("{start_y:04}-{start_m:02}-01");
            let end = format!("{end_y:04}-{end_m:02}-31");
            parts.push("s.invoice_date >= ?".to_string());
            params.push(start);
            parts.push("s.invoice_date <= ?".to_string());
            params.push(end);
        }

        if let Some(sid) = &f.supplier_id {
            if !sid.is_empty() {
                parts.push("s.supplier_id = ?".to_string());
                params.push(sid.clone());
            }
        }

        if let Some(cur) = &f.currency {
            if !cur.is_empty() {
                parts.push("s.invoice_currency = ?".to_string());
                params.push(cur.clone());
            }
        }

        Self {
            where_sql: parts.join(" AND "),
            params,
        }
    }
}

fn query_i64(conn: &rusqlite::Connection, sql: &str, p: &[&dyn ToSql]) -> Result<i64, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params_from_iter(p.iter().copied()), |r| r.get(0))
        .map_err(|e| e.to_string())
}

fn query_f64(conn: &rusqlite::Connection, sql: &str, p: &[&dyn ToSql]) -> Result<f64, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params_from_iter(p.iter().copied()), |r| r.get(0))
        .map_err(|e| e.to_string())
}

fn metrics_cache_key(filters: &DashboardMetricsFilters) -> Result<String, String> {
    let mut fk = filters.clone();
    fk.user_role = None;
    let json = serde_json::to_string(&fk).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    h.update(json.as_bytes());
    Ok(format!("{:x}", h.finalize()))
}

fn metric_value_for_alert(
    name: &str,
    r: &DashboardMetricsResponse,
    overdue: i64,
) -> Option<f64> {
    match name {
        "pending_shipments" => Some(r.pending_shipments as f64),
        "overdue_eta" => Some(overdue as f64),
        "total_shipments" => Some(r.total_shipments as f64),
        "duty_total" => Some(r.duty_total),
        "expense_total" => Some(r.expense_total),
        _ => None,
    }
}

fn cmp_rule(op: &str, value: f64, threshold: f64) -> bool {
    match op {
        "GT" => value > threshold,
        "GTE" => value >= threshold,
        "LT" => value < threshold,
        "LTE" => value <= threshold,
        "EQ" => (value - threshold).abs() < f64::EPSILON * 1024.0,
        _ => false,
    }
}

fn evaluate_kpi_alerts(
    conn: &rusqlite::Connection,
    r: &DashboardMetricsResponse,
    overdue: i64,
) -> Result<Vec<KpiActiveAlert>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT kpi_name, threshold_value, comparison_operator, severity FROM kpi_alert_rules WHERE enabled = 1",
        )
        .map_err(|e| e.to_string())?;
    let rules = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for rule in rules {
        let (kpi_name, threshold, op, severity) = rule.map_err(|e| e.to_string())?;
        let Some(v) = metric_value_for_alert(&kpi_name, r, overdue) else {
            continue;
        };
        if cmp_rule(&op, v, threshold) {
            let msg = format!("{kpi_name} is {v} (rule: {op} {threshold})");
            let open_today: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM kpi_alert_log WHERE kpi_name = ?1 AND resolved_at IS NULL
                     AND date(triggered_at) = date('now')",
                    params![&kpi_name],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if open_today == 0 {
                let id = Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO kpi_alert_log (alert_id, kpi_name, current_value, threshold_value, severity, triggered_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))",
                    params![&id, &kpi_name, v, threshold, &severity],
                );
            }
            out.push(KpiActiveAlert {
                kpi_name,
                current_value: v,
                threshold_value: threshold,
                severity,
                message: msg,
            });
        }
    }
    Ok(out)
}

fn load_dashboard_permissions(conn: &rusqlite::Connection, role: &str) -> HashMap<String, bool> {
    let role_lc = role.to_lowercase();
    let mut m = HashMap::new();
    let Ok(mut stmt) = conn.prepare(
        "SELECT widget_key, visible FROM role_dashboard_permissions WHERE lower(role) = lower(?1)",
    ) else {
        return m;
    };
    let Ok(rows) = stmt.query_map(params![role_lc], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? == 1))
    }) else {
        return m;
    };
    for row in rows.flatten() {
        m.insert(row.0, row.1);
    }
    if m.is_empty() {
        for widget_key in [
            "kpis", "charts", "exceptions", "finance", "compliance", "history", "forecast",
        ] {
            m.insert(widget_key.to_string(), true);
        }
    }
    m
}

fn load_exception_trend(conn: &rusqlite::Connection, limit: i64) -> Vec<DailyExceptionSummaryRow> {
    let sql = "SELECT snapshot_date, overdue_count, missing_boe_count, missing_expense_count, missing_document_count
               FROM daily_exception_summary ORDER BY snapshot_date DESC LIMIT ?1";
    let Ok(mut stmt) = conn.prepare(sql) else {
        return vec![];
    };
    let Ok(rows) = stmt.query_map(params![limit], |r| {
        Ok(DailyExceptionSummaryRow {
            snapshot_date: r.get(0)?,
            overdue_count: r.get(1)?,
            missing_boe_count: r.get(2)?,
            missing_expense_count: r.get(3)?,
            missing_document_count: r.get(4)?,
        })
    }) else {
        return vec![];
    };
    rows.filter_map(|x| x.ok()).collect()
}

fn compute_compliance_aggregate(
    conn: &rusqlite::Connection,
    w: &str,
    p: &[&dyn ToSql],
) -> Result<(f64, i64), String> {
    let sql = format!(
        "WITH scores AS (
           SELECT (
             CASE WHEN EXISTS(SELECT 1 FROM invoices i WHERE i.shipment_id = s.id) THEN 1 ELSE 0 END +
             CASE WHEN EXISTS(SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id) THEN 1 ELSE 0 END +
             CASE WHEN EXISTS(SELECT 1 FROM expenses e WHERE e.shipment_id = s.id) THEN 1 ELSE 0 END +
             CASE WHEN LENGTH(TRIM(COALESCE(s.bl_awb_number,''))) > 0 THEN 1 ELSE 0 END
           ) AS satisfied
           FROM shipments s WHERE {w}
         )
         SELECT COALESCE(AVG(satisfied * 100.0 / 4.0), 0),
                COALESCE(SUM(CASE WHEN satisfied * 100.0 / 4.0 < 50.0 THEN 1 ELSE 0 END), 0)
         FROM scores",
        w = w
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params_from_iter(p.iter().copied()), |r| {
        Ok((r.get::<_, f64>(0)?, r.get::<_, i64>(1)?))
    })
    .map_err(|e| e.to_string())
}

fn linear_forecast_total_shipments(conn: &rusqlite::Connection) -> Option<KpiForecastBlock> {
    let mut stmt = conn
        .prepare(
            "SELECT snapshot_date, value FROM kpi_daily_snapshots
             WHERE kpi_name = 'total_shipments' AND snapshot_date >= date('now', '-30 day')
             ORDER BY snapshot_date ASC",
        )
        .ok()?;
    let pts: Vec<(String, f64)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)))
        .ok()?
        .filter_map(|x| x.ok())
        .collect();
    let n = pts.len() as f64;
    if n < 2.0 {
        return None;
    }
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_xy = 0.0;
    let mut sum_x2 = 0.0;
    for (i, (_, y)) in pts.iter().enumerate() {
        let x = i as f64;
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
    }
    let denom = n * sum_x2 - sum_x * sum_x;
    if denom.abs() < f64::EPSILON {
        return None;
    }
    let b = (n * sum_xy - sum_x * sum_y) / denom;
    let a = (sum_y - b * sum_x) / n;
    let (last_day_str, _) = pts.last()?;
    let last_date = chrono::NaiveDate::parse_from_str(last_day_str, "%Y-%m-%d").ok()?;
    let mut out = Vec::new();
    for k in 1..=7 {
        let nd = last_date.checked_add_signed(chrono::Duration::days(k))?;
        let x = n - 1.0 + k as f64;
        out.push(KpiForecastPoint {
            date: nd.format("%Y-%m-%d").to_string(),
            projected_total_shipments: (a + b * x).max(0.0),
        });
    }
    Some(KpiForecastBlock {
        points: out,
        basis_days: n as i64,
    })
}

fn enrich_dashboard_response(
    conn: &rusqlite::Connection,
    r: &mut DashboardMetricsResponse,
    filters: &DashboardMetricsFilters,
    overdue: i64,
    w: &str,
    p_ship: &[&dyn ToSql],
    sync_exception_cases: bool,
) -> Result<(), String> {
    let role = filters
        .user_role
        .as_deref()
        .unwrap_or("viewer")
        .to_string();
    r.erp.overdue_eta_count = overdue;
    r.erp.active_kpi_alerts = evaluate_kpi_alerts(conn, r, overdue)?;
    r.erp.dashboard_permissions = load_dashboard_permissions(conn, &role);
    r.erp.exception_trend = load_exception_trend(conn, 120);
    let (avg, low) = compute_compliance_aggregate(conn, w, p_ship)?;
    r.erp.avg_compliance_score = avg;
    r.erp.compliance_low_count = low;
    r.erp.kpi_forecast = linear_forecast_total_shipments(conn);
    if sync_exception_cases {
        crate::commands::exception_workflow::sync_exception_cases_for_shipment_scope(conn, w, p_ship)?;
    } else {
        crate::commands::exception_workflow::refresh_all_open_exception_sla(conn)?;
    }
    r.erp.entity_exceptions =
        crate::commands::exception_workflow::load_entity_exceptions_for_dashboard(conn, w, p_ship)?;
    r.erp.exception_workflow =
        crate::commands::exception_workflow::load_exception_workflow_summary(conn)?;
    Ok(())
}

fn record_daily_snapshots(
    conn: &rusqlite::Connection,
    m: &DashboardMetricsResponse,
    overdue: i64,
    no_boe: i64,
    no_exp: i64,
    missing_doc: i64,
) -> Result<(), String> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let pairs: [(&str, f64); 12] = [
        ("total_shipments", m.total_shipments as f64),
        ("total_suppliers", m.total_suppliers as f64),
        ("total_items", m.total_items as f64),
        ("pending_shipments", m.pending_shipments as f64),
        ("delivered_shipments", m.delivered_shipments as f64),
        ("reconciled_boes", m.reconciled_boes as f64),
        ("total_invoice_value", m.total_invoice_value),
        ("expense_total", m.expense_total),
        ("duty_total", m.duty_total),
        ("total_duty_savings_estimate", m.total_duty_savings_estimate),
        ("landed_cost_total", m.landed_cost_total),
        (
            "avg_transit_days",
            m.avg_transit_days.unwrap_or(f64::NAN),
        ),
    ];
    for (name, val) in pairs {
        if name == "avg_transit_days" && val.is_nan() {
            continue;
        }
        conn.execute(
            "INSERT INTO kpi_daily_snapshots (snapshot_date, kpi_name, value, created_at)
             VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
             ON CONFLICT(snapshot_date, kpi_name) DO UPDATE SET
               value = excluded.value,
               created_at = excluded.created_at",
            params![today, name, val],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT INTO daily_exception_summary (snapshot_date, overdue_count, missing_boe_count, missing_expense_count, missing_document_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
         ON CONFLICT(snapshot_date) DO UPDATE SET
           overdue_count = excluded.overdue_count,
           missing_boe_count = excluded.missing_boe_count,
           missing_expense_count = excluded.missing_expense_count,
           missing_document_count = excluded.missing_document_count,
           created_at = excluded.created_at",
        params![today, overdue, no_boe, no_exp, missing_doc],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Aggregated dashboard metrics for ERP-style home dashboard.
#[tauri::command]
pub fn get_dashboard_metrics(
    filters: Option<DashboardMetricsFilters>,
    state: State<DbState>,
) -> Result<DashboardMetricsResponse, String> {
    let f = filters.unwrap_or_default();
    let scope = ShipmentScope::from_filters(&f);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let key = metrics_cache_key(&f)?;
    let p_ship: Vec<&dyn ToSql> = scope.params.iter().map(|s| s as &dyn ToSql).collect();
    let w = &scope.where_sql;

    if let Some(cached) = read_cached_metrics_json(&conn, &key)? {
        let mut r: DashboardMetricsResponse =
            serde_json::from_str(&cached).map_err(|e| e.to_string())?;
        let role = f.user_role.as_deref().unwrap_or("viewer");
        r.erp.dashboard_permissions = load_dashboard_permissions(&conn, role);
        r.erp.exception_trend = load_exception_trend(&conn, 120);
        let _ = crate::commands::exception_workflow::refresh_all_open_exception_sla(&conn);
        r.erp.entity_exceptions =
            crate::commands::exception_workflow::load_entity_exceptions_for_dashboard(
                &conn, w, &p_ship,
            )?;
        r.erp.exception_workflow =
            crate::commands::exception_workflow::load_exception_workflow_summary(&conn)?;
        return Ok(r);
    }

    let snapshot_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    let total_suppliers = query_i64(&conn, "SELECT COUNT(*) FROM suppliers", &[])?;
    let total_items = query_i64(&conn, "SELECT COUNT(*) FROM items", &[])?;

    let total_shipments = query_i64(
        &conn,
        &format!("SELECT COUNT(*) FROM shipments s WHERE {w}"),
        &p_ship,
    )?;
    let pending_shipments = query_i64(
        &conn,
        &format!(
            "SELECT COUNT(*) FROM shipments s WHERE {w} AND s.status = 'docu-received'"
        ),
        &p_ship,
    )?;
    let delivered_shipments = query_i64(
        &conn,
        &format!("SELECT COUNT(*) FROM shipments s WHERE {w} AND s.status = 'delivered'"),
        &p_ship,
    )?;
    let total_invoice_value = query_f64(
        &conn,
        &format!("SELECT COALESCE(SUM(s.invoice_value), 0) FROM shipments s WHERE {w}"),
        &p_ship,
    )?;

    let reconciled_boes = query_i64(
        &conn,
        "SELECT COUNT(*) FROM boe_calculations WHERE status = 'Reconciled'",
        &[],
    )?;

    // Align duty with consolidated report: BCD + SWS + IGST from `report_view`, scoped to shipments filter.
    let duty_sql = format!(
        "SELECT COALESCE(SUM(rv.bcd_amount + rv.sws_amount + rv.igst_amount), 0)
         FROM report_view rv
         JOIN shipments s ON s.invoice_number = rv.invoice_no AND s.supplier_id = rv.supplier_id
         WHERE {w}"
    );
    let duty_total = query_f64(&conn, &duty_sql, &p_ship)?;

    let expense_sql = format!(
        "SELECT COALESCE(SUM(e.total_amount), 0) FROM expenses e
         INNER JOIN shipments s ON e.shipment_id = s.id
         WHERE {w}"
    );
    let expense_total = query_f64(&conn, &expense_sql, &p_ship)?;

    // Avg transit: only ISO yyyy-MM-dd for both etd and date_of_delivery
    let avg_sql = format!(
        "SELECT AVG(
            julianday(substr(s.date_of_delivery, 1, 10)) - julianday(substr(s.etd, 1, 10))
        ) FROM shipments s
        WHERE {w}
          AND length(s.etd) >= 10 AND length(s.date_of_delivery) >= 10
          AND s.etd GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND s.date_of_delivery GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'"
    );
    let mut avg_stmt = conn.prepare(&avg_sql).map_err(|e| e.to_string())?;
    let avg_transit_days: Option<f64> = match avg_stmt.query_row(
        rusqlite::params_from_iter(p_ship.iter().copied()),
        |row| row.get::<_, Option<f64>>(0),
    ) {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(e) => return Err(e.to_string()),
    };

    let mut stmt = conn
        .prepare(&format!(
            "SELECT strftime('%Y-%m', s.invoice_date) AS period,
                    COUNT(*) AS cnt,
                    COALESCE(SUM(s.invoice_value), 0) AS val,
                    COALESCE(SUM(
                        max(0.0,
                            s.invoice_value * 0.2 - COALESCE(
                                (SELECT CAST(json_extract(bc.calculation_result_json, '$.customsDutyTotal') AS REAL)
                                 FROM boe_calculations bc
                                 WHERE bc.shipment_id = s.id AND bc.status = 'Reconciled' LIMIT 1),
                                0.0
                            )
                        )
                    ), 0) AS duty_savings
             FROM shipments s
             WHERE {w} AND strftime('%Y-%m', s.invoice_date) IS NOT NULL
             GROUP BY period
             ORDER BY period",
            w = w
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(p_ship.iter().copied()), |row| {
            Ok(MonthlySummaryRow {
                period: row.get(0)?,
                shipments: row.get(1)?,
                value: row.get(2)?,
                duty_savings: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut monthly_summary: Vec<MonthlySummaryRow> = rows.filter_map(|r| r.ok()).collect();
    let mut safety_warnings: Vec<String> = Vec::new();
    if monthly_summary.len() > 2000 {
        safety_warnings.push(format!(
            "monthly_summary truncated from {} rows to 2000 (safety cap)",
            monthly_summary.len()
        ));
        monthly_summary.truncate(2000);
    }

    // Simplified duty savings estimate (matches legacy dashboard intent): max(0, 0.2*invoice - duty) per reconciled BOE shipment in scope
    let savings_sql = format!(
        "SELECT COALESCE(SUM(
            max(0.0, s.invoice_value * 0.2 - COALESCE(
                (SELECT CAST(json_extract(bc.calculation_result_json, '$.customsDutyTotal') AS REAL) FROM boe_calculations bc WHERE bc.shipment_id = s.id AND bc.status = 'Reconciled' LIMIT 1),
                0.0
            ))
        ), 0) FROM shipments s WHERE {w}"
    );
    let total_duty_savings_estimate = query_f64(&conn, &savings_sql, &p_ship).unwrap_or(0.0);

    let landed_cost_total = total_invoice_value + duty_total + expense_total;

    let mut exceptions = Vec::new();

    let overdue = query_i64(
        &conn,
        &format!(
            "SELECT COUNT(*) FROM shipments s WHERE {w}
             AND s.eta IS NOT NULL AND TRIM(s.eta) != ''
             AND s.status IS NOT NULL AND LOWER(s.status) NOT IN ('delivered', 'completed')
             AND length(s.eta) >= 10 AND s.eta GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
             AND date(s.eta) < date('now')",
            w = w
        ),
        &p_ship,
    )
    .unwrap_or(0);
    if overdue > 0 {
        let mut fp = serde_json::Map::new();
        fp.insert("overdue".into(), json!("true"));
        let nav_target = "/shipment".to_string();
        let navigation_url = shipment_exception_navigation_url(&nav_target, &fp);
        let overdue_sample_sql = format!(
            "SELECT s.id FROM shipments s WHERE {w}
             AND s.eta IS NOT NULL AND TRIM(s.eta) != ''
             AND s.status IS NOT NULL AND LOWER(s.status) NOT IN ('delivered', 'completed')
             AND length(s.eta) >= 10 AND s.eta GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
             AND date(s.eta) < date('now') ORDER BY s.eta ASC LIMIT 25",
            w = w
        );
        let sample_shipment_ids =
            crate::commands::exception_workflow::query_shipment_ids(&conn, &overdue_sample_sql, &p_ship)
                .unwrap_or_default();
        exceptions.push(DashboardException {
            kind: "overdue_eta".into(),
            severity: "warning".into(),
            message: "Shipments have ETA in the past but are not delivered.".into(),
            count: overdue,
            exception_type: "OVERDUE_ETA".into(),
            entity_type: "aggregate".into(),
            navigation_target: nav_target,
            navigation_url,
            filter_parameters: fp,
            entity_id: None,
            sample_shipment_ids,
        });
    }

    let no_boe = query_i64(
        &conn,
        &format!(
            "SELECT COUNT(*) FROM shipments s WHERE {w}
             AND NOT EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id)",
            w = w
        ),
        &p_ship,
    )
    .unwrap_or(0);
    if no_boe > 0 {
        let mut fp = serde_json::Map::new();
        fp.insert("boe_missing".into(), json!("true"));
        let nav_target = "/shipment".to_string();
        let navigation_url = shipment_exception_navigation_url(&nav_target, &fp);
        let sample_sql = format!(
            "SELECT s.id FROM shipments s WHERE {w}
             AND NOT EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id)
             ORDER BY s.invoice_date DESC LIMIT 25",
            w = w
        );
        let sample_shipment_ids =
            crate::commands::exception_workflow::query_shipment_ids(&conn, &sample_sql, &p_ship)
                .unwrap_or_default();
        exceptions.push(DashboardException {
            kind: "missing_boe".into(),
            severity: "info".into(),
            message: "Shipments without any BOE calculation row.".into(),
            count: no_boe,
            exception_type: "MISSING_BOE".into(),
            entity_type: "aggregate".into(),
            navigation_target: nav_target,
            navigation_url,
            filter_parameters: fp,
            entity_id: None,
            sample_shipment_ids,
        });
    }

    let no_exp = query_i64(
        &conn,
        &format!(
            "SELECT COUNT(*) FROM shipments s WHERE {w}
             AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = s.id)",
            w = w
        ),
        &p_ship,
    )
    .unwrap_or(0);
    if no_exp > 0 {
        let mut fp = serde_json::Map::new();
        fp.insert("expense_missing".into(), json!("true"));
        let nav_target = "/shipment".to_string();
        let navigation_url = shipment_exception_navigation_url(&nav_target, &fp);
        let sample_sql = format!(
            "SELECT s.id FROM shipments s WHERE {w}
             AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = s.id)
             ORDER BY s.invoice_date DESC LIMIT 25",
            w = w
        );
        let sample_shipment_ids =
            crate::commands::exception_workflow::query_shipment_ids(&conn, &sample_sql, &p_ship)
                .unwrap_or_default();
        exceptions.push(DashboardException {
            kind: "no_expenses".into(),
            severity: "info".into(),
            message: "Shipments with no expense lines recorded.".into(),
            count: no_exp,
            exception_type: "MISSING_EXPENSE".into(),
            entity_type: "aggregate".into(),
            navigation_target: nav_target,
            navigation_url,
            filter_parameters: fp,
            entity_id: None,
            sample_shipment_ids,
        });
    }

    let shipments_missing_eta = query_i64(
        &conn,
        &format!(
            "SELECT COUNT(*) FROM shipments s WHERE {w} AND (s.eta IS NULL OR TRIM(s.eta) = '')",
            w = w
        ),
        &p_ship,
    )
    .unwrap_or(0);
    let shipments_missing_etd = query_i64(
        &conn,
        &format!(
            "SELECT COUNT(*) FROM shipments s WHERE {w} AND (s.etd IS NULL OR TRIM(s.etd) = '')",
            w = w
        ),
        &p_ship,
    )
    .unwrap_or(0);

    let document_compliance = DocumentComplianceSummary {
        shipments_missing_eta,
        shipments_missing_etd,
        shipments_without_boe_row: no_boe,
        shipments_without_expense: no_exp,
    };

    let missing_doc = shipments_missing_eta + shipments_missing_etd;

    let mut response = DashboardMetricsResponse {
        snapshot_at,
        total_suppliers,
        total_items,
        total_shipments,
        pending_shipments,
        delivered_shipments,
        reconciled_boes,
        total_invoice_value,
        avg_transit_days,
        expense_total,
        duty_total,
        total_duty_savings_estimate,
        landed_cost_total,
        monthly_summary,
        exceptions,
        document_compliance,
        erp: DashboardErpExtras::default(),
    };
    response.erp.overdue_eta_count = overdue;
    response.erp.warnings = safety_warnings;
    enrich_dashboard_response(&conn, &mut response, &f, overdue, w, &p_ship, true)?;

    let json = serde_json::to_string(&response).map_err(|e| e.to_string())?;
    if let Err(e) = write_metrics_cache(&conn, &key, &json, &response.snapshot_at) {
        log::warn!("dashboard metrics cache write: {}", e);
    }

    if let Err(e) = record_daily_snapshots(
        &conn,
        &response,
        overdue,
        no_boe,
        no_exp,
        missing_doc,
    ) {
        log::warn!("kpi_daily_snapshots: {}", e);
    }

    Ok(response)
}

#[tauri::command]
pub fn get_kpi_metadata(state: State<DbState>) -> Result<Vec<KpiMetadataRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT kpi_name, formula, description, unit, last_updated
             FROM kpi_metadata ORDER BY kpi_name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(KpiMetadataRow {
                kpi_name: row.get(0)?,
                formula: row.get(1)?,
                description: row.get(2)?,
                unit: row.get(3)?,
                last_updated: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn map_kpi_snapshot_row(row: &rusqlite::Row) -> rusqlite::Result<KpiSnapshotHistoryRow> {
    Ok(KpiSnapshotHistoryRow {
        snapshot_date: row.get(0)?,
        kpi_name: row.get(1)?,
        value: row.get(2)?,
        created_at: row.get(3)?,
    })
}

#[tauri::command]
pub fn get_kpi_snapshot_history(
    query: Option<KpiSnapshotQuery>,
    state: State<DbState>,
) -> Result<Vec<KpiSnapshotHistoryRow>, String> {
    let q = query.unwrap_or_default();
    let limit = q.limit_days.unwrap_or(90).max(1).min(365);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let offset = format!("-{limit} days");

    match &q.kpi_name {
        Some(name) if !name.is_empty() => {
            let mut stmt = conn
                .prepare(
                    "SELECT snapshot_date, kpi_name, value, created_at FROM kpi_daily_snapshots
                     WHERE kpi_name = ?1 AND snapshot_date >= date('now', ?2)
                     ORDER BY snapshot_date DESC",
                )
                .map_err(|e| e.to_string())?;
            let iter = stmt
                .query_map(params![name, &offset], map_kpi_snapshot_row)
                .map_err(|e| e.to_string())?;
            iter.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        }
        _ => {
            let mut stmt = conn
                .prepare(
                    "SELECT snapshot_date, kpi_name, value, created_at FROM kpi_daily_snapshots
                     WHERE snapshot_date >= date('now', ?1)
                     ORDER BY snapshot_date DESC, kpi_name",
                )
                .map_err(|e| e.to_string())?;
            let iter = stmt
                .query_map([&offset], map_kpi_snapshot_row)
                .map_err(|e| e.to_string())?;
            iter.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KpiAlertRuleRow {
    pub id: String,
    pub kpi_name: String,
    pub threshold_value: f64,
    pub comparison_operator: String,
    pub severity: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KpiAlertRuleInput {
    pub id: Option<String>,
    pub kpi_name: String,
    pub threshold_value: f64,
    pub comparison_operator: String,
    pub severity: String,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardActivityInput {
    pub user_id: String,
    pub action_type: String,
    pub details: Option<String>,
    #[serde(default)]
    pub module_name: Option<String>,
    #[serde(default)]
    pub record_reference: Option<String>,
    #[serde(default)]
    pub navigation_target: Option<String>,
    #[serde(default)]
    pub action_context: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardActivityRow {
    pub id: i64,
    pub user_id: String,
    pub timestamp: String,
    pub action_type: String,
    pub details: String,
    pub module_name: String,
    pub record_reference: String,
    pub navigation_target: String,
    pub action_context: String,
    #[serde(default)]
    pub checksum: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLogQueryInput {
    pub user_id: Option<String>,
    pub action_type: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i32>,
}

fn dashboard_activity_is_recent_duplicate(
    conn: &rusqlite::Connection,
    input: &DashboardActivityInput,
) -> Result<bool, String> {
    let details = input.details.clone().unwrap_or_default();
    let (window, match_details) = match input.action_type.as_str() {
        "dashboard_viewed" => ("-12 hours", false),
        "filters_applied" | "filter_changed" => ("-3 seconds", true),
        "exception_clicked" | "csv_exported" | "shipment_drilldown_opened" => ("-45 seconds", true),
        "shipment_exception_view" => ("-90 seconds", true),
        _ => return Ok(false),
    };
    let n: i64 = if match_details {
        conn.query_row(
            "SELECT COUNT(*) FROM dashboard_activity_log
             WHERE user_id = ?1 AND action_type = ?2
               AND COALESCE(details, '') = ?3
               AND datetime(timestamp) > datetime('now', ?4)",
            params![&input.user_id, &input.action_type, &details, window],
            |r| r.get(0),
        )
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM dashboard_activity_log
             WHERE user_id = ?1 AND action_type = ?2
               AND datetime(timestamp) > datetime('now', ?3)",
            params![&input.user_id, &input.action_type, window],
            |r| r.get(0),
        )
    }
    .unwrap_or(0);
    Ok(n > 0)
}

#[tauri::command]
pub fn get_kpi_alert_rules(state: State<DbState>) -> Result<Vec<KpiAlertRuleRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, kpi_name, threshold_value, comparison_operator, severity, enabled FROM kpi_alert_rules ORDER BY kpi_name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(KpiAlertRuleRow {
                id: r.get(0)?,
                kpi_name: r.get(1)?,
                threshold_value: r.get(2)?,
                comparison_operator: r.get(3)?,
                severity: r.get(4)?,
                enabled: r.get::<_, i64>(5)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_kpi_alert_rule(rule: KpiAlertRuleInput, state: State<DbState>) -> Result<(), String> {
    let id = rule
        .id
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO kpi_alert_rules (id, kpi_name, threshold_value, comparison_operator, severity, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
         ON CONFLICT(id) DO UPDATE SET
           kpi_name = excluded.kpi_name,
           threshold_value = excluded.threshold_value,
           comparison_operator = excluded.comparison_operator,
           severity = excluded.severity,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at",
        params![
            id,
            rule.kpi_name,
            rule.threshold_value,
            rule.comparison_operator,
            rule.severity,
            if rule.enabled { 1 } else { 0 },
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn log_dashboard_activity(
    input: DashboardActivityInput,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if dashboard_activity_is_recent_duplicate(&conn, &input)? {
        return Ok(());
    }
    let module_name = input.module_name.clone().unwrap_or_default();
    let record_reference = input.record_reference.clone().unwrap_or_default();
    let navigation_target = input.navigation_target.clone().unwrap_or_default();
    let action_context = input.action_context.clone().unwrap_or_default();
    let details = input.details.clone().unwrap_or_default();
    let ck = dashboard_activity_checksum(
        &input.user_id,
        &input.action_type,
        &details,
        &module_name,
        &record_reference,
        &navigation_target,
        &action_context,
    );
    conn.execute(
        "INSERT INTO dashboard_activity_log (user_id, action_type, details, module_name, record_reference, navigation_target, action_context, checksum)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.user_id,
            input.action_type,
            details,
            module_name,
            record_reference,
            navigation_target,
            action_context,
            ck,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_dashboard_activity_log(
    limit: Option<i32>,
    state: State<DbState>,
) -> Result<Vec<DashboardActivityRow>, String> {
    let lim = limit.unwrap_or(200).max(1).min(2000);
    query_dashboard_activity_log(
        Some(ActivityLogQueryInput {
            limit: Some(lim),
            ..Default::default()
        }),
        state,
    )
}

fn map_dashboard_activity_row(r: &rusqlite::Row) -> rusqlite::Result<DashboardActivityRow> {
    Ok(DashboardActivityRow {
        id: r.get(0)?,
        user_id: r.get(1)?,
        timestamp: r.get(2)?,
        action_type: r.get(3)?,
        details: r.get(4)?,
        module_name: r.get(5)?,
        record_reference: r.get(6)?,
        navigation_target: r.get(7)?,
        action_context: r.get(8)?,
        checksum: r.get::<_, Option<String>>(9)?.unwrap_or_default(),
    })
}

/// Filtered audit log for admin viewers (same row shape as `get_dashboard_activity_log`).
#[tauri::command]
pub fn query_dashboard_activity_log(
    query: Option<ActivityLogQueryInput>,
    state: State<DbState>,
) -> Result<Vec<DashboardActivityRow>, String> {
    let q = query.unwrap_or_default();
    let lim = q.limit.unwrap_or(500).max(1).min(2000) as i64;
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, user_id, timestamp, action_type, details,
                COALESCE(module_name, ''), COALESCE(record_reference, ''), COALESCE(navigation_target, ''), COALESCE(action_context, ''),
                COALESCE(checksum, '')
         FROM dashboard_activity_log WHERE 1=1",
    );
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref u) = q.user_id {
        let u = u.trim();
        if !u.is_empty() {
            sql.push_str(" AND user_id = ?");
            binds.push(u.to_string());
        }
    }
    if let Some(ref a) = q.action_type {
        let a = a.trim();
        if !a.is_empty() {
            sql.push_str(" AND action_type = ?");
            binds.push(a.to_string());
        }
    }
    if let Some(ref df) = q.date_from {
        let df = df.trim();
        if !df.is_empty() {
            sql.push_str(" AND date(timestamp) >= date(?)");
            binds.push(df.to_string());
        }
    }
    if let Some(ref dt) = q.date_to {
        let dt = dt.trim();
        if !dt.is_empty() {
            sql.push_str(" AND date(timestamp) <= date(?)");
            binds.push(dt.to_string());
        }
    }
    if let Some(ref s) = q.search {
        let s = s.trim();
        if !s.is_empty() {
            sql.push_str(
                " AND lower(COALESCE(details,'') || ' ' || COALESCE(module_name,'') || ' ' || COALESCE(record_reference,'') || ' ' || COALESCE(navigation_target,'') || ' ' || COALESCE(action_context,'')) LIKE lower(?)",
            );
            binds.push(format!("%{s}%"));
        }
    }

    sql.push_str(&format!(" ORDER BY id DESC LIMIT {lim}"));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_dyn: Vec<&dyn ToSql> = binds.iter().map(|s| s as &dyn ToSql).collect();
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params_dyn), map_dashboard_activity_row)
        .map_err(|e| e.to_string())?;
    let out: Vec<DashboardActivityRow> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    for row in &out {
        if !row.checksum.is_empty() {
            let exp = dashboard_activity_checksum(
                &row.user_id,
                &row.action_type,
                &row.details,
                &row.module_name,
                &row.record_reference,
                &row.navigation_target,
                &row.action_context,
            );
            if exp != row.checksum {
                let _ = log_integrity_issue(
                    &conn,
                    &row.id.to_string(),
                    "AUDIT_LOG_CHECKSUM_MISMATCH",
                    &format!("stored={}", row.checksum),
                );
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn get_exception_trend_history(
    limit_days: Option<i64>,
    state: State<DbState>,
) -> Result<Vec<DailyExceptionSummaryRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit_days.unwrap_or(365).max(1).min(365);
    let off = format!("-{lim} days");
    let mut stmt = conn
        .prepare(
            "SELECT snapshot_date, overdue_count, missing_boe_count, missing_expense_count, missing_document_count
             FROM daily_exception_summary
             WHERE snapshot_date >= date('now', ?1)
             ORDER BY snapshot_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![&off], |r| {
            Ok(DailyExceptionSummaryRow {
                snapshot_date: r.get(0)?,
                overdue_count: r.get(1)?,
                missing_boe_count: r.get(2)?,
                missing_expense_count: r.get(3)?,
                missing_document_count: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_kpi_snapshot_retention_days(days: i64, state: State<DbState>) -> Result<(), String> {
    let d = days.max(30).min(3650);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO app_metadata (key, value) VALUES ('kpi_snapshot_retention_days', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![d.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
