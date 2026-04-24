//! Single-operator incident engine: alert → incident → diagnosis → resolution → post-mortem.

use crate::commands::workflow_production_observability::record_performance_timing;
use crate::db::DbState;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::time::Instant;
use tauri::State;
use uuid::Uuid;

const MIN_ROOT_CAUSE_LEN: usize = 50;
const CORRELATION_WINDOW_MINS: i64 = 10;

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
        Err("operations center: insufficient role".into())
    }
}

fn require_admin(role: &str) -> Result<(), String> {
    let n = normalize_role(role);
    if n.contains("admin") {
        Ok(())
    } else {
        Err("operations center: admin role required".into())
    }
}

fn require_admin_or_debug(conn: &Connection, role: &str) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let dbg = conn
        .query_row(
            "SELECT trim(value) FROM app_metadata WHERE key = 'import_manager_debug_failure_triggers'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_default();
    if dbg == "1" {
        return Ok(());
    }
    require_admin(role)
}

fn append_history(
    conn: &Connection,
    incident_id: &str,
    event_type: &str,
    notes: Option<&str>,
    details: &Value,
) -> Result<(), String> {
    let hid = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_incident_history (history_id, incident_id, event_type, event_timestamp, notes, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            &hid,
            incident_id,
            event_type,
            &ts,
            notes,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Deterministic grouping key: `module:event_type:entity` (or `__global__`).
pub fn compute_incident_correlation_key(
    source_module: &str,
    event_type: &str,
    entity_id: Option<&str>,
    _timestamp: &str,
) -> String {
    let ent = entity_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("__global__");
    format!(
        "{}:{}:{}",
        source_module.trim(),
        event_type.trim(),
        ent
    )
}

fn find_correlated_open_incident(
    conn: &Connection,
    correlation_key: &str,
) -> Result<Option<(String, String)>, String> {
    let window = format!("-{CORRELATION_WINDOW_MINS} minutes");
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT i.incident_id, i.correlation_id
             FROM workflow_incidents i
             WHERE i.status = 'OPEN'
               AND (i.correlation_key = ?1 OR i.correlation_key = replace(?1, ':', '|'))
               AND (
                 datetime(i.created_at) > datetime('now', ?2)
                 OR EXISTS (
                   SELECT 1 FROM workflow_incident_history h
                   WHERE h.incident_id = i.incident_id
                     AND h.event_type IN ('CORRELATED_EVENT','ALERT_CORRELATED')
                     AND datetime(h.event_timestamp) > datetime('now', ?2)
                 )
               )
             ORDER BY datetime(i.created_at) DESC
             LIMIT 1",
            params![correlation_key, &window],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row)
}

/// Any OPEN incident matching the correlation key (used when attaching structured regressions outside the short correlate window).
fn find_any_open_incident_by_correlation_key(
    conn: &Connection,
    correlation_key: &str,
) -> Result<Option<String>, String> {
    let row: Option<String> = conn
        .query_row(
            "SELECT incident_id FROM workflow_incidents
             WHERE status = 'OPEN'
               AND (correlation_key = ?1 OR correlation_key = replace(?1, ':', '|'))
             ORDER BY datetime(created_at) DESC
             LIMIT 1",
            params![correlation_key.trim()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row)
}

fn bump_correlation_incident_created(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let alerts: i64 = conn
        .query_row(
            "SELECT COALESCE(alerts_grouped, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let created: i64 = conn
        .query_row(
            "SELECT COALESCE(incidents_created, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let new_c = created + 1;
    let ratio = alerts as f64 / (alerts + new_c).max(1) as f64;
    let burst: i64 = conn
        .query_row(
            "SELECT COALESCE(burst_signals_emitted, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let bursts_det: i64 = conn
        .query_row(
            "SELECT COALESCE(bursts_detected, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO workflow_incident_correlation_metrics (metric_date, alerts_grouped, incidents_created, noise_reduction_ratio, burst_signals_emitted, bursts_detected, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(metric_date) DO UPDATE SET
           incidents_created = excluded.incidents_created,
           noise_reduction_ratio = excluded.noise_reduction_ratio,
           updated_at = excluded.updated_at",
        params![&d, alerts, new_c, ratio, burst, bursts_det, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_correlation_alert_grouped(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let alerts: i64 = conn
        .query_row(
            "SELECT COALESCE(alerts_grouped, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let created: i64 = conn
        .query_row(
            "SELECT COALESCE(incidents_created, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let new_a = alerts + 1;
    let ratio = new_a as f64 / (new_a + created).max(1) as f64;
    let burst: i64 = conn
        .query_row(
            "SELECT COALESCE(burst_signals_emitted, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let bursts_det: i64 = conn
        .query_row(
            "SELECT COALESCE(bursts_detected, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO workflow_incident_correlation_metrics (metric_date, alerts_grouped, incidents_created, noise_reduction_ratio, burst_signals_emitted, bursts_detected, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(metric_date) DO UPDATE SET
           alerts_grouped = excluded.alerts_grouped,
           noise_reduction_ratio = excluded.noise_reduction_ratio,
           updated_at = excluded.updated_at",
        params![&d, new_a, created, ratio, burst, bursts_det, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_correlation_burst_emitted(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let alerts: i64 = conn
        .query_row(
            "SELECT COALESCE(alerts_grouped, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let created: i64 = conn
        .query_row(
            "SELECT COALESCE(incidents_created, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let burst: i64 = conn
        .query_row(
            "SELECT COALESCE(burst_signals_emitted, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let new_b = burst + 1;
    let bursts_det: i64 = conn
        .query_row(
            "SELECT COALESCE(bursts_detected, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let ratio = alerts as f64 / (alerts + created).max(1) as f64;
    conn.execute(
        "INSERT INTO workflow_incident_correlation_metrics (metric_date, alerts_grouped, incidents_created, noise_reduction_ratio, burst_signals_emitted, bursts_detected, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(metric_date) DO UPDATE SET
           burst_signals_emitted = excluded.burst_signals_emitted,
           noise_reduction_ratio = excluded.noise_reduction_ratio,
           updated_at = excluded.updated_at",
        params![&d, alerts, created, ratio, new_b, bursts_det, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_correlation_systemic_bursts_detected(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let u = conn
        .execute(
            "UPDATE workflow_incident_correlation_metrics SET bursts_detected = bursts_detected + 1, updated_at = ?1 WHERE metric_date = ?2",
            params![&ts, &d],
        )
        .map_err(|e| e.to_string())?;
    if u == 0 {
        conn.execute(
            "INSERT INTO workflow_incident_correlation_metrics (metric_date, alerts_grouped, incidents_created, noise_reduction_ratio, burst_signals_emitted, bursts_detected, updated_at)
             VALUES (?1, 0, 0, 0, 0, 1, ?2)",
            params![&d, &ts],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn correlated_events_in_window(conn: &Connection, incident_id: &str) -> Result<i64, String> {
    let window = format!("-{CORRELATION_WINDOW_MINS} minutes");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE incident_id = ?1
               AND event_type IN ('CREATED','CORRELATED_EVENT','ALERT_CORRELATED')
               AND datetime(event_timestamp) > datetime('now', ?2)",
            params![incident_id, &window],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n)
}

fn correlated_only_in_window(conn: &Connection, incident_id: &str) -> Result<i64, String> {
    let window = format!("-{CORRELATION_WINDOW_MINS} minutes");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE incident_id = ?1
               AND event_type IN ('CORRELATED_EVENT','ALERT_CORRELATED')
               AND datetime(event_timestamp) > datetime('now', ?2)",
            params![incident_id, &window],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n)
}

fn correlation_time_spread_minutes(conn: &Connection, incident_id: &str) -> Result<f64, String> {
    let window = format!("-{CORRELATION_WINDOW_MINS} minutes");
    let spread: Option<f64> = conn
        .query_row(
            "SELECT (MAX(julianday(event_timestamp)) - MIN(julianday(event_timestamp))) * 24.0 * 60.0
             FROM workflow_incident_history
             WHERE incident_id = ?1
               AND event_type IN ('CREATED','CORRELATED_EVENT','ALERT_CORRELATED')
               AND datetime(event_timestamp) > datetime('now', ?2)",
            params![incident_id, &window],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(spread.unwrap_or(0.0))
}

fn maybe_emit_burst_detected(
    conn: &Connection,
    incident_id: &str,
    correlation_key: &str,
) -> Result<(), String> {
    let correlates = correlated_only_in_window(conn, incident_id)?;
    if correlates <= 5 {
        return Ok(());
    }
    let recent_burst: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = 'BURST_DETECTED'
               AND IFNULL(entity_id,'') = ?1
               AND datetime(created_at) > datetime('now', '-30 minutes')",
            params![incident_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if recent_burst > 0 {
        return Ok(());
    }
    let aid = Uuid::new_v4().to_string();
    let ts = now_ts();
    let msg = format!(
        "Incident correlation burst: >5 correlated events in {CORRELATION_WINDOW_MINS}m (incident {incident_id})"
    );
    let details = json!({
        "incidentId": incident_id,
        "correlationKey": correlation_key,
        "correlatedEventCount": correlates,
        "windowMinutes": CORRELATION_WINDOW_MINS,
    });
    conn.execute(
        "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
         VALUES (?1, ?2, 'BURST_DETECTED', 'WARNING', ?3, ?4, ?5)",
        params![&aid, &ts, incident_id, &msg, &details.to_string()],
    )
    .map_err(|e| e.to_string())?;
    append_history(
        conn,
        incident_id,
        "BURST_DETECTED",
        Some("Correlation burst threshold exceeded; WARNING signal emitted"),
        &json!({ "alertReference": aid, "correlatedEvents": correlates }),
    )?;
    let _ = bump_correlation_burst_emitted(conn);
    Ok(())
}

fn maybe_emit_amplification_warning(
    conn: &Connection,
    incident_id: &str,
    correlated_event_count: i64,
) -> Result<(), String> {
    if correlated_event_count < 10 {
        return Ok(());
    }
    let recent: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = 'AMPLIFICATION_WARNING'
               AND IFNULL(entity_id,'') = ?1
               AND datetime(created_at) > datetime('now', '-30 minutes')",
            params![incident_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if recent > 0 {
        return Ok(());
    }
    let aid = Uuid::new_v4().to_string();
    let ts = now_ts();
    let msg = format!(
        "Incident amplification: correlated_event_count={correlated_event_count} for incident {incident_id}"
    );
    let details = json!({
        "incidentId": incident_id,
        "correlatedEventCount": correlated_event_count,
    });
    conn.execute(
        "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
         VALUES (?1, ?2, 'AMPLIFICATION_WARNING', 'WARNING', ?3, ?4, ?5)",
        params![&aid, &ts, incident_id, &msg, &details.to_string()],
    )
    .map_err(|e| e.to_string())?;
    append_history(
        conn,
        incident_id,
        "AMPLIFICATION_WARNING",
        Some("Correlated event count reached amplification threshold"),
        &json!({ "alertReference": aid, "correlatedEventCount": correlated_event_count }),
    )?;
    Ok(())
}

fn correlation_stats_json(conn: &Connection, incident_id: &str) -> Result<Value, String> {
    let n = correlated_events_in_window(conn, incident_id)?;
    let spread = correlation_time_spread_minutes(conn, incident_id)?;
    let correl_only = correlated_only_in_window(conn, incident_id)?;
    let summary = if correl_only == 0 {
        if n <= 1 {
            "Single alert in correlation window".to_string()
        } else {
            format!("{n} lifecycle events in last {CORRELATION_WINDOW_MINS} minutes")
        }
    } else {
        format!("Occurred {n} times in last {CORRELATION_WINDOW_MINS} minutes")
    };
    let stream_active = correl_only > 0;
    let mins_since_last_correlate: Option<f64> = conn
        .query_row(
            "SELECT (julianday('now') - julianday(MAX(event_timestamp))) * 24.0 * 60.0
             FROM workflow_incident_history
             WHERE incident_id = ?1 AND event_type IN ('CORRELATED_EVENT','ALERT_CORRELATED')",
            params![incident_id],
            |r| r.get::<_, f64>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "relatedEventCount": n,
        "correlationClusterSize": n,
        "timeSpreadMinutes": spread,
        "aggregationSummary": summary,
        "correlationStreamActive": stream_active,
        "correlatedOnlyInWindow": correl_only,
        "minutesSinceLastCorrelate": mins_since_last_correlate,
    }))
}

fn correlation_stream_blocks_resolve(conn: &Connection, incident_id: &str) -> Result<bool, String> {
    let correl_only = correlated_only_in_window(conn, incident_id)?;
    if correl_only == 0 {
        return Ok(false);
    }
    let window = format!("-{CORRELATION_WINDOW_MINS} minutes");
    let recent: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE incident_id = ?1
               AND event_type IN ('CREATED','CORRELATED_EVENT','ALERT_CORRELATED')
               AND datetime(event_timestamp) > datetime('now', ?2)",
            params![incident_id, &window],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(recent > 0)
}

fn bump_metrics_new_incident(conn: &Connection, severity: &str) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let crit = if matches!(severity.to_uppercase().as_str(), "CRITICAL" | "FATAL") {
        1i64
    } else {
        0i64
    };
    conn.execute(
        "INSERT INTO workflow_incident_metrics (metric_date, incidents_created_today, incidents_resolved_today, avg_resolution_time, critical_incident_count, updated_at)
         VALUES (?1, 1, 0, 0, ?2, ?3)
         ON CONFLICT(metric_date) DO UPDATE SET
           incidents_created_today = incidents_created_today + 1,
           critical_incident_count = critical_incident_count + excluded.critical_incident_count,
           updated_at = excluded.updated_at",
        params![&d, crit, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_metrics_resolved(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_incident_metrics (metric_date, incidents_created_today, incidents_resolved_today, avg_resolution_time, critical_incident_count, updated_at)
         VALUES (?1, 0, 1, 0, 0, ?2)
         ON CONFLICT(metric_date) DO UPDATE SET
           incidents_resolved_today = incidents_resolved_today + 1,
           updated_at = excluded.updated_at",
        params![&d, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// After a CRITICAL/FATAL alert is persisted: correlate or create incident + history CREATED.
/// Returns the affected `incident_id` when an incident was updated or created.
pub fn maybe_promote_alert_to_incident(
    conn: &Connection,
    alert_id: &str,
    signal_type: &str,
    severity: &str,
    entity_id: Option<&str>,
    message: &str,
    details: &Value,
    source_module: &str,
) -> Result<Option<String>, String> {
    let sev = severity.trim().to_uppercase();
    if sev != "CRITICAL" && sev != "FATAL" {
        return Ok(None);
    }
    let sm = source_module.trim();
    if sm.is_empty() {
        return Ok(None);
    }
    let ts = now_ts();
    let corr_key = compute_incident_correlation_key(sm, signal_type, entity_id, &ts);
    if let Some((iid, corr)) = find_correlated_open_incident(conn, &corr_key)? {
        append_history(
            conn,
            &iid,
            "CORRELATED_EVENT",
            Some("Additional alert correlated into existing incident"),
            &json!({
                "alertReference": alert_id,
                "correlationId": corr,
                "correlationKey": &corr_key,
                "signalType": signal_type,
                "message": message,
            }),
        )?;
        conn.execute(
            "UPDATE workflow_incidents SET correlated_event_count = correlated_event_count + 1, last_correlated_at = ?1 WHERE incident_id = ?2",
            params![&ts, &iid],
        )
        .map_err(|e| e.to_string())?;
        let amp_count: i64 = conn
            .query_row(
                "SELECT correlated_event_count FROM workflow_incidents WHERE incident_id = ?1",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or(1);
        let _ = maybe_emit_amplification_warning(conn, &iid, amp_count);
        let _ = bump_correlation_alert_grouped(conn);
        let _ = maybe_emit_burst_detected(conn, &iid, &corr_key);
        return Ok(Some(iid));
    }
    let incident_id = Uuid::new_v4().to_string();
    let correlation_id = Uuid::new_v4().to_string();
    let ctx = json!({
        "message": message,
        "entityId": entity_id,
        "signalType": signal_type,
        "alertDetails": details,
        "linkedAlertId": alert_id,
        "correlationKey": &corr_key,
    });
    conn.execute(
        "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
         VALUES (?1, ?2, ?3, 'OPEN', ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, NULL, NULL)",
        params![
            &incident_id,
            &ts,
            &sev,
            &ctx.to_string(),
            sm,
            alert_id,
            signal_type,
            &correlation_id,
            &corr_key,
            &ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    append_history(
        conn,
        &incident_id,
        "CREATED",
        Some("Incident opened from critical alert"),
        &json!({ "alertId": alert_id, "correlationId": &correlation_id, "correlationKey": &corr_key }),
    )?;
    let _ = bump_metrics_new_incident(conn, &sev);
    let _ = bump_correlation_incident_created(conn);
    log::info!(
        target: "structured",
        "{}",
        json!({
            "module": "workflow_incident_management",
            "event_type": "incident_created",
            "entity_id": &incident_id,
            "severity": &sev,
            "details": { "alertId": alert_id, "sourceModule": sm, "correlationId": &correlation_id, "correlationKey": &corr_key }
        })
    );
    Ok(Some(incident_id))
}

fn has_resolution_discipline(conn: &Connection, incident_id: &str) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE incident_id = ?1 AND event_type IN ('RESOLUTION_NOTE','MANUAL_INTERVENTION')
               AND notes IS NOT NULL AND length(trim(notes)) >= 10",
            params![incident_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n > 0)
}

pub fn append_incident_resolution_note(
    conn: &Connection,
    incident_id: &str,
    notes: &str,
) -> Result<(), String> {
    let chk: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE incident_id = ?1 AND status = 'OPEN'",
            params![incident_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if chk == 0 {
        return Err("incident not found or not OPEN".into());
    }
    append_history(
        conn,
        incident_id,
        "RESOLUTION_NOTE",
        Some(notes.trim()),
        &json!({}),
    )?;
    Ok(())
}

pub fn resolve_incident(
    conn: &Connection,
    incident_id: &str,
    root_cause_summary: &str,
    skip_correlation_quiet_check: bool,
) -> Result<(), String> {
    let summary = root_cause_summary.trim();
    if summary.len() < MIN_ROOT_CAUSE_LEN {
        return Err(format!(
            "root_cause_summary must be at least {MIN_ROOT_CAUSE_LEN} characters"
        ));
    }
    if !has_resolution_discipline(conn, incident_id)? {
        return Err(
            "resolution requires at least one RESOLUTION_NOTE or MANUAL_INTERVENTION history entry (min 10 chars)"
                .into(),
        );
    }
    if !skip_correlation_quiet_check && correlation_stream_blocks_resolve(conn, incident_id)? {
        return Err(
            "correlated alert stream is still active inside the correlation window; wait until events go quiet (or use automatic recovery to close)"
                .into(),
        );
    }
    let status: String = conn
        .query_row(
            "SELECT status FROM workflow_incidents WHERE incident_id = ?1",
            params![incident_id],
            |r| r.get(0),
        )
        .map_err(|_| "incident not found".to_string())?;
    if status.trim().to_uppercase() != "OPEN" {
        return Err("only OPEN incidents can be resolved".into());
    }
    let reg_hist: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE incident_id = ?1 AND event_type = 'REGRESSION_DETECTED'",
            params![incident_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let ts = now_ts();
    if reg_hist > 0 {
        append_history(
            conn,
            incident_id,
            "REGRESSION_RESOLVED",
            Some("Regression lifecycle cleared after operator resolution"),
            &json!({}),
        )?;
    }
    conn.execute(
        "UPDATE workflow_incidents SET status = 'RESOLVED', resolved_at = ?1, root_cause_summary = ?2 WHERE incident_id = ?3",
        params![&ts, summary, incident_id],
    )
    .map_err(|e| e.to_string())?;
    append_history(
        conn,
        incident_id,
        "STATUS_CHANGED",
        Some("Incident resolved"),
        &json!({ "from": "OPEN", "to": "RESOLVED", "rootCauseSummary": summary }),
    )?;
    let _ = bump_metrics_resolved(conn);
    Ok(())
}

/// Record automatic recovery against open incidents tied to this job (via alert entity_id).
pub fn record_recovery_healing(conn: &Connection, job_id: &str, details: &Value) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT i.incident_id FROM workflow_incidents i
             JOIN workflow_alert_signal_log a ON a.id = i.linked_alert_id
             WHERE i.status = 'OPEN' AND IFNULL(a.entity_id,'') = ?1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt
        .query_map(params![job_id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let auto_rc = "Automatic recovery completed successfully after scheduled or operator recovery; workload cleared without manual root-cause entry beyond this system note.";
    for iid in ids {
        append_history(
            conn,
            &iid,
            "SYSTEM_RECOVERY",
            Some("Background recovery succeeded for linked job"),
            details,
        )?;
        let _ = append_incident_resolution_note(
            conn,
            &iid,
            "System recovery cleared the failure condition for this job; operator post-mortem still recommended if severity was FATAL.",
        );
        let _ = resolve_incident(conn, &iid, auto_rc, true);
    }
    Ok(())
}

/// Stale action logs and aged forecasts outside the newest retention window (growth control).
fn cleanup_expired_forecast_actions(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM workflow_forecast_action_log
         WHERE datetime(acknowledged_at) < datetime('now', '-30 days')",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM workflow_forecast_action_log
         WHERE forecast_id NOT IN (SELECT forecast_id FROM workflow_failure_forecast)",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM workflow_failure_forecast
         WHERE datetime(forecast_time) < datetime('now', '-30 days')
           AND forecast_id NOT IN (
             SELECT forecast_id FROM (
               SELECT forecast_id FROM workflow_failure_forecast
               ORDER BY datetime(forecast_time) DESC
               LIMIT 1000
             )
           )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Keep the newest 1000 forecast rows; when over capacity, drop oldest. Otherwise drop rows older than 90 days.
fn retain_recent_forecasts(conn: &Connection) -> Result<(), String> {
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if total > 1000 {
        let remove_n = total - 1000;
        let mut stmt = conn
            .prepare(
                "SELECT forecast_id FROM workflow_failure_forecast
                 ORDER BY datetime(forecast_time) ASC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt
            .query_map(params![remove_n], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for fid in ids {
            let _ = conn.execute(
                "DELETE FROM workflow_forecast_action_log WHERE forecast_id = ?1",
                params![&fid],
            );
            conn.execute(
                "DELETE FROM workflow_failure_forecast WHERE forecast_id = ?1",
                params![&fid],
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    conn.execute(
        "DELETE FROM workflow_failure_forecast
         WHERE datetime(forecast_time) < datetime('now', '-90 days')",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM workflow_forecast_action_log
         WHERE forecast_id NOT IN (SELECT forecast_id FROM workflow_failure_forecast)",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Ensures each incident has a CREATED history row (audit completeness).
fn verify_incident_history_integrity(conn: &Connection) -> Result<i64, String> {
    let mut stmt = conn
        .prepare(
            "SELECT incident_id, created_at FROM workflow_incidents
             ORDER BY datetime(created_at) DESC
             LIMIT 2000",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut fixed = 0i64;
    for (iid, created_at) in rows {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_incident_history
                 WHERE incident_id = ?1 AND event_type = 'CREATED'",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if n == 0 {
            append_history(
                conn,
                &iid,
                "CREATED",
                Some("Corrective audit: restored missing CREATED entry"),
                &json!({
                    "corrective": true,
                    "restoredFromIncidentCreatedAt": &created_at,
                }),
            )?;
            fixed += 1;
        }
    }
    Ok(fixed)
}

fn detect_forecast_probability_drift(conn: &Connection) -> Result<(), String> {
    let today_avg: Option<f64> = conn
        .query_row(
            "SELECT AVG(predicted_failure_probability) FROM workflow_failure_forecast
             WHERE date(forecast_time) = date('now')",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let prev_avg: Option<f64> = conn
        .query_row(
            "SELECT AVG(predicted_failure_probability) FROM workflow_failure_forecast
             WHERE date(forecast_time) < date('now')
               AND date(forecast_time) >= date('now', '-7 days')",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (Some(ta), Some(pa)) = (today_avg, prev_avg) else {
        return Ok(());
    };
    if !ta.is_finite() || !pa.is_finite() || pa.abs() < 1e-6 {
        return Ok(());
    }
    let rel = ((ta - pa) / pa.abs()).abs();
    if rel <= 0.30 {
        return Ok(());
    }
    let details = json!({
        "kind": "FORECAST_DRIFT_WARNING",
        "avgProbabilityToday": ta,
        "avgProbabilityPrior7dExcludingToday": pa,
        "relativeChange": rel,
    });
    insert_forecast_escalation_event(
        conn,
        "workflow_forecast",
        "FORECAST_DRIFT_WARNING",
        &details,
    )?;
    Ok(())
}

fn generate_system_integrity_snapshot(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let incidents: i64 = conn
        .query_row("SELECT COUNT(*) FROM workflow_incidents", [], |r| r.get(0))
        .unwrap_or(0);
    let forecasts: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let suppressions: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_suppression",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let regressions: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_regression",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let persistence: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_persistence",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let action_logs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_action_log",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let details = json!({
        "incidentCount": incidents,
        "forecastCount": forecasts,
        "suppressionCount": suppressions,
        "regressionCount": regressions,
        "persistenceCount": persistence,
        "forecastActionLogCount": action_logs,
    });
    conn.execute(
        "INSERT INTO system_integrity_snapshot (snapshot_date, details_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(snapshot_date) DO UPDATE SET
           details_json = excluded.details_json,
           updated_at = excluded.updated_at",
        params![&d, &details.to_string(), &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Clears recent debug drill rows for the same simulation label to avoid stacked duplicate state.
fn cleanup_previous_debug_scope(conn: &Connection, simulation: &str) -> Result<(), String> {
    let sim = simulation.trim();
    if sim.is_empty() || !sim.starts_with("trigger_") {
        return Ok(());
    }
    conn.execute(
        "DELETE FROM workflow_incidents
         WHERE datetime(created_at) > datetime('now', '-24 hours')
           AND (
             lower(coalesce(json_extract(error_context_json, '$.alertDetails.simulation'), '')) = lower(?1)
             OR incident_id IN (
               SELECT DISTINCT incident_id FROM workflow_incident_history
               WHERE json_extract(details_json, '$.debugMode') IS 1
                 AND lower(coalesce(json_extract(details_json, '$.simulation'), '')) = lower(?1)
                 AND datetime(event_timestamp) > datetime('now', '-24 hours')
             )
           )",
        params![sim],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn refresh_incident_daily_metrics(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let created: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE date(created_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let resolved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE date(resolved_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let crit: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents
             WHERE date(created_at) = date('now') AND severity IN ('CRITICAL','FATAL')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let avg: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG((julianday(resolved_at) - julianday(created_at)) * 24.0 * 60.0), 0)
             FROM workflow_incidents
             WHERE resolved_at IS NOT NULL AND date(resolved_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    conn.execute(
        "INSERT INTO workflow_incident_metrics (metric_date, incidents_created_today, incidents_resolved_today, avg_resolution_time, critical_incident_count, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(metric_date) DO UPDATE SET
           incidents_created_today = excluded.incidents_created_today,
           incidents_resolved_today = excluded.incidents_resolved_today,
           avg_resolution_time = excluded.avg_resolution_time,
           critical_incident_count = excluded.critical_incident_count,
           updated_at = excluded.updated_at",
        params![&d, created, resolved, avg, crit, &ts],
    )
    .map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_incident_correlation_metrics (metric_date, alerts_grouped, incidents_created, noise_reduction_ratio, burst_signals_emitted, bursts_detected, updated_at)
         VALUES (?1, 0, 0, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let total_alerts: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE date(created_at) = date('now')
               AND upper(trim(severity)) IN ('CRITICAL','FATAL')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let alerts_grouped: i64 = conn
        .query_row(
            "SELECT COALESCE(alerts_grouped, 0) FROM workflow_incident_correlation_metrics WHERE metric_date = date('now')",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let denom = total_alerts.max(1);
    let noise = (alerts_grouped as f64) / (denom as f64);
    conn.execute(
        "INSERT INTO workflow_incident_noise_score (metric_date, noise_score, total_alerts, alerts_grouped, updated_at)
         VALUES (date('now'), ?1, ?2, ?3, ?4)
         ON CONFLICT(metric_date) DO UPDATE SET
           noise_score = excluded.noise_score,
           total_alerts = excluded.total_alerts,
           alerts_grouped = excluded.alerts_grouped,
           updated_at = excluded.updated_at",
        params![noise, total_alerts, alerts_grouped, &ts],
    )
    .map_err(|e| e.to_string())?;
    let _ = rollup_suppression_metrics_for_day(conn);
    let _ = refresh_suppression_state(conn);
    let _ = detect_stabilization_phase(conn);
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_incident_stabilization_metrics (metric_date, stabilizations_detected, avg_stabilization_time, false_recovery_rate, stability_confidence_avg, updated_at)
         VALUES (?1, 0, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_incident_regression_metrics (metric_date, regressions_detected, avg_regression_time_minutes, regression_frequency, updated_at)
         VALUES (?1, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_structured_regression_metrics (metric_date, structured_regressions_detected, avg_structured_regression_time, structured_regression_ratio, updated_at)
         VALUES (?1, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let _ = sync_regression_metrics_for_today(conn);
    let _ = sync_structured_regression_metrics_for_today(conn);
    let _ = refresh_regression_risk_score_row(conn);
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_persistent_failure_metrics (metric_date, persistent_failures_detected, avg_persistence_duration, persistence_frequency, updated_at)
         VALUES (?1, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let _ = detect_persistent_failure_rate(conn);
    let _ = sync_persistent_failure_metrics_for_today(conn);
    let _ = refresh_persistence_risk_score_row(conn);
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_failure_forecast_metrics (metric_date, forecasts_generated, forecast_accuracy, forecast_false_positive_rate, prediction_accuracy_score, updated_at)
         VALUES (?1, 0, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_forecast_explanation_metrics (metric_date, explanations_generated, accurate_explanations, misleading_explanations, updated_at)
         VALUES (?1, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_forecast_action_metrics (metric_date, actions_generated, actions_acknowledged, actions_effective, updated_at)
         VALUES (?1, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let _ = retain_recent_forecasts(conn);
    let _ = cleanup_expired_forecast_actions(conn);
    let _ = verify_incident_history_integrity(conn);
    let _ = detect_forecast_probability_drift(conn);
    let _ = generate_system_integrity_snapshot(conn);
    let _ = detect_failure_forecasts(conn);
    let _ = sync_forecast_metrics_for_today(conn);
    Ok(())
}

// --- Incident suppression (V36): burst-driven + manual noise reduction ---

const SUPPRESSION_QUIET_RELEASE_MINS: i64 = 10;
const SUPPRESSION_BURST_WINDOW_MIN_MINS: i64 = 10;
const SUPPRESSION_BURST_WINDOW_MAX_MINS: i64 = 30;

fn suppression_window_mins_from_burst_id(burst_id: &str) -> i64 {
    let h = burst_id
        .as_bytes()
        .iter()
        .fold(0u32, |a, &b| a.wrapping_add(b as u32));
    let span = (SUPPRESSION_BURST_WINDOW_MAX_MINS - SUPPRESSION_BURST_WINDOW_MIN_MINS + 1) as u32;
    SUPPRESSION_BURST_WINDOW_MIN_MINS + (h % span) as i64
}

fn bump_suppression_metrics_suppressed(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let suppressed: i64 = conn
        .query_row(
            "SELECT COALESCE(alerts_suppressed, 0) FROM workflow_incident_suppression_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let new_s = suppressed + 1;
    let windows: i64 = conn
        .query_row(
            "SELECT COALESCE(suppression_windows, 0) FROM workflow_incident_suppression_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let gain = (new_s as f64 / (new_s + 12) as f64).min(0.995);
    let conf = (0.55 + (new_s as f64 * 0.004)).min(0.99);
    conn.execute(
        "INSERT INTO workflow_incident_suppression_metrics (metric_date, alerts_suppressed, suppression_windows, noise_reduction_gain, confidence_score, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(metric_date) DO UPDATE SET
           alerts_suppressed = excluded.alerts_suppressed,
           noise_reduction_gain = excluded.noise_reduction_gain,
           confidence_score = excluded.confidence_score,
           updated_at = excluded.updated_at",
        params![&d, new_s, windows, gain, conf, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn bump_suppression_metrics_window_created(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let suppressed: i64 = conn
        .query_row(
            "SELECT COALESCE(alerts_suppressed, 0) FROM workflow_incident_suppression_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let windows: i64 = conn
        .query_row(
            "SELECT COALESCE(suppression_windows, 0) FROM workflow_incident_suppression_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let new_w = windows + 1;
    let gain = (suppressed as f64 / (suppressed + 12) as f64).min(0.995);
    conn.execute(
        "INSERT INTO workflow_incident_suppression_metrics (metric_date, alerts_suppressed, suppression_windows, noise_reduction_gain, confidence_score, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(metric_date) DO UPDATE SET
           suppression_windows = excluded.suppression_windows,
           noise_reduction_gain = excluded.noise_reduction_gain,
           updated_at = excluded.updated_at",
        params![&d, suppressed, new_w, gain, 0.58_f64, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn rollup_suppression_metrics_for_day(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_incident_suppression_metrics (metric_date, alerts_suppressed, suppression_windows, noise_reduction_gain, confidence_score, updated_at)
         VALUES (?1, 0, 0, 0, 0.55, ?2)",
        params![&d, &ts],
    );
    Ok(())
}

/// Ends suppression windows early on quiet periods; logs SUPPRESSION_ENDED to incident history once.
pub fn refresh_suppression_state(conn: &Connection) -> Result<(), String> {
    let quiet = format!("-{SUPPRESSION_QUIET_RELEASE_MINS} minutes");
    conn.execute(
        "UPDATE workflow_incident_suppression
         SET suppression_end = datetime('now')
         WHERE release_history_logged = 0
           AND datetime(suppression_end) > datetime('now')
           AND datetime(last_activity_at) < datetime('now', ?1)",
        params![&quiet],
    )
    .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT suppression_id, incident_id, correlation_id, suppressed_event_count, reason, confidence_score
             FROM workflow_incident_suppression
             WHERE release_history_logged = 0
               AND datetime(suppression_end) < datetime('now')",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, Option<String>, Option<String>, i64, String, f64)> = stmt
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
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (sid, iid, corr, n_sup, reason, conf) in rows {
        if let Some(ref inc) = iid {
            let _ = append_history(
                conn,
                inc,
                "SUPPRESSION_ENDED",
                Some("Incident signal suppression window closed"),
                &json!({
                    "suppressionId": &sid,
                    "correlationId": corr,
                    "suppressedEventCount": n_sup,
                    "reason": &reason,
                    "confidenceScore": conf,
                }),
            );
        }
        conn.execute(
            "UPDATE workflow_incident_suppression SET release_history_logged = 1 WHERE suppression_id = ?1",
            params![&sid],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn find_active_suppression_id(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
) -> Result<Option<String>, String> {
    let sid: Option<String> = conn
        .query_row(
            "SELECT suppression_id FROM workflow_incident_suppression
             WHERE source_module = ?1 AND event_type = ?2
               AND datetime(suppression_start) <= datetime('now')
               AND datetime(suppression_end) >= datetime('now')
               AND release_history_logged = 0
             ORDER BY datetime(suppression_end) DESC
             LIMIT 1",
            params![source_module.trim(), event_type.trim()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(sid)
}

/// After a systemic burst: suppress repeated critical alerts for the same module + underlying event type.
pub fn create_burst_driven_suppression(
    conn: &Connection,
    correlation_id: &str,
    incident_id: Option<&str>,
    source_module: &str,
    event_type: &str,
    burst_id: &str,
) -> Result<String, String> {
    let sid = Uuid::new_v4().to_string();
    let ts = now_ts();
    let mins = suppression_window_mins_from_burst_id(burst_id);
    let end = (chrono::Utc::now() + chrono::Duration::minutes(mins))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let reason = format!(
        "Automatic suppression after systemic burst {} (window {}m)",
        burst_id, mins
    );
    conn.execute(
        "INSERT INTO workflow_incident_suppression (suppression_id, correlation_id, incident_id, source_module, event_type, suppression_start, suppression_end, last_activity_at, suppressed_event_count, confidence_score, release_history_logged, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, 0, 0.58, 0, ?8, ?6)",
        params![
            &sid,
            correlation_id,
            incident_id,
            source_module.trim(),
            event_type.trim(),
            &ts,
            &end,
            &reason,
        ],
    )
    .map_err(|e| e.to_string())?;
    let _ = bump_suppression_metrics_window_created(conn);
    if let Some(iid) = incident_id.filter(|s| !s.is_empty()) {
        let _ = append_history(
            conn,
            iid,
            "SUPPRESSION_STARTED",
            Some("Signal suppression window opened after burst"),
            &json!({
                "suppressionId": &sid,
                "correlationId": correlation_id,
                "sourceModule": source_module,
                "eventType": event_type,
                "suppressionEnd": &end,
                "windowMinutes": mins,
                "burstId": burst_id,
            }),
        );
    }
    Ok(sid)
}

/// Operator-initiated suppression (known outage). `window_mins` clamped 5–240.
pub fn start_manual_incident_suppression(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
    window_mins: i64,
    reason: &str,
    incident_id: Option<&str>,
) -> Result<String, String> {
    let wm = window_mins.clamp(5, 240);
    let sid = Uuid::new_v4().to_string();
    let ts = now_ts();
    let end = (chrono::Utc::now() + chrono::Duration::minutes(wm))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let corr = Uuid::new_v4().to_string();
    let r = if reason.trim().is_empty() {
        "Manual operator suppression".to_string()
    } else {
        reason.trim().to_string()
    };
    conn.execute(
        "INSERT INTO workflow_incident_suppression (suppression_id, correlation_id, incident_id, source_module, event_type, suppression_start, suppression_end, last_activity_at, suppressed_event_count, confidence_score, release_history_logged, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, 0, 0.6, 0, ?8, ?6)",
        params![
            &sid,
            &corr,
            incident_id,
            source_module.trim(),
            event_type.trim(),
            &ts,
            &end,
            &r,
        ],
    )
    .map_err(|e| e.to_string())?;
    let _ = bump_suppression_metrics_window_created(conn);
    if let Some(iid) = incident_id.filter(|s| !s.is_empty()) {
        let _ = append_history(
            conn,
            iid,
            "SUPPRESSION_STARTED",
            Some("Manual signal suppression window opened"),
            &json!({
                "suppressionId": &sid,
                "correlationId": &corr,
                "sourceModule": source_module,
                "eventType": event_type,
                "suppressionEnd": &end,
                "windowMinutes": wm,
                "reason": &r,
            }),
        );
    }
    Ok(sid)
}

/// If a CRITICAL/FATAL alert should not open or correlate into an incident due to active suppression.
pub fn apply_incident_suppression_to_critical_alert(
    conn: &Connection,
    source_module: &str,
    signal_type: &str,
    alert_id: &str,
) -> Result<bool, String> {
    let _ = refresh_suppression_state(conn);
    let Some(sid) = find_active_suppression_id(conn, source_module, signal_type)? else {
        return Ok(false);
    };
    let ts = now_ts();
    conn.execute(
        "UPDATE workflow_incident_suppression
         SET suppressed_event_count = suppressed_event_count + 1,
             last_activity_at = ?1,
             confidence_score = CASE WHEN confidence_score + 0.012 > 0.99 THEN 0.99 ELSE confidence_score + 0.012 END
         WHERE suppression_id = ?2",
        params![&ts, &sid],
    )
    .map_err(|e| e.to_string())?;
    let _ = bump_suppression_metrics_suppressed(conn);
    let prev: String = conn
        .query_row(
            "SELECT COALESCE(details_json, '{}') FROM workflow_alert_signal_log WHERE id = ?1",
            params![alert_id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "{}".into());
    let mut det: Value =
        serde_json::from_str(&prev).unwrap_or_else(|_| json!({}));
    if let Some(o) = det.as_object_mut() {
        o.insert("incidentSuppressed".into(), json!(true));
        o.insert("suppressionId".into(), json!(&sid));
        o.insert("suppressedAt".into(), json!(&ts));
    }
    conn.execute(
        "UPDATE workflow_alert_signal_log SET details_json = ?1 WHERE id = ?2",
        params![&det.to_string(), alert_id],
    )
    .map_err(|e| e.to_string())?;
    log::info!(
        target: "structured",
        "{}",
        json!({
            "module": "workflow_incident_suppression",
            "event_type": "alert_suppressed",
            "entity_id": alert_id,
            "severity": "INFO",
            "details": { "suppressionId": sid, "sourceModule": source_module, "signalType": signal_type }
        })
    );
    Ok(true)
}

// --- Incident stabilization (V37): quiet → stabilizing → confirmed ---

const STABILIZATION_QUIET_PERIOD_MINS: f64 = 10.0;
/// Confirm stability when quiet ≥ 2 × suppression quiet-release window (20 min).
fn stabilization_confirm_quiet_mins() -> f64 {
    (SUPPRESSION_QUIET_RELEASE_MINS as f64) * 2.0
}

fn quiet_minutes_scope_since_last_bad(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
) -> Result<f64, String> {
    let last_ts: Option<String> = conn
        .query_row(
            "SELECT MAX(ts) FROM (
                SELECT created_at AS ts FROM workflow_alert_signal_log
                 WHERE upper(trim(severity)) IN ('CRITICAL','FATAL')
                   AND signal_type = ?1
                UNION ALL
                SELECT timestamp AS ts FROM workflow_structured_event_log
                 WHERE module = ?2 AND event_type = ?1
                   AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
             )",
            params![event_type.trim(), source_module.trim()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(ts) = last_ts.filter(|s| !s.trim().is_empty()) else {
        return Ok(10_000.0);
    };
    let mins: f64 = conn
        .query_row(
            "SELECT (julianday('now') - julianday(?1)) * 24.0 * 60.0",
            params![&ts],
            |r| r.get::<_, f64>(0),
        )
        .unwrap_or(0.0_f64)
        .max(0.0_f64);
    Ok(mins)
}

fn expected_failure_interval_minutes(conn: &Connection, sm: &str, et: &str) -> f64 {
    let r = compute_baseline_failure_rate(conn, sm, et).unwrap_or_else(|_| 0.15);
    (10.0 / r.max(0.02)).max(15.0).min(720.0)
}

fn stabilization_confidence(quiet_mins: f64, expected_interval: f64) -> f64 {
    (quiet_mins / expected_interval.max(1.0)).min(0.99)
}

fn stabilization_candidate_pairs(
    conn: &Connection,
) -> Result<Vec<(String, String, Option<String>)>, String> {
    use std::collections::HashMap;
    let mut m: HashMap<(String, String), Option<String>> = HashMap::new();
    let mut s1 = conn
        .prepare(
            "SELECT incident_id, source_module, trigger_event_type
             FROM workflow_incidents WHERE status = 'OPEN'",
        )
        .map_err(|e| e.to_string())?;
    for row in s1
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
    {
        let (iid, sm, et) = row.map_err(|e| e.to_string())?;
        let sm = sm.trim().to_string();
        let et = et.trim().to_string();
        if sm.is_empty() || et.is_empty() {
            continue;
        }
        m.entry((sm, et))
            .and_modify(|v| {
                if v.is_none() {
                    *v = Some(iid.clone());
                }
            })
            .or_insert(Some(iid));
    }
    let mut s2 = conn
        .prepare(
            "SELECT DISTINCT source_module, event_type
             FROM workflow_failure_burst_log
             WHERE datetime(burst_start_time) > datetime('now', '-72 hours')",
        )
        .map_err(|e| e.to_string())?;
    for row in s2
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
    {
        let (sm, et) = row.map_err(|e| e.to_string())?;
        m.entry((sm.trim().to_string(), et.trim().to_string()))
            .or_insert(None);
    }
    let mut s3 = conn
        .prepare(
            "SELECT DISTINCT source_module, event_type, incident_id
             FROM workflow_incident_suppression
             WHERE datetime(created_at) > datetime('now', '-72 hours')",
        )
        .map_err(|e| e.to_string())?;
    for row in s3
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
    {
        let (sm, et, inc) = row.map_err(|e| e.to_string())?;
        let sm = sm.trim().to_string();
        let et = et.trim().to_string();
        m.entry((sm, et))
            .and_modify(|v| {
                if v.is_none() {
                    *v = inc.clone().filter(|s| !s.is_empty());
                }
            })
            .or_insert(inc.filter(|s| !s.is_empty()));
    }
    Ok(m.into_iter().map(|((a, b), c)| (a, b, c)).collect())
}

fn find_open_stabilization_row(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
) -> Result<Option<(String, String)>, String> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT stabilization_id, stabilization_start
             FROM workflow_incident_stabilization
             WHERE source_module = ?1 AND event_type = ?2
               AND stabilization_confirmed IS NULL
             ORDER BY datetime(stabilization_start) DESC
             LIMIT 1",
            params![source_module.trim(), event_type.trim()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row)
}

fn bump_stabilization_metrics_on_confirm(
    conn: &Connection,
    duration_minutes: i64,
    conf: f64,
) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let n: i64 = conn
        .query_row(
            "SELECT COALESCE(stabilizations_detected, 0) FROM workflow_incident_stabilization_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let new_n = n + 1;
    let prev_avg: f64 = conn
        .query_row(
            "SELECT COALESCE(avg_stabilization_time, 0) FROM workflow_incident_stabilization_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0.0);
    let prev_conf: f64 = conn
        .query_row(
            "SELECT COALESCE(stability_confidence_avg, 0) FROM workflow_incident_stabilization_metrics WHERE metric_date = ?1",
            params![&d],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0.0);
    let new_avg = (prev_avg * n as f64 + duration_minutes as f64) / new_n as f64;
    let new_conf_avg = (prev_conf * n as f64 + conf) / new_n as f64;
    conn.execute(
        "INSERT INTO workflow_incident_stabilization_metrics (metric_date, stabilizations_detected, avg_stabilization_time, false_recovery_rate, stability_confidence_avg, updated_at)
         VALUES (?1, ?2, ?3, 0, ?4, ?5)
         ON CONFLICT(metric_date) DO UPDATE SET
           stabilizations_detected = excluded.stabilizations_detected,
           avg_stabilization_time = excluded.avg_stabilization_time,
           stability_confidence_avg = excluded.stability_confidence_avg,
           updated_at = excluded.updated_at",
        params![&d, new_n, new_avg, new_conf_avg, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_system_stability_score_row(conn: &Connection) -> Result<(), String> {
    let ts = now_ts();
    let tot: i64 = conn
        .query_row("SELECT COUNT(*) FROM workflow_incidents", [], |r| r.get(0))
        .unwrap_or(1);
    conn.execute(
        "UPDATE workflow_system_stability_score SET successful_stabilizations = successful_stabilizations + 1 WHERE id = 1",
        [],
    )
    .map_err(|e| e.to_string())?;
    let succ: i64 = conn
        .query_row(
            "SELECT successful_stabilizations FROM workflow_system_stability_score WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let score = (succ as f64) / (tot.max(1) as f64);
    conn.execute(
        "UPDATE workflow_system_stability_score SET total_incidents = ?1, stability_score = ?2, updated_at = ?3 WHERE id = 1",
        params![tot, score, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn stabilization_resolution_already_recommended(
    conn: &Connection,
    incident_id: &str,
    stabilization_id: &str,
) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE incident_id = ?1 AND event_type = 'STABILIZATION_RESOLUTION_RECOMMENDED'
               AND COALESCE(json_extract(details_json, '$.stabilizationId'), '') = ?2",
            params![incident_id, stabilization_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n > 0)
}

/// Detects quiet windows, opens stabilization phases, confirms stability, recommends resolution (no auto-close).
pub fn detect_stabilization_phase(conn: &Connection) -> Result<i64, String> {
    let mut transitions = 0i64;
    let pairs = stabilization_candidate_pairs(conn)?;
    let confirm_need = stabilization_confirm_quiet_mins();
    let ts = now_ts();
    for (sm, et, incident_hint) in pairs {
        let quiet = quiet_minutes_scope_since_last_bad(conn, &sm, &et)?;
        if quiet < STABILIZATION_QUIET_PERIOD_MINS {
            continue;
        }
        let exp_int = expected_failure_interval_minutes(conn, &sm, &et);
        let conf = stabilization_confidence(quiet, exp_int);
        let incident_id: Option<String> = if let Some(ref i) = incident_hint {
            Some(i.clone())
        } else {
            conn.query_row(
                "SELECT incident_id FROM workflow_incidents
                 WHERE status = 'OPEN' AND source_module = ?1 AND trigger_event_type = ?2
                 ORDER BY datetime(created_at) DESC LIMIT 1",
                params![&sm, &et],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        };
        if let Some((sid, _start)) = find_open_stabilization_row(conn, &sm, &et)? {
            if quiet >= confirm_need {
                let dur = quiet.round() as i64;
                let u = conn.execute(
                    "UPDATE workflow_incident_stabilization
                     SET stabilization_confirmed = ?1,
                         stability_duration_minutes = ?2,
                         confidence_score = ?3
                     WHERE stabilization_id = ?4 AND stabilization_confirmed IS NULL",
                    params![&ts, dur, conf, &sid],
                )
                .map_err(|e| e.to_string())?;
                if u == 0 {
                    continue;
                }
                if let Some(ref iid) = incident_id {
                    append_history(
                        conn,
                        iid,
                        "STABILIZATION_CONFIRMED",
                        Some("Stability window confirmed after sustained quiet period"),
                        &json!({
                            "stabilizationId": &sid,
                            "stabilityDurationMinutes": dur,
                            "confidenceScore": conf,
                            "sourceModule": &sm,
                            "eventType": &et,
                        }),
                    )?;
                    if conn
                        .query_row(
                            "SELECT status FROM workflow_incidents WHERE incident_id = ?1",
                            params![iid],
                            |r| r.get::<_, String>(0),
                        )
                        .unwrap_or_default()
                        .to_uppercase()
                        == "OPEN"
                    {
                        if !stabilization_resolution_already_recommended(conn, iid, &sid)? {
                            append_history(
                                conn,
                                iid,
                                "STABILIZATION_RESOLUTION_RECOMMENDED",
                                Some("Stability confirmed — consider resolving the incident after operator review"),
                                &json!({
                                    "stabilizationId": &sid,
                                    "stabilityDurationMinutes": dur,
                                    "confidenceScore": conf,
                                    "sourceModule": &sm,
                                    "eventType": &et,
                                }),
                            )?;
                        }
                    }
                }
                let _ = bump_stabilization_metrics_on_confirm(conn, dur, conf);
                let _ = refresh_system_stability_score_row(conn);
                transitions += 1;
            }
        } else if quiet >= STABILIZATION_QUIET_PERIOD_MINS {
            let sid = Uuid::new_v4().to_string();
            let corr = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO workflow_incident_stabilization (stabilization_id, correlation_id, incident_id, source_module, event_type, stabilization_start, stabilization_confirmed, stability_duration_minutes, confidence_score, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0, ?7, ?6)",
                params![
                    &sid,
                    &corr,
                    incident_id.as_deref(),
                    sm.trim(),
                    et.trim(),
                    &ts,
                    conf,
                ],
            )
            .map_err(|e| e.to_string())?;
            if let Some(ref iid) = incident_id {
                append_history(
                    conn,
                    iid,
                    "STABILIZATION_STARTED",
                    Some("Stabilization phase detected: no CRITICAL/FATAL in scope for quiet period"),
                    &json!({
                        "stabilizationId": &sid,
                        "correlationId": &corr,
                        "quietMinutesObserved": quiet,
                        "confidenceScore": conf,
                        "sourceModule": &sm,
                        "eventType": &et,
                    }),
                )?;
            }
            if quiet >= confirm_need {
                let dur = quiet.round() as i64;
                let u2 = conn.execute(
                    "UPDATE workflow_incident_stabilization
                     SET stabilization_confirmed = ?1,
                         stability_duration_minutes = ?2,
                         confidence_score = ?3
                     WHERE stabilization_id = ?4 AND stabilization_confirmed IS NULL",
                    params![&ts, dur, conf, &sid],
                )
                .map_err(|e| e.to_string())?;
                if u2 == 0 {
                    continue;
                }
                if let Some(ref iid) = incident_id {
                    append_history(
                        conn,
                        iid,
                        "STABILIZATION_CONFIRMED",
                        Some("Stability window confirmed immediately (quiet already exceeded confirm threshold)"),
                        &json!({
                            "stabilizationId": &sid,
                            "stabilityDurationMinutes": dur,
                            "confidenceScore": conf,
                            "sourceModule": &sm,
                            "eventType": &et,
                        }),
                    )?;
                    if conn
                        .query_row(
                            "SELECT status FROM workflow_incidents WHERE incident_id = ?1",
                            params![iid],
                            |r| r.get::<_, String>(0),
                        )
                        .unwrap_or_default()
                        .to_uppercase()
                        == "OPEN"
                        && !stabilization_resolution_already_recommended(conn, iid, &sid)?
                    {
                        append_history(
                            conn,
                            iid,
                            "STABILIZATION_RESOLUTION_RECOMMENDED",
                            Some("Stability confirmed — consider resolving the incident after operator review"),
                            &json!({
                                "stabilizationId": &sid,
                                "stabilityDurationMinutes": dur,
                                "confidenceScore": conf,
                                "sourceModule": &sm,
                                "eventType": &et,
                            }),
                        )?;
                    }
                }
                let _ = bump_stabilization_metrics_on_confirm(conn, dur, conf);
                let _ = refresh_system_stability_score_row(conn);
                transitions += 1;
            }
            transitions += 1;
        }
    }
    Ok(transitions)
}

// --- Post-stabilization regression (V38): resolved + stabilized → same pattern fails again ---

const REGRESSION_STABILIZATION_LOOKBACK_MINS: i64 = 60;

fn sync_regression_metrics_for_today(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let cnt: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_regression WHERE date(regression_detected_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let avg: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(time_since_stabilization_minutes), 0) FROM workflow_incident_regression WHERE date(regression_detected_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let stab: i64 = conn
        .query_row(
            "SELECT COALESCE(stabilizations_detected, 0) FROM workflow_incident_stabilization_metrics WHERE metric_date = date('now')",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let freq = (cnt as f64) / (stab.max(1) as f64);
    conn.execute(
        "INSERT INTO workflow_incident_regression_metrics (metric_date, regressions_detected, avg_regression_time_minutes, regression_frequency, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(metric_date) DO UPDATE SET
           regressions_detected = excluded.regressions_detected,
           avg_regression_time_minutes = excluded.avg_regression_time_minutes,
           regression_frequency = excluded.regression_frequency,
           updated_at = excluded.updated_at",
        params![&d, cnt, avg, freq, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_regression_risk_score_row(conn: &Connection) -> Result<(), String> {
    let ts = now_ts();
    let reg_total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_regression",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let stab_succ: i64 = conn
        .query_row(
            "SELECT COALESCE(successful_stabilizations, 0) FROM workflow_system_stability_score WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1);
    let denom = stab_succ.max(1);
    let risk = (reg_total as f64) / (denom as f64);
    conn.execute(
        "UPDATE workflow_regression_risk_score SET regression_risk = ?1, regressions_detected = ?2, stabilizations_detected = ?3, updated_at = ?4 WHERE id = 1",
        params![risk, reg_total, stab_succ, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn sync_structured_regression_metrics_for_today(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let cnt: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_regression
             WHERE date(regression_detected_at) = date('now')
               AND json_extract(details_json, '$.triggerSource') = 'structured_log'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let avg: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(time_since_stabilization_minutes), 0) FROM workflow_incident_regression
             WHERE date(regression_detected_at) = date('now')
               AND json_extract(details_json, '$.triggerSource') = 'structured_log'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let total_today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_regression WHERE date(regression_detected_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1)
        .max(1);
    let ratio = (cnt as f64) / (total_today as f64);
    conn.execute(
        "INSERT INTO workflow_structured_regression_metrics (metric_date, structured_regressions_detected, avg_structured_regression_time, structured_regression_ratio, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(metric_date) DO UPDATE SET
           structured_regressions_detected = excluded.structured_regressions_detected,
           avg_structured_regression_time = excluded.avg_structured_regression_time,
           structured_regression_ratio = excluded.structured_regression_ratio,
           updated_at = excluded.updated_at",
        params![&d, cnt, avg, ratio, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn create_incident_from_structured_failure(
    conn: &Connection,
    module: &str,
    event_type: &str,
    entity_id: Option<&str>,
    structured_event_id: &str,
    event_timestamp: &str,
    normalized_severity: &str,
    details: &Value,
    correlation_key: &str,
) -> Result<String, String> {
    let incident_id = Uuid::new_v4().to_string();
    let correlation_id = Uuid::new_v4().to_string();
    let sev = if normalized_severity.trim().to_uppercase() == "FATAL" {
        "FATAL"
    } else {
        "CRITICAL"
    };
    let msg = format!(
        "Structured failure: {} / {}",
        module.trim(),
        event_type.trim()
    );
    let ctx = json!({
        "message": msg,
        "entityId": entity_id,
        "structuredEventId": structured_event_id,
        "fromStructuredLog": true,
        "structuredDetails": details,
        "correlationKey": correlation_key,
    });
    conn.execute(
        "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
         VALUES (?1, ?2, ?3, 'OPEN', ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, NULL, NULL)",
        params![
            &incident_id,
            event_timestamp,
            sev,
            &ctx.to_string(),
            module.trim(),
            structured_event_id,
            event_type.trim(),
            &correlation_id,
            correlation_key.trim(),
            event_timestamp,
        ],
    )
    .map_err(|e| e.to_string())?;
    append_history(
        conn,
        &incident_id,
        "CREATED",
        Some("Incident opened from structured failure (regression path)"),
        &json!({
            "structuredEventId": structured_event_id,
            "correlationId": &correlation_id,
            "correlationKey": correlation_key,
        }),
    )?;
    let _ = bump_metrics_new_incident(conn, sev);
    let _ = bump_correlation_incident_created(conn);
    Ok(incident_id)
}

fn commit_regression_record(
    conn: &Connection,
    incident_id: &str,
    stab_id: &str,
    stab_conf_ts: &str,
    prev_iid: &str,
    stab_corr_id: &str,
    curr_sm: &str,
    curr_et: &str,
    curr_key: &str,
    trigger_source: &str,
    confidence: f64,
    alert_id: Option<&str>,
    structured_event_id: Option<&str>,
) -> Result<(), String> {
    let dup: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE incident_id = ?1 AND event_type = 'REGRESSION_DETECTED'
               AND COALESCE(json_extract(details_json, '$.stabilizationId'), '') = ?2",
            params![incident_id, stab_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if dup > 0 {
        return Ok(());
    }
    let mins_since: i64 = conn
        .query_row(
            "SELECT CAST((julianday('now') - julianday(?1)) * 24.0 * 60.0 AS INTEGER)",
            params![stab_conf_ts],
            |r| r.get(0),
        )
        .unwrap_or(0)
        .max(0);
    let prev_corr: String = conn
        .query_row(
            "SELECT correlation_id FROM workflow_incidents WHERE incident_id = ?1",
            params![prev_iid],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let reg_id = Uuid::new_v4().to_string();
    let ts = now_ts();
    let mut details = json!({
        "triggerSource": trigger_source,
        "stabilizationId": stab_id,
        "previousIncidentId": prev_iid,
        "previousCorrelationId": &prev_corr,
        "stabilizationCorrelationId": stab_corr_id,
        "timeSinceStabilizationMinutes": mins_since,
        "confidenceScore": confidence,
        "correlationKey": curr_key.trim(),
        "sourceModule": curr_sm.trim(),
        "eventType": curr_et.trim(),
    });
    if let Some(a) = alert_id {
        if let Some(o) = details.as_object_mut() {
            o.insert("alertId".into(), json!(a));
        }
    }
    if let Some(s) = structured_event_id {
        if let Some(o) = details.as_object_mut() {
            o.insert("structuredEventId".into(), json!(s));
        }
    }
    conn.execute(
        "INSERT INTO workflow_incident_regression (regression_id, correlation_id, incident_id, source_module, event_type, regression_detected_at, time_since_stabilization_minutes, severity, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'CRITICAL', ?8)",
        params![
            &reg_id,
            stab_corr_id,
            incident_id,
            curr_sm.trim(),
            curr_et.trim(),
            &ts,
            mins_since,
            &details.to_string(),
        ],
    )
    .map_err(|e| e.to_string())?;
    let mut hist = json!({
        "triggerSource": trigger_source,
        "severity": "CRITICAL",
        "timeSinceStabilization": mins_since,
        "previousIncidentId": prev_iid,
        "regressionId": &reg_id,
        "confidenceScore": confidence,
        "correlationId": stab_corr_id,
        "stabilizationId": stab_id,
    });
    if let Some(a) = alert_id {
        if let Some(o) = hist.as_object_mut() {
            o.insert("alertId".into(), json!(a));
        }
    }
    if let Some(s) = structured_event_id {
        if let Some(o) = hist.as_object_mut() {
            o.insert("structuredEventId".into(), json!(s));
        }
    }
    append_history(
        conn,
        incident_id,
        "REGRESSION_DETECTED",
        Some(
            "Post-stabilization regression: same correlation pattern failed again after a resolved incident was stabilized",
        ),
        &hist,
    )?;
    let prior_scope: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_regression
             WHERE trim(source_module) = trim(?1) AND trim(event_type) = trim(?2)
               AND regression_id != ?3
               AND datetime(regression_detected_at) > datetime('now', '-30 days')",
            params![curr_sm.trim(), curr_et.trim(), &reg_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if prior_scope >= 1 {
        conn.execute(
            "UPDATE workflow_incidents SET severity = 'FATAL' WHERE incident_id = ?1",
            params![incident_id],
        )
        .map_err(|e| e.to_string())?;
    }
    let _ = sync_regression_metrics_for_today(conn);
    let _ = refresh_regression_risk_score_row(conn);
    if trigger_source == "structured_log" {
        let _ = sync_structured_regression_metrics_for_today(conn);
    }
    Ok(())
}

/// After a CRITICAL/FATAL alert is promoted: detect failure recurrence shortly after stabilization on a **resolved** incident with the same correlation key.
pub fn maybe_record_regression_after_alert_promotion(
    conn: &Connection,
    incident_id: &str,
    alert_id: &str,
    _source_module: &str,
    signal_type: &str,
    _entity_id: Option<&str>,
) -> Result<(), String> {
    let (curr_key, curr_sm, curr_et): (String, String, String) = conn
        .query_row(
            "SELECT correlation_key, source_module, trigger_event_type FROM workflow_incidents WHERE incident_id = ?1",
            params![incident_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    if curr_key.trim().is_empty() {
        return Ok(());
    }
    let window = format!("-{REGRESSION_STABILIZATION_LOOKBACK_MINS} minutes");
    let stab: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT s.stabilization_id, s.stabilization_confirmed, s.incident_id, s.correlation_id
             FROM workflow_incident_stabilization s
             JOIN workflow_incidents prev ON prev.incident_id = s.incident_id
             JOIN workflow_incidents curr ON curr.incident_id = ?1
             WHERE trim(curr.source_module) = trim(s.source_module)
               AND trim(curr.trigger_event_type) = trim(s.event_type)
               AND s.stabilization_confirmed IS NOT NULL
               AND datetime(s.stabilization_confirmed) >= datetime('now', ?2)
               AND trim(upper(prev.status)) = 'RESOLVED'
               AND trim(prev.correlation_key) = trim(curr.correlation_key)
               AND prev.incident_id != curr.incident_id",
            params![incident_id, &window],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((stab_id, stab_conf_ts, prev_iid, stab_corr_id)) = stab else {
        return Ok(());
    };
    let baseline = compute_baseline_failure_rate(conn, curr_sm.trim(), curr_et.trim())
        .unwrap_or_else(|_| 0.15);
    let recent_failures: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = ?1 AND upper(trim(severity)) IN ('CRITICAL','FATAL')
               AND datetime(created_at) > datetime('now', '-60 minutes')",
            params![signal_type.trim()],
            |r| r.get(0),
        )
        .unwrap_or(1)
        .max(1);
    let confidence = (recent_failures as f64 / baseline.max(0.02)).min(0.99);
    commit_regression_record(
        conn,
        incident_id,
        &stab_id,
        &stab_conf_ts,
        &prev_iid,
        &stab_corr_id,
        curr_sm.trim(),
        curr_et.trim(),
        curr_key.trim(),
        "alert",
        confidence,
        Some(alert_id),
        None,
    )?;
    Ok(())
}

/// Structured failure (ERROR/CRITICAL/FATAL) after recent stabilization on a resolved incident with the same correlation key — no alert required.
pub fn maybe_record_regression_from_structured_event(
    conn: &Connection,
    module: &str,
    event_type: &str,
    entity_id: Option<&str>,
    structured_event_id: &str,
    event_timestamp: &str,
    normalized_severity: &str,
    details: &Value,
) -> Result<(), String> {
    let corr_key = compute_incident_correlation_key(
        module.trim(),
        event_type.trim(),
        entity_id,
        event_timestamp,
    );
    if corr_key.trim().is_empty() {
        return Ok(());
    }
    let window = format!("-{REGRESSION_STABILIZATION_LOOKBACK_MINS} minutes");
    let stab: Option<(String, String, String, String)> = conn
        .query_row(
            "SELECT s.stabilization_id, s.stabilization_confirmed, s.incident_id, s.correlation_id
             FROM workflow_incident_stabilization s
             JOIN workflow_incidents prev ON prev.incident_id = s.incident_id
             WHERE trim(s.source_module) = trim(?1)
               AND trim(s.event_type) = trim(?2)
               AND s.stabilization_confirmed IS NOT NULL
               AND datetime(s.stabilization_confirmed) >= datetime('now', ?3)
               AND trim(upper(prev.status)) = 'RESOLVED'
               AND trim(prev.correlation_key) = trim(?4)",
            params![
                module.trim(),
                event_type.trim(),
                &window,
                corr_key.trim(),
            ],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((stab_id, stab_conf_ts, prev_iid, stab_corr_id)) = stab else {
        return Ok(());
    };
    let incident_id = if let Some(iid) = find_any_open_incident_by_correlation_key(conn, &corr_key)? {
        iid
    } else {
        create_incident_from_structured_failure(
            conn,
            module.trim(),
            event_type.trim(),
            entity_id,
            structured_event_id,
            event_timestamp,
            normalized_severity,
            details,
            corr_key.trim(),
        )?
    };
    if incident_id == prev_iid {
        return Ok(());
    }
    let baseline = compute_baseline_failure_rate(conn, module.trim(), event_type.trim())
        .unwrap_or_else(|_| 0.15);
    let recent_struct: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) > datetime('now', '-60 minutes')",
            params![module.trim(), event_type.trim()],
            |r| r.get(0),
        )
        .unwrap_or(1)
        .max(1);
    let confidence = (recent_struct as f64 / baseline.max(0.02)).min(0.99);
    commit_regression_record(
        conn,
        &incident_id,
        &stab_id,
        &stab_conf_ts,
        &prev_iid,
        &stab_corr_id,
        module.trim(),
        event_type.trim(),
        corr_key.trim(),
        "structured_log",
        confidence,
        None,
        Some(structured_event_id),
    )?;
    Ok(())
}

// --- Persistent failure (V40): stabilization existed, but failure pressure stays above baseline ---

const PERSISTENCE_WINDOW_MINS: i64 = 20;

fn count_scope_failures_in_window(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
    window_mins: i64,
) -> Result<i64, String> {
    let w = format!("-{window_mins} minutes");
    let a: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = ?1 AND upper(trim(severity)) IN ('CRITICAL','FATAL')
               AND datetime(created_at) > datetime('now', ?2)",
            params![event_type.trim(), &w],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let s: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) > datetime('now', ?3)",
            params![source_module.trim(), event_type.trim(), &w],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(a + s)
}

fn stabilization_exists_for_scope(conn: &Connection, sm: &str, et: &str) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_stabilization
             WHERE trim(source_module) = trim(?1) AND trim(event_type) = trim(?2)
               AND stabilization_confirmed IS NOT NULL
               AND datetime(stabilization_confirmed) > datetime('now', '-168 hours')",
            params![sm, et],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n > 0)
}

fn find_open_incident_for_scope(
    conn: &Connection,
    sm: &str,
    et: &str,
) -> Result<Option<String>, String> {
    let row: Option<String> = conn
        .query_row(
            "SELECT incident_id FROM workflow_incidents
             WHERE status = 'OPEN'
               AND trim(source_module) = trim(?1)
               AND trim(trigger_event_type) = trim(?2)
             ORDER BY datetime(created_at) DESC
             LIMIT 1",
            params![sm, et],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row)
}

fn sync_persistent_failure_metrics_for_today(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let cnt: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_persistence WHERE date(persistence_detected_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let avg_dur: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(CAST(json_extract(details_json, '$.persistenceWindowMinutes') AS REAL)), ?1)
             FROM workflow_incident_persistence WHERE date(persistence_detected_at) = date('now')",
            params![PERSISTENCE_WINDOW_MINS as f64],
            |r| r.get(0),
        )
        .unwrap_or(PERSISTENCE_WINDOW_MINS as f64);
    let open: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE status = 'OPEN'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1)
        .max(1);
    let freq = (cnt as f64) / (open as f64);
    conn.execute(
        "INSERT INTO workflow_persistent_failure_metrics (metric_date, persistent_failures_detected, avg_persistence_duration, persistence_frequency, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(metric_date) DO UPDATE SET
           persistent_failures_detected = excluded.persistent_failures_detected,
           avg_persistence_duration = excluded.avg_persistence_duration,
           persistence_frequency = excluded.persistence_frequency,
           updated_at = excluded.updated_at",
        params![&d, cnt, avg_dur, freq, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_persistence_risk_score_row(conn: &Connection) -> Result<(), String> {
    let ts = now_ts();
    let ptot: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_persistence",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let tot: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1);
    let risk = (ptot as f64) / (tot.max(1) as f64);
    conn.execute(
        "UPDATE workflow_persistence_risk_score SET persistence_risk = ?1, persistent_failures_detected = ?2, total_incidents = ?3, updated_at = ?4 WHERE id = 1",
        params![risk, ptot, tot, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Elevated failure rate in the persistence window while stabilization exists but failures never fully stop.
pub fn detect_persistent_failure_rate(conn: &Connection) -> Result<i64, String> {
    use std::collections::HashSet;
    let w = PERSISTENCE_WINDOW_MINS;
    let mut pairs: HashSet<(String, String)> = HashSet::new();
    let mut s1 = conn
        .prepare(
            "SELECT DISTINCT trim(source_module) AS sm, trim(event_type) AS et
             FROM workflow_incident_stabilization
             WHERE stabilization_confirmed IS NOT NULL
               AND datetime(stabilization_confirmed) > datetime('now', '-7 days')",
        )
        .map_err(|e| e.to_string())?;
    for row in s1
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
    {
        let (sm, et) = row.map_err(|e| e.to_string())?;
        if !sm.is_empty() && !et.is_empty() {
            pairs.insert((sm, et));
        }
    }
    let mut s2 = conn
        .prepare(
            "SELECT DISTINCT trim(source_module), trim(trigger_event_type)
             FROM workflow_incidents WHERE status = 'OPEN'",
        )
        .map_err(|e| e.to_string())?;
    for row in s2
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
    {
        let (sm, et) = row.map_err(|e| e.to_string())?;
        if !sm.is_empty() && !et.is_empty() {
            pairs.insert((sm, et));
        }
    }
    let mut detected = 0i64;
    for (sm, et) in pairs {
        if !stabilization_exists_for_scope(conn, &sm, &et)? {
            continue;
        }
        let cnt = count_scope_failures_in_window(conn, &sm, &et, w)?;
        if cnt == 0 {
            continue;
        }
        let baseline = compute_baseline_failure_rate(conn, &sm, &et).unwrap_or_else(|_| 0.05);
        let expected_per_min = (baseline / 10.0_f64).max(0.001);
        let failure_rate = (cnt as f64) / (w as f64);
        if failure_rate <= expected_per_min {
            continue;
        }
        let expected_in_window = expected_per_min * (w as f64);
        let persistence_threshold = ((expected_in_window * 1.25).ceil() as i64).max(3);
        if cnt < persistence_threshold {
            continue;
        }
        let quiet = quiet_minutes_scope_since_last_bad(conn, &sm, &et)?;
        if quiet > w as f64 {
            continue;
        }
        let Some(iid) = find_open_incident_for_scope(conn, &sm, &et)? else {
            continue;
        };
        let dup_hist: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_incident_history
                 WHERE incident_id = ?1 AND event_type = 'PERSISTENT_FAILURE_DETECTED'
                   AND datetime(event_timestamp) > datetime('now', '-35 minutes')",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if dup_hist > 0 {
            continue;
        }
        let prior_persist: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_incident_persistence
                 WHERE incident_id = ?1
                   AND datetime(persistence_detected_at) > datetime('now', '-48 hours')",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let confidence = (failure_rate / expected_per_min).min(0.99);
        let corr_id: String = conn
            .query_row(
                "SELECT correlation_id FROM workflow_incidents WHERE incident_id = ?1",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or_default();
        let ck: String = conn
            .query_row(
                "SELECT correlation_key FROM workflow_incidents WHERE incident_id = ?1",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or_default();
        let pid = Uuid::new_v4().to_string();
        let ts = now_ts();
        let details = json!({
            "confidenceScore": confidence,
            "failureCountWindow": cnt,
            "persistenceWindowMinutes": w,
            "expectedRate": expected_per_min,
            "failureRate": failure_rate,
            "correlationKey": ck,
            "sourceModule": sm.trim(),
            "eventType": et.trim(),
        });
        conn.execute(
            "INSERT INTO workflow_incident_persistence (persistence_id, correlation_id, incident_id, source_module, event_type, persistence_detected_at, failure_rate, expected_rate, severity, details_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'CRITICAL', ?9)",
            params![
                &pid,
                &corr_id,
                &iid,
                sm.trim(),
                et.trim(),
                &ts,
                failure_rate,
                expected_per_min,
                &details.to_string(),
            ],
        )
        .map_err(|e| e.to_string())?;
        append_history(
            conn,
            &iid,
            "PERSISTENT_FAILURE_DETECTED",
            Some("Failure pressure remains above baseline after stabilization (sustained window)"),
            &json!({
                "failureRate": failure_rate,
                "expectedRate": expected_per_min,
                "confidenceScore": confidence,
                "persistenceId": &pid,
                "windowMinutes": w,
            }),
        )?;
        if prior_persist >= 1 {
            conn.execute(
                "UPDATE workflow_incidents SET severity = 'FATAL' WHERE incident_id = ?1",
                params![&iid],
            )
            .map_err(|e| e.to_string())?;
        }
        let _ = sync_persistent_failure_metrics_for_today(conn);
        let _ = refresh_persistence_risk_score_row(conn);
        detected += 1;
    }
    Ok(detected)
}

// --- Failure forecasting (V41): trend + regression + persistence weights ---

const FORECAST_HORIZON_MINS: i64 = 30;
const FORECAST_DEDUPE_MINS: i64 = 25;
const FORECAST_ESCALATION_COOLDOWN_MINS: i64 = 40;
/// Caps effectiveness evaluation so corrupt horizon values cannot scan unbounded history.
const FORECAST_EFFECTIVENESS_MAX_HORIZON_MINS: i64 = 7 * 24 * 60;

fn is_job_monitor_background_job(sm: &str, et: &str) -> bool {
    sm.trim() == "job_monitor" && et.trim() == "BACKGROUND_JOB_FAILURE"
}

/// Last `last_mins` minutes: (now - last_mins, now].
fn count_failure_like_recent(
    conn: &Connection,
    sm: &str,
    et: &str,
    last_mins: i64,
) -> Result<i64, String> {
    let w = format!("-{last_mins} minutes");
    if is_job_monitor_background_job(sm, et) {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log
                 WHERE status IN ('FAILED','TIMEOUT')
                   AND datetime(started_at) > datetime('now', ?1)",
                params![&w],
                |r| r.get(0),
            )
            .unwrap_or(0);
        return Ok(n);
    }
    count_scope_failures_in_window(conn, sm, et, last_mins)
}

/// Count failures in (now - `older_mins`, now - `newer_mins`]; require older_mins > newer_mins ≥ 0.
fn count_failure_like_bounded(
    conn: &Connection,
    sm: &str,
    et: &str,
    older_mins: i64,
    newer_mins: i64,
) -> Result<i64, String> {
    let o = format!("-{older_mins} minutes");
    let n = format!("-{newer_mins} minutes");
    if is_job_monitor_background_job(sm, et) {
        let x: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log
                 WHERE status IN ('FAILED','TIMEOUT')
                   AND datetime(started_at) > datetime('now', ?1)
                   AND datetime(started_at) <= datetime('now', ?2)",
                params![&o, &n],
                |r| r.get(0),
            )
            .unwrap_or(0);
        return Ok(x);
    }
    let a: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = ?1 AND upper(trim(severity)) IN ('CRITICAL','FATAL')
               AND datetime(created_at) > datetime('now', ?2)
               AND datetime(created_at) <= datetime('now', ?3)",
            params![et.trim(), &o, &n],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let s: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) > datetime('now', ?3)
               AND datetime(timestamp) <= datetime('now', ?4)",
            params![sm.trim(), et.trim(), &o, &n],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(a + s)
}

#[derive(Debug, Clone)]
pub struct FailureTrend {
    pub short_term_slope: f64,
    pub medium_term_slope: f64,
    pub long_term_slope: f64,
    pub slope_weight: f64,
}

fn norm_weight_from_ratio(r: f64) -> f64 {
    let t = (r / (1.0 + r.abs())).tanh();
    (0.5 + 0.5 * t).clamp(0.0, 1.0)
}

/// Uses 60m / 24h / 7d windows to derive short-, medium-, and long-term trend slopes.
pub fn compute_failure_trend(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
) -> Result<FailureTrend, String> {
    let baseline = compute_baseline_failure_rate(conn, source_module, event_type).unwrap_or(0.05);
    let exp_per_10m = baseline.max(0.0001);
    let exp_30m = (exp_per_10m * 3.0).max(0.15);

    let c_last30 = count_failure_like_recent(conn, source_module, event_type, 30)?;
    let c_prev30 = count_failure_like_bounded(conn, source_module, event_type, 60, 30)?;
    let short_raw = (c_last30 - c_prev30) as f64;
    let short_term_slope = short_raw / exp_30m;
    let short_w = norm_weight_from_ratio(short_term_slope);

    let c_last24h = count_failure_like_recent(conn, source_module, event_type, 24 * 60)?;
    let c_prev24 = count_failure_like_bounded(conn, source_module, event_type, 48 * 60, 24 * 60)?;
    let med_slope = ((c_last24h as f64 / 24.0) - (c_prev24 as f64 / 24.0)) / (exp_per_10m * 6.0).max(0.01);
    let medium_term_slope = med_slope;
    let med_w = norm_weight_from_ratio(med_slope);

    let c7d = count_failure_like_recent(conn, source_module, event_type, 7 * 24 * 60)?;
    let daily_avg = (c7d as f64) / 7.0;
    let long_term_slope = ((c_last24h as f64) - daily_avg) / ((daily_avg + 1.0).max(1.0));
    let long_w = norm_weight_from_ratio(long_term_slope);

    let slope_weight = (0.45 * short_w + 0.35 * med_w + 0.2 * long_w).clamp(0.0, 1.0);
    Ok(FailureTrend {
        short_term_slope,
        medium_term_slope,
        long_term_slope,
        slope_weight,
    })
}

fn count_regressions_scope_recent(conn: &Connection, sm: &str, et: &str, hours: i64) -> Result<i64, String> {
    let w = format!("-{hours} hours");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_regression
             WHERE trim(source_module) = trim(?1) AND trim(event_type) = trim(?2)
               AND datetime(regression_detected_at) > datetime('now', ?3)",
            params![sm, et, &w],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n)
}

fn count_persistence_scope_recent(conn: &Connection, sm: &str, et: &str, hours: i64) -> Result<i64, String> {
    let w = format!("-{hours} hours");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_persistence
             WHERE trim(source_module) = trim(?1) AND trim(event_type) = trim(?2)
               AND datetime(persistence_detected_at) > datetime('now', ?3)",
            params![sm, et, &w],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n)
}

fn forecast_confidence_breakdown(baseline: f64, c60: i64, c24: i64, c7d: i64) -> (f64, i64, i64) {
    let exp_per_10m = baseline.max(0.0001);
    let max_expected =
        ((exp_per_10m * 6.0) + (exp_per_10m * 144.0) + (exp_per_10m * 1008.0)).ceil() as i64;
    let max_expected_points = max_expected.max(24).min(50_000);
    let data_points_used = c60.saturating_add(c24).saturating_add(c7d);
    let confidence =
        ((data_points_used as f64) / (max_expected_points as f64)).clamp(0.01, 0.99);
    (confidence, data_points_used, max_expected_points)
}

fn dominant_forecast_factor(slope_w: f64, reg_w: f64, per_w: f64) -> &'static str {
    if slope_w >= reg_w && slope_w >= per_w {
        "slope_weight"
    } else if reg_w >= per_w {
        "regression_weight"
    } else {
        "persistence_weight"
    }
}

fn build_forecast_trend_summary(
    c_last30: i64,
    c_prev30: i64,
    reg_n: i64,
    per_n: i64,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    if c_prev30 > 0 {
        let ratio = (c_last30 as f64) / (c_prev30 as f64);
        if ratio >= 1.1 && c_last30 >= c_prev30 {
            parts.push(format!(
                "Failures increasing {:.1}× in last 30 minutes.",
                ratio
            ));
        } else if c_last30 > c_prev30 {
            parts.push("Failures trending up in the last 30 minutes.".to_string());
        }
    } else if c_last30 > 0 {
        parts.push(format!(
            "Elevated failures in the last 30 minutes ({} events).",
            c_last30
        ));
    }
    if reg_n > 0 {
        parts.push(format!(
            "{} regression{} observed in last 7 days.",
            reg_n,
            if reg_n == 1 { "" } else { "s" }
        ));
    }
    if per_n > 0 {
        parts.push(format!(
            "Persistent failure windows detected {} time{}.",
            per_n,
            if per_n == 1 { "" } else { "s" }
        ));
    }
    if parts.is_empty() {
        "Elevated composite failure risk vs baseline.".to_string()
    } else {
        parts.join(" ")
    }
}

fn forecast_action_priority(prob: f64) -> &'static str {
    let p = if prob.is_nan() { 0.0 } else { prob };
    if p >= 0.9 {
        "CRITICAL"
    } else if p >= 0.8 {
        "HIGH"
    } else if p >= 0.6 {
        "MEDIUM"
    } else {
        "LOW"
    }
}

#[cfg(debug_assertions)]
fn debug_assert_valid_forecast_action_priority(p: &str) {
    debug_assert!(
        matches!(p, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"),
        "invalid forecast action_priority: {p}"
    );
}

#[cfg(not(debug_assertions))]
fn debug_assert_valid_forecast_action_priority(_p: &str) {}

fn normalize_stored_action_priority(raw: &str) -> String {
    match raw.trim().to_uppercase().as_str() {
        "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" => raw.trim().to_uppercase(),
        _ => "MEDIUM".to_string(),
    }
}

fn parse_recommended_actions_column(rec_s: &str) -> Value {
    match serde_json::from_str::<Value>(rec_s) {
        Ok(Value::Array(items)) => {
            let mut lines: Vec<String> = Vec::new();
            let mut seen = std::collections::HashSet::<String>::new();
            for it in items {
                let s = match it {
                    Value::String(s) => s,
                    Value::Number(n) => n.to_string(),
                    Value::Bool(b) => {
                        if b {
                            "true".to_string()
                        } else {
                            "false".to_string()
                        }
                    }
                    _ => continue,
                };
                let t = s.trim().to_string();
                if !t.is_empty() && seen.insert(t.clone()) {
                    lines.push(t);
                }
            }
            if lines.is_empty() {
                json!(["Review recent system logs for anomalies"])
            } else {
                json!(lines)
            }
        }
        _ => json!(["Review recent system logs for anomalies"]),
    }
}

/// Maps primary trigger and secondary signals to operator-facing preventive steps (does not affect probability).
fn generate_recommended_actions(
    primary_trigger: &str,
    secondary: &Value,
    source_module: &str,
    _event_type: &str,
) -> Vec<String> {
    let mut actions: Vec<String> = Vec::new();
    match primary_trigger.trim() {
        "slope_weight" => {
            actions.push("Check job queue backlog".into());
            actions.push("Review recent deployment changes".into());
        }
        "regression_weight" => {
            actions.push("Inspect previous incident root cause".into());
            actions.push("Validate configuration rollback".into());
        }
        "persistence_weight" => {
            actions.push("Restart affected services".into());
            actions.push("Inspect database locks".into());
        }
        _ => {
            actions.push("Investigate system logs and verify service health".into());
        }
    }
    let reg = secondary
        .get("recent_regressions")
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .unwrap_or(0);
    if reg > 2 {
        actions.push("Review last 3 deployments".into());
    }
    let pers = secondary
        .get("recent_persistence")
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .unwrap_or(0);
    if pers > 1 {
        actions.push("Schedule stability review for persistence hot spots".into());
    }
    let sm = source_module.to_lowercase();
    if sm.contains("job") {
        actions.push("Check job queue latency".into());
    }
    if sm.contains("deployment") {
        actions.push("Review recent deployment logs".into());
    }
    if primary_trigger.trim() == "persistence_weight" || pers > 0 {
        actions.push("Verify database locks".into());
    }
    let mut seen = std::collections::HashSet::<String>::new();
    let mut deduped: Vec<String> = Vec::new();
    for a in actions {
        if seen.insert(a.clone()) {
            deduped.push(a);
        }
    }
    if deduped.is_empty() {
        deduped.push("Review recent system logs for anomalies".into());
    }
    deduped
}

fn forecast_explanation_bullets(
    primary: &str,
    reg_n: i64,
    per_n: i64,
    short_term_slope: f64,
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if short_term_slope > 0.01 || primary == "slope_weight" {
        out.push("Rising failure trend".to_string());
    }
    if reg_n > 0 {
        out.push("Recent regressions detected".to_string());
    }
    if per_n > 0 {
        out.push("Persistence windows active".to_string());
    }
    if out.is_empty() {
        out.push(match primary {
            "regression_weight" => "Regression pattern dominates this forecast.".to_string(),
            "persistence_weight" => "Persistence pattern dominates this forecast.".to_string(),
            _ => "Elevated short-term failure activity vs baseline.".to_string(),
        });
    }
    out
}

fn forecast_probability(slope_weight: f64, regression_weight: f64, persistence_weight: f64) -> f64 {
    let p = 0.4 * slope_weight + 0.3 * regression_weight + 0.3 * persistence_weight;
    p.clamp(0.0, 0.99)
}

fn recent_forecast_escalation(
    conn: &Connection,
    sm: &str,
    event_kind: &str,
    cooldown_mins: i64,
) -> Result<bool, String> {
    let w = format!("-{cooldown_mins} minutes");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_structured_event_log
             WHERE trim(module) = trim(?1) AND trim(event_type) = trim(?2)
               AND upper(trim(severity)) = 'WARNING'
               AND datetime(timestamp) > datetime('now', ?3)",
            params![sm, event_kind, &w],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(n > 0)
}

fn insert_forecast_escalation_event(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
    details: &Value,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_structured_event_log (id, timestamp, module, event_type, entity_id, severity, details_json)
         VALUES (?1, ?2, ?3, ?4, NULL, 'WARNING', ?5)",
        params![
            &id,
            &ts,
            source_module.trim(),
            event_type.trim(),
            &details.to_string()
        ],
    )
    .map_err(|e| e.to_string())?;
    let line = json!({
        "timestamp": &ts,
        "module": source_module.trim(),
        "event_type": event_type.trim(),
        "severity": "WARNING",
        "details": details,
    });
    log::info!(target: "structured", "{}", line);
    Ok(())
}

fn try_emit_forecast_risk_escalation(
    conn: &Connection,
    sm: &str,
    et: &str,
    prob: f64,
    forecast_id: &str,
) -> Result<(), String> {
    if prob >= 0.9 {
        if !recent_forecast_escalation(
            conn,
            sm,
            "CRITICAL_RISK_WARNING",
            FORECAST_ESCALATION_COOLDOWN_MINS,
        )? {
            let d = json!({
                "kind": "CRITICAL_RISK_WARNING",
                "sourceModule": sm.trim(),
                "scopedEventType": et.trim(),
                "predictedFailureProbability": prob,
                "forecastId": forecast_id,
            });
            insert_forecast_escalation_event(conn, sm, "CRITICAL_RISK_WARNING", &d)?;
        }
    } else if prob >= 0.8 {
        if !recent_forecast_escalation(
            conn,
            sm,
            "HIGH_RISK_WARNING",
            FORECAST_ESCALATION_COOLDOWN_MINS,
        )? {
            let d = json!({
                "kind": "HIGH_RISK_WARNING",
                "sourceModule": sm.trim(),
                "scopedEventType": et.trim(),
                "predictedFailureProbability": prob,
                "forecastId": forecast_id,
            });
            insert_forecast_escalation_event(conn, sm, "HIGH_RISK_WARNING", &d)?;
        }
    }
    Ok(())
}

fn refresh_forecast_risk_score_row(conn: &Connection) -> Result<(), String> {
    let ts = now_ts();
    let tot: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let hi: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast WHERE predicted_failure_probability >= 0.8",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let score = (hi as f64) / (tot.max(1) as f64);
    conn.execute(
        "UPDATE workflow_forecast_risk_score SET forecast_risk_score = ?1, high_risk_forecasts = ?2, total_forecasts = ?3, updated_at = ?4 WHERE id = 1",
        params![score, hi, tot, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn count_actual_failures_horizon(
    conn: &Connection,
    sm: &str,
    et: &str,
    start_ts: &str,
    end_ts: &str,
) -> Result<i64, String> {
    if is_job_monitor_background_job(sm, et) {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log
                 WHERE status IN ('FAILED','TIMEOUT')
                   AND datetime(started_at) >= datetime(?1)
                   AND datetime(started_at) <= datetime(?2)",
                params![start_ts, end_ts],
                |r| r.get(0),
            )
            .unwrap_or(0);
        return Ok(n);
    }
    let a: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_alert_signal_log
             WHERE signal_type = ?1 AND upper(trim(severity)) IN ('CRITICAL','FATAL')
               AND datetime(created_at) >= datetime(?2)
               AND datetime(created_at) <= datetime(?3)",
            params![et.trim(), start_ts, end_ts],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let s: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) >= datetime(?3)
               AND datetime(timestamp) <= datetime(?4)",
            params![sm.trim(), et.trim(), start_ts, end_ts],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(a + s)
}

/// Compares yesterday's forecasts to failures observed inside each horizon.
fn validate_forecast_accuracy(conn: &Connection) -> Result<(f64, f64), String> {
    let y = (chrono::Utc::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let mut stmt = conn
        .prepare(
            "SELECT source_module, event_type, forecast_time, predicted_failure_probability,
                    forecast_horizon_minutes
             FROM workflow_failure_forecast WHERE date(forecast_time) = date(?1)",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, f64, i64)> = stmt
        .query_map(params![&y], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut total = 0i64;
    let mut hits = 0i64;
    let mut fp = 0i64;
    for (sm, et, fts, prob, horiz) in rows {
        if prob < 0.6 {
            continue;
        }
        let start = chrono::NaiveDateTime::parse_from_str(&fts, "%Y-%m-%d %H:%M:%S")
            .map_err(|e| e.to_string())?;
        let hz_eff = horiz.max(1).min(FORECAST_EFFECTIVENESS_MAX_HORIZON_MINS);
        let end = start + chrono::Duration::minutes(hz_eff);
        let end_s = end.format("%Y-%m-%d %H:%M:%S").to_string();
        let actual = count_actual_failures_horizon(conn, &sm, &et, &fts, &end_s)?;
        total += 1;
        if actual > 0 {
            hits += 1;
        } else {
            fp += 1;
        }
    }
    let accuracy = if total > 0 {
        (hits as f64) / (total as f64)
    } else {
        0.0
    };
    let fp_rate = if total > 0 {
        (fp as f64) / (total as f64)
    } else {
        0.0
    };
    Ok((accuracy, fp_rate))
}

fn sync_forecast_metrics_for_today(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let gen: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast WHERE date(forecast_time) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let (acc, fp_rate) = validate_forecast_accuracy(conn)?;
    conn.execute(
        "INSERT INTO workflow_failure_forecast_metrics (metric_date, forecasts_generated, forecast_accuracy, forecast_false_positive_rate, prediction_accuracy_score, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(metric_date) DO UPDATE SET
           forecasts_generated = excluded.forecasts_generated,
           forecast_accuracy = excluded.forecast_accuracy,
           forecast_false_positive_rate = excluded.forecast_false_positive_rate,
           prediction_accuracy_score = excluded.prediction_accuracy_score,
           updated_at = excluded.updated_at",
        params![&d, gen, acc, fp_rate, acc, &ts],
    )
    .map_err(|e| e.to_string())?;
    let _ = sync_forecast_explanation_metrics_for_today(conn)?;
    let _ = evaluate_expired_forecast_effectiveness(conn)?;
    let _ = sync_forecast_action_metrics_for_today(conn)?;
    Ok(())
}

fn sync_forecast_explanation_metrics_for_today(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO workflow_forecast_explanation_metrics (metric_date, explanations_generated, accurate_explanations, misleading_explanations, updated_at)
         VALUES (?1, 0, 0, 0, ?2)",
        params![&d, &ts],
    );
    let gen: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast WHERE date(forecast_time) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let acc_fb: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_feedback
             WHERE feedback_kind = 'accurate' AND date(created_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mis_fb: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_feedback
             WHERE feedback_kind = 'misleading' AND date(created_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO workflow_forecast_explanation_metrics (metric_date, explanations_generated, accurate_explanations, misleading_explanations, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(metric_date) DO UPDATE SET
           explanations_generated = excluded.explanations_generated,
           accurate_explanations = excluded.accurate_explanations,
           misleading_explanations = excluded.misleading_explanations,
           updated_at = excluded.updated_at",
        params![&d, gen, acc_fb, mis_fb, &ts],
    )
    .map_err(|e| e.to_string())?;
    let _ = refresh_forecast_explanation_score_row(conn)?;
    Ok(())
}

fn refresh_forecast_explanation_score_row(conn: &Connection) -> Result<(), String> {
    let ts = now_ts();
    let acc: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_feedback WHERE feedback_kind = 'accurate'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let tot: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_feedback",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let score = (acc as f64) / (tot.max(1) as f64);
    conn.execute(
        "UPDATE workflow_forecast_explanation_score SET explanation_accuracy_score = ?1, accurate_explanations = ?2, total_explanations = ?3, updated_at = ?4 WHERE id = 1",
        params![score, acc, tot, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn collect_forecast_scope_pairs(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    use std::collections::HashSet;
    let mut pairs: HashSet<(String, String)> = HashSet::new();
    pairs.insert(("job_monitor".to_string(), "BACKGROUND_JOB_FAILURE".to_string()));
    let mut s1 = conn
        .prepare(
            "SELECT DISTINCT trim(module), trim(event_type) FROM workflow_structured_event_log
             WHERE datetime(timestamp) > datetime('now', '-7 days')
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
             LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    for row in s1
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
    {
        let (m, e) = row.map_err(|e| e.to_string())?;
        if !m.is_empty() && !e.is_empty() {
            pairs.insert((m, e));
        }
    }
    let mut s2 = conn
        .prepare(
            "SELECT DISTINCT trim(source_module), trim(trigger_event_type)
             FROM workflow_incidents WHERE status = 'OPEN' LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    for row in s2
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
    {
        let (m, e) = row.map_err(|e| e.to_string())?;
        if !m.is_empty() && !e.is_empty() {
            pairs.insert((m, e));
        }
    }
    Ok(pairs.into_iter().collect())
}

/// Inserts failure forecasts when blended probability ≥ 0.6; returns rows inserted.
pub fn detect_failure_forecasts(conn: &Connection) -> Result<i64, String> {
    let pairs = collect_forecast_scope_pairs(conn)?;
    let mut inserted = 0i64;
    let dedupe = format!("-{FORECAST_DEDUPE_MINS} minutes");
    for (sm, et) in pairs {
        let trend = compute_failure_trend(conn, &sm, &et)?;
        let reg_n = count_regressions_scope_recent(conn, &sm, &et, 7 * 24)?;
        let per_n = count_persistence_scope_recent(conn, &sm, &et, 7 * 24)?;
        let regression_weight = ((reg_n as f64) / 5.0_f64).min(1.0);
        let persistence_weight = ((per_n as f64) / 4.0_f64).min(1.0);
        let prob = forecast_probability(trend.slope_weight, regression_weight, persistence_weight);
        if prob.is_nan() || !prob.is_finite() {
            log::warn!(
                target: "workflow_forecast",
                "skipping forecast insert: non-finite probability sm={} et={}",
                sm.trim(),
                et.trim()
            );
            continue;
        }
        let prob_store = prob.clamp(0.0, 0.99);
        let baseline = compute_baseline_failure_rate(conn, &sm, &et).unwrap_or(0.05);
        let c60 = count_failure_like_recent(conn, &sm, &et, 60)?;
        let c24 = count_failure_like_recent(conn, &sm, &et, 24 * 60)?;
        let c7d = count_failure_like_recent(conn, &sm, &et, 7 * 24 * 60)?;
        let dup: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_failure_forecast
                 WHERE trim(source_module) = trim(?1) AND trim(event_type) = trim(?2)
                   AND datetime(forecast_time) > datetime('now', ?3)",
                params![sm.trim(), et.trim(), &dedupe],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if dup > 0 {
            continue;
        }
        if prob_store < 0.6 {
            continue;
        }
        let fts = now_ts();
        let near_dup: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_failure_forecast
                 WHERE trim(source_module) = trim(?1) AND trim(event_type) = trim(?2)
                   AND ABS(
                     CAST(strftime('%s', forecast_time) AS INTEGER)
                     - CAST(strftime('%s', ?3) AS INTEGER)
                   ) < 600",
                params![sm.trim(), et.trim(), &fts],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if near_dup > 0 {
            continue;
        }
        let fid = Uuid::new_v4().to_string();
        let primary_trigger = dominant_forecast_factor(
            trend.slope_weight,
            regression_weight,
            persistence_weight,
        );
        let c_last30 = count_failure_like_recent(conn, &sm, &et, 30)?;
        let c_prev30 = count_failure_like_bounded(conn, &sm, &et, 60, 30)?;
        let trend_summary = build_forecast_trend_summary(c_last30, c_prev30, reg_n, per_n);
        let secondary_core = json!({
            "recent_regressions": reg_n,
            "recent_persistence": per_n,
            "short_term_slope": trend.short_term_slope,
            "medium_term_slope": trend.medium_term_slope,
            "long_term_slope": trend.long_term_slope,
        });
        let actions_list = generate_recommended_actions(
            primary_trigger,
            &secondary_core,
            sm.trim(),
            et.trim(),
        );
        let actions_arr = json!(actions_list);
        let recommended_actions_json = serde_json::to_string(&actions_arr).map_err(|e| e.to_string())?;
        let _: Vec<String> = serde_json::from_str(&recommended_actions_json)
            .map_err(|e| format!("recommended_actions_json invalid: {e}"))?;
        let action_priority = forecast_action_priority(prob_store);
        debug_assert_valid_forecast_action_priority(action_priority);
        let bullets = forecast_explanation_bullets(
            primary_trigger,
            reg_n,
            per_n,
            trend.short_term_slope,
        );
        let secondary_triggers = json!({
            "recent_regressions": reg_n,
            "recent_persistence": per_n,
            "short_term_slope": trend.short_term_slope,
            "medium_term_slope": trend.medium_term_slope,
            "long_term_slope": trend.long_term_slope,
            "bullets": bullets,
        });
        let (confidence_raw, data_points_used, _) =
            forecast_confidence_breakdown(baseline, c60, c24, c7d);
        let confidence = if confidence_raw.is_nan() || !confidence_raw.is_finite() {
            0.5_f64
        } else {
            confidence_raw.clamp(0.01, 0.99)
        };
        let details = json!({
            "shortTermSlope": trend.short_term_slope,
            "mediumTermSlope": trend.medium_term_slope,
            "longTermSlope": trend.long_term_slope,
            "slopeWeight": trend.slope_weight,
            "regressionWeight": regression_weight,
            "persistenceWeight": persistence_weight,
            "recentRegressionCount7d": reg_n,
            "recentPersistenceCount7d": per_n,
            "baselineRatePer10m": baseline,
            "failureCounts": { "last60m": c60, "last24h": c24, "last7d": c7d },
            "dataPointsUsed": data_points_used,
            "primaryTrigger": primary_trigger,
            "actionPriority": action_priority,
        });
        conn.execute(
            "INSERT INTO workflow_failure_forecast (forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes, details_json, primary_trigger, secondary_triggers_json, trend_summary, recommended_actions_json, action_priority)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                &fid,
                sm.trim(),
                et.trim(),
                &fts,
                prob_store,
                confidence,
                FORECAST_HORIZON_MINS,
                &details.to_string(),
                primary_trigger,
                &secondary_triggers.to_string(),
                &trend_summary,
                &recommended_actions_json,
                action_priority,
            ],
        )
        .map_err(|e| e.to_string())?;
        if let Some(iid) = find_open_incident_for_scope(conn, sm.trim(), et.trim())? {
            let _ = append_history(
                conn,
                &iid,
                "FORECAST_GENERATED",
                Some("Failure forecast issued for this scope"),
                &json!({
                    "forecastId": &fid,
                    "probability": prob_store,
                    "primaryTrigger": primary_trigger,
                    "confidence": confidence,
                }),
            )?;
        }
        let _ = try_emit_forecast_risk_escalation(conn, &sm, &et, prob_store, &fid);
        inserted += 1;
    }
    if inserted > 0 {
        let _ = refresh_forecast_risk_score_row(conn);
    }
    Ok(inserted)
}

fn evaluate_expired_forecast_effectiveness(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT forecast_id, source_module, event_type, forecast_time, forecast_horizon_minutes, predicted_failure_probability
             FROM workflow_failure_forecast
             WHERE predicted_failure_probability >= 0.59
               AND action_effectiveness_score IS NULL
               AND datetime(forecast_time) > datetime('now', '-21 days')",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, String, i64, f64)> = stmt
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
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().naive_utc();
    for (fid, sm, et, fts, hz, prob) in rows {
        let Ok(ft) = chrono::NaiveDateTime::parse_from_str(&fts, "%Y-%m-%d %H:%M:%S") else {
            continue;
        };
        let hz_eff = hz.max(1).min(FORECAST_EFFECTIVENESS_MAX_HORIZON_MINS);
        let end = ft + chrono::Duration::minutes(hz_eff);
        if now <= end {
            continue;
        }
        let end_s = end.format("%Y-%m-%d %H:%M:%S").to_string();
        let actual = count_actual_failures_horizon(conn, &sm, &et, &fts, &end_s)?;
        let ack_in_window: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_forecast_action_log
                 WHERE forecast_id = ?1
                   AND datetime(acknowledged_at) >= datetime(?2)
                   AND datetime(acknowledged_at) <= datetime(?3)",
                params![&fid, &fts, &end_s],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let (score, log_preventive): (f64, bool) = if ack_in_window > 0 {
            if actual == 0 {
                (1.0, true)
            } else {
                (0.0, false)
            }
        } else if actual > 0 {
            (0.0, false)
        } else {
            conn.execute(
                "UPDATE workflow_failure_forecast SET action_effectiveness_score = -1.0 WHERE forecast_id = ?1",
                params![&fid],
            )
            .map_err(|e| e.to_string())?;
            continue;
        };
        conn.execute(
            "UPDATE workflow_failure_forecast SET action_effectiveness_score = ?1 WHERE forecast_id = ?2",
            params![score, &fid],
        )
        .map_err(|e| e.to_string())?;
        if log_preventive {
            if let Some(iid) = find_open_incident_for_scope(conn, sm.trim(), et.trim())? {
                let dup: i64 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM workflow_incident_history
                         WHERE incident_id = ?1 AND event_type = 'PREVENTIVE_SUCCESS'
                           AND COALESCE(json_extract(details_json, '$.forecastId'),'') = ?2",
                        params![&iid, &fid],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                if dup == 0 {
                    let _ = append_history(
                        conn,
                        &iid,
                        "PREVENTIVE_SUCCESS",
                        Some(
                            "Operator acknowledged preventive actions; no failures occurred in forecast horizon",
                        ),
                        &json!({
                            "forecastId": &fid,
                            "probability": prob,
                            "actionEffectivenessScore": score,
                            "failuresObservedInHorizon": actual,
                            "acknowledgedWithinHorizon": true,
                            "horizonEnd": &end_s,
                        }),
                    );
                }
            }
        }
    }
    let _ = refresh_preventive_reliability_score_row(conn)?;
    Ok(())
}

fn sync_forecast_action_metrics_for_today(conn: &Connection) -> Result<(), String> {
    let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let ts = now_ts();
    let gen: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast
             WHERE date(forecast_time) = date('now')
               AND COALESCE(trim(recommended_actions_json),'') NOT IN ('','[]')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let ack: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_action_log WHERE date(acknowledged_at) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let eff: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incident_history
             WHERE event_type = 'PREVENTIVE_SUCCESS' AND date(event_timestamp) = date('now')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO workflow_forecast_action_metrics (metric_date, actions_generated, actions_acknowledged, actions_effective, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(metric_date) DO UPDATE SET
           actions_generated = excluded.actions_generated,
           actions_acknowledged = excluded.actions_acknowledged,
           actions_effective = excluded.actions_effective,
           updated_at = excluded.updated_at",
        params![&d, gen, ack, eff, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_preventive_reliability_score_row(conn: &Connection) -> Result<(), String> {
    let ts = now_ts();
    let tot: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast
             WHERE action_effectiveness_score IS NOT NULL AND action_effectiveness_score >= 0.0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let prev: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast
             WHERE action_effectiveness_score IS NOT NULL
               AND action_effectiveness_score >= 0.0
               AND action_effectiveness_score >= 0.99",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let score = (prev as f64) / (tot.max(1) as f64);
    conn.execute(
        "UPDATE workflow_preventive_reliability_score SET preventive_reliability_score = ?1, prevented_failures = ?2, total_forecasts = ?3, updated_at = ?4 WHERE id = 1",
        params![score, prev, tot, &ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn acknowledge_forecast_preventive_actions(
    conn: &Connection,
    forecast_id: &str,
    action_taken: &str,
    caller_role: &str,
) -> Result<(), String> {
    require_view(caller_role)?;
    let fid = forecast_id.trim();
    if fid.is_empty() {
        return Err("forecast_id required".into());
    }
    let body = action_taken.trim();
    if body.is_empty() {
        return Err("action_taken required".into());
    }
    let chk: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast WHERE forecast_id = ?1",
            params![fid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if chk == 0 {
        return Err("forecast not found".into());
    }
    let dup: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_action_log WHERE forecast_id = ?1",
            params![fid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if dup > 0 {
        log::debug!(target: "workflow_forecast", "duplicate acknowledge ignored forecast_id={}", fid);
        return Ok(());
    }
    let log_id = Uuid::new_v4().to_string();
    let ts = now_ts();
    conn.execute(
        "INSERT INTO workflow_forecast_action_log (log_id, forecast_id, action_taken, acknowledged_at, caller_role)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![&log_id, fid, body, &ts, caller_role.trim()],
    )
    .map_err(|e| e.to_string())?;
    let (row_sm, row_et, row_pri): (String, String, String) = conn
        .query_row(
            "SELECT source_module, event_type, COALESCE(action_priority,'MEDIUM') FROM workflow_failure_forecast WHERE forecast_id = ?1",
            params![fid],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;
    let pri_norm = normalize_stored_action_priority(&row_pri);
    debug_assert_valid_forecast_action_priority(&pri_norm);
    if let Some(iid) = find_open_incident_for_scope(conn, row_sm.trim(), row_et.trim())? {
        let _ = append_history(
            conn,
            &iid,
            "ACKNOWLEDGE_ACTION",
            Some("Operator acknowledged recommended preventive actions"),
            &json!({
                "forecastId": fid,
                "acknowledged": true,
                "priority": &pri_norm,
                "actionTaken": body,
            }),
        );
    }
    let _ = sync_forecast_action_metrics_for_today(conn)?;
    Ok(())
}

fn pick_active_failure_forecast_banner(conn: &Connection) -> Result<Option<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes,
                    COALESCE(primary_trigger,''), COALESCE(secondary_triggers_json,'{}'), COALESCE(trend_summary,''), COALESCE(details_json,'{}'),
                    COALESCE(recommended_actions_json,'[]'), COALESCE(action_priority,'MEDIUM')
             FROM workflow_failure_forecast
             WHERE predicted_failure_probability >= 0.6
             ORDER BY predicted_failure_probability DESC, datetime(forecast_time) DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let row = stmt.query_row([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, f64>(4)?,
            r.get::<_, f64>(5)?,
            r.get::<_, i64>(6)?,
            r.get::<_, String>(7)?,
            r.get::<_, String>(8)?,
            r.get::<_, String>(9)?,
            r.get::<_, String>(10)?,
            r.get::<_, String>(11)?,
            r.get::<_, String>(12)?,
        ))
    });
    let (fid, sm, et, fts, prob, conf, hz, pri, sec_s, trend_s, det_s, rec_s, ap) = match row {
        Ok(t) => t,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let now = chrono::Utc::now().naive_utc();
    let Ok(ft) = chrono::NaiveDateTime::parse_from_str(&fts, "%Y-%m-%d %H:%M:%S") else {
        return Ok(None);
    };
    let end = ft + chrono::Duration::minutes(hz.max(1));
    if now < ft || now > end {
        return Ok(None);
    }
    let secondary: Value = serde_json::from_str(&sec_s).unwrap_or_else(|_| json!({}));
    let details: Value = serde_json::from_str(&det_s).unwrap_or_else(|_| json!({}));
    let data_points_used = details
        .get("dataPointsUsed")
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
        .unwrap_or(0);
    let bullets = secondary
        .get("bullets")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let recommended = parse_recommended_actions_column(&rec_s);
    let ap_norm = normalize_stored_action_priority(&ap);
    debug_assert_valid_forecast_action_priority(&ap_norm);
    Ok(Some(json!({
        "forecastId": fid,
        "sourceModule": sm,
        "eventType": et,
        "forecastTime": fts,
        "predictedFailureProbability": prob,
        "confidenceScore": conf,
        "forecastHorizonMinutes": hz,
        "title": "Failure Risk Predicted",
        "primaryTrigger": pri,
        "trendSummary": trend_s,
        "secondaryTriggers": secondary,
        "dataPointsUsed": data_points_used,
        "explanationBullets": bullets,
        "recommendedActions": recommended,
        "actionPriority": ap_norm,
    })))
}

/// Recovery for **deployment** OPEN incidents only (`source_module = deployment`, alert entity = rule).
pub fn record_deployment_recovery_healing(
    conn: &Connection,
    rule_id: &str,
    details: &Value,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT i.incident_id FROM workflow_incidents i
             JOIN workflow_alert_signal_log a ON a.id = i.linked_alert_id
             WHERE i.status = 'OPEN'
               AND lower(trim(i.source_module)) = 'deployment'
               AND IFNULL(a.entity_id,'') = ?1",
        )
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt
        .query_map(params![rule_id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let auto_rc = "Automatic recovery completed successfully after scheduled or operator recovery; workload cleared without manual root-cause entry beyond this system note.";
    for iid in ids {
        append_history(
            conn,
            &iid,
            "SYSTEM_RECOVERY",
            Some("Deployment recovery succeeded for linked rule"),
            details,
        )?;
        let _ = append_incident_resolution_note(
            conn,
            &iid,
            "System recovery cleared the failure condition for this deployment incident; operator post-mortem still recommended if severity was FATAL.",
        );
        let _ = resolve_incident(conn, &iid, auto_rc, true);
    }
    Ok(())
}

// --- Systemic failure burst intelligence (V34 workflow_failure_burst_log) ---

const SYSTEMIC_BURST_WINDOW_MINS: i64 = 10;
const SYSTEMIC_BURST_COOLDOWN_MINS: i64 = 10;
const SYSTEMIC_BURST_GROWTH_FACTOR: f64 = 1.25;

/// Average failure-like events per 10-minute slot over the trailing 24 hours.
pub fn compute_baseline_failure_rate(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
) -> Result<f64, String> {
    if source_module == "job_monitor" && event_type == "BACKGROUND_JOB_FAILURE" {
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_job_execution_log
                 WHERE status IN ('FAILED','TIMEOUT')
                   AND datetime(started_at) > datetime('now', '-1 day')",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        return Ok((total as f64) / 144.0);
    }
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) > datetime('now', '-1 day')",
            params![source_module, event_type],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok((total as f64) / 144.0)
}

fn sample_failure_details_json(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
) -> Result<String, String> {
    let w = format!("-{SYSTEMIC_BURST_WINDOW_MINS} minutes");
    if source_module == "job_monitor" && event_type == "BACKGROUND_JOB_FAILURE" {
        let s: Option<String> = conn
            .query_row(
                "SELECT COALESCE(error_message,'') FROM workflow_job_execution_log
                 WHERE status IN ('FAILED','TIMEOUT')
                   AND datetime(started_at) > datetime('now', ?1)
                 ORDER BY datetime(started_at) DESC LIMIT 1",
                params![&w],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        return Ok(s.unwrap_or_default());
    }
    let s: Option<String> = conn
        .query_row(
            "SELECT details_json FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) > datetime('now', ?3)
             ORDER BY datetime(timestamp) DESC LIMIT 1",
            params![source_module, event_type, &w],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(s.unwrap_or_default())
}

#[derive(Debug, Clone)]
struct RootCauseRefinement {
    hint: String,
    classification: String,
    confidence_score: f64,
}

fn derive_root_cause_hint(
    source_module: &str,
    event_type: &str,
    details_sample: &str,
) -> RootCauseRefinement {
    let et = event_type.to_lowercase();
    let blob = format!("{source_module} {event_type} {details_sample}").to_lowercase();
    if et.contains("database_lock")
        || blob.contains("database_lock")
        || blob.contains("lock")
        || blob.contains("sqlite")
        || blob.contains("deadlock")
    {
        return RootCauseRefinement {
            hint: "Database contention likely — review long transactions, locks, and pool saturation"
                .into(),
            classification: "database_lock".into(),
            confidence_score: 0.86,
        };
    }
    if et.contains("timeout")
        || blob.contains("timeout")
        || blob.contains("timed out")
        || blob.contains("etimedout")
    {
        return RootCauseRefinement {
            hint: "Network latency or slow dependencies likely — review SLAs, timeouts, and circuit breakers"
                .into(),
            classification: "timeout".into(),
            confidence_score: 0.8,
        };
    }
    if et.contains("retry_limit")
        || et.contains("retry")
        || blob.contains("retry_limit")
        || blob.contains("429")
        || blob.contains("rate limit")
        || blob.contains("503")
    {
        return RootCauseRefinement {
            hint: "API failure or rate limiting likely — check provider health, quotas, and backoff policy"
                .into(),
            classification: "retry_limit".into(),
            confidence_score: 0.78,
        };
    }
    if et.contains("connection_error")
        || blob.contains("connection_error")
        || blob.contains("econnrefused")
        || blob.contains("connection refused")
        || blob.contains("broken pipe")
        || blob.contains("enotfound")
    {
        return RootCauseRefinement {
            hint: "Infrastructure outage likely — verify connectivity, DNS, TLS, and upstream availability"
                .into(),
            classification: "connection_error".into(),
            confidence_score: 0.84,
        };
    }
    RootCauseRefinement {
        hint: "Systemic spike across the window — cross-check dependent services and platform health"
            .into(),
        classification: "unknown".into(),
        confidence_score: 0.62,
    }
}

fn counts_job_failures_window(conn: &Connection) -> Result<(i64, String, String), String> {
    let w = format!("-{SYSTEMIC_BURST_WINDOW_MINS} minutes");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT')
               AND datetime(started_at) > datetime('now', ?1)",
            params![&w],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let bounds: Option<(String, String)> = conn
        .query_row(
            "SELECT MIN(started_at), MAX(started_at) FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT')
               AND datetime(started_at) > datetime('now', ?1)",
            params![&w],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let ts = now_ts();
    let (tmin, tmax) = bounds.unwrap_or((ts.clone(), ts));
    Ok((n, tmin, tmax))
}

fn counts_structured_failures_window(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
) -> Result<(i64, String, String), String> {
    let w = format!("-{SYSTEMIC_BURST_WINDOW_MINS} minutes");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) > datetime('now', ?3)",
            params![source_module, event_type, &w],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let bounds: Option<(String, String)> = conn
        .query_row(
            "SELECT MIN(timestamp), MAX(timestamp) FROM workflow_structured_event_log
             WHERE module = ?1 AND event_type = ?2
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
               AND datetime(timestamp) > datetime('now', ?3)",
            params![source_module, event_type, &w],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let ts = now_ts();
    let (tmin, tmax) = bounds.unwrap_or((ts.clone(), ts));
    Ok((n, tmin, tmax))
}

fn cooling_allows_burst(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
    new_count: i64,
) -> Result<bool, String> {
    let last: Option<(String, i64)> = conn
        .query_row(
            "SELECT burst_start_time, event_count FROM workflow_failure_burst_log
             WHERE source_module = ?1 AND event_type = ?2
             ORDER BY datetime(burst_start_time) DESC LIMIT 1",
            params![source_module, event_type],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((last_start, prev)) = last else {
        return Ok(true);
    };
    let cooldown_secs = (SYSTEMIC_BURST_COOLDOWN_MINS as f64) * 60.0;
    let window_expired: i64 = conn
        .query_row(
            "SELECT CASE WHEN (julianday('now') - julianday(?1)) * 86400.0 >= ?2 THEN 1 ELSE 0 END",
            params![&last_start, cooldown_secs],
            |r| r.get(0),
        )
        .unwrap_or(1);
    if window_expired > 0 {
        return Ok(true);
    }
    Ok((new_count as f64) >= (prev as f64) * SYSTEMIC_BURST_GROWTH_FACTOR)
}

/// When thresholds and cooling pass: log burst, emit `BURST_DETECTED` (CRITICAL), promote incident.
pub fn detect_failure_burst(
    conn: &Connection,
    source_module: &str,
    event_type: &str,
    event_count: i64,
    baseline_rate: f64,
    burst_start_time: &str,
    burst_end_time: &str,
    current_rate: f64,
) -> Result<Option<String>, String> {
    if event_count < 5 {
        return Ok(None);
    }
    let baseline_eff = baseline_rate.max(1.0 / 144.0);
    if (event_count as f64) < 2.0 * baseline_eff {
        return Ok(None);
    }
    if !cooling_allows_burst(conn, source_module, event_type, event_count)? {
        return Ok(None);
    }
    let sample = sample_failure_details_json(conn, source_module, event_type)?;
    let refined = derive_root_cause_hint(source_module, event_type, &sample);
    let burst_sev = "CRITICAL";
    let burst_id = Uuid::new_v4().to_string();
    let ts = now_ts();
    let dur_sec: f64 = conn
        .query_row(
            "SELECT COALESCE((julianday(?1) - julianday(?2)) * 86400.0, 0)",
            params![burst_end_time, burst_start_time],
            |r| r.get::<_, f64>(0),
        )
        .unwrap_or(0.0)
        .max(0.0);
    let growth = (current_rate / baseline_eff).min(100.0);
    let details = json!({
        "burstId": &burst_id,
        "sourceModule": source_module,
        "eventType": event_type,
        "eventCount": event_count,
        "baselineRatePer10m": baseline_rate,
        "currentRatePer10m": current_rate,
        "burstStartTime": burst_start_time,
        "burstEndTime": burst_end_time,
        "rootCauseHint": &refined.hint,
        "rootCauseClassification": &refined.classification,
        "confidenceScore": refined.confidence_score,
        "burstDurationSeconds": dur_sec,
        "burstPeakRate": current_rate,
        "burstGrowthFactor": growth,
        "systemic": true,
    });
    let details_s = details.to_string();
    conn.execute(
        "INSERT INTO workflow_failure_burst_log (burst_id, source_module, event_type, burst_start_time, burst_end_time, event_count, baseline_rate, current_rate, severity, root_cause_hint, details_json, confidence_score)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![
            &burst_id,
            source_module,
            event_type,
            burst_start_time,
            burst_end_time,
            event_count,
            baseline_rate,
            current_rate,
            burst_sev,
            &refined.hint,
            &details_s,
            refined.confidence_score,
        ],
    )
    .map_err(|e| e.to_string())?;
    let stable_burst_entity = format!("sys:{source_module}:{event_type}");
    let msg = format!(
        "Systemic failure burst: {event_count} events in {SYSTEMIC_BURST_WINDOW_MINS}m (baseline {:4}/10m) — {source_module} / {event_type}",
        baseline_rate
    );
    let aid = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
         VALUES (?1, ?2, 'BURST_DETECTED', 'CRITICAL', ?3, ?4, ?5)",
        params![
            &aid,
            &ts,
            &stable_burst_entity,
            &msg,
            &details_s,
        ],
    )
    .map_err(|e| e.to_string())?;
    let iid_opt = maybe_promote_alert_to_incident(
        conn,
        &aid,
        "BURST_DETECTED",
        "CRITICAL",
        Some(stable_burst_entity.as_str()),
        &msg,
        &details,
        source_module,
    )?;
    let mut corr_for_suppression = String::new();
    if let Some(ref iid) = iid_opt {
        let corr_id: String = conn
            .query_row(
                "SELECT correlation_id FROM workflow_incidents WHERE incident_id = ?1",
                params![iid],
                |r| r.get(0),
            )
            .unwrap_or_default();
        corr_for_suppression = corr_id.clone();
        let ck = compute_incident_correlation_key(
            source_module,
            "BURST_DETECTED",
            Some(stable_burst_entity.as_str()),
            &ts,
        );
        append_history(
            conn,
            iid,
            "BURST_DETECTED",
            Some("Systemic failure burst linked to incident"),
            &json!({
                "alertReference": aid,
                "burstId": &burst_id,
                "correlationId": corr_id,
                "correlationKey": ck,
                "rootCauseHint": &refined.hint,
                "rootCauseClassification": &refined.classification,
                "confidenceScore": refined.confidence_score,
            }),
        )?;
    }
    if corr_for_suppression.is_empty() {
        corr_for_suppression = Uuid::new_v4().to_string();
    }
    let _ = create_burst_driven_suppression(
        conn,
        &corr_for_suppression,
        iid_opt.as_deref(),
        source_module,
        event_type,
        &burst_id,
    );
    let _ = bump_correlation_systemic_bursts_detected(conn);
    log::info!(
        target: "structured",
        "{}",
        json!({
            "module": "workflow_failure_burst",
            "event_type": "systemic_burst_detected",
            "entity_id": &burst_id,
            "severity": "CRITICAL",
            "details": &details,
        })
    );
    Ok(Some(burst_id))
}

/// Scans job failures and structured failure events for systemic bursts.
pub fn scan_systemic_failure_bursts(conn: &Connection) -> Result<i64, String> {
    let mut out = 0i64;
    let (jc, jmin, jmax) = counts_job_failures_window(conn)?;
    if jc >= 5 {
        let baseline = compute_baseline_failure_rate(conn, "job_monitor", "BACKGROUND_JOB_FAILURE")?;
        if let Some(_) = detect_failure_burst(
            conn,
            "job_monitor",
            "BACKGROUND_JOB_FAILURE",
            jc,
            baseline,
            &jmin,
            &jmax,
            jc as f64,
        )? {
            out += 1;
        }
    }
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT module, event_type FROM workflow_structured_event_log
             WHERE datetime(timestamp) > datetime('now', '-4 hours')
               AND upper(trim(severity)) IN ('ERROR','CRITICAL','FATAL')
             LIMIT 120",
        )
        .map_err(|e| e.to_string())?;
    let pairs: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (m, et) in pairs {
        if m == "job_monitor" && et == "BACKGROUND_JOB_FAILURE" {
            continue;
        }
        let (c, tmin, tmax) = counts_structured_failures_window(conn, &m, &et)?;
        if c < 5 {
            continue;
        }
        let baseline = compute_baseline_failure_rate(conn, &m, &et)?;
        if let Some(_) = detect_failure_burst(conn, &m, &et, c, baseline, &tmin, &tmax, c as f64)? {
            out += 1;
        }
    }
    Ok(out)
}

pub fn get_operations_center_dashboard(conn: &Connection) -> Result<Value, String> {
    let t0 = Instant::now();
    let out = get_operations_center_dashboard_inner(conn);
    let ms = t0.elapsed().as_millis().min(i64::MAX as u128) as i64;
    let ok = out.is_ok();
    let err_s = out.as_ref().err().map(String::as_str).unwrap_or("");
    let _ = record_performance_timing(
        conn,
        "dashboard_render",
        None,
        ms,
        &json!({ "ok": ok, "error": err_s }),
    );
    out
}

fn get_operations_center_dashboard_inner(conn: &Connection) -> Result<Value, String> {
    let open: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE status = 'OPEN'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let open_fatal: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE status = 'OPEN' AND severity = 'FATAL'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let open_crit: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE status = 'OPEN' AND severity = 'CRITICAL'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
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
    let rec_denom = (rec_ok + rec_fail).max(1);
    let recovery_success_rate = rec_ok as f64 / rec_denom as f64;
    let rel: Option<f64> = conn
        .query_row(
            "SELECT score FROM system_reliability_score WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .ok();
    let health = if open_fatal > 0 || open_crit > 2 {
        "red"
    } else if open_crit > 0 || open > 3 {
        "amber"
    } else {
        "green"
    };

    refresh_suppression_state(conn)?;
    let _ = detect_stabilization_phase(conn);
    let _ = detect_persistent_failure_rate(conn);
    let _ = detect_failure_forecasts(conn);
    let _ = sync_forecast_metrics_for_today(conn);
    let failure_forecast_banner = pick_active_failure_forecast_banner(conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT incident_id, created_at, severity, status, source_module,
                    substr(COALESCE(json_extract(error_context_json, '$.message'), ''), 1, 200),
                    linked_alert_id
             FROM workflow_incidents WHERE status = 'OPEN' ORDER BY datetime(created_at) DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let active_rows: Vec<(String, String, String, String, String, String, String)> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut active: Vec<Value> = Vec::with_capacity(active_rows.len());
    for row in active_rows {
        let iid = row.0.clone();
        let mut base = json!({
            "incidentId": row.0,
            "createdAt": row.1,
            "severity": row.2,
            "status": row.3,
            "sourceModule": row.4,
            "summaryPreview": row.5,
            "linkedAlertId": row.6,
        });
        let stats = correlation_stats_json(conn, &iid)?;
        if let Some(obj) = base.as_object_mut() {
            if let Some(s) = stats.as_object() {
                for (k, v) in s {
                    obj.insert(k.clone(), v.clone());
                }
            }
            let rec_n: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM workflow_incident_history
                     WHERE incident_id = ?1
                       AND event_type = 'STABILIZATION_RESOLUTION_RECOMMENDED'
                       AND datetime(event_timestamp) > datetime('now', '-14 days')",
                    params![&iid],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            obj.insert(
                "resolutionRecommended".into(),
                json!(rec_n > 0),
            );
        }
        active.push(base);
    }

    let mut stmt2 = conn
        .prepare(
            "SELECT incident_id, created_at, resolved_at, severity, source_module,
                    COALESCE(root_cause_summary,''), linked_alert_id
             FROM workflow_incidents WHERE status = 'RESOLVED' ORDER BY datetime(resolved_at) DESC LIMIT 25",
        )
        .map_err(|e| e.to_string())?;
    let postmortem: Vec<Value> = stmt2
        .query_map([], |r| {
            Ok(json!({
                "incidentId": r.get::<_, String>(0)?,
                "createdAt": r.get::<_, String>(1)?,
                "resolvedAt": r.get::<_, Option<String>>(2)?,
                "severity": r.get::<_, String>(3)?,
                "sourceModule": r.get::<_, String>(4)?,
                "rootCauseSummary": r.get::<_, String>(5)?,
                "linkedAlertId": r.get::<_, String>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, incidents_created_today, incidents_resolved_today, avg_resolution_time, critical_incident_count
             FROM workflow_incident_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "incidentsCreatedToday": r.get::<_, i64>(1)?,
                    "incidentsResolvedToday": r.get::<_, i64>(2)?,
                    "avgResolutionTime": r.get::<_, f64>(3)?,
                    "criticalIncidentCount": r.get::<_, i64>(4)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let correlation_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, alerts_grouped, incidents_created, noise_reduction_ratio, burst_signals_emitted, bursts_detected
             FROM workflow_incident_correlation_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "alertsGrouped": r.get::<_, i64>(1)?,
                    "incidentsCreated": r.get::<_, i64>(2)?,
                    "noiseReductionRatio": r.get::<_, f64>(3)?,
                    "burstSignalsEmitted": r.get::<_, i64>(4)?,
                    "burstsDetected": r.get::<_, i64>(5)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let incident_noise_score_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, noise_score, total_alerts, alerts_grouped
             FROM workflow_incident_noise_score WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "noiseScore": r.get::<_, f64>(1)?,
                    "totalAlerts": r.get::<_, i64>(2)?,
                    "alertsGrouped": r.get::<_, i64>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut stmt3 = conn
        .prepare(
            "SELECT h.history_id, h.incident_id, h.event_type, h.event_timestamp, COALESCE(h.notes,''),
                    i.severity, COALESCE(i.root_cause_summary,''), i.status
             FROM workflow_incident_history h
             JOIN workflow_incidents i ON i.incident_id = h.incident_id
             WHERE i.status = 'RESOLVED'
                OR (i.status = 'OPEN' AND h.event_type IN (
                     'STABILIZATION_STARTED','STABILIZATION_CONFIRMED','STABILIZATION_RESOLUTION_RECOMMENDED',
                     'SUPPRESSION_STARTED','SUPPRESSION_ENDED','BURST_DETECTED',
                     'REGRESSION_DETECTED','REGRESSION_RESOLVED','PERSISTENT_FAILURE_DETECTED','FORECAST_GENERATED','ACKNOWLEDGE_ACTION','PREVENTIVE_SUCCESS'
                   ))
             ORDER BY datetime(h.event_timestamp) DESC
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let post_mortem_timeline: Vec<Value> = stmt3
        .query_map([], |r| {
            Ok(json!({
                "historyId": r.get::<_, String>(0)?,
                "incidentId": r.get::<_, String>(1)?,
                "eventType": r.get::<_, String>(2)?,
                "eventTimestamp": r.get::<_, String>(3)?,
                "notes": r.get::<_, String>(4)?,
                "severity": r.get::<_, String>(5)?,
                "rootCauseSummary": r.get::<_, String>(6)?,
                "incidentStatus": r.get::<_, String>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt_burst = conn
        .prepare(
            "SELECT burst_id, source_module, event_type, burst_start_time, burst_end_time, event_count,
                    baseline_rate, current_rate, severity, root_cause_hint, confidence_score, details_json,
                    ((julianday(burst_end_time) - julianday(burst_start_time)) * 24.0 * 60.0) AS dur_min
             FROM workflow_failure_burst_log
             WHERE datetime(burst_start_time) > datetime('now', '-24 hours')
             ORDER BY datetime(burst_start_time) DESC
             LIMIT 16",
        )
        .map_err(|e| e.to_string())?;
    let systemic_bursts: Vec<Value> = stmt_burst
        .query_map([], |r| {
            let details_s: String = r.get(11)?;
            let details: Value =
                serde_json::from_str(&details_s).unwrap_or_else(|_| json!({}));
            Ok(json!({
                "burstId": r.get::<_, String>(0)?,
                "sourceModule": r.get::<_, String>(1)?,
                "eventType": r.get::<_, String>(2)?,
                "burstStartTime": r.get::<_, String>(3)?,
                "burstEndTime": r.get::<_, String>(4)?,
                "eventCount": r.get::<_, i64>(5)?,
                "baselineRate": r.get::<_, f64>(6)?,
                "currentRate": r.get::<_, f64>(7)?,
                "severity": r.get::<_, String>(8)?,
                "rootCauseHint": r.get::<_, String>(9)?,
                "confidenceScore": r.get::<_, f64>(10)?,
                "details": details,
                "durationMinutes": r.get::<_, f64>(12)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt_sup = conn
        .prepare(
            "SELECT suppression_id, source_module, event_type, suppression_start, suppression_end,
                    suppressed_event_count, reason, confidence_score,
                    ((julianday(suppression_end) - julianday(suppression_start)) * 24.0 * 60.0) AS window_minutes
             FROM workflow_incident_suppression
             WHERE release_history_logged = 0
               AND datetime(suppression_end) >= datetime('now')
             ORDER BY datetime(suppression_end) DESC
             LIMIT 24",
        )
        .map_err(|e| e.to_string())?;
    let active_suppressions: Vec<Value> = stmt_sup
        .query_map([], |r| {
            Ok(json!({
                "suppressionId": r.get::<_, String>(0)?,
                "sourceModule": r.get::<_, String>(1)?,
                "eventType": r.get::<_, String>(2)?,
                "suppressionStart": r.get::<_, String>(3)?,
                "suppressionEnd": r.get::<_, String>(4)?,
                "windowMinutes": r.get::<_, f64>(8)?,
                "suppressedEventCount": r.get::<_, i64>(5)?,
                "reason": r.get::<_, String>(6)?,
                "confidenceScore": r.get::<_, f64>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let suppression_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, alerts_suppressed, suppression_windows, noise_reduction_gain, confidence_score
             FROM workflow_incident_suppression_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "alertsSuppressed": r.get::<_, i64>(1)?,
                    "suppressionWindows": r.get::<_, i64>(2)?,
                    "noiseReductionGain": r.get::<_, f64>(3)?,
                    "confidenceScore": r.get::<_, f64>(4)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let stabilization_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, stabilizations_detected, avg_stabilization_time, false_recovery_rate, stability_confidence_avg
             FROM workflow_incident_stabilization_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "stabilizationsDetected": r.get::<_, i64>(1)?,
                    "avgStabilizationTime": r.get::<_, f64>(2)?,
                    "falseRecoveryRate": r.get::<_, f64>(3)?,
                    "stabilityConfidenceAvg": r.get::<_, f64>(4)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let system_stability: Option<Value> = conn
        .query_row(
            "SELECT stability_score, successful_stabilizations, total_incidents, updated_at
             FROM workflow_system_stability_score WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "stabilityScore": r.get::<_, f64>(0)?,
                    "successfulStabilizations": r.get::<_, i64>(1)?,
                    "totalIncidents": r.get::<_, i64>(2)?,
                    "updatedAt": r.get::<_, String>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut stmt_stab = conn
        .prepare(
            "SELECT stabilization_id, source_module, event_type, stabilization_start, stabilization_confirmed,
                    confidence_score, stability_duration_minutes
             FROM workflow_incident_stabilization
             WHERE datetime(stabilization_start) > datetime('now', '-72 hours')
             ORDER BY datetime(COALESCE(stabilization_confirmed, stabilization_start)) DESC
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;
    let stab_raw: Vec<(
        String,
        String,
        String,
        String,
        Option<String>,
        f64,
        i64,
    )> = stmt_stab
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut stabilization_signals: Vec<Value> = Vec::new();
    for (sid, sm, et, s_start, s_conf, conf_row, dur_row) in stab_raw {
        let quiet = quiet_minutes_scope_since_last_bad(conn, &sm, &et).unwrap_or(0.0);
        let confirmed = s_conf.is_some();
        let phase = if confirmed {
            "confirmed"
        } else {
            "stabilizing"
        };
        let tone = if confirmed { "green" } else { "amber" };
        stabilization_signals.push(json!({
            "stabilizationId": sid,
            "sourceModule": sm,
            "eventType": et,
            "stabilizationStart": s_start,
            "stabilizationConfirmed": s_conf,
            "quietMinutes": quiet,
            "confidenceScore": if confirmed { conf_row } else { stabilization_confidence(quiet, expected_failure_interval_minutes(conn, &sm, &et)) },
            "stabilityDurationMinutes": dur_row,
            "phase": phase,
            "tone": tone,
        }));
    }

    let regression_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, regressions_detected, avg_regression_time_minutes, regression_frequency
             FROM workflow_incident_regression_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "regressionsDetected": r.get::<_, i64>(1)?,
                    "avgRegressionTimeMinutes": r.get::<_, f64>(2)?,
                    "regressionFrequency": r.get::<_, f64>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let regression_risk: Option<Value> = conn
        .query_row(
            "SELECT regression_risk, regressions_detected, stabilizations_detected, updated_at
             FROM workflow_regression_risk_score WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "regressionRisk": r.get::<_, f64>(0)?,
                    "regressionsDetected": r.get::<_, i64>(1)?,
                    "stabilizationsDetected": r.get::<_, i64>(2)?,
                    "updatedAt": r.get::<_, String>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut stmt_reg = conn
        .prepare(
            "SELECT regression_id, source_module, event_type, regression_detected_at, time_since_stabilization_minutes, details_json
             FROM workflow_incident_regression
             WHERE datetime(regression_detected_at) > datetime('now', '-72 hours')
             ORDER BY datetime(regression_detected_at) DESC
             LIMIT 16",
        )
        .map_err(|e| e.to_string())?;
    let regression_raw: Vec<(String, String, String, String, i64, String)> = stmt_reg
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
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let structured_regression_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, structured_regressions_detected, avg_structured_regression_time, structured_regression_ratio
             FROM workflow_structured_regression_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "structuredRegressionsDetected": r.get::<_, i64>(1)?,
                    "avgStructuredRegressionTime": r.get::<_, f64>(2)?,
                    "structuredRegressionRatio": r.get::<_, f64>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut regression_signals: Vec<Value> = Vec::new();
    for (rid, sm, et, det_at, ts_min, det_s) in regression_raw {
        let det: Value = serde_json::from_str(&det_s).unwrap_or_else(|_| json!({}));
        let conf = det
            .get("confidenceScore")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let trigger_src = det
            .get("triggerSource")
            .and_then(|v| v.as_str())
            .unwrap_or("alert");
        regression_signals.push(json!({
            "regressionId": rid,
            "sourceModule": sm,
            "eventType": et,
            "regressionDetectedAt": det_at,
            "timeSinceStabilizationMinutes": ts_min,
            "confidenceScore": conf,
            "triggerSource": trigger_src,
            "tone": "red",
        }));
    }

    let persistence_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, persistent_failures_detected, avg_persistence_duration, persistence_frequency
             FROM workflow_persistent_failure_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "persistentFailuresDetected": r.get::<_, i64>(1)?,
                    "avgPersistenceDuration": r.get::<_, f64>(2)?,
                    "persistenceFrequency": r.get::<_, f64>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let persistence_risk: Option<Value> = conn
        .query_row(
            "SELECT persistence_risk, persistent_failures_detected, total_incidents, updated_at
             FROM workflow_persistence_risk_score WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "persistenceRisk": r.get::<_, f64>(0)?,
                    "persistentFailuresDetected": r.get::<_, i64>(1)?,
                    "totalIncidents": r.get::<_, i64>(2)?,
                    "updatedAt": r.get::<_, String>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut stmt_pers = conn
        .prepare(
            "SELECT persistence_id, source_module, event_type, persistence_detected_at, failure_rate, expected_rate, details_json
             FROM workflow_incident_persistence
             WHERE datetime(persistence_detected_at) > datetime('now', '-72 hours')
             ORDER BY datetime(persistence_detected_at) DESC
             LIMIT 12",
        )
        .map_err(|e| e.to_string())?;
    let pers_raw: Vec<(String, String, String, String, f64, f64, String)> = stmt_pers
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut persistence_signals: Vec<Value> = Vec::new();
    for (pid, sm, et, det_at, fr, er, det_s) in pers_raw {
        let det: Value = serde_json::from_str(&det_s).unwrap_or_else(|_| json!({}));
        let conf = det
            .get("confidenceScore")
            .and_then(|v| v.as_f64())
            .unwrap_or((fr / er.max(0.001)).min(0.99));
        persistence_signals.push(json!({
            "persistenceId": pid,
            "sourceModule": sm,
            "eventType": et,
            "persistenceDetectedAt": det_at,
            "failureRate": fr,
            "expectedRate": er,
            "confidenceScore": conf,
            "tone": "orange",
        }));
    }

    let forecast_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, forecasts_generated, forecast_accuracy, forecast_false_positive_rate, prediction_accuracy_score
             FROM workflow_failure_forecast_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "forecastsGenerated": r.get::<_, i64>(1)?,
                    "forecastAccuracy": r.get::<_, f64>(2)?,
                    "forecastFalsePositiveRate": r.get::<_, f64>(3)?,
                    "predictionAccuracyScore": r.get::<_, f64>(4)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let forecast_risk_score: Option<Value> = conn
        .query_row(
            "SELECT forecast_risk_score, high_risk_forecasts, total_forecasts, updated_at
             FROM workflow_forecast_risk_score WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "forecastRiskScore": r.get::<_, f64>(0)?,
                    "highRiskForecasts": r.get::<_, i64>(1)?,
                    "totalForecasts": r.get::<_, i64>(2)?,
                    "updatedAt": r.get::<_, String>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let forecast_explanation_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, explanations_generated, accurate_explanations, misleading_explanations
             FROM workflow_forecast_explanation_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "explanationsGenerated": r.get::<_, i64>(1)?,
                    "accurateExplanations": r.get::<_, i64>(2)?,
                    "misleadingExplanations": r.get::<_, i64>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let forecast_explanation_score: Option<Value> = conn
        .query_row(
            "SELECT explanation_accuracy_score, accurate_explanations, total_explanations, updated_at
             FROM workflow_forecast_explanation_score WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "explanationAccuracyScore": r.get::<_, f64>(0)?,
                    "accurateExplanations": r.get::<_, i64>(1)?,
                    "totalExplanations": r.get::<_, i64>(2)?,
                    "updatedAt": r.get::<_, String>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let forecast_action_metrics_today: Option<Value> = conn
        .query_row(
            "SELECT metric_date, actions_generated, actions_acknowledged, actions_effective
             FROM workflow_forecast_action_metrics WHERE metric_date = date('now')",
            [],
            |r| {
                Ok(json!({
                    "metricDate": r.get::<_, String>(0)?,
                    "actionsGenerated": r.get::<_, i64>(1)?,
                    "actionsAcknowledged": r.get::<_, i64>(2)?,
                    "actionsEffective": r.get::<_, i64>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let preventive_reliability_score: Option<Value> = conn
        .query_row(
            "SELECT preventive_reliability_score, prevented_failures, total_forecasts, updated_at
             FROM workflow_preventive_reliability_score WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "preventiveReliabilityScore": r.get::<_, f64>(0)?,
                    "preventedFailures": r.get::<_, i64>(1)?,
                    "totalForecastsEvaluated": r.get::<_, i64>(2)?,
                    "updatedAt": r.get::<_, String>(3)?,
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "healthStatus": health,
        "activeIncidentCount": open,
        "openFatal": open_fatal,
        "openCritical": open_crit,
        "recoverySuccessRate30d": recovery_success_rate,
        "systemReliabilityScore": rel.unwrap_or(1.0),
        "activeIncidents": active,
        "postMortemIncidents": postmortem,
        "postMortemTimeline": post_mortem_timeline,
        "metricsToday": metrics_today,
        "correlationMetricsToday": correlation_metrics_today,
        "incidentNoiseScoreToday": incident_noise_score_today,
        "suppressionMetricsToday": suppression_metrics_today,
        "stabilizationMetricsToday": stabilization_metrics_today,
        "systemStabilityScore": system_stability,
        "stabilizationSignals": stabilization_signals,
        "regressionMetricsToday": regression_metrics_today,
        "structuredRegressionMetricsToday": structured_regression_metrics_today,
        "regressionRiskScore": regression_risk,
        "regressionSignals": regression_signals,
        "persistenceMetricsToday": persistence_metrics_today,
        "persistenceRiskScore": persistence_risk,
        "persistenceSignals": persistence_signals,
        "activeSuppressions": active_suppressions,
        "activeSystemicBursts": systemic_bursts,
        "failureForecastBanner": failure_forecast_banner,
        "forecastMetricsToday": forecast_metrics_today,
        "forecastRiskScore": forecast_risk_score,
        "forecastExplanationMetricsToday": forecast_explanation_metrics_today,
        "forecastExplanationScore": forecast_explanation_score,
        "forecastActionMetricsToday": forecast_action_metrics_today,
        "preventiveReliabilityScore": preventive_reliability_score,
    }))
}

pub fn submit_workflow_forecast_feedback(
    conn: &Connection,
    forecast_id: &str,
    feedback_kind: &str,
    notes: Option<&str>,
    caller_role: &str,
) -> Result<(), String> {
    require_view(caller_role)?;
    let fid = forecast_id.trim();
    if fid.is_empty() {
        return Err("forecast_id required".into());
    }
    let fk = feedback_kind.trim().to_lowercase();
    if fk != "accurate" && fk != "misleading" {
        return Err("feedback_kind must be accurate or misleading".into());
    }
    let chk: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_failure_forecast WHERE forecast_id = ?1",
            params![fid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if chk == 0 {
        return Err("forecast not found".into());
    }
    let dup: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_forecast_feedback WHERE forecast_id = ?1",
            params![fid],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if dup > 0 {
        return Err("feedback already recorded for this forecast".into());
    }
    let fb_id = Uuid::new_v4().to_string();
    let ts = now_ts();
    let note_s: Option<String> = notes
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    conn.execute(
        "INSERT INTO workflow_forecast_feedback (feedback_id, forecast_id, feedback_kind, notes, created_at, caller_role)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            &fb_id,
            fid,
            &fk,
            note_s,
            &ts,
            caller_role.trim(),
        ],
    )
    .map_err(|e| e.to_string())?;
    let _ = sync_forecast_explanation_metrics_for_today(conn)?;
    Ok(())
}

pub fn get_incident_detail(conn: &Connection, incident_id: &str) -> Result<Value, String> {
    let row: (
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, correlation_id, correlation_key, trigger_event_type, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary
             FROM workflow_incidents WHERE incident_id = ?1",
            params![incident_id],
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
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                    r.get(12)?,
                    r.get(13)?,
                ))
            },
        )
        .map_err(|_| "incident not found".to_string())?;
    let alert: Option<Value> = conn
        .query_row(
            "SELECT id, created_at, signal_type, severity, entity_id, message, details_json
             FROM workflow_alert_signal_log WHERE id = ?1",
            params![&row.6], // linked_alert_id
            |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "createdAt": r.get::<_, String>(1)?,
                    "signalType": r.get::<_, String>(2)?,
                    "severity": r.get::<_, String>(3)?,
                    "entityId": r.get::<_, Option<String>>(4)?,
                    "message": r.get::<_, String>(5)?,
                    "details": serde_json::from_str::<Value>(&r.get::<_, String>(6)?).unwrap_or(Value::Null),
                }))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut hstmt = conn
        .prepare(
            "SELECT history_id, event_type, event_timestamp, notes, details_json FROM workflow_incident_history
             WHERE incident_id = ?1 ORDER BY datetime(event_timestamp) ASC",
        )
        .map_err(|e| e.to_string())?;
    let history: Vec<Value> = hstmt
        .query_map(params![incident_id], |r| {
            Ok(json!({
                "historyId": r.get::<_, String>(0)?,
                "eventType": r.get::<_, String>(1)?,
                "eventTimestamp": r.get::<_, String>(2)?,
                "notes": r.get::<_, Option<String>>(3)?,
                "details": serde_json::from_str::<Value>(&r.get::<_, String>(4)?).unwrap_or(Value::Null),
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let ctx: Value = serde_json::from_str(&row.4).unwrap_or(Value::Null);
    let stats = correlation_stats_json(conn, incident_id)?;
    Ok(json!({
        "incidentId": row.0,
        "createdAt": row.1,
        "severity": row.2,
        "status": row.3,
        "errorContext": ctx,
        "sourceModule": row.5,
        "linkedAlertId": row.6,
        "correlationId": row.7,
        "correlationKey": row.8,
        "triggerEventType": row.9,
        "correlatedEventCount": row.10,
        "lastCorrelatedAt": row.11,
        "resolvedAt": row.12,
        "rootCauseSummary": row.13,
        "relatedAlert": alert,
        "history": history,
        "correlation": stats,
    }))
}

pub fn export_workflow_incidents_report_csv(conn: &Connection) -> Result<String, String> {
    fn esc(s: &str) -> String {
        if s.contains(',') || s.contains('"') || s.contains('\n') {
            format!("\"{}\"", s.replace('"', "\"\""))
        } else {
            s.to_string()
        }
    }
    let mut out = String::from("incident_id,created_at,severity,status,source_module,linked_alert_id,resolved_at,root_cause_summary,error_context_json\n");
    let mut stmt = conn
        .prepare(
            "SELECT incident_id, created_at, severity, status, source_module, linked_alert_id,
                    COALESCE(resolved_at,''), COALESCE(root_cause_summary,''), error_context_json
             FROM workflow_incidents ORDER BY datetime(created_at) DESC LIMIT 2000",
        )
        .map_err(|e| e.to_string())?;
    for row in stmt
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
                r.get::<_, String>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?
    {
        let (a, b, c, d, e, f, g, h, j) = row.map_err(|e| e.to_string())?;
        out.push_str(&format!(
            "{},{},{},{},{},{},{},{},{}\n",
            esc(&a),
            esc(&b),
            esc(&c),
            esc(&d),
            esc(&e),
            esc(&f),
            esc(&g),
            esc(&h),
            esc(&j),
        ));
    }
    out.push_str("\nhistory\nhistory_id,incident_id,event_type,event_timestamp,notes,details_json\n");
    let mut h = conn
        .prepare(
            "SELECT history_id, incident_id, event_type, event_timestamp, COALESCE(notes,''), details_json
             FROM workflow_incident_history ORDER BY datetime(event_timestamp) ASC LIMIT 10000",
        )
        .map_err(|e| e.to_string())?;
    for row in h
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
    {
        let (a, b, c, d, e, f) = row.map_err(|e| e.to_string())?;
        out.push_str(&format!(
            "{},{},{},{},{},{}\n",
            esc(&a),
            esc(&b),
            esc(&c),
            esc(&d),
            esc(&e),
            esc(&f),
        ));
    }
    Ok(out)
}

/// Ordered lifecycle events with cumulative correlated alert count for replay UI.
pub fn get_correlated_incident_timeline(
    conn: &Connection,
    incident_id: &str,
) -> Result<Value, String> {
    let chk: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_incidents WHERE incident_id = ?1",
            params![incident_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if chk == 0 {
        return Err("incident not found".into());
    }
    let mut stmt = conn
        .prepare(
            "SELECT event_timestamp, event_type FROM workflow_incident_history
             WHERE incident_id = ?1
             ORDER BY datetime(event_timestamp) ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String)> = stmt
        .query_map(params![incident_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut cum = 0i64;
    let mut out: Vec<Value> = Vec::new();
    for (ts, et) in rows {
        if et == "CORRELATED_EVENT" || et == "ALERT_CORRELATED" {
            cum += 1;
        }
        out.push(json!({
            "timestamp": ts,
            "eventType": et,
            "correlationCount": cum,
        }));
    }
    Ok(Value::Array(out))
}

pub fn debug_trigger_failure(
    conn: &Connection,
    mode: &str,
    caller_role: &str,
) -> Result<Value, String> {
    require_admin_or_debug(conn, caller_role)?;
    let m = mode.trim().to_lowercase();
    if m.starts_with("trigger_") {
        cleanup_previous_debug_scope(conn, m.as_str())?;
    }
    if m == "trigger_burst_failure" {
        let burst_entity = format!("burst-sim-{}", Uuid::new_v4());
        let mut last_aid = String::new();
        for i in 0..10 {
            let aid = Uuid::new_v4().to_string();
            let ts = now_ts();
            let details = json!({
                "debugMode": true,
                "simulation": "trigger_burst_failure",
                "index": i,
                "burstEntity": &burst_entity,
            });
            let msg = format!("Simulated burst cluster alert {i}/10");
            conn.execute(
                "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
                 VALUES (?1, ?2, 'DEBUG_BURST_CLUSTER', 'CRITICAL', ?3, ?4, ?5)",
                params![&aid, &ts, &burst_entity, &msg, &details.to_string()],
            )
            .map_err(|e| e.to_string())?;
            maybe_promote_alert_to_incident(
                conn,
                &aid,
                "DEBUG_BURST_CLUSTER",
                "CRITICAL",
                Some(burst_entity.as_str()),
                &msg,
                &details,
                "job_monitor",
            )?;
            last_aid = aid;
        }
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "burstEntity": burst_entity,
            "alertIdsEmitted": 10,
            "lastAlertId": last_aid,
        }));
    }
    if m == "trigger_suppressed_burst" {
        let burst_ref = Uuid::new_v4().to_string();
        let corr = Uuid::new_v4().to_string();
        let sid = create_burst_driven_suppression(
            conn,
            &corr,
            None,
            "job_monitor",
            "DEBUG_SUPPRESSED_BURST",
            &burst_ref,
        )?;
        let mut suppressed = 0i64;
        let mut promoted = 0i64;
        for i in 0..8 {
            let aid = Uuid::new_v4().to_string();
            let ts = now_ts();
            let details = json!({
                "debugMode": true,
                "simulation": "trigger_suppressed_burst",
                "index": i,
            });
            let msg = format!("Simulated post-burst alert {i}/8");
            conn.execute(
                "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
                 VALUES (?1, ?2, 'DEBUG_SUPPRESSED_BURST', 'CRITICAL', 'debug-sup', ?3, ?4)",
                params![&aid, &ts, &msg, &details.to_string()],
            )
            .map_err(|e| e.to_string())?;
            if apply_incident_suppression_to_critical_alert(
                conn,
                "job_monitor",
                "DEBUG_SUPPRESSED_BURST",
                &aid,
            )? {
                suppressed += 1;
            } else if maybe_promote_alert_to_incident(
                conn,
                &aid,
                "DEBUG_SUPPRESSED_BURST",
                "CRITICAL",
                Some("debug-sup"),
                &msg,
                &details,
                "job_monitor",
            )?
            .is_some()
            {
                promoted += 1;
            }
        }
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "suppressionId": sid,
            "alertsInserted": 8,
            "suppressedCount": suppressed,
            "incidentsTouched": promoted,
        }));
    }
    // Burst of historical CRITICAL alerts (~50m ago), then detect_stabilization_phase so quiet window can confirm immediately.
    if m == "trigger_recovery_stabilization" {
        let burst_entity = format!("stabilize-sim-{}", Uuid::new_v4());
        let sig = "DEBUG_RECOVERY_STABILIZE";
        let base = chrono::Utc::now() - chrono::Duration::minutes(50);
        let mut last_iid: Option<String> = None;
        let mut last_aid = String::new();
        for i in 0i64..10 {
            let ts = (base + chrono::Duration::seconds(i * 20))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let aid = Uuid::new_v4().to_string();
            let details = json!({
                "debugMode": true,
                "simulation": "trigger_recovery_stabilization",
                "index": i,
                "burstEntity": &burst_entity,
            });
            let msg = format!("Simulated historical burst {i}/10 for stabilization drill");
            conn.execute(
                "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
                 VALUES (?1, ?2, ?3, 'CRITICAL', ?4, ?5, ?6)",
                params![&aid, &ts, sig, &burst_entity, &msg, &details.to_string()],
            )
            .map_err(|e| e.to_string())?;
            last_aid = aid.clone();
            if let Some(iid) = maybe_promote_alert_to_incident(
                conn,
                &aid,
                sig,
                "CRITICAL",
                Some(burst_entity.as_str()),
                &msg,
                &details,
                "job_monitor",
            )? {
                last_iid = Some(iid);
            }
        }
        let transitions = detect_stabilization_phase(conn)?;
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "burstEntity": burst_entity,
            "signalType": sig,
            "alertsInserted": 10,
            "lastAlertId": last_aid,
            "incidentId": last_iid,
            "stabilizationTransitions": transitions,
        }));
    }
    // Resolved incident + confirmed stabilization (within 60m), then a new matching CRITICAL alert → regression.
    if m == "trigger_regression_failure" {
        let sm = "deployment";
        let sig = "DEBUG_REGRESSION_DRILL";
        let ent = format!("debug-reg-{}", Uuid::new_v4());
        let prev_iid = Uuid::new_v4().to_string();
        let prev_corr = Uuid::new_v4().to_string();
        let aid_old = Uuid::new_v4().to_string();
        let t_resolve = now_ts();
        let corr_key = compute_incident_correlation_key(sm, sig, Some(ent.as_str()), &t_resolve);
        let rc = "x".repeat(60);
        let ctx = json!({
            "message": "debug regression prior incident",
            "correlationKey": &corr_key,
        });
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'RESOLVED', ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?10, ?11)",
            params![
                &prev_iid,
                &t_resolve,
                &ctx.to_string(),
                sm,
                &aid_old,
                sig,
                &prev_corr,
                &corr_key,
                &t_resolve,
                &t_resolve,
                &rc,
            ],
        )
        .map_err(|e| e.to_string())?;
        let stab_conf = (chrono::Utc::now() - chrono::Duration::minutes(25))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let stab_start = (chrono::Utc::now() - chrono::Duration::hours(2))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let sid_stab = Uuid::new_v4().to_string();
        let scorr = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_incident_stabilization (stabilization_id, correlation_id, incident_id, source_module, event_type, stabilization_start, stabilization_confirmed, stability_duration_minutes, confidence_score, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 20, 0.85, ?6)",
            params![&sid_stab, &scorr, &prev_iid, sm, sig, &stab_start, &stab_conf],
        )
        .map_err(|e| e.to_string())?;
        let aid_new = Uuid::new_v4().to_string();
        let ts_alert = now_ts();
        let det_new = json!({ "debugMode": true, "simulation": "trigger_regression_failure" });
        conn.execute(
            "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
             VALUES (?1, ?2, ?3, 'CRITICAL', ?4, ?5, ?6)",
            params![
                &aid_new,
                &ts_alert,
                sig,
                &ent,
                "Debug regression failure after stabilization",
                &det_new.to_string(),
            ],
        )
        .map_err(|e| e.to_string())?;
        let new_iid = maybe_promote_alert_to_incident(
            conn,
            &aid_new,
            sig,
            "CRITICAL",
            Some(ent.as_str()),
            "Debug regression failure after stabilization",
            &det_new,
            sm,
        )?;
        if let Some(ref ni) = new_iid {
            let _ = maybe_record_regression_after_alert_promotion(
                conn,
                ni,
                &aid_new,
                sm,
                sig,
                Some(ent.as_str()),
            )?;
        }
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "previousIncidentId": prev_iid,
            "newIncidentId": new_iid,
            "stabilizationId": sid_stab,
            "alertId": aid_new,
        }));
    }
    if m == "trigger_structured_regression" {
        let sm = "deployment";
        let evt = "DEBUG_STRUCTURED_REGRESS";
        let ent = format!("debug-str-{}", Uuid::new_v4());
        let prev_iid = Uuid::new_v4().to_string();
        let prev_corr = Uuid::new_v4().to_string();
        let aid_old = Uuid::new_v4().to_string();
        let t_resolve = now_ts();
        let corr_key = compute_incident_correlation_key(sm, evt, Some(ent.as_str()), &t_resolve);
        let rc = "y".repeat(60);
        let ctx = json!({
            "message": "debug structured regression prior incident",
            "correlationKey": &corr_key,
        });
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'RESOLVED', ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?10, ?11)",
            params![
                &prev_iid,
                &t_resolve,
                &ctx.to_string(),
                sm,
                &aid_old,
                evt,
                &prev_corr,
                &corr_key,
                &t_resolve,
                &t_resolve,
                &rc,
            ],
        )
        .map_err(|e| e.to_string())?;
        let stab_conf = (chrono::Utc::now() - chrono::Duration::minutes(25))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let stab_start = (chrono::Utc::now() - chrono::Duration::hours(2))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let sid_stab = Uuid::new_v4().to_string();
        let scorr = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_incident_stabilization (stabilization_id, correlation_id, incident_id, source_module, event_type, stabilization_start, stabilization_confirmed, stability_duration_minutes, confidence_score, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 20, 0.85, ?6)",
            params![&sid_stab, &scorr, &prev_iid, sm, evt, &stab_start, &stab_conf],
        )
        .map_err(|e| e.to_string())?;
        let se_id = Uuid::new_v4().to_string();
        let ts_struct = now_ts();
        let det = json!({ "debugMode": true, "simulation": "trigger_structured_regression" });
        conn.execute(
            "INSERT INTO workflow_structured_event_log (id, timestamp, module, event_type, entity_id, severity, details_json)
             VALUES (?1, ?2, ?3, ?4, ?5, 'CRITICAL', ?6)",
            params![
                &se_id,
                &ts_struct,
                sm,
                evt,
                &ent,
                &det.to_string(),
            ],
        )
        .map_err(|e| e.to_string())?;
        let _ = maybe_record_regression_from_structured_event(
            conn,
            sm,
            evt,
            Some(ent.as_str()),
            &se_id,
            &ts_struct,
            "CRITICAL",
            &det,
        )?;
        let new_open = find_any_open_incident_by_correlation_key(conn, &corr_key)?;
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "previousIncidentId": prev_iid,
            "stabilizationId": sid_stab,
            "structuredEventId": se_id,
            "regressionIncidentId": new_open,
        }));
    }
    if m == "trigger_failure_forecast" {
        let sm = "job_monitor";
        let job_id = "automation_cycle";
        let det = json!({ "debugMode": true, "simulation": "trigger_failure_forecast" });
        for i in 0i64..35 {
            let ts_ev = (chrono::Utc::now() - chrono::Duration::minutes(12 - i / 4))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let eid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, completed_at, status, records_processed, error_message, execution_time_ms, retry_count)
                 VALUES (?1, ?2, ?3, ?3, 'FAILED', 0, 'debug forecast drill', 1200, 0)",
                params![&eid, job_id, &ts_ev],
            )
            .map_err(|e| e.to_string())?;
        }
        let prev_iid = Uuid::new_v4().to_string();
        let prev_corr = Uuid::new_v4().to_string();
        let aid_old = Uuid::new_v4().to_string();
        let t_resolve = now_ts();
        let ent_prev = format!("fc-reg-{}", Uuid::new_v4());
        let corr_prev =
            compute_incident_correlation_key(sm, "BACKGROUND_JOB_FAILURE", Some(ent_prev.as_str()), &t_resolve);
        let rc = "p".repeat(60);
        let ctx_prev = json!({
            "message": "debug forecast prior resolved",
            "correlationKey": &corr_prev,
        });
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'RESOLVED', ?3, ?4, ?5, 'BACKGROUND_JOB_FAILURE', ?6, ?7, 1, ?8, ?8, ?9)",
            params![
                &prev_iid,
                &t_resolve,
                &ctx_prev.to_string(),
                sm,
                &aid_old,
                &prev_corr,
                &corr_prev,
                &t_resolve,
                &rc,
            ],
        )
        .map_err(|e| e.to_string())?;
        let stab_conf = (chrono::Utc::now() - chrono::Duration::hours(4))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let stab_start = (chrono::Utc::now() - chrono::Duration::hours(8))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let sid_stab = Uuid::new_v4().to_string();
        let scorr = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_incident_stabilization (stabilization_id, correlation_id, incident_id, source_module, event_type, stabilization_start, stabilization_confirmed, stability_duration_minutes, confidence_score, created_at)
             VALUES (?1, ?2, ?3, ?4, 'BACKGROUND_JOB_FAILURE', ?5, ?6, 25, 0.82, ?5)",
            params![&sid_stab, &scorr, &prev_iid, sm, &stab_start, &stab_conf],
        )
        .map_err(|e| e.to_string())?;
        for k in 0i64..4 {
            let rts = (chrono::Utc::now() - chrono::Duration::hours(10 + k * 5))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let rid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO workflow_incident_regression (regression_id, correlation_id, incident_id, source_module, event_type, regression_detected_at, time_since_stabilization_minutes, severity, details_json)
                 VALUES (?1, ?2, ?3, ?4, 'BACKGROUND_JOB_FAILURE', ?5, 12, 'CRITICAL', ?6)",
                params![
                    &rid,
                    &scorr,
                    &prev_iid,
                    sm,
                    &rts,
                    &det.to_string(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        let n = detect_failure_forecasts(conn)?;
        let banner = pick_active_failure_forecast_banner(conn)?;
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "jobFailureRowsInserted": 35,
            "regressionRowsInserted": 4,
            "forecastsInserted": n,
            "failureForecastBanner": banner,
        }));
    }
    if m == "trigger_explainable_forecast" || m == "trigger_actionable_forecast" {
        let sim_label = if m == "trigger_actionable_forecast" {
            "trigger_actionable_forecast"
        } else {
            "trigger_explainable_forecast"
        };
        let sm = "job_monitor";
        let ent_open = format!("explain-fc-{}", Uuid::new_v4());
        let t0 = now_ts();
        let corr_open =
            compute_incident_correlation_key(sm, "BACKGROUND_JOB_FAILURE", Some(ent_open.as_str()), &t0);
        let open_iid = Uuid::new_v4().to_string();
        let open_corr = Uuid::new_v4().to_string();
        let link_id = Uuid::new_v4().to_string();
        let open_msg = if m == "trigger_actionable_forecast" {
            "debug actionable forecast open incident"
        } else {
            "debug explainable forecast open incident"
        };
        let ctx_open = json!({
            "message": open_msg,
            "correlationKey": &corr_open,
        });
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'OPEN', ?3, ?4, ?5, 'BACKGROUND_JOB_FAILURE', ?6, ?7, 1, ?2, NULL, NULL)",
            params![
                &open_iid,
                &t0,
                &ctx_open.to_string(),
                sm,
                &link_id,
                &open_corr,
                &corr_open,
            ],
        )
        .map_err(|e| e.to_string())?;
        append_history(
            conn,
            &open_iid,
            "CREATED",
            Some("Debug explainable/actionable forecast drill incident"),
            &json!({ "debugMode": true, "simulation": sim_label }),
        )?;
        let job_id = "automation_cycle";
        let det = json!({ "debugMode": true, "simulation": sim_label });
        for i in 0i64..35 {
            let ts_ev = (chrono::Utc::now() - chrono::Duration::minutes(12 - i / 4))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let eid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, completed_at, status, records_processed, error_message, execution_time_ms, retry_count)
                 VALUES (?1, ?2, ?3, ?3, 'FAILED', 0, 'debug explainable forecast drill', 1200, 0)",
                params![&eid, job_id, &ts_ev],
            )
            .map_err(|e| e.to_string())?;
        }
        let prev_iid = Uuid::new_v4().to_string();
        let prev_corr = Uuid::new_v4().to_string();
        let aid_old = Uuid::new_v4().to_string();
        let t_resolve = now_ts();
        let ent_prev = format!("fc-exp-reg-{}", Uuid::new_v4());
        let corr_prev =
            compute_incident_correlation_key(sm, "BACKGROUND_JOB_FAILURE", Some(ent_prev.as_str()), &t_resolve);
        let rc = "q".repeat(60);
        let ctx_prev = json!({
            "message": "debug explainable forecast prior resolved",
            "correlationKey": &corr_prev,
        });
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'RESOLVED', ?3, ?4, ?5, 'BACKGROUND_JOB_FAILURE', ?6, ?7, 1, ?8, ?8, ?9)",
            params![
                &prev_iid,
                &t_resolve,
                &ctx_prev.to_string(),
                sm,
                &aid_old,
                &prev_corr,
                &corr_prev,
                &t_resolve,
                &rc,
            ],
        )
        .map_err(|e| e.to_string())?;
        let stab_conf = (chrono::Utc::now() - chrono::Duration::hours(4))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let stab_start = (chrono::Utc::now() - chrono::Duration::hours(8))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let sid_stab = Uuid::new_v4().to_string();
        let scorr = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_incident_stabilization (stabilization_id, correlation_id, incident_id, source_module, event_type, stabilization_start, stabilization_confirmed, stability_duration_minutes, confidence_score, created_at)
             VALUES (?1, ?2, ?3, ?4, 'BACKGROUND_JOB_FAILURE', ?5, ?6, 25, 0.82, ?5)",
            params![&sid_stab, &scorr, &prev_iid, sm, &stab_start, &stab_conf],
        )
        .map_err(|e| e.to_string())?;
        for k in 0i64..4 {
            let rts = (chrono::Utc::now() - chrono::Duration::hours(10 + k * 5))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let rid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO workflow_incident_regression (regression_id, correlation_id, incident_id, source_module, event_type, regression_detected_at, time_since_stabilization_minutes, severity, details_json)
                 VALUES (?1, ?2, ?3, ?4, 'BACKGROUND_JOB_FAILURE', ?5, 12, 'CRITICAL', ?6)",
                params![
                    &rid,
                    &scorr,
                    &prev_iid,
                    sm,
                    &rts,
                    &det.to_string(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        let n = detect_failure_forecasts(conn)?;
        let banner = pick_active_failure_forecast_banner(conn)?;
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "openIncidentId": open_iid,
            "jobFailureRowsInserted": 35,
            "regressionRowsInserted": 4,
            "forecastsInserted": n,
            "failureForecastBanner": banner,
        }));
    }
    if m == "trigger_persistent_failure" {
        let sm = "job_monitor";
        let evt = "DEBUG_PERSISTENCE_DRILL";
        let ent_open = format!("persist-open-{}", Uuid::new_v4());
        let t0 = now_ts();
        let corr_open = compute_incident_correlation_key(sm, evt, Some(ent_open.as_str()), &t0);
        let open_iid = Uuid::new_v4().to_string();
        let open_corr = Uuid::new_v4().to_string();
        let link_id = Uuid::new_v4().to_string();
        let ctx_open = json!({
            "message": "debug persistent failure open incident",
            "correlationKey": &corr_open,
        });
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'OPEN', ?3, ?4, ?5, ?6, ?7, ?8, 1, ?2, NULL, NULL)",
            params![
                &open_iid,
                &t0,
                &ctx_open.to_string(),
                sm,
                &link_id,
                evt,
                &open_corr,
                &corr_open,
            ],
        )
        .map_err(|e| e.to_string())?;
        append_history(
            conn,
            &open_iid,
            "CREATED",
            Some("Debug persistent-failure drill incident"),
            &json!({ "debugMode": true }),
        )?;
        let prev_iid = Uuid::new_v4().to_string();
        let prev_corr = Uuid::new_v4().to_string();
        let aid_old = Uuid::new_v4().to_string();
        let t_resolve = now_ts();
        let ent_prev = format!("persist-prev-{}", Uuid::new_v4());
        let corr_prev = compute_incident_correlation_key(sm, evt, Some(ent_prev.as_str()), &t_resolve);
        let rc = "z".repeat(60);
        let ctx_prev = json!({
            "message": "debug persistent prior resolved",
            "correlationKey": &corr_prev,
        });
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'RESOLVED', ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?10, ?11)",
            params![
                &prev_iid,
                &t_resolve,
                &ctx_prev.to_string(),
                sm,
                &aid_old,
                evt,
                &prev_corr,
                &corr_prev,
                &t_resolve,
                &t_resolve,
                &rc,
            ],
        )
        .map_err(|e| e.to_string())?;
        let stab_conf = (chrono::Utc::now() - chrono::Duration::hours(3))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let stab_start = (chrono::Utc::now() - chrono::Duration::hours(5))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let sid_stab = Uuid::new_v4().to_string();
        let scorr = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_incident_stabilization (stabilization_id, correlation_id, incident_id, source_module, event_type, stabilization_start, stabilization_confirmed, stability_duration_minutes, confidence_score, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 30, 0.8, ?6)",
            params![&sid_stab, &scorr, &prev_iid, sm, evt, &stab_start, &stab_conf],
        )
        .map_err(|e| e.to_string())?;
        let det = json!({ "debugMode": true, "simulation": "trigger_persistent_failure" });
        for i in 0i64..14 {
            let ts_ev = (chrono::Utc::now() - chrono::Duration::minutes(18 - i))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let eid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO workflow_structured_event_log (id, timestamp, module, event_type, entity_id, severity, details_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'CRITICAL', ?6)",
                params![&eid, &ts_ev, sm, evt, &ent_open, &det.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }
        for j in 0i64..6 {
            let ts_a = (chrono::Utc::now() - chrono::Duration::minutes(17 - j))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            let aid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
                 VALUES (?1, ?2, ?3, 'CRITICAL', ?4, ?5, ?6)",
                params![
                    &aid,
                    &ts_a,
                    evt,
                    &ent_open,
                    "debug persistent drill alert",
                    &det.to_string(),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        let n = detect_persistent_failure_rate(conn)?;
        return Ok(json!({
            "ok": true,
            "mode": mode,
            "openIncidentId": open_iid,
            "stabilizationId": sid_stab,
            "persistenceEventsDetected": n,
        }));
    }
    let (sig, module, sev, msg) = match m.as_str() {
        "api_timeout" => (
            "DEBUG_API_TIMEOUT",
            "job_monitor",
            "CRITICAL",
            "Simulated API timeout",
        ),
        "database_lock" => (
            "DEBUG_DB_LOCK",
            "job_monitor",
            "CRITICAL",
            "Simulated database lock contention",
        ),
        "job_failure" => (
            "DEBUG_JOB_FAILURE",
            "job_monitor",
            "FATAL",
            "Simulated background job failure",
        ),
        "deployment_failure" => (
            "DEBUG_DEPLOY_FAILURE",
            "deployment",
            "CRITICAL",
            "Simulated deployment failure",
        ),
        "recovery_failure" => (
            "DEBUG_RECOVERY_FAILURE",
            "recovery",
            "FATAL",
            "Simulated recovery failure",
        ),
        _ => {
            return Err(
                "unknown mode: api_timeout, database_lock, job_failure, deployment_failure, recovery_failure, trigger_burst_failure, trigger_suppressed_burst, trigger_recovery_stabilization, trigger_regression_failure, trigger_structured_regression, trigger_persistent_failure, trigger_failure_forecast, trigger_explainable_forecast, trigger_actionable_forecast"
                    .into(),
            );
        }
    };
    let aid = Uuid::new_v4().to_string();
    let ts = now_ts();
    let details = json!({
        "debugMode": true,
        "simulation": m,
        "payloadSnapshot": { "mode": &m, "timestamp": &ts },
    });
    log::info!(
        target: "structured",
        "{}",
        json!({
            "module": module,
            "event_type": "debug_trigger_failure",
            "entity_id": &aid,
            "severity": sev,
            "details": &details
        })
    );
    conn.execute(
        "INSERT INTO workflow_alert_signal_log (id, created_at, signal_type, severity, entity_id, message, details_json)
         VALUES (?1, ?2, ?3, ?4, 'debug', ?5, ?6)",
        params![&aid, &ts, sig, sev, msg, &details.to_string()],
    )
    .map_err(|e| e.to_string())?;
    let _ = maybe_promote_alert_to_incident(
        conn, &aid, sig, sev, Some("debug"), msg, &details, module,
    )?;
    Ok(json!({ "ok": true, "alertId": aid, "mode": mode }))
}

// --- Tauri ---

#[tauri::command]
pub fn submit_workflow_forecast_feedback_command(
    forecast_id: String,
    feedback_kind: String,
    notes: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    submit_workflow_forecast_feedback(
        &conn,
        forecast_id.trim(),
        feedback_kind.trim(),
        notes.as_deref(),
        &caller_role,
    )
}

#[tauri::command]
pub fn acknowledge_workflow_forecast_actions_command(
    forecast_id: String,
    action_taken: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    acknowledge_forecast_preventive_actions(
        &conn,
        forecast_id.trim(),
        action_taken.trim(),
        &caller_role,
    )
}

#[tauri::command]
pub fn get_operations_center_dashboard_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_operations_center_dashboard(&conn)
}

#[tauri::command]
pub fn get_workflow_incident_detail_command(
    incident_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_incident_detail(&conn, incident_id.trim())
}

#[tauri::command]
pub fn get_correlated_incident_timeline_command(
    incident_id: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    get_correlated_incident_timeline(&conn, incident_id.trim())
}

#[tauri::command]
pub fn scan_systemic_failure_bursts_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<i64, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let n = scan_systemic_failure_bursts(&conn)?;
    let _ = refresh_suppression_state(&conn);
    let _ = detect_stabilization_phase(&conn);
    let _ = detect_persistent_failure_rate(&conn);
    let _ = detect_failure_forecasts(&conn);
    Ok(n)
}

#[tauri::command]
pub fn detect_stabilization_phase_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<i64, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let _ = refresh_suppression_state(&conn);
    let n = detect_stabilization_phase(&conn)?;
    let _ = detect_persistent_failure_rate(&conn);
    let _ = detect_failure_forecasts(&conn);
    Ok(n)
}

#[tauri::command]
pub fn start_manual_incident_suppression_command(
    source_module: String,
    event_type: String,
    window_minutes: i64,
    reason: String,
    incident_id: Option<String>,
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_admin(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    start_manual_incident_suppression(
        &conn,
        source_module.trim(),
        event_type.trim(),
        window_minutes,
        &reason,
        incident_id.as_deref().map(str::trim).filter(|s| !s.is_empty()),
    )
}

#[tauri::command]
pub fn append_workflow_incident_resolution_note_command(
    incident_id: String,
    notes: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    append_incident_resolution_note(&conn, incident_id.trim(), &notes)
}

#[tauri::command]
pub fn resolve_workflow_incident_command(
    incident_id: String,
    root_cause_summary: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    resolve_incident(
        &conn,
        incident_id.trim(),
        &root_cause_summary,
        false,
    )
}

#[tauri::command]
pub fn export_workflow_incidents_report_csv_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<String, String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    export_workflow_incidents_report_csv(&conn)
}

#[tauri::command]
pub fn refresh_workflow_incident_metrics_command(
    caller_role: String,
    state: State<DbState>,
) -> Result<(), String> {
    require_view(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    refresh_incident_daily_metrics(&conn)
}

#[tauri::command]
pub fn debug_trigger_failure_command(
    mode: String,
    caller_role: String,
    state: State<DbState>,
) -> Result<Value, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    debug_trigger_failure(&conn, mode.trim(), &caller_role)
}

#[cfg(test)]
mod workflow_readiness_cert {
    use super::*;
    use crate::migrations::DatabaseMigrations;
    use rusqlite::params;

    fn migr_conn() -> rusqlite::Connection {
        let mut conn = rusqlite::Connection::open_in_memory().expect("in-memory db");
        DatabaseMigrations::run_migrations_test(&mut conn).expect("migrations");
        conn
    }

    #[test]
    fn v020_debug_sweep_sequential_no_panic() {
        let conn = migr_conn();
        let modes = [
            "trigger_burst_failure",
            "trigger_suppressed_burst",
            "trigger_recovery_stabilization",
            "trigger_regression_failure",
            "trigger_persistent_failure",
            "trigger_explainable_forecast",
            "trigger_actionable_forecast",
        ];
        for mode in modes {
            let r = debug_trigger_failure(&conn, mode, "admin");
            assert!(r.is_ok(), "mode={mode} err={:?}", r.err());
        }
    }

    #[test]
    fn v020_dashboard_render_records_under_budget() {
        let conn = migr_conn();
        let t0 = std::time::Instant::now();
        let _ = get_operations_center_dashboard(&conn).expect("dashboard");
        let ms = t0.elapsed().as_millis();
        assert!(
            ms < 5000,
            "dashboard_render expected <5000ms in CI/dev; got {ms}ms (typical <500ms on warm DB)"
        );
    }

    #[test]
    fn v020_history_integrity_adds_created_with_flag() {
        let conn = migr_conn();
        let iid = Uuid::new_v4().to_string();
        let aid = Uuid::new_v4().to_string();
        let cid = Uuid::new_v4().to_string();
        let ts = now_ts();
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'OPEN', '{}', 'job_monitor', ?3, 'BACKGROUND_JOB_FAILURE', ?4, 'cert-key', 1, ?2, NULL, NULL)",
            params![&iid, &ts, &aid, &cid],
        )
        .expect("insert incident");
        let n0: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_incident_history WHERE incident_id = ?1 AND event_type = 'CREATED'",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n0, 0);
        refresh_incident_daily_metrics(&conn).expect("refresh");
        let n1: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_incident_history WHERE incident_id = ?1 AND event_type = 'CREATED'",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n1, 1);
        let dj: String = conn
            .query_row(
                "SELECT details_json FROM workflow_incident_history WHERE incident_id = ?1 AND event_type = 'CREATED' LIMIT 1",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap();
        assert!(dj.contains("corrective"));
    }

    #[test]
    fn v020_retention_keeps_at_most_1000_forecasts() {
        let conn = migr_conn();
        let sm = "job_monitor";
        let et = "BACKGROUND_JOB_FAILURE";
        for i in 0..1002 {
            let fid = format!("fc-ret-{i}");
            let fts = format!(
                "2020-01-01 {:02}:{:02}:00",
                (i / 60) % 24,
                i % 60
            );
            conn.execute(
                "INSERT INTO workflow_failure_forecast (forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes, details_json, primary_trigger, secondary_triggers_json, trend_summary, recommended_actions_json, action_priority)
                 VALUES (?1, ?2, ?3, ?4, 0.7, 0.5, 30, '{}', 'slope_weight', '{}', '', '[]', 'MEDIUM')",
                params![&fid, sm, et, &fts],
            )
            .expect("seed forecast");
        }
        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM workflow_failure_forecast", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total, 1002);
        refresh_incident_daily_metrics(&conn).expect("refresh");
        let after: i64 = conn
            .query_row("SELECT COUNT(*) FROM workflow_failure_forecast", [], |r| r.get(0))
            .unwrap();
        assert!(
            after <= 1000,
            "retention should cap at 1000 newest; got {after}"
        );
    }

    #[test]
    fn v020_drift_warning_emitted_on_spike() {
        let conn = migr_conn();
        let sm = "job_monitor";
        let et = "BACKGROUND_JOB_FAILURE";
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        for i in 0..25 {
            let fid = format!("fc-drift-today-{i}");
            let fts = format!("{today} {:02}:00:00", i);
            conn.execute(
                "INSERT INTO workflow_failure_forecast (forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes, details_json, primary_trigger, secondary_triggers_json, trend_summary, recommended_actions_json, action_priority)
                 VALUES (?1, ?2, ?3, ?4, 0.95, 0.9, 30, '{}', 'slope_weight', '{}', '', '[]', 'HIGH')",
                params![&fid, sm, et, &fts],
            )
            .unwrap();
        }
        let week_ago = (chrono::Utc::now() - chrono::Duration::days(5))
            .format("%Y-%m-%d")
            .to_string();
        for i in 0..25 {
            let fid = format!("fc-drift-old-{i}");
            let fts = format!("{week_ago} {:02}:00:00", i);
            conn.execute(
                "INSERT INTO workflow_failure_forecast (forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes, details_json, primary_trigger, secondary_triggers_json, trend_summary, recommended_actions_json, action_priority)
                 VALUES (?1, ?2, ?3, ?4, 0.2, 0.5, 30, '{}', 'slope_weight', '{}', '', '[]', 'LOW')",
                params![&fid, sm, et, &fts],
            )
            .unwrap();
        }
        let before: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_structured_event_log WHERE event_type = 'FORECAST_DRIFT_WARNING'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        refresh_incident_daily_metrics(&conn).expect("refresh");
        let after: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_structured_event_log WHERE event_type = 'FORECAST_DRIFT_WARNING'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        assert!(
            after > before,
            "expected FORECAST_DRIFT_WARNING; before={before} after={after}"
        );
    }

    #[test]
    fn v020_system_integrity_snapshot_matches_counts() {
        let conn = migr_conn();
        refresh_incident_daily_metrics(&conn).expect("refresh");
        let d = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let dj: String = conn
            .query_row(
                "SELECT details_json FROM system_integrity_snapshot WHERE snapshot_date = ?1",
                params![&d],
                |r| r.get(0),
            )
            .expect("snapshot row");
        let v: serde_json::Value = serde_json::from_str(&dj).expect("json");
        let inc: i64 = conn
            .query_row("SELECT COUNT(*) FROM workflow_incidents", [], |r| r.get(0))
            .unwrap();
        let fc: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_failure_forecast",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(v["incidentCount"].as_i64().unwrap(), inc);
        assert_eq!(v["forecastCount"].as_i64().unwrap(), fc);
    }

    #[test]
    fn v020_forecast_duplicate_guard_sql_window_matches_detect() {
        let conn = migr_conn();
        let sm = "job_monitor";
        let et = "BACKGROUND_JOB_FAILURE";
        let fts = "2024-06-15 12:00:00";
        let fid1 = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_failure_forecast (forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes, details_json, primary_trigger, secondary_triggers_json, trend_summary, recommended_actions_json, action_priority)
             VALUES (?1, ?2, ?3, ?4, 0.85, 0.8, 30, '{}', 'slope_weight', '{}', '', '[]', 'HIGH')",
            params![&fid1, sm, et, &fts],
        )
        .unwrap();
        let near: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_failure_forecast
                 WHERE trim(source_module) = trim(?1) AND trim(event_type) = trim(?2)
                   AND ABS(CAST(strftime('%s', forecast_time) AS INTEGER) - CAST(strftime('%s', ?3) AS INTEGER)) < 600",
                params![sm, et, &fts],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(near, 1);
    }

    #[test]
    fn v020_expired_forecast_ack_preventive_success_path() {
        let conn = migr_conn();
        let sm = "job_monitor";
        let et = "BACKGROUND_JOB_FAILURE";
        let iid = Uuid::new_v4().to_string();
        let aid = Uuid::new_v4().to_string();
        let cid = Uuid::new_v4().to_string();
        let fts_inc = now_ts();
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'OPEN', '{}', ?3, ?4, ?5, ?6, 'k2', 1, ?2, NULL, NULL)",
            params![&iid, &fts_inc, sm, &aid, et, &cid],
        )
        .unwrap();
        let ft_naive = chrono::Utc::now().naive_utc() - chrono::Duration::hours(10);
        let fts = ft_naive.format("%Y-%m-%d %H:%M:%S").to_string();
        let ack_ts = (ft_naive + chrono::Duration::minutes(15))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let fid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_failure_forecast (forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes, details_json, primary_trigger, secondary_triggers_json, trend_summary, recommended_actions_json, action_priority)
             VALUES (?1, ?2, ?3, ?4, 0.7, 0.5, 30, '{}', 'slope_weight', '{}', '', '[]', 'MEDIUM')",
            params![&fid, sm, et, &fts],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workflow_forecast_action_log (log_id, forecast_id, action_taken, acknowledged_at, caller_role)
             VALUES (?1, ?2, 'ack test', ?3, 'admin')",
            params![Uuid::new_v4().to_string(), &fid, &ack_ts],
        )
        .unwrap();
        refresh_incident_daily_metrics(&conn).expect("refresh");
        let ps: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_incident_history WHERE incident_id = ?1 AND event_type = 'PREVENTIVE_SUCCESS'",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        assert!(ps >= 1, "expected PREVENTIVE_SUCCESS when ack in window and no failures");
    }

    #[test]
    fn v020_expired_forecast_no_ack_no_preventive_success() {
        let conn = migr_conn();
        let sm = "job_monitor";
        let et = "BACKGROUND_JOB_FAILURE";
        let iid = Uuid::new_v4().to_string();
        let aid = Uuid::new_v4().to_string();
        let cid = Uuid::new_v4().to_string();
        let fts_inc = now_ts();
        conn.execute(
            "INSERT INTO workflow_incidents (incident_id, created_at, severity, status, error_context_json, source_module, linked_alert_id, trigger_event_type, correlation_id, correlation_key, correlated_event_count, last_correlated_at, resolved_at, root_cause_summary)
             VALUES (?1, ?2, 'CRITICAL', 'OPEN', '{}', ?3, ?4, ?5, ?6, 'k3', 1, ?2, NULL, NULL)",
            params![&iid, &fts_inc, sm, &aid, et, &cid],
        )
        .unwrap();
        let ft_naive = chrono::Utc::now().naive_utc() - chrono::Duration::hours(10);
        let fts = ft_naive.format("%Y-%m-%d %H:%M:%S").to_string();
        let fid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workflow_failure_forecast (forecast_id, source_module, event_type, forecast_time, predicted_failure_probability, confidence_score, forecast_horizon_minutes, details_json, primary_trigger, secondary_triggers_json, trend_summary, recommended_actions_json, action_priority)
             VALUES (?1, ?2, ?3, ?4, 0.7, 0.5, 30, '{}', 'slope_weight', '{}', '', '[]', 'MEDIUM')",
            params![&fid, sm, et, &fts],
        )
        .unwrap();
        refresh_incident_daily_metrics(&conn).expect("refresh");
        let ps: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_incident_history WHERE incident_id = ?1 AND event_type = 'PREVENTIVE_SUCCESS'",
                params![&iid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        assert_eq!(ps, 0, "no ack => no PREVENTIVE_SUCCESS");
    }
}
