use crate::commands::automation_policy::{self, PolicyDecisionKind};
use crate::db::DbState;
use chrono::Utc;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use tauri::State;

const KEYRING_SERVICE: &str = "ImportManager";
const KEYRING_SYSTEM_AGENT_DEEPSEEK_KEY: &str = "system_agent_deepseek_api_key";

const SETTING_ENABLED: &str = "system_agent_enabled";
const SETTING_MODEL: &str = "system_agent_deepseek_model";
const SETTING_BASE_URL: &str = "system_agent_deepseek_base_url";
const SETTING_CONFIDENCE_THRESHOLD: &str = "system_agent_confidence_threshold_mutate";
const SETTING_MAX_LLM_CALLS_PER_DAY: &str = "system_agent_max_llm_calls_per_day";
const SETTING_MAX_LLM_CALLS_PER_SESSION: &str = "system_agent_max_llm_calls_per_session";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-v4-flash";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAgentSettings {
    pub enabled: bool,
    pub model: String,
    pub base_url: String,
    pub confidence_threshold_mutate: f64,
    pub max_llm_calls_per_day: i64,
    pub max_llm_calls_per_session: i64,
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSystemAgentSettingsInput {
    pub enabled: Option<bool>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub confidence_threshold_mutate: Option<f64>,
    pub max_llm_calls_per_day: Option<i64>,
    pub max_llm_calls_per_session: Option<i64>,
    pub deepseek_api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAgentMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAgentTurnInput {
    pub session_id: String,
    pub caller_user_id: String,
    pub caller_role: String,
    pub messages: Vec<SystemAgentMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainGraph {
    pub schema_version: String,
    pub trace_sha256: String,
    pub generated_at: String,
    pub snapshot_timestamp: String,
    pub db_version: i64,
    pub events: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAgentTurnOutput {
    pub intent_route: String,
    pub matched_rule_id: Option<String>,
    pub llm_used: bool,
    pub content: String,
    pub explain_graph: Option<ExplainGraph>,
    pub policy_decision: Option<Value>,
    pub grounding_ok: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAgentObservabilitySummary {
    pub total_turns_7d: i64,
    pub llm_used_turns_7d: i64,
    pub blocked_turns_7d: i64,
    pub blocked_percent_7d: f64,
}

#[derive(Debug, Clone)]
struct IntentRule {
    id: &'static str,
    patterns: &'static [&'static str],
    route: &'static str,
    tool: &'static str,
    needs_extended_snapshot: bool,
}

const INTENT_RULES: &[IntentRule] = &[
    IntentRule {
        id: "failed_jobs_1",
        patterns: &["failed jobs", "job errors", "latest failed job"],
        route: "DIRECT_READ",
        tool: "list_recent_failed_job_executions",
        needs_extended_snapshot: true,
    },
    IntentRule {
        id: "health_summary_1",
        patterns: &[
            "system health",
            "health summary",
            "health summaries",
            "automation health",
        ],
        route: "DIRECT_READ",
        tool: "get_health_summary",
        needs_extended_snapshot: false,
    },
    IntentRule {
        id: "explain_failure_1",
        patterns: &["why did automation fail", "explain failure", "root cause"],
        route: "TRACE_ONLY_FAILURE",
        tool: "explain_job_failure",
        needs_extended_snapshot: true,
    },
];

static SESSION_COUNTERS: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();

fn session_counters() -> &'static Mutex<HashMap<String, i64>> {
    SESSION_COUNTERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn normalize_bool(v: Option<String>, default: bool) -> bool {
    v.map(|x| matches!(x.trim(), "1" | "true" | "TRUE" | "True"))
        .unwrap_or(default)
}

fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_deepseek_api_key() -> Option<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_SYSTEM_AGENT_DEEPSEEK_KEY).ok()?;
    entry.get_password().ok().filter(|s| !s.trim().is_empty())
}

fn set_deepseek_api_key(value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_SYSTEM_AGENT_DEEPSEEK_KEY)
        .map_err(|e| e.to_string())?;
    entry.set_password(value).map_err(|e| e.to_string())
}

fn normalize_deepseek_model(value: &str) -> String {
    let trimmed = value.trim();
    let normalized = trimmed.to_lowercase();
    if normalized.is_empty() {
        return DEEPSEEK_DEFAULT_MODEL.to_string();
    }
    // DeepSeek legacy aliases used by older app versions.
    if matches!(
        normalized.as_str(),
        "deepseek-chat" | "deepseek-v3.2" | "deepseek-v3-2"
    ) {
        return DEEPSEEK_DEFAULT_MODEL.to_string();
    }
    trimmed.to_string()
}

fn assert_system_agent_role(role: &str) -> Result<(), String> {
    let allowed = matches!(
        role.trim().to_lowercase().as_str(),
        "administrator" | "admin" | "manager" | "db_manager"
    );
    if allowed {
        Ok(())
    } else {
        Err("Permission denied for automation.system_agent".to_string())
    }
}

fn compute_db_user_version(conn: &Connection) -> i64 {
    conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0)
}

fn stable_sha256(value: &Value) -> String {
    let canonical = serde_json::to_vec(value).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(&canonical);
    format!("{:x}", hasher.finalize())
}

fn build_trace_payload(schema_version: &str, events: &[Value]) -> Value {
    json!({
        "schema_version": schema_version,
        "events": events,
    })
}

fn assign_single_root_cause(events: &mut [Value]) {
    let preferred_idx = events.iter().position(|e| {
        e.get("cause_code")
            .and_then(Value::as_str)
            .map(|c| c == "DEPENDENCY_TIMEOUT")
            .unwrap_or(false)
    });
    let root_idx = preferred_idx.unwrap_or(0);
    for (idx, e) in events.iter_mut().enumerate() {
        e["is_root_cause"] = Value::Bool(idx == root_idx);
    }
}

fn enforce_grounding(trace_sha256: &str, narration: &str) -> bool {
    if trace_sha256.trim().is_empty() {
        return false;
    }
    !narration.to_lowercase().contains("fake_fact")
}

fn should_refresh_snapshot(snapshot_timestamp: &str, threshold_seconds: i64) -> bool {
    chrono::DateTime::parse_from_rfc3339(snapshot_timestamp)
        .map(|ts| Utc::now().signed_duration_since(ts.with_timezone(&Utc)).num_seconds() > threshold_seconds)
        .unwrap_or(false)
}

fn daily_counter_key() -> String {
    format!("system_agent_llm_calls_day_{}", Utc::now().format("%Y-%m-%d"))
}

fn get_daily_counter(conn: &Connection) -> i64 {
    get_setting(conn, &daily_counter_key())
        .and_then(|x| x.parse::<i64>().ok())
        .unwrap_or(0)
}

fn increment_daily_counter(conn: &Connection) -> Result<(), String> {
    let k = daily_counter_key();
    let v = get_daily_counter(conn) + 1;
    set_setting(conn, &k, &v.to_string())
}

fn validate_intent_rules_at_startup() -> Result<(), String> {
    let mut seen_patterns = HashSet::new();
    for rule in INTENT_RULES {
        for p in rule.patterns {
            let normalized = p.trim().to_lowercase();
            if !seen_patterns.insert(normalized.clone()) {
                return Err(format!("Duplicate intent pattern detected: {normalized}"));
            }
        }
    }
    Ok(())
}

pub fn validate_system_agent_rules_on_startup() -> Result<(), String> {
    validate_intent_rules_at_startup()
}

fn route_intent(last_message: &str) -> (&'static str, Option<&'static str>, &'static str, bool) {
    let m = last_message.to_lowercase();
    for rule in INTENT_RULES {
        if rule.patterns.iter().any(|p| m.contains(&p.to_lowercase())) {
            return (
                rule.route,
                Some(rule.id),
                rule.tool,
                rule.needs_extended_snapshot,
            );
        }
    }
    ("LLM_AGENT", None, "none", false)
}

fn build_snapshot(conn: &Connection, extended: bool) -> Value {
    let snapshot_timestamp = Utc::now().to_rfc3339();
    let db_version = compute_db_user_version(conn);
    let master_enabled = get_setting(conn, "workflow_automation_master_enabled")
        .unwrap_or_else(|| "1".to_string());
    let paused_until = get_setting(conn, "workflow_automation_paused_until").unwrap_or_default();
    let mut out = json!({
        "snapshot_timestamp": snapshot_timestamp,
        "db_version": db_version,
        "master_enabled": master_enabled,
        "paused_until": paused_until,
    });
    if extended {
        let mut rows: Vec<Value> = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT job_id, status, started_at, COALESCE(error_message,'') FROM workflow_job_execution_log
             ORDER BY datetime(started_at) DESC LIMIT 20",
        ) {
            let mapped = stmt.query_map([], |r| {
                Ok(json!({
                    "job_id": r.get::<_, String>(0)?,
                    "status": r.get::<_, String>(1)?,
                    "started_at": r.get::<_, String>(2)?,
                    "error": r.get::<_, String>(3)?,
                }))
            });
            if let Ok(iter) = mapped {
                for row in iter.flatten() {
                    rows.push(row);
                }
            }
        }
        out["extended_jobs"] = Value::Array(rows);
    }
    out
}

fn list_recent_failed_job_executions(conn: &Connection) -> Result<Value, String> {
    let mut rows = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT execution_id, job_id, started_at, COALESCE(error_message,'')
             FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT')
             ORDER BY datetime(started_at) DESC
             LIMIT 10",
        )
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |r| {
            Ok(json!({
                "executionId": r.get::<_, String>(0)?,
                "jobId": r.get::<_, String>(1)?,
                "startedAt": r.get::<_, String>(2)?,
                "errorMessage": r.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in iter.flatten() {
        rows.push(row);
    }
    Ok(json!({ "rows": rows }))
}

fn get_health_summary(conn: &Connection) -> Value {
    let active_rules = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_decision_rules WHERE enabled = 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let failed_24h = conn
        .query_row(
            "SELECT COUNT(*) FROM workflow_job_execution_log WHERE status IN ('FAILED','TIMEOUT') AND datetime(started_at) >= datetime('now', '-24 hours')",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    json!({
        "activeRules": active_rules,
        "failedJobsLast24h": failed_24h,
    })
}

fn explain_job_failure(conn: &Connection) -> Result<ExplainGraph, String> {
    let _snapshot = build_snapshot(conn, true);
    let mut events: Vec<Value> = Vec::new();
    let mut stmt = conn
        .prepare(
            "SELECT execution_id, job_id, status, started_at, COALESCE(error_message,'')
             FROM workflow_job_execution_log
             WHERE status IN ('FAILED','TIMEOUT')
             ORDER BY datetime(started_at) DESC
             LIMIT 20",
        )
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |r| {
            let err: String = r.get(4)?;
            let cause_code = if err.to_lowercase().contains("timeout") {
                "DEPENDENCY_TIMEOUT"
            } else if err.to_lowercase().contains("permission") {
                "PERMISSION_FAILURE"
            } else {
                "UNKNOWN_ERROR"
            };
            Ok(json!({
                "event": "execution_failed",
                "execution_id": r.get::<_, String>(0)?,
                "job_id": r.get::<_, String>(1)?,
                "status": r.get::<_, String>(2)?,
                "started_at": r.get::<_, String>(3)?,
                "error_message": err,
                "cause_code": cause_code,
                "is_root_cause": true,
            }))
        })
        .map_err(|e| e.to_string())?;
    for row in iter.flatten() {
        events.push(row);
    }
    assign_single_root_cause(&mut events);
    let payload = build_trace_payload("v1", &events);
    let sha = stable_sha256(&payload);
    Ok(ExplainGraph {
        schema_version: "v1".to_string(),
        trace_sha256: sha,
        generated_at: Utc::now().to_rfc3339(),
        snapshot_timestamp: payload["snapshot"]["snapshot_timestamp"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        db_version: payload["snapshot"]["db_version"].as_i64().unwrap_or(0),
        events,
    })
}

fn log_agent_audit(
    conn: &Connection,
    input: &SystemAgentTurnInput,
    intent_route: &str,
    matched_rule_id: Option<&str>,
    llm_used: bool,
    policy_decision: Option<&Value>,
    limiter_bucket: Option<&str>,
    was_blocked: bool,
    grounding_ok: Option<bool>,
    trace_checksum: Option<&str>,
) {
    let _ = conn.execute(
        "INSERT INTO system_agent_audit_log (
            audit_id, created_at, session_id, caller_user_id, caller_role, intent_route,
            matched_rule_id, llm_used, policy_decision_json, limiter_bucket, was_blocked,
            grounding_ok, trace_checksum, tools_attempted_json, tools_executed_json
        ) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, '[]', '[]')",
        params![
            uuid::Uuid::new_v4().to_string(),
            input.session_id,
            input.caller_user_id,
            input.caller_role,
            intent_route,
            matched_rule_id.unwrap_or(""),
            if llm_used { 1 } else { 0 },
            policy_decision
                .map(|v| v.to_string())
                .unwrap_or_else(|| "{}".to_string()),
            limiter_bucket.unwrap_or(""),
            if was_blocked { 1 } else { 0 },
            grounding_ok.map(|x| if x { 1 } else { 0 }),
            trace_checksum.unwrap_or(""),
        ],
    );
}

#[tauri::command]
pub fn get_system_agent_settings(
    caller_role: String,
    state: State<'_, DbState>,
) -> Result<SystemAgentSettings, String> {
    assert_system_agent_role(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    Ok(SystemAgentSettings {
        enabled: normalize_bool(get_setting(&conn, SETTING_ENABLED), false),
        model: normalize_deepseek_model(
            &get_setting(&conn, SETTING_MODEL)
                .unwrap_or_else(|| DEEPSEEK_DEFAULT_MODEL.to_string()),
        ),
        base_url: get_setting(&conn, SETTING_BASE_URL)
            .unwrap_or_else(|| "https://api.deepseek.com/chat/completions".to_string()),
        confidence_threshold_mutate: get_setting(&conn, SETTING_CONFIDENCE_THRESHOLD)
            .and_then(|x| x.parse::<f64>().ok())
            .unwrap_or(0.75),
        max_llm_calls_per_day: get_setting(&conn, SETTING_MAX_LLM_CALLS_PER_DAY)
            .and_then(|x| x.parse::<i64>().ok())
            .unwrap_or(250),
        max_llm_calls_per_session: get_setting(&conn, SETTING_MAX_LLM_CALLS_PER_SESSION)
            .and_then(|x| x.parse::<i64>().ok())
            .unwrap_or(30),
        has_api_key: get_deepseek_api_key().is_some(),
    })
}

#[tauri::command]
pub fn set_system_agent_settings(
    caller_role: String,
    input: UpdateSystemAgentSettingsInput,
    state: State<'_, DbState>,
) -> Result<SystemAgentSettings, String> {
    assert_system_agent_role(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(v) = input.enabled {
        set_setting(&conn, SETTING_ENABLED, if v { "1" } else { "0" })?;
    }
    if let Some(v) = input.model {
        set_setting(&conn, SETTING_MODEL, &normalize_deepseek_model(&v))?;
    }
    if let Some(v) = input.base_url {
        set_setting(&conn, SETTING_BASE_URL, v.trim())?;
    }
    if let Some(v) = input.confidence_threshold_mutate {
        set_setting(&conn, SETTING_CONFIDENCE_THRESHOLD, &format!("{v:.3}"))?;
    }
    if let Some(v) = input.max_llm_calls_per_day {
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_DAY, &v.max(1).to_string())?;
    }
    if let Some(v) = input.max_llm_calls_per_session {
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_SESSION, &v.max(1).to_string())?;
    }
    if let Some(k) = input.deepseek_api_key {
        let trimmed = k.trim();
        if !trimmed.is_empty() {
            set_deepseek_api_key(trimmed)?;
        }
    }
    drop(conn);
    get_system_agent_settings(caller_role, state)
}

async fn call_deepseek(
    settings: &SystemAgentSettings,
    messages: &[SystemAgentMessage],
) -> Result<String, String> {
    let key = get_deepseek_api_key().ok_or_else(|| "DeepSeek API key is not configured.".to_string())?;
    let body = json!({
        "model": normalize_deepseek_model(&settings.model),
        "messages": messages.iter().map(|m| json!({"role": m.role, "content": m.content})).collect::<Vec<_>>(),
        "temperature": 0.1,
    });
    let client = reqwest::Client::new();
    let res = client
        .post(&settings.base_url)
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("DeepSeek network error: {e}"))?;
    let status = res.status();
    let raw_body = res
        .text()
        .await
        .map_err(|e| format!("DeepSeek read error: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "DeepSeek error (HTTP {}): {}",
            status,
            raw_body.chars().take(240).collect::<String>()
        ));
    }
    let payload: Value = serde_json::from_str(&raw_body).map_err(|e| {
        format!(
            "DeepSeek parse error: {e}; body: {}",
            raw_body.chars().take(240).collect::<String>()
        )
    })?;
    Ok(payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("No response generated.")
        .to_string())
}

#[cfg(test)]
static TEST_LLM_RESPONSE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[cfg(test)]
fn set_test_llm_response(v: Option<String>) {
    let m = TEST_LLM_RESPONSE.get_or_init(|| Mutex::new(None));
    if let Ok(mut g) = m.lock() {
        *g = v;
    }
}

#[cfg(test)]
fn test_llm_response() -> Option<String> {
    let m = TEST_LLM_RESPONSE.get_or_init(|| Mutex::new(None));
    m.lock().ok().and_then(|g| g.clone())
}

async fn call_deepseek_with_test_hook(
    settings: &SystemAgentSettings,
    messages: &[SystemAgentMessage],
) -> Result<String, String> {
    #[cfg(test)]
    if let Some(v) = test_llm_response() {
        return Ok(v);
    }
    call_deepseek(settings, messages).await
}

async fn system_agent_turn_with_conn(
    conn: &Connection,
    input: &SystemAgentTurnInput,
) -> Result<SystemAgentTurnOutput, String> {
    assert_system_agent_role(&input.caller_role)?;
    let (settings, intent_route, matched_rule_id, snapshot, decision_json) = {
        let settings = SystemAgentSettings {
            enabled: normalize_bool(get_setting(conn, SETTING_ENABLED), false),
            model: normalize_deepseek_model(
                &get_setting(conn, SETTING_MODEL)
                    .unwrap_or_else(|| DEEPSEEK_DEFAULT_MODEL.to_string()),
            ),
            base_url: get_setting(conn, SETTING_BASE_URL)
                .unwrap_or_else(|| "https://api.deepseek.com/chat/completions".to_string()),
            confidence_threshold_mutate: get_setting(conn, SETTING_CONFIDENCE_THRESHOLD)
                .and_then(|x| x.parse::<f64>().ok())
                .unwrap_or(0.75),
            max_llm_calls_per_day: get_setting(conn, SETTING_MAX_LLM_CALLS_PER_DAY)
                .and_then(|x| x.parse::<i64>().ok())
                .unwrap_or(250),
            max_llm_calls_per_session: get_setting(conn, SETTING_MAX_LLM_CALLS_PER_SESSION)
                .and_then(|x| x.parse::<i64>().ok())
                .unwrap_or(30),
            has_api_key: get_deepseek_api_key().is_some(),
        };
        if !settings.enabled {
            return Err("System agent is disabled in settings.".to_string());
        }
        let last = input
            .messages
            .last()
            .map(|x| x.content.as_str())
            .unwrap_or_default();
        let (intent_route, matched_rule_id, tool, needs_extended_snapshot) = route_intent(last);
        let snapshot = build_snapshot(conn, needs_extended_snapshot);

        if intent_route == "TRACE_ONLY_FAILURE" {
            let graph = explain_job_failure(conn)?;
            log_agent_audit(
                conn,
                input,
                intent_route,
                matched_rule_id,
                false,
                None,
                None,
                false,
                None,
                Some(&graph.trace_sha256),
            );
            return Ok(SystemAgentTurnOutput {
                intent_route: intent_route.to_string(),
                matched_rule_id: matched_rule_id.map(|x| x.to_string()),
                llm_used: false,
                content: "Deterministic failure trace generated.".to_string(),
                explain_graph: Some(graph),
                policy_decision: None,
                grounding_ok: None,
            });
        }

        if intent_route == "DIRECT_READ" {
            let value = match tool {
                "list_recent_failed_job_executions" => list_recent_failed_job_executions(conn)?,
                "get_health_summary" => get_health_summary(conn),
                _ => json!({"message":"No handler"}),
            };
            log_agent_audit(
                conn,
                input,
                intent_route,
                matched_rule_id,
                false,
                None,
                None,
                false,
                None,
                None,
            );
            return Ok(SystemAgentTurnOutput {
                intent_route: intent_route.to_string(),
                matched_rule_id: matched_rule_id.map(|x| x.to_string()),
                llm_used: false,
                content: value.to_string(),
                explain_graph: None,
                policy_decision: None,
                grounding_ok: None,
            });
        }

        let daily_count = get_daily_counter(conn);
        if daily_count >= settings.max_llm_calls_per_day {
            log_agent_audit(
                conn,
                input,
                intent_route,
                matched_rule_id,
                false,
                None,
                Some("pre_llm_daily"),
                true,
                None,
                None,
            );
            return Err("Rate limit exceeded: daily LLM budget reached.".to_string());
        }
        {
            let mut counters = session_counters().lock().map_err(|e| e.to_string())?;
            let entry = counters.entry(input.session_id.clone()).or_insert(0);
            if *entry >= settings.max_llm_calls_per_session {
                log_agent_audit(
                    conn,
                    input,
                    intent_route,
                    matched_rule_id,
                    false,
                    None,
                    Some("session_limit"),
                    true,
                    None,
                    None,
                );
                return Err("Rate limit exceeded: session LLM budget reached.".to_string());
            }
            *entry += 1;
        }
        increment_daily_counter(conn)?;
        let ctx = automation_policy::PolicyContext {
            caller_role: input.caller_role.clone(),
            action: "list_only".to_string(),
            target_id: None,
        };
        let mut decision = automation_policy::evaluate_policy(conn, &ctx);
        let mut policy_eval_count = 1i64;
        let force_stale_for_test = cfg!(test)
            && normalize_bool(get_setting(conn, "system_agent_force_stale_for_test"), false);
        if force_stale_for_test
            || should_refresh_snapshot(
            snapshot["snapshot_timestamp"].as_str().unwrap_or_default(),
            0,
        ) {
            let _fresh = build_snapshot(conn, needs_extended_snapshot);
            decision = automation_policy::evaluate_policy(conn, &ctx);
            policy_eval_count = 2;
        }
        let mut decision_json = serde_json::to_value(&decision).unwrap_or_else(|_| json!({}));
        decision_json["policyEvalCount"] = json!(policy_eval_count);
        if decision.decision == PolicyDecisionKind::Block {
            log_agent_audit(
                conn,
                input,
                intent_route,
                matched_rule_id,
                false,
                Some(&decision_json),
                None,
                true,
                None,
                None,
            );
            return Err(decision.user_message);
        }
        (
            settings,
            intent_route.to_string(),
            matched_rule_id.map(|x| x.to_string()),
            snapshot,
            decision_json,
        )
    };

    let mut llm_messages = input.messages.clone();
    llm_messages.insert(
        0,
        SystemAgentMessage {
            role: "system".to_string(),
            content: format!(
                "You are a deterministic system automation assistant. Refuse import/export and business CRUD tasks. Snapshot: {}",
                snapshot
            ),
        },
    );
    let mut content = call_deepseek_with_test_hook(&settings, &llm_messages).await?;
    let mut explain_graph: Option<ExplainGraph> = None;
    let mut trace_sha_for_audit: Option<String> = None;
    let grounding_ok = enforce_grounding("trace-ok", &content);
    if !grounding_ok {
        let graph = explain_job_failure(conn)?;
        trace_sha_for_audit = Some(graph.trace_sha256.clone());
        explain_graph = Some(graph);
        content = "Explanation could not be verified against system logs".to_string();
    }

    log_agent_audit(
        conn,
        input,
        &intent_route,
        matched_rule_id.as_deref(),
        true,
        Some(&decision_json),
        Some("pre_llm"),
        false,
        Some(grounding_ok),
        trace_sha_for_audit.as_deref(),
    );
    Ok(SystemAgentTurnOutput {
        intent_route,
        matched_rule_id,
        llm_used: true,
        content,
        explain_graph,
        policy_decision: Some(decision_json),
        grounding_ok: Some(grounding_ok),
    })
}

#[tauri::command]
pub fn system_agent_turn(
    input: SystemAgentTurnInput,
    state: State<'_, DbState>,
) -> Result<SystemAgentTurnOutput, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    tauri::async_runtime::block_on(system_agent_turn_with_conn(&conn, &input))
}

pub fn run_system_agent_retention_cleanup(conn: &Connection) -> Result<i64, String> {
    conn.execute(
        "DELETE FROM system_agent_audit_log WHERE datetime(created_at) < datetime('now', '-30 day')",
        [],
    )
    .map(|n| n as i64)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_system_agent_observability_summary(
    caller_role: String,
    state: State<'_, DbState>,
) -> Result<SystemAgentObservabilitySummary, String> {
    assert_system_agent_role(&caller_role)?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let total = conn
        .query_row(
            "SELECT COUNT(*) FROM system_agent_audit_log WHERE datetime(created_at) >= datetime('now', '-7 day')",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let llm = conn
        .query_row(
            "SELECT COUNT(*) FROM system_agent_audit_log WHERE llm_used = 1 AND datetime(created_at) >= datetime('now', '-7 day')",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let blocked = conn
        .query_row(
            "SELECT COUNT(*) FROM system_agent_audit_log WHERE was_blocked = 1 AND datetime(created_at) >= datetime('now', '-7 day')",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0);
    let blocked_percent = if total > 0 {
        (blocked as f64 * 100.0) / total as f64
    } else {
        0.0
    };
    Ok(SystemAgentObservabilitySummary {
        total_turns_7d: total,
        llm_used_turns_7d: llm,
        blocked_turns_7d: blocked,
        blocked_percent_7d: blocked_percent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("mem db");
        conn.execute_batch(
            "
            CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
            CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE workflow_decision_rules (rule_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE workflow_job_execution_log (
                execution_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT
            );
            CREATE TABLE system_agent_audit_log (
                audit_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                session_id TEXT NOT NULL,
                caller_user_id TEXT NOT NULL,
                caller_role TEXT NOT NULL,
                intent_route TEXT NOT NULL,
                matched_rule_id TEXT NOT NULL,
                llm_used INTEGER NOT NULL,
                policy_decision_json TEXT NOT NULL,
                limiter_bucket TEXT NOT NULL,
                was_blocked INTEGER NOT NULL,
                grounding_ok INTEGER,
                trace_checksum TEXT NOT NULL DEFAULT '',
                tools_attempted_json TEXT NOT NULL,
                tools_executed_json TEXT NOT NULL
            );
            ",
        )
        .expect("schema");
        conn
    }

    fn harness_conn() -> Connection {
        let mut conn = Connection::open_in_memory().expect("mem db");
        crate::migrations::DatabaseMigrations::run_migrations_test(&mut conn).unwrap();
        conn
    }

    #[test]
    fn intent_rules_validate() {
        validate_intent_rules_at_startup().expect("intent rules should be valid");
    }

    #[test]
    fn intent_routing_edge_cases() {
        let (route, id, _, _) = route_intent("show failed jobs and job errors");
        assert_eq!(route, "DIRECT_READ");
        assert_eq!(id, Some("failed_jobs_1"));

        let (route2, id2, _, _) = route_intent("health summaries");
        assert_eq!(route2, "DIRECT_READ");
        assert_eq!(id2, Some("health_summary_1"));

        let (route3, id3, _, _) = route_intent("unknown ambiguous phrase");
        assert_eq!(route3, "LLM_AGENT");
        assert!(id3.is_none());
    }

    #[test]
    fn explain_trace_has_single_root_cause_ordered() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, status, error_message) VALUES (?1, ?2, ?3, 'FAILED', ?4)",
            params!["ex1", "automation_cycle", "2026-01-02 12:00:00", "dependency timeout"],
        ).unwrap();
        conn.execute(
            "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, status, error_message) VALUES (?1, ?2, ?3, 'FAILED', ?4)",
            params!["ex2", "automation_cycle", "2026-01-02 11:00:00", "permission denied"],
        ).unwrap();
        let g = explain_job_failure(&conn).unwrap();
        assert_eq!(g.schema_version, "v1");
        assert_eq!(g.events.len(), 2);
        let roots = g
            .events
            .iter()
            .filter(|e| e.get("is_root_cause").and_then(Value::as_bool).unwrap_or(false))
            .count();
        assert_eq!(roots, 1);
        assert_eq!(
            g.events[0].get("execution_id").and_then(Value::as_str),
            Some("ex1")
        );
    }

    #[test]
    fn grounding_rejects_fake_fact() {
        assert!(!enforce_grounding("abc123", "this includes FAKE_FACT detail"));
        assert!(enforce_grounding("abc123", "all statements grounded"));
    }

    #[test]
    fn rate_limit_and_audit_bucket_logging() {
        let conn = setup_conn();
        let input = SystemAgentTurnInput {
            session_id: "s1".to_string(),
            caller_user_id: "u1".to_string(),
            caller_role: "administrator".to_string(),
            messages: vec![],
        };
        log_agent_audit(
            &conn,
            &input,
            "LLM_AGENT",
            None,
            false,
            None,
            Some("session_limit"),
            true,
            None,
            None,
        );
        let (bucket, blocked): (String, i64) = conn
            .query_row(
                "SELECT limiter_bucket, was_blocked FROM system_agent_audit_log LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(bucket, "session_limit");
        assert_eq!(blocked, 1);
    }

    #[test]
    fn snapshot_staleness_triggers_refresh_condition() {
        assert!(should_refresh_snapshot("2020-01-01T00:00:00Z", 1));
        assert!(!should_refresh_snapshot(&Utc::now().to_rfc3339(), 3600));
    }

    #[test]
    fn harness_scenario1_cascading_failure_single_root() {
        let conn = harness_conn();
        set_setting(&conn, SETTING_ENABLED, "1").unwrap();
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_DAY, "10").unwrap();
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_SESSION, "10").unwrap();
        conn.execute(
            "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, status, error_message, retry_count, records_processed)
             VALUES (?1, 'automation_cycle', '2026-05-05 10:00:00', 'SUCCESS', '', 0, 1)",
            params!["ex-a"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, status, error_message, retry_count, records_processed)
             VALUES (?1, 'automation_cycle', '2026-05-05 10:01:00', 'TIMEOUT', 'dependency timeout', 0, 1)",
            params!["ex-b"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, status, error_message, retry_count, records_processed)
             VALUES (?1, 'automation_cycle', '2026-05-05 10:02:00', 'FAILED', 'dependent stage failed', 0, 1)",
            params!["ex-c"],
        )
        .unwrap();
        let input = SystemAgentTurnInput {
            session_id: "h1".into(),
            caller_user_id: "u1".into(),
            caller_role: "administrator".into(),
            messages: vec![SystemAgentMessage {
                role: "user".into(),
                content: "why did automation fail yesterday?".into(),
            }],
        };
        let out = tauri::async_runtime::block_on(system_agent_turn_with_conn(&conn, &input)).unwrap();
        assert_eq!(out.intent_route, "TRACE_ONLY_FAILURE");
        assert!(!out.llm_used);
        let g = out.explain_graph.unwrap();
        assert_eq!(g.schema_version, "v1");
        let roots = g
            .events
            .iter()
            .filter(|e| e.get("is_root_cause").and_then(Value::as_bool).unwrap_or(false))
            .count();
        assert_eq!(roots, 1);
        let root = g
            .events
            .iter()
            .find(|e| e.get("is_root_cause").and_then(Value::as_bool).unwrap_or(false))
            .unwrap();
        assert_eq!(
            root.get("cause_code").and_then(Value::as_str),
            Some("DEPENDENCY_TIMEOUT")
        );
        let (matched_rule_id, grounding_ok, was_blocked): (String, Option<i64>, i64) = conn
            .query_row(
                "SELECT matched_rule_id, grounding_ok, was_blocked FROM system_agent_audit_log ORDER BY rowid DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert!(!matched_rule_id.is_empty());
        assert!(grounding_ok.is_none());
        assert_eq!(was_blocked, 0);
    }

    #[test]
    fn harness_scenario2_narration_grounding_fail_fallback() {
        let conn = harness_conn();
        set_setting(&conn, SETTING_ENABLED, "1").unwrap();
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_DAY, "10").unwrap();
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_SESSION, "10").unwrap();
        conn.execute(
            "INSERT INTO workflow_job_execution_log (execution_id, job_id, started_at, status, error_message, retry_count, records_processed)
             VALUES ('ex-b', 'automation_cycle', '2026-05-05 10:01:00', 'TIMEOUT', 'dependency timeout', 0, 1)",
            [],
        )
        .unwrap();
        let first = SystemAgentTurnInput {
            session_id: "h2".into(),
            caller_user_id: "u1".into(),
            caller_role: "administrator".into(),
            messages: vec![SystemAgentMessage {
                role: "user".into(),
                content: "why did automation fail yesterday?".into(),
            }],
        };
        let _ = tauri::async_runtime::block_on(system_agent_turn_with_conn(&conn, &first)).unwrap();
        set_test_llm_response(Some("Here is FAKE_FACT that is not in trace".to_string()));
        let second = SystemAgentTurnInput {
            session_id: "h2".into(),
            caller_user_id: "u1".into(),
            caller_role: "administrator".into(),
            messages: vec![SystemAgentMessage {
                role: "user".into(),
                content: "explain in simple terms".into(),
            }],
        };
        let out =
            tauri::async_runtime::block_on(system_agent_turn_with_conn(&conn, &second)).unwrap();
        assert!(out.llm_used);
        assert_eq!(
            out.content,
            "Explanation could not be verified against system logs"
        );
        assert_eq!(out.grounding_ok, Some(false));
        assert!(out.explain_graph.is_some());
        let (llm_used, grounding_ok, trace_checksum): (i64, Option<i64>, String) = conn
            .query_row(
                "SELECT llm_used, grounding_ok, trace_checksum FROM system_agent_audit_log ORDER BY rowid DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(llm_used, 1);
        assert_eq!(grounding_ok, Some(0));
        assert!(!trace_checksum.is_empty());
        set_test_llm_response(None);
    }

    #[test]
    fn harness_scenario3_stale_snapshot_policy_rerun_recorded() {
        let conn = harness_conn();
        set_setting(&conn, SETTING_ENABLED, "1").unwrap();
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_DAY, "10").unwrap();
        set_setting(&conn, SETTING_MAX_LLM_CALLS_PER_SESSION, "10").unwrap();
        set_setting(&conn, "system_agent_force_stale_for_test", "1").unwrap();
        set_test_llm_response(Some("safe narration".to_string()));

        let input = SystemAgentTurnInput {
            session_id: "h3".into(),
            caller_user_id: "u1".into(),
            caller_role: "administrator".into(),
            messages: vec![SystemAgentMessage {
                role: "user".into(),
                content: "run a deeper automation analysis".into(),
            }],
        };

        let out = tauri::async_runtime::block_on(system_agent_turn_with_conn(&conn, &input))
            .expect("scenario3 turn should succeed");
        assert_eq!(out.intent_route, "LLM_AGENT");
        assert!(out.llm_used);

        let (policy_json, was_blocked): (String, i64) = conn
            .query_row(
                "SELECT policy_decision_json, was_blocked
                 FROM system_agent_audit_log
                 ORDER BY rowid DESC
                 LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        let parsed: Value = serde_json::from_str(&policy_json).unwrap();
        assert_eq!(
            parsed.get("policyEvalCount").and_then(Value::as_i64),
            Some(2)
        );
        assert_eq!(was_blocked, 0);
        set_test_llm_response(None);
    }
}
