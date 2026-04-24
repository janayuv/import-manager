//! Rule-driven automation: auto-resolve, assignment, adaptive SLA, self-heal, guardrails, audit log.

use crate::commands::dashboard_cache;
use crate::commands::exception_workflow::{insert_lifecycle, refresh_all_open_exception_sla};
use crate::commands::workflow_production_observability::{log_structured_event, record_performance_timing};
use crate::commands::workflow_multienv::{active_execution_environment_id, active_tenant_id};
use crate::commands::workflow_rule_deployment::canary_allows_case_for_rule;
use crate::db::DbState;
use rusqlite::types::ToSql;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;
use tauri::State;
use uuid::Uuid;

fn now_local() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today_date() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
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

fn meta_i64(conn: &Connection, key: &str, default: i64) -> i64 {
    conn.query_row(
        "SELECT CAST(value AS INTEGER) FROM app_metadata WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .unwrap_or(default)
}

fn automation_paused(conn: &Connection) -> bool {
    let until = meta_get(conn, "automation_paused_until").trim().to_string();
    if until.is_empty() {
        return false;
    }
    conn.query_row(
        "SELECT CASE WHEN datetime('now') < datetime(?1) THEN 1 ELSE 0 END",
        params![&until],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        == 1
}

fn clear_pause_if_expired(conn: &Connection) -> Result<(), String> {
    let until = meta_get(conn, "automation_paused_until").trim().to_string();
    if until.is_empty() {
        return Ok(());
    }
    let still: i64 = conn
        .query_row(
            "SELECT CASE WHEN datetime('now') < datetime(?1) THEN 1 ELSE 0 END",
            params![&until],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if still == 0 {
        meta_set(conn, "automation_paused_until", "")?;
        meta_set(conn, "automation_last_pause_reason", "")?;
    }
    Ok(())
}

fn hourly_action_count(conn: &Connection, action_prefix: &str) -> Result<i64, String> {
    let pat = format!("{action_prefix}%");
    conn.query_row(
        "SELECT COUNT(*) FROM workflow_automation_log
         WHERE action_taken LIKE ?1 AND datetime(executed_at) > datetime('now', '-1 hour')",
        params![&pat],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

fn pause_automation(conn: &Connection, reason: &str) -> Result<(), String> {
    let mins = meta_i64(conn, "automation_pause_duration_minutes", 60)
        .max(5)
        .min(24 * 60);
    let off = format!("+{mins} minutes");
    let until: String = conn
        .query_row("SELECT datetime('now', ?1)", params![&off], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    meta_set(conn, "automation_paused_until", &until)?;
    meta_set(conn, "automation_last_pause_reason", reason)?;
    log_automation(
        conn,
        "",
        "AUTOMATION_PAUSED",
        "system",
        &json!({ "reason": reason, "until": until }).to_string(),
    )?;
    Ok(())
}

fn resolve_cost_weight(conn: &Connection, rule_id: &str, action_taken: &str) -> (f64, f64) {
    conn.query_row(
        "SELECT cost_weight, estimated_time_ms FROM rule_execution_cost_estimate
         WHERE action_type = ?1 AND (trim(rule_id) = trim(?2) OR trim(rule_id) = '')
         ORDER BY CASE WHEN trim(rule_id) = trim(?2) THEN 0 ELSE 1 END LIMIT 1",
        params![action_taken, rule_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )
    .unwrap_or((1.0, 50.0))
}

fn compute_log_cost_fields(
    conn: &Connection,
    rule_id: &str,
    action_taken: &str,
    records_processed: i64,
    measured_ms: i64,
    cost_units_override: Option<f64>,
) -> (i64, i64, f64) {
    if let Some(u) = cost_units_override {
        let ms = measured_ms.max(0);
        let rec = records_processed.max(0);
        return (ms, rec, u);
    }
    let (weight, est_ms) = resolve_cost_weight(conn, rule_id, action_taken);
    let rec = records_processed.max(0);
    let effective_ms = if measured_ms > 0 {
        measured_ms
    } else {
        let mult = if rec > 0 { rec as f64 } else { 1.0 };
        (est_ms * mult).round() as i64
    };
    let units = (effective_ms as f64 / 1000.0) * weight;
    (effective_ms, rec, units)
}

/// Per-action effectiveness + cost columns on `workflow_automation_log`.
pub fn log_automation(
    conn: &Connection,
    rule_id: &str,
    action_taken: &str,
    target_entity: &str,
    execution_result: &str,
) -> Result<(), String> {
    log_automation_effectiveness(
        conn,
        rule_id,
        action_taken,
        target_entity,
        execution_result,
        0,
        0,
        0,
        0,
        0.0,
    )
}

pub fn log_automation_effectiveness(
    conn: &Connection,
    rule_id: &str,
    action_taken: &str,
    target_entity: &str,
    execution_result: &str,
    cases_resolved: i64,
    cases_assigned: i64,
    priority_adjustments: i64,
    sla_improvements: i64,
    resolution_time_reduction_hours: f64,
) -> Result<(), String> {
    log_automation_effectiveness_cost(
        conn,
        rule_id,
        action_taken,
        target_entity,
        execution_result,
        cases_resolved,
        cases_assigned,
        priority_adjustments,
        sla_improvements,
        resolution_time_reduction_hours,
        0,
        0,
        None,
    )
}

/// `measured_ms` from wall clock; `cost_units_override` skips derived cost when set.
pub fn log_automation_effectiveness_cost(
    conn: &Connection,
    rule_id: &str,
    action_taken: &str,
    target_entity: &str,
    execution_result: &str,
    cases_resolved: i64,
    cases_assigned: i64,
    priority_adjustments: i64,
    sla_improvements: i64,
    resolution_time_reduction_hours: f64,
    records_processed: i64,
    measured_ms: i64,
    cost_units_override: Option<f64>,
) -> Result<(), String> {
    let (actual_ms, rec, units) = compute_log_cost_fields(
        conn,
        rule_id,
        action_taken,
        records_processed,
        measured_ms,
        cost_units_override,
    );
    let id = Uuid::new_v4().to_string();
    let ts = now_local();
    let tenant_id = active_tenant_id(conn);
    conn.execute(
        "INSERT INTO workflow_automation_log (
            automation_id, rule_id, action_taken, target_entity, executed_at, execution_result,
            cases_resolved, cases_assigned, priority_adjustments, sla_improvements, resolution_time_reduction_hours,
            actual_execution_time_ms, records_processed, estimated_cost_units, tenant_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            &id,
            rule_id,
            action_taken,
            target_entity,
            &ts,
            execution_result,
            cases_resolved,
            cases_assigned,
            priority_adjustments,
            sla_improvements,
            resolution_time_reduction_hours,
            actual_ms,
            rec,
            units,
            &tenant_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn master_enabled(conn: &Connection) -> bool {
    meta_get(conn, "workflow_automation_master_enabled").trim() != "0"
}

fn enabled_rules_of_type(conn: &Connection, rule_type: &str) -> i64 {
    let tid = active_tenant_id(conn);
    conn.query_row(
        "SELECT COUNT(*) FROM workflow_decision_rules WHERE enabled = 1 AND rule_type = ?1 AND tenant_id = ?2",
        params![rule_type, &tid],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// Safe auto-resolve when shipment state / BOE / expenses clear the underlying issue.
pub fn auto_resolve_exception_cases(conn: &Connection) -> Result<i32, String> {
    if enabled_rules_of_type(conn, "AUTO_RESOLVE") == 0 {
        return Ok(0);
    }
    let max_h = meta_i64(
        conn,
        "automation_max_auto_resolve_per_hour",
        40,
    )
    .max(1)
    .min(500);
    let used = hourly_action_count(conn, "AUTO_RESOLVE")?;
    if used >= max_h {
        pause_automation(conn, "max_auto_resolve_per_hour exceeded")?;
        return Ok(0);
    }
    let mut budget = max_h - used;
    let now = now_local();
    let mut total = 0i32;

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.exception_type, c.entity_id FROM exception_cases c
             JOIN shipments s ON s.id = c.entity_id
             WHERE c.status IN ('OPEN','IN_PROGRESS')
               AND c.exception_type = 'OVERDUE_ETA'
               AND s.status IS NOT NULL AND LOWER(s.status) IN ('delivered','completed')",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();

    for (cid, et, eid) in rows {
        if budget <= 0 {
            break;
        }
        resolve_one_case_auto(conn, &cid, &et, &eid, &now, "rule-auto-resolve-overdue-delivered", "shipment_delivered")?;
        budget -= 1;
        total += 1;
    }

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.exception_type, c.entity_id FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS')
               AND c.exception_type = 'MISSING_BOE'
               AND EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = c.entity_id)",
        )
        .map_err(|e| e.to_string())?;
    let rows2: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (cid, et, eid) in rows2 {
        if budget <= 0 {
            break;
        }
        resolve_one_case_auto(conn, &cid, &et, &eid, &now, "rule-auto-resolve-boe-present", "has_boe")?;
        budget -= 1;
        total += 1;
    }

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.exception_type, c.entity_id FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS')
               AND c.exception_type = 'MISSING_EXPENSE'
               AND EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = c.entity_id)",
        )
        .map_err(|e| e.to_string())?;
    let rows3: Vec<(String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (cid, et, eid) in rows3 {
        if budget <= 0 {
            break;
        }
        resolve_one_case_auto(
            conn,
            &cid,
            &et,
            &eid,
            &now,
            "rule-auto-resolve-expense-present",
            "has_expenses",
        )?;
        budget -= 1;
        total += 1;
    }

    Ok(total)
}

fn resolve_one_case_auto(
    conn: &Connection,
    cid: &str,
    et: &str,
    eid: &str,
    now: &str,
    rule_id: &str,
    predicate: &str,
) -> Result<(), String> {
    if !canary_allows_case_for_rule(conn, rule_id, cid)? {
        return Ok(());
    }
    let t0 = Instant::now();
    let (created_at, sla_status): (String, String) = conn
        .query_row(
            "SELECT created_at, COALESCE(sla_status,'') FROM exception_cases WHERE id = ?1",
            params![cid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let open_h: f64 = conn
        .query_row(
            "SELECT (julianday(?2) - julianday(?1)) * 24.0",
            params![&created_at, now],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let baseline = sla_base_hours(et);
    let time_saved = (baseline - open_h).max(0.0);
    let sla_improvements = if sla_status == "BREACHED" { 1i64 } else { 0i64 };

    conn.execute(
        "UPDATE exception_cases SET status = 'RESOLVED', resolved_at = ?2, resolved_by = 'automation',
         updated_at = ?2, sla_status = 'ON_TIME'
         WHERE id = ?1",
        params![cid, now],
    )
    .map_err(|e| e.to_string())?;
    let det = json!({
        "source": "auto_resolve_exception_cases",
        "predicate": predicate,
        "ruleId": rule_id,
    })
    .to_string();
    insert_lifecycle(conn, cid, "AUTO_RESOLVED", Some("automation"), &det)?;
    let rid = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO exception_resolution_log (resolution_id, exception_case_id, exception_type, entity_id, status, resolved_by, resolved_at, notes)
         VALUES (?1, ?2, ?3, ?4, 'RESOLVED', 'automation', ?5, 'AUTO_RESOLVED')",
        params![&rid, cid, et, eid, now],
    )
    .map_err(|e| e.to_string())?;
    let ms = t0.elapsed().as_millis() as i64;
    log_automation_effectiveness_cost(
        conn,
        rule_id,
        "AUTO_RESOLVE",
        cid,
        &json!({ "ok": true, "exceptionType": et, "entityId": eid }).to_string(),
        1,
        0,
        0,
        sla_improvements,
        time_saved,
        1,
        ms,
        None,
    )?;
    Ok(())
}

/// Assign unassigned open cases using load-aware user selection from `user_roles`.
pub fn auto_assign_exception_cases(conn: &Connection) -> Result<i32, String> {
    if enabled_rules_of_type(conn, "AUTO_ASSIGN") == 0 {
        return Ok(0);
    }
    let mut stmt = conn
        .prepare(
            "SELECT c.id FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS')
               AND c.exception_type != 'STRESS_TEST'
               AND (c.assigned_to IS NULL OR trim(c.assigned_to) = '')
             LIMIT 40",
        )
        .map_err(|e| e.to_string())?;
    let case_ids: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    if case_ids.is_empty() {
        return Ok(0);
    }

    let mut ustmt = conn
        .prepare(
            "SELECT DISTINCT user_id FROM user_roles
             WHERE lower(role) IN ('admin','user','db_manager')
             ORDER BY user_id",
        )
        .map_err(|e| e.to_string())?;
    let mut users: Vec<String> = ustmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    if users.is_empty() {
        users.push("admin-001".into());
    }

    let mut loads: Vec<(String, i64)> = users
        .iter()
        .map(|u| {
            let n: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM exception_cases
                     WHERE status IN ('OPEN','IN_PROGRESS') AND assigned_to = ?1",
                    params![u],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            (u.clone(), n)
        })
        .collect();
    loads.sort_by(|a, b| a.1.cmp(&b.1));

    let mut n = 0i32;
    let now = now_local();
    let mut idx = 0usize;
    for cid in case_ids {
        if !canary_allows_case_for_rule(conn, "rule-auto-assign-load-balance", &cid)? {
            continue;
        }
        let pick = idx % loads.len();
        let uid = loads[pick].0.clone();
        idx += 1;
        conn.execute(
            "UPDATE exception_cases SET assigned_to = ?2, assigned_at = ?3, updated_at = ?3,
             assignment_method = 'AUTO_LOAD_BALANCED' WHERE id = ?1",
            params![&cid, &uid, &now],
        )
        .map_err(|e| e.to_string())?;
        let det = json!({
            "assignedTo": &uid,
            "method": "AUTO_LOAD_BALANCED",
            "ruleId": "rule-auto-assign-load-balance",
        })
        .to_string();
        insert_lifecycle(conn, &cid, "ASSIGNED", Some("automation"), &det)?;
        let ta = Instant::now();
        log_automation_effectiveness_cost(
            conn,
            "rule-auto-assign-load-balance",
            "AUTO_ASSIGN",
            &cid,
            &json!({ "ok": true, "assignedTo": &uid }).to_string(),
            0,
            1,
            0,
            0,
            0.0,
            1,
            ta.elapsed().as_millis() as i64,
            None,
        )?;
        if let Some(slot) = loads.iter_mut().find(|(u, _)| u == &uid) {
            slot.1 += 1;
        }
        loads.sort_by(|a, b| a.1.cmp(&b.1));
        n += 1;
    }
    Ok(n)
}

fn sla_base_hours(exception_type: &str) -> f64 {
    match exception_type {
        "OVERDUE_ETA" => 48.0,
        "MISSING_BOE" | "MISSING_EXPENSE" => 24.0,
        _ => 24.0,
    }
}

/// Record adaptive SLA recommendations; optionally applies new deadlines when `automation_adaptive_sla_apply` = 1.
pub fn apply_adaptive_sla_engine(conn: &Connection) -> Result<i32, String> {
    let d = today_date();
    let types = ["OVERDUE_ETA", "MISSING_BOE", "MISSING_EXPENSE"];
    let mut rows = 0i32;
    for et in types {
        let avg_h: Option<f64> = conn
            .query_row(
                "SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0)
                 FROM exception_cases
                 WHERE exception_type = ?1 AND status IN ('RESOLVED','IGNORED')
                   AND resolved_at IS NOT NULL AND datetime(resolved_at) > datetime('now', '-120 days')",
                params![et],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        let base = sla_base_hours(et);
        let avg = avg_h.unwrap_or(base);
        let rec: f64 = (avg * 1.15).max(base).min(base * 3.0);
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO adaptive_sla_adjustments (id, exception_type, snapshot_date, previous_hours, adjusted_hours, factors_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(exception_type, snapshot_date) DO UPDATE SET
               previous_hours = excluded.previous_hours,
               adjusted_hours = excluded.adjusted_hours,
               factors_json = excluded.factors_json,
               created_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')",
            params![
                &id,
                et,
                &d,
                base,
                rec,
                &json!({ "avgResolutionHours": avg }).to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
        rows += 1;
    }

    if meta_get(conn, "automation_adaptive_sla_apply").trim() == "1" {
        let t_apply = Instant::now();
        let mut sla_touches = 0usize;
        for et in types {
            let adj: f64 = conn
                .query_row(
                    "SELECT adjusted_hours FROM adaptive_sla_adjustments WHERE exception_type = ?1 AND snapshot_date = ?2",
                    params![et, &d],
                    |r| r.get(0),
                )
                .unwrap_or(sla_base_hours(et));
            let days = (adj / 24.0).ceil() as i64;
            let off = format!("+{days} days");
            let ch = conn
                .execute(
                    "UPDATE exception_cases SET sla_deadline = date(created_at, ?2), updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
                     WHERE status IN ('OPEN','IN_PROGRESS') AND exception_type = ?1",
                    params![et, &off],
                )
                .map_err(|e| e.to_string())?;
            sla_touches += ch;
        }
        refresh_all_open_exception_sla(conn)?;
        let st = sla_touches as i64;
        let ms = t_apply.elapsed().as_millis() as i64;
        log_automation_effectiveness_cost(
            conn,
            "",
            "ADAPTIVE_SLA",
            "open_cases",
            &json!({ "applied": true, "date": d, "openCasesTouched": st }).to_string(),
            0,
            0,
            0,
            st,
            0.0,
            st.max(1),
            ms,
            None,
        )?;
    }
    Ok(rows)
}

/// Raise priority for recurring open cases (bounded per cycle).
pub fn run_priority_adjust_rules(conn: &Connection) -> Result<i32, String> {
    if enabled_rules_of_type(conn, "PRIORITY_ADJUST") == 0 {
        return Ok(0);
    }
    let cap = meta_i64(
        conn,
        "automation_max_priority_adjust_per_cycle",
        80,
    )
    .max(1)
    .min(500);
    let mut n = 0i32;
    let mut stmt = conn
        .prepare(
            "SELECT id, priority FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS')
               AND COALESCE(recurrence_flag,0) = 1
               AND priority IN ('LOW','MEDIUM')
               AND exception_type != 'STRESS_TEST'
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<(String, String)> = stmt
        .query_map(params![cap], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (cid, from_prio) in ids {
        if !canary_allows_case_for_rule(conn, "rule-priority-recurrence", &cid)? {
            continue;
        }
        conn.execute(
            "UPDATE exception_cases SET priority = 'HIGH', updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime') WHERE id = ?1",
            params![&cid],
        )
        .map_err(|e| e.to_string())?;
        let det = json!({
            "ruleId": "rule-priority-recurrence",
            "from": &from_prio,
            "to": "HIGH",
        })
        .to_string();
        insert_lifecycle(conn, &cid, "PRIORITY_CHANGED", Some("automation"), &det)?;
        let tp = Instant::now();
        log_automation_effectiveness_cost(
            conn,
            "rule-priority-recurrence",
            "PRIORITY_ADJUST",
            &cid,
            &json!({ "ok": true, "from": &from_prio, "to": "HIGH" }).to_string(),
            0,
            0,
            1,
            0,
            0.0,
            1,
            tp.elapsed().as_millis() as i64,
            None,
        )?;
        n += 1;
    }
    Ok(n)
}

fn repair_missing_lifecycle_events(conn: &Connection) -> Result<i64, String> {
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
        let det = json!({
            "source": "auto_repair_workflow_state",
            "resolvedAt": ra,
        })
        .to_string();
        let ev = if st == "IGNORED" { "IGNORED" } else { "RESOLVED" };
        let uid = if rb.is_empty() { None } else { Some(rb.as_str()) };
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
        let payload = json!({
            "source": "auto_repair_workflow_state",
            "escalationStepsRebuilt": esc_n,
        })
        .to_string();
        insert_lifecycle(conn, &cid, "SLA_ESCALATED", None, &payload)?;
        n += 1;
    }
    Ok(n)
}

/// Self-heal: lifecycle gaps, stale IN_PROGRESS, duplicate opens (keep newest).
pub fn auto_repair_workflow_state(conn: &Connection) -> Result<i32, String> {
    let mut repairs = 0i32;
    repairs += repair_missing_lifecycle_events(conn)? as i32;

    let now = now_local();
    let mut stmt = conn
        .prepare(
            "SELECT id FROM exception_cases
             WHERE status = 'IN_PROGRESS'
               AND datetime(updated_at) < datetime('now', '-14 days')",
        )
        .map_err(|e| e.to_string())?;
    let stale: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for cid in stale {
        conn.execute(
            "UPDATE exception_cases SET status = 'OPEN', workflow_timeout_flag = 0, updated_at = ?2 WHERE id = ?1",
            params![&cid, &now],
        )
        .map_err(|e| e.to_string())?;
        insert_lifecycle(
            conn,
            &cid,
            "AUTO_REPAIR",
            Some("automation"),
            "{\"reason\":\"stale_in_progress_reopened\"}",
        )?;
        log_automation(
            conn,
            "",
            "AUTO_REPAIR",
            &cid,
            "{\"reason\":\"stale_in_progress\"}",
        )?;
        repairs += 1;
    }

    let mut stmt2 = conn
        .prepare(
            "SELECT exception_type, entity_id FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS')
             GROUP BY exception_type, entity_id
             HAVING COUNT(*) > 1",
        )
        .map_err(|e| e.to_string())?;
    let dups: Vec<(String, String)> = stmt2
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (et, eid) in dups {
        let mut stmt3 = conn
            .prepare(
                "SELECT id FROM exception_cases
                 WHERE exception_type = ?1 AND entity_id = ?2 AND status IN ('OPEN','IN_PROGRESS')
                 ORDER BY datetime(created_at) DESC",
            )
            .map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt3
            .query_map(params![&et, &eid], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|x| x.ok())
            .collect();
        for (i, cid) in ids.iter().enumerate() {
            if i == 0 {
                continue;
            }
            conn.execute(
                "UPDATE exception_cases SET status = 'IGNORED', resolved_at = ?2, resolved_by = 'automation',
                 updated_at = ?2, sla_status = 'ON_TIME' WHERE id = ?1",
                params![cid, &now],
            )
            .map_err(|e| e.to_string())?;
            insert_lifecycle(
                conn,
                cid,
                "AUTO_REPAIR",
                Some("automation"),
                "{\"reason\":\"duplicate_open_collapsed\"}",
            )?;
            let rid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO exception_resolution_log (resolution_id, exception_case_id, exception_type, entity_id, status, resolved_by, resolved_at, notes)
                 VALUES (?1, ?2, ?3, ?4, 'IGNORED', 'automation', ?5, 'AUTO_REPAIR duplicate')",
                params![&rid, cid, et, eid, &now],
            )
            .map_err(|e| e.to_string())?;
            log_automation(
                conn,
                "",
                "AUTO_REPAIR",
                cid,
                "{\"reason\":\"duplicate_open\"}",
            )?;
            repairs += 1;
        }
    }

    Ok(repairs)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationCycleReport {
    pub skipped_paused: bool,
    pub auto_resolved: i32,
    pub auto_assigned: i32,
    pub priority_adjusted: i32,
    pub repairs: i32,
    pub adaptive_sla_rows: i32,
}

/// Orchestrates automation engines with guardrails and audit logging.
pub fn run_workflow_automation_cycle(conn: &Connection) -> Result<AutomationCycleReport, String> {
    clear_pause_if_expired(conn)?;
    if !master_enabled(conn) {
        return Ok(AutomationCycleReport {
            skipped_paused: false,
            auto_resolved: 0,
            auto_assigned: 0,
            priority_adjusted: 0,
            repairs: 0,
            adaptive_sla_rows: 0,
        });
    }
    if automation_paused(conn) {
        return Ok(AutomationCycleReport {
            skipped_paused: true,
            auto_resolved: 0,
            auto_assigned: 0,
            priority_adjusted: 0,
            repairs: 0,
            adaptive_sla_rows: 0,
        });
    }

    let ts_win = now_local();
    meta_set(conn, "automation_cycle_started_at", &ts_win)?;
    let cycle_clock = Instant::now();

    let repairs = auto_repair_workflow_state(conn)?;
    let auto_resolved = auto_resolve_exception_cases(conn)?;
    let auto_assigned = auto_assign_exception_cases(conn)?;
    let priority_adjusted = run_priority_adjust_rules(conn)?;
    let adaptive_sla_rows = apply_adaptive_sla_engine(conn)?;

    compute_daily_workflow_efficiency_score(conn)?;

    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(conn);

    let ts = now_local();
    let _ = meta_set(conn, "automation_last_cycle_at", &ts);
    let summary = json!({
        "autoResolved": auto_resolved,
        "autoAssigned": auto_assigned,
        "priorityAdjusted": priority_adjusted,
        "repairs": repairs,
        "adaptiveSlaRows": adaptive_sla_rows,
    })
    .to_string();
    let cycle_ms = cycle_clock.elapsed().as_millis() as i64;
    let records_cycle = i64::from(auto_resolved)
        + i64::from(auto_assigned)
        + i64::from(priority_adjusted)
        + i64::from(repairs)
        + i64::from(adaptive_sla_rows);
    let _ = log_automation_effectiveness_cost(
        conn,
        "",
        "AUTOMATION_CYCLE_SUMMARY",
        "batch",
        &summary,
        0,
        0,
        0,
        0,
        0.0,
        records_cycle.max(1),
        cycle_ms,
        None,
    );

    let (total_cu, total_ms_agg, total_rec, action_ct) =
        aggregate_cycle_cost_totals(conn, &ts_win)?;
    let tid = active_tenant_id(conn);
    let active_rules: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_decision_rules WHERE enabled = 1 AND tenant_id = ?1",
            params![&tid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let queue_depth: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN','IN_PROGRESS') AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let cap_factors = json!({
        "autoResolved": auto_resolved,
        "autoAssigned": auto_assigned,
        "priorityAdjusted": priority_adjusted,
        "repairs": repairs,
        "adaptiveSlaRows": adaptive_sla_rows,
        "aggregateCostUnits": total_cu,
        "aggregateLoggedMs": total_ms_agg,
        "aggregateRecords": total_rec,
    })
    .to_string();
    let _ = record_automation_capacity_load_snapshot(
        conn,
        active_rules,
        action_ct,
        total_rec,
        cycle_ms,
        queue_depth,
        total_cu,
        &cap_factors,
    );
    let _ = enforce_automation_cost_limits(conn, total_cu, cycle_ms, total_rec);

    let d = today_date();
    let _ = refresh_rule_effectiveness_metrics_for_date(conn, &d);
    let _ = refresh_rule_cost_efficiency_metrics_for_date(conn, &d);
    let _ = sync_automation_decision_feedback(conn);
    let _ = refresh_rule_safety_index_for_date(conn, &d);
    let _ = scan_automation_stability_alerts(conn);
    let _ = record_automation_benchmarks_if_due(conn);
    let _ = compute_automation_roi_snapshot(conn);
    let _ = compute_daily_automation_economics_index(conn);

    let total_cycle_ms = cycle_clock.elapsed().as_millis() as i64;
    let _ = record_performance_timing(
        conn,
        "automation_cycle",
        Some("automation_cycle"),
        total_cycle_ms,
        &json!({
            "autoResolved": auto_resolved,
            "autoAssigned": auto_assigned,
            "priorityAdjusted": priority_adjusted,
            "repairs": repairs,
            "adaptiveSlaRows": adaptive_sla_rows,
        }),
    );
    let _ = log_structured_event(
        conn,
        "automation_cycle",
        "automation_cycle_completed",
        Some("automation_cycle"),
        "INFO",
        &json!({
            "durationMs": total_cycle_ms,
            "autoResolved": auto_resolved,
            "autoAssigned": auto_assigned,
            "priorityAdjusted": priority_adjusted,
            "repairs": repairs,
            "adaptiveSlaRows": adaptive_sla_rows,
        }),
    );

    Ok(AutomationCycleReport {
        skipped_paused: false,
        auto_resolved,
        auto_assigned,
        priority_adjusted,
        repairs,
        adaptive_sla_rows,
    })
}

/// Efficiency score from resolution speed, SLA compliance, backlog, escalation rate.
pub fn compute_daily_workflow_efficiency_score(conn: &Connection) -> Result<(), String> {
    let d = today_date();
    let backlog: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN','IN_PROGRESS') AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let breached: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN','IN_PROGRESS') AND sla_status = 'BREACHED'",
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
    let avg_res: f64 = conn
        .query_row(
            "SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0)
             FROM exception_cases WHERE status = 'RESOLVED' AND resolved_at IS NOT NULL
               AND datetime(resolved_at) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(48.0);

    let mut score = 100.0_f64;
    score -= (backlog as f64 * 0.4).min(25.0);
    score -= (breached as f64 * 1.5).min(20.0);
    score -= (esc_today as f64 * 2.0).min(15.0);
    score -= (avg_res / 120.0 * 10.0).min(15.0);
    score = score.clamp(0.0, 100.0);

    let factors = json!({
        "backlogOpen": backlog,
        "slaBreachedOpen": breached,
        "escalationsToday": esc_today,
        "avgResolutionHours30d": avg_res,
    })
    .to_string();

    conn.execute(
        "INSERT INTO daily_workflow_efficiency_score (snapshot_date, efficiency_score, factors_json)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(snapshot_date) DO UPDATE SET
           efficiency_score = excluded.efficiency_score,
           factors_json = excluded.factors_json,
           created_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')",
        params![&d, score, &factors],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Automation cost intelligence (capacity, economics, guardrails) ---

fn aggregate_cycle_cost_totals(
    conn: &Connection,
    window_start: &str,
) -> Result<(f64, i64, i64, i64), String> {
    conn.query_row(
        "SELECT COALESCE(SUM(estimated_cost_units), 0.0),
                COALESCE(SUM(actual_execution_time_ms), 0),
                COALESCE(SUM(records_processed), 0),
                COUNT(*)
         FROM workflow_automation_log
         WHERE datetime(executed_at) >= datetime(?1)
           AND action_taken NOT IN ('AUTOMATION_PAUSED', 'GUARDRAILS_UPDATED', 'RULE_CONFIG_CHANGE')",
        params![window_start],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )
    .map_err(|e| e.to_string())
}

fn enforce_automation_cost_limits(
    conn: &Connection,
    total_cu: f64,
    cycle_ms: i64,
    total_rec: i64,
) -> Result<(), String> {
    let lim: (f64, i64, i64) = conn
        .query_row(
            "SELECT max_cost_units_per_cycle, max_execution_time_per_cycle_ms, max_records_processed_per_cycle
             FROM automation_cost_limits WHERE id = 'default'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap_or((500_000.0, 120_000, 500_000));
    let (max_cu, max_ms, max_rec) = lim;
    if total_cu > max_cu || cycle_ms > max_ms || total_rec > max_rec {
        let det = json!({
            "totalCostUnits": total_cu,
            "maxCostUnits": max_cu,
            "cycleMs": cycle_ms,
            "maxMs": max_ms,
            "records": total_rec,
            "maxRecords": max_rec,
        })
        .to_string();
        log_automation(conn, "", "AUTOMATION_COST_BREACH", "system", &det)?;
        pause_automation(conn, "automation_cost_limits_exceeded")?;
    }
    Ok(())
}

fn record_automation_capacity_load_snapshot(
    conn: &Connection,
    active_rules: i64,
    actions_per_cycle: i64,
    records_per_cycle: i64,
    peak_cycle_ms: i64,
    queue_depth: i64,
    total_cu: f64,
    factors_json: &str,
) -> Result<(), String> {
    let pct: f64 = ((actions_per_cycle as f64 / 800.0).min(1.0) * 35.0
        + (total_cu / 8000.0).min(1.0) * 40.0
        + (peak_cycle_ms as f64 / 180_000.0).min(1.0) * 25.0)
        .min(100.0);
    let state = if pct >= 70.0 {
        "HIGH"
    } else if pct >= 40.0 {
        "MEDIUM"
    } else {
        "LOW"
    };
    let id = Uuid::new_v4().to_string();
    let ts = now_local();
    conn.execute(
        "INSERT INTO automation_capacity_load (
            id, snapshot_at, current_active_rules, actions_per_cycle, records_processed_per_cycle,
            peak_cycle_duration_ms, queue_depth, load_percentage, load_state, total_cost_units_cycle, factors_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            &id,
            &ts,
            active_rules,
            actions_per_cycle,
            records_per_cycle,
            peak_cycle_ms,
            queue_depth,
            pct,
            state,
            total_cu,
            factors_json,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn refresh_rule_cost_efficiency_metrics_for_date(
    conn: &Connection,
    metric_date: &str,
) -> Result<i32, String> {
    conn.execute(
        "DELETE FROM rule_cost_efficiency_metrics WHERE metric_date = ?1",
        params![metric_date],
    )
    .map_err(|e| e.to_string())?;
    let n = conn
        .execute(
            "INSERT INTO rule_cost_efficiency_metrics (
                rule_id, metric_date, total_cost_units, total_actions, total_resolution_gain,
                cost_per_resolution, efficiency_score
            )
            SELECT
                rule_id,
                date(executed_at),
                SUM(estimated_cost_units),
                COUNT(*),
                SUM(resolution_time_reduction_hours),
                CASE WHEN SUM(cases_resolved) > 0
                    THEN SUM(estimated_cost_units) / SUM(cases_resolved)
                    ELSE SUM(estimated_cost_units) END,
                CASE WHEN SUM(estimated_cost_units) > 0.0001
                    THEN SUM(resolution_time_reduction_hours) / SUM(estimated_cost_units)
                    ELSE 0.0 END
            FROM workflow_automation_log
            WHERE date(executed_at) = date(?1)
              AND length(trim(rule_id)) > 0
              AND action_taken NOT IN ('AUTOMATION_CYCLE_SUMMARY','AUTOMATION_MASTER_SWITCH','RULE_CONFIG_CHANGE')
            GROUP BY rule_id, date(executed_at)",
            params![metric_date],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as i32)
}

pub fn compute_daily_automation_economics_index(conn: &Connection) -> Result<(), String> {
    let d = today_date();
    let total_cost: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(estimated_cost_units), 0) FROM workflow_automation_log WHERE date(executed_at) = date(?1)",
            params![&d],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let benefit_h: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(resolution_time_reduction_hours), 0) FROM workflow_automation_log
             WHERE date(executed_at) = date(?1) AND action_taken = 'AUTO_RESOLVE'",
            params![&d],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let eff: f64 = conn
        .query_row(
            "SELECT efficiency_score FROM daily_workflow_efficiency_score WHERE snapshot_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(50.0);
    let benefit_score = (benefit_h * 6.0).min(100.0);
    let cost_score = ((total_cost / 500.0) * 40.0).min(100.0);
    let efficiency_gain = (eff - 72.0).clamp(-35.0, 35.0);
    let econ = benefit_score - cost_score + efficiency_gain;
    let factors = json!({
        "totalCostUnitsDay": total_cost,
        "resolutionGainHoursDay": benefit_h,
        "workflowEfficiency": eff,
    })
    .to_string();
    conn.execute(
        "INSERT INTO daily_automation_economics_index (
            snapshot_date, benefit_score, cost_score, efficiency_gain, economics_index, factors_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        ON CONFLICT(snapshot_date) DO UPDATE SET
          benefit_score = excluded.benefit_score,
          cost_score = excluded.cost_score,
          efficiency_gain = excluded.efficiency_gain,
          economics_index = excluded.economics_index,
          factors_json = excluded.factors_json,
          created_at = excluded.created_at",
        params![
            &d,
            benefit_score,
            cost_score,
            efficiency_gain,
            econ,
            &factors,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn detect_inefficient_rules(conn: &Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rule_id, SUM(total_cost_units), SUM(total_actions), SUM(total_resolution_gain),
                    AVG(efficiency_score), AVG(cost_per_resolution)
             FROM rule_cost_efficiency_metrics
             WHERE datetime(metric_date) > datetime('now', '-21 days')
             GROUP BY rule_id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, f64, i64, f64, f64, f64)> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    let mut flags: Vec<serde_json::Value> = Vec::new();
    for (rid, cu, ac, gain, eff_sc, cpr) in rows {
        if ac < 3 {
            continue;
        }
        if eff_sc < 0.02 && cu > 50.0 {
            flags.push(json!({
                "ruleId": rid,
                "flag": "INEFFICIENT_RULE",
                "reason": "low_efficiency_high_cost",
                "efficiencyScore": eff_sc,
                "totalCostUnits": cu,
            }));
        }
        if cpr > 120.0 && gain < 1.0 {
            flags.push(json!({
                "ruleId": rid,
                "flag": "INEFFICIENT_RULE",
                "reason": "high_cost_per_resolution_low_gain",
                "costPerResolution": cpr,
            }));
        }
    }
    Ok(json!({ "flags": flags }))
}

pub fn generate_cost_optimization_suggestions(
    conn: &Connection,
) -> Result<serde_json::Value, String> {
    let mut suggestions: Vec<serde_json::Value> = Vec::new();
    let flags = detect_inefficient_rules(conn)?;
    if let Some(arr) = flags.get("flags").and_then(|x| x.as_array()) {
        for f in arr {
            if let Some(rid) = f.get("ruleId").and_then(|x| x.as_str()) {
                suggestions.push(json!({
                    "type": "LOWER_FREQUENCY_OR_DISABLE",
                    "ruleId": rid,
                    "detail": "Rule shows poor economics — reduce cycle pressure or disable until predicates improve.",
                }));
            }
        }
    }
    let mut wstmt = conn
        .prepare(
            "SELECT rule_id, action_type, cost_weight FROM rule_execution_cost_estimate
             WHERE cost_weight >= 3 ORDER BY cost_weight DESC LIMIT 8",
        )
        .map_err(|e| e.to_string())?;
    let heavy: Vec<(String, String, f64)> = wstmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (rid, at, w) in heavy {
        suggestions.push(json!({
            "type": "DELAY_OR_SCOPE_EXPENSIVE_RULE",
            "ruleId": rid,
            "actionType": at,
            "costWeight": w,
            "detail": "High cost_weight — narrow eligibility or defer to off-peak maintenance windows.",
        }));
    }
    suggestions.push(json!({
        "type": "MERGE_SIMILAR",
        "detail": "Review overlapping AUTO_RESOLVE predicates on the same shipment signals; consolidate where validation allows.",
    }));
    Ok(json!({ "suggestions": suggestions }))
}

pub fn predictive_capacity_forecast(conn: &Connection) -> Result<serde_json::Value, String> {
    let recent: f64 = conn
        .query_row(
            "SELECT AVG(daily_cu) FROM (
                SELECT date(executed_at) AS d, SUM(estimated_cost_units) AS daily_cu
                FROM workflow_automation_log
                WHERE datetime(executed_at) > datetime('now', '-7 days')
                GROUP BY date(executed_at)
            )",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .unwrap_or(0.0);
    let older: f64 = conn
        .query_row(
            "SELECT AVG(daily_cu) FROM (
                SELECT date(executed_at) AS d, SUM(estimated_cost_units) AS daily_cu
                FROM workflow_automation_log
                WHERE datetime(executed_at) > datetime('now', '-37 days')
                  AND datetime(executed_at) <= datetime('now', '-30 days')
                GROUP BY date(executed_at)
            )",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .unwrap_or(0.0);
    let trend = recent - older;
    let mut risk = ((trend / 500.0) * 50.0 + (recent / 2000.0) * 50.0).clamp(0.0, 100.0);
    if risk.is_nan() {
        risk = 0.0;
    }
    Ok(json!({
        "capacityRiskScore": risk,
        "recent7dAvgDailyCostUnits": recent,
        "baseline30dAvgDailyCostUnits": older,
        "trendCostUnits": trend,
        "horizonDays": 14,
        "notes": "Heuristic trend from workflow_automation_log daily aggregates.",
    }))
}

fn estimated_scenario_cost_units(conn: &Connection, v: &serde_json::Value) -> f64 {
    let ara = v["predictedAutoResolves"].as_i64().unwrap_or(0) as f64;
    let pas = v["predictedAssignments"].as_i64().unwrap_or(0) as f64;
    let pr = v["predictedPriorityAdjusts"].as_i64().unwrap_or(0) as f64;
    let (w_ar, e_ar) = resolve_cost_weight(conn, "", "AUTO_RESOLVE");
    let (w_aa, e_aa) = resolve_cost_weight(conn, "", "AUTO_ASSIGN");
    let (w_pr, e_pr) = resolve_cost_weight(conn, "", "PRIORITY_ADJUST");
    ara * (e_ar / 1000.0) * w_ar + pas * (e_aa / 1000.0) * w_aa + pr * (e_pr / 1000.0) * w_pr
}

fn estimated_scenario_benefit_proxy(v: &serde_json::Value) -> f64 {
    let ar = v["predictedAutoResolves"].as_i64().unwrap_or(0) as f64;
    ar * 2.5
}

// --- Automation optimization intelligence (effectiveness, feedback, safety, ROI, benchmarking) ---

/// Roll up `workflow_automation_log` into `rule_effectiveness_metrics` for `metric_date` (YYYY-MM-DD).
pub fn refresh_rule_effectiveness_metrics_for_date(
    conn: &Connection,
    metric_date: &str,
) -> Result<i32, String> {
    conn.execute(
        "DELETE FROM rule_effectiveness_metrics WHERE metric_date = ?1",
        params![metric_date],
    )
    .map_err(|e| e.to_string())?;
    let n = conn
        .execute(
            "INSERT INTO rule_effectiveness_metrics (
                rule_id, metric_date, actions_taken, successful_actions, failed_actions,
                cases_resolved, cases_assigned, priority_adjustments, sla_improvements, avg_resolution_time_saved
            )
            SELECT
                rule_id,
                date(executed_at),
                COUNT(*),
                SUM(CASE WHEN action_taken NOT IN ('AUTOMATION_CYCLE_SUMMARY','AUTOMATION_MASTER_SWITCH','RULE_CONFIG_CHANGE')
                    AND (lower(execution_result) LIKE '%\"ok\":true%' OR lower(execution_result) LIKE '%\"ok\": true%')
                    THEN 1 ELSE 0 END),
                SUM(CASE WHEN action_taken = 'AUTOMATION_PAUSED'
                    OR lower(execution_result) LIKE '%\"ok\":false%'
                    OR lower(execution_result) LIKE '%error%' THEN 1 ELSE 0 END),
                SUM(COALESCE(cases_resolved, 0)),
                SUM(COALESCE(cases_assigned, 0)),
                SUM(COALESCE(priority_adjustments, 0)),
                SUM(COALESCE(sla_improvements, 0)),
                CASE WHEN SUM(COALESCE(cases_resolved, 0)) > 0
                    THEN SUM(COALESCE(resolution_time_reduction_hours, 0)) * 1.0 / SUM(COALESCE(cases_resolved, 0))
                    ELSE 0.0 END
            FROM workflow_automation_log
            WHERE date(executed_at) = date(?1)
              AND length(trim(rule_id)) > 0
              AND action_taken NOT IN ('AUTOMATION_CYCLE_SUMMARY','AUTOMATION_MASTER_SWITCH','RULE_CONFIG_CHANGE')
            GROUP BY rule_id, date(executed_at)",
            params![metric_date],
        )
        .map_err(|e| e.to_string())?;
    Ok(n as i32)
}

/// Pair auto-resolve log rows with current case outcomes (decision feedback loop).
pub fn sync_automation_decision_feedback(conn: &Connection) -> Result<i32, String> {
    let mut stmt = conn
        .prepare(
            "SELECT automation_id, rule_id, target_entity, execution_result
             FROM workflow_automation_log
             WHERE action_taken = 'AUTO_RESOLVE'
               AND datetime(executed_at) > datetime('now', '-30 days')
               AND length(trim(target_entity)) > 0",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    let mut ins = 0i32;
    for (auto_id, rule_id, tgt, eres) in rows {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM automation_decision_feedback WHERE source_automation_id = ?1",
                params![&auto_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            continue;
        }
        let status: String = conn
            .query_row(
                "SELECT status FROM exception_cases WHERE id = ?1",
                params![&tgt],
                |r| r.get(0),
            )
            .unwrap_or_default();
        let (success, follow) = match status.as_str() {
            "OPEN" | "IN_PROGRESS" => (0i64, 1i64),
            "RESOLVED" | "IGNORED" => (1i64, 0i64),
            _ => (0i64, 0i64),
        };
        let res_hours: Option<f64> = conn
            .query_row(
                "SELECT (julianday(resolved_at) - julianday(created_at)) * 24.0
                 FROM exception_cases WHERE id = ?1 AND resolved_at IS NOT NULL",
                params![&tgt],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        let id = Uuid::new_v4().to_string();
        let det = json!({
            "sourceAutomationId": &auto_id,
            "executionSnippet": &eres.chars().take(400).collect::<String>(),
        })
        .to_string();
        match conn.execute(
            "INSERT INTO automation_decision_feedback (
                id, source_automation_id, rule_id, target_entity, decision_result,
                resolution_success, follow_up_required, resolution_time_hours, helpful, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))",
            params![
                &id,
                &auto_id,
                &rule_id,
                &tgt,
                &det,
                success,
                follow,
                res_hours,
            ],
        ) {
            Ok(_) => ins += 1,
            Err(e) => {
                let es = e.to_string();
                if es.to_lowercase().contains("unique") {
                    continue;
                }
                return Err(es);
            }
        }
    }
    Ok(ins)
}

pub fn refresh_rule_safety_index_for_date(
    conn: &Connection,
    snapshot_date: &str,
) -> Result<i32, String> {
    let tid = active_tenant_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT rule_id FROM workflow_decision_rules WHERE length(trim(rule_id)) > 0 AND tenant_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rules: Vec<String> = stmt
        .query_map(params![&tid], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    let mut n = 0i32;
    for rid in rules {
        let actions: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_automation_log
                 WHERE rule_id = ?1 AND tenant_id = ?2 AND datetime(executed_at) > datetime('now', '-14 days')",
                params![&rid, &tid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let fails: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_automation_log
                 WHERE rule_id = ?1 AND tenant_id = ?2 AND datetime(executed_at) > datetime('now', '-14 days')
                   AND (action_taken = 'AUTOMATION_PAUSED'
                     OR lower(execution_result) LIKE '%\"ok\":false%'
                     OR lower(execution_result) LIKE '%error%')",
                params![&rid, &tid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let unexpected: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM automation_decision_feedback
                 WHERE rule_id = ?1 AND follow_up_required = 1
                   AND datetime(created_at) > datetime('now', '-14 days')",
                params![&rid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let rollbacks: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM rollback_action_log r
                 JOIN workflow_automation_log w ON w.automation_id = r.original_automation_id
                 WHERE w.rule_id = ?1 AND w.tenant_id = ?2 AND datetime(r.performed_at) > datetime('now', '-14 days')",
                params![&rid, &tid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let manual_overrides: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM exception_lifecycle_events e
                 JOIN workflow_automation_log w ON w.target_entity = e.exception_case_id
                 WHERE w.rule_id = ?1 AND w.tenant_id = ?2 AND w.action_taken IN ('AUTO_ASSIGN','PRIORITY_ADJUST')
                   AND datetime(e.created_at) > datetime(w.executed_at)
                   AND COALESCE(e.user_id,'') NOT IN ('','automation')
                   AND datetime(e.created_at) > datetime('now', '-14 days')",
                params![&rid, &tid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let fail_rate = if actions > 0 {
            fails as f64 / actions as f64
        } else {
            0.0
        };
        let mut score = 100.0_f64;
        score -= (fail_rate * 80.0).min(45.0);
        score -= (unexpected as f64 * 6.0).min(25.0);
        score -= (rollbacks as f64 * 8.0).min(20.0);
        score -= (manual_overrides as f64 * 2.0).min(15.0);
        score = score.clamp(0.0, 100.0);
        let factors = json!({
            "actions14d": actions,
            "failures14d": fails,
            "unexpectedOutcomes14d": unexpected,
            "rollbacks14d": rollbacks,
            "manualOverridesAfterAutomation14d": manual_overrides,
            "failureRate": fail_rate,
        })
        .to_string();
        conn.execute(
            "INSERT INTO rule_safety_index (rule_id, snapshot_date, safety_score, factors_json, created_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
             ON CONFLICT(rule_id, snapshot_date) DO UPDATE SET
               safety_score = excluded.safety_score,
               factors_json = excluded.factors_json,
               created_at = excluded.created_at",
            params![&rid, snapshot_date, score, &factors],
        )
        .map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

fn stability_alert_recent(
    conn: &Connection,
    alert_type: &str,
    hours: i64,
) -> Result<i64, String> {
    let off = format!("-{hours} hours");
    let cnt: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM automation_stability_alert
             WHERE alert_type = ?1 AND datetime(created_at) > datetime('now', ?2)",
            params![alert_type, &off],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(cnt)
}

pub fn scan_automation_stability_alerts(conn: &Connection) -> Result<i32, String> {
    let esc_1h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_escalation_log
             WHERE datetime(created_at) > datetime('now', '-1 hour')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if esc_1h >= 10 && stability_alert_recent(conn, "RAPID_ESCALATION_SPIKE", 6)? == 0 {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO automation_stability_alert (id, alert_type, severity, details_json, created_at, acknowledged)
             VALUES (?1, 'RAPID_ESCALATION_SPIKE', 'HIGH', ?2, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 0)",
            params![&id, &json!({ "escalationsLastHour": esc_1h }).to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    let fail_burst: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_automation_log
             WHERE datetime(executed_at) > datetime('now', '-6 hours')
               AND (lower(execution_result) LIKE '%\"ok\":false%' OR lower(execution_result) LIKE '%error%')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if fail_burst >= 5 && stability_alert_recent(conn, "REPEATED_RULE_FAILURES", 8)? == 0 {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO automation_stability_alert (id, alert_type, severity, details_json, created_at, acknowledged)
             VALUES (?1, 'REPEATED_RULE_FAILURES', 'MEDIUM', ?2, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 0)",
            params![&id, &json!({ "failedActions6h": fail_burst }).to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    let rb_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM rollback_action_log
             WHERE datetime(performed_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if rb_24h >= 5 && stability_alert_recent(conn, "HIGH_ROLLBACK_FREQUENCY", 12)? == 0 {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO automation_stability_alert (id, alert_type, severity, details_json, created_at, acknowledged)
             VALUES (?1, 'HIGH_ROLLBACK_FREQUENCY', 'HIGH', ?2, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), 0)",
            params![&id, &json!({ "rollbacks24h": rb_24h }).to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(1)
}

pub fn record_automation_benchmarks_if_due(conn: &Connection) -> Result<i32, String> {
    let mut out = 0i32;
    let week_id = chrono::Utc::now().format("%G-W%V").to_string();
    let last_w = meta_get(conn, "automation_last_benchmark_week");
    if last_w.trim() != week_id.trim() {
        let off = "-7 days";
        let auto_r: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_automation_log WHERE action_taken = 'AUTO_RESOLVE'
                 AND datetime(executed_at) > datetime('now', ?1)",
                params![&off],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let manual_r: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM exception_resolution_log
                 WHERE datetime(resolved_at) > datetime('now', ?1)
                   AND COALESCE(resolved_by,'') != 'automation'",
                params![&off],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let open0: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN','IN_PROGRESS')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let metrics = json!({
            "automationResolves7d": auto_r,
            "manualResolves7d": manual_r,
            "openBacklogNow": open0,
            "automationWorkloadShare": if auto_r + manual_r > 0 {
                auto_r as f64 / (auto_r + manual_r) as f64
            } else {
                0.0
            },
        })
        .to_string();
        let id = Uuid::new_v4().to_string();
        let start: String = conn
            .query_row("SELECT date('now', '-7 days')", [], |r| r.get(0))
            .unwrap_or_default();
        let end: String = conn
            .query_row("SELECT date('now')", [], |r| r.get(0))
            .unwrap_or_default();
        conn.execute(
            "INSERT INTO automation_benchmark_history (id, period_type, period_start, period_end, metrics_json, created_at)
             VALUES (?1, 'week', ?2, ?3, ?4, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))",
            params![&id, &start, &end, &metrics],
        )
        .map_err(|e| e.to_string())?;
        meta_set(conn, "automation_last_benchmark_week", &week_id)?;
        out += 1;
    }
    let month_id: String = conn
        .query_row("SELECT strftime('%Y-%m', 'now')", [], |r| r.get(0))
        .unwrap_or_else(|_| today_date());
    let last_m = meta_get(conn, "automation_last_benchmark_month");
    if last_m.trim() != month_id.trim() {
        let off = "-30 days";
        let auto_r: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_automation_log WHERE action_taken = 'AUTO_RESOLVE'
                 AND datetime(executed_at) > datetime('now', ?1)",
                params![&off],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let manual_r: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM exception_resolution_log
                 WHERE datetime(resolved_at) > datetime('now', ?1)
                   AND COALESCE(resolved_by,'') != 'automation'",
                params![&off],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let metrics = json!({
            "automationResolves30d": auto_r,
            "manualResolves30d": manual_r,
        })
        .to_string();
        let id = Uuid::new_v4().to_string();
        let start: String = conn
            .query_row("SELECT date('now', '-30 days')", [], |r| r.get(0))
            .unwrap_or_default();
        let end: String = conn
            .query_row("SELECT date('now')", [], |r| r.get(0))
            .unwrap_or_default();
        conn.execute(
            "INSERT INTO automation_benchmark_history (id, period_type, period_start, period_end, metrics_json, created_at)
             VALUES (?1, 'month', ?2, ?3, ?4, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))",
            params![&id, &start, &end, &metrics],
        )
        .map_err(|e| e.to_string())?;
        meta_set(conn, "automation_last_benchmark_month", &month_id)?;
        out += 1;
    }
    Ok(out)
}

pub fn compute_automation_roi_snapshot(conn: &Connection) -> Result<(), String> {
    let d = today_date();
    let time_saved: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(resolution_time_reduction_hours), 0) FROM workflow_automation_log
             WHERE action_taken = 'AUTO_RESOLVE' AND datetime(executed_at) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let on_time: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status = 'RESOLVED' AND sla_status = 'ON_TIME'
               AND datetime(resolved_at) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let resolved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status = 'RESOLVED' AND datetime(resolved_at) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let sla_pct = if resolved > 0 {
        (on_time as f64 / resolved as f64) * 100.0
    } else {
        0.0
    };
    let auto_r: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_automation_log WHERE action_taken = 'AUTO_RESOLVE'
             AND datetime(executed_at) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let manual_r: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_resolution_log
             WHERE datetime(resolved_at) > datetime('now', '-30 days')
               AND COALESCE(resolved_by,'') != 'automation'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let manual_reduction = if auto_r + manual_r > 0 {
        (auto_r as f64 / (auto_r + manual_r) as f64) * 100.0
    } else {
        0.0
    };
    let avg_auto_h: f64 = conn
        .query_row(
            "SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0)
             FROM exception_cases WHERE status = 'RESOLVED' AND COALESCE(resolved_by,'') = 'automation'
               AND datetime(resolved_at) > datetime('now', '-30 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let avg_man_h: f64 = conn
        .query_row(
            "SELECT AVG((julianday(r.resolved_at) - julianday(c.created_at)) * 24.0)
             FROM exception_resolution_log r
             JOIN exception_cases c ON c.id = r.exception_case_id
             WHERE datetime(r.resolved_at) > datetime('now', '-30 days')
               AND COALESCE(r.resolved_by,'') != 'automation'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(avg_auto_h);
    let speed_delta_pct = if avg_man_h > 0.01 {
        ((avg_man_h - avg_auto_h) / avg_man_h) * 100.0
    } else {
        0.0
    };
    let factors = json!({
        "automationResolves30d": auto_r,
        "manualResolves30d": manual_r,
        "avgAutomationResolutionHours30d": avg_auto_h,
        "avgManualResolutionHours30d": avg_man_h,
    })
    .to_string();
    conn.execute(
        "INSERT INTO automation_roi_metrics (
            snapshot_date, time_saved_hours_estimate, manual_workload_reduction_pct,
            sla_compliance_improvement_pct, resolution_speed_increase_pct, factors_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
        ON CONFLICT(snapshot_date) DO UPDATE SET
          time_saved_hours_estimate = excluded.time_saved_hours_estimate,
          manual_workload_reduction_pct = excluded.manual_workload_reduction_pct,
          sla_compliance_improvement_pct = excluded.sla_compliance_improvement_pct,
          resolution_speed_increase_pct = excluded.resolution_speed_increase_pct,
          factors_json = excluded.factors_json,
          created_at = excluded.created_at",
        params![
            &d,
            time_saved,
            manual_reduction,
            sla_pct,
            speed_delta_pct,
            &factors,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn dry_run_automation_counts(conn: &Connection, auto_resolve_on: bool, auto_assign_on: bool, priority_on: bool) -> serde_json::Value {
    let overdue = if auto_resolve_on {
        conn.query_row(
            "SELECT COUNT(*) FROM exception_cases c JOIN shipments s ON s.id = c.entity_id
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type = 'OVERDUE_ETA'
               AND s.status IS NOT NULL AND LOWER(s.status) IN ('delivered','completed')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0i64
    };
    let boe = if auto_resolve_on {
        conn.query_row(
            "SELECT COUNT(*) FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type = 'MISSING_BOE'
               AND EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = c.entity_id)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0i64
    };
    let exp = if auto_resolve_on {
        conn.query_row(
            "SELECT COUNT(*) FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type = 'MISSING_EXPENSE'
               AND EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = c.entity_id)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0i64
    };
    let unassigned = if auto_assign_on {
        conn.query_row(
            "SELECT COUNT(*) FROM exception_cases c
             WHERE c.status IN ('OPEN','IN_PROGRESS') AND c.exception_type != 'STRESS_TEST'
               AND (c.assigned_to IS NULL OR trim(c.assigned_to) = '')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0i64
    };
    let prio = if priority_on {
        conn.query_row(
            "SELECT COUNT(*) FROM exception_cases
             WHERE status IN ('OPEN','IN_PROGRESS') AND COALESCE(recurrence_flag,0) = 1
               AND priority IN ('LOW','MEDIUM') AND exception_type != 'STRESS_TEST'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0i64
    };
    json!({
        "predictedAutoResolves": overdue + boe + exp,
        "predictedByPredicate": {
            "shipmentDeliveredOverdue": overdue,
            "missingBoeWithBoe": boe,
            "missingExpenseWithExpense": exp,
        },
        "predictedAssignments": (unassigned as i64).min(40),
        "predictedPriorityAdjusts": (prio as i64).min(80),
    })
}

/// Compare current enabled rule mix vs all-off vs conservative (auto-resolve only).
pub fn simulate_multiple_rule_sets(
    conn: &Connection,
    staged_version_id: Option<&str>,
    tenant_id: Option<&str>,
    environment_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    let tid = tenant_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| active_tenant_id(conn));
    let eid = environment_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| active_execution_environment_id(conn));
    let ar = enabled_rules_of_type(conn, "AUTO_RESOLVE") > 0;
    let aa = enabled_rules_of_type(conn, "AUTO_ASSIGN") > 0;
    let pr = enabled_rules_of_type(conn, "PRIORITY_ADJUST") > 0;
    let current = dry_run_automation_counts(conn, ar, aa, pr);
    let all_off = dry_run_automation_counts(conn, false, false, false);
    let conservative = dry_run_automation_counts(conn, true, false, false);
    let cc = estimated_scenario_cost_units(conn, &current);
    let ca = estimated_scenario_cost_units(conn, &all_off);
    let co = estimated_scenario_cost_units(conn, &conservative);
    let bc = estimated_scenario_benefit_proxy(&current);
    let ba = estimated_scenario_benefit_proxy(&all_off);
    let bo = estimated_scenario_benefit_proxy(&conservative);
    let mut root = json!({
        "currentRules": current,
        "allAutomationRulesDisabled": all_off,
        "modifiedRulesAutoResolveOnly": conservative,
        "tenantId": &tid,
        "environmentId": &eid,
        "notes": "Read-only projection from open data; does not mutate workflow_decision_rules. Counts reflect enabled rules for activeTenantId; environmentId scopes interpretation for staged comparisons.",
        "economics": {
            "estimatedCostUnits": {
                "currentRules": cc,
                "allAutomationRulesDisabled": ca,
                "modifiedRulesAutoResolveOnly": co,
            },
            "estimatedBenefitProxy": {
                "currentRules": bc,
                "allAutomationRulesDisabled": ba,
                "modifiedRulesAutoResolveOnly": bo,
            },
            "totalCostDifferenceVsDisabled": cc - ca,
            "totalBenefitDifferenceVsDisabled": bc - ba,
            "totalCostDifferenceVsConservative": cc - co,
            "totalBenefitDifferenceVsConservative": bc - bo,
        },
    });
    if let Some(s) = staged_version_id.map(str::trim).filter(|x| !x.is_empty()) {
        let attach =
            crate::commands::workflow_rule_deployment::deployment_simulation_attachment(conn, s)?;
        if let Some(obj) = root.as_object_mut() {
            obj.insert("deploymentSimulation".to_string(), attach);
        }
    }
    Ok(root)
}

/// Rule optimization and expansion suggestions from metrics and manual resolution patterns.
pub fn generate_rule_optimization_recommendations(conn: &Connection) -> Result<serde_json::Value, String> {
    let mut suggestions: Vec<serde_json::Value> = Vec::new();
    let tid = active_tenant_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT r.rule_id, r.rule_name, r.enabled, r.priority,
                    COALESCE(SUM(m.actions_taken), 0) AS at,
                    COALESCE(SUM(m.failed_actions), 0) AS fa,
                    COALESCE(SUM(m.successful_actions), 0) AS sa,
                    COALESCE(AVG(m.avg_resolution_time_saved), 0) AS avgsaved
             FROM workflow_decision_rules r
             LEFT JOIN rule_effectiveness_metrics m ON m.rule_id = r.rule_id
               AND datetime(m.metric_date) > datetime('now', '-30 days')
             WHERE r.tenant_id = ?1
             GROUP BY r.rule_id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, i64, i64, i64, i64, i64, f64)> = stmt
        .query_map(params![&tid], |r| {
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
        })
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for (rid, rname, en, prio, at, fa, sa, avg_saved) in rows {
        let fail_rate = if at > 0 { fa as f64 / at as f64 } else { 0.0 };
        if en == 1 && at == 0 && !rid.is_empty() {
            suggestions.push(json!({
                "type": "DISABLE_OR_REVIEW_UNUSED",
                "ruleId": &rid,
                "ruleName": &rname,
                "detail": "No automation actions recorded in the last 30 days — consider disabling or tightening conditions."
            }));
        }
        if en == 1 && fail_rate > 0.25 && at >= 5 {
            suggestions.push(json!({
                "type": "HIGH_FAILURE_RATE",
                "ruleId": &rid,
                "ruleName": &rname,
                "failureRate": fail_rate,
                "detail": "Elevated failure signals — review guardrails and predicates before increasing priority."
            }));
        }
        if en == 1 && sa > 20 && avg_saved > 4.0 {
            suggestions.push(json!({
                "type": "RAISE_PRIORITY",
                "ruleId": &rid,
                "ruleName": &rname,
                "currentPriority": prio,
                "suggestedPriority": (prio + 5).min(120),
                "detail": "Strong resolution-time savings — consider raising rule priority in workflow_decision_rules."
            }));
        }
    }
    let mut stmt_ls = conn
        .prepare(
            "SELECT rule_id FROM rule_safety_index
             WHERE datetime(snapshot_date) > datetime('now', '-7 days') AND safety_score < 55
             ORDER BY safety_score ASC LIMIT 8",
        )
        .map_err(|e| e.to_string())?;
    let low_safety: Vec<String> = stmt_ls
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    for rid in low_safety {
        suggestions.push(json!({
            "type": "SAFETY_REVIEW",
            "ruleId": rid,
            "detail": "Safety score below threshold — inspect failures, rollbacks, and manual overrides."
        }));
    }
    let adaptive = conn.query_row(
        "SELECT adjusted_hours, previous_hours FROM adaptive_sla_adjustments
         WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM adaptive_sla_adjustments)
         LIMIT 1",
        [],
        |r| Ok((r.get::<_, f64>(0)?, r.get::<_, f64>(1)?)),
    );
    if let Ok((adj, prev)) = adaptive {
        if adj > prev * 1.2 {
            suggestions.push(json!({
                "type": "SLA_BUFFER",
                "detail": "Adaptive SLA recommends wider buffers — consider enabling adaptive apply during peak seasons.",
                "suggestedAdjustedHours": adj,
                "previousHours": prev,
            }));
        }
    }
    Ok(json!({ "suggestions": suggestions }))
}

/// Mine manual resolutions for repeated patterns (automation expansion hints).
pub fn generate_automation_learning_suggestions(conn: &Connection) -> Result<serde_json::Value, String> {
    let mut ideas: Vec<serde_json::Value> = Vec::new();
    let top_manual_et: Option<(String, i64)> = conn
        .query_row(
            "SELECT exception_type, COUNT(*) AS n FROM exception_resolution_log
             WHERE datetime(resolved_at) > datetime('now', '-60 days')
               AND COALESCE(resolved_by,'') != 'automation'
             GROUP BY exception_type ORDER BY n DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((et, n)) = top_manual_et {
        if n >= 5 {
            ideas.push(json!({
                "type": "NEW_RULE_CANDIDATE",
                "exceptionType": et,
                "manualResolutions60d": n,
                "detail": "High manual volume for this type — candidate for additional AUTO_RESOLVE predicates after validation."
            }));
        }
    }
    let slow_repeat: Option<(String, f64)> = conn
        .query_row(
            "SELECT exception_type, AVG((julianday(resolved_at) - julianday(created_at)) * 24.0)
             FROM exception_cases
             WHERE status = 'RESOLVED' AND COALESCE(recurrence_flag,0) = 1
               AND datetime(resolved_at) > datetime('now', '-90 days')
             GROUP BY exception_type
             ORDER BY AVG((julianday(resolved_at) - julianday(created_at)) * 24.0) DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((et, hrs)) = slow_repeat {
        if hrs > 36.0 {
            ideas.push(json!({
                "type": "SLA_THRESHOLD_TUNING",
                "exceptionType": et,
                "avgResolutionHours": hrs,
                "detail": "Recurrent cases resolve slowly — review SLA thresholds and upstream data quality."
            }));
        }
    }
    Ok(json!({ "ideas": ideas }))
}

/// Structured recommendations for process improvement.
pub fn analyze_workflow_efficiency(conn: &Connection) -> Result<serde_json::Value, String> {
    let slowest: Option<f64> = conn
        .query_row(
            "SELECT MAX((julianday(resolved_at) - julianday(created_at)) * 24.0)
             FROM exception_cases WHERE status = 'RESOLVED' AND resolved_at IS NOT NULL
               AND datetime(resolved_at) > datetime('now', '-90 days')",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    let top_esc: String = conn
        .query_row(
            "SELECT exception_type FROM exception_escalation_log
             GROUP BY exception_type ORDER BY COUNT(*) DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_default();

    let mut recs: Vec<String> = Vec::new();
    if slowest.unwrap_or(0.0) > 72.0 {
        recs.push("Slowest recent resolutions exceed 72h — review bottleneck exception types.".into());
    }
    if !top_esc.is_empty() {
        recs.push(format!(
            "Most escalated exception type: {top_esc} — consider tighter upstream controls."
        ));
    }
    let dup: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM (
               SELECT exception_type, entity_id FROM exception_cases
               WHERE status IN ('OPEN','IN_PROGRESS')
               GROUP BY exception_type, entity_id HAVING COUNT(*) > 1
             )",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if dup > 0 {
        recs.push(format!("{dup} duplicate open groups detected — enforce single-open policy."));
    }

    Ok(json!({
        "recommendations": recs,
        "slowestResolutionHours90d": slowest,
        "mostEscalatedExceptionType": top_esc,
    }))
}

/// Next-best-action style hints for a case (read-only heuristics).
pub fn suggest_resolution_actions(conn: &Connection, case_id: &str) -> Result<Vec<String>, String> {
    let row: (String, String, String, String, i64) = conn
        .query_row(
            "SELECT exception_type, entity_id, status, sla_status, COALESCE(recurrence_flag,0)
             FROM exception_cases WHERE id = ?1",
            params![case_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .map_err(|e| e.to_string())?;
    let (et, eid, st, sla, rec) = row;
    let mut out = Vec::new();
    if st != "OPEN" && st != "IN_PROGRESS" {
        out.push("Case is already closed — no action required.".into());
        return Ok(out);
    }
    match et.as_str() {
        "OVERDUE_ETA" => {
            let delivered: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM shipments WHERE id = ?1 AND status IS NOT NULL
                     AND LOWER(status) IN ('delivered','completed')",
                    params![&eid],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if delivered > 0 {
                out.push("Shipment is delivered — safe to resolve OVERDUE_ETA.".into());
            } else {
                out.push("Update shipment ETA or status to clear the overdue condition.".into());
            }
        }
        "MISSING_BOE" => {
            let has: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM boe_calculations WHERE shipment_id = ?1",
                    params![&eid],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has > 0 {
                out.push("BOE calculation exists — resolve as data caught up.".into());
            } else {
                out.push("Add BOE calculation for this shipment.".into());
            }
        }
        "MISSING_EXPENSE" => {
            let has: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM expenses WHERE shipment_id = ?1",
                    params![&eid],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if has > 0 {
                out.push("Expense lines exist — resolve when reconciled.".into());
            } else {
                out.push("Record expenses against this shipment.".into());
            }
        }
        _ => out.push("Review entity data and apply standard resolution checklist.".into()),
    }
    if sla == "BREACHED" {
        out.push("SLA breached — escalate or assign to senior owner.".into());
    }
    if rec > 0 {
        out.push("Recurrence flagged — prioritize root-cause fix.".into());
    }
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDecisionRuleRow {
    pub rule_id: String,
    pub rule_name: String,
    pub rule_type: String,
    pub condition_expression: String,
    pub action_type: String,
    pub priority: i64,
    pub enabled: i64,
    pub tenant_id: String,
    pub created_at: String,
    pub updated_at: String,
}

fn normalize_role(role: &str) -> String {
    role.chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
}

fn can_view_automation_console(role: &str) -> bool {
    let n = normalize_role(role);
    n.contains("admin")
        || n.contains("automationmanager")
        || n.contains("viewer")
}

fn can_mutate_automation_rules(role: &str) -> bool {
    let n = normalize_role(role);
    n.contains("admin") || n.contains("automationmanager")
}

fn require_view(role: &str) -> Result<(), String> {
    if can_view_automation_console(role) {
        Ok(())
    } else {
        Err("automation console: insufficient role".into())
    }
}

fn require_mutate(role: &str) -> Result<(), String> {
    if can_mutate_automation_rules(role) {
        Ok(())
    } else {
        Err("automation console: modify requires admin or automation manager role".into())
    }
}

pub fn log_workflow_rule_change(
    conn: &Connection,
    rule_id: &str,
    changed_by: &str,
    change_type: &str,
    previous_value: &str,
    new_value: &str,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workflow_rule_change_log (change_id, rule_id, changed_by, change_type, previous_value, new_value)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![&id, rule_id, changed_by, change_type, previous_value, new_value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationLogQuery {
    pub rule_id: Option<String>,
    pub action_taken: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    /// OK | ERROR | WARN | ANY
    pub result_status: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationLogRow {
    pub automation_id: String,
    pub rule_id: String,
    pub action_taken: String,
    pub target_entity: String,
    pub executed_at: String,
    pub execution_result: String,
    pub cases_resolved: i64,
    pub cases_assigned: i64,
    pub priority_adjustments: i64,
    pub sla_improvements: i64,
    pub resolution_time_reduction_hours: f64,
    pub actual_execution_time_ms: i64,
    pub records_processed: i64,
    pub estimated_cost_units: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdaptiveSlaAdjustmentRow {
    pub id: String,
    pub exception_type: String,
    pub snapshot_date: String,
    pub previous_hours: f64,
    pub adjusted_hours: f64,
    pub factors_json: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRuleChangeRow {
    pub change_id: String,
    pub rule_id: String,
    pub changed_by: String,
    pub change_type: String,
    pub previous_value: String,
    pub new_value: String,
    pub changed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationHealthSnapshot {
    pub master_enabled: bool,
    pub paused: bool,
    pub last_cycle_at: String,
    pub actions_last_24h: i64,
    pub errors_last_24h: i64,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationImpactSummary {
    pub auto_resolve_7d: i64,
    pub auto_assign_7d: i64,
    pub priority_adjust_7d: i64,
    pub auto_repair_7d: i64,
    pub escalations_logged_7d: i64,
    pub cycle_summaries_7d: i64,
}

#[tauri::command]
pub fn list_workflow_decision_rules(
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowDecisionRuleRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = active_tenant_id(&conn);
    let mut stmt = conn
        .prepare(
            "SELECT rule_id, rule_name, rule_type, condition_expression, action_type, priority, enabled, tenant_id, created_at, updated_at
             FROM workflow_decision_rules WHERE tenant_id = ?1 ORDER BY priority DESC, rule_name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![&tid], |r| {
            Ok(WorkflowDecisionRuleRow {
                rule_id: r.get(0)?,
                rule_name: r.get(1)?,
                rule_type: r.get(2)?,
                condition_expression: r.get(3)?,
                action_type: r.get(4)?,
                priority: r.get(5)?,
                enabled: r.get(6)?,
                tenant_id: r.get(7)?,
                created_at: r.get(8)?,
                updated_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_workflow_decision_rule_enabled(
    rule_id: String,
    enabled: bool,
    caller_role: String,
    changed_by: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = active_tenant_id(&conn);
    let prev: i64 = conn
        .query_row(
            "SELECT enabled FROM workflow_decision_rules WHERE rule_id = ?1 AND tenant_id = ?2",
            params![&rule_id, &tid],
            |r| r.get(0),
        )
        .map_err(|_| format!("unknown rule_id: {rule_id}"))?;
    let en = if enabled { 1i64 } else { 0i64 };
    let ts = now_local();
    conn.execute(
        "UPDATE workflow_decision_rules SET enabled = ?2, updated_at = ?3 WHERE rule_id = ?1 AND tenant_id = ?4",
        params![&rule_id, en, &ts, &tid],
    )
    .map_err(|e| e.to_string())?;
    log_workflow_rule_change(
        &conn,
        &rule_id,
        &changed_by,
        "ENABLED_TOGGLE",
        &prev.to_string(),
        &en.to_string(),
    )?;
    log_automation(
        &conn,
        &rule_id,
        "RULE_CONFIG_CHANGE",
        &rule_id,
        &json!({
            "enabled": enabled,
            "changedBy": changed_by,
        })
        .to_string(),
    )?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(())
}

#[tauri::command]
pub fn set_workflow_automation_master_enabled(
    enabled: bool,
    caller_role: String,
    changed_by: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let prev = meta_get(&conn, "workflow_automation_master_enabled");
    let v = if enabled { "1" } else { "0" };
    meta_set(&conn, "workflow_automation_master_enabled", v)?;
    log_workflow_rule_change(
        &conn,
        "",
        &changed_by,
        "MASTER_SWITCH",
        &prev,
        v,
    )?;
    log_automation(
        &conn,
        "",
        "AUTOMATION_MASTER_SWITCH",
        "system",
        &json!({ "enabled": enabled, "changedBy": changed_by }).to_string(),
    )?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(())
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationGuardrailsInput {
    pub max_auto_resolve_per_hour: Option<i64>,
    pub max_priority_adjusts_per_cycle: Option<i64>,
    pub automation_pause_duration_minutes: Option<i64>,
}

#[tauri::command]
pub fn set_automation_guardrails(
    input: AutomationGuardrailsInput,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(n) = input.max_auto_resolve_per_hour {
        let n = n.max(1).min(500);
        meta_set(
            &conn,
            "automation_max_auto_resolve_per_hour",
            &n.to_string(),
        )?;
    }
    if let Some(n) = input.max_priority_adjusts_per_cycle {
        let n = n.max(1).min(500);
        meta_set(
            &conn,
            "automation_max_priority_adjust_per_cycle",
            &n.to_string(),
        )?;
    }
    if let Some(n) = input.automation_pause_duration_minutes {
        let n = n.max(5).min(24 * 60);
        meta_set(
            &conn,
            "automation_pause_duration_minutes",
            &n.to_string(),
        )?;
    }
    log_automation(
        &conn,
        "",
        "GUARDRAILS_UPDATED",
        "system",
        &serde_json::to_string(&input).unwrap_or_else(|_| "{}".into()),
    )?;
    Ok(())
}

#[tauri::command]
pub fn set_adaptive_sla_apply_enabled(
    enabled: bool,
    caller_role: String,
    changed_by: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let prev = meta_get(&conn, "automation_adaptive_sla_apply");
    let v = if enabled { "1" } else { "0" };
    meta_set(&conn, "automation_adaptive_sla_apply", v)?;
    log_workflow_rule_change(
        &conn,
        "",
        &changed_by,
        "ADAPTIVE_SLA_APPLY_FLAG",
        &prev,
        v,
    )?;
    log_automation(
        &conn,
        "",
        "ADAPTIVE_SLA_APPLY_TOGGLE",
        "system",
        &json!({ "enabled": enabled, "changedBy": changed_by }).to_string(),
    )?;
    Ok(())
}

#[tauri::command]
pub fn apply_adaptive_sla_decision(
    accept: bool,
    caller_role: String,
    changed_by: String,
    state: State<DbState>,
) -> Result<i32, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if accept {
        meta_set(&conn, "automation_adaptive_sla_apply", "1")?;
        let n = apply_adaptive_sla_engine(&conn)?;
        log_automation(
            &conn,
            "",
            "ADAPTIVE_SLA_ACCEPTED",
            "system",
            &json!({ "changedBy": changed_by, "rows": n }).to_string(),
        )?;
        let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
        Ok(n)
    } else {
        meta_set(&conn, "automation_adaptive_sla_apply", "0")?;
        log_automation(
            &conn,
            "",
            "ADAPTIVE_SLA_REJECTED",
            "system",
            &json!({ "changedBy": changed_by }).to_string(),
        )?;
        Ok(0)
    }
}

#[tauri::command]
pub fn query_workflow_automation_log(
    query: AutomationLogQuery,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<AutomationLogRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = query.limit.unwrap_or(200).max(1).min(2000);
    let mut sql = String::from(
        "SELECT automation_id, rule_id, action_taken, target_entity, executed_at, execution_result,
                COALESCE(cases_resolved,0), COALESCE(cases_assigned,0), COALESCE(priority_adjustments,0),
                COALESCE(sla_improvements,0), COALESCE(resolution_time_reduction_hours,0),
                COALESCE(actual_execution_time_ms,0), COALESCE(records_processed,0), COALESCE(estimated_cost_units,0)
         FROM workflow_automation_log WHERE 1=1",
    );
    let mut binds: Vec<String> = Vec::new();
    if let Some(ref r) = query.rule_id {
        let r = r.trim();
        if !r.is_empty() {
            sql.push_str(" AND rule_id = ?");
            binds.push(r.to_string());
        }
    }
    if let Some(ref a) = query.action_taken {
        let a = a.trim();
        if !a.is_empty() {
            sql.push_str(" AND action_taken = ?");
            binds.push(a.to_string());
        }
    }
    if let Some(ref df) = query.date_from {
        let df = df.trim();
        if !df.is_empty() {
            sql.push_str(" AND date(executed_at) >= date(?)");
            binds.push(df.to_string());
        }
    }
    if let Some(ref dt) = query.date_to {
        let dt = dt.trim();
        if !dt.is_empty() {
            sql.push_str(" AND date(executed_at) <= date(?)");
            binds.push(dt.to_string());
        }
    }
    if let Some(ref s) = query.search {
        let s = s.trim();
        if !s.is_empty() {
            sql.push_str(" AND (lower(target_entity) LIKE lower(?) OR lower(execution_result) LIKE lower(?))");
            let p = format!("%{s}%");
            binds.push(p.clone());
            binds.push(p);
        }
    }
    if let Some(ref st) = query.result_status {
        let st = st.trim().to_uppercase();
        match st.as_str() {
            "OK" => {
                sql.push_str(" AND (lower(execution_result) LIKE '%\"ok\":true%' OR lower(execution_result) LIKE '%\"ok\": true%')");
            }
            "ERROR" => {
                sql.push_str(" AND (action_taken = 'AUTOMATION_PAUSED' OR lower(execution_result) LIKE '%error%' OR lower(execution_result) LIKE '%\"ok\":false%')");
            }
            "WARN" => {
                sql.push_str(" AND action_taken IN ('AUTOMATION_PAUSED','GUARDRAILS_UPDATED')");
            }
            _ => {}
        }
    }
    sql.push_str(&format!(" ORDER BY datetime(executed_at) DESC LIMIT {lim}"));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_dyn: Vec<&dyn ToSql> = binds.iter().map(|s| s as &dyn ToSql).collect();
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params_dyn), |r| {
            Ok(AutomationLogRow {
                automation_id: r.get(0)?,
                rule_id: r.get(1)?,
                action_taken: r.get(2)?,
                target_entity: r.get(3)?,
                executed_at: r.get(4)?,
                execution_result: r.get(5)?,
                cases_resolved: r.get(6)?,
                cases_assigned: r.get(7)?,
                priority_adjustments: r.get(8)?,
                sla_improvements: r.get(9)?,
                resolution_time_reduction_hours: r.get(10)?,
                actual_execution_time_ms: r.get(11)?,
                records_processed: r.get(12)?,
                estimated_cost_units: r.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_automation_health(
    caller_role: String,
    state: State<DbState>,
) -> Result<AutomationHealthSnapshot, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let master_on = master_enabled(&conn);
    let paused = automation_paused(&conn);
    let last_cycle_at = meta_get(&conn, "automation_last_cycle_at");
    let actions_last_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_automation_log WHERE datetime(executed_at) > datetime('now', '-1 day')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let errors_last_24h: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_automation_log
             WHERE datetime(executed_at) > datetime('now', '-1 day')
               AND (action_taken = 'AUTOMATION_PAUSED' OR lower(execution_result) LIKE '%error%')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let status = if !master_on {
        "OFF"
    } else if paused {
        "WARNING"
    } else if errors_last_24h > 5 {
        "ERROR"
    } else if errors_last_24h > 0 {
        "WARNING"
    } else {
        "HEALTHY"
    };
    Ok(AutomationHealthSnapshot {
        master_enabled: master_on,
        paused,
        last_cycle_at,
        actions_last_24h,
        errors_last_24h,
        status: status.to_string(),
    })
}

#[tauri::command]
pub fn get_automation_impact_summary(
    caller_role: String,
    state: State<DbState>,
) -> Result<AutomationImpactSummary, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let off = "-7 days";
    let q = |action: &str| -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM workflow_automation_log WHERE action_taken = ?1 AND datetime(executed_at) > datetime('now', ?2)",
            params![action, &off],
            |r| r.get(0),
        )
        .unwrap_or(0)
    };
    let escalations_logged_7d: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_escalation_log WHERE datetime(created_at) > datetime('now', ?1)",
            params![&off],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(AutomationImpactSummary {
        auto_resolve_7d: q("AUTO_RESOLVE"),
        auto_assign_7d: q("AUTO_ASSIGN"),
        priority_adjust_7d: q("PRIORITY_ADJUST"),
        auto_repair_7d: q("AUTO_REPAIR"),
        escalations_logged_7d,
        cycle_summaries_7d: q("AUTOMATION_CYCLE_SUMMARY"),
    })
}

#[tauri::command]
pub fn list_adaptive_sla_adjustments(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<AdaptiveSlaAdjustmentRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(30).max(1).min(200);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, exception_type, snapshot_date, previous_hours, adjusted_hours, factors_json, created_at
             FROM adaptive_sla_adjustments ORDER BY datetime(created_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AdaptiveSlaAdjustmentRow {
                id: r.get(0)?,
                exception_type: r.get(1)?,
                snapshot_date: r.get(2)?,
                previous_hours: r.get(3)?,
                adjusted_hours: r.get(4)?,
                factors_json: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_workflow_rule_change_log(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<WorkflowRuleChangeRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).max(1).min(500);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT change_id, rule_id, changed_by, change_type, previous_value, new_value, changed_at
             FROM workflow_rule_change_log ORDER BY datetime(changed_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(WorkflowRuleChangeRow {
                change_id: r.get(0)?,
                rule_id: r.get(1)?,
                changed_by: r.get(2)?,
                change_type: r.get(3)?,
                previous_value: r.get(4)?,
                new_value: r.get(5)?,
                changed_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_workflow_automation_cycle_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<AutomationCycleReport, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    run_workflow_automation_cycle(&conn)
}

#[tauri::command]
pub fn analyze_workflow_efficiency_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    analyze_workflow_efficiency(&conn)
}

#[tauri::command]
pub fn suggest_resolution_actions_command(
    case_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<String>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    suggest_resolution_actions(&conn, &case_id)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleEffectivenessMetricRow {
    pub rule_id: String,
    pub metric_date: String,
    pub actions_taken: i64,
    pub successful_actions: i64,
    pub failed_actions: i64,
    pub cases_resolved: i64,
    pub cases_assigned: i64,
    pub priority_adjustments: i64,
    pub sla_improvements: i64,
    pub avg_resolution_time_saved: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationDecisionFeedbackRow {
    pub id: String,
    pub source_automation_id: String,
    pub rule_id: String,
    pub target_entity: String,
    pub decision_result: String,
    pub resolution_success: i64,
    pub follow_up_required: i64,
    pub resolution_time_hours: Option<f64>,
    pub helpful: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleSafetyIndexRow {
    pub rule_id: String,
    pub snapshot_date: String,
    pub safety_score: f64,
    pub factors_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationStabilityAlertRow {
    pub id: String,
    pub alert_type: String,
    pub severity: String,
    pub details_json: String,
    pub created_at: String,
    pub acknowledged: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationBenchmarkRow {
    pub id: String,
    pub period_type: String,
    pub period_start: String,
    pub period_end: String,
    pub metrics_json: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRoiMetricRow {
    pub snapshot_date: String,
    pub time_saved_hours_estimate: f64,
    pub manual_workload_reduction_pct: f64,
    pub sla_compliance_improvement_pct: f64,
    pub resolution_speed_increase_pct: f64,
    pub factors_json: String,
}

/// Undo a single logged automation action when safe (case still matches automated state).
#[tauri::command]
pub fn rollback_automation_action(
    original_automation_id: String,
    rollback_type: String,
    performed_by: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let rt = rollback_type.trim().to_uppercase();
    let row: (String, String, String, String) = conn
        .query_row(
            "SELECT action_taken, target_entity, execution_result, rule_id
             FROM workflow_automation_log WHERE automation_id = ?1",
            params![&original_automation_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| format!("unknown automation_id: {original_automation_id}"))?;
    let (action_taken, target_entity, execution_result, rule_id) = row;
    let now = now_local();
    let mut detail = json!({ "originalAction": &action_taken, "ruleId": &rule_id });

    match rt.as_str() {
        "AUTO_RESOLVE" => {
            if action_taken != "AUTO_RESOLVE" {
                return Err("rollback_type does not match logged action".into());
            }
            let (st, rb): (String, String) = conn
                .query_row(
                    "SELECT status, COALESCE(resolved_by,'') FROM exception_cases WHERE id = ?1",
                    params![&target_entity],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|e| e.to_string())?;
            if st != "RESOLVED" || rb != "automation" {
                return Err(
                    "case is not in automation-resolved state — rollback refused".into(),
                );
            }
            conn.execute(
                "UPDATE exception_cases SET status = 'OPEN', resolved_at = NULL, resolved_by = NULL,
                 updated_at = ?2, sla_status = CASE WHEN datetime(sla_deadline) < datetime('now') THEN 'BREACHED' ELSE 'ON_TIME' END
                 WHERE id = ?1",
                params![&target_entity, &now],
            )
            .map_err(|e| e.to_string())?;
            insert_lifecycle(
                &conn,
                &target_entity,
                "AUTO_ROLLBACK",
                Some(performed_by.trim()),
                &json!({ "automationId": &original_automation_id }).to_string(),
            )?;
        }
        "AUTO_ASSIGN" => {
            if action_taken != "AUTO_ASSIGN" {
                return Err("rollback_type does not match logged action".into());
            }
            let method: String = conn
                .query_row(
                    "SELECT COALESCE(assignment_method,'') FROM exception_cases WHERE id = ?1",
                    params![&target_entity],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !method.contains("AUTO") {
                return Err("assignment was changed after automation — rollback refused".into());
            }
            conn.execute(
                "UPDATE exception_cases SET assigned_to = NULL, assigned_at = NULL, assignment_method = 'MANUAL',
                 updated_at = ?2 WHERE id = ?1",
                params![&target_entity, &now],
            )
            .map_err(|e| e.to_string())?;
            insert_lifecycle(
                &conn,
                &target_entity,
                "ASSIGNMENT_ROLLBACK",
                Some(performed_by.trim()),
                &json!({ "automationId": &original_automation_id }).to_string(),
            )?;
        }
        "PRIORITY_ADJUST" => {
            if action_taken != "PRIORITY_ADJUST" {
                return Err("rollback_type does not match logged action".into());
            }
            let v: serde_json::Value =
                serde_json::from_str(&execution_result).unwrap_or_else(|_| json!({}));
            let from_prio = v
                .get("from")
                .and_then(|x| x.as_str())
                .unwrap_or("MEDIUM")
                .to_string();
            conn.execute(
                "UPDATE exception_cases SET priority = ?2, updated_at = ?3 WHERE id = ?1",
                params![&target_entity, &from_prio, &now],
            )
            .map_err(|e| e.to_string())?;
            insert_lifecycle(
                &conn,
                &target_entity,
                "PRIORITY_ROLLBACK",
                Some(performed_by.trim()),
                &json!({ "automationId": &original_automation_id, "restoredPriority": &from_prio })
                    .to_string(),
            )?;
        }
        _ => return Err("unsupported rollback_type".into()),
    }

    let rid = Uuid::new_v4().to_string();
    detail["targetEntity"] = json!(&target_entity);
    conn.execute(
        "INSERT INTO rollback_action_log (id, original_automation_id, rollback_type, target_entity, performed_by, performed_at, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &rid,
            &original_automation_id,
            &rt,
            &target_entity,
            performed_by.trim(),
            &now,
            &detail.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(rid)
}

#[tauri::command]
pub fn list_rule_effectiveness_metrics(
    days: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<RuleEffectivenessMetricRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let d = days.unwrap_or(14).max(1).min(365);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT rule_id, metric_date, actions_taken, successful_actions, failed_actions,
                    cases_resolved, cases_assigned, priority_adjustments, sla_improvements, avg_resolution_time_saved
             FROM rule_effectiveness_metrics
             WHERE datetime(metric_date) >= datetime('now', '-{d} days')
             ORDER BY datetime(metric_date) DESC, rule_id"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(RuleEffectivenessMetricRow {
                rule_id: r.get(0)?,
                metric_date: r.get(1)?,
                actions_taken: r.get(2)?,
                successful_actions: r.get(3)?,
                failed_actions: r.get(4)?,
                cases_resolved: r.get(5)?,
                cases_assigned: r.get(6)?,
                priority_adjustments: r.get(7)?,
                sla_improvements: r.get(8)?,
                avg_resolution_time_saved: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_rule_performance_dashboard(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tid = active_tenant_id(&conn);
    let mut stmt = conn
        .prepare(
            "SELECT r.rule_id, r.rule_name, r.enabled,
                    COALESCE(SUM(m.actions_taken),0),
                    COALESCE(SUM(m.successful_actions),0),
                    COALESCE(SUM(m.failed_actions),0),
                    COALESCE(SUM(m.cases_resolved),0),
                    COALESCE(AVG(m.avg_resolution_time_saved),0)
             FROM workflow_decision_rules r
             LEFT JOIN rule_effectiveness_metrics m ON m.rule_id = r.rule_id
               AND datetime(m.metric_date) > datetime('now', '-14 days')
             WHERE r.tenant_id = ?1
             GROUP BY r.rule_id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, i64, i64, i64, i64, i64, f64)> = stmt
        .query_map(params![&tid], |r| {
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
        })
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect();
    let mut scored: Vec<serde_json::Value> = Vec::new();
    for (rid, rname, en, at, sa, fa, cr, avg_sv) in rows {
        let fail_rate = if at > 0 { fa as f64 / at as f64 } else { 0.0 };
        let success_rate = if at > 0 { sa as f64 / at as f64 } else { 0.0 };
        scored.push(json!({
            "ruleId": rid,
            "ruleName": rname,
            "enabled": en,
            "actions14d": at,
            "successfulActions14d": sa,
            "failedActions14d": fa,
            "casesResolved14d": cr,
            "avgResolutionTimeSaved": avg_sv,
            "failureRate": fail_rate,
            "successRate": success_rate,
        }));
    }
    let mut top = scored.clone();
    top.sort_by(|a, b| {
        let sa = a["successfulActions14d"].as_i64().unwrap_or(0);
        let sb = b["successfulActions14d"].as_i64().unwrap_or(0);
        sb.cmp(&sa)
    });
    top.truncate(8);
    let mut low = scored.clone();
    low.retain(|x| x["actions14d"].as_i64().unwrap_or(0) > 0);
    low.sort_by(|a, b| {
        let ra = a["successRate"].as_f64().unwrap_or(0.0);
        let rb = b["successRate"].as_f64().unwrap_or(0.0);
        ra.partial_cmp(&rb).unwrap_or(std::cmp::Ordering::Equal)
    });
    low.truncate(8);
    let unused: Vec<serde_json::Value> = scored
        .iter()
        .filter(|x| x["enabled"].as_i64().unwrap_or(0) == 1 && x["actions14d"].as_i64().unwrap_or(0) == 0)
        .cloned()
        .collect();
    let high_failure: Vec<serde_json::Value> = scored
        .iter()
        .filter(|x| {
            x["actions14d"].as_i64().unwrap_or(0) >= 3
                && x["failureRate"].as_f64().unwrap_or(0.0) > 0.2
        })
        .cloned()
        .collect();
    Ok(json!({
        "topPerformingRules": top,
        "lowPerformingRules": low,
        "unusedRules": unused,
        "highFailureRateRules": high_failure,
    }))
}

#[tauri::command]
pub fn list_automation_decision_feedback(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<AutomationDecisionFeedbackRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100).max(1).min(500);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, source_automation_id, rule_id, target_entity, decision_result,
                    resolution_success, follow_up_required, resolution_time_hours, helpful, created_at
             FROM automation_decision_feedback ORDER BY datetime(created_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AutomationDecisionFeedbackRow {
                id: r.get(0)?,
                source_automation_id: r.get(1)?,
                rule_id: r.get(2)?,
                target_entity: r.get(3)?,
                decision_result: r.get(4)?,
                resolution_success: r.get(5)?,
                follow_up_required: r.get(6)?,
                resolution_time_hours: r.get(7)?,
                helpful: r.get(8)?,
                created_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_rule_safety_index(
    days: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<RuleSafetyIndexRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let d = days.unwrap_or(14).max(1).min(365);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT rule_id, snapshot_date, safety_score, factors_json
             FROM rule_safety_index
             WHERE datetime(snapshot_date) >= datetime('now', '-{d} days')
             ORDER BY datetime(snapshot_date) DESC, safety_score ASC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(RuleSafetyIndexRow {
                rule_id: r.get(0)?,
                snapshot_date: r.get(1)?,
                safety_score: r.get(2)?,
                factors_json: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_automation_stability_alerts(
    include_acknowledged: Option<bool>,
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<AutomationStabilityAlertRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(50).max(1).min(200);
    let mut sql = String::from(
        "SELECT id, alert_type, severity, details_json, created_at, acknowledged
         FROM automation_stability_alert WHERE 1=1",
    );
    if !include_acknowledged.unwrap_or(false) {
        sql.push_str(" AND acknowledged = 0");
    }
    sql.push_str(&format!(" ORDER BY datetime(created_at) DESC LIMIT {lim}"));
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AutomationStabilityAlertRow {
                id: r.get(0)?,
                alert_type: r.get(1)?,
                severity: r.get(2)?,
                details_json: r.get(3)?,
                created_at: r.get(4)?,
                acknowledged: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn acknowledge_automation_stability_alert(
    alert_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE automation_stability_alert SET acknowledged = 1 WHERE id = ?1",
        params![&alert_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_automation_benchmark_history(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<AutomationBenchmarkRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(24).max(1).min(200);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, period_type, period_start, period_end, metrics_json, created_at
             FROM automation_benchmark_history ORDER BY datetime(created_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AutomationBenchmarkRow {
                id: r.get(0)?,
                period_type: r.get(1)?,
                period_start: r.get(2)?,
                period_end: r.get(3)?,
                metrics_json: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_automation_roi_metrics(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<AutomationRoiMetricRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(60).max(1).min(500);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT snapshot_date, time_saved_hours_estimate, manual_workload_reduction_pct,
                    sla_compliance_improvement_pct, resolution_speed_increase_pct, factors_json
             FROM automation_roi_metrics ORDER BY snapshot_date DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AutomationRoiMetricRow {
                snapshot_date: r.get(0)?,
                time_saved_hours_estimate: r.get(1)?,
                manual_workload_reduction_pct: r.get(2)?,
                sla_compliance_improvement_pct: r.get(3)?,
                resolution_speed_increase_pct: r.get(4)?,
                factors_json: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_rule_optimization_recommendations_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    generate_rule_optimization_recommendations(&conn)
}

#[tauri::command]
pub fn generate_automation_learning_suggestions_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    generate_automation_learning_suggestions(&conn)
}

#[tauri::command]
pub fn simulate_multiple_rule_sets_command(
    caller_role: String,
    staged_version_id: Option<String>,
    tenant_id: Option<String>,
    environment_id: Option<String>,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    simulate_multiple_rule_sets(
        &conn,
        staged_version_id.as_deref(),
        tenant_id.as_deref(),
        environment_id.as_deref(),
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleExecutionCostEstimateRow {
    pub rule_id: String,
    pub action_type: String,
    pub estimated_cpu_cost: f64,
    pub estimated_io_cost: f64,
    pub estimated_time_ms: f64,
    pub estimated_memory_cost: f64,
    pub cost_weight: f64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleCostEfficiencyMetricRow {
    pub rule_id: String,
    pub metric_date: String,
    pub total_cost_units: f64,
    pub total_actions: i64,
    pub total_resolution_gain: f64,
    pub cost_per_resolution: f64,
    pub efficiency_score: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationCapacityLoadRow {
    pub id: String,
    pub snapshot_at: String,
    pub current_active_rules: i64,
    pub actions_per_cycle: i64,
    pub records_processed_per_cycle: i64,
    pub peak_cycle_duration_ms: i64,
    pub queue_depth: i64,
    pub load_percentage: f64,
    pub load_state: String,
    pub total_cost_units_cycle: f64,
    pub factors_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationCostLimitsRow {
    pub id: String,
    pub max_cost_units_per_cycle: f64,
    pub max_execution_time_per_cycle_ms: i64,
    pub max_records_processed_per_cycle: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyAutomationEconomicsRow {
    pub snapshot_date: String,
    pub benefit_score: f64,
    pub cost_score: f64,
    pub efficiency_gain: f64,
    pub economics_index: f64,
    pub factors_json: String,
}

#[tauri::command]
pub fn list_rule_execution_cost_estimates(
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<RuleExecutionCostEstimateRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT rule_id, action_type, estimated_cpu_cost, estimated_io_cost, estimated_time_ms,
                    estimated_memory_cost, cost_weight, updated_at
             FROM rule_execution_cost_estimate ORDER BY action_type, rule_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(RuleExecutionCostEstimateRow {
                rule_id: r.get(0)?,
                action_type: r.get(1)?,
                estimated_cpu_cost: r.get(2)?,
                estimated_io_cost: r.get(3)?,
                estimated_time_ms: r.get(4)?,
                estimated_memory_cost: r.get(5)?,
                cost_weight: r.get(6)?,
                updated_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleExecutionCostEstimateInput {
    pub rule_id: String,
    pub action_type: String,
    pub estimated_cpu_cost: Option<f64>,
    pub estimated_io_cost: Option<f64>,
    pub estimated_time_ms: Option<f64>,
    pub estimated_memory_cost: Option<f64>,
    pub cost_weight: Option<f64>,
}

#[tauri::command]
pub fn upsert_rule_execution_cost_estimate(
    input: RuleExecutionCostEstimateInput,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let rid = input.rule_id.trim().to_string();
    let at = input.action_type.trim().to_string();
    if at.is_empty() {
        return Err("action_type required".into());
    }
    let cpu = input.estimated_cpu_cost.unwrap_or(1.0).max(0.01);
    let io = input.estimated_io_cost.unwrap_or(1.0).max(0.01);
    let tm = input.estimated_time_ms.unwrap_or(50.0).max(1.0);
    let mem = input.estimated_memory_cost.unwrap_or(1.0).max(0.01);
    let w = input.cost_weight.unwrap_or(1.0).max(0.01);
    let ts = now_local();
    conn.execute(
        "INSERT INTO rule_execution_cost_estimate (
            rule_id, action_type, estimated_cpu_cost, estimated_io_cost, estimated_time_ms,
            estimated_memory_cost, cost_weight, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(rule_id, action_type) DO UPDATE SET
          estimated_cpu_cost = excluded.estimated_cpu_cost,
          estimated_io_cost = excluded.estimated_io_cost,
          estimated_time_ms = excluded.estimated_time_ms,
          estimated_memory_cost = excluded.estimated_memory_cost,
          cost_weight = excluded.cost_weight,
          updated_at = excluded.updated_at",
        params![&rid, &at, cpu, io, tm, mem, w, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_automation_cost_limits(
    caller_role: String,
    state: State<DbState>,
) -> Result<AutomationCostLimitsRow, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, max_cost_units_per_cycle, max_execution_time_per_cycle_ms, max_records_processed_per_cycle, updated_at
         FROM automation_cost_limits WHERE id = 'default'",
        [],
        |r| {
            Ok(AutomationCostLimitsRow {
                id: r.get(0)?,
                max_cost_units_per_cycle: r.get(1)?,
                max_execution_time_per_cycle_ms: r.get(2)?,
                max_records_processed_per_cycle: r.get(3)?,
                updated_at: r.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationCostLimitsInput {
    pub max_cost_units_per_cycle: Option<f64>,
    pub max_execution_time_per_cycle_ms: Option<i64>,
    pub max_records_processed_per_cycle: Option<i64>,
}

#[tauri::command]
pub fn set_automation_cost_limits(
    input: AutomationCostLimitsInput,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_mutate(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let row: (f64, i64, i64) = conn
        .query_row(
            "SELECT max_cost_units_per_cycle, max_execution_time_per_cycle_ms, max_records_processed_per_cycle
             FROM automation_cost_limits WHERE id = 'default'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let max_cu = input
        .max_cost_units_per_cycle
        .unwrap_or(row.0)
        .max(100.0)
        .min(1_000_000_000.0);
    let max_ms = input
        .max_execution_time_per_cycle_ms
        .unwrap_or(row.1)
        .max(1000)
        .min(86_400_000);
    let max_rec = input
        .max_records_processed_per_cycle
        .unwrap_or(row.2)
        .max(10)
        .min(10_000_000);
    let ts = now_local();
    conn.execute(
        "UPDATE automation_cost_limits SET
            max_cost_units_per_cycle = ?1,
            max_execution_time_per_cycle_ms = ?2,
            max_records_processed_per_cycle = ?3,
            updated_at = ?4
         WHERE id = 'default'",
        params![max_cu, max_ms, max_rec, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_rule_cost_efficiency_metrics(
    days: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<RuleCostEfficiencyMetricRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let d = days.unwrap_or(21).max(1).min(365);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT rule_id, metric_date, total_cost_units, total_actions, total_resolution_gain,
                    cost_per_resolution, efficiency_score
             FROM rule_cost_efficiency_metrics
             WHERE datetime(metric_date) >= datetime('now', '-{d} days')
             ORDER BY datetime(metric_date) DESC, rule_id"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(RuleCostEfficiencyMetricRow {
                rule_id: r.get(0)?,
                metric_date: r.get(1)?,
                total_cost_units: r.get(2)?,
                total_actions: r.get(3)?,
                total_resolution_gain: r.get(4)?,
                cost_per_resolution: r.get(5)?,
                efficiency_score: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_automation_capacity_load(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<AutomationCapacityLoadRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(60).max(1).min(500);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, snapshot_at, current_active_rules, actions_per_cycle, records_processed_per_cycle,
                    peak_cycle_duration_ms, queue_depth, load_percentage, load_state, total_cost_units_cycle, factors_json
             FROM automation_capacity_load ORDER BY datetime(snapshot_at) DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AutomationCapacityLoadRow {
                id: r.get(0)?,
                snapshot_at: r.get(1)?,
                current_active_rules: r.get(2)?,
                actions_per_cycle: r.get(3)?,
                records_processed_per_cycle: r.get(4)?,
                peak_cycle_duration_ms: r.get(5)?,
                queue_depth: r.get(6)?,
                load_percentage: r.get(7)?,
                load_state: r.get(8)?,
                total_cost_units_cycle: r.get(9)?,
                factors_json: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_daily_automation_economics_index(
    limit: Option<i64>,
    caller_role: String,
    state: State<DbState>,
) -> Result<Vec<DailyAutomationEconomicsRow>, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(90).max(1).min(500);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT snapshot_date, benefit_score, cost_score, efficiency_gain, economics_index, factors_json
             FROM daily_automation_economics_index ORDER BY snapshot_date DESC LIMIT {lim}"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(DailyAutomationEconomicsRow {
                snapshot_date: r.get(0)?,
                benefit_score: r.get(1)?,
                cost_score: r.get(2)?,
                efficiency_gain: r.get(3)?,
                economics_index: r.get(4)?,
                factors_json: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn detect_inefficient_rules_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    detect_inefficient_rules(&conn)
}

#[tauri::command]
pub fn generate_cost_optimization_suggestions_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    generate_cost_optimization_suggestions(&conn)
}

#[tauri::command]
pub fn predictive_capacity_forecast_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    predictive_capacity_forecast(&conn)
}

#[tauri::command]
pub fn get_automation_cost_vs_benefit_dashboard(
    caller_role: String,
    state: State<DbState>,
) -> Result<serde_json::Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let total_cost_14d: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total_cost_units), 0) FROM rule_cost_efficiency_metrics
             WHERE datetime(metric_date) > datetime('now', '-14 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let total_gain_14d: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total_resolution_gain), 0) FROM rule_cost_efficiency_metrics
             WHERE datetime(metric_date) > datetime('now', '-14 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let total_actions_14d: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total_actions), 0) FROM rule_cost_efficiency_metrics
             WHERE datetime(metric_date) > datetime('now', '-14 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let cpr = if total_gain_14d > 0.01 {
        total_cost_14d / total_gain_14d
    } else {
        total_cost_14d
    };
    let latest_roi: Option<(f64, f64)> = conn
        .query_row(
            "SELECT time_saved_hours_estimate, manual_workload_reduction_pct FROM automation_roi_metrics
             ORDER BY snapshot_date DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let mut st_econ = conn
        .prepare(
            "SELECT snapshot_date, economics_index FROM daily_automation_economics_index
             ORDER BY snapshot_date DESC LIMIT 30",
        )
        .map_err(|e| e.to_string())?;
    let econ_trend: Vec<serde_json::Value> = st_econ
        .query_map([], |r| {
            Ok(json!({
                "date": r.get::<_, String>(0)?,
                "economicsIndex": r.get::<_, f64>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut st_cost = conn
        .prepare(
            "SELECT date(executed_at) AS d, SUM(estimated_cost_units) AS cu
             FROM workflow_automation_log
             WHERE datetime(executed_at) > datetime('now', '-30 days')
             GROUP BY date(executed_at) ORDER BY d DESC LIMIT 30",
        )
        .map_err(|e| e.to_string())?;
    let daily_cost_trend: Vec<serde_json::Value> = st_cost
        .query_map([], |r| {
            Ok(json!({
                "date": r.get::<_, String>(0)?,
                "costUnits": r.get::<_, f64>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut st_ben = conn
        .prepare(
            "SELECT date(executed_at) AS d, SUM(resolution_time_reduction_hours) AS bh
             FROM workflow_automation_log
             WHERE datetime(executed_at) > datetime('now', '-30 days')
               AND action_taken = 'AUTO_RESOLVE'
             GROUP BY date(executed_at) ORDER BY d DESC LIMIT 30",
        )
        .map_err(|e| e.to_string())?;
    let daily_benefit_trend: Vec<serde_json::Value> = st_ben
        .query_map([], |r| {
            Ok(json!({
                "date": r.get::<_, String>(0)?,
                "resolutionGainHours": r.get::<_, f64>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "totals14d": {
            "totalCostUnits": total_cost_14d,
            "totalResolutionGainHours": total_gain_14d,
            "totalActions": total_actions_14d,
            "costPerResolutionHour": cpr,
        },
        "latestRoi": latest_roi.map(|(h, p)| json!({ "timeSavedHours30d": h, "manualWorkloadReductionPct": p })),
        "economicsIndexTrend": econ_trend,
        "costTrend30d": daily_cost_trend,
        "benefitTrend30d": daily_benefit_trend,
    }))
}
