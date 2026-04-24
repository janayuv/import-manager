//! Multi-environment registry, tenant context, promotion, environment deployment logs, health dashboards.

use crate::db::DbState;
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

fn meta_get(conn: &Connection, key: &str) -> String {
    conn.query_row(
        "SELECT value FROM app_metadata WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .unwrap_or_default()
}

fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_metadata (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn normalize_role(role: &str) -> String {
    role.chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
}

fn require_view(role: &str) -> Result<(), String> {
    let n = normalize_role(role);
    if n.contains("admin") || n.contains("automationmanager") || n.contains("viewer") {
        Ok(())
    } else {
        Err("workflow multi-env: insufficient role".into())
    }
}

fn require_mutate(role: &str) -> Result<(), String> {
    let n = normalize_role(role);
    if n.contains("admin") || n.contains("automationmanager") {
        Ok(())
    } else {
        Err("workflow multi-env: modify requires admin or automation manager".into())
    }
}

/// Active tenant for rule execution and dashboards (metadata).
pub fn active_tenant_id(conn: &Connection) -> String {
    let s = meta_get(conn, "workflow_active_tenant_id").trim().to_string();
    if s.is_empty() {
        "tenant-default".into()
    } else {
        s
    }
}

/// Active execution environment (metadata) — used for simulation context and version defaults.
pub fn active_execution_environment_id(conn: &Connection) -> String {
    let s = meta_get(conn, "workflow_execution_environment_id")
        .trim()
        .to_string();
    if s.is_empty() {
        "env-prod".into()
    } else {
        s
    }
}

pub fn default_version_environment_id(conn: &Connection) -> String {
    let s = meta_get(conn, "workflow_rule_version_default_environment_id")
        .trim()
        .to_string();
    if s.is_empty() {
        "env-prod".into()
    } else {
        s
    }
}

fn env_type(conn: &Connection, environment_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT environment_type FROM workflow_environments WHERE environment_id = ?1 AND is_active = 1",
        params![environment_id],
        |r| r.get::<_, String>(0),
    )
    .map_err(|_| format!("unknown or inactive environment: {environment_id}"))
}

fn env_rank(t: &str) -> i32 {
    match t.trim().to_uppercase().as_str() {
        "DEV" => 0,
        "TEST" => 1,
        "PROD" => 2,
        _ => -1,
    }
}

/// Log a row to `workflow_environment_deployment_log`.
pub fn log_environment_deployment(
    conn: &Connection,
    tenant_id: &str,
    environment_id: &str,
    rule_id: &str,
    version_id: &str,
    status: &str,
    details: &Value,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let ts = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    conn.execute(
        "INSERT INTO workflow_environment_deployment_log (deployment_id, tenant_id, environment_id, rule_id, version_id, status, timestamp, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            &id,
            tenant_id,
            environment_id,
            rule_id,
            version_id,
            status,
            &ts,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEnvironmentRow {
    pub environment_id: String,
    pub environment_name: String,
    pub environment_type: String,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTenantRow {
    pub tenant_id: String,
    pub tenant_name: String,
    pub tenant_status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEnvironmentDeploymentLogRow {
    pub deployment_id: String,
    pub tenant_id: String,
    pub environment_id: String,
    pub rule_id: String,
    pub version_id: String,
    pub status: String,
    pub timestamp: String,
    pub details_json: String,
}

#[tauri::command]
pub fn list_workflow_environments(
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowEnvironmentRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT environment_id, environment_name, environment_type, is_active, created_at
             FROM workflow_environments ORDER BY environment_type",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(WorkflowEnvironmentRow {
                environment_id: r.get(0)?,
                environment_name: r.get(1)?,
                environment_type: r.get(2)?,
                is_active: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workflow_tenants(
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowTenantRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT tenant_id, tenant_name, tenant_status, created_at FROM workflow_tenants ORDER BY tenant_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(WorkflowTenantRow {
                tenant_id: r.get(0)?,
                tenant_name: r.get(1)?,
                tenant_status: r.get(2)?,
                created_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_workflow_execution_context(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(json!({
        "activeTenantId": active_tenant_id(&conn),
        "executionEnvironmentId": active_execution_environment_id(&conn),
        "defaultVersionEnvironmentId": default_version_environment_id(&conn),
    }))
}

#[tauri::command]
pub fn set_workflow_active_tenant(
    tenant_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = tenant_id.trim();
    let ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_tenants WHERE tenant_id = ?1 AND upper(trim(tenant_status)) = 'ACTIVE'",
            params![tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if ok == 0 {
        return Err("unknown or inactive tenant_id".into());
    }
    meta_set(&conn, "workflow_active_tenant_id", tid)?;
    Ok(())
}

#[tauri::command]
pub fn set_workflow_execution_environment(
    environment_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let eid = environment_id.trim();
    let ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_environments WHERE environment_id = ?1 AND is_active = 1",
            params![eid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if ok == 0 {
        return Err("unknown or inactive environment_id".into());
    }
    meta_set(&conn, "workflow_execution_environment_id", eid)?;
    Ok(())
}

#[tauri::command]
pub fn list_workflow_environment_deployment_log(
    environment_id: Option<String>,
    tenant_id: Option<String>,
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowEnvironmentDeploymentLogRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(120).max(1).min(500);
    let rows: Vec<WorkflowEnvironmentDeploymentLogRow> =
        match (
            environment_id.filter(|s| !s.trim().is_empty()),
            tenant_id.filter(|s| !s.trim().is_empty()),
        ) {
            (Some(e), Some(t)) => {
                let mut stmt = conn
                    .prepare(&format!(
                        "SELECT deployment_id, tenant_id, environment_id, rule_id, version_id, status, timestamp, details_json
             FROM workflow_environment_deployment_log
             WHERE environment_id = ?1 AND tenant_id = ?2
             ORDER BY datetime(timestamp) DESC LIMIT {lim}"
                    ))
                    .map_err(|e| e.to_string())?;
                let mapped = stmt
                    .query_map(params![&e, &t], |row| {
                        Ok(WorkflowEnvironmentDeploymentLogRow {
                            deployment_id: row.get(0)?,
                            tenant_id: row.get(1)?,
                            environment_id: row.get(2)?,
                            rule_id: row.get(3)?,
                            version_id: row.get(4)?,
                            status: row.get(5)?,
                            timestamp: row.get(6)?,
                            details_json: row.get(7)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                mapped
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?
            }
            (Some(e), None) => {
                let mut stmt = conn
                    .prepare(&format!(
                        "SELECT deployment_id, tenant_id, environment_id, rule_id, version_id, status, timestamp, details_json
             FROM workflow_environment_deployment_log WHERE environment_id = ?1
             ORDER BY datetime(timestamp) DESC LIMIT {lim}"
                    ))
                    .map_err(|e| e.to_string())?;
                let mapped = stmt
                    .query_map(params![&e], |row| {
                        Ok(WorkflowEnvironmentDeploymentLogRow {
                            deployment_id: row.get(0)?,
                            tenant_id: row.get(1)?,
                            environment_id: row.get(2)?,
                            rule_id: row.get(3)?,
                            version_id: row.get(4)?,
                            status: row.get(5)?,
                            timestamp: row.get(6)?,
                            details_json: row.get(7)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                mapped
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?
            }
            (None, Some(t)) => {
                let mut stmt = conn
                    .prepare(&format!(
                        "SELECT deployment_id, tenant_id, environment_id, rule_id, version_id, status, timestamp, details_json
             FROM workflow_environment_deployment_log WHERE tenant_id = ?1
             ORDER BY datetime(timestamp) DESC LIMIT {lim}"
                    ))
                    .map_err(|e| e.to_string())?;
                let mapped = stmt
                    .query_map(params![&t], |row| {
                        Ok(WorkflowEnvironmentDeploymentLogRow {
                            deployment_id: row.get(0)?,
                            tenant_id: row.get(1)?,
                            environment_id: row.get(2)?,
                            rule_id: row.get(3)?,
                            version_id: row.get(4)?,
                            status: row.get(5)?,
                            timestamp: row.get(6)?,
                            details_json: row.get(7)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                mapped
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?
            }
            (None, None) => {
                let mut stmt = conn
                    .prepare(&format!(
                        "SELECT deployment_id, tenant_id, environment_id, rule_id, version_id, status, timestamp, details_json
             FROM workflow_environment_deployment_log ORDER BY datetime(timestamp) DESC LIMIT {lim}"
                    ))
                    .map_err(|e| e.to_string())?;
                let mapped = stmt
                    .query_map([], |row| {
                        Ok(WorkflowEnvironmentDeploymentLogRow {
                            deployment_id: row.get(0)?,
                            tenant_id: row.get(1)?,
                            environment_id: row.get(2)?,
                            rule_id: row.get(3)?,
                            version_id: row.get(4)?,
                            status: row.get(5)?,
                            timestamp: row.get(6)?,
                            details_json: row.get(7)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                mapped
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?
            }
        };
    Ok(rows)
}

/// Aggregate health signals per environment from deployment logs and capacity snapshots.
#[tauri::command]
pub fn get_environment_health_dashboard(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut envs: Vec<Value> = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT environment_id, environment_name, environment_type FROM workflow_environments WHERE is_active = 1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (eid, ename, etype) in ids {
        let fails: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_environment_deployment_log
                 WHERE environment_id = ?1 AND datetime(timestamp) > datetime('now', '-7 days')
                   AND upper(trim(status)) IN ('FAILED','REJECTED')",
                params![&eid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let rolls: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_rule_deployment_log
                 WHERE datetime(deployment_time) > datetime('now', '-7 days') AND rollback_flag = 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let deploys: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_environment_deployment_log
                 WHERE environment_id = ?1 AND datetime(timestamp) > datetime('now', '-7 days')",
                params![&eid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let load_pct: f64 = conn
            .query_row(
                "SELECT COALESCE(load_percentage, 0) FROM automation_capacity_load
                 ORDER BY datetime(snapshot_at) DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        let health = if fails > 3 || load_pct > 92.0 {
            "DEGRADED"
        } else if fails > 0 {
            "WATCH"
        } else {
            "HEALTHY"
        };
        envs.push(json!({
            "environmentId": eid,
            "environmentName": ename,
            "environmentType": etype,
            "deployments7d": deploys,
            "failedOrRejected7d": fails,
            "globalRollbacks7d": rolls,
            "latestCapacityLoadPct": load_pct,
            "healthState": health,
        }));
    }
    Ok(json!({ "environments": envs }))
}

/// Tenant-scoped workload and efficiency (rules + logs + ROI tables when present).
#[tauri::command]
pub fn get_tenant_performance_dashboard(
    tenant_id: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = tenant_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| active_tenant_id(&conn));
    let rule_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_decision_rules WHERE tenant_id = ?1",
            params![&tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let enabled_rules: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_decision_rules WHERE tenant_id = ?1 AND enabled = 1",
            params![&tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let actions_7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_automation_log
             WHERE tenant_id = ?1 AND datetime(executed_at) > datetime('now', '-7 days')",
            params![&tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let cost_7d: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(estimated_cost_units), 0) FROM workflow_automation_log
             WHERE tenant_id = ?1 AND datetime(executed_at) > datetime('now', '-7 days')",
            params![&tid],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let roi_rows: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM automation_roi_metrics
             WHERE datetime(snapshot_date) > datetime('now', '-14 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(json!({
        "tenantId": tid,
        "workflowRules": { "total": rule_count, "enabled": enabled_rules },
        "automationActions7d": actions_7d,
        "estimatedCostUnits7d": cost_7d,
        "roiMetricRows14d": roi_rows,
        "notes": "Cost and actions filtered by workflow_automation_log.tenant_id; rules filtered by workflow_decision_rules.tenant_id.",
    }))
}

/// Promote a version to the next environment (DEV→TEST→PROD only).
pub fn promote_rule_version(
    conn: &Connection,
    source_version_id: &str,
    target_environment_id: &str,
    promoted_by: &str,
) -> Result<String, String> {
    if meta_get(conn, "workflow_rule_deployment_frozen").trim() == "1" {
        return Err("deployment freeze active — promotion blocked".into());
    }
    let (tenant_id, src_env, rule_id, def_json, _cb): (String, String, String, String, String) = conn
        .query_row(
            "SELECT tenant_id, environment_id, rule_id, rule_definition_json, created_by FROM workflow_rule_versions WHERE version_id = ?1",
            params![source_version_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .map_err(|_| "source version not found".to_string())?;
    let src_type = env_type(conn, &src_env)?;
    let tgt_type = env_type(conn, target_environment_id)?;
    let sr = env_rank(&src_type);
    let tr = env_rank(&tgt_type);
    if sr < 0 || tr < 0 {
        return Err("invalid environment types for promotion".into());
    }
    if tr != sr + 1 {
        return Err("promotion must follow DEV → TEST → PROD one step at a time".into());
    }
    let _: Value = serde_json::from_str(&def_json)
        .map_err(|e| format!("rule JSON incompatible: {e}"))?;
    let next_vn: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version_number),0) + 1 FROM workflow_rule_versions WHERE tenant_id = ?1 AND environment_id = ?2 AND rule_id = ?3",
            params![&tenant_id, target_environment_id, &rule_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let new_vid = format!("{rule_id}:{target_environment_id}:v{next_vn}");
    let ts = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let reason = format!("Promoted from {source_version_id} ({src_env})");
    conn.execute(
        "INSERT INTO workflow_rule_versions (version_id, rule_id, tenant_id, environment_id, version_number, rule_definition_json, created_by, created_at, is_active, change_reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)",
        params![
            &new_vid,
            &rule_id,
            &tenant_id,
            target_environment_id,
            next_vn,
            &def_json,
            promoted_by,
            &ts,
            &reason,
        ],
    )
    .map_err(|e| e.to_string())?;
    log_environment_deployment(
        conn,
        &tenant_id,
        target_environment_id,
        &rule_id,
        &new_vid,
        "PROMOTED",
        &json!({
            "fromVersionId": source_version_id,
            "fromEnvironmentId": src_env,
            "promotedBy": promoted_by,
        }),
    )?;
    Ok(new_vid)
}

#[tauri::command]
pub fn promote_rule_version_command(
    source_version_id: String,
    target_environment_id: String,
    promoted_by: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    promote_rule_version(
        &conn,
        source_version_id.trim(),
        target_environment_id.trim(),
        promoted_by.trim(),
    )
}
