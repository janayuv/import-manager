//! Admin credential storage and password rotation.
//!
//! The desktop admin password lives in `app_settings.auth.admin_password_hash`
//! once an admin rotates it through `change_admin_password`. Until then the
//! compile-time hash baked by [`build.rs`] is used. Passwords are hashed with
//! Argon2id; bcrypt verification is kept as a fallback for the compiled-in
//! default (so `Jana` can log in on first launch).

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rusqlite::{params, Connection, OptionalExtension};

const APP_SETTING_ADMIN_HASH: &str = "auth.admin_password_hash";
const SETTINGS_KEY_PASSWORD_HISTORY_DEPTH: &str = "auth.password_history_depth";

/// Allowed range for [`read_password_history_depth`] / [`write_password_history_depth`].
pub const PASSWORD_HISTORY_DEPTH_MIN: usize = 1;
pub const PASSWORD_HISTORY_DEPTH_MAX: usize = 24;

/// Minimum password length enforced by [`enforce_password_policy`].
pub const PASSWORD_MIN_LEN: usize = 12;

/// Password policy violations returned by [`enforce_password_policy`]. Surfaced
/// to the UI verbatim so users know which rule failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PasswordPolicyError {
    TooShort,
    MissingUppercase,
    MissingLowercase,
    MissingDigit,
    MissingSymbol,
    ContainsWhitespace,
}

impl std::fmt::Display for PasswordPolicyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let msg = match self {
            PasswordPolicyError::TooShort => {
                "Password must be at least 12 characters long."
            }
            PasswordPolicyError::MissingUppercase => {
                "Password must contain at least one uppercase letter."
            }
            PasswordPolicyError::MissingLowercase => {
                "Password must contain at least one lowercase letter."
            }
            PasswordPolicyError::MissingDigit => {
                "Password must contain at least one digit."
            }
            PasswordPolicyError::MissingSymbol => {
                "Password must contain at least one symbol (e.g. !@#$%)."
            }
            PasswordPolicyError::ContainsWhitespace => {
                "Password must not contain whitespace characters."
            }
        };
        f.write_str(msg)
    }
}

/// Validates the new password against the standard policy. Returns the first
/// failing rule.
pub fn enforce_password_policy(password: &str) -> Result<(), PasswordPolicyError> {
    if password.chars().count() < PASSWORD_MIN_LEN {
        return Err(PasswordPolicyError::TooShort);
    }
    if password.chars().any(|c| c.is_whitespace()) {
        return Err(PasswordPolicyError::ContainsWhitespace);
    }
    let mut has_upper = false;
    let mut has_lower = false;
    let mut has_digit = false;
    let mut has_symbol = false;
    for c in password.chars() {
        if c.is_ascii_uppercase() {
            has_upper = true;
        } else if c.is_ascii_lowercase() {
            has_lower = true;
        } else if c.is_ascii_digit() {
            has_digit = true;
        } else if !c.is_alphanumeric() {
            has_symbol = true;
        }
    }
    if !has_upper {
        return Err(PasswordPolicyError::MissingUppercase);
    }
    if !has_lower {
        return Err(PasswordPolicyError::MissingLowercase);
    }
    if !has_digit {
        return Err(PasswordPolicyError::MissingDigit);
    }
    if !has_symbol {
        return Err(PasswordPolicyError::MissingSymbol);
    }
    Ok(())
}

/// Returns the active admin password hash: the rotated value from
/// `app_settings` when present, falling back to the supplied compile-time hash.
pub fn active_admin_hash(conn: &Connection, fallback: &str) -> String {
    if let Some(stored) = read_app_setting(conn, APP_SETTING_ADMIN_HASH) {
        let trimmed = stored.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    fallback.to_string()
}

/// Hashes `password` with Argon2id (default cost parameters).
pub fn hash_password_argon2id(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("argon2 hash failed: {e}"))?;
    Ok(hash.to_string())
}

/// Verifies a plaintext password against either an Argon2 PHC string or a
/// bcrypt hash (legacy / compile-time admin). Errors are normalized to a stable
/// string so the IPC layer can return a consistent code.
pub fn verify_password(password: &str, stored_hash: &str) -> Result<bool, String> {
    let trimmed = stored_hash.trim();
    if trimmed.is_empty() {
        return Err("password verification: empty hash".to_string());
    }
    if trimmed.starts_with("$argon2") {
        let parsed =
            PasswordHash::new(trimmed).map_err(|e| format!("argon2 parse failed: {e}"))?;
        return Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok());
    }
    if trimmed.starts_with("$2") {
        return bcrypt::verify(password, trimmed).map_err(|e| format!("bcrypt verify: {e}"));
    }
    Err(format!(
        "password verification: unsupported hash format ({} chars)",
        trimmed.len()
    ))
}

/// Persists `new_hash` in `app_settings` and records the previous hash in
/// `auth_password_history` (best-effort, not transactional).
pub fn persist_admin_hash(
    conn: &Connection,
    user_id: &str,
    new_hash: &str,
    previous_hash: Option<&str>,
) -> Result<(), String> {
    if let Some(prev) = previous_hash {
        if !prev.is_empty() {
            let algorithm = if prev.starts_with("$argon2") {
                "argon2id"
            } else if prev.starts_with("$2") {
                "bcrypt"
            } else {
                "unknown"
            };
            let _ = conn.execute(
                "INSERT INTO auth_password_history (user_id, password_hash, algorithm) VALUES (?1, ?2, ?3)",
                params![user_id.trim(), prev, algorithm],
            );
        }
    }
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![APP_SETTING_ADMIN_HASH, new_hash],
    )
    .map_err(|e| format!("persist admin hash: {e}"))?;
    Ok(())
}

/// How many previous password hashes to check against when rotating (default 5, clamped to the allowed range).
pub fn read_password_history_depth(conn: &Connection) -> usize {
    let raw = read_app_setting(conn, SETTINGS_KEY_PASSWORD_HISTORY_DEPTH);
    let n = raw
        .as_deref()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(5);
    (n.clamp(
        PASSWORD_HISTORY_DEPTH_MIN as i64,
        PASSWORD_HISTORY_DEPTH_MAX as i64,
    )) as usize
}

/// Persists password history depth in `app_settings` (clamped to the allowed range).
pub fn write_password_history_depth(conn: &Connection, depth: usize) -> Result<(), String> {
    let d = depth
        .clamp(PASSWORD_HISTORY_DEPTH_MIN, PASSWORD_HISTORY_DEPTH_MAX)
        .to_string();
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![SETTINGS_KEY_PASSWORD_HISTORY_DEPTH, d],
    )
    .map_err(|e| format!("password history depth: {e}"))?;
    Ok(())
}

/// True if `candidate_password` matches any of the last `depth` rows in `auth_password_history`.
pub fn new_password_reuses_history(
    conn: &Connection,
    user_id: &str,
    candidate_password: &str,
    depth: usize,
) -> Result<bool, String> {
    if depth == 0 {
        return Ok(false);
    }
    let depth_i = depth as i64;
    let mut stmt = conn
        .prepare(
            "SELECT password_hash FROM auth_password_history WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(params![user_id.trim(), depth_i], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    while let Some(row) = rows.next() {
        let hash = row.map_err(|e| e.to_string())?;
        if verify_password(candidate_password, &hash).unwrap_or(false) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn read_app_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
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
            CREATE TABLE auth_password_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                algorithm TEXT NOT NULL,
                replaced_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn policy_accepts_strong_password() {
        enforce_password_policy("StrongPass!1").unwrap();
    }

    #[test]
    fn policy_rejects_short_password() {
        let err = enforce_password_policy("Sh0rt!").unwrap_err();
        assert!(matches!(err, PasswordPolicyError::TooShort));
    }

    #[test]
    fn policy_rejects_missing_classes() {
        assert!(matches!(
            enforce_password_policy("alllowercase!1").unwrap_err(),
            PasswordPolicyError::MissingUppercase
        ));
        assert!(matches!(
            enforce_password_policy("ALLUPPERCASE!1").unwrap_err(),
            PasswordPolicyError::MissingLowercase
        ));
        assert!(matches!(
            enforce_password_policy("NoNumbersHere!").unwrap_err(),
            PasswordPolicyError::MissingDigit
        ));
        assert!(matches!(
            enforce_password_policy("NoSymbolsHere1").unwrap_err(),
            PasswordPolicyError::MissingSymbol
        ));
        assert!(matches!(
            enforce_password_policy("Has Whitespace!1").unwrap_err(),
            PasswordPolicyError::ContainsWhitespace
        ));
    }

    #[test]
    fn argon2_round_trip() {
        let hash = hash_password_argon2id("StrongPass!1").unwrap();
        assert!(hash.starts_with("$argon2"));
        assert!(verify_password("StrongPass!1", &hash).unwrap());
        assert!(!verify_password("WrongPass!1!", &hash).unwrap());
    }

    #[test]
    fn bcrypt_fallback_verifies() {
        let bcrypt_hash =
            "$2b$12$GiJ5u10SABuUkJh9yI4x7unxEXasQ.j9KXMcZG/NoZWQGGJ6OPLLq".to_string();
        assert!(verify_password("inzi@123$%", &bcrypt_hash).unwrap());
        assert!(!verify_password("nope", &bcrypt_hash).unwrap());
    }

    #[test]
    fn active_admin_hash_prefers_app_setting() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)",
            params![APP_SETTING_ADMIN_HASH, "$argon2id$stored"],
        )
        .unwrap();
        let active = active_admin_hash(&conn, "$2b$12$fallback");
        assert_eq!(active, "$argon2id$stored");
    }

    #[test]
    fn active_admin_hash_falls_back_when_missing() {
        let conn = setup_conn();
        let active = active_admin_hash(&conn, "$2b$12$fallback");
        assert_eq!(active, "$2b$12$fallback");
    }

    #[test]
    fn new_password_reuses_history_detects_match() {
        let conn = setup_conn();
        let h = hash_password_argon2id("UniqueOld!9zz").unwrap();
        conn.execute(
            "INSERT INTO auth_password_history (user_id, password_hash, algorithm) VALUES (?1, ?2, 'argon2id')",
            params!["admin-001", h],
        )
        .unwrap();
        assert!(new_password_reuses_history(&conn, "admin-001", "UniqueOld!9zz", 5).unwrap());
        assert!(!new_password_reuses_history(&conn, "admin-001", "OtherNew!9aa", 5).unwrap());
    }

    #[test]
    fn persist_admin_hash_records_history() {
        let conn = setup_conn();
        persist_admin_hash(&conn, "admin-001", "$argon2id$new", Some("$2b$12$old")).unwrap();
        let stored: String = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![APP_SETTING_ADMIN_HASH],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored, "$argon2id$new");
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM auth_password_history",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }
}
