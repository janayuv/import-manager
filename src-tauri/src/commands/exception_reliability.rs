//! Integrity checks, SLA escalation, revalidation, metrics, timeouts, stress simulation.

use crate::commands::exception_workflow::{
    insert_lifecycle, refresh_all_open_exception_sla, sync_exception_cases_for_shipment_scope,
};
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

pub fn log_integrity_issue(
    conn: &Connection,
    exception_id: &str,
    issue_type: &str,
    details: &str,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO exception_integrity_log (id, exception_id, issue_type, details)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, exception_id, issue_type, details],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Full scan: missing entities, invalid resolved state, duplicate opens, orphaned resolution rows.
/// When `persist` is false, counts issues only (no integrity log rows, no metadata bump).
fn validate_exception_integrity_inner(conn: &Connection, persist: bool) -> Result<i64, String> {
    let mut logged = 0i64;
    let ts = now_local();

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.entity_id FROM exception_cases c
             WHERE c.entity_type = 'shipment'
               AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.id = c.entity_id)",
        )
        .map_err(|e| e.to_string())?;
    let missing: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (cid, eid) in missing {
        if persist {
            log_integrity_issue(
                conn,
                &cid,
                "MISSING_ENTITY_REFERENCE",
                &format!("entity_id={eid} has no shipment row"),
            )?;
        }
        logged += 1;
    }

    let mut stmt = conn
        .prepare(
            "SELECT id FROM exception_cases
             WHERE status IN ('RESOLVED','IGNORED')
               AND (resolved_at IS NULL OR trim(resolved_at) = '')",
        )
        .map_err(|e| e.to_string())?;
    let bad_res: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for cid in bad_res {
        if persist {
            log_integrity_issue(
                conn,
                &cid,
                "INVALID_RESOLVED_STATE",
                "status RESOLVED/IGNORED but resolved_at empty",
            )?;
        }
        logged += 1;
    }

    let mut stmt = conn
        .prepare(
            "SELECT exception_type, entity_id, COUNT(*) AS n
             FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS')
             GROUP BY exception_type, entity_id
             HAVING n > 1",
        )
        .map_err(|e| e.to_string())?;
    let dups: Vec<(String, String, i64)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (et, eid, n) in dups {
        if persist {
            log_integrity_issue(
                conn,
                "",
                "DUPLICATE_OPEN_EXCEPTIONS",
                &format!("type={et} entity_id={eid} open_count={n}"),
            )?;
        }
        logged += 1;
    }

    let mut stmt = conn
        .prepare(
            "SELECT r.resolution_id FROM exception_resolution_log r
             LEFT JOIN exception_cases c ON c.id = r.exception_case_id
             WHERE c.id IS NULL",
        )
        .map_err(|e| e.to_string())?;
    let orphans: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for rid in orphans {
        if persist {
            log_integrity_issue(
                conn,
                &rid,
                "ORPHANED_RESOLUTION_RECORD",
                "resolution_log row references missing exception_case",
            )?;
        }
        logged += 1;
    }

    if persist {
        let _ = conn.execute(
            "INSERT INTO app_metadata (key, value) VALUES ('last_integrity_check_at', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![&ts],
        );
    }

    Ok(logged)
}

/// Full scan with logging to `exception_integrity_log` and `last_integrity_check_at` metadata.
pub fn validate_exception_integrity(conn: &Connection) -> Result<i64, String> {
    validate_exception_integrity_inner(conn, true)
}

/// Same checks as [`validate_exception_integrity`] without persisting (readiness / diagnostics).
pub fn peek_exception_integrity_issue_count(conn: &Connection) -> Result<i64, String> {
    validate_exception_integrity_inner(conn, false)
}

pub fn is_valid_status_transition(from_status: Option<&str>, to_status: &str) -> bool {
    match from_status.unwrap_or("") {
        "RESOLVED" | "IGNORED" => matches!(to_status, "RESOLVED" | "IGNORED"),
        "OPEN" => matches!(
            to_status,
            "OPEN" | "IN_PROGRESS" | "RESOLVED" | "IGNORED"
        ),
        "IN_PROGRESS" => matches!(to_status, "IN_PROGRESS" | "RESOLVED" | "IGNORED" | "OPEN"),
        "" => true,
        _ => matches!(
            to_status,
            "OPEN" | "IN_PROGRESS" | "RESOLVED" | "IGNORED"
        ),
    }
}

/// Block creating a second open row for same type+entity.
pub fn assert_case_open_for_resolution(conn: &Connection, case_id: &str) -> Result<(), String> {
    let status: String = conn
        .query_row(
            "SELECT status FROM exception_cases WHERE id = ?1",
            params![case_id],
            |r| r.get(0),
        )
        .map_err(|_| format!("exception case not found: {case_id}"))?;
    if status != "OPEN" && status != "IN_PROGRESS" {
        return Err(format!(
            "case {case_id} is not open for resolution (status={status})"
        ));
    }
    Ok(())
}

pub fn assert_shipment_entity_exists(conn: &Connection, entity_id: &str) -> Result<(), String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM shipments WHERE id = ?1",
            params![entity_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if n == 0 {
        return Err(format!("no shipment for entity_id={entity_id}"));
    }
    Ok(())
}

pub fn ensure_no_duplicate_open_case(
    conn: &Connection,
    exception_type: &str,
    entity_id: &str,
) -> Result<(), String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE exception_type = ?1 AND entity_id = ?2 AND status IN ('OPEN','IN_PROGRESS')",
            params![exception_type, entity_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if n > 0 {
        return Err(format!(
            "integrity: duplicate open case for {exception_type} / {entity_id}"
        ));
    }
    Ok(())
}

pub fn bump_recurrence_on_new_open(
    conn: &Connection,
    case_id: &str,
    exception_type: &str,
    entity_id: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO exception_recurrence_counts (exception_type, entity_id, total_opens, last_opened_at)
         VALUES (?1, ?2, 1, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
         ON CONFLICT(exception_type, entity_id) DO UPDATE SET
           total_opens = total_opens + 1,
           last_opened_at = excluded.last_opened_at",
        params![exception_type, entity_id],
    )
    .map_err(|e| e.to_string())?;
    let total: i64 = conn
        .query_row(
            "SELECT total_opens FROM exception_recurrence_counts WHERE exception_type = ?1 AND entity_id = ?2",
            params![exception_type, entity_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if total >= 3 {
        conn.execute(
            "UPDATE exception_cases SET recurrence_flag = 1, updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime') WHERE id = ?1",
            params![case_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn escalation_cooldown_hours(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT CAST(value AS INTEGER) FROM app_metadata WHERE key = 'exception_escalation_cooldown_hours'",
        [],
        |r| r.get(0),
    )
    .unwrap_or(24)
    .max(1)
    .min(168)
}

/// Escalate SLA-breached open cases (priority CRITICAL, log, lifecycle).
pub fn run_sla_escalation_engine(conn: &Connection) -> Result<i32, String> {
    refresh_all_open_exception_sla(conn)?;
    let cool = escalation_cooldown_hours(conn);
    let cool_off = format!("-{cool} hours");
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.exception_type FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS')
               AND c.exception_type != 'STRESS_TEST'
               AND c.sla_status = 'BREACHED'
               AND COALESCE(c.escalation_level, 0) = 0
               AND NOT EXISTS (
                 SELECT 1 FROM exception_escalation_log e
                 WHERE e.exception_case_id = c.id
                   AND datetime(e.created_at) > datetime('now', ?1)
               )",
        )
        .map_err(|e| e.to_string())?;
    let targets: Vec<(String, String)> = stmt
        .query_map(params![&cool_off], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();

    let mut n = 0i32;
    let now = now_local();
    for (cid, et) in targets {
        let notify: String = conn
            .query_row(
                "SELECT notify_role FROM exception_sla_escalation_rules WHERE exception_type = ?1 AND escalation_level = 1 LIMIT 1",
                params![&et],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "admin".to_string());

        let eid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO exception_escalation_log (id, exception_case_id, exception_type, escalation_level, notify_role, details, created_at)
             VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6)",
            params![
                eid,
                &cid,
                &et,
                &notify,
                "{\"reason\":\"SLA_BREACHED\"}",
                &now
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE exception_cases SET priority = 'CRITICAL', escalation_level = 1, escalated_at = ?2,
             updated_at = ?2 WHERE id = ?1",
            params![&cid, &now],
        )
        .map_err(|e| e.to_string())?;

        insert_lifecycle(
            conn,
            &cid,
            "SLA_ESCALATED",
            None,
            &format!("{{\"notifyRole\":\"{notify}\",\"level\":1}}"),
        )?;
        n += 1;
    }
    Ok(n)
}

/// Global re-sync: same rules as dashboard scope over all shipments.
pub fn revalidate_open_exceptions(conn: &Connection) -> Result<(), String> {
    sync_exception_cases_for_shipment_scope(conn, "1=1", &[])?;
    refresh_all_open_exception_sla(conn)?;
    Ok(())
}

fn workflow_in_progress_timeout_days(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT CAST(value AS INTEGER) FROM app_metadata WHERE key = 'workflow_in_progress_timeout_days'",
        [],
        |r| r.get(0),
    )
    .unwrap_or(7)
    .max(1)
    .min(90)
}

pub fn run_workflow_timeout_scan(conn: &Connection) -> Result<i32, String> {
    let days = workflow_in_progress_timeout_days(conn);
    let off = format!("-{days} days");
    let mut stmt = conn
        .prepare(
            "SELECT id, assigned_to FROM exception_cases
             WHERE status = 'IN_PROGRESS'
               AND workflow_timeout_flag = 0
               AND datetime(updated_at) < datetime('now', ?1)",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, Option<String>)> = stmt
        .query_map(params![&off], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    let now = now_local();
    let mut n = 0i32;
    for (cid, assignee) in rows {
        conn.execute(
            "UPDATE exception_cases SET workflow_timeout_flag = 1, updated_at = ?2 WHERE id = ?1",
            params![&cid, &now],
        )
        .map_err(|e| e.to_string())?;
        let role = if assignee.as_deref().unwrap_or("").is_empty() {
            "admin"
        } else {
            "assignee"
        };
        insert_lifecycle(
            conn,
            &cid,
            "WORKFLOW_TIMEOUT",
            None,
            &format!(
                "{{\"timeoutDays\":{days},\"notifyRoleHint\":\"{role}\"}}"
            ),
        )?;
        n += 1;
    }
    Ok(n)
}

pub fn recalculate_open_exception_priorities(conn: &Connection) -> Result<i32, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, exception_type, sla_status,
                    CAST((julianday(date('now')) - julianday(date(created_at))) AS INTEGER) AS age_days,
                    recurrence_flag, priority
             FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS')
               AND exception_type != 'STRESS_TEST'
               AND COALESCE(escalation_level, 0) = 0",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, i64, i64, String)> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get::<_, i64>(4)?,
                r.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();

    let mut updated = 0i32;
    for (id, et, sla, age, rec, cur) in rows {
        let mut score: i32 = 0;
        if sla == "BREACHED" {
            score += 4;
        } else if sla == "AT_RISK" {
            score += 2;
        }
        if age >= 14 {
            score += 3;
        } else if age >= 7 {
            score += 2;
        } else if age >= 3 {
            score += 1;
        }
        if rec == 1 {
            score += 2;
        }
        if et == "OVERDUE_ETA" {
            score += 1;
        }
        let new_p = match score {
            0..=1 => "LOW",
            2..=3 => "MEDIUM",
            4..=5 => "HIGH",
            _ => "CRITICAL",
        };
        if new_p != cur.as_str() {
            conn.execute(
                "UPDATE exception_cases SET priority = ?2, updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime') WHERE id = ?1",
                params![&id, new_p],
            )
            .map_err(|e| e.to_string())?;
            insert_lifecycle(
                conn,
                &id,
                "PRIORITY_RECALC",
                None,
                &format!("{{\"from\":\"{cur}\",\"to\":\"{new_p}\",\"score\":{score}}}"),
            )?;
            updated += 1;
        }
    }
    Ok(updated)
}

pub fn record_daily_sla_and_backlog_snapshots(conn: &Connection) -> Result<(), String> {
    let d = today_date();
    let open_c: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status = 'OPEN'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let prog_c: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status = 'IN_PROGRESS'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let crit_c: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN','IN_PROGRESS') AND priority = 'CRITICAL'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let res_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status = 'RESOLVED' AND date(resolved_at) = date(?1)",
            params![&d],
            |r| r.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO exception_backlog_snapshot (snapshot_date, open_count, in_progress_count, critical_count, resolved_today)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(snapshot_date) DO UPDATE SET
           open_count = excluded.open_count,
           in_progress_count = excluded.in_progress_count,
           critical_count = excluded.critical_count,
           resolved_today = excluded.resolved_today,
           created_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')",
        params![&d, open_c, prog_c, crit_c, res_today],
    )
    .map_err(|e| e.to_string())?;

    let breach_c: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN','IN_PROGRESS') AND sla_status = 'BREACHED'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let backlog = open_c + prog_c;
    let avg_hours: Option<f64> = conn
        .query_row(
            "SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0)
             FROM exception_cases WHERE status = 'RESOLVED' AND resolved_at IS NOT NULL AND date(resolved_at) = date(?1)",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    let resolved_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status = 'RESOLVED' AND date(resolved_at) = date(?1)",
            params![&d],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let met_sla: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status = 'RESOLVED' AND date(resolved_at) = date(?1)
               AND (sla_deadline IS NULL OR trim(sla_deadline) = '' OR date(resolved_at) <= date(sla_deadline))",
            params![&d],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let compliance = if resolved_today > 0 {
        met_sla as f64 / resolved_today as f64
    } else {
        1.0
    };

    conn.execute(
        "INSERT INTO exception_sla_metrics (snapshot_date, avg_resolution_hours, sla_compliance_rate, sla_breach_count, resolution_backlog)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(snapshot_date) DO UPDATE SET
           avg_resolution_hours = excluded.avg_resolution_hours,
           sla_compliance_rate = excluded.sla_compliance_rate,
           sla_breach_count = excluded.sla_breach_count,
           resolution_backlog = excluded.resolution_backlog,
           created_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')",
        params![
            &d,
            avg_hours.unwrap_or(0.0),
            compliance,
            breach_c,
            backlog
        ],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT resolved_by, COUNT(*) FROM exception_resolution_log WHERE date(resolved_at) = date(?1) GROUP BY resolved_by",
        )
        .map_err(|e| e.to_string())?;
    let by_user: Vec<(String, i64)> = stmt
        .query_map(params![&d], |r| Ok((r.get::<_, String>(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    let json_map: serde_json::Value = by_user
        .into_iter()
        .map(|(k, v)| (k, serde_json::json!(v)))
        .collect();

    let delay_avg: Option<f64> = conn
        .query_row(
            "SELECT AVG((julianday(resolved_at) - julianday(sla_deadline)) * 24.0)
             FROM exception_cases
             WHERE status='RESOLVED' AND date(resolved_at)=date(?1)
               AND sla_deadline IS NOT NULL AND trim(sla_deadline) != ''
               AND date(resolved_at) > date(sla_deadline)",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    let delay_avg = delay_avg.unwrap_or(0.0);
    let p90_simple: f64 = avg_hours.unwrap_or(0.0) * 1.5;

    conn.execute(
        "INSERT INTO exception_resolution_analytics (snapshot_date, avg_resolution_hours, p90_resolution_hours, resolved_count, resolutions_by_user_json, common_delay_hours)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(snapshot_date) DO UPDATE SET
           avg_resolution_hours = excluded.avg_resolution_hours,
           p90_resolution_hours = excluded.p90_resolution_hours,
           resolved_count = excluded.resolved_count,
           resolutions_by_user_json = excluded.resolutions_by_user_json,
           common_delay_hours = excluded.common_delay_hours,
           created_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')",
        params![
            &d,
            avg_hours.unwrap_or(0.0),
            p90_simple,
            resolved_today,
            serde_json::to_string(&json_map).unwrap_or_else(|_| "{}".into()),
            delay_avg
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulateLoadReport {
    pub inserted: i32,
    pub duration_ms: u64,
    pub cleaned: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule_simulation: Option<serde_json::Value>,
}

/// Admin stress path: temporary cases linked to real shipments, then removed.
pub fn simulate_exception_load(
    conn: &Connection,
    count: i32,
    user_id: &str,
    include_rule_simulation: bool,
) -> Result<SimulateLoadReport, String> {
    let n = count.max(1).min(500);
    let ship_ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM shipments ORDER BY RANDOM() LIMIT ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![n], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    if ship_ids.is_empty() {
        return Err("no shipments to attach stress cases".into());
    }
    let started_at = now_local();
    let t0 = std::time::Instant::now();
    let mut ins = 0i32;
    for sid in ship_ids.iter().take(n as usize) {
        let id = format!("STRESS-{}", Uuid::new_v4());
        let deadline: String = conn
            .query_row("SELECT date('now', '+1 day')", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO exception_cases (id, exception_type, entity_type, entity_id, status, priority, created_at, updated_at, sla_deadline, sla_status)
             VALUES (?1, 'STRESS_TEST', 'shipment', ?2, 'OPEN', 'LOW', strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), ?3, 'ON_TIME')",
            params![&id, sid, &deadline],
        )
        .map_err(|e| e.to_string())?;
        insert_lifecycle(conn, &id, "CREATED", Some(user_id), "{\"stress\":true}")?;
        ins += 1;
    }
    let elapsed = t0.elapsed().as_millis();
    let cleaned = conn
        .execute(
            "DELETE FROM exception_cases WHERE exception_type = 'STRESS_TEST'",
            [],
        )
        .map_err(|e| e.to_string())? as i32;
    let completed = now_local();
    let failure_rate = if ins > 0 {
        1.0_f64 - (cleaned as f64 / ins as f64).min(1.0)
    } else {
        0.0
    };
    let recovery_ok = if ins > 0 { (cleaned == ins) as i32 } else { 1 };
    let rid = Uuid::new_v4().to_string();
    let rule_simulation = if include_rule_simulation {
        Some(simulate_rule_execution(conn)?)
    } else {
        None
    };
    let details = serde_json::json!({
        "userId": user_id,
        "peakLoad": ins,
        "ruleSimulation": rule_simulation,
    })
    .to_string();
    let _ = conn.execute(
        "INSERT INTO workflow_simulation_reports (id, user_id, started_at, completed_at, inserted, cleaned, duration_ms, peak_load, failure_rate, recovery_success, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            &rid,
            user_id,
            &started_at,
            &completed,
            ins,
            cleaned,
            elapsed as i64,
            ins,
            failure_rate,
            recovery_ok,
            &details,
        ],
    );
    Ok(SimulateLoadReport {
        inserted: ins,
        duration_ms: elapsed as u64,
        cleaned,
        rule_simulation,
    })
}

/// Chained maintenance: revalidate, SLA refresh, integrity scan, escalation, priorities, timeouts, snapshots.
/// Returns count of new integrity issues logged this run.
pub fn run_daily_exception_workflow_maintenance(conn: &Connection) -> Result<i64, String> {
    revalidate_open_exceptions(conn)?;
    refresh_all_open_exception_sla(conn)?;
    let integrity_new = validate_exception_integrity(conn)?;
    let _ = run_sla_escalation_engine(conn)?;
    let _ = recalculate_open_exception_priorities(conn)?;
    let _ = run_workflow_timeout_scan(conn)?;
    record_daily_sla_and_backlog_snapshots(conn)?;
    let ts = now_local();
    let _ = conn.execute(
        "INSERT INTO app_metadata (key, value) VALUES ('last_workflow_maintenance_at', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![&ts],
    );
    Ok(integrity_new)
}

#[tauri::command]
pub fn validate_exception_integrity_command(state: State<DbState>) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    validate_exception_integrity(&conn)
}

#[tauri::command]
pub fn revalidate_open_exceptions_command(state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    revalidate_open_exceptions(&conn)
}

/// Dry-run automation counts (no writes).
pub fn simulate_rule_execution(conn: &Connection) -> Result<serde_json::Value, String> {
    let overdue: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases c JOIN shipments s ON s.id = c.entity_id
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type = 'OVERDUE_ETA'
               AND s.status IS NOT NULL AND LOWER(s.status) IN ('delivered','completed')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let boe: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type = 'MISSING_BOE'
               AND EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = c.entity_id)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let exp: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type = 'MISSING_EXPENSE'
               AND EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = c.entity_id)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let unassigned: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type != 'STRESS_TEST'
               AND (c.assigned_to IS NULL OR trim(c.assigned_to) = '')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let prio: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND COALESCE(recurrence_flag,0) = 1
               AND priority IN ('LOW','MEDIUM')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(serde_json::json!({
        "predictedAutoResolves": overdue + boe + exp,
        "predictedByPredicate": {
            "shipmentDeliveredOverdue": overdue,
            "missingBoeWithBoe": boe,
            "missingExpenseWithExpense": exp,
        },
        "predictedAssignments": unassigned.min(40),
        "predictedPriorityAdjusts": prio.min(80),
    }))
}

fn assert_simulate_rule_view(role: &str) -> Result<(), String> {
    let n: String = role
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase();
    if n.contains("admin")
        || n.contains("automationmanager")
        || n.contains("viewer")
    {
        Ok(())
    } else {
        Err("simulate_rule_execution: insufficient role".into())
    }
}

#[tauri::command]
pub fn simulate_rule_execution_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    assert_simulate_rule_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    simulate_rule_execution(&conn)
}

#[tauri::command]
pub fn simulate_exception_load_command(
    count: Option<i32>,
    user_id: String,
    include_rule_simulation: Option<bool>,
    state: State<DbState>,
) -> Result<SimulateLoadReport, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    simulate_exception_load(
        &conn,
        count.unwrap_or(50),
        &user_id,
        include_rule_simulation.unwrap_or(false),
    )
}

#[tauri::command]
pub fn get_exception_reliability_report(state: State<DbState>) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut sla: Vec<serde_json::Value> = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT snapshot_date, avg_resolution_hours, sla_compliance_rate, sla_breach_count, resolution_backlog
             FROM exception_sla_metrics ORDER BY snapshot_date DESC LIMIT 90",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "snapshotDate": r.get::<_, String>(0)?,
                "avgResolutionHours": r.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                "slaComplianceRate": r.get::<_, f64>(2)?,
                "slaBreachCount": r.get::<_, i64>(3)?,
                "resolutionBacklog": r.get::<_, i64>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    for x in rows {
        sla.push(x.map_err(|e| e.to_string())?);
    }

    let mut backlog: Vec<serde_json::Value> = Vec::new();
    let mut stmt2 = conn
        .prepare(
            "SELECT snapshot_date, open_count, in_progress_count, critical_count, resolved_today
             FROM exception_backlog_snapshot ORDER BY snapshot_date DESC LIMIT 90",
        )
        .map_err(|e| e.to_string())?;
    let rows2 = stmt2
        .query_map([], |r| {
            Ok(serde_json::json!({
                "snapshotDate": r.get::<_, String>(0)?,
                "openCount": r.get::<_, i64>(1)?,
                "inProgressCount": r.get::<_, i64>(2)?,
                "criticalCount": r.get::<_, i64>(3)?,
                "resolvedToday": r.get::<_, i64>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    for x in rows2 {
        backlog.push(x.map_err(|e| e.to_string())?);
    }

    let latest_analytics: Option<serde_json::Value> = conn
        .query_row(
            "SELECT snapshot_date, avg_resolution_hours, p90_resolution_hours, resolved_count,
                    resolutions_by_user_json, common_delay_hours
             FROM exception_resolution_analytics ORDER BY snapshot_date DESC LIMIT 1",
            [],
            |r| {
                Ok(serde_json::json!({
                    "snapshotDate": r.get::<_, String>(0)?,
                    "avgResolutionHours": r.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                    "p90ResolutionHours": r.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                    "resolvedCount": r.get::<_, i64>(3)?,
                    "resolutionsByUserJson": r.get::<_, String>(4)?,
                    "commonDelayHours": r.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let integrity_recent: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_integrity_log
             WHERE datetime(detected_at) >= datetime('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(serde_json::json!({
        "slaMetrics": sla,
        "backlogSnapshots": backlog,
        "latestResolutionAnalytics": latest_analytics,
        "integrityIssuesLast7Days": integrity_recent,
    }))
}
