//! Background job execution tracking, retries, performance, alerts, and reliability scores.

use crate::commands::dashboard_cache::{
    run_dashboard_activity_retention_cleanup, run_kpi_snapshot_retention_cleanup,
};
use crate::commands::workflow_production_observability::{
    bump_workflow_runtime_metric, insert_workflow_alert_signal, log_structured_event,
    record_performance_timing, refresh_system_reliability_score, scan_and_emit_threshold_alert_signals,
    RuntimeMetricDelta,
};
use crate::commands::workflow_automation::compute_daily_automation_economics_index;
use crate::db::DbState;
use chrono::{Duration as ChronoDuration, NaiveDateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::time::Instant;
use tauri::State;
use uuid::Uuid;

fn now_ts() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
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
        Err("workflow job monitoring: insufficient role".into())
    }
}

fn require_mutate(role: &str) -> Result<(), String> {
    let n = normalize_role(role);
    if n.contains("admin") || n.contains("automationmanager") {
        Ok(())
    } else {
        Err("workflow job monitoring: modify requires admin or automation manager".into())
    }
}

fn require_admin(role: &str) -> Result<(), String> {
    let n = normalize_role(role);
    if n.contains("admin") {
        Ok(())
    } else {
        Err("workflow job monitoring: this action requires admin".into())
    }
}

fn job_row(conn: &Connection, job_id: &str) -> Result<(i64, i64, i64), String> {
    conn.query_row(
        "SELECT expected_duration_ms, max_retries, retry_delay_sec FROM workflow_background_jobs WHERE job_id = ?1",
        params![job_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .map_err(|_| format!("unknown job_id: {job_id}"))
}

pub fn is_job_enabled(conn: &Connection, job_id: &str) -> Result<bool, String> {
    let v: i64 = conn
        .query_row(
            "SELECT is_enabled FROM workflow_background_jobs WHERE job_id = ?1",
            params![job_id],
            |r| r.get(0),
        )
        .map_err(|_| format!("unknown job_id: {job_id}"))?;
    Ok(v != 0)
}

fn log_manual_override(
    conn: &Connection,
    job_id: &str,
    action: &str,
    reason: Option<&str>,
    caller_role: &str,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_job_manual_override_log (id, job_id, action, reason, caller_role, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![&id, job_id, action, reason, caller_role, &ts],
    )
    .map_err(|e| e.to_string())?;
    let _ = log_job_alert(
        conn,
        Some(job_id),
        None,
        "INFO",
        "manual_override_event",
        &json!({ "action": action, "reason": reason, "callerRole": caller_role }),
    );
    Ok(())
}

pub fn start_job_execution(conn: &Connection, job_id: &str, retry_count: i64) -> Result<String, String> {
    let ex = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, completed_at, status, records_processed, error_message, execution_time_ms, retry_count)
         VALUES (?1, ?2, ?3, NULL, 'RUNNING', 0, NULL, NULL, ?4)",
        params![&ex, job_id, &ts, retry_count],
    )
    .map_err(|e| e.to_string())?;
    Ok(ex)
}

pub fn complete_job_execution(
    conn: &Connection,
    execution_id: &str,
    status: &str,
    records_processed: i64,
    error_message: Option<&str>,
    execution_time_ms: i64,
    retry_count: i64,
) -> Result<(), String> {
    let ts = now_ts();
    conn.execute(
        "UPDATE workflow_job_execution_log SET completed_at = ?1, status = ?2, records_processed = ?3, error_message = ?4, execution_time_ms = ?5, retry_count = ?6
         WHERE execution_id = ?7",
        params![
            &ts,
            status,
            records_processed,
            error_message,
            execution_time_ms,
            retry_count,
            execution_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn log_job_alert(
    conn: &Connection,
    job_id: Option<&str>,
    execution_id: Option<&str>,
    level: &str,
    message: &str,
    details: &Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_job_alert_log (id, job_id, execution_id, alert_level, message, created_at, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &id,
            job_id,
            execution_id,
            level,
            message,
            &ts,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn log_failure_alert(conn: &Connection, job_id: &str, alert_type: &str, details: &Value) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_job_failure_alerts (alert_id, job_id, detected_at, alert_type, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![&id, job_id, &ts, alert_type, &details.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_performance_and_reliability(conn: &Connection, job_id: &str) -> Result<(), String> {
    let (avg_ms, max_ms, rec_sum, fails, retries, samples): (f64, f64, i64, i64, i64, i64) = conn
        .query_row(
            "SELECT
               COALESCE(AVG(CAST(execution_time_ms AS REAL)), 0),
               COALESCE(MAX(execution_time_ms), 0),
               COALESCE(SUM(records_processed), 0),
               SUM(CASE WHEN status = 'FAILED' OR status = 'TIMEOUT' THEN 1 ELSE 0 END),
               SUM(CASE WHEN status = 'RETRY' THEN 1 ELSE 0 END),
               COUNT(*)
             FROM workflow_job_execution_log
             WHERE job_id = ?1 AND datetime(started_at) > datetime('now', '-30 days')
               AND completed_at IS NOT NULL",
            params![job_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )
        .unwrap_or((0.0, 0.0, 0, 0, 0, 0));
    let samples_f = samples.max(1) as f64;
    let fail_rate = fails as f64 / samples_f;
    let retry_rate = retries as f64 / samples_f;
    let mid = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_job_performance_metrics (id, job_id, window_label, avg_execution_ms, max_execution_ms, records_processed_total, failure_rate, retry_rate, samples, updated_at)
         VALUES (?1, ?2, '30d', ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(job_id, window_label) DO UPDATE SET
           avg_execution_ms = excluded.avg_execution_ms,
           max_execution_ms = excluded.max_execution_ms,
           records_processed_total = excluded.records_processed_total,
           failure_rate = excluded.failure_rate,
           retry_rate = excluded.retry_rate,
           samples = excluded.samples,
           updated_at = excluded.updated_at",
        params![
            &mid,
            job_id,
            avg_ms,
            max_ms,
            rec_sum,
            fail_rate,
            retry_rate,
            samples,
            &ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    let succ: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE job_id = ?1 AND status = 'SUCCESS' AND datetime(started_at) > datetime('now', '-30 days')",
            params![job_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let success_rate = succ as f64 / samples_f;
    let score = (success_rate - fail_rate - retry_rate * 0.5).clamp(-1.0, 1.0);
    conn.execute(
        "INSERT INTO workflow_job_reliability_score (job_id, score, success_rate, failure_rate, retry_frequency, sample_executions, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(job_id) DO UPDATE SET
           score = excluded.score,
           success_rate = excluded.success_rate,
           failure_rate = excluded.failure_rate,
           retry_frequency = excluded.retry_frequency,
           sample_executions = excluded.sample_executions,
           updated_at = excluded.updated_at",
        params![
            job_id,
            score,
            success_rate,
            fail_rate,
            retry_rate,
            samples,
            &ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_schedule_anchor(s: &str) -> Result<chrono::DateTime<Utc>, String> {
    NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%d %H:%M:%S")
        .map(|n| n.and_utc())
        .map_err(|e| e.to_string())
}

fn advance_schedule_expectation_if_tracked(conn: &Connection, job_id: &str) -> Result<(), String> {
    let ts = now_ts();
    conn.execute(
        "UPDATE workflow_job_schedule_expectations SET last_expected_run_at = ?1, updated_at = ?1 WHERE job_id = ?2",
        params![&ts, job_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// When a scheduled run succeeds, close any `PENDING` missed alerts for that job (natural recovery).
fn resolve_pending_missed_for_success(conn: &Connection, job_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE workflow_job_missed_alerts SET status = 'RECOVERED', recovery_triggered = 1
         WHERE job_id = ?1 AND status = 'PENDING'",
        params![job_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_daily_missed_metrics(
    conn: &Connection,
    missed_delta: i64,
    recovery_ok_delta: i64,
    recovery_fail_delta: i64,
    drift_delta: i64,
) -> Result<(), String> {
    let d = Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO daily_missed_job_metrics (metric_date, missed_runs, recovery_success, recovery_failures, drift_warnings, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(metric_date) DO UPDATE SET
           missed_runs = missed_runs + excluded.missed_runs,
           recovery_success = recovery_success + excluded.recovery_success,
           recovery_failures = recovery_failures + excluded.recovery_failures,
           drift_warnings = drift_warnings + excluded.drift_warnings,
           updated_at = excluded.updated_at",
        params![d, missed_delta, recovery_ok_delta, recovery_fail_delta, drift_delta, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Core job body used by retry/recovery paths (no execution log wrapper).
pub fn run_job_payload(conn: &Connection, job_id: &str) -> Result<i64, String> {
    match job_id {
        "automation_cycle" => crate::commands::workflow_automation::run_workflow_automation_cycle(conn).map(|_| 1i64),
        "cost_metrics_aggregation" => compute_daily_automation_economics_index(conn).map(|_| 1i64),
        "observability_update" => {
            let n = crate::commands::exception_reliability::validate_exception_integrity(conn).unwrap_or(0);
            crate::commands::workflow_observability::complete_daily_observability(conn, n).map(|_| 1i64)
        }
        "maintenance_cleanup" => {
            let mut n = 0i64;
            n += run_kpi_snapshot_retention_cleanup(conn).unwrap_or(0);
            n += run_dashboard_activity_retention_cleanup(conn).unwrap_or(0);
            n += crate::commands::exception_workflow::run_exception_retention_cleanup(conn).unwrap_or(0);
            let v = crate::commands::exception_reliability::run_daily_exception_workflow_maintenance(conn)?;
            Ok(n + v)
        }
        "deployment_safety_checks" => {
            let rejected: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM workflow_environment_deployment_log
                     WHERE upper(trim(status)) = 'REJECTED_SAFETY'
                       AND datetime(timestamp) > datetime('now', '-1 day')",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            Ok(rejected)
        }
        "risk_evaluation" => {
            let mut stmt = conn
                .prepare("SELECT job_id FROM workflow_background_jobs")
                .map_err(|e| e.to_string())?;
            let ids = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            let mut k = 0i64;
            for id in ids {
                let jid: String = id.map_err(|e| e.to_string())?;
                let _ = refresh_performance_and_reliability(conn, &jid);
                k += 1;
            }
            Ok(k)
        }
        _ => Err(format!("job payload not implemented for job_id: {job_id}")),
    }
}

/// Detect overdue schedule slots with no covering run; inserts `MISSED` execution + missed alert.
pub fn detect_missed_job_runs(conn: &Connection) -> Result<i64, String> {
    let mut created = 0i64;
    let mut stmt = conn
        .prepare(
            "SELECT e.job_id, e.expected_interval_minutes, e.grace_period_minutes, e.last_expected_run_at
             FROM workflow_job_schedule_expectations e
             JOIN workflow_background_jobs j ON j.job_id = e.job_id AND j.is_enabled = 1",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, i64, i64, String)> = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (job_id, interval_min, grace_min, anchor_str) in rows {
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_missed_alerts WHERE job_id = ?1 AND status = 'PENDING'",
                params![&job_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if pending > 0 {
            continue;
        }
        let running: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log
                 WHERE job_id = ?1 AND status = 'RUNNING' AND datetime(started_at) > datetime(?2)",
                params![&job_id, &anchor_str],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if running > 0 {
            continue;
        }
        let max_success: Option<String> = conn
            .query_row(
                "SELECT MAX(started_at) FROM workflow_job_execution_log
                 WHERE job_id = ?1 AND status = 'SUCCESS' AND datetime(started_at) > datetime(?2)",
                params![&job_id, &anchor_str],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        if let Some(ref mx) = max_success {
            conn.execute(
                "UPDATE workflow_job_schedule_expectations SET last_expected_run_at = ?1, updated_at = ?1 WHERE job_id = ?2",
                params![mx, &job_id],
            )
            .map_err(|e| e.to_string())?;
            continue;
        }
        let anchor = parse_schedule_anchor(&anchor_str)?;
        let grace_end = anchor + ChronoDuration::minutes(interval_min) + ChronoDuration::minutes(grace_min);
        if Utc::now() <= grace_end {
            continue;
        }
        let expected_time = (anchor + ChronoDuration::minutes(interval_min))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let detected = now_ts();
        let ex_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, completed_at, status, records_processed, error_message, execution_time_ms, retry_count)
             VALUES (?1, ?2, ?3, ?4, 'MISSED', 0, ?5, 0, 0)",
            params![
                &ex_id,
                &job_id,
                &expected_time,
                &detected,
                "No successful execution before deadline + grace"
            ],
        )
        .map_err(|e| e.to_string())?;
        let alert_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_job_missed_alerts (alert_id, job_id, expected_time, detected_time, recovery_triggered, status)
             VALUES (?1, ?2, ?3, ?4, 0, 'PENDING')",
            params![&alert_id, &job_id, &expected_time, &detected],
        )
        .map_err(|e| e.to_string())?;
        let _ = log_job_alert(
            conn,
            Some(&job_id),
            Some(&ex_id),
            "WARN",
            "Scheduled job run missed",
            &json!({ "expectedTime": expected_time, "alertId": alert_id }),
        );
        let _ = insert_workflow_alert_signal(
            conn,
            "MISSED_SCHEDULE",
            "WARNING",
            Some(&job_id),
            "Scheduled job run missed",
            &json!({ "expectedTime": &expected_time, "alertId": &alert_id }),
            Some("job_monitor"),
        );
        let _ = log_structured_event(
            conn,
            "workflow_job_monitoring",
            "missed_schedule_detected",
            Some(&job_id),
            "WARNING",
            &json!({ "expectedTime": &expected_time, "alertId": &alert_id }),
        );
        let _ = bump_daily_missed_metrics(conn, 1, 0, 0, 0);
        created += 1;
    }
    Ok(created)
}

fn recovery_attempts_24h(conn: &Connection, job_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM workflow_job_recovery_log
         WHERE job_id = ?1 AND datetime(recovery_time) > datetime('now', '-1 day')",
        params![job_id],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

fn last_recovery_for_alert(conn: &Connection, alert_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT recovery_time FROM workflow_job_recovery_log WHERE alert_id = ?1 ORDER BY datetime(recovery_time) DESC LIMIT 1",
        params![alert_id],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn next_attempt_count(conn: &Connection, alert_id: &str) -> i64 {
    conn.query_row(
        "SELECT COALESCE(MAX(attempt_count), 0) + 1 FROM workflow_job_recovery_log WHERE alert_id = ?1",
        params![alert_id],
        |r| r.get(0),
    )
    .unwrap_or(1)
}

fn refresh_job_recovery_score(conn: &Connection, job_id: &str) -> Result<(), String> {
    let missed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_missed_alerts
             WHERE job_id = ?1 AND datetime(detected_time) > datetime('now', '-30 days')",
            params![job_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let recovered: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_missed_alerts
             WHERE job_id = ?1 AND status = 'RECOVERED' AND datetime(detected_time) > datetime('now', '-30 days')",
            params![job_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let score = (recovered as f64) / (missed.max(1) as f64);
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_job_recovery_score (job_id, score, missed_jobs, recovered_jobs, window_days, updated_at)
         VALUES (?1, ?2, ?3, ?4, 30, ?5)
         ON CONFLICT(job_id) DO UPDATE SET
           score = excluded.score,
           missed_jobs = excluded.missed_jobs,
           recovered_jobs = excluded.recovered_jobs,
           updated_at = excluded.updated_at",
        params![job_id, score, missed, recovered, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_all_job_recovery_scores(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT job_id FROM workflow_job_schedule_expectations")
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for jid in ids {
        let _ = refresh_job_recovery_score(conn, &jid);
    }
    Ok(())
}

/// Run missed job for a `PENDING` alert (latest for `job_id` when `alert_id` is None).
/// When `bypass_recovery_delay` is true (manual operator), the inter-attempt delay is skipped.
pub fn recover_missed_job(
    conn: &Connection,
    job_id: &str,
    alert_id_opt: Option<&str>,
    bypass_recovery_delay: bool,
) -> Result<String, String> {
    let (max_recovery, delay_sec): (i64, i64) = conn
        .query_row(
            "SELECT max_recovery_attempts, recovery_delay_sec FROM workflow_job_schedule_expectations WHERE job_id = ?1",
            params![job_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "job has no schedule expectations row".to_string())?;

    let alert_id: String = if let Some(a) = alert_id_opt.filter(|s| !s.is_empty()) {
        a.to_string()
    } else {
        conn.query_row(
            "SELECT alert_id FROM workflow_job_missed_alerts WHERE job_id = ?1 AND status = 'PENDING' ORDER BY datetime(detected_time) ASC LIMIT 1",
            params![job_id],
            |r| r.get(0),
        )
        .map_err(|_| "no pending missed alert for this job".to_string())?
    };

    let attempts = recovery_attempts_24h(conn, job_id)?;
    if attempts >= max_recovery {
        let ts = now_ts();
        conn.execute(
            "UPDATE workflow_background_jobs SET is_enabled = 0, updated_at = ?1 WHERE job_id = ?2",
            params![&ts, job_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE workflow_job_missed_alerts SET status = 'GUARD_DISABLED', recovery_triggered = 1 WHERE alert_id = ?1",
            params![&alert_id],
        )
        .map_err(|e| e.to_string())?;
        let rid = Uuid::new_v4().to_string();
        let ac = next_attempt_count(conn, &alert_id);
        conn.execute(
            "INSERT INTO workflow_job_recovery_log (recovery_id, job_id, alert_id, recovery_time, result, attempt_count, error_message)
             VALUES (?1, ?2, ?3, ?4, 'GUARD_STOP', ?5, ?6)",
            params![
                rid,
                job_id,
                &alert_id,
                ts,
                ac,
                "recovery attempts exceeded threshold (24h); job disabled"
            ],
        )
        .map_err(|e| e.to_string())?;
        let _ = log_job_alert(
            conn,
            Some(job_id),
            None,
            "CRITICAL",
            "Job recovery guard: job disabled after repeated recovery attempts",
            &json!({ "alertId": alert_id, "attempts24h": attempts }),
        );
        let _ = insert_workflow_alert_signal(
            conn,
            "RECOVERY_GUARD_STOP",
            "FATAL",
            Some(job_id),
            "Recovery attempts exceeded threshold; job disabled",
            &json!({ "alertId": &alert_id, "attempts24h": attempts }),
            Some("recovery"),
        );
        let _ = log_structured_event(
            conn,
            "recovery_engine",
            "recovery_guard_stop",
            Some(job_id),
            "FATAL",
            &json!({ "alertId": &alert_id, "attempts24h": attempts }),
        );
        let _ = bump_daily_missed_metrics(conn, 0, 0, 1, 0);
        return Err("recovery guard: exceeded max recovery attempts; job disabled".into());
    }

    if !bypass_recovery_delay {
        if let Some(last_ts) = last_recovery_for_alert(conn, &alert_id)? {
            let last = parse_schedule_anchor(&last_ts)?;
            if Utc::now().signed_duration_since(last) < ChronoDuration::seconds(delay_sec) {
                return Err("recovery delay not elapsed for this alert".into());
            }
        }
    }

    let attempt_n = next_attempt_count(conn, &alert_id);
    let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::RecoveryAttempts, 1);
    let _ = log_structured_event(
        conn,
        "recovery_engine",
        "recovery_attempt_started",
        Some(job_id),
        "INFO",
        &json!({ "alertId": &alert_id, "attempt": attempt_n }),
    );
    let recovery_clock = Instant::now();
    let run_result = run_instrumented_job(conn, job_id, |c| run_job_payload(c, job_id));
    let recovery_ms = recovery_clock.elapsed().as_millis() as i64;
    let _ = record_performance_timing(
        conn,
        "recovery",
        Some(job_id),
        recovery_ms,
        &json!({ "alertId": &alert_id, "attempt": attempt_n, "ok": run_result.is_ok() }),
    );

    let rid = Uuid::new_v4().to_string();
    let ts = now_ts();
    match run_result {
        Ok(()) => {
            conn.execute(
                "UPDATE workflow_job_missed_alerts SET status = 'RECOVERED', recovery_triggered = 1 WHERE alert_id = ?1",
                params![&alert_id],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO workflow_job_recovery_log (recovery_id, job_id, alert_id, recovery_time, result, attempt_count, error_message)
                 VALUES (?1, ?2, ?3, ?4, 'SUCCESS', ?5, NULL)",
                params![rid, job_id, &alert_id, ts, attempt_n],
            )
            .map_err(|e| e.to_string())?;
            let _ = bump_daily_missed_metrics(conn, 0, 1, 0, 0);
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsRecovered, 1);
            let _ = log_structured_event(
                conn,
                "recovery_engine",
                "recovery_succeeded",
                Some(job_id),
                "INFO",
                &json!({ "alertId": &alert_id, "durationMs": recovery_ms }),
            );
            let _ = refresh_job_recovery_score(conn, job_id);
            let _ = crate::commands::workflow_incident_management::record_recovery_healing(
                conn,
                job_id,
                &json!({
                    "alertId": &alert_id,
                    "recoveryId": &rid,
                    "durationMs": recovery_ms,
                    "result": "SUCCESS",
                }),
            );
            Ok(format!("recovered alert {alert_id}"))
        }
        Err(e) => {
            let em = e.clone();
            conn.execute(
                "INSERT INTO workflow_job_recovery_log (recovery_id, job_id, alert_id, recovery_time, result, attempt_count, error_message)
                 VALUES (?1, ?2, ?3, ?4, 'FAILED', ?5, ?6)",
                params![rid, job_id, &alert_id, ts, attempt_n, em],
            )
            .map_err(|e| e.to_string())?;
            let _ = bump_daily_missed_metrics(conn, 0, 0, 1, 0);
            let _ = insert_workflow_alert_signal(
                conn,
                "RECOVERY_FAILURE",
                "CRITICAL",
                Some(job_id),
                "Missed-job recovery attempt failed",
                &json!({ "alertId": &alert_id, "error": &e, "durationMs": recovery_ms }),
                Some("recovery"),
            );
            let _ = log_structured_event(
                conn,
                "recovery_engine",
                "recovery_failed",
                Some(job_id),
                "CRITICAL",
                &json!({ "alertId": &alert_id, "error": &e, "durationMs": recovery_ms }),
            );
            Err(e)
        }
    }
}

/// Auto-recover up to a few pending missed alerts (respects delay between attempts).
pub fn recover_missed_jobs_auto(conn: &Connection) -> Result<i64, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.alert_id, a.job_id FROM workflow_job_missed_alerts a
             JOIN workflow_background_jobs j ON j.job_id = a.job_id AND j.is_enabled = 1
             WHERE a.status = 'PENDING' ORDER BY datetime(a.detected_time) ASC LIMIT 5",
        )
        .map_err(|e| e.to_string())?;
    let pairs: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut n = 0i64;
    for (alert_id, job_id) in pairs {
        if recover_missed_job(conn, &job_id, Some(&alert_id), false).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}

/// Compare recent SUCCESS spacing vs expected interval; emit `DRIFT_WARNING` when deviation grows.
pub fn detect_schedule_drift(conn: &Connection) -> Result<i64, String> {
    let mut warnings = 0i64;
    let mut stmt = conn
        .prepare("SELECT job_id, expected_interval_minutes, grace_period_minutes FROM workflow_job_schedule_expectations")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, i64, i64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (job_id, expected_min, grace_min) in rows {
        let mut s = conn
            .prepare(
                "SELECT started_at FROM workflow_job_execution_log
                 WHERE job_id = ?1 AND status = 'SUCCESS' AND datetime(started_at) > datetime('now', '-30 days')
                 ORDER BY datetime(started_at) ASC LIMIT 12",
            )
            .map_err(|e| e.to_string())?;
        let times: Vec<String> = s
            .query_map(params![&job_id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if times.len() < 3 {
            continue;
        }
        let mut gaps_min: Vec<f64> = Vec::new();
        for w in times.windows(2) {
            let a = parse_schedule_anchor(&w[0]).ok();
            let b = parse_schedule_anchor(&w[1]).ok();
            if let (Some(aa), Some(bb)) = (a, b) {
                let mins = (bb - aa).num_seconds() as f64 / 60.0;
                if mins > 0.0 {
                    gaps_min.push(mins);
                }
            }
        }
        if gaps_min.is_empty() {
            continue;
        }
        let avg = gaps_min.iter().sum::<f64>() / gaps_min.len() as f64;
        let dev = (avg - expected_min as f64).abs();
        let threshold = f64::max(grace_min as f64, 0.25 * expected_min as f64);
        if dev <= threshold {
            continue;
        }
        let dup: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_alert_log
                 WHERE job_id = ?1 AND message = 'DRIFT_WARNING' AND date(created_at) = date('now')",
                params![&job_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if dup > 0 {
            continue;
        }
        let _ = log_job_alert(
            conn,
            Some(&job_id),
            None,
            "WARN",
            "DRIFT_WARNING",
            &json!({
                "expectedIntervalMinutes": expected_min,
                "avgGapMinutes": avg,
                "deviationMinutes": dev,
            }),
        );
        let _ = bump_daily_missed_metrics(conn, 0, 0, 0, 1);
        warnings += 1;
    }
    Ok(warnings)
}

/// Run `f` with execution log + performance refresh. `f` returns (records_processed, ok_summary).
pub fn run_instrumented_job<F>(
    conn: &Connection,
    job_id: &str,
    f: F,
) -> Result<(), String>
where
    F: FnOnce(&Connection) -> Result<i64, String>,
{
    let (expected_ms, _, _) = job_row(conn, job_id).unwrap_or((120_000, 3, 120));
    let ex = start_job_execution(conn, job_id, 0)?;
    let clock = Instant::now();
    let res = f(conn);
    let ms = clock.elapsed().as_millis() as i64;
    match res {
        Ok(records) => {
            let status = if ms > expected_ms * 2 {
                "TIMEOUT"
            } else {
                "SUCCESS"
            };
            complete_job_execution(conn, &ex, status, records, None, ms, 0)?;
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsExecuted, 1);
            if status == "TIMEOUT" {
                let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsFailed, 1);
            }
            let _ = record_performance_timing(
                conn,
                "job_execution",
                Some(job_id),
                ms,
                &json!({ "executionId": &ex, "status": status, "records": records }),
            );
            let _ = log_structured_event(
                conn,
                "workflow_job_monitoring",
                "job_execution_completed",
                Some(job_id),
                if status == "TIMEOUT" { "WARNING" } else { "INFO" },
                &json!({ "executionId": &ex, "status": status, "durationMs": ms, "records": records }),
            );
            if status == "TIMEOUT" {
                let _ = log_job_alert(
                    conn,
                    Some(job_id),
                    Some(&ex),
                    "WARN",
                    "Job exceeded expected duration threshold",
                    &json!({ "expectedMs": expected_ms, "actualMs": ms }),
                );
            } else if status == "SUCCESS" {
                let _ = advance_schedule_expectation_if_tracked(conn, job_id);
                let _ = resolve_pending_missed_for_success(conn, job_id);
            }
            let _ = refresh_performance_and_reliability(conn, job_id);
            Ok(())
        }
        Err(e) => {
            complete_job_execution(conn, &ex, "FAILED", 0, Some(&e), ms, 0)?;
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsExecuted, 1);
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsFailed, 1);
            let _ = record_performance_timing(
                conn,
                "job_execution",
                Some(job_id),
                ms,
                &json!({ "executionId": &ex, "status": "FAILED" }),
            );
            let _ = log_structured_event(
                conn,
                "workflow_job_monitoring",
                "job_execution_failed",
                Some(job_id),
                "CRITICAL",
                &json!({ "executionId": &ex, "durationMs": ms, "error": &e }),
            );
            let _ = log_job_alert(
                conn,
                Some(job_id),
                Some(&ex),
                "ERROR",
                "Job execution failed",
                &json!({ "error": e }),
            );
            let _ = refresh_performance_and_reliability(conn, job_id);
            Err(e)
        }
    }
}

/// Like `run_instrumented_job` but returns `T` from a successful `(records, T)` pair.
pub fn run_instrumented_job_with_output<T, F>(
    conn: &Connection,
    job_id: &str,
    f: F,
) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<(i64, T), String>,
{
    let (expected_ms, _, _) = job_row(conn, job_id).unwrap_or((120_000, 3, 120));
    let ex = start_job_execution(conn, job_id, 0)?;
    let clock = Instant::now();
    let res = f(conn);
    let ms = clock.elapsed().as_millis() as i64;
    match res {
        Ok((records, out)) => {
            let status = if ms > expected_ms * 2 {
                "TIMEOUT"
            } else {
                "SUCCESS"
            };
            complete_job_execution(conn, &ex, status, records, None, ms, 0)?;
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsExecuted, 1);
            if status == "TIMEOUT" {
                let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsFailed, 1);
            }
            let _ = record_performance_timing(
                conn,
                "job_execution",
                Some(job_id),
                ms,
                &json!({ "executionId": &ex, "status": status, "records": records }),
            );
            let _ = log_structured_event(
                conn,
                "workflow_job_monitoring",
                "job_execution_completed",
                Some(job_id),
                if status == "TIMEOUT" { "WARNING" } else { "INFO" },
                &json!({ "executionId": &ex, "status": status, "durationMs": ms, "records": records }),
            );
            if status == "TIMEOUT" {
                let _ = log_job_alert(
                    conn,
                    Some(job_id),
                    Some(&ex),
                    "WARN",
                    "Job exceeded expected duration threshold",
                    &json!({ "expectedMs": expected_ms, "actualMs": ms }),
                );
            } else if status == "SUCCESS" {
                let _ = advance_schedule_expectation_if_tracked(conn, job_id);
                let _ = resolve_pending_missed_for_success(conn, job_id);
            }
            let _ = refresh_performance_and_reliability(conn, job_id);
            Ok(out)
        }
        Err(e) => {
            complete_job_execution(conn, &ex, "FAILED", 0, Some(&e), ms, 0)?;
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsExecuted, 1);
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsFailed, 1);
            let _ = record_performance_timing(
                conn,
                "job_execution",
                Some(job_id),
                ms,
                &json!({ "executionId": &ex, "status": "FAILED" }),
            );
            let _ = log_structured_event(
                conn,
                "workflow_job_monitoring",
                "job_execution_failed",
                Some(job_id),
                "CRITICAL",
                &json!({ "executionId": &ex, "durationMs": ms, "error": &e }),
            );
            let _ = log_job_alert(
                conn,
                Some(job_id),
                Some(&ex),
                "ERROR",
                "Job execution failed",
                &json!({ "error": e }),
            );
            let _ = refresh_performance_and_reliability(conn, job_id);
            Err(e)
        }
    }
}

pub fn detect_job_failure_patterns(conn: &Connection) -> Result<i64, String> {
    let mut alerts: i64 = 0;
    let mut stmt = conn
        .prepare(
            "SELECT job_id, COUNT(*) AS c FROM workflow_job_execution_log
             WHERE datetime(started_at) > datetime('now', '-1 day')
               AND status IN ('FAILED','TIMEOUT')
             GROUP BY job_id HAVING c >= 3",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (job_id, c) = row.map_err(|e| e.to_string())?;
        log_failure_alert(
            conn,
            &job_id,
            "REPEATED_FAILURES",
            &json!({ "failures24h": c }),
        )?;
        log_job_alert(
            conn,
            Some(&job_id),
            None,
            "CRITICAL",
            "Repeated job failures detected (24h)",
            &json!({ "failures24h": c }),
        )?;
        let _ = insert_workflow_alert_signal(
            conn,
            "REPEATED_JOB_FAILURES",
            if c >= 10 { "FATAL" } else { "CRITICAL" },
            Some(&job_id),
            "Repeated job failures exceeded threshold (24h)",
            &json!({ "failures24h": c }),
            Some("job_monitor"),
        );
        alerts += 1;
    }
    Ok(alerts)
}

fn mark_stuck_jobs_timeout(conn: &Connection) -> Result<i64, String> {
    let mut n = 0i64;
    let mut stmt2 = conn
        .prepare(
            "SELECT execution_id, job_id FROM workflow_job_execution_log
             WHERE status = 'RUNNING' AND completed_at IS NULL
               AND datetime(started_at) < datetime('now', '-2 hours')",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt2
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (ex, job_id) = row.map_err(|e| e.to_string())?;
        let ms = 2 * 60 * 60 * 1000;
        complete_job_execution(
            conn,
            &ex,
            "TIMEOUT",
            0,
            Some("stuck RUNNING exceeded 2h watchdog"),
            ms,
            0,
        )?;
        let _ = log_job_alert(
            conn,
            Some(&job_id),
            Some(&ex),
            "ERROR",
            "Stuck job marked TIMEOUT",
            &json!({ "watchdogHours": 2 }),
        );
        n += 1;
    }
    Ok(n)
}

/// Daily tick: retention cleanups, maintenance, observability, automation cycle, economics, safety scan, anomaly detection.
pub fn run_daily_dashboard_tick_jobs(conn: &Connection) -> Result<(), String> {
    let _ = mark_stuck_jobs_timeout(conn)?;
    let _ = detect_missed_job_runs(conn)?;

    if !is_job_enabled(conn, "maintenance_cleanup")? {
        return Err(
            "maintenance_cleanup is disabled in workflow_background_jobs; enable it to run the daily tick."
                .into(),
        );
    }

    let integrity_new = match run_instrumented_job_with_output(conn, "maintenance_cleanup", |c| {
        let mut n = 0i64;
        n += run_kpi_snapshot_retention_cleanup(c).unwrap_or(0);
        n += run_dashboard_activity_retention_cleanup(c).unwrap_or(0);
        n += crate::commands::exception_workflow::run_exception_retention_cleanup(c).unwrap_or(0);
        let v = crate::commands::exception_reliability::run_daily_exception_workflow_maintenance(c)?;
        Ok((n + v, v))
    }) {
        Ok(v) => v,
        Err(e) => {
            let _ = crate::commands::workflow_observability::record_maintenance_run(
                conn,
                "daily_exception_workflow_maintenance",
                "FAILED",
                0,
                1,
            );
            return Err(e);
        }
    };

    if is_job_enabled(conn, "observability_update")? {
        run_instrumented_job(conn, "observability_update", |c| {
            crate::commands::workflow_observability::complete_daily_observability(c, integrity_new)
                .map(|_| 1i64)
        })?;
    }

    if is_job_enabled(conn, "automation_cycle")? {
        run_instrumented_job(conn, "automation_cycle", |c| {
            crate::commands::workflow_automation::run_workflow_automation_cycle(c)
                .map(|_| 1i64)
        })?;
    }

    if is_job_enabled(conn, "cost_metrics_aggregation")? {
        run_instrumented_job(conn, "cost_metrics_aggregation", |c| {
            compute_daily_automation_economics_index(c).map(|_| 1i64)
        })?;
    }

    if is_job_enabled(conn, "deployment_safety_checks")? {
        run_instrumented_job(conn, "deployment_safety_checks", |c| {
            let rejected: i64 = c
                .query_row(
                    "SELECT COUNT(*) FROM workflow_environment_deployment_log
                     WHERE upper(trim(status)) = 'REJECTED_SAFETY'
                       AND datetime(timestamp) > datetime('now', '-1 day')",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            Ok(rejected)
        })?;
    }

    if is_job_enabled(conn, "risk_evaluation")? {
        run_instrumented_job(conn, "risk_evaluation", |c| {
            let mut stmt = c
                .prepare("SELECT job_id FROM workflow_background_jobs")
                .map_err(|e| e.to_string())?;
            let ids = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            let mut k = 0i64;
            for id in ids {
                let jid: String = id.map_err(|e| e.to_string())?;
                let _ = refresh_performance_and_reliability(c, &jid);
                k += 1;
            }
            Ok(k)
        })?;
    }

    let _ = detect_schedule_drift(conn)?;
    let _ = recover_missed_jobs_auto(conn)?;
    let _ = refresh_all_job_recovery_scores(conn)?;
    let _ = detect_job_failure_patterns(conn)?;
    let _ = refresh_system_reliability_score(conn);
    let _ = scan_and_emit_threshold_alert_signals(conn);
    let _ = crate::commands::workflow_incident_management::refresh_incident_daily_metrics(conn);
    let _ = crate::commands::workflow_incident_management::scan_systemic_failure_bursts(conn);
    Ok(())
}

/// Retry a single failed execution (admin): re-runs the same logical job where supported.
pub fn retry_failed_job(conn: &Connection, execution_id: &str) -> Result<String, String> {
    let (job_id, retry_count, status): (String, i64, String) = conn
        .query_row(
            "SELECT job_id, retry_count, status FROM workflow_job_execution_log WHERE execution_id = ?1",
            params![execution_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "execution not found".to_string())?;
    if status != "FAILED" && status != "TIMEOUT" {
        return Err("only FAILED or TIMEOUT executions can be retried".into());
    }
    let (_, max_retries, _) = job_row(conn, &job_id)?;
    if retry_count >= max_retries {
        return Err("max retries exceeded for this job".into());
    }
    let new_retry = retry_count + 1;
    let new_ex = start_job_execution(conn, &job_id, new_retry)?;
    let clock = Instant::now();
    let r = run_job_payload(conn, &job_id);
    let ms = clock.elapsed().as_millis() as i64;
    match r {
        Ok(rec) => {
            complete_job_execution(conn, &new_ex, "SUCCESS", rec, None, ms, new_retry)?;
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsExecuted, 1);
            let _ = record_performance_timing(
                conn,
                "job_execution",
                Some(&job_id),
                ms,
                &json!({ "executionId": &new_ex, "status": "SUCCESS", "kind": "manual_retry" }),
            );
            let _ = log_structured_event(
                conn,
                "workflow_job_monitoring",
                "job_retry_succeeded",
                Some(&job_id),
                "INFO",
                &json!({ "executionId": &new_ex, "priorExecutionId": execution_id, "durationMs": ms }),
            );
            let _ = conn.execute(
                "UPDATE workflow_job_execution_log SET status = 'RETRY', error_message = ?2 WHERE execution_id = ?1",
                params![
                    execution_id,
                    format!("superseded by successful retry {}", new_ex)
                ],
            );
            let _ = crate::commands::workflow_incident_management::record_recovery_healing(
                conn,
                &job_id,
                &json!({
                    "executionId": &new_ex,
                    "priorExecutionId": execution_id,
                    "kind": "manual_retry",
                    "durationMs": ms,
                }),
            );
            Ok(new_ex)
        }
        Err(e) => {
            complete_job_execution(conn, &new_ex, "FAILED", 0, Some(&e), ms, new_retry)?;
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsExecuted, 1);
            let _ = bump_workflow_runtime_metric(conn, RuntimeMetricDelta::JobsFailed, 1);
            let _ = record_performance_timing(
                conn,
                "job_execution",
                Some(&job_id),
                ms,
                &json!({ "executionId": &new_ex, "status": "FAILED", "kind": "manual_retry" }),
            );
            let _ = log_structured_event(
                conn,
                "workflow_job_monitoring",
                "job_retry_failed",
                Some(&job_id),
                "CRITICAL",
                &json!({ "executionId": &new_ex, "durationMs": ms, "error": &e }),
            );
            Err(e)
        }
    }
}

pub fn set_workflow_background_job_enabled(
    conn: &Connection,
    job_id: &str,
    enabled: bool,
    caller_role: &str,
) -> Result<(), String> {
    let n = if enabled { 1 } else { 0 };
    let ts = now_ts();
    let u = conn
        .execute(
            "UPDATE workflow_background_jobs SET is_enabled = ?1, updated_at = ?2 WHERE job_id = ?3",
            params![n, &ts, job_id],
        )
        .map_err(|e| e.to_string())?;
    if u == 0 {
        return Err("unknown job_id".into());
    }
    log_manual_override(
        conn,
        job_id,
        if enabled {
            "ENABLE_JOB"
        } else {
            "DISABLE_JOB"
        },
        None,
        caller_role,
    )?;
    Ok(())
}

pub fn reset_job_schedule_anchor(conn: &Connection, job_id: &str, caller_role: &str) -> Result<(), String> {
    let ts = now_ts();
    let u = conn
        .execute(
            "UPDATE workflow_job_schedule_expectations SET last_expected_run_at = ?1, updated_at = ?1 WHERE job_id = ?2",
            params![&ts, job_id],
        )
        .map_err(|e| e.to_string())?;
    if u == 0 {
        return Err("job has no schedule expectations row".into());
    }
    conn.execute(
        "UPDATE workflow_job_missed_alerts SET status = 'CANCELLED' WHERE job_id = ?1 AND status = 'PENDING'",
        params![job_id],
    )
    .map_err(|e| e.to_string())?;
    log_manual_override(
        conn,
        job_id,
        "RESET_SCHEDULE_ANCHOR",
        Some("operator reset schedule anchor and cleared pending missed alerts"),
        caller_role,
    )?;
    Ok(())
}

pub fn recovery_guard_override_reenable(
    conn: &Connection,
    job_id: &str,
    reason: &str,
    caller_role: &str,
) -> Result<(), String> {
    let ts = now_ts();
    conn.execute(
        "UPDATE workflow_background_jobs SET is_enabled = 1, updated_at = ?1 WHERE job_id = ?2",
        params![&ts, job_id],
    )
    .map_err(|e| e.to_string())?;
    log_manual_override(
        conn,
        job_id,
        "RECOVERY_GUARD_OVERRIDE_REENABLE",
        Some(reason),
        caller_role,
    )?;
    Ok(())
}

pub fn update_job_schedule_expectations(
    conn: &Connection,
    job_id: &str,
    grace_period_minutes: Option<i64>,
    recovery_delay_sec: Option<i64>,
    max_recovery_attempts: Option<i64>,
    caller_role: &str,
) -> Result<(), String> {
    let chk: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_schedule_expectations WHERE job_id = ?1",
            params![job_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if chk == 0 {
        return Err("job has no schedule expectations row".into());
    }
    let ts = now_ts();
    if grace_period_minutes.is_none()
        && recovery_delay_sec.is_none()
        && max_recovery_attempts.is_none()
    {
        return Err("no fields to update".into());
    }
    if let Some(g) = grace_period_minutes {
        conn.execute(
            "UPDATE workflow_job_schedule_expectations SET grace_period_minutes = ?1, updated_at = ?2 WHERE job_id = ?3",
            params![g.max(1).min(10080), &ts, job_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(d) = recovery_delay_sec {
        conn.execute(
            "UPDATE workflow_job_schedule_expectations SET recovery_delay_sec = ?1, updated_at = ?2 WHERE job_id = ?3",
            params![d.max(10).min(86400), &ts, job_id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(m) = max_recovery_attempts {
        conn.execute(
            "UPDATE workflow_job_schedule_expectations SET max_recovery_attempts = ?1, updated_at = ?2 WHERE job_id = ?3",
            params![m.max(1).min(50), &ts, job_id],
        )
        .map_err(|e| e.to_string())?;
    }
    log_manual_override(
        conn,
        job_id,
        "UPDATE_SCHEDULE_EXPECTATIONS",
        Some("grace / recovery delay / max recovery attempts"),
        caller_role,
    )?;
    Ok(())
}

pub fn retry_latest_failed_job(conn: &Connection, job_id: &str) -> Result<String, String> {
    let ex: String = conn
        .query_row(
            "SELECT execution_id FROM workflow_job_execution_log
             WHERE job_id = ?1 AND status IN ('FAILED','TIMEOUT')
             ORDER BY datetime(started_at) DESC LIMIT 1",
            params![job_id],
            |r| r.get(0),
        )
        .map_err(|_| "no failed or timed-out execution for this job".to_string())?;
    retry_failed_job(conn, &ex)
}

pub fn get_job_failure_insights(conn: &Connection) -> Result<Value, String> {
    let mut stmt = conn
        .prepare(
            "SELECT job_id, COALESCE(error_message,''), COUNT(*) AS c
             FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT') AND datetime(started_at) > datetime('now', '-7 days')
             GROUP BY job_id, error_message ORDER BY c DESC LIMIT 60",
        )
        .map_err(|e| e.to_string())?;
    let clusters: Vec<Value> = stmt
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
    let mut stmt2 = conn
        .prepare(
            "SELECT job_id, status, COUNT(*) FROM workflow_job_execution_log
             WHERE datetime(started_at) > datetime('now', '-7 days')
             GROUP BY job_id, status",
        )
        .map_err(|e| e.to_string())?;
    let by_status: Vec<Value> = stmt2
        .query_map([], |r| {
            Ok(json!({
                "jobId": r.get::<_, String>(0)?,
                "status": r.get::<_, String>(1)?,
                "count": r.get::<_, i64>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "failureClusters7d": clusters,
        "countsByStatus7d": by_status,
        "notes": "Cross-check with workflow_job_failure_alerts and recent rule/deploy changes.",
    }))
}

fn csv_escape_field(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

pub fn export_workflow_job_recovery_log_csv(conn: &Connection) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT recovery_id, job_id, COALESCE(alert_id,''), recovery_time, result, attempt_count, COALESCE(error_message,'')
             FROM workflow_job_recovery_log ORDER BY datetime(recovery_time) DESC LIMIT 5000",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<(String, String, String, String, String, i64, String)>, _>>()
        .map_err(|e| e.to_string())?;
    let mut out = String::from("recovery_id,job_id,alert_id,recovery_time,result,attempt_count,error_message\n");
    for (rid, jid, aid, rt, res, ac, em) in rows {
        out.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            csv_escape_field(&rid),
            csv_escape_field(&jid),
            csv_escape_field(&aid),
            csv_escape_field(&rt),
            csv_escape_field(&res),
            ac,
            csv_escape_field(&em),
        ));
    }
    Ok(out)
}

pub fn get_workflow_job_dependencies_tree(conn: &Connection) -> Result<Value, String> {
    let mut stmt = conn
        .prepare("SELECT parent_job_id, dependent_job_id, dependency_type FROM workflow_job_dependencies ORDER BY parent_job_id, dependent_job_id")
        .map_err(|e| e.to_string())?;
    let edges: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "parentJobId": r.get::<_, String>(0)?,
                "dependentJobId": r.get::<_, String>(1)?,
                "dependencyType": r.get::<_, String>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "edges": edges,
        "suggestedDailyOrder": ["maintenance_cleanup", "observability_update", "automation_cycle", "cost_metrics_aggregation", "deployment_safety_checks", "risk_evaluation"],
    }))
}

pub fn get_job_execution_timeline(conn: &Connection, job_id: &str, hours: i64) -> Result<Value, String> {
    let h = hours.clamp(24, 168);
    let cutoff = format!("-{h} hours");
    let mut stmt = conn
        .prepare(
            "SELECT execution_id, started_at, completed_at, status, execution_time_ms, records_processed, COALESCE(error_message,''), retry_count
             FROM workflow_job_execution_log WHERE job_id = ?1 AND datetime(started_at) > datetime('now', ?2)
             ORDER BY datetime(started_at) ASC",
        )
        .map_err(|e| e.to_string())?;
    let events: Vec<Value> = stmt
        .query_map(params![job_id, &cutoff], |r| {
            Ok(json!({
                "executionId": r.get::<_, String>(0)?,
                "startedAt": r.get::<_, String>(1)?,
                "completedAt": r.get::<_, Option<String>>(2)?,
                "status": r.get::<_, String>(3)?,
                "executionTimeMs": r.get::<_, Option<i64>>(4)?,
                "recordsProcessed": r.get::<_, i64>(5)?,
                "errorMessage": r.get::<_, String>(6)?,
                "retryCount": r.get::<_, i64>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!({ "jobId": job_id, "hoursWindow": h, "events": events }))
}

pub fn simulate_background_jobs(conn: &Connection) -> Result<Value, String> {
    let mut stmt = conn
        .prepare("SELECT job_id, job_name, job_type, schedule_type, is_enabled FROM workflow_background_jobs ORDER BY job_id")
        .map_err(|e| e.to_string())?;
    let jobs: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "jobId": r.get::<_, String>(0)?,
                "jobName": r.get::<_, String>(1)?,
                "jobType": r.get::<_, String>(2)?,
                "scheduleType": r.get::<_, String>(3)?,
                "isEnabled": r.get::<_, i64>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut dst = conn
        .prepare("SELECT parent_job_id, dependent_job_id, dependency_type FROM workflow_job_dependencies")
        .map_err(|e| e.to_string())?;
    let deps: Vec<Value> = dst
        .query_map([], |r| {
            Ok(json!({
                "parentJobId": r.get::<_, String>(0)?,
                "dependentJobId": r.get::<_, String>(1)?,
                "dependencyType": r.get::<_, String>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "mode": "simulation",
        "plannedOrder": ["maintenance_cleanup", "observability_update", "automation_cycle", "cost_metrics_aggregation", "deployment_safety_checks", "risk_evaluation"],
        "jobs": jobs,
        "dependencies": deps,
        "notes": "No mutations performed; shows registry and typical daily ordering.",
    }))
}

// --- Tauri ---

#[tauri::command]
pub fn list_workflow_background_jobs_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT job_id, job_name, job_type, schedule_type, is_enabled, expected_duration_ms, max_retries, retry_delay_sec, created_at, updated_at FROM workflow_background_jobs ORDER BY job_id")
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "jobId": r.get::<_, String>(0)?,
                "jobName": r.get::<_, String>(1)?,
                "jobType": r.get::<_, String>(2)?,
                "scheduleType": r.get::<_, String>(3)?,
                "isEnabled": r.get::<_, i64>(4)?,
                "expectedDurationMs": r.get::<_, i64>(5)?,
                "maxRetries": r.get::<_, i64>(6)?,
                "retryDelaySec": r.get::<_, i64>(7)?,
                "createdAt": r.get::<_, String>(8)?,
                "updatedAt": r.get::<_, String>(9)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn list_workflow_job_execution_log_command(
    job_id: Option<String>,
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).clamp(1, 500);
    let rows: Vec<Value> = if let Some(j) = job_id.filter(|s| !s.trim().is_empty()) {
        let mut stmt = conn.prepare(&format!(
            "SELECT execution_id, job_id, started_at, completed_at, status, records_processed, error_message, execution_time_ms, retry_count
             FROM workflow_job_execution_log WHERE job_id = ?1 ORDER BY datetime(started_at) DESC LIMIT {lim}"
        )).map_err(|e| e.to_string())?;
        let v: Vec<Value> = stmt
            .query_map(params![&j], |r| {
                Ok(json!({
                    "executionId": r.get::<_, String>(0)?,
                    "jobId": r.get::<_, String>(1)?,
                    "startedAt": r.get::<_, String>(2)?,
                    "completedAt": r.get::<_, Option<String>>(3)?,
                    "status": r.get::<_, String>(4)?,
                    "recordsProcessed": r.get::<_, i64>(5)?,
                    "errorMessage": r.get::<_, Option<String>>(6)?,
                    "executionTimeMs": r.get::<_, Option<i64>>(7)?,
                    "retryCount": r.get::<_, i64>(8)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        v
    } else {
        let mut stmt = conn.prepare(&format!(
            "SELECT execution_id, job_id, started_at, completed_at, status, records_processed, error_message, execution_time_ms, retry_count
             FROM workflow_job_execution_log ORDER BY datetime(started_at) DESC LIMIT {lim}"
        )).map_err(|e| e.to_string())?;
        let v: Vec<Value> = stmt
            .query_map([], |r| {
                Ok(json!({
                    "executionId": r.get::<_, String>(0)?,
                    "jobId": r.get::<_, String>(1)?,
                    "startedAt": r.get::<_, String>(2)?,
                    "completedAt": r.get::<_, Option<String>>(3)?,
                    "status": r.get::<_, String>(4)?,
                    "recordsProcessed": r.get::<_, i64>(5)?,
                    "errorMessage": r.get::<_, Option<String>>(6)?,
                    "executionTimeMs": r.get::<_, Option<i64>>(7)?,
                    "retryCount": r.get::<_, i64>(8)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        v
    };
    Ok(rows)
}

#[tauri::command]
pub fn get_background_job_health_dashboard_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut per_job: Vec<Value> = Vec::new();
    let mut stmt = conn
        .prepare("SELECT job_id FROM workflow_background_jobs")
        .map_err(|e| e.to_string())?;
    let jids: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for jid in jids {
        let last: Option<Value> = conn
            .query_row(
                "SELECT status, started_at, completed_at, execution_time_ms, records_processed, error_message
                 FROM workflow_job_execution_log WHERE job_id = ?1 ORDER BY datetime(started_at) DESC LIMIT 1",
                params![&jid],
                |r| {
                    Ok(json!({
                        "status": r.get::<_, String>(0)?,
                        "startedAt": r.get::<_, String>(1)?,
                        "completedAt": r.get::<_, Option<String>>(2)?,
                        "executionTimeMs": r.get::<_, Option<i64>>(3)?,
                        "recordsProcessed": r.get::<_, i64>(4)?,
                        "errorMessage": r.get::<_, Option<String>>(5)?,
                    }))
                },
            )
            .ok();
        let fails: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log
                 WHERE job_id = ?1 AND status IN ('FAILED','TIMEOUT') AND datetime(started_at) > datetime('now', '-7 days')",
                params![&jid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let avg_ms: f64 = conn
            .query_row(
                "SELECT COALESCE(AVG(CAST(execution_time_ms AS REAL)),0) FROM workflow_job_execution_log
                 WHERE job_id = ?1 AND completed_at IS NOT NULL AND datetime(started_at) > datetime('now', '-7 days')",
                params![&jid],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        let retries: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log WHERE job_id = ?1 AND status = 'RETRY'",
                params![&jid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let rel: Option<Value> = conn
            .query_row(
                "SELECT score, success_rate, failure_rate, retry_frequency, sample_executions, updated_at
                 FROM workflow_job_reliability_score WHERE job_id = ?1",
                params![&jid],
                |r| {
                    Ok(json!({
                        "score": r.get::<_, f64>(0)?,
                        "successRate": r.get::<_, f64>(1)?,
                        "failureRate": r.get::<_, f64>(2)?,
                        "retryFrequency": r.get::<_, f64>(3)?,
                        "sampleExecutions": r.get::<_, i64>(4)?,
                        "updatedAt": r.get::<_, String>(5)?,
                    }))
                },
            )
            .ok();
        per_job.push(json!({
            "jobId": jid,
            "lastExecution": last,
            "failures7d": fails,
            "avgExecutionMs7d": avg_ms,
            "retryRows": retries,
            "reliability": rel,
        }));
    }
    Ok(json!({ "jobs": per_job }))
}

#[tauri::command]
pub fn retry_failed_job_command(
    execution_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    retry_failed_job(&conn, execution_id.trim())
}

#[tauri::command]
pub fn simulate_background_jobs_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    simulate_background_jobs(&conn)
}

#[tauri::command]
pub fn detect_job_failures_command(caller_role: String, state: State<DbState>) -> Result<i64, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    detect_job_failure_patterns(&conn)
}

#[tauri::command]
pub fn list_workflow_job_alert_log_command(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(80).clamp(1, 300);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, job_id, execution_id, alert_level, message, created_at, details_json
             FROM workflow_job_alert_log ORDER BY datetime(created_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "jobId": r.get::<_, Option<String>>(1)?,
                "executionId": r.get::<_, Option<String>>(2)?,
                "alertLevel": r.get::<_, String>(3)?,
                "message": r.get::<_, String>(4)?,
                "createdAt": r.get::<_, String>(5)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(6)?).unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn list_workflow_job_failure_alerts_command(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(80).clamp(1, 300);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT alert_id, job_id, detected_at, alert_type, details_json
             FROM workflow_job_failure_alerts ORDER BY datetime(detected_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "alertId": r.get::<_, String>(0)?,
                "jobId": r.get::<_, String>(1)?,
                "detectedAt": r.get::<_, String>(2)?,
                "alertType": r.get::<_, String>(3)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn detect_missed_job_runs_command(caller_role: String, state: State<DbState>) -> Result<i64, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    detect_missed_job_runs(&conn)
}

#[tauri::command]
pub fn recover_missed_job_command(
    job_id: String,
    alert_id: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    recover_missed_job(
        &conn,
        job_id.trim(),
        alert_id.as_deref().filter(|s| !s.trim().is_empty()),
        true,
    )
}

#[tauri::command]
pub fn get_missed_schedule_dashboard_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let pending: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_missed_alerts WHERE status = 'PENDING'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let recovered7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_missed_alerts WHERE status = 'RECOVERED' AND datetime(detected_time) > datetime('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let missed_exec7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log WHERE status = 'MISSED' AND datetime(started_at) > datetime('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let rec_ok30d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_recovery_log WHERE result = 'SUCCESS' AND datetime(recovery_time) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let rec_fail30d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_recovery_log WHERE result = 'FAILED' AND datetime(recovery_time) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let denom = rec_ok30d + rec_fail30d;
    let recovery_success_rate = if denom > 0 {
        rec_ok30d as f64 / denom as f64
    } else {
        1.0
    };

    let today = Utc::now().format("%Y-%m-%d").to_string();
    let today_metrics: Option<Value> = conn
        .query_row(
            "SELECT metric_date, missed_runs, recovery_success, recovery_failures, drift_warnings, updated_at
             FROM daily_missed_job_metrics WHERE metric_date = ?1",
            params![today],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "missedRuns": r.get::<_, i64>(1)?,
                    "recoverySuccess": r.get::<_, i64>(2)?,
                    "recoveryFailures": r.get::<_, i64>(3)?,
                    "driftWarnings": r.get::<_, i64>(4)?,
                    "updatedAt": r.get::<_, String>(5)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT alert_id, job_id, expected_time, detected_time, recovery_triggered, status
             FROM workflow_job_missed_alerts ORDER BY datetime(detected_time) DESC LIMIT 25",
        )
        .map_err(|e| e.to_string())?;
    let recent: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "alertId": r.get::<_, String>(0)?,
                "jobId": r.get::<_, String>(1)?,
                "expectedTime": r.get::<_, String>(2)?,
                "detectedTime": r.get::<_, String>(3)?,
                "recoveryTriggered": r.get::<_, i64>(4)?,
                "status": r.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut s2 = conn
        .prepare("SELECT job_id, score, missed_jobs, recovered_jobs, window_days, updated_at FROM workflow_job_recovery_score ORDER BY job_id")
        .map_err(|e| e.to_string())?;
    let scores: Vec<Value> = s2
        .query_map([], |r| {
            Ok(json!({
                "jobId": r.get::<_, String>(0)?,
                "score": r.get::<_, f64>(1)?,
                "missedJobs": r.get::<_, i64>(2)?,
                "recoveredJobs": r.get::<_, i64>(3)?,
                "windowDays": r.get::<_, i64>(4)?,
                "updatedAt": r.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "pendingMissed": pending,
        "recovered7d": recovered7d,
        "missedExecutions7d": missed_exec7d,
        "recoverySuccessRate30d": recovery_success_rate,
        "todayMetrics": today_metrics,
        "recentMissedAlerts": recent,
        "recoveryScores": scores,
    }))
}

#[tauri::command]
pub fn list_workflow_job_missed_alerts_command(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(80).clamp(1, 300);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT alert_id, job_id, expected_time, detected_time, recovery_triggered, status
             FROM workflow_job_missed_alerts ORDER BY datetime(detected_time) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "alertId": r.get::<_, String>(0)?,
                "jobId": r.get::<_, String>(1)?,
                "expectedTime": r.get::<_, String>(2)?,
                "detectedTime": r.get::<_, String>(3)?,
                "recoveryTriggered": r.get::<_, i64>(4)?,
                "status": r.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn set_workflow_background_job_enabled_command(
    job_id: String,
    enabled: bool,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    set_workflow_background_job_enabled(&conn, job_id.trim(), enabled, &caller_role)
}

#[tauri::command]
pub fn reset_job_schedule_anchor_command(job_id: String, caller_role: String, state: State<DbState>) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reset_job_schedule_anchor(&conn, job_id.trim(), &caller_role)
}

#[tauri::command]
pub fn recovery_guard_override_reenable_command(
    job_id: String,
    reason: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_admin(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    recovery_guard_override_reenable(&conn, job_id.trim(), reason.trim(), &caller_role)
}

#[tauri::command]
pub fn update_job_schedule_expectations_command(
    job_id: String,
    grace_period_minutes: Option<i64>,
    recovery_delay_sec: Option<i64>,
    max_recovery_attempts: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    update_job_schedule_expectations(
        &conn,
        job_id.trim(),
        grace_period_minutes,
        recovery_delay_sec,
        max_recovery_attempts,
        &caller_role,
    )
}

#[tauri::command]
pub fn retry_latest_failed_job_command(job_id: String, caller_role: String, state: State<DbState>) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    retry_latest_failed_job(&conn, job_id.trim())
}

#[tauri::command]
pub fn get_job_failure_insights_command(caller_role: String, state: State<DbState>) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_job_failure_insights(&conn)
}

#[tauri::command]
pub fn export_workflow_job_recovery_log_csv_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    export_workflow_job_recovery_log_csv(&conn)
}

#[tauri::command]
pub fn get_workflow_job_dependencies_tree_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_workflow_job_dependencies_tree(&conn)
}

#[tauri::command]
pub fn get_job_execution_timeline_command(
    job_id: String,
    hours: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_job_execution_timeline(&conn, job_id.trim(), hours.unwrap_or(48))
}

#[tauri::command]
pub fn list_workflow_job_schedule_expectations_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT job_id, expected_interval_minutes, grace_period_minutes, last_expected_run_at, max_recovery_attempts, recovery_delay_sec, created_at, updated_at
             FROM workflow_job_schedule_expectations ORDER BY job_id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "jobId": r.get::<_, String>(0)?,
                "expectedIntervalMinutes": r.get::<_, i64>(1)?,
                "gracePeriodMinutes": r.get::<_, i64>(2)?,
                "lastExpectedRunAt": r.get::<_, Option<String>>(3)?,
                "maxRecoveryAttempts": r.get::<_, i64>(4)?,
                "recoveryDelaySec": r.get::<_, i64>(5)?,
                "createdAt": r.get::<_, String>(6)?,
                "updatedAt": r.get::<_, String>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn list_workflow_job_manual_override_log_command(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<Value>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(40).clamp(1, 200);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, job_id, action, reason, caller_role, created_at
             FROM workflow_job_manual_override_log ORDER BY datetime(created_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "jobId": r.get::<_, String>(1)?,
                "action": r.get::<_, String>(2)?,
                "reason": r.get::<_, Option<String>>(3)?,
                "callerRole": r.get::<_, String>(4)?,
                "createdAt": r.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}
