//! Entity-level shipment exceptions, SLA, resolution, lifecycle, notes.

use crate::commands::dashboard_cache;
use crate::commands::exception_reliability;
use crate::commands::utils::dashboard_activity_checksum;
use crate::db::DbState;
use rusqlite::{params, Connection, OptionalExtension, ToSql};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

const ENTITY_EXCEPTION_CAP: i64 = 150;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EntityExceptionDto {
    pub exception_case_id: String,
    pub exception_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub status: String,
    pub priority: String,
    pub assigned_to: Option<String>,
    pub assigned_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub age_days: i64,
    pub sla_deadline: Option<String>,
    pub sla_status: String,
    pub navigation_url: String,
    pub resolved_at: Option<String>,
    pub resolved_by: Option<String>,
    #[serde(default)]
    pub escalated_at: Option<String>,
    #[serde(default)]
    pub escalation_level: i64,
    #[serde(default)]
    pub workflow_timeout_flag: i64,
    #[serde(default)]
    pub recurrence_flag: i64,
    #[serde(default)]
    pub assignment_method: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionWorkflowSummary {
    pub open_count: i64,
    pub resolved_today_count: i64,
    pub sla_breached_count: i64,
    pub avg_resolution_days: Option<f64>,
    pub by_type: Vec<ExceptionTypeCount>,
    pub by_priority: Vec<ExceptionPriorityCount>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionTypeCount {
    pub exception_type: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionPriorityCount {
    pub priority: String,
    pub count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionCaseQuery {
    pub status: Option<String>,
    pub exception_type: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateExceptionCaseInput {
    pub id: String,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assigned_to: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddExceptionNoteInput {
    pub exception_case_id: String,
    pub user_id: String,
    pub note_text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkResolveInput {
    pub case_ids: Vec<String>,
    pub user_id: String,
    pub status: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleEventRow {
    pub id: String,
    pub exception_case_id: String,
    pub event_type: String,
    pub user_id: Option<String>,
    pub details: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExceptionNoteRow {
    pub note_id: String,
    pub exception_case_id: String,
    pub user_id: String,
    pub note_text: String,
    pub created_at: String,
}

fn sla_days_for_type(exception_type: &str) -> i64 {
    match exception_type {
        "OVERDUE_ETA" => 2,
        "MISSING_BOE" | "MISSING_EXPENSE" => 1,
        _ => 1,
    }
}

fn compute_sla_deadline(conn: &Connection, exception_type: &str) -> Result<String, String> {
    let days = sla_days_for_type(exception_type);
    let off = format!("+{days} days");
    let d: String = conn
        .query_row("SELECT date('now', ?1)", params![&off], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(d)
}

fn compute_sla_status(deadline: Option<&str>) -> String {
    let Some(d) = deadline.filter(|s| !s.is_empty()) else {
        return "ON_TIME".into();
    };
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    if today.as_str() > d {
        return "BREACHED".into();
    }
    let Ok(dead) = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d") else {
        return "ON_TIME".into();
    };
    let Ok(tod) = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d") else {
        return "ON_TIME".into();
    };
    let days_left = (dead - tod).num_days();
    if days_left >= 0 && days_left <= 1 {
        "AT_RISK".into()
    } else {
        "ON_TIME".into()
    }
}

pub(crate) fn insert_lifecycle(
    conn: &Connection,
    case_id: &str,
    event_type: &str,
    user_id: Option<&str>,
    details: &str,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO exception_lifecycle_events (id, exception_case_id, event_type, user_id, details)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            id,
            case_id,
            event_type,
            user_id.unwrap_or(""),
            details
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn query_shipment_ids(
    conn: &Connection,
    sql: &str,
    p_ship: &[&dyn ToSql],
) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(p_ship.iter().copied()), |r| {
            r.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Upsert OPEN cases and auto-resolve stale ones for one exception type.
fn reconcile_cases_for_ids(
    conn: &Connection,
    exception_type: &str,
    current_ids: &[String],
) -> Result<(), String> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if current_ids.is_empty() {
        conn.execute(
            "UPDATE exception_cases SET status = 'RESOLVED', resolved_at = ?2, resolved_by = 'system', updated_at = ?2, sla_status = 'ON_TIME'
             WHERE exception_type = ?1 AND status IN ('OPEN', 'IN_PROGRESS')",
            params![exception_type, &now],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let current_set: std::collections::HashSet<&String> =
        current_ids.iter().collect();
    let mut stmt = conn
        .prepare(
            "SELECT id, entity_id FROM exception_cases WHERE exception_type = ?1 AND status IN ('OPEN', 'IN_PROGRESS')",
        )
        .map_err(|e| e.to_string())?;
    let open_rows = stmt
        .query_map(params![exception_type], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let stale_ids: Vec<String> = open_rows
        .filter_map(|r| r.ok())
        .filter(|(_, eid)| !current_set.contains(eid))
        .map(|(cid, _)| cid)
        .collect();

    for sid in stale_ids {
        conn.execute(
            "UPDATE exception_cases SET status = 'RESOLVED', resolved_at = ?2, resolved_by = 'system', updated_at = ?2 WHERE id = ?1",
            params![&sid, &now],
        )
        .map_err(|e| e.to_string())?;
        let _ = insert_lifecycle(conn, &sid, "RESOLVED", Some("system"), "Auto-resolved: condition cleared");
        let rid = Uuid::new_v4().to_string();
        let (et, eid): (String, String) = conn
            .query_row(
                "SELECT exception_type, entity_id FROM exception_cases WHERE id = ?1",
                params![&sid],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO exception_resolution_log (resolution_id, exception_case_id, exception_type, entity_id, status, resolved_by, resolved_at, notes)
             VALUES (?1, ?2, ?3, ?4, 'RESOLVED', 'system', ?5, 'Auto-resolved')",
            params![&rid, &sid, et, eid, &now],
        )
        .map_err(|e| e.to_string())?;
    }

    for entity_id in current_ids {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM exception_cases WHERE exception_type = ?1 AND entity_id = ?2 AND status IN ('OPEN', 'IN_PROGRESS') LIMIT 1",
                params![exception_type, entity_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if existing.is_some() {
            continue;
        }

        if let Err(e) = exception_reliability::ensure_no_duplicate_open_case(
            conn,
            exception_type,
            entity_id,
        ) {
            let _ = exception_reliability::log_integrity_issue(
                conn,
                "",
                "DUPLICATE_GUARD",
                &e.to_string(),
            );
            continue;
        }
        if let Err(e) = exception_reliability::assert_shipment_entity_exists(conn, entity_id) {
            let _ = exception_reliability::log_integrity_issue(
                conn,
                "",
                "MISSING_ENTITY_ON_CREATE",
                &e.to_string(),
            );
            continue;
        }

        let id = Uuid::new_v4().to_string();
        let deadline = compute_sla_deadline(conn, exception_type)?;
        let sla = compute_sla_status(Some(&deadline));
        let priority = if exception_type == "OVERDUE_ETA" {
            "HIGH"
        } else {
            "MEDIUM"
        };
        conn.execute(
            "INSERT INTO exception_cases (id, exception_type, entity_type, entity_id, status, priority, created_at, updated_at, sla_deadline, sla_status)
             VALUES (?1, ?2, 'shipment', ?3, 'OPEN', ?4, strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), ?5, ?6)",
            params![&id, exception_type, entity_id, priority, &deadline, sla],
        )
        .map_err(|e| e.to_string())?;
        insert_lifecycle(
            conn,
            &id,
            "CREATED",
            None,
            &format!("{{\"exceptionType\":\"{exception_type}\"}}"),
        )?;
        exception_reliability::bump_recurrence_on_new_open(conn, &id, exception_type, entity_id)?;
    }

    Ok(())
}

pub fn refresh_all_open_exception_sla(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE exception_cases SET sla_status = CASE
             WHEN sla_deadline IS NULL OR trim(sla_deadline) = '' THEN 'ON_TIME'
             WHEN date('now') > date(sla_deadline) THEN 'BREACHED'
             WHEN date(sla_deadline, '-1 day') <= date('now') AND date('now') <= date(sla_deadline) THEN 'AT_RISK'
             ELSE 'ON_TIME' END,
         updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
         WHERE status IN ('OPEN', 'IN_PROGRESS')",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sync DB exception cases with live shipment queries (scoped by dashboard `w` + params).
pub fn sync_exception_cases_for_shipment_scope(
    conn: &Connection,
    w: &str,
    p_ship: &[&dyn ToSql],
) -> Result<(), String> {
    let overdue_sql = format!(
        "SELECT s.id FROM shipments s WHERE {w}
         AND s.eta IS NOT NULL AND TRIM(s.eta) != ''
         AND s.status IS NOT NULL AND LOWER(s.status) NOT IN ('delivered', 'completed')
         AND length(s.eta) >= 10 AND s.eta GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
         AND date(s.eta) < date('now')",
        w = w
    );
    let overdue_ids = query_shipment_ids(conn, &overdue_sql, p_ship)?;
    reconcile_cases_for_ids(conn, "OVERDUE_ETA", &overdue_ids)?;

    let no_boe_sql = format!(
        "SELECT s.id FROM shipments s WHERE {w}
         AND NOT EXISTS (SELECT 1 FROM boe_calculations bc WHERE bc.shipment_id = s.id)",
        w = w
    );
    let no_boe_ids = query_shipment_ids(conn, &no_boe_sql, p_ship)?;
    reconcile_cases_for_ids(conn, "MISSING_BOE", &no_boe_ids)?;

    let no_exp_sql = format!(
        "SELECT s.id FROM shipments s WHERE {w}
         AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.shipment_id = s.id)",
        w = w
    );
    let no_exp_ids = query_shipment_ids(conn, &no_exp_sql, p_ship)?;
    reconcile_cases_for_ids(conn, "MISSING_EXPENSE", &no_exp_ids)?;

    refresh_all_open_exception_sla(conn)?;
    Ok(())
}

pub fn load_entity_exceptions_for_dashboard(
    conn: &Connection,
    w: &str,
    p_ship: &[&dyn ToSql],
) -> Result<Vec<EntityExceptionDto>, String> {
    let sql = format!(
        "SELECT c.id, c.exception_type, c.entity_type, c.entity_id, c.status, c.priority,
                c.assigned_to, c.assigned_at, c.created_at, c.updated_at, c.sla_deadline, c.sla_status,
                c.resolved_at, c.resolved_by,
                c.escalated_at, COALESCE(c.escalation_level, 0), COALESCE(c.workflow_timeout_flag, 0), COALESCE(c.recurrence_flag, 0),
                COALESCE(c.assignment_method, 'MANUAL'),
                CAST((julianday(date('now')) - julianday(date(c.created_at))) AS INTEGER) AS age_days
         FROM exception_cases c
         JOIN shipments s ON s.id = c.entity_id
         WHERE c.status IN ('OPEN', 'IN_PROGRESS') AND ({w})",
        w = w
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(p_ship.iter().copied()), map_entity_exception_row)
        .map_err(|e| e.to_string())?;
    let mut out: Vec<EntityExceptionDto> = rows.filter_map(|x| x.ok()).collect();
    out.truncate(ENTITY_EXCEPTION_CAP as usize);
    Ok(out)
}

pub fn load_exception_workflow_summary(conn: &Connection) -> Result<ExceptionWorkflowSummary, String> {
    let open_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN', 'IN_PROGRESS')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let resolved_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status = 'RESOLVED' AND date(resolved_at) = date(?1)",
            params![today],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let sla_breached: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM exception_cases WHERE status IN ('OPEN', 'IN_PROGRESS') AND sla_status = 'BREACHED'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let avg_resolution: Option<f64> = conn
        .query_row(
            "SELECT AVG(julianday(resolved_at) - julianday(created_at))
             FROM exception_cases WHERE status = 'RESOLVED' AND resolved_at IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    let mut stmt = conn
        .prepare(
            "SELECT exception_type, COUNT(*) FROM exception_cases WHERE status IN ('OPEN', 'IN_PROGRESS') GROUP BY exception_type",
        )
        .map_err(|e| e.to_string())?;
    let by_type = stmt
        .query_map([], |r| {
            Ok(ExceptionTypeCount {
                exception_type: r.get(0)?,
                count: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect::<Vec<_>>();

    let mut stmt2 = conn
        .prepare(
            "SELECT priority, COUNT(*) FROM exception_cases WHERE status IN ('OPEN', 'IN_PROGRESS') GROUP BY priority",
        )
        .map_err(|e| e.to_string())?;
    let by_priority = stmt2
        .query_map([], |r| {
            Ok(ExceptionPriorityCount {
                priority: r.get(0)?,
                count: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|x| x.ok())
        .collect::<Vec<_>>();

    Ok(ExceptionWorkflowSummary {
        open_count,
        resolved_today_count: resolved_today,
        sla_breached_count: sla_breached,
        avg_resolution_days: avg_resolution,
        by_type,
        by_priority,
    })
}

fn map_entity_exception_row(r: &rusqlite::Row) -> rusqlite::Result<EntityExceptionDto> {
    let entity_id: String = r.get(3)?;
    Ok(EntityExceptionDto {
        exception_case_id: r.get(0)?,
        exception_type: r.get(1)?,
        entity_type: r.get(2)?,
        entity_id: entity_id.clone(),
        status: r.get(4)?,
        priority: r.get(5)?,
        assigned_to: r.get(6)?,
        assigned_at: r.get(7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
        sla_deadline: r.get(10)?,
        sla_status: r.get(11)?,
        navigation_url: format!("/shipment?id={}", urlencoding::encode(&entity_id)),
        resolved_at: r.get(12)?,
        resolved_by: r.get(13)?,
        escalated_at: r.get(14)?,
        escalation_level: r.get(15)?,
        workflow_timeout_flag: r.get(16)?,
        recurrence_flag: r.get(17)?,
        assignment_method: r.get(18)?,
        age_days: r.get(19)?,
    })
}

pub fn run_exception_retention_cleanup(conn: &Connection) -> Result<i64, String> {
    let days: i64 = conn
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM app_metadata WHERE key = 'exception_retention_days'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(365)
        .max(30)
        .min(3650);
    let cutoff = format!("-{days} days");
    let old_case_ids: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT id FROM exception_cases WHERE status IN ('RESOLVED', 'IGNORED')
                 AND resolved_at IS NOT NULL AND datetime(resolved_at) < datetime('now', ?1)",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![&cutoff], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    let mut deleted = 0i64;
    for cid in old_case_ids {
        conn.execute("DELETE FROM exception_notes WHERE exception_case_id = ?1", params![&cid])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM exception_lifecycle_events WHERE exception_case_id = ?1",
            params![&cid],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM exception_resolution_log WHERE exception_case_id = ?1",
            params![&cid],
        )
        .map_err(|e| e.to_string())?;
        let n = conn
            .execute("DELETE FROM exception_cases WHERE id = ?1", params![&cid])
            .map_err(|e| e.to_string())?;
        deleted += n as i64;
    }
    Ok(deleted)
}

#[tauri::command]
pub fn list_exception_cases(
    query: Option<ExceptionCaseQuery>,
    state: State<DbState>,
) -> Result<Vec<EntityExceptionDto>, String> {
    let q = query.unwrap_or(ExceptionCaseQuery {
        status: None,
        exception_type: None,
        limit: Some(200),
    });
    let lim = q.limit.unwrap_or(200).max(1).min(500);
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from(
        "SELECT c.id, c.exception_type, c.entity_type, c.entity_id, c.status, c.priority,
                c.assigned_to, c.assigned_at, c.created_at, c.updated_at, c.sla_deadline, c.sla_status,
                c.resolved_at, c.resolved_by,
                c.escalated_at, COALESCE(c.escalation_level, 0), COALESCE(c.workflow_timeout_flag, 0), COALESCE(c.recurrence_flag, 0),
                COALESCE(c.assignment_method, 'MANUAL'),
                CAST((julianday(date('now')) - julianday(date(c.created_at))) AS INTEGER) AS age_days
         FROM exception_cases c WHERE 1=1",
    );
    let mut p: Vec<String> = Vec::new();
    if let Some(st) = q.status.as_ref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND c.status = ?");
        p.push(st.clone());
    }
    if let Some(et) = q.exception_type.as_ref().filter(|s| !s.is_empty()) {
        sql.push_str(" AND c.exception_type = ?");
        p.push(et.clone());
    }
    sql.push_str(&format!(
        " ORDER BY c.updated_at DESC LIMIT {}",
        lim
    ));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    if p.is_empty() {
        let rows = stmt
            .query_map([], map_entity_exception_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    } else {
        let params_dyn: Vec<&dyn ToSql> = p.iter().map(|s| s as &dyn ToSql).collect();
        let rows = stmt
            .query_map(rusqlite::params_from_iter(params_dyn), map_entity_exception_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn update_exception_case(
    input: UpdateExceptionCaseInput,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if let Some(ref st) = input.status {
        let cur: String = conn
            .query_row(
                "SELECT status FROM exception_cases WHERE id = ?1",
                params![&input.id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exception_reliability::is_valid_status_transition(Some(cur.as_str()), st.as_str()) {
            return Err(format!("invalid status transition {cur} -> {st}"));
        }
        if st == "RESOLVED" || st == "IGNORED" {
            exception_reliability::assert_case_open_for_resolution(&conn, &input.id)?;
        }
        conn.execute(
            "UPDATE exception_cases SET status = ?2, updated_at = ?3,
             resolved_at = CASE WHEN ?2 IN ('RESOLVED','IGNORED') THEN ?3 ELSE resolved_at END,
             resolved_by = CASE WHEN ?2 IN ('RESOLVED','IGNORED') THEN COALESCE(?4, resolved_by) ELSE resolved_by END
             WHERE id = ?1",
            params![
                &input.id,
                st,
                &now,
                input.user_id.as_deref().unwrap_or("")
            ],
        )
        .map_err(|e| e.to_string())?;
        insert_lifecycle(
            &conn,
            &input.id,
            "STATUS_CHANGED",
            input.user_id.as_deref(),
            &format!("{{\"status\":\"{st}\"}}"),
        )?;
        if st == "RESOLVED" || st == "IGNORED" {
            let rid = Uuid::new_v4().to_string();
            let (et, eid): (String, String) = conn
                .query_row(
                    "SELECT exception_type, entity_id FROM exception_cases WHERE id = ?1",
                    params![&input.id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO exception_resolution_log (resolution_id, exception_case_id, exception_type, entity_id, status, resolved_by, resolved_at, notes)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '')",
                params![
                    &rid,
                    &input.id,
                    et,
                    eid,
                    st,
                    input.user_id.as_deref().unwrap_or(""),
                    &now
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    if let Some(pr) = input.priority.as_ref() {
        conn.execute(
            "UPDATE exception_cases SET priority = ?2, updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime') WHERE id = ?1",
            params![&input.id, pr],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(ref assign) = input.assigned_to {
        conn.execute(
            "UPDATE exception_cases SET assigned_to = ?2, assigned_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'), assignment_method = 'MANUAL' WHERE id = ?1",
            params![&input.id, assign],
        )
        .map_err(|e| e.to_string())?;
        insert_lifecycle(
            &conn,
            &input.id,
            "ASSIGNED",
            input.user_id.as_deref(),
            &format!("{{\"assignedTo\":\"{assign}\"}}"),
        )?;
    }
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(())
}

#[tauri::command]
pub fn add_exception_note(input: AddExceptionNoteInput, state: State<DbState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let nid = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO exception_notes (note_id, exception_case_id, user_id, note_text) VALUES (?1, ?2, ?3, ?4)",
        params![&nid, &input.exception_case_id, &input.user_id, &input.note_text],
    )
    .map_err(|e| e.to_string())?;
    insert_lifecycle(
        &conn,
        &input.exception_case_id,
        "NOTE_ADDED",
        Some(&input.user_id),
        "{}",
    )?;
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(())
}

#[tauri::command]
pub fn get_exception_lifecycle_events(
    exception_case_id: String,
    state: State<DbState>,
) -> Result<Vec<LifecycleEventRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, exception_case_id, event_type, user_id, details, created_at
             FROM exception_lifecycle_events WHERE exception_case_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![&exception_case_id], |r| {
            Ok(LifecycleEventRow {
                id: r.get(0)?,
                exception_case_id: r.get(1)?,
                event_type: r.get(2)?,
                user_id: {
                    let s: String = r.get(3)?;
                    if s.is_empty() {
                        None
                    } else {
                        Some(s)
                    }
                },
                details: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_exception_notes(
    exception_case_id: String,
    state: State<DbState>,
) -> Result<Vec<ExceptionNoteRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT note_id, exception_case_id, user_id, note_text, created_at
             FROM exception_notes WHERE exception_case_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![&exception_case_id], |r| {
            Ok(ExceptionNoteRow {
                note_id: r.get(0)?,
                exception_case_id: r.get(1)?,
                user_id: r.get(2)?,
                note_text: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn record_exception_viewed(
    exception_case_id: String,
    user_id: String,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE exception_cases SET last_viewed_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![&exception_case_id, &now],
    )
    .map_err(|e| e.to_string())?;
    insert_lifecycle(
        &conn,
        &exception_case_id,
        "VIEWED",
        Some(&user_id),
        "{}",
    )?;
    Ok(())
}

#[tauri::command]
pub fn bulk_resolve_exception_cases(input: BulkResolveInput, state: State<DbState>) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut n = 0i32;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let st = if input.status.is_empty() {
        "RESOLVED".to_string()
    } else {
        input.status.clone()
    };
    let notes = input.notes.clone().unwrap_or_default();
    for cid in &input.case_ids {
        let (et, eid): (String, String) = match conn.query_row(
            "SELECT exception_type, entity_id FROM exception_cases WHERE id = ?1 AND status IN ('OPEN','IN_PROGRESS')",
            params![cid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let changed = conn
            .execute(
                "UPDATE exception_cases SET status = ?2, resolved_at = ?3, resolved_by = ?4, updated_at = ?3 WHERE id = ?1 AND status IN ('OPEN','IN_PROGRESS')",
                params![cid, &st, &now, &input.user_id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            continue;
        }
        insert_lifecycle(
            &conn,
            cid,
            "RESOLVED",
            Some(&input.user_id),
            &format!("{{\"bulk\":true,\"notes\":{}}}", serde_json::json!(notes)),
        )?;
        let rid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO exception_resolution_log (resolution_id, exception_case_id, exception_type, entity_id, status, resolved_by, resolved_at, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![&rid, cid, et, eid, &st, &input.user_id, &now, &notes],
        )
        .map_err(|e| e.to_string())?;
        n += 1;
    }
    if n > 0 {
        let details = serde_json::json!({
            "count": n,
            "status": st,
            "caseIds": input.case_ids,
            "notes": notes,
        })
        .to_string();
        let ck = dashboard_activity_checksum(
            &input.user_id,
            "exception_bulk_resolved",
            &details,
            "Exceptions",
            "",
            "/shipment",
            "",
        );
        let _ = conn.execute(
            "INSERT INTO dashboard_activity_log (user_id, action_type, details, module_name, record_reference, navigation_target, action_context, checksum)
             VALUES (?1, 'exception_bulk_resolved', ?2, 'Exceptions', '', '/shipment', '', ?3)",
            params![&input.user_id, &details, &ck],
        );
    }
    let _ = dashboard_cache::invalidate_dashboard_metrics_cache(&conn);
    Ok(n)
}
