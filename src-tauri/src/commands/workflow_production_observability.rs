//! Structured logging, runtime metrics, alert signals, performance timings, and system health export.

use crate::db::DbState;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

fn now_ts() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn structured_severity_is_regression_candidate(raw: &str) -> bool {
    matches!(
        raw.trim().to_uppercase().as_str(),
        "ERROR" | "CRITICAL" | "CRIT" | "FATAL"
    )
}

/// Standard machine-readable audit trail row (also logged to the `structured` target).
pub fn log_structured_event(
    conn: &Connection,
    module: &str,
    event_type: &str,
    entity_id: Option<&str>,
    severity: &str,
    details: &Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    let sev = normalize_signal_severity(severity);
    conn.execute(
        "INSERT INTO workflow_structured_event_log (id, timestamp, module, event_type, entity_id, severity, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &id,
            &ts,
            module,
            event_type,
            entity_id,
            &sev,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    let line = json!({
        "timestamp": &ts,
        "module": module,
        "event_type": event_type,
        "entity_id": entity_id,
        "severity": &sev,
        "details": details,
    });
    log::info!(target: "structured", "{}", line);
    if structured_severity_is_regression_candidate(severity) {
        crate::commands::workflow_incident_management::maybe_record_regression_from_structured_event(
            conn,
            module,
            event_type,
            entity_id,
            &id,
            &ts,
            &sev,
            details,
        )?;
    }
    Ok(())
}

fn normalize_signal_severity(s: &str) -> String {
    match s.trim().to_uppercase().as_str() {
        "WARN" | "WARNING" => "WARNING".into(),
        "ERROR" => "CRITICAL".into(),
        "CRIT" | "CRITICAL" => "CRITICAL".into(),
        "FATAL" => "FATAL".into(),
        "INFO" => "INFO".into(),
        _ => {
            let u = s.trim().to_uppercase();
            if u.is_empty() {
                "INFO".into()
            } else {
                u
            }
        }
    }
}

#[derive(Clone, Copy)]
pub enum RuntimeMetricDelta {
    JobsExecuted,
    JobsFailed,
    JobsRecovered,
    DeploymentsBlocked,
    DeploymentsSucceeded,
    RecoveryAttempts,
    RiskEvaluations,
}

pub fn bump_workflow_runtime_metric(conn: &Connection, field: RuntimeMetricDelta, delta: i64) -> Result<(), String> {
    let (col, d) = match field {
        RuntimeMetricDelta::JobsExecuted => ("jobs_executed", delta),
        RuntimeMetricDelta::JobsFailed => ("jobs_failed", delta),
        RuntimeMetricDelta::JobsRecovered => ("jobs_recovered", delta),
        RuntimeMetricDelta::DeploymentsBlocked => ("deployments_blocked", delta),
        RuntimeMetricDelta::DeploymentsSucceeded => ("deployments_succeeded", delta),
        RuntimeMetricDelta::RecoveryAttempts => ("recovery_attempts", delta),
        RuntimeMetricDelta::RiskEvaluations => ("risk_evaluations", delta),
    };
    let ts = now_ts();
    let sql = format!(
        "UPDATE workflow_runtime_metrics SET {col} = {col} + ?1, updated_at = ?2 WHERE id = 1"
    );
    conn.execute(&sql, params![d, &ts])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn record_performance_timing(
    conn: &Connection,
    category: &str,
    entity_id: Option<&str>,
    duration_ms: i64,
    details: &Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO performance_timing_metrics (id, category, entity_id, duration_ms, recorded_at, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            &id,
            category,
            entity_id,
            duration_ms.max(0),
            &ts,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn insert_workflow_alert_signal(
    conn: &Connection,
    signal_type: &str,
    severity: &str,
    entity_id: Option<&str>,
    message: &str,
    details: &Value,
    source_module: Option<&str>,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    let sev = normalize_signal_severity(severity);
    conn.execute(
        "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &id,
            &ts,
            signal_type,
            &sev,
            entity_id,
            message,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    if sev == "CRITICAL" || sev == "FATAL" {
        let sm = source_module.unwrap_or("unknown");
        let suppressed =
            crate::commands::workflow_incident_management::apply_incident_suppression_to_critical_alert(
                conn, sm, signal_type, &id,
            )?;
        if !suppressed {
            if let Some(ref iid) = crate::commands::workflow_incident_management::maybe_promote_alert_to_incident(
                conn,
                &id,
                signal_type,
                &sev,
                entity_id,
                message,
                details,
                sm,
            )? {
                let _ =
                    crate::commands::workflow_incident_management::maybe_record_regression_after_alert_promotion(
                        conn,
                        iid,
                        &id,
                        sm,
                        signal_type,
                        entity_id,
                    );
            }
        }
    }
    Ok(())
}

fn recent_signal_count(
    conn: &Connection,
    signal_type: &str,
    entity_key: Option<&str>,
    hours: i64,
) -> Result<i64, String> {
    let h = hours.max(1).min(168);
    let cutoff = format!("-{h} hours");
    let n: i64 = if let Some(e) = entity_key.filter(|s| !s.is_empty()) {
        conn.query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = ?1 AND IFNULL(entity_id,'') = ?2
               AND datetime(created_at) > datetime('now', ?3)",
            params![signal_type, e, &cutoff],
            |r| r.get(0),
        )
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = ?1 AND datetime(created_at) > datetime('now', ?2)",
            params![signal_type, &cutoff],
            |r| r.get(0),
        )
    }
    .unwrap_or(0);
    Ok(n)
}

/// Emit deduplicated threshold signals for external monitoring.
pub fn scan_and_emit_threshold_alert_signals(conn: &Connection) -> Result<i64, String> {
    let mut emitted = 0i64;

    let mut stmt = conn
        .prepare(
            "SELECT job_id, COUNT(*) AS c FROM workflow_job_execution_log
             WHERE datetime(started_at) > datetime('now', '-1 day')
               AND status IN ('FAILED','TIMEOUT')
             GROUP BY job_id HAVING c >= 5",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (job_id, c) = row.map_err(|e| e.to_string())?;
        if recent_signal_count(conn, "JOB_FAILURE_THRESHOLD", Some(&job_id), 6)? > 0 {
            continue;
        }
        let sev = if c >= 10 {
            "FATAL"
        } else if c >= 8 {
            "CRITICAL"
        } else {
            "WARNING"
        };
        insert_workflow_alert_signal(
            conn,
            "JOB_FAILURE_THRESHOLD",
            sev,
            Some(&job_id),
            "Job failure count exceeded rolling threshold (24h)",
            &json!({ "failures24h": c }),
            Some("observability"),
        )?;
        emitted += 1;
    }

    let today_missed: i64 = conn
        .query_row(
            "SELECT COALESCE(missed_runs, 0) FROM daily_missed_job_metrics WHERE metric_date = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let yday_missed: i64 = conn
        .query_row(
            "SELECT COALESCE(missed_runs, 0) FROM daily_missed_job_metrics WHERE metric_date = date('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if today_missed >= 3 && today_missed >= yday_missed.saturating_mul(2).max(3) {
        if recent_signal_count(conn, "MISSED_JOB_SPIKE", None, 12)? == 0 {
            insert_workflow_alert_signal(
                conn,
                "MISSED_JOB_SPIKE",
                "WARNING",
                None,
                "Missed scheduled runs increased sharply vs prior day",
                &json!({ "todayMissed": today_missed, "yesterdayMissed": yday_missed }),
                Some("observability"),
            )?;
            emitted += 1;
        }
    }

    let pending_rec: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_missed_alerts WHERE status = 'PENDING'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if pending_rec >= 5 && recent_signal_count(conn, "SYSTEM_HEALTH_DEGRADED", None, 6)? == 0 {
        insert_workflow_alert_signal(
            conn,
            "SYSTEM_HEALTH_DEGRADED",
            if pending_rec >= 12 { "CRITICAL" } else { "WARNING" },
            None,
            "Elevated pending missed-job recovery backlog",
            &json!({ "pendingMissedAlerts": pending_rec }),
            Some("observability"),
        )?;
        emitted += 1;
    }

    let failed_jobs_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT') AND datetime(started_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if failed_jobs_24h >= 15 && recent_signal_count(conn, "GLOBAL_JOB_FAILURE_PRESSURE", None, 8)? == 0 {
        insert_workflow_alert_signal(
            conn,
            "GLOBAL_JOB_FAILURE_PRESSURE",
            "CRITICAL",
            None,
            "Aggregate job failures across all jobs exceeded platform threshold (24h)",
            &json!({ "failedOrTimeout24h": failed_jobs_24h }),
            Some("observability"),
        )?;
        emitted += 1;
    }

    Ok(emitted)
}

pub fn refresh_system_reliability_score(conn: &Connection) -> Result<(), String> {
    let days = 30i64;
    let cutoff = format!("-{days} days");
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE completed_at IS NOT NULL AND datetime(started_at) > datetime('now', ?1)
               AND status NOT IN ('MISSED','RUNNING')",
            params![&cutoff],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let succ: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE completed_at IS NOT NULL AND datetime(started_at) > datetime('now', ?1)
               AND status = 'SUCCESS'",
            params![&cutoff],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let fail: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE completed_at IS NOT NULL AND datetime(started_at) > datetime('now', ?1)
               AND status IN ('FAILED','TIMEOUT')",
            params![&cutoff],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let denom = total.max(1) as f64;
    let success_rate = succ as f64 / denom;
    let failure_rate = fail as f64 / denom;
    let rec_ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_recovery_log
             WHERE result = 'SUCCESS' AND datetime(recovery_time) > datetime('now', ?1)",
            params![&cutoff],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let rec_fail: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_recovery_log
             WHERE result = 'FAILED' AND datetime(recovery_time) > datetime('now', ?1)",
            params![&cutoff],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let rden = (rec_ok + rec_fail).max(1) as f64;
    let recovery_success_rate = rec_ok as f64 / rden;
    let score = (success_rate - failure_rate + recovery_success_rate * 0.5).clamp(-1.0, 1.0);
    let ts = now_ts();
    let factors = json!({
        "windowDays": days,
        "completedSamples": total,
        "successes": succ,
        "failures": fail,
        "recoverySuccess": rec_ok,
        "recoveryFailed": rec_fail,
    })
    .to_string();
    conn.execute(
        "INSERT INTO system_reliability_score (id, score, success_rate, failure_rate, recovery_success_rate, sample_window_days, updated_at, factors_json)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           score = excluded.score,
           success_rate = excluded.success_rate,
           failure_rate = excluded.failure_rate,
           recovery_success_rate = excluded.recovery_success_rate,
           sample_window_days = excluded.sample_window_days,
           updated_at = excluded.updated_at,
           factors_json = excluded.factors_json",
        params![
            score,
            success_rate,
            failure_rate,
            recovery_success_rate,
            days,
            &ts,
            &factors,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_system_metrics(conn: &Connection) -> Result<Value, String> {
    let row: (i64, i64, i64, i64, i64, i64, i64, String) = conn
        .query_row(
            "SELECT jobs_executed, jobs_failed, jobs_recovered, deployments_blocked, deployments_succeeded,
                    recovery_attempts, risk_evaluations, updated_at
             FROM workflow_runtime_metrics WHERE id = 1",
            [],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let failed_jobs_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT') AND datetime(started_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let pending_recovery: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_missed_alerts WHERE status = 'PENDING'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let alerts_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log WHERE datetime(created_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let (rel_score, rel_sr, rel_fr, rel_rr, rel_upd): (f64, f64, f64, f64, String) = conn
        .query_row(
            "SELECT score, success_rate, failure_rate, recovery_success_rate, updated_at FROM system_reliability_score WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .unwrap_or((1.0, 1.0, 0.0, 1.0, String::new()));

    let avg_job_ms: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(CAST(duration_ms AS REAL)), 0) FROM performance_timing_metrics
             WHERE category = 'job_execution' AND datetime(recorded_at) > datetime('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);

    Ok(json!({
        "jobs": {
            "executed": row.0,
            "failed": row.1,
            "recovered": row.2,
            "failedOrTimeout24hObserved": failed_jobs_24h,
            "avgExecutionDurationMs7d": avg_job_ms,
            "countersUpdatedAt": row.7,
        },
        "deployments": {
            "blocked": row.3,
            "succeeded": row.4,
        },
        "recovery": {
            "attempts": row.5,
            "pendingMissedAlerts": pending_recovery,
        },
        "system_health": {
            "reliabilityScore": rel_score,
            "successRate30d": rel_sr,
            "failureRate30d": rel_fr,
            "recoverySuccessRate30d": rel_rr,
            "reliabilityUpdatedAt": rel_upd,
            "alertSignals24h": alerts_24h,
        },
        "risk": {
            "evaluations": row.6,
        },
    }))
}

pub fn get_system_health(conn: &Connection) -> Result<Value, String> {
    let failed_jobs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT') AND datetime(started_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let pending_recovery: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_missed_alerts WHERE status = 'PENDING'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let crit_alerts_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE severity IN ('CRITICAL','FATAL') AND datetime(created_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let (risk_score_sample,): (f64,) = conn
        .query_row(
            "SELECT COALESCE(AVG(risk_score), 0) FROM deployment_risk_assessment
             WHERE datetime(assessed_at) > datetime('now', '-7 days')",
            [],
            |r| Ok((r.get(0)?,)),
        )
        .unwrap_or((0.0,));
    let risk_level = if risk_score_sample >= 75.0 {
        "CRITICAL"
    } else if risk_score_sample >= 50.0 {
        "HIGH"
    } else if risk_score_sample >= 25.0 {
        "MEDIUM"
    } else {
        "LOW"
    };
    let status = if failed_jobs >= 10 || pending_recovery >= 8 || crit_alerts_24h >= 5 {
        "DEGRADED"
    } else if failed_jobs >= 3 || pending_recovery >= 3 || crit_alerts_24h >= 1 {
        "ATTENTION"
    } else {
        "HEALTHY"
    };
    Ok(json!({
        "status": status,
        "failed_jobs": failed_jobs,
        "pending_recovery": pending_recovery,
        "risk_level": risk_level,
        "criticalSignals24h": crit_alerts_24h,
    }))
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

pub fn export_metrics_snapshot_csv(conn: &Connection) -> Result<String, String> {
    let mut out = String::from("section,key,value\n");
    let m = get_system_metrics(conn)?;
    if let Some(jobs) = m.get("jobs") {
        if let Some(obj) = jobs.as_object() {
            for (k, v) in obj {
                out.push_str(&format!(
                    "jobs,{},{}\n",
                    csv_escape(k),
                    csv_escape(&v.to_string())
                ));
            }
        }
    }
    if let Some(dep) = m.get("deployments") {
        if let Some(obj) = dep.as_object() {
            for (k, v) in obj {
                out.push_str(&format!(
                    "deployments,{},{}\n",
                    csv_escape(k),
                    csv_escape(&v.to_string())
                ));
            }
        }
    }
    if let Some(rec) = m.get("recovery") {
        if let Some(obj) = rec.as_object() {
            for (k, v) in obj {
                out.push_str(&format!(
                    "recovery,{},{}\n",
                    csv_escape(k),
                    csv_escape(&v.to_string())
                ));
            }
        }
    }
    if let Some(sh) = m.get("system_health") {
        if let Some(obj) = sh.as_object() {
            for (k, v) in obj {
                out.push_str(&format!(
                    "system_health,{},{}\n",
                    csv_escape(k),
                    csv_escape(&v.to_string())
                ));
            }
        }
    }

    out.push_str("\nperformance_timing_recent\n");
    out.push_str("id,category,entity_id,duration_ms,recorded_at,details_json\n");
    let mut stmt = conn
        .prepare(
            "SELECT id, category, COALESCE(entity_id,''), duration_ms, recorded_at, details_json
             FROM performance_timing_metrics ORDER BY datetime(recorded_at) DESC LIMIT 500",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (a, b, c, d, e, f) = row.map_err(|e| e.to_string())?;
        out.push_str(&format!(
            "{},{},{},{},{},{}\n",
            csv_escape(&a),
            csv_escape(&b),
            csv_escape(&c),
            d,
            csv_escape(&e),
            csv_escape(&f),
        ));
    }

    out.push_str("\nrecovery_stats_30d\n");
    let rec_ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_recovery_log WHERE result = 'SUCCESS' AND datetime(recovery_time) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let rec_fail: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_recovery_log WHERE result = 'FAILED' AND datetime(recovery_time) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    out.push_str(&format!("recovery_success_30d,{}\n", rec_ok));
    out.push_str(&format!("recovery_failed_30d,{}\n", rec_fail));

    Ok(out)
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
        Err("production observability: insufficient role".into())
    }
}

fn require_admin(role: &str) -> Result<(), String> {
    let n = normalize_role(role);
    if n.contains("admin") {
        Ok(())
    } else {
        Err("production observability: admin role required".into())
    }
}

pub fn simulate_alert_event(
    conn: &Connection,
    scenario: &str,
    caller_role: &str,
) -> Result<Value, String> {
    require_admin(caller_role)?;
    let sc = scenario.trim().to_uppercase();
    match sc.as_str() {
        "JOB_FAILURE" => {
            insert_workflow_alert_signal(
                conn,
                "SIMULATED_JOB_FAILURE",
                "WARNING",
                Some("simulation"),
                "Simulated job failure signal",
                &json!({ "scenario": scenario }),
                Some("simulation"),
            )?;
            let _ = log_structured_event(
                conn,
                "workflow_production_observability",
                "simulate_alert_event",
                Some("simulation"),
                "INFO",
                &json!({ "scenario": "JOB_FAILURE" }),
            );
        }
        "DEPLOYMENT_BLOCK" => {
            insert_workflow_alert_signal(
                conn,
                "SIMULATED_DEPLOYMENT_BLOCK",
                "CRITICAL",
                Some("simulation"),
                "Simulated deployment safety block",
                &json!({ "scenario": scenario }),
                Some("simulation"),
            )?;
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::DeploymentsBlocked, 1);
            let _ = log_structured_event(
                conn,
                "workflow_production_observability",
                "simulate_alert_event",
                Some("simulation"),
                "INFO",
                &json!({ "scenario": "DEPLOYMENT_BLOCK" }),
            );
        }
        "RECOVERY_FAILURE" => {
            insert_workflow_alert_signal(
                conn,
                "SIMULATED_RECOVERY_FAILURE",
                "CRITICAL",
                Some("simulation"),
                "Simulated missed-job recovery failure",
                &json!({ "scenario": scenario }),
                Some("simulation"),
            )?;
            let _ = log_structured_event(
                conn,
                "workflow_production_observability",
                "simulate_alert_event",
                Some("simulation"),
                "INFO",
                &json!({ "scenario": "RECOVERY_FAILURE" }),
            );
        }
        _ => {
            return Err("unknown scenario: use JOB_FAILURE, DEPLOYMENT_BLOCK, or RECOVERY_FAILURE".into());
        }
    }
    Ok(json!({ "ok": true, "scenario": scenario }))
}

// --- Tauri ---

#[tauri::command]
pub fn get_system_metrics_command(caller_role: String, state: State<DbState>) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_system_metrics(&conn)
}

#[tauri::command]
pub fn get_system_health_command(caller_role: String, state: State<DbState>) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_system_health(&conn)
}

#[tauri::command]
pub fn list_workflow_alert_signal_log_command(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).clamp(1, 500);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, created_at, signal_type, severity, entity_id, message, details_json
             FROM workflow_alert_signal_log ORDER BY datetime(created_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "createdAt": r.get::<_, String>(1)?,
                "signalType": r.get::<_, String>(2)?,
                "severity": r.get::<_, String>(3)?,
                "entityId": r.get::<_, Option<String>>(4)?,
                "message": r.get::<_, String>(5)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(6)?).unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_workflow_alert_signal_dashboard_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, created_at, signal_type, severity, entity_id, message, details_json
             FROM workflow_alert_signal_log ORDER BY datetime(created_at) DESC LIMIT 80",
        )
        .map_err(|e| e.to_string())?;
    let recent: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "createdAt": r.get::<_, String>(1)?,
                "signalType": r.get::<_, String>(2)?,
                "severity": r.get::<_, String>(3)?,
                "entityId": r.get::<_, Option<String>>(4)?,
                "message": r.get::<_, String>(5)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(6)?).unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt2 = conn
        .prepare(
            "SELECT severity, COUNT(*) FROM workflow_alert_signal_log
             WHERE datetime(created_at) > datetime('now', '-14 days')
             GROUP BY severity",
        )
        .map_err(|e| e.to_string())?;
    let sev_dist: Vec<Value> = stmt2
        .query_map([], |r| {
            Ok(json!({
                "severity": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt_fc = conn
        .prepare(
            "SELECT job_id, COALESCE(error_message,''), COUNT(*) AS c
             FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT') AND datetime(started_at) > datetime('now', '-7 days')
             GROUP BY job_id, error_message ORDER BY c DESC LIMIT 24",
        )
        .map_err(|e| e.to_string())?;
    let failure_clusters: Vec<Value> = stmt_fc
        .query_map([], |r| {
            Ok(json!({
                "jobId": r.get::<_, String>(0)?,
                "errorMessage": r.get::<_, String>(1)?,
                "count": r.get::<_, i64>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt3 = conn
        .prepare(
            "SELECT date(created_at) AS d, COUNT(*) FROM workflow_alert_signal_log
             WHERE datetime(created_at) > datetime('now', '-14 days')
             GROUP BY date(created_at) ORDER BY d ASC",
        )
        .map_err(|e| e.to_string())?;
    let trends: Vec<Value> = stmt3
        .query_map([], |r| {
            Ok(json!({
                "day": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "recentSignals": recent,
        "severityDistribution14d": sev_dist,
        "failureClusters": failure_clusters,
        "alertTrends14d": trends,
    }))
}

#[tauri::command]
pub fn simulate_alert_event_command(
    scenario: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    simulate_alert_event(&conn, scenario.trim(), &caller_role)
}

#[tauri::command]
pub fn export_metrics_snapshot_csv_command(caller_role: String, state: State<DbState>) -> Result<String, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    export_metrics_snapshot_csv(&conn)
}
