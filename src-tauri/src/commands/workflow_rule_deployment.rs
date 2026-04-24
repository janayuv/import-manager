//! Version-controlled workflow rule deployment: versions, staging, approvals, deploy/rollback, freeze, canary.

use crate::commands::dashboard_cache;
use crate::commands::deployment_safety::{
    prod_safety_enforcement_enabled, record_risk_timeline, validate_deployment_safety,
};
use crate::commands::workflow_production_observability::{
    bump_workflow_runtime_metric, insert_workflow_alert_signal, log_structured_event,
    record_performance_timing, RuntimeMetricDelta,
};
use crate::commands::workflow_multienv::{
    active_tenant_id, default_version_environment_id, log_environment_deployment,
};
use crate::commands::workflow_automation::{log_automation, log_workflow_rule_change};
use crate::db::DbState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Instant;
use tauri::State;
use uuid::Uuid;

fn now_local() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

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
        Err("workflow rule deployment: insufficient role".into())
    }
}

fn require_mutate(role: &str) -> Result<(), String> {
    let n = normalize_role(role);
    if n.contains("admin") || n.contains("automationmanager") {
        Ok(())
    } else {
        Err("workflow rule deployment: modify requires admin or automation manager".into())
    }
}

fn deployment_frozen(conn: &Connection) -> bool {
    meta_get(conn, "workflow_rule_deployment_frozen").trim() == "1"
}

fn requires_approval(conn: &Connection) -> bool {
    meta_get(conn, "workflow_rule_deployment_requires_approval").trim() == "1"
}

fn stable_hash_pct(case_id: &str) -> u32 {
    let mut h: u32 = 2166136261;
    for b in case_id.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(16777619);
    }
    h % 100
}

/// When a canary is ACTIVE for `rule_id`, only `sample_size_percentage` of cases pass (deterministic by case id).
pub fn canary_allows_case_for_rule(conn: &Connection, rule_id: &str, case_id: &str) -> Result<bool, String> {
    let tid = active_tenant_id(conn);
    let row: Option<(f64, String)> = conn
        .query_row(
            "SELECT sample_size_percentage, deployment_status FROM canary_rule_deployment WHERE rule_id = ?1 AND tenant_id = ?2",
            params![rule_id, &tid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((pct, st)) = row else {
        return Ok(true);
    };
    if st.trim().to_uppercase() != "ACTIVE" {
        return Ok(true);
    }
    let pct = pct.clamp(0.0, 100.0);
    if pct >= 99.99 {
        return Ok(true);
    }
    let bucket = stable_hash_pct(case_id);
    Ok((bucket as f64) < pct)
}

fn load_version_json(conn: &Connection, version_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT rule_definition_json FROM workflow_rule_versions WHERE version_id = ?1",
        params![version_id],
        |r| r.get(0),
    )
    .map_err(|_| format!("unknown version_id: {version_id}"))
}

fn active_version_id_for_rule(
    conn: &Connection,
    rule_id: &str,
    tenant_id: &str,
    environment_id: &str,
) -> Result<Option<String>, String> {
    let v: Option<String> = conn
        .query_row(
            "SELECT version_id FROM workflow_rule_versions WHERE rule_id = ?1 AND tenant_id = ?2 AND environment_id = ?3 AND is_active = 1 LIMIT 1",
            params![rule_id, tenant_id, environment_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

/// Structural diff between two stored version JSON payloads.
pub fn compare_rule_versions(
    conn: &Connection,
    version_id_a: &str,
    version_id_b: &str,
) -> Result<Value, String> {
    let ja = load_version_json(conn, version_id_a)?;
    let jb = load_version_json(conn, version_id_b)?;
    let va: Value = serde_json::from_str(&ja).map_err(|e| e.to_string())?;
    let vb: Value = serde_json::from_str(&jb).map_err(|e| e.to_string())?;
    let a = va.as_object().cloned().unwrap_or_default();
    let b = vb.as_object().cloned().unwrap_or_default();
    let keys: Vec<String> = a
        .keys()
        .chain(b.keys())
        .cloned()
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let mut keys: Vec<String> = keys;
    keys.sort();
    let mut changes: Vec<Value> = Vec::new();
    for k in keys {
        let av = a.get(&k);
        let bv = b.get(&k);
        if av != bv {
            changes.push(json!({
                "field": k,
                "before": av.unwrap_or(&Value::Null),
                "after": bv.unwrap_or(&Value::Null),
            }));
        }
    }
    Ok(json!({
        "versionIdA": version_id_a,
        "versionIdB": version_id_b,
        "changes": changes,
        "summary": format!("{} field(s) differ", changes.len()),
    }))
}

/// Attachment for `simulate_multiple_rule_sets`: compare staged version to currently active version for same rule.
pub fn deployment_simulation_attachment(
    conn: &Connection,
    staged_version_id: &str,
) -> Result<Value, String> {
    let (rule_id, tenant_id, environment_id): (String, String, String) = conn
        .query_row(
            "SELECT rule_id, tenant_id, environment_id FROM workflow_rule_versions WHERE version_id = ?1",
            params![staged_version_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| format!("unknown staged version: {staged_version_id}"))?;
    let active = active_version_id_for_rule(conn, &rule_id, &tenant_id, &environment_id)?;
    let compare = if let Some(ref aid) = active {
        if aid == staged_version_id {
            json!({ "note": "Staged version is the same as active; no diff." })
        } else {
            compare_rule_versions(conn, aid, staged_version_id)?
        }
    } else {
        json!({ "note": "No active version row; compare skipped." })
    };
    Ok(json!({
        "stagedVersionId": staged_version_id,
        "ruleId": rule_id,
        "tenantId": tenant_id,
        "environmentId": environment_id,
        "compareActiveVsStaged": compare,
        "notes": "Dry-run counts in parent payload still reflect live enabled rules; deploy staged version to change engine behavior.",
    }))
}

fn row_to_definition_value(conn: &Connection, rule_id: &str, tenant_id: &str) -> Result<Value, String> {
    conn.query_row(
        "SELECT rule_name, rule_type, condition_expression, action_type, priority, enabled
         FROM workflow_decision_rules WHERE rule_id = ?1 AND tenant_id = ?2",
        params![rule_id, tenant_id],
        |r| {
            Ok(json!({
                "ruleName": r.get::<_, String>(0)?,
                "ruleType": r.get::<_, String>(1)?,
                "conditionExpression": r.get::<_, String>(2)?,
                "actionType": r.get::<_, String>(3)?,
                "priority": r.get::<_, i64>(4)?,
                "enabled": r.get::<_, i64>(5)?,
            }))
        },
    )
    .map_err(|e| e.to_string())
}

fn apply_definition_to_live_rule(
    conn: &Connection,
    rule_id: &str,
    def: &Value,
    changed_by: &str,
    tenant_id: &str,
) -> Result<String, String> {
    let prev = row_to_definition_value(conn, rule_id, tenant_id)?.to_string();
    let name = def
        .get("ruleName")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "ruleName required".to_string())?;
    let rt = def
        .get("ruleType")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "ruleType required".to_string())?;
    let cond = def
        .get("conditionExpression")
        .and_then(|x| x.as_str())
        .unwrap_or("{}");
    let at = def
        .get("actionType")
        .and_then(|x| x.as_str())
        .unwrap_or("");
    let pr = def.get("priority").and_then(|x| x.as_i64()).unwrap_or(0);
    let en = def.get("enabled").and_then(|x| x.as_i64()).unwrap_or(1);
    let ts = now_local();
    conn.execute(
        "UPDATE workflow_decision_rules SET rule_name = ?2, rule_type = ?3, condition_expression = ?4,
         action_type = ?5, priority = ?6, enabled = ?7, updated_at = ?8 WHERE rule_id = ?1 AND tenant_id = ?9",
        params![rule_id, name, rt, cond, at, pr, en, &ts, tenant_id],
    )
    .map_err(|e| e.to_string())?;
    let newv = row_to_definition_value(conn, rule_id, tenant_id)?.to_string();
    log_workflow_rule_change(
        conn,
        rule_id,
        changed_by,
        "RULE_VERSION_DEPLOY",
        &prev,
        &newv,
    )?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(conn);
    Ok(newv)
}

fn ensure_approval(conn: &Connection, rule_id: &str, version_id: &str) -> Result<(), String> {
    if !requires_approval(conn) {
        return Ok(());
    }
    let ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_rule_approvals
             WHERE rule_id = ?1 AND version_id = ?2 AND approval_status = 'APPROVED'",
            params![rule_id, version_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if ok == 0 {
        return Err("deployment requires APPROVED workflow_rule_approvals row for this version".into());
    }
    Ok(())
}

/// Pre-flight checks for production live deploy (approval, optional simulation gate, capacity, cost).
/// When `require_governance` is false (e.g. rollbacks to non-prod), returns `ok: true` without blocking.
pub fn validate_rule_deployment_readiness(
    conn: &Connection,
    rule_id: &str,
    version_id: &str,
    live_prod: bool,
    require_governance: bool,
) -> Result<Value, String> {
    if !require_governance {
        return Ok(json!({
            "ok": true,
            "ruleId": rule_id,
            "versionId": version_id,
            "checks": [json!({"name": "governance", "passed": true, "note": "skipped"})],
        }));
    }
    let mut checks: Vec<Value> = Vec::new();
    let mut ok = true;
    if requires_approval(conn) {
        let approved: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_rule_approvals
                 WHERE rule_id = ?1 AND version_id = ?2 AND approval_status = 'APPROVED'",
                params![rule_id, version_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let pass = approved > 0;
        ok &= pass;
        checks.push(json!({"name": "approval", "passed": pass}));
    } else {
        checks.push(json!({"name": "approval", "passed": true, "note": "approval not required"}));
    }
    if require_governance && meta_get(conn, "workflow_deploy_simulation_gate_enabled").trim() == "1" {
        let sim_ok = meta_get(conn, "workflow_last_deploy_simulation_ok_version_id").trim() == version_id;
        ok &= sim_ok;
        checks.push(json!({
            "name": "simulationGate",
            "passed": sim_ok,
            "note": "Set app_metadata workflow_last_deploy_simulation_ok_version_id to this version_id after successful simulation",
        }));
    } else {
        checks.push(json!({"name": "simulationGate", "passed": true, "note": "disabled"}));
    }
    if live_prod
        && require_governance
        && meta_get(conn, "workflow_deploy_require_capacity_headroom").trim() == "1"
    {
        let load: f64 = conn
            .query_row(
                "SELECT COALESCE(load_percentage, 0) FROM automation_capacity_load
                 ORDER BY datetime(snapshot_at) DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        let pass = load < 95.0;
        ok &= pass;
        checks.push(json!({"name": "capacityHeadroom", "passed": pass, "loadPercentage": load}));
    }
    if live_prod && require_governance {
        let max_cu: f64 = conn
            .query_row(
                "SELECT COALESCE(max_cost_units_per_cycle, 500000) FROM automation_cost_limits WHERE id = 'default'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(500_000.0);
        let used: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(estimated_cost_units), 0) FROM workflow_automation_log
                 WHERE datetime(executed_at) > datetime('now', '-1 day')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        let pass = used <= max_cu * 1.1;
        ok &= pass;
        checks.push(json!({
            "name": "cost24hVsLimit",
            "passed": pass,
            "usedCostUnits24h": used,
            "limitCostUnitsPerCycle": max_cu,
        }));
    }
    Ok(json!({ "ok": ok, "ruleId": rule_id, "versionId": version_id, "checks": checks }))
}

fn deactivate_all_versions(
    conn: &Connection,
    rule_id: &str,
    tenant_id: &str,
    environment_id: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE workflow_rule_versions SET is_active = 0 WHERE rule_id = ?1 AND tenant_id = ?2 AND environment_id = ?3",
        params![rule_id, tenant_id, environment_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn activate_version(conn: &Connection, version_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE workflow_rule_versions SET is_active = 1 WHERE version_id = ?1",
        params![version_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn insert_impact_stub(conn: &Connection, rule_id: &str, version_id: &str) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO rule_deployment_impact_metrics (id, rule_id, version_id, snapshot_at, failure_rate, cost_units_delta, resolution_gain_delta, execution_count, factors_json)
         VALUES (?1, ?2, ?3, ?4, 0, 0, 0, 0, '{}')
         ON CONFLICT(rule_id, snapshot_at) DO UPDATE SET version_id = excluded.version_id",
        params![&id, rule_id, version_id, &d],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Deploy a version: updates live `workflow_decision_rules` only when `environment_id` is `env-prod`; other environments activate the version row only.
/// When `safety_override_acknowledged` is true, an admin may bypass automatic HIGH/CRITICAL production safety blocks (audit via deployment log details).
pub fn deploy_rule_version(
    conn: &Connection,
    rule_id: &str,
    version_id: &str,
    deployed_by: &str,
    safety_override_acknowledged: bool,
) -> Result<(), String> {
    let deploy_clock = Instant::now();
    if deployment_frozen(conn) {
        return Err("workflow_rule_deployment_frozen is enabled — deployments blocked".into());
    }
    let (tenant_id, environment_id): (String, String) = conn
        .query_row(
            "SELECT tenant_id, environment_id FROM workflow_rule_versions WHERE version_id = ?1 AND rule_id = ?2",
            params![version_id, rule_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "version not found for rule".to_string())?;
    let def_s = load_version_json(conn, version_id)?;
    let def: Value = serde_json::from_str(&def_s).map_err(|e| e.to_string())?;
    let prod = environment_id == "env-prod";
    let val = validate_rule_deployment_readiness(conn, rule_id, version_id, prod, true)?;
    if !val.get("ok").and_then(|x| x.as_bool()).unwrap_or(false) {
        let _ = log_environment_deployment(
            conn,
            &tenant_id,
            &environment_id,
            rule_id,
            version_id,
            "REJECTED_VALIDATION",
            &val,
        );
        let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::DeploymentsBlocked, 1);
        let _ = insert_workflow_alert_signal(
            conn,
            "DEPLOYMENT_BLOCKED",
            "WARNING",
            Some(rule_id),
            "Rule deployment blocked: validation failed",
            &json!({ "versionId": version_id, "phase": "REJECTED_VALIDATION" }),
            Some("deployment"),
        );
        let _ = log_structured_event(
            conn,
            "deployment_safety",
            "deployment_blocked_validation",
            Some(version_id),
            "WARNING",
            &json!({ "ruleId": rule_id, "tenantId": &tenant_id, "environmentId": &environment_id }),
        );
        return Err(format!("deployment validation failed: {val}"));
    }
    let mut last_prod_safety: Option<Value> = None;
    if prod && prod_safety_enforcement_enabled(conn) {
        let safety = validate_deployment_safety(
            conn,
            rule_id,
            version_id,
            &tenant_id,
            &environment_id,
            prod,
            &val,
            true,
        )?;
        last_prod_safety = Some(safety.clone());
        let safe = safety
            .get("safe_to_deploy")
            .and_then(|x| x.as_bool())
            .unwrap_or(false);
        if !safe {
            let admin_override = safety_override_acknowledged;
            if !admin_override {
                let _ = log_environment_deployment(
                    conn,
                    &tenant_id,
                    &environment_id,
                    rule_id,
                    version_id,
                    "REJECTED_SAFETY",
                    &safety,
                );
                let _ = record_risk_timeline(
                    conn,
                    safety
                        .get("risk_score")
                        .and_then(|x| x.as_f64())
                        .unwrap_or(0.0),
                    safety
                        .get("risk_level")
                        .and_then(|x| x.as_str())
                        .unwrap_or("HIGH"),
                    &environment_id,
                    &tenant_id,
                    rule_id,
                    version_id,
                    "BLOCKED_SAFETY",
                    &safety,
                );
                let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::DeploymentsBlocked, 1);
                let _ = insert_workflow_alert_signal(
                    conn,
                    "DEPLOYMENT_BLOCKED",
                    "CRITICAL",
                    Some(rule_id),
                    "Rule deployment blocked by automatic safety gate",
                    &json!({ "versionId": version_id, "safety": &safety }),
                    Some("deployment"),
                );
                let _ = log_structured_event(
                    conn,
                    "deployment_safety",
                    "deployment_blocked_safety",
                    Some(version_id),
                    "CRITICAL",
                    &json!({ "ruleId": rule_id, "tenantId": &tenant_id, "environmentId": &environment_id }),
                );
                let dep_ms = deploy_clock.elapsed().as_millis() as i64;
                let _ = record_performance_timing(
                    conn,
                    "deployment",
                    Some(version_id),
                    dep_ms,
                    &json!({ "ruleId": rule_id, "result": "REJECTED_SAFETY" }),
                );
                return Err(format!("deployment blocked by automatic safety gate: {safety}"));
            }
            let _ = record_risk_timeline(
                conn,
                safety
                    .get("risk_score")
                    .and_then(|x| x.as_f64())
                    .unwrap_or(0.0),
                safety
                    .get("risk_level")
                    .and_then(|x| x.as_str())
                    .unwrap_or("HIGH"),
                &environment_id,
                &tenant_id,
                rule_id,
                version_id,
                "OVERRIDE_ADMIN",
                &json!({ "safety": safety, "acknowledgedBy": deployed_by }),
            );
        }
    }
    ensure_approval(conn, rule_id, version_id)?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    deactivate_all_versions(&tx, rule_id, &tenant_id, &environment_id)?;
    activate_version(&tx, version_id)?;
    if prod {
        let tcheck: String = tx
            .query_row(
                "SELECT tenant_id FROM workflow_decision_rules WHERE rule_id = ?1",
                params![rule_id],
                |r| r.get(0),
            )
            .unwrap_or_default();
        if tcheck != tenant_id {
            tx.rollback().map_err(|e| e.to_string())?;
            return Err("tenant_id on live rule does not match version tenant".into());
        }
        apply_definition_to_live_rule(&tx, rule_id, &def, deployed_by, &tenant_id)?;
    }
    let dep = Uuid::new_v4().to_string();
    let ts = now_local();
    tx.execute(
        "INSERT INTO workflow_rule_deployment_log (deployment_id, rule_id, version_id, deployed_by, deployment_status, deployment_time, rollback_flag, details_json)
         VALUES (?1, ?2, ?3, ?4, 'SUCCESS', ?5, 0, ?6)",
        params![
            &dep,
            rule_id,
            version_id,
            deployed_by,
            &ts,
            &json!({ "type": "DEPLOY", "tenantId": &tenant_id, "environmentId": &environment_id }).to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE workflow_rule_staging SET status = 'DEPLOYED' WHERE rule_id = ?1 AND version_id = ?2",
        params![rule_id, version_id],
    )
    .map_err(|e| e.to_string())?;
    if prod {
        insert_impact_stub(&tx, rule_id, version_id)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    log_environment_deployment(
        conn,
        &tenant_id,
        &environment_id,
        rule_id,
        version_id,
        "SUCCESS",
        &json!({ "deployedBy": deployed_by, "liveRulesUpdated": prod }),
    )?;
    let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::DeploymentsSucceeded, 1);
    let dep_ms_ok = deploy_clock.elapsed().as_millis() as i64;
    let _ = record_performance_timing(
        conn,
        "deployment",
        Some(version_id),
        dep_ms_ok,
        &json!({ "ruleId": rule_id, "result": "SUCCESS", "environmentId": &environment_id }),
    );
    let _ = log_structured_event(
        conn,
        "deployment_safety",
        "deployment_succeeded",
        Some(version_id),
        "INFO",
        &json!({
            "ruleId": rule_id,
            "tenantId": &tenant_id,
            "environmentId": &environment_id,
            "durationMs": dep_ms_ok,
        }),
    );
    log_automation(
        conn,
        rule_id,
        "RULE_VERSION_DEPLOYED",
        rule_id,
        &json!({
            "versionId": version_id,
            "deployedBy": deployed_by,
            "tenantId": &tenant_id,
            "environmentId": &environment_id,
            "liveRulesUpdated": prod,
        })
        .to_string(),
    )?;
    if prod {
        if let Some(ref s) = last_prod_safety {
            let _ = record_risk_timeline(
                conn,
                s.get("risk_score").and_then(|x| x.as_f64()).unwrap_or(0.0),
                s.get("risk_level").and_then(|x| x.as_str()).unwrap_or("LOW"),
                &environment_id,
                &tenant_id,
                rule_id,
                version_id,
                "DEPLOYED",
                &json!({ "safety": s, "deployedBy": deployed_by }),
            );
        }
    }
    let _ = crate::commands::workflow_incident_management::record_deployment_recovery_healing(
        conn,
        rule_id,
        &json!({
            "versionId": version_id,
            "deployedBy": deployed_by,
            "tenantId": &tenant_id,
            "environmentId": &environment_id,
            "kind": "deploy_success",
        }),
    );
    Ok(())
}

/// Roll back to a stored version within its environment; updates live rules only for `env-prod`.
pub fn rollback_rule_version(
    conn: &Connection,
    rule_id: &str,
    target_version_id: &str,
    performed_by: &str,
    environment_id: Option<&str>,
) -> Result<(), String> {
    if deployment_frozen(conn) {
        return Err("workflow_rule_deployment_frozen is enabled — rollback blocked".into());
    }
    let (tenant_id, v_env): (String, String) = conn
        .query_row(
            "SELECT tenant_id, environment_id FROM workflow_rule_versions WHERE rule_id = ?1 AND version_id = ?2",
            params![rule_id, target_version_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "target version not found for rule".to_string())?;
    if let Some(req) = environment_id.map(str::trim).filter(|s| !s.is_empty()) {
        if req != v_env.as_str() {
            return Err("rollback environment_id does not match target version environment".into());
        }
    }
    let def_s = load_version_json(conn, target_version_id)?;
    let def: Value = serde_json::from_str(&def_s).map_err(|e| e.to_string())?;
    let prod = v_env == "env-prod";
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    deactivate_all_versions(&tx, rule_id, &tenant_id, &v_env)?;
    activate_version(&tx, target_version_id)?;
    if prod {
        apply_definition_to_live_rule(&tx, rule_id, &def, performed_by, &tenant_id)?;
    }
    let dep = Uuid::new_v4().to_string();
    let ts = now_local();
    tx.execute(
        "INSERT INTO workflow_rule_deployment_log (deployment_id, rule_id, version_id, deployed_by, deployment_status, deployment_time, rollback_flag, details_json)
         VALUES (?1, ?2, ?3, ?4, 'ROLLBACK', ?5, 1, ?6)",
        params![
            &dep,
            rule_id,
            target_version_id,
            performed_by,
            &ts,
            &json!({ "type": "ROLLBACK", "tenantId": &tenant_id, "environmentId": &v_env }).to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    log_environment_deployment(
        conn,
        &tenant_id,
        &v_env,
        rule_id,
        target_version_id,
        "ROLLBACK",
        &json!({ "performedBy": performed_by }),
    )?;
    log_automation(
        conn,
        rule_id,
        "RULE_VERSION_ROLLBACK",
        rule_id,
        &json!({
            "versionId": target_version_id,
            "performedBy": performed_by,
            "tenantId": &tenant_id,
            "environmentId": &v_env,
        })
        .to_string(),
    )?;
    Ok(())
}

// --- Tauri rows ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRuleVersionRow {
    pub version_id: String,
    pub rule_id: String,
    pub tenant_id: String,
    pub environment_id: String,
    pub version_number: i64,
    pub rule_definition_json: String,
    pub created_by: String,
    pub created_at: String,
    pub is_active: i64,
    pub change_reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRuleStagingRow {
    pub staging_id: String,
    pub rule_id: String,
    pub version_id: String,
    pub staging_environment: String,
    pub created_at: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRuleDeploymentLogRow {
    pub deployment_id: String,
    pub rule_id: String,
    pub version_id: String,
    pub deployed_by: String,
    pub deployment_status: String,
    pub deployment_time: String,
    pub rollback_flag: i64,
    pub details_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRuleApprovalRow {
    pub approval_id: String,
    pub rule_id: String,
    pub version_id: String,
    pub approved_by: String,
    pub approval_status: String,
    pub approval_time: String,
    pub requested_by: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanaryRuleDeploymentRow {
    pub id: String,
    pub tenant_id: String,
    pub rule_id: String,
    pub version_id: String,
    pub sample_size_percentage: f64,
    pub deployment_status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleDeploymentImpactRow {
    pub id: String,
    pub rule_id: String,
    pub version_id: String,
    pub snapshot_at: String,
    pub failure_rate: f64,
    pub cost_units_delta: f64,
    pub resolution_gain_delta: f64,
    pub execution_count: i64,
    pub factors_json: String,
}

#[tauri::command]
pub fn list_workflow_rule_versions(
    rule_id: String,
    tenant_id: Option<String>,
    environment_id: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowRuleVersionRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = tenant_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| active_tenant_id(&conn));
    let eid = environment_id.filter(|s| !s.trim().is_empty());
    let rows: Vec<WorkflowRuleVersionRow> = if let Some(ref env) = eid {
        let mut stmt = conn
            .prepare(
                "SELECT version_id, rule_id, tenant_id, environment_id, version_number, rule_definition_json, created_by, created_at, is_active, change_reason
             FROM workflow_rule_versions WHERE rule_id = ?1 AND tenant_id = ?2 AND environment_id = ?3 ORDER BY version_number DESC",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![&rule_id, &tid, env], |r| {
                Ok(WorkflowRuleVersionRow {
                    version_id: r.get(0)?,
                    rule_id: r.get(1)?,
                    tenant_id: r.get(2)?,
                    environment_id: r.get(3)?,
                    version_number: r.get(4)?,
                    rule_definition_json: r.get(5)?,
                    created_by: r.get(6)?,
                    created_at: r.get(7)?,
                    is_active: r.get(8)?,
                    change_reason: r.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        mapped
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT version_id, rule_id, tenant_id, environment_id, version_number, rule_definition_json, created_by, created_at, is_active, change_reason
             FROM workflow_rule_versions WHERE rule_id = ?1 AND tenant_id = ?2 ORDER BY environment_id, version_number DESC",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![&rule_id, &tid], |r| {
                Ok(WorkflowRuleVersionRow {
                    version_id: r.get(0)?,
                    rule_id: r.get(1)?,
                    tenant_id: r.get(2)?,
                    environment_id: r.get(3)?,
                    version_number: r.get(4)?,
                    rule_definition_json: r.get(5)?,
                    created_by: r.get(6)?,
                    created_at: r.get(7)?,
                    is_active: r.get(8)?,
                    change_reason: r.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        mapped
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    Ok(rows)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRuleVersionInput {
    pub rule_id: String,
    pub rule_definition: Value,
    pub change_reason: String,
    pub created_by: String,
    #[serde(default)]
    pub tenant_id: Option<String>,
    #[serde(default)]
    pub environment_id: Option<String>,
}

#[tauri::command]
pub fn create_workflow_rule_version(
    input: CreateRuleVersionInput,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if deployment_frozen(&conn) {
        return Err("deployment freeze active — cannot create versions".into());
    }
    let rule_id = input.rule_id.trim().to_string();
    let tid = input
        .tenant_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| active_tenant_id(&conn));
    let eid = input
        .environment_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default_version_environment_id(&conn));
    let vn: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM workflow_rule_versions WHERE rule_id = ?1 AND tenant_id = ?2 AND environment_id = ?3",
            params![&rule_id, &tid, &eid],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let vid = format!("{rule_id}:{eid}:v{vn}");
    let js = serde_json::to_string(&input.rule_definition).map_err(|e| e.to_string())?;
    let ts = now_local();
    conn.execute(
        "INSERT INTO workflow_rule_versions (version_id, rule_id, tenant_id, environment_id, version_number, rule_definition_json, created_by, created_at, is_active, change_reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)",
        params![
            &vid,
            &rule_id,
            &tid,
            &eid,
            vn,
            &js,
            input.created_by.trim(),
            &ts,
            input.change_reason.trim(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(vid)
}

#[tauri::command]
pub fn compare_rule_versions_command(
    version_id_a: String,
    version_id_b: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    compare_rule_versions(&conn, &version_id_a, &version_id_b)
}

#[tauri::command]
pub fn create_workflow_rule_staging(
    rule_id: String,
    version_id: String,
    staging_environment: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if deployment_frozen(&conn) {
        return Err("deployment freeze active".into());
    }
    let sid = Uuid::new_v4().to_string();
    let env = staging_environment.unwrap_or_else(|| "default".into());
    let ts = now_local();
    conn.execute(
        "INSERT INTO workflow_rule_staging (staging_id, rule_id, version_id, staging_environment, created_at, status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'DRAFT')",
        params![&sid, &rule_id, &version_id, &env, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(sid)
}

#[tauri::command]
pub fn update_workflow_rule_staging_status(
    staging_id: String,
    status: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let st = status.trim().to_uppercase();
    if !matches!(
        st.as_str(),
        "DRAFT" | "TESTING" | "READY" | "DEPLOYED" | "FAILED"
    ) {
        return Err("invalid staging status".into());
    }
    conn.execute(
        "UPDATE workflow_rule_staging SET status = ?2 WHERE staging_id = ?1",
        params![&staging_id, &st],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_workflow_rule_staging(
    rule_id: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowRuleStagingRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let rows: Vec<WorkflowRuleStagingRow> =
        if let Some(r) = rule_id.filter(|s| !s.trim().is_empty()) {
            let mut stmt = conn
                .prepare(
                    "SELECT staging_id, rule_id, version_id, staging_environment, created_at, status
             FROM workflow_rule_staging WHERE rule_id = ?1 ORDER BY datetime(created_at) DESC LIMIT 200",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![&r], |row| {
                    Ok(WorkflowRuleStagingRow {
                        staging_id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        staging_environment: row.get(3)?,
                        created_at: row.get(4)?,
                        status: row.get(5)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT staging_id, rule_id, version_id, staging_environment, created_at, status
             FROM workflow_rule_staging ORDER BY datetime(created_at) DESC LIMIT 200",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], |row| {
                    Ok(WorkflowRuleStagingRow {
                        staging_id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        staging_environment: row.get(3)?,
                        created_at: row.get(4)?,
                        status: row.get(5)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
    Ok(rows)
}

#[tauri::command]
pub fn submit_rule_version_approval(
    rule_id: String,
    version_id: String,
    requested_by: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let aid = Uuid::new_v4().to_string();
    let ts = now_local();
    conn.execute(
        "INSERT INTO workflow_rule_approvals (approval_id, rule_id, version_id, approved_by, approval_status, approval_time, requested_by, created_at)
         VALUES (?1, ?2, ?3, '', 'PENDING', NULL, ?4, ?5)",
        params![&aid, &rule_id, &version_id, requested_by.trim(), &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(aid)
}

#[tauri::command]
pub fn record_rule_approval_decision(
    approval_id: String,
    approve: bool,
    approved_by: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let st = if approve { "APPROVED" } else { "REJECTED" };
    let ts = now_local();
    conn.execute(
        "UPDATE workflow_rule_approvals SET approval_status = ?2, approved_by = ?3, approval_time = ?4 WHERE approval_id = ?1",
        params![&approval_id, st, approved_by.trim(), &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_workflow_rule_approvals(
    rule_id: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowRuleApprovalRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let rows: Vec<WorkflowRuleApprovalRow> =
        if let Some(r) = rule_id.filter(|s| !s.trim().is_empty()) {
            let mut stmt = conn
                .prepare(
                    "SELECT approval_id, rule_id, version_id, approved_by, approval_status, COALESCE(approval_time,''), requested_by, created_at
             FROM workflow_rule_approvals WHERE rule_id = ?1 ORDER BY datetime(created_at) DESC LIMIT 200",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![&r], |row| {
                    Ok(WorkflowRuleApprovalRow {
                        approval_id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        approved_by: row.get(3)?,
                        approval_status: row.get(4)?,
                        approval_time: row.get(5)?,
                        requested_by: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT approval_id, rule_id, version_id, approved_by, approval_status, COALESCE(approval_time,''), requested_by, created_at
             FROM workflow_rule_approvals ORDER BY datetime(created_at) DESC LIMIT 200",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], |row| {
                    Ok(WorkflowRuleApprovalRow {
                        approval_id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        approved_by: row.get(3)?,
                        approval_status: row.get(4)?,
                        approval_time: row.get(5)?,
                        requested_by: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
    Ok(rows)
}

#[tauri::command]
pub fn deploy_rule_version_command(
    rule_id: String,
    version_id: String,
    deployed_by: String,
    caller_role: String,
    safety_override_acknowledged: Option<bool>,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let n = normalize_role(&caller_role);
    let ack = safety_override_acknowledged.unwrap_or(false);
    let override_effective = ack && n.contains("admin");
    deploy_rule_version(
        &conn,
        &rule_id,
        &version_id,
        deployed_by.trim(),
        override_effective,
    )?;
    Ok(())
}

#[tauri::command]
pub fn rollback_rule_version_command(
    rule_id: String,
    target_version_id: String,
    performed_by: String,
    environment_id: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    rollback_rule_version(
        &conn,
        &rule_id,
        &target_version_id,
        performed_by.trim(),
        environment_id.as_deref(),
    )?;
    Ok(())
}

#[tauri::command]
pub fn validate_rule_deployment_command(
    rule_id: String,
    version_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let environment_id: String = conn
        .query_row(
            "SELECT environment_id FROM workflow_rule_versions WHERE version_id = ?1 AND rule_id = ?2",
            params![&version_id, &rule_id],
            |r| r.get(0),
        )
        .map_err(|_| "version not found".to_string())?;
    let prod = environment_id == "env-prod";
    validate_rule_deployment_readiness(&conn, &rule_id, &version_id, prod, true)
}

#[tauri::command]
pub fn list_workflow_rule_deployment_log(
    rule_id: Option<String>,
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowRuleDeploymentLogRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).max(1).min(500);
    let rows: Vec<WorkflowRuleDeploymentLogRow> =
        if let Some(r) = rule_id.filter(|s| !s.trim().is_empty()) {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT deployment_id, rule_id, version_id, deployed_by, deployment_status, deployment_time, rollback_flag, details_json
             FROM workflow_rule_deployment_log WHERE rule_id = ?1 ORDER BY datetime(deployment_time) DESC LIMIT {lim}"
                ))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![&r], |row| {
                    Ok(WorkflowRuleDeploymentLogRow {
                        deployment_id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        deployed_by: row.get(3)?,
                        deployment_status: row.get(4)?,
                        deployment_time: row.get(5)?,
                        rollback_flag: row.get(6)?,
                        details_json: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        } else {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT deployment_id, rule_id, version_id, deployed_by, deployment_status, deployment_time, rollback_flag, details_json
             FROM workflow_rule_deployment_log ORDER BY datetime(deployment_time) DESC LIMIT {lim}"
                ))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], |row| {
                    Ok(WorkflowRuleDeploymentLogRow {
                        deployment_id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        deployed_by: row.get(3)?,
                        deployment_status: row.get(4)?,
                        deployment_time: row.get(5)?,
                        rollback_flag: row.get(6)?,
                        details_json: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
    Ok(rows)
}

#[tauri::command]
pub fn set_canary_rule_deployment(
    rule_id: String,
    version_id: String,
    sample_size_percentage: f64,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = active_tenant_id(&conn);
    let id = Uuid::new_v4().to_string();
    let pct = sample_size_percentage.clamp(0.0, 100.0);
    let ts = now_local();
    conn.execute(
        "INSERT INTO canary_rule_deployment (id, tenant_id, rule_id, version_id, sample_size_percentage, deployment_status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'ACTIVE', ?6)
         ON CONFLICT(tenant_id, rule_id) DO UPDATE SET
           version_id = excluded.version_id,
           sample_size_percentage = excluded.sample_size_percentage,
           deployment_status = 'ACTIVE',
           created_at = excluded.created_at",
        params![&id, &tid, &rule_id, &version_id, pct, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_canary_rule_deployment(
    rule_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = active_tenant_id(&conn);
    conn.execute(
        "DELETE FROM canary_rule_deployment WHERE rule_id = ?1 AND tenant_id = ?2",
        params![&rule_id, &tid],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_canary_rule_deployments(
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<CanaryRuleDeploymentRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, tenant_id, rule_id, version_id, sample_size_percentage, deployment_status, created_at
             FROM canary_rule_deployment ORDER BY tenant_id, rule_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(CanaryRuleDeploymentRow {
                id: r.get(0)?,
                tenant_id: r.get(1)?,
                rule_id: r.get(2)?,
                version_id: r.get(3)?,
                sample_size_percentage: r.get(4)?,
                deployment_status: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_deployment_freeze(
    frozen: bool,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    meta_set(
        &conn,
        "workflow_rule_deployment_frozen",
        if frozen { "1" } else { "0" },
    )?;
    Ok(())
}

#[tauri::command]
pub fn get_deployment_freeze_status(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let f = deployment_frozen(&conn);
    let ap = requires_approval(&conn);
    Ok(json!({
        "deploymentFrozen": f,
        "requiresApproval": ap,
    }))
}

#[tauri::command]
pub fn set_deployment_requires_approval(
    required: bool,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    meta_set(
        &conn,
        "workflow_rule_deployment_requires_approval",
        if required { "1" } else { "0" },
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_rule_deployment_impact_metrics(
    rule_id: Option<String>,
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<RuleDeploymentImpactRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(60).max(1).min(300);
    let rows: Vec<RuleDeploymentImpactRow> =
        if let Some(r) = rule_id.filter(|s| !s.trim().is_empty()) {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT id, rule_id, version_id, snapshot_at, failure_rate, cost_units_delta, resolution_gain_delta, execution_count, factors_json
             FROM rule_deployment_impact_metrics WHERE rule_id = ?1 ORDER BY snapshot_at DESC LIMIT {lim}"
                ))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![&r], |row| {
                    Ok(RuleDeploymentImpactRow {
                        id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        snapshot_at: row.get(3)?,
                        failure_rate: row.get(4)?,
                        cost_units_delta: row.get(5)?,
                        resolution_gain_delta: row.get(6)?,
                        execution_count: row.get(7)?,
                        factors_json: row.get(8)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        } else {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT id, rule_id, version_id, snapshot_at, failure_rate, cost_units_delta, resolution_gain_delta, execution_count, factors_json
             FROM rule_deployment_impact_metrics ORDER BY snapshot_at DESC LIMIT {lim}"
                ))
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map([], |row| {
                    Ok(RuleDeploymentImpactRow {
                        id: row.get(0)?,
                        rule_id: row.get(1)?,
                        version_id: row.get(2)?,
                        snapshot_at: row.get(3)?,
                        failure_rate: row.get(4)?,
                        cost_units_delta: row.get(5)?,
                        resolution_gain_delta: row.get(6)?,
                        execution_count: row.get(7)?,
                        factors_json: row.get(8)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            mapped
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
    Ok(rows)
}

#[tauri::command]
pub fn refresh_rule_deployment_impact_metrics(
    rule_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = active_tenant_id(&conn);
    let vid: Option<String> =
        active_version_id_for_rule(&conn, &rule_id, &tid, "env-prod")?;
    let Some(version_id) = vid else {
        return Ok(());
    };
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let fails: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_automation_log
             WHERE rule_id = ?1 AND tenant_id = ?2 AND datetime(executed_at) > datetime('now', '-7 days')
               AND (lower(execution_result) LIKE '%\"ok\":false%' OR lower(execution_result) LIKE '%error%')",
            params![&rule_id, &tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let acts: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_automation_log
             WHERE rule_id = ?1 AND tenant_id = ?2 AND datetime(executed_at) > datetime('now', '-7 days')",
            params![&rule_id, &tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let fr = if acts > 0 {
        fails as f64 / acts as f64
    } else {
        0.0
    };
    let cost: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(estimated_cost_units),0) FROM workflow_automation_log
             WHERE rule_id = ?1 AND tenant_id = ?2 AND datetime(executed_at) > datetime('now', '-7 days')",
            params![&rule_id, &tid],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let gain: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(resolution_time_reduction_hours),0) FROM workflow_automation_log
             WHERE rule_id = ?1 AND tenant_id = ?2 AND action_taken = 'AUTO_RESOLVE' AND datetime(executed_at) > datetime('now', '-7 days')",
            params![&rule_id, &tid],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let id = Uuid::new_v4().to_string();
    let fj = json!({ "failures7d": fails, "actions7d": acts }).to_string();
    conn.execute(
        "INSERT INTO rule_deployment_impact_metrics (id, rule_id, version_id, snapshot_at, failure_rate, cost_units_delta, resolution_gain_delta, execution_count, factors_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(rule_id, snapshot_at) DO UPDATE SET
           version_id = excluded.version_id,
           failure_rate = excluded.failure_rate,
           cost_units_delta = excluded.cost_units_delta,
           resolution_gain_delta = excluded.resolution_gain_delta,
           execution_count = excluded.execution_count,
           factors_json = excluded.factors_json",
        params![
            &id,
            &rule_id,
            &version_id,
            &d,
            fr,
            cost,
            gain,
            acts,
            &fj,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Deployment safety (automatic production gates, risk, audit) ---

#[tauri::command]
pub fn validate_deployment_safety_command(
    rule_id: String,
    version_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let (tenant_id, environment_id): (String, String) = conn
        .query_row(
            "SELECT tenant_id, environment_id FROM workflow_rule_versions WHERE version_id = ?1 AND rule_id = ?2",
            params![&version_id, &rule_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "version not found".to_string())?;
    let prod = environment_id == "env-prod";
    let gov = validate_rule_deployment_readiness(&conn, &rule_id, &version_id, prod, true)?;
    let safety = crate::commands::deployment_safety::validate_deployment_safety(
        &conn,
        &rule_id,
        &version_id,
        &tenant_id,
        &environment_id,
        prod,
        &gov,
        true,
    )?;
    let _ = crate::commands::deployment_safety::record_risk_timeline(
        &conn,
        safety
            .get("risk_score")
            .and_then(|x| x.as_f64())
            .unwrap_or(0.0),
        safety
            .get("risk_level")
            .and_then(|x| x.as_str())
            .unwrap_or("LOW"),
        if prod {
            environment_id.as_str()
        } else {
            "non-prod"
        },
        &tenant_id,
        &rule_id,
        &version_id,
        "VALIDATION",
        &safety,
    );
    Ok(safety)
}

#[tauri::command]
pub fn run_deployment_dry_run_command(
    rule_id: String,
    version_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let (tenant_id, environment_id): (String, String) = conn
        .query_row(
            "SELECT tenant_id, environment_id FROM workflow_rule_versions WHERE version_id = ?1 AND rule_id = ?2",
            params![&version_id, &rule_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "version not found".to_string())?;
    let prod = environment_id == "env-prod";
    let gov = validate_rule_deployment_readiness(&conn, &rule_id, &version_id, prod, true)?;
    let safety = crate::commands::deployment_safety::validate_deployment_safety(
        &conn,
        &rule_id,
        &version_id,
        &tenant_id,
        &environment_id,
        prod,
        &gov,
        false,
    )?;
    let sim = deployment_simulation_attachment(&conn, &version_id)
        .unwrap_or(json!({"note": "unavailable"}));
    Ok(json!({
        "predictedOutcome": "read_only",
        "governance": gov,
        "safety": safety,
        "simulationAttachment": sim,
        "notes": "Dry-run does not activate versions or live rules.",
    }))
}

#[tauri::command]
pub fn get_deployment_safety_dashboard_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let enforcement = prod_safety_enforcement_enabled(&conn);
    let latest: Option<Value> = conn
        .query_row(
            "SELECT assessment_json FROM deployment_risk_assessment ORDER BY datetime(assessed_at) DESC LIMIT 1",
            [],
            |r| {
                let s: String = r.get(0)?;
                Ok(serde_json::from_str::<Value>(&s).unwrap_or(Value::Null))
            },
        )
        .ok();
    let pending_validations: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_rule_approvals WHERE upper(trim(approval_status))='PENDING'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let conflicts_7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deployment_conflict_log WHERE datetime(detected_at) > datetime('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let load: f64 = conn
        .query_row(
            "SELECT COALESCE(load_percentage, 0) FROM automation_capacity_load ORDER BY datetime(snapshot_at) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    Ok(json!({
        "prodSafetyEnforcement": enforcement,
        "latestRiskAssessment": latest,
        "pendingApprovals": pending_validations,
        "conflictsLogged7d": conflicts_7d,
        "latestCapacityLoadPct": load,
    }))
}

#[tauri::command]
pub fn get_smart_deployment_recommendations_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let successes: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_rule_deployment_log WHERE upper(trim(deployment_status))='SUCCESS' AND datetime(deployment_time) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let load: f64 = conn
        .query_row(
            "SELECT COALESCE(load_percentage, 0) FROM automation_capacity_load ORDER BY datetime(snapshot_at) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let fails: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM deployment_risk_timeline WHERE result IN ('BLOCKED_SAFETY','PRE_DEPLOY_BLOCKED') AND datetime(deployment_time) > datetime('now', '-14 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let window = if load < 70.0 && fails < 3 {
        "Off-peak weekday early morning (local) — capacity comfortable and few recent safety blocks."
    } else if load >= 85.0 {
        "Defer until capacity load drops below 85%."
    } else {
        "Low-traffic weekend window recommended (heuristic)."
    };
    Ok(json!({
        "suggestedWindow": window,
        "successDeployments30d": successes,
        "recentSafetyBlocks14d": fails,
        "latestLoadPct": load,
    }))
}

#[tauri::command]
pub fn generate_deployment_safety_audit_report_command(
    rule_id: String,
    version_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let (tenant_id, environment_id): (String, String) = conn
        .query_row(
            "SELECT tenant_id, environment_id FROM workflow_rule_versions WHERE version_id = ?1 AND rule_id = ?2",
            params![&version_id, &rule_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "version not found".to_string())?;
    let prod = environment_id == "env-prod";
    let gov = validate_rule_deployment_readiness(&conn, &rule_id, &version_id, prod, true)?;
    let safety = crate::commands::deployment_safety::validate_deployment_safety(
        &conn,
        &rule_id,
        &version_id,
        &tenant_id,
        &environment_id,
        prod,
        &gov,
        false,
    )?;
    let mut timeline: Vec<Value> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT deployment_time, risk_score, risk_level, environment_id, result, details_json
         FROM deployment_risk_timeline WHERE rule_id = ?1 AND version_id = ?2
         ORDER BY datetime(deployment_time) DESC LIMIT 40",
    ) {
        if let Ok(rows) = stmt.query_map(params![&rule_id, &version_id], |r| {
            Ok(json!({
                "deploymentTime": r.get::<_, String>(0)?,
                "riskScore": r.get::<_, f64>(1)?,
                "riskLevel": r.get::<_, String>(2)?,
                "environmentId": r.get::<_, String>(3)?,
                "result": r.get::<_, String>(4)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(5)?).unwrap_or(Value::Null),
            }))
        }) {
            for row in rows {
                if let Ok(v) = row {
                    timeline.push(v);
                }
            }
        }
    }
    let mut conflicts: Vec<Value> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT detected_at, conflict_type, details_json FROM deployment_conflict_log
         WHERE rule_id = ?1 ORDER BY datetime(detected_at) DESC LIMIT 40",
    ) {
        if let Ok(rows) = stmt.query_map(params![&rule_id], |r| {
            Ok(json!({
                "detectedAt": r.get::<_, String>(0)?,
                "conflictType": r.get::<_, String>(1)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(2)?).unwrap_or(Value::Null),
            }))
        }) {
            for row in rows {
                if let Ok(v) = row {
                    conflicts.push(v);
                }
            }
        }
    }
    Ok(json!({
        "reportType": "deployment_safety_report",
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "ruleId": rule_id,
        "versionId": version_id,
        "governanceValidation": gov,
        "safetyEvaluation": safety,
        "riskTimeline": timeline,
        "recentConflicts": conflicts,
    }))
}

#[tauri::command]
pub fn list_deployment_conflict_log_command(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(80).clamp(1, 300);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, detected_at, rule_id, tenant_id, environment_id, related_version_id, conflict_type, details_json
             FROM deployment_conflict_log ORDER BY datetime(detected_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "detectedAt": r.get::<_, String>(1)?,
                "ruleId": r.get::<_, String>(2)?,
                "tenantId": r.get::<_, String>(3)?,
                "environmentId": r.get::<_, String>(4)?,
                "relatedVersionId": r.get::<_, Option<String>>(5)?,
                "conflictType": r.get::<_, String>(6)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(7)?).unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?;
    mapped.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_deployment_risk_timeline_command(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(80).clamp(1, 300);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, deployment_time, risk_score, risk_level, environment_id, tenant_id, rule_id, version_id, result, details_json
             FROM deployment_risk_timeline ORDER BY datetime(deployment_time) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "deploymentTime": r.get::<_, String>(1)?,
                "riskScore": r.get::<_, f64>(2)?,
                "riskLevel": r.get::<_, String>(3)?,
                "environmentId": r.get::<_, String>(4)?,
                "tenantId": r.get::<_, String>(5)?,
                "ruleId": r.get::<_, String>(6)?,
                "versionId": r.get::<_, String>(7)?,
                "result": r.get::<_, String>(8)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(9)?).unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?;
    mapped.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_deployment_prod_safety_enforcement_command(
    enabled: bool,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let v = if enabled { "1" } else { "0" };
    meta_set(&conn, "workflow_deploy_prod_safety_enforcement", v)?;
    Ok(())
}
