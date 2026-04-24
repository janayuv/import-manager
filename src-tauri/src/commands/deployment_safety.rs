//! Deployment safety helpers (risk, conflicts, persistence). Invoked from
//! `workflow_rule_deployment` after governance readiness to avoid circular imports.

use crate::commands::workflow_production_observability::{
    bump_workflow_runtime_metric, insert_workflow_alert_signal, log_structured_event,
    record_performance_timing, RuntimeMetricDelta,
};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::time::Instant;
use uuid::Uuid;

fn meta_get(conn: &Connection, key: &str) -> String {
    conn.query_row(
        "SELECT value FROM app_metadata WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .unwrap_or_default()
}

pub fn prod_safety_enforcement_enabled(conn: &Connection) -> bool {
    meta_get(conn, "workflow_deploy_prod_safety_enforcement").trim() != "0"
}

fn requires_approval(conn: &Connection) -> bool {
    meta_get(conn, "workflow_rule_deployment_requires_approval").trim() == "1"
}

fn risk_level_from_score(score: f64) -> &'static str {
    if score < 25.0 {
        "LOW"
    } else if score < 50.0 {
        "MEDIUM"
    } else if score < 75.0 {
        "HIGH"
    } else {
        "CRITICAL"
    }
}

pub fn upsert_risk_assessment(
    conn: &Connection,
    rule_id: &str,
    version_id: &str,
    tenant_id: &str,
    environment_id: &str,
    risk_score: f64,
    risk_level: &str,
    safe_to_deploy: bool,
    assessment: &Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let safe_i: i64 = if safe_to_deploy { 1 } else { 0 };
    conn.execute(
        "INSERT INTO deployment_risk_assessment (assessment_id, assessed_at, rule_id, version_id, tenant_id, environment_id, risk_score, risk_level, safe_to_deploy, assessment_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(rule_id, version_id, tenant_id, environment_id) DO UPDATE SET
           assessed_at = excluded.assessed_at,
           risk_score = excluded.risk_score,
           risk_level = excluded.risk_level,
           safe_to_deploy = excluded.safe_to_deploy,
           assessment_json = excluded.assessment_json",
        params![
            &id,
            &ts,
            rule_id,
            version_id,
            tenant_id,
            environment_id,
            risk_score,
            risk_level,
            safe_i,
            &assessment.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn record_risk_timeline(
    conn: &Connection,
    risk_score: f64,
    risk_level: &str,
    environment_id: &str,
    tenant_id: &str,
    rule_id: &str,
    version_id: &str,
    result: &str,
    details: &Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    conn.execute(
        "INSERT INTO deployment_risk_timeline (id, deployment_time, risk_score, risk_level, environment_id, tenant_id, rule_id, version_id, result, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            &id,
            &ts,
            risk_score,
            risk_level,
            environment_id,
            tenant_id,
            rule_id,
            version_id,
            result,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn log_conflict(
    conn: &Connection,
    rule_id: &str,
    tenant_id: &str,
    environment_id: &str,
    related_version_id: Option<&str>,
    conflict_type: &str,
    details: &Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    conn.execute(
        "INSERT INTO deployment_conflict_log (id, detected_at, rule_id, tenant_id, environment_id, related_version_id, conflict_type, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            &id,
            &ts,
            rule_id,
            tenant_id,
            environment_id,
            related_version_id,
            conflict_type,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn load_version_json_local(conn: &Connection, version_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT rule_definition_json FROM workflow_rule_versions WHERE version_id = ?1",
        params![version_id],
        |r| r.get(0),
    )
    .map_err(|_| format!("unknown version_id: {version_id}"))
}

fn rollback_readiness(
    conn: &Connection,
    rule_id: &str,
    tenant_id: &str,
    environment_id: &str,
    version_id: &str,
) -> Result<(bool, Vec<String>), String> {
    let mut notes = Vec::new();
    let cnt: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_rule_versions WHERE rule_id = ?1 AND tenant_id = ?2 AND environment_id = ?3",
            params![rule_id, tenant_id, environment_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if cnt <= 1 {
        notes.push("Only one version exists for this rule in this environment — first-time activation; no alternate rollback target.".into());
        return Ok((true, notes));
    }
    let alt: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_rule_versions WHERE rule_id = ?1 AND tenant_id = ?2 AND environment_id = ?3 AND version_id != ?4",
            params![rule_id, tenant_id, environment_id, version_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if alt == 0 {
        return Ok((false, vec!["No alternate version row for rollback.".into()]));
    }
    notes.push(format!("Alternate version rows available: {alt}"));
    Ok((true, notes))
}

fn detect_conflicts(
    conn: &Connection,
    rule_id: &str,
    tenant_id: &str,
    environment_id: &str,
    version_id: &str,
    def: &Value,
) -> Result<Vec<String>, String> {
    let mut warnings = Vec::new();
    let prio = def.get("priority").and_then(|x| x.as_i64()).unwrap_or(0);
    let cond = def
        .get("conditionExpression")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let action = def
        .get("actionType")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let rule_type = def
        .get("ruleType")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();

    let mut stmt = conn
        .prepare(
            "SELECT rule_id, rule_name, rule_type, condition_expression, action_type, priority, enabled
             FROM workflow_decision_rules WHERE tenant_id = ?1 AND rule_id != ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tenant_id, rule_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (other_id, _name, o_rt, o_cond, o_act, o_pr, en): (
            String,
            String,
            String,
            String,
            String,
            i64,
            i64,
        ) = row.map_err(|e| e.to_string())?;
        if en == 0 {
            continue;
        }
        let o_rt_l = o_rt.trim().to_lowercase();
        let o_cond_l = o_cond.trim().to_lowercase();
        let o_act_l = o_act.trim().to_lowercase();
        if !rule_type.is_empty() && rule_type == o_rt_l && !cond.is_empty() && cond == o_cond_l {
            let d = json!({"otherRuleId": &other_id, "reason": "Same rule type and identical condition expression"});
            log_conflict(
                conn,
                rule_id,
                tenant_id,
                environment_id,
                Some(version_id),
                "OVERLAPPING_CONDITION",
                &d,
            )?;
            warnings.push(format!("Overlapping condition with enabled rule {other_id}"));
        }
        if !action.is_empty() && action == o_act_l && prio == o_pr {
            let d = json!({"otherRuleId": &other_id, "priority": prio, "actionType": &action});
            log_conflict(
                conn,
                rule_id,
                tenant_id,
                environment_id,
                Some(version_id),
                "DUPLICATE_PRIORITY_ACTION",
                &d,
            )?;
            warnings.push(format!(
                "Same action type and priority as enabled rule {other_id}"
            ));
        }
    }

    if environment_id == "env-prod" {
        let mut stmt2 = conn
            .prepare(
                "SELECT COUNT(*) FROM workflow_rule_versions WHERE tenant_id = ?1 AND environment_id = ?2 AND rule_id != ?3 AND is_active = 1",
            )
            .map_err(|e| e.to_string())?;
        let active_others: i64 = stmt2
            .query_row(params![tenant_id, environment_id, rule_id], |r| r.get(0))
            .unwrap_or(0);
        if active_others > 0 {
            let d = json!({"activeOtherRules": active_others});
            log_conflict(
                conn,
                rule_id,
                tenant_id,
                environment_id,
                Some(version_id),
                "ENVIRONMENT_ACTIVE_OVERLAP",
                &d,
            )?;
            warnings.push(format!(
                "Other rules have active versions in {environment_id} for this tenant"
            ));
        }
    }

    Ok(warnings)
}

/// Alias for `evaluate_deployment_safety` (automatic deployment safety validator).
pub fn validate_deployment_safety(
    conn: &Connection,
    rule_id: &str,
    version_id: &str,
    tenant_id: &str,
    environment_id: &str,
    prod: bool,
    governance: &Value,
    persist_assessment: bool,
) -> Result<Value, String> {
    evaluate_deployment_safety(
        conn,
        rule_id,
        version_id,
        tenant_id,
        environment_id,
        prod,
        governance,
        persist_assessment,
    )
}

/// Post-governance safety: risk score, conflicts, rollback readiness, capacity/cost signals.
/// `governance` is the JSON from `validate_rule_deployment_readiness` (same `prod` flag).
pub fn evaluate_deployment_safety(
    conn: &Connection,
    rule_id: &str,
    version_id: &str,
    tenant_id: &str,
    environment_id: &str,
    prod: bool,
    governance: &Value,
    persist_assessment: bool,
) -> Result<Value, String> {
    let eval_clock = Instant::now();
    let mut warnings: Vec<String> = Vec::new();
    let mut blocking_issues: Vec<String> = Vec::new();
    let mut score: f64 = 0.0;

    if !prod {
        let out = json!({
            "safe_to_deploy": true,
            "risk_level": "LOW",
            "risk_score": 0.0,
            "warnings": ["Safety gate scope: production (env-prod) only."],
            "blocking_issues": Value::Array(vec![]),
            "factors": {"scope": "non_production"},
        });
        return Ok(out);
    }

    let gov_ok = governance.get("ok").and_then(|x| x.as_bool()).unwrap_or(false);
    if !gov_ok {
        score += 35.0;
        blocking_issues.push(
            "Governance readiness failed (approval / simulation gate / capacity / cost)".into(),
        );
    }

    if requires_approval(conn) {
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_rule_approvals WHERE rule_id = ?1 AND version_id = ?2 AND upper(trim(approval_status)) = 'PENDING'",
                params![rule_id, version_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if pending > 0 {
            score += 12.0;
            warnings.push(format!("Pending approvals exist: {pending}"));
        }
        let approved: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_rule_approvals WHERE rule_id = ?1 AND version_id = ?2 AND upper(trim(approval_status)) = 'APPROVED'",
                params![rule_id, version_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if approved == 0 {
            score += 18.0;
            blocking_issues.push(
                "No APPROVED workflow_rule_approvals row for this version while approval is required"
                    .into(),
            );
        }
    }

    if meta_get(conn, "workflow_deploy_simulation_gate_enabled").trim() == "1" {
        let sim_ok =
            meta_get(conn, "workflow_last_deploy_simulation_ok_version_id").trim() == version_id;
        if !sim_ok {
            score += 22.0;
            warnings.push(
                "Simulation gate: version_id not marked as last successful simulation target"
                    .into(),
            );
        }
    }

    let load: f64 = conn
        .query_row(
            "SELECT COALESCE(load_percentage, 0) FROM automation_capacity_load ORDER BY datetime(snapshot_at) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    if load >= 95.0 {
        score += 30.0;
        blocking_issues.push(format!(
            "Capacity load {load:.1}% at or above safe ceiling (95%)"
        ));
    } else if load >= 85.0 {
        score += (load - 85.0) * 1.2;
        warnings.push(format!("Elevated capacity load: {load:.1}%"));
    }

    let max_cu: f64 = conn
        .query_row(
            "SELECT COALESCE(max_cost_units_per_cycle, 500000) FROM automation_cost_limits WHERE id = 'default'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(500_000.0);
    let max_ms: i64 = conn
        .query_row(
            "SELECT COALESCE(max_execution_time_per_cycle_ms, 120000) FROM automation_cost_limits WHERE id = 'default'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(120_000);
    let used: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(estimated_cost_units), 0) FROM workflow_automation_log WHERE datetime(executed_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    if used > max_cu * 1.1 {
        score += 25.0;
        blocking_issues.push("24h automation cost exceeds policy headroom vs cycle limit".into());
    } else if used > max_cu * 0.95 {
        score += 10.0;
        warnings.push("24h automation cost approaching limit".into());
    }

    let def_s = load_version_json_local(conn, version_id)?;
    let def: Value = serde_json::from_str(&def_s).map_err(|e| e.to_string())?;
    let cond_len = def
        .get("conditionExpression")
        .and_then(|x| x.as_str())
        .map(|s| s.len())
        .unwrap_or(0);
    if cond_len > 600 {
        score += 8.0;
        warnings.push("High rule complexity (long condition expression)".into());
    }

    let rb_ok = rollback_readiness(conn, rule_id, tenant_id, environment_id, version_id)?;
    if !rb_ok.0 {
        score += 40.0;
        blocking_issues.push(rb_ok.1.join("; "));
    } else {
        warnings.extend(rb_ok.1);
    }

    let rollbacks_30d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_rule_deployment_log WHERE rule_id = ?1 AND rollback_flag = 1 AND datetime(deployment_time) > datetime('now', '-30 days')",
            params![rule_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    score += (rollbacks_30d as f64).min(5.0) * 4.0;

    let fail_rate: f64 = conn
        .query_row(
            "SELECT COALESCE(failure_rate, 0) FROM rule_deployment_impact_metrics WHERE rule_id = ?1 ORDER BY datetime(snapshot_at) DESC LIMIT 1",
            params![rule_id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    score += (fail_rate * 40.0).min(28.0);

    let conflict_notes = detect_conflicts(conn, rule_id, tenant_id, environment_id, version_id, &def)?;
    if !conflict_notes.is_empty() {
        score += (conflict_notes.len() as f64 * 10.0).min(35.0);
        warnings.extend(conflict_notes);
    }

    let _ = max_ms;

    score = score.min(100.0).max(0.0);
    let risk_level = risk_level_from_score(score);
    let mut safe_to_deploy = blocking_issues.is_empty();
    if matches!(risk_level, "HIGH" | "CRITICAL") {
        safe_to_deploy = false;
        if !blocking_issues
            .iter()
            .any(|s| s.contains("Automatic production gate"))
        {
            blocking_issues.push(format!(
                "Automatic production gate: risk_level {risk_level} (score {score:.1})"
            ));
        }
    }

    let out = json!({
        "safe_to_deploy": safe_to_deploy,
        "risk_level": risk_level,
        "risk_score": score,
        "warnings": warnings,
        "blocking_issues": blocking_issues,
        "governance": governance,
        "factors": {
            "capacityLoadPct": load,
            "costUsed24h": used,
            "costLimitPerCycle": max_cu,
            "rollbacks30d": rollbacks_30d,
            "failureRateImpact": fail_rate,
        },
    });

    if persist_assessment {
        upsert_risk_assessment(
            conn,
            rule_id,
            version_id,
            tenant_id,
            environment_id,
            score,
            risk_level,
            safe_to_deploy,
            &out,
        )?;
    }

    let eval_ms = eval_clock.elapsed().as_millis() as i64;
    let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::RiskEvaluations, 1);
    let _ = record_performance_timing(
        conn,
        "risk_evaluation",
        Some(version_id),
        eval_ms,
        &json!({
            "ruleId": rule_id,
            "tenantId": tenant_id,
            "environmentId": environment_id,
            "riskScore": score,
            "safeToDeploy": safe_to_deploy,
        }),
    );
    let _ = log_structured_event(
        conn,
        "deployment_safety",
        "risk_evaluation_completed",
        Some(version_id),
        if safe_to_deploy { "INFO" } else { "WARNING" },
        &json!({
            "ruleId": rule_id,
            "tenantId": tenant_id,
            "environmentId": environment_id,
            "riskLevel": risk_level,
            "riskScore": score,
            "safeToDeploy": safe_to_deploy,
            "durationMs": eval_ms,
        }),
    );
    if !safe_to_deploy && prod && persist_assessment {
        let sev = match risk_level {
            "CRITICAL" => "FATAL",
            "HIGH" => "CRITICAL",
            _ => "WARNING",
        };
        let _ = insert_workflow_alert_signal(
            conn,
            "DEPLOYMENT_UNSAFE",
            sev,
            Some(rule_id),
            "Deployment risk evaluation marked deployment as unsafe",
            &json!({
                "versionId": version_id,
                "riskLevel": risk_level,
                "riskScore": score,
                "blockingIssues": out.get("blocking_issues").cloned().unwrap_or(Value::Null),
            }),
            Some("safety"),
        );
    }

    Ok(out)
}
