//! Account lockout state machine. Failed-login attempts are tallied in memory and
//! mirrored into `auth_failed_attempts` for audit. After
//! [`SecurityPolicy::lockout_threshold`] failures inside
//! [`SecurityPolicy::lockout_window_minutes`] the account is locked for
//! [`SecurityPolicy::lockout_duration_minutes`].

use chrono::{DateTime, Duration, Utc};
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::sync::Mutex;

use crate::services::user_activity_audit::{log_activity_with_severity, AuditSeverity};

/// Default policy used when `app_settings` is missing or malformed.
pub const DEFAULT_LOCKOUT_THRESHOLD: u32 = 5;
pub const DEFAULT_LOCKOUT_WINDOW_MINUTES: i64 = 15;
pub const DEFAULT_LOCKOUT_DURATION_MINUTES: i64 = 30;
pub const DEFAULT_IDLE_TIMEOUT_MINUTES: i64 = 30;

const SETTINGS_KEY_THRESHOLD: &str = "auth.lockout_threshold";
const SETTINGS_KEY_WINDOW: &str = "auth.lockout_window_minutes";
const SETTINGS_KEY_DURATION: &str = "auth.lockout_duration_minutes";
const SETTINGS_KEY_IDLE: &str = "auth.idle_timeout_minutes";

/// Live security policy, reloaded from `app_settings` on every login attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityPolicy {
    pub lockout_threshold: u32,
    pub lockout_window_minutes: i64,
    pub lockout_duration_minutes: i64,
    pub idle_timeout_minutes: i64,
}

impl Default for SecurityPolicy {
    fn default() -> Self {
        SecurityPolicy {
            lockout_threshold: DEFAULT_LOCKOUT_THRESHOLD,
            lockout_window_minutes: DEFAULT_LOCKOUT_WINDOW_MINUTES,
            lockout_duration_minutes: DEFAULT_LOCKOUT_DURATION_MINUTES,
            idle_timeout_minutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
        }
    }
}

impl SecurityPolicy {
    pub fn load(conn: &Connection) -> SecurityPolicy {
        let mut p = SecurityPolicy::default();
        if let Some(v) = read_setting_u32(conn, SETTINGS_KEY_THRESHOLD) {
            if v > 0 {
                p.lockout_threshold = v;
            }
        }
        if let Some(v) = read_setting_i64(conn, SETTINGS_KEY_WINDOW) {
            if v > 0 {
                p.lockout_window_minutes = v;
            }
        }
        if let Some(v) = read_setting_i64(conn, SETTINGS_KEY_DURATION) {
            if v > 0 {
                p.lockout_duration_minutes = v;
            }
        }
        if let Some(v) = read_setting_i64(conn, SETTINGS_KEY_IDLE) {
            if v > 0 {
                p.idle_timeout_minutes = v;
            }
        }
        p
    }

    pub fn save(conn: &Connection, p: &SecurityPolicy) -> Result<(), String> {
        upsert_setting(
            conn,
            SETTINGS_KEY_THRESHOLD,
            &p.lockout_threshold.to_string(),
        )?;
        upsert_setting(
            conn,
            SETTINGS_KEY_WINDOW,
            &p.lockout_window_minutes.to_string(),
        )?;
        upsert_setting(
            conn,
            SETTINGS_KEY_DURATION,
            &p.lockout_duration_minutes.to_string(),
        )?;
        upsert_setting(conn, SETTINGS_KEY_IDLE, &p.idle_timeout_minutes.to_string())?;
        Ok(())
    }
}

fn read_setting_u32(conn: &Connection, key: &str) -> Option<u32> {
    read_setting_str(conn, key).and_then(|s| s.parse::<u32>().ok())
}

fn read_setting_i64(conn: &Connection, key: &str) -> Option<i64> {
    read_setting_str(conn, key).and_then(|s| s.parse::<i64>().ok())
}

fn read_setting_str(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
}

fn upsert_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![key, value],
    )
    .map_err(|e| format!("app_settings upsert: {e}"))?;
    Ok(())
}

#[derive(Debug, Clone, Copy)]
struct AttemptState {
    failures: u32,
    first_failure_at: DateTime<Utc>,
    locked_until: Option<DateTime<Utc>>,
}

impl AttemptState {
    fn fresh(now: DateTime<Utc>) -> Self {
        Self {
            failures: 0,
            first_failure_at: now,
            locked_until: None,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockoutStatus {
    pub locked: bool,
    pub failures: u32,
    pub locked_until_rfc3339: Option<String>,
    pub seconds_until_unlock: Option<i64>,
}

/// In-memory attempt counters keyed by normalized user id, kept in sync with
/// `auth_lockout_state` so lockout survives process restarts.
#[derive(Debug, Default)]
pub struct LockoutState {
    inner: Mutex<HashMap<String, AttemptState>>,
}

fn db_lockout_row_exists(conn: &Connection, key: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM auth_lockout_state WHERE user_id = ?1 LIMIT 1",
        params![key],
        |r| r.get::<_, i32>(0),
    )
    .optional()
    .ok()
    .flatten()
    .is_some()
}

fn delete_db_lockout(conn: &Connection, key: &str) {
    let _ = conn.execute(
        "DELETE FROM auth_lockout_state WHERE user_id = ?1",
        params![key],
    );
}

fn persist_db_lockout(conn: &Connection, key: &str, state: &AttemptState) {
    let locked = state.locked_until.map(|t| t.to_rfc3339());
    let _ = conn.execute(
        "INSERT INTO auth_lockout_state (user_id, failure_count, window_started_at, locked_until, updated_at) \
         VALUES (?1, ?2, ?3, ?4, datetime('now')) \
         ON CONFLICT(user_id) DO UPDATE SET \
           failure_count = excluded.failure_count, \
           window_started_at = excluded.window_started_at, \
           locked_until = excluded.locked_until, \
           updated_at = datetime('now')",
        params![
            key,
            state.failures as i64,
            state.first_failure_at.to_rfc3339(),
            locked,
        ],
    );
}

fn persist_or_clear_db(conn: &Connection, key: &str, state: Option<&AttemptState>) {
    match state {
        None => delete_db_lockout(conn, key),
        Some(st) if st.failures == 0 && st.locked_until.is_none() => delete_db_lockout(conn, key),
        Some(st) => persist_db_lockout(conn, key, st),
    }
}

fn parse_rfc3339_utc(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s.trim())
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

/// Loads lockout state from SQLite. Deletes expired rows (stale window or past lock).
fn load_parsed_db(
    conn: &Connection,
    key: &str,
    policy: &SecurityPolicy,
    now: DateTime<Utc>,
) -> Option<AttemptState> {
    let row: Result<(i64, String, Option<String>), rusqlite::Error> = conn.query_row(
        "SELECT failure_count, window_started_at, locked_until FROM auth_lockout_state WHERE user_id = ?1",
        params![key],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    );
    let (failure_count, ws_raw, lu_raw) = match row {
        Ok(t) => t,
        Err(rusqlite::Error::QueryReturnedNoRows) => return None,
        Err(e) => {
            log::warn!(
                target: "import_manager::auth",
                "event=lockout_db_read_error user_id={} err={}",
                key,
                e
            );
            delete_db_lockout(conn, key);
            return None;
        }
    };
    let window_start = match parse_rfc3339_utc(&ws_raw) {
        Some(t) => t,
        None => {
            delete_db_lockout(conn, key);
            return None;
        }
    };
    let locked_until = lu_raw.as_deref().and_then(parse_rfc3339_utc);
    let window = Duration::minutes(policy.lockout_window_minutes);
    let failures = failure_count.max(0).min(u32::MAX as i64) as u32;

    if let Some(lu) = locked_until {
        if lu > now {
            return Some(AttemptState {
                failures,
                first_failure_at: window_start,
                locked_until: Some(lu),
            });
        }
    }

    if now - window_start > window {
        delete_db_lockout(conn, key);
        return None;
    }

    Some(AttemptState {
        failures,
        first_failure_at: window_start,
        locked_until: locked_until.filter(|&lu| lu > now),
    })
}

fn hydrate_from_database(
    inner: &Mutex<HashMap<String, AttemptState>>,
    conn: &Connection,
    key: &str,
    policy: &SecurityPolicy,
    now: DateTime<Utc>,
) {
    let parsed = load_parsed_db(conn, key, policy, now);
    let mut guard = inner.lock().expect("lockout state mutex poisoned");
    match parsed {
        Some(state) => {
            guard.insert(key.to_string(), state);
        }
        None => {
            if !db_lockout_row_exists(conn, key) {
                guard.remove(key);
            }
        }
    }
}

impl LockoutState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `Err(seconds_until_unlock)` when the account is currently locked.
    pub fn check_locked(
        &self,
        conn: &Connection,
        user_id: &str,
        policy: &SecurityPolicy,
    ) -> Result<(), i64> {
        let key = user_id.trim().to_lowercase();
        let now = Utc::now();
        hydrate_from_database(&self.inner, conn, &key, policy, now);
        let mut guard = self.inner.lock().expect("lockout state mutex poisoned");
        if let Some(state) = guard.get_mut(&key) {
            if let Some(lock_until) = state.locked_until {
                if lock_until > now {
                    let secs = (lock_until - now).num_seconds().max(1);
                    return Err(secs);
                }
                state.locked_until = None;
                state.failures = 0;
            }
            let window = Duration::minutes(policy.lockout_window_minutes);
            if now - state.first_failure_at > window {
                *state = AttemptState::fresh(now);
            }
        }
        let snap = guard.get(&key).copied();
        drop(guard);
        persist_or_clear_db(conn, &key, snap.as_ref());
        Ok(())
    }

    /// Records a failed login attempt; returns the resulting status (locked or
    /// remaining attempts). Idempotent if the account is already locked.
    pub fn record_failure(
        &self,
        conn: &Connection,
        user_id: &str,
        reason: &str,
        source: Option<&str>,
        policy: &SecurityPolicy,
    ) -> LockoutStatus {
        let key = user_id.trim().to_lowercase();
        let now = Utc::now();
        hydrate_from_database(&self.inner, conn, &key, policy, now);
        let mut newly_locked = false;
        let snapshot = {
            let mut guard = self.inner.lock().expect("lockout state mutex poisoned");
            let entry = guard
                .entry(key.clone())
                .or_insert_with(|| AttemptState::fresh(now));
            if let Some(lu) = entry.locked_until {
                if lu > now {
                    let st = *entry;
                    drop(guard);
                    let _ = conn.execute(
                        "INSERT INTO auth_failed_attempts (user_id, attempted_at, reason, source) VALUES (?1, datetime('now'), ?2, ?3)",
                        params![user_id.trim(), reason, source],
                    );
                    persist_or_clear_db(conn, &key, Some(&st));
                    return attempt_status(&st, now);
                }
            }
            let window = Duration::minutes(policy.lockout_window_minutes);
            if now - entry.first_failure_at > window {
                *entry = AttemptState::fresh(now);
            }
            entry.failures = entry.failures.saturating_add(1);
            if entry.failures >= policy.lockout_threshold && entry.locked_until.is_none() {
                entry.locked_until = Some(now + Duration::minutes(policy.lockout_duration_minutes));
                newly_locked = true;
            }
            *entry
        };

        let _ = conn.execute(
            "INSERT INTO auth_failed_attempts (user_id, attempted_at, reason, source) VALUES (?1, datetime('now'), ?2, ?3)",
            params![user_id.trim(), reason, source],
        );

        persist_or_clear_db(conn, &key, Some(&snapshot));
        let status = attempt_status(&snapshot, now);

        if newly_locked {
            let detail = serde_json::json!({
                "userId": user_id.trim(),
                "lockedForMinutes": policy.lockout_duration_minutes,
                "thresholdHit": policy.lockout_threshold,
            })
            .to_string();
            log_activity_with_severity(
                conn,
                Some(user_id.trim()),
                "auth.lockout_triggered",
                None,
                None,
                Some(&detail),
                "warning",
                AuditSeverity::Critical,
            );
            log::warn!(
                target: "import_manager::auth",
                "event=auth.lockout_triggered user_id={} threshold={} duration_min={}",
                user_id.trim(),
                policy.lockout_threshold,
                policy.lockout_duration_minutes
            );
        }
        status
    }

    /// Clears all counters for `user_id` after a successful login.
    pub fn record_success(&self, conn: &Connection, user_id: &str) {
        let key = user_id.trim().to_lowercase();
        if let Ok(mut guard) = self.inner.lock() {
            guard.remove(&key);
        }
        delete_db_lockout(conn, &key);
    }

    /// Manual reset (admin override).
    pub fn reset(&self, conn: &Connection, user_id: &str) {
        self.record_success(conn, user_id);
    }

    pub fn status(
        &self,
        conn: &Connection,
        user_id: &str,
        policy: &SecurityPolicy,
    ) -> LockoutStatus {
        let key = user_id.trim().to_lowercase();
        let now = Utc::now();
        hydrate_from_database(&self.inner, conn, &key, policy, now);
        let mut guard = self.inner.lock().expect("lockout state mutex poisoned");
        let out = match guard.get_mut(&key) {
            None => LockoutStatus {
                locked: false,
                failures: 0,
                locked_until_rfc3339: None,
                seconds_until_unlock: None,
            },
            Some(state_ref) => {
                let window = Duration::minutes(policy.lockout_window_minutes);
                if now - state_ref.first_failure_at > window
                    && state_ref.locked_until.map(|t| t <= now).unwrap_or(true)
                {
                    *state_ref = AttemptState::fresh(now);
                }
                attempt_status(state_ref, now)
            }
        };
        let snap = guard.get(&key).copied();
        drop(guard);
        persist_or_clear_db(conn, &key, snap.as_ref());
        out
    }
}

fn attempt_status(state: &AttemptState, now: DateTime<Utc>) -> LockoutStatus {
    match state.locked_until {
        Some(t) if t > now => LockoutStatus {
            locked: true,
            failures: state.failures,
            locked_until_rfc3339: Some(t.to_rfc3339()),
            seconds_until_unlock: Some((t - now).num_seconds().max(1)),
        },
        _ => LockoutStatus {
            locked: false,
            failures: state.failures,
            locked_until_rfc3339: None,
            seconds_until_unlock: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE auth_failed_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reason TEXT,
                source TEXT
            );
            CREATE TABLE user_activity_audit_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                action_name TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details_json TEXT,
                status TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'INFO'
            );
            CREATE TABLE auth_lockout_state (
                user_id TEXT PRIMARY KEY NOT NULL,
                failure_count INTEGER NOT NULL DEFAULT 0,
                window_started_at TEXT NOT NULL,
                locked_until TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn locks_after_threshold_failures() {
        let conn = setup_conn();
        let state = LockoutState::new();
        let policy = SecurityPolicy {
            lockout_threshold: 3,
            lockout_window_minutes: 5,
            lockout_duration_minutes: 1,
            idle_timeout_minutes: 30,
        };
        for _ in 0..2 {
            state.record_failure(&conn, "u1", "bad_password", None, &policy);
            assert!(state.check_locked(&conn, "u1", &policy).is_ok());
        }
        let s = state.record_failure(&conn, "u1", "bad_password", None, &policy);
        assert!(s.locked, "should be locked after 3 failures");
        let err = state.check_locked(&conn, "u1", &policy).unwrap_err();
        assert!(err > 0);
    }

    #[test]
    fn record_success_clears_counter() {
        let conn = setup_conn();
        let state = LockoutState::new();
        let policy = SecurityPolicy::default();
        state.record_failure(&conn, "u2", "bad_password", None, &policy);
        state.record_success(&conn, "u2");
        let st = state.status(&conn, "u2", &policy);
        assert_eq!(st.failures, 0);
        assert!(!st.locked);
    }

    #[test]
    fn lockout_survives_new_lockout_state_instance() {
        let conn = setup_conn();
        let policy = SecurityPolicy {
            lockout_threshold: 2,
            lockout_window_minutes: 60,
            lockout_duration_minutes: 60,
            idle_timeout_minutes: 30,
        };
        {
            let state = LockoutState::new();
            state.record_failure(&conn, "u-persist", "bad_password", None, &policy);
            let s = state.record_failure(&conn, "u-persist", "bad_password", None, &policy);
            assert!(s.locked);
        }
        let state2 = LockoutState::new();
        let err = state2
            .check_locked(&conn, "u-persist", &policy)
            .unwrap_err();
        assert!(err > 0);
    }

    #[test]
    fn policy_round_trips_through_app_settings() {
        let conn = setup_conn();
        let updated = SecurityPolicy {
            lockout_threshold: 7,
            lockout_window_minutes: 22,
            lockout_duration_minutes: 44,
            idle_timeout_minutes: 12,
        };
        SecurityPolicy::save(&conn, &updated).unwrap();
        let loaded = SecurityPolicy::load(&conn);
        assert_eq!(loaded.lockout_threshold, 7);
        assert_eq!(loaded.lockout_window_minutes, 22);
        assert_eq!(loaded.lockout_duration_minutes, 44);
        assert_eq!(loaded.idle_timeout_minutes, 12);
    }

    #[test]
    fn loads_defaults_when_settings_missing() {
        let conn = setup_conn();
        let p = SecurityPolicy::load(&conn);
        assert_eq!(p.lockout_threshold, DEFAULT_LOCKOUT_THRESHOLD);
        assert_eq!(p.lockout_window_minutes, DEFAULT_LOCKOUT_WINDOW_MINUTES);
        assert_eq!(p.lockout_duration_minutes, DEFAULT_LOCKOUT_DURATION_MINUTES);
        assert_eq!(p.idle_timeout_minutes, DEFAULT_IDLE_TIMEOUT_MINUTES);
    }
}
