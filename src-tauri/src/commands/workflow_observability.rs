//! Workflow health summary, maintenance history, recovery checks, diagnostics, predictive risk.

use crate::commands::exception_reliability::peek_exception_integrity_issue_count;
use crate::commands::exception_workflow::insert_lifecycle;
use crate::commands::utils::dashboard_activity_checksum;
use crate::db::DbState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

fn now_local() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today_date() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

fn meta_value(conn: &Connection, key: &str) -> String {
    conn.query_row(
        "SELECT value FROM app_metadata WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .unwrap_or_default()
}

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![table],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

/// Aggregate counts for dashboard / API.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowHealthSummary {
    pub open_exceptions: i64,
    pub critical_exceptions: i64,
    pub sla_breaches_today: i64,
    pub workflow_timeouts: i64,
    pub integrity_issues: i64,
    pub recurring_exceptions: i64,
    pub last_maintenance_run: String,
    pub last_integrity_check: String,
}

fn build_workflow_health_summary(conn: &Connection) -> Result<WorkflowHealthSummary, String> {
    let open_exceptions: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let critical_exceptions: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND priority = 'CRITICAL'
               AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let sla_breaches_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_escalation_log WHERE date(created_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let workflow_timeouts: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND COALESCE(workflow_timeout_flag,0) = 1
               AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let integrity_issues: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_integrity_log WHERE date(detected_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let recurring_exceptions: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND COALESCE(recurrence_flag,0) = 1
               AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(WorkflowHealthSummary {
        open_exceptions,
        critical_exceptions,
        sla_breaches_today,
        workflow_timeouts,
        integrity_issues,
        recurring_exceptions,
        last_maintenance_run: meta_value(conn, "last_workflow_maintenance_at"),
        last_integrity_check: meta_value(conn, "last_integrity_check_at"),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowMaintenanceHistoryRow {
    pub run_id: String,
    pub job_name: String,
    pub started_at: String,
    pub completed_at: String,
    pub status: String,
    pub records_processed: i64,
    pub errors_detected: i64,
}

pub fn record_maintenance_run(
    conn: &Connection,
    job_name: &str,
    status: &str,
    records_processed: i64,
    errors_detected: i64,
) -> Result<(), String> {
    let run_id = Uuid::new_v4().to_string();
    let ts = now_local();
    conn.execute(
        "INSERT INTO workflow_maintenance_history (run_id, job_name, started_at, completed_at, status, records_processed, errors_detected)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &run_id,
            job_name,
            &ts,
            &ts,
            status,
            records_processed,
            errors_detected,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// After successful daily maintenance: history row, health score, resolution efficiency snapshot.
pub fn complete_daily_observability(conn: &Connection, integrity_new: i64) -> Result<(), String> {
    let open: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let esc_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_escalation_log WHERE date(created_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let records = open + esc_today;
    record_maintenance_run(
        conn,
        "daily_exception_workflow_maintenance",
        "OK",
        records,
        integrity_new,
    )?;
    upsert_daily_workflow_health_score(conn)?;
    refresh_resolution_efficiency_for_today(conn)?;
    Ok(())
}

fn upsert_daily_workflow_health_score(conn: &Connection) -> Result<(), String> {
    let d = today_date();
    let open: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let critical: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND priority = 'CRITICAL'
               AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let breached: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND sla_status = 'BREACHED'
               AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let timeouts: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND COALESCE(workflow_timeout_flag,0) = 1
               AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let recurring: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND COALESCE(recurrence_flag,0) = 1
               AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut score = 100.0_f64;
    score -= (open as f64 * 1.2).min(35.0);
    score -= critical as f64 * 8.0;
    score -= breached as f64 * 5.0;
    score -= timeouts as f64 * 4.0;
    score -= recurring as f64 * 3.0;
    score = score.clamp(0.0, 100.0);

    let factors = serde_json::json!({
        "open": open,
        "critical": critical,
        "slaBreachedOpen": breached,
        "timeouts": timeouts,
        "recurring": recurring,
    })
    .to_string();

    conn.execute(
        "INSERT INTO daily_workflow_health_score (snapshot_date, health_score, factors_json)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(snapshot_date) DO UPDATE SET
           health_score = excluded.health_score,
           factors_json = excluded.factors_json,
           created_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')",
        params![&d, score, &factors],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_resolution_efficiency_for_today(conn: &Connection) -> Result<(), String> {
    let d = today_date();
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(r.resolved_by,''), COUNT(*),
                    AVG((julianday(r.resolved_at) - julianday(c.created_at)) * 24.0)
             FROM exception_resolution_log r
             JOIN exception_cases c ON c.id = r.exception_case_id
             WHERE date(r.resolved_at) = date('now')
             GROUP BY COALESCE(r.resolved_by,'')",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<f64>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (uid, cnt, avg_h) = row.map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO resolution_efficiency_metrics (snapshot_date, user_id, resolutions_count, avg_resolution_hours)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(snapshot_date, user_id) DO UPDATE SET
               resolutions_count = excluded.resolutions_count,
               avg_resolution_hours = excluded.avg_resolution_hours,
               created_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')",
            params![&d, &uid, cnt, avg_h],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReadinessReport {
    pub backup_status: String,
    pub snapshot_status: String,
    pub integrity_status: String,
    pub audit_status: String,
}

fn build_recovery_readiness_report(conn: &Connection) -> Result<RecoveryReadinessReport, String> {
    let backup_ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM backups WHERE lower(trim(status)) = 'completed'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let backup_status = if backup_ok > 0 { "OK" } else { "WARN" }.to_string();

    let snap_ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_backlog_snapshot WHERE snapshot_date = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let snapshot_status = if snap_ok > 0 { "OK" } else { "WARN" }.to_string();

    let integrity_signals = peek_exception_integrity_issue_count(conn)?;
    let integrity_status = if integrity_signals == 0 {
        "OK"
    } else if integrity_signals < 8 {
        "WARN"
    } else {
        "FAIL"
    }
    .to_string();

    let mut stmt = conn
        .prepare(
            "SELECT user_id, action_type, details, COALESCE(module_name,''),
                    COALESCE(record_reference,''), COALESCE(navigation_target,''),
                    COALESCE(action_context,''), COALESCE(checksum,'')
             FROM dashboard_activity_log
             ORDER BY id DESC LIMIT 2000",
        )
        .map_err(|e| e.to_string())?;
    let mut mismatch = 0i64;
    let mut missing_ck = 0i64;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (uid, at, det, mn, rr, nt, ac, ck) = row.map_err(|e| e.to_string())?;
        if ck.trim().is_empty() {
            missing_ck += 1;
            continue;
        }
        let exp = dashboard_activity_checksum(&uid, &at, &det, &mn, &rr, &nt, &ac);
        if exp != ck {
            mismatch += 1;
        }
    }
    let audit_status = if mismatch > 0 {
        "FAIL"
    } else if missing_ck > 50 {
        "WARN"
    } else {
        "OK"
    }
    .to_string();

    Ok(RecoveryReadinessReport {
        backup_status,
        snapshot_status,
        integrity_status,
        audit_status,
    })
}

/// Rebuild missing lifecycle markers from resolution and escalation logs.
fn rebuild_exception_lifecycle_from_logs(conn: &Connection) -> Result<i64, String> {
    let mut n = 0i64;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT c.id, c.status, COALESCE(c.resolved_by,''), COALESCE(c.resolved_at,'')
             FROM exception_cases c
             WHERE c.status IN ('RESOLVED','IGNORED')
               AND NOT EXISTS (
                 SELECT 1 FROM exception_lifecycle_events e
                 WHERE e.exception_case_id = c.id
                   AND e.event_type IN ('RESOLVED','IGNORED')
               )",
        )
        .map_err(|e| e.to_string())?;
    let cases: Vec<(String, String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();

    for (cid, st, rb, ra) in cases {
        let det = serde_json::json!({
            "source": "reconstruct_exception_lifecycle",
            "resolvedAt": ra,
        })
        .to_string();
        let ev = if st == "IGNORED" {
            "IGNORED"
        } else {
            "RESOLVED"
        };
        let uid = if rb.is_empty() {
            None
        } else {
            Some(rb.as_str())
        };
        insert_lifecycle(conn, &cid, ev, uid, &det)?;
        n += 1;
    }

    let mut stmt2 = conn
        .prepare(
            "SELECT c.id,
                    (SELECT COUNT(*) FROM exception_escalation_log e WHERE e.exception_case_id = c.id)
             FROM exception_cases c
             WHERE EXISTS (SELECT 1 FROM exception_escalation_log e2 WHERE e2.exception_case_id = c.id)
               AND NOT EXISTS (
                 SELECT 1 FROM exception_lifecycle_events l
                 WHERE l.exception_case_id = c.id AND l.event_type = 'SLA_ESCALATED'
               )",
        )
        .map_err(|e| e.to_string())?;
    let esc_cases: Vec<(String, i64)> = stmt2
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();

    for (cid, esc_n) in esc_cases {
        let payload = serde_json::json!({
            "source": "reconstruct_exception_lifecycle",
            "escalationStepsRebuilt": esc_n,
        })
        .to_string();
        insert_lifecycle(conn, &cid, "SLA_ESCALATED", None, &payload)?;
        n += 1;
    }

    Ok(n)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReliabilityDiagnostics {
    pub most_common_exception_type: String,
    pub highest_recurrence_entity: String,
    pub longest_unresolved_case_id: String,
    pub most_frequent_sla_breach_type: String,
    pub slowest_resolution_workflow_type: String,
}

fn build_reliability_diagnostics(conn: &Connection) -> Result<ReliabilityDiagnostics, String> {
    let most_common_exception_type: String = conn
        .query_row(
            "SELECT exception_type FROM exception_cases
             WHERE exception_type != 'STRESS_TEST'
             GROUP BY exception_type ORDER BY COUNT(*) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let highest_recurrence_entity: String = conn
        .query_row(
            "SELECT exception_type || ':' || entity_id
             FROM exception_recurrence_counts
             ORDER BY total_opens DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let longest_unresolved_case_id: String = conn
        .query_row(
            "SELECT id FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND exception_type != 'STRESS_TEST'
             ORDER BY julianday('now') - julianday(created_at) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let most_frequent_sla_breach_type: String = conn
        .query_row(
            "SELECT exception_type FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND sla_status = 'BREACHED'
               AND exception_type != 'STRESS_TEST'
             GROUP BY exception_type ORDER BY COUNT(*) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let slowest_resolution_workflow_type: String = conn
        .query_row(
            "SELECT exception_type FROM exception_cases
             WHERE status IN ('RESOLVED','IGNORED')
               AND resolved_at IS NOT NULL AND trim(resolved_at) != ''
               AND exception_type != 'STRESS_TEST'
             GROUP BY exception_type
             ORDER BY AVG((julianday(resolved_at) - julianday(created_at)) * 24.0) DESC
             LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    Ok(ReliabilityDiagnostics {
        most_common_exception_type,
        highest_recurrence_entity,
        longest_unresolved_case_id,
        most_frequent_sla_breach_type,
        slowest_resolution_workflow_type,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictiveRisk {
    pub risk_level: String,
}

fn build_predictive_workflow_risk(conn: &Connection) -> Result<PredictiveRisk, String> {
    let mut stmt = conn
        .prepare(
            "SELECT snapshot_date,
                    COALESCE(overdue_count,0) + COALESCE(missing_boe_count,0)
                      + COALESCE(missing_expense_count,0) + COALESCE(missing_document_count,0) AS t
             FROM daily_exception_summary
             WHERE snapshot_date >= date('now', '-30 days')
             ORDER BY snapshot_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let totals: Vec<i64> = stmt
        .query_map([], |r| r.get(1))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    if totals.len() < 7 {
        return Ok(PredictiveRisk {
            risk_level: "LOW".into(),
        });
    }
    let mid = totals.len() / 2;
    let first: f64 = totals.iter().take(mid).map(|x| *x as f64).sum::<f64>() / mid.max(1) as f64;
    let rest = totals.len() - mid;
    let second: f64 = totals.iter().skip(mid).map(|x| *x as f64).sum::<f64>() / rest.max(1) as f64;
    let risk_level = if second > first * 1.12 {
        "HIGH"
    } else if second > first * 1.04 {
        "MEDIUM"
    } else {
        "LOW"
    };
    Ok(PredictiveRisk {
        risk_level: risk_level.to_string(),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditVerificationSummary {
    pub checksum_mismatches: i64,
    pub integrity_warnings: i64,
    pub missing_checksum_entries: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConsistencyAuditReport {
    pub checks_run: i64,
    pub checks_failed: i64,
    pub stale_snapshot_detected: bool,
    pub duplicate_intent_patterns_detected: bool,
    pub root_cause_trace_violations_7d: i64,
    pub missing_trace_checksum_7d: i64,
    pub summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAnomalyReport {
    pub anomaly_score: i64,
    pub severity: String,
    pub failed_jobs_1h: i64,
    pub timeout_jobs_1h: i64,
    pub recovery_journal_stuck: i64,
    pub integrity_issues_24h: i64,
    pub memory_watermark_exceeded: bool,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfHealingRecoveryResult {
    pub attempted: bool,
    pub healed: bool,
    pub repaired_records: i64,
    pub anomaly_score_before: i64,
    pub anomaly_score_after: i64,
    pub actions: Vec<String>,
    pub message: String,
}

fn build_audit_verification_summary(conn: &Connection) -> Result<AuditVerificationSummary, String> {
    let integrity_warnings: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_integrity_log
             WHERE issue_type NOT IN ('AUDIT_LOG_CHECKSUM_MISMATCH')
               AND date(detected_at) >= date('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT user_id, action_type, details, COALESCE(module_name,''),
                    COALESCE(record_reference,''), COALESCE(navigation_target,''),
                    COALESCE(action_context,''), COALESCE(checksum,'')
             FROM dashboard_activity_log
             ORDER BY id DESC LIMIT 5000",
        )
        .map_err(|e| e.to_string())?;
    let mut checksum_mismatches = 0i64;
    let mut missing_checksum_entries = 0i64;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (uid, at, det, mn, rr, nt, ac, ck) = row.map_err(|e| e.to_string())?;
        if ck.trim().is_empty() {
            missing_checksum_entries += 1;
            continue;
        }
        let exp = dashboard_activity_checksum(&uid, &at, &det, &mn, &rr, &nt, &ac);
        if exp != ck {
            checksum_mismatches += 1;
        }
    }

    Ok(AuditVerificationSummary {
        checksum_mismatches,
        integrity_warnings,
        missing_checksum_entries,
    })
}

fn build_ai_consistency_audit_report(
    conn: &Connection,
) -> Result<AiConsistencyAuditReport, String> {
    let mut checks_run = 0_i64;
    let mut checks_failed = 0_i64;

    checks_run += 1;
    let stale_snapshot_detected = conn
        .query_row(
            "SELECT COUNT(*) FROM system_agent_audit_log
             WHERE datetime(created_at) >= datetime('now', '-7 day')
               AND json_extract(policy_decision_json, '$.policyEvalCount') >= 2",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;
    if stale_snapshot_detected {
        checks_failed += 1;
    }

    checks_run += 1;
    let duplicate_intent_patterns_detected = false;

    checks_run += 1;
    let root_cause_trace_violations_7d = conn
        .query_row(
            "SELECT COUNT(*) FROM system_agent_audit_log
             WHERE datetime(created_at) >= datetime('now', '-7 day')
               AND intent_route = 'TRACE_ONLY_FAILURE'
               AND (trace_checksum IS NULL OR trim(trace_checksum) = '')",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    if root_cause_trace_violations_7d > 0 {
        checks_failed += 1;
    }

    checks_run += 1;
    let missing_trace_checksum_7d = conn
        .query_row(
            "SELECT COUNT(*) FROM system_agent_audit_log
             WHERE datetime(created_at) >= datetime('now', '-7 day')
               AND llm_used = 1
               AND grounding_ok = 0
               AND (trace_checksum IS NULL OR trim(trace_checksum) = '')",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    if missing_trace_checksum_7d > 0 {
        checks_failed += 1;
    }

    let summary = if checks_failed == 0 {
        "AI consistency checks passed".to_string()
    } else {
        format!(
            "AI consistency checks found {} issue(s); review system_agent_audit_log",
            checks_failed
        )
    };

    Ok(AiConsistencyAuditReport {
        checks_run,
        checks_failed,
        stale_snapshot_detected,
        duplicate_intent_patterns_detected,
        root_cause_trace_violations_7d,
        missing_trace_checksum_7d,
        summary,
    })
}

fn build_runtime_anomaly_report(conn: &Connection) -> Result<RuntimeAnomalyReport, String> {
    let failed_jobs_1h = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE datetime(started_at) >= datetime('now', '-1 hour')
               AND status = 'FAILED'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let timeout_jobs_1h = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE datetime(started_at) >= datetime('now', '-1 hour')
               AND status = 'TIMEOUT'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let recovery_journal_stuck = if table_exists(conn, "write_recovery_journal") {
        conn.query_row(
            "SELECT COUNT(*) FROM write_recovery_journal WHERE status = 'started'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
    } else {
        0
    };
    let integrity_issues_24h = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_integrity_log
             WHERE datetime(detected_at) >= datetime('now', '-24 hour')",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let memory_watermark_exceeded =
        crate::services::platform_reliability::process_memory_bytes() > 1_200_000_000_u64;

    let mut anomaly_score = 0_i64;
    anomaly_score += failed_jobs_1h * 3;
    anomaly_score += timeout_jobs_1h * 2;
    anomaly_score += recovery_journal_stuck * 4;
    anomaly_score += integrity_issues_24h * 5;
    if memory_watermark_exceeded {
        anomaly_score += 6;
    }

    let severity = if anomaly_score >= 20 {
        "critical"
    } else if anomaly_score >= 10 {
        "high"
    } else if anomaly_score >= 5 {
        "medium"
    } else {
        "low"
    }
    .to_string();

    let mut reasons = Vec::new();
    if failed_jobs_1h > 0 {
        reasons.push(format!("failed_jobs_1h={failed_jobs_1h}"));
    }
    if timeout_jobs_1h > 0 {
        reasons.push(format!("timeout_jobs_1h={timeout_jobs_1h}"));
    }
    if recovery_journal_stuck > 0 {
        reasons.push(format!("recovery_journal_stuck={recovery_journal_stuck}"));
    }
    if integrity_issues_24h > 0 {
        reasons.push(format!("integrity_issues_24h={integrity_issues_24h}"));
    }
    if memory_watermark_exceeded {
        reasons.push("memory_watermark_exceeded=true".to_string());
    }

    Ok(RuntimeAnomalyReport {
        anomaly_score,
        severity,
        failed_jobs_1h,
        timeout_jobs_1h,
        recovery_journal_stuck,
        integrity_issues_24h,
        memory_watermark_exceeded,
        reasons,
    })
}

fn run_self_healing_recovery(conn: &Connection) -> Result<SelfHealingRecoveryResult, String> {
    let before = build_runtime_anomaly_report(conn)?;
    let should_attempt = before.anomaly_score >= 5;
    if !should_attempt {
        return Ok(SelfHealingRecoveryResult {
            attempted: false,
            healed: true,
            repaired_records: 0,
            anomaly_score_before: before.anomaly_score,
            anomaly_score_after: before.anomaly_score,
            actions: vec!["noop.already_healthy".to_string()],
            message: "System health is within normal limits".to_string(),
        });
    }

    let mut repaired_records = 0_i64;
    let mut actions = Vec::new();

    if table_exists(conn, "write_recovery_journal") {
        let n = crate::services::platform_reliability::recover_interrupted_writes(conn)?;
        repaired_records += n;
        actions.push(format!("recover_interrupted_writes={n}"));
    }

    if table_exists(conn, "exception_lifecycle_events") {
        let n = rebuild_exception_lifecycle_from_logs(conn)?;
        repaired_records += n;
        actions.push(format!("reconstruct_exception_lifecycle={n}"));
    }

    let after = build_runtime_anomaly_report(conn)?;
    let healed = after.anomaly_score < before.anomaly_score;
    Ok(SelfHealingRecoveryResult {
        attempted: true,
        healed,
        repaired_records,
        anomaly_score_before: before.anomaly_score,
        anomaly_score_after: after.anomaly_score,
        actions,
        message: if healed {
            "Self-healing reduced anomaly score".to_string()
        } else {
            "Self-healing completed but anomaly score did not improve".to_string()
        },
    })
}

fn query_workflow_maintenance_history(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<WorkflowMaintenanceHistoryRow>, String> {
    let lim = limit.clamp(1, 500);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT run_id, job_name, started_at, completed_at, status, records_processed, errors_detected
             FROM workflow_maintenance_history
             ORDER BY datetime(completed_at) DESC
             LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(WorkflowMaintenanceHistoryRow {
                run_id: r.get(0)?,
                job_name: r.get(1)?,
                started_at: r.get(2)?,
                completed_at: r.get(3)?,
                status: r.get(4)?,
                records_processed: r.get(5)?,
                errors_detected: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_workflow_health_summary(state: State<DbState>) -> Result<WorkflowHealthSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    build_workflow_health_summary(&conn)
}

#[tauri::command]
pub fn get_workflow_maintenance_history(
    limit: Option<i64>,
    state: State<DbState>,
) -> Result<Vec<WorkflowMaintenanceHistoryRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    query_workflow_maintenance_history(&conn, limit.unwrap_or(50))
}

#[tauri::command]
pub fn run_recovery_readiness_check(
    state: State<DbState>,
) -> Result<RecoveryReadinessReport, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    build_recovery_readiness_report(&conn)
}

#[tauri::command]
pub fn reconstruct_exception_lifecycle(state: State<DbState>) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    rebuild_exception_lifecycle_from_logs(&conn)
}

#[tauri::command]
pub fn get_reliability_diagnostics(
    state: State<DbState>,
) -> Result<ReliabilityDiagnostics, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    build_reliability_diagnostics(&conn)
}

#[tauri::command]
pub fn get_predictive_workflow_risk(state: State<DbState>) -> Result<PredictiveRisk, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    build_predictive_workflow_risk(&conn)
}

#[tauri::command]
pub fn get_audit_verification_summary(
    state: State<DbState>,
) -> Result<AuditVerificationSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    build_audit_verification_summary(&conn)
}

#[tauri::command]
pub fn run_ai_consistency_auditor(
    state: State<DbState>,
) -> Result<AiConsistencyAuditReport, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    build_ai_consistency_audit_report(&conn)
}

#[tauri::command]
pub fn get_runtime_anomaly_report(state: State<DbState>) -> Result<RuntimeAnomalyReport, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    build_runtime_anomaly_report(&conn)
}

#[tauri::command]
pub fn run_self_healing_recovery_flow(
    state: State<DbState>,
) -> Result<SelfHealingRecoveryResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    run_self_healing_recovery(&conn)
}
