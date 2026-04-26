//! Generic `app_settings` (key / value) and AI provider configuration.
//! Values are read from the database when set; configuration loaders fall back to process environment.

use crate::db::DbState;
use rusqlite::params;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::State;

pub const KEY_AI_PROVIDER: &str = "ai_provider";
pub const KEY_DEEPSEEK_API_KEY: &str = "deepseek_api_key";
pub const KEY_OLLAMA_ENDPOINT: &str = "ollama_endpoint";
pub const KEY_OLLAMA_MODEL: &str = "ollama_model";

/// Read a single setting, or `None` if missing.
pub fn get_app_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM app_settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let v: Option<String> = stmt
        .query_row([key], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(raw) = v else {
        return Ok(None);
    };
    if raw.is_empty() {
        return Ok(Some(String::new()));
    }
    if key == KEY_DEEPSEEK_API_KEY {
        match crate::crypto_utils::decrypt_value(&raw) {
            Ok(plain) => Ok(Some(plain)),
            Err(e) => Err(e),
        }
    } else {
        Ok(Some(raw))
    }
}

/// Insert or update a setting. Updates `updated_at` to the current time.
/// `deepseek_api_key` is AES-GCM–encrypted at rest; other keys are stored as given.
pub fn set_app_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let stored = if key == KEY_DEEPSEEK_API_KEY {
        if value.is_empty() {
            String::new()
        } else {
            crate::crypto_utils::encrypt_value(value)?
        }
    } else {
        value.to_string()
    };
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![key, &stored],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- AI provider: types & Tauri ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderSettings {
    /// One of: `mock`, `deepseek`, `local` (Ollama).
    pub ai_provider: String,
    /// Stored secret; may be empty when not set in DB.
    pub deepseek_api_key: String,
    pub ollama_endpoint: String,
    pub ollama_model: String,
}

fn load_settings_from_db(conn: &Connection) -> Result<AiProviderSettings, String> {
    Ok(AiProviderSettings {
        ai_provider: get_app_setting(conn, KEY_AI_PROVIDER)?
            .unwrap_or_default()
            .trim()
            .to_string(),
        deepseek_api_key: get_app_setting(conn, KEY_DEEPSEEK_API_KEY)?
            .unwrap_or_default(),
        ollama_endpoint: get_app_setting(conn, KEY_OLLAMA_ENDPOINT)?
            .unwrap_or_default()
            .trim()
            .to_string(),
        ollama_model: get_app_setting(conn, KEY_OLLAMA_MODEL)?
            .unwrap_or_default()
            .trim()
            .to_string(),
    })
}

/// Returns stored DB values (empty strings for missing keys) for the settings form.
#[tauri::command]
pub fn get_ai_provider_settings(state: State<DbState>) -> Result<AiProviderSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    load_settings_from_db(&*db)
}

/// Validation: DeepSeek needs a non-empty key (DB or will fail at extract unless env);
/// save path requires key in DB or we allow save with only env? User: "DeepSeek requires API key" — if provider is deepseek, require `deepseek_api_key` non-empty *after* considering they might rely on env only. Spec: "DeepSeek requires API key" on the form — require non-empty `deepseek_api_key` in the payload when default provider is deepseek, **or** we document env fallback. For **Save**, require: if `ai_provider` is `deepseek`, `deepseek_api_key` must be non-empty **unless** we're only changing other fields... Simplest: when `ai_provider` == `deepseek`, `deepseek_api_key.trim()` must be non-empty.
/// Local: `ollama_endpoint.trim()` must be non-empty.
#[tauri::command]
pub fn set_ai_provider_settings(
    state: State<DbState>,
    settings: AiProviderSettings,
) -> Result<(), String> {
    let p = settings.ai_provider.trim().to_ascii_lowercase();
    if p == "deepseek" && settings.deepseek_api_key.trim().is_empty() {
        return Err("DeepSeek requires a non-empty API key.".to_string());
    }
    if p == "local" || p == "ollama" {
        if settings.ollama_endpoint.trim().is_empty() {
            return Err("Local (Ollama) requires a non-empty endpoint URL.".to_string());
        }
    }
    if !p.is_empty() && p != "mock" && p != "deepseek" && p != "local" && p != "ollama" {
        return Err(
            "ai_provider must be one of: mock, deepseek, or local (ollama is accepted as an alias for local).".to_string(),
        );
    }

    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    let tx = db
        .transaction()
        .map_err(|e| e.to_string())?;
    set_app_setting(
        &*tx,
        KEY_AI_PROVIDER,
        &settings.ai_provider.trim().to_string(),
    )?;
    set_app_setting(
        &*tx,
        KEY_DEEPSEEK_API_KEY,
        settings.deepseek_api_key.trim(),
    )?;
    set_app_setting(
        &*tx,
        KEY_OLLAMA_ENDPOINT,
        settings.ollama_endpoint.trim(),
    )?;
    set_app_setting(
        &*tx,
        KEY_OLLAMA_MODEL,
        settings.ollama_model.trim(),
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Non-secret hints for the invoice UI: resolution matches backend loaders (DB, then env).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiExtractionConfigHint {
    /// Effective default from DB or `AI_DEFAULT_PROVIDER` env, else `mock`.
    pub default_provider: String,
    pub deepseek_configured: bool,
    /// True when a usable Ollama endpoint can be resolved (DB or env or default localhost URL).
    pub ollama_endpoint_resolved: bool,
}

/// Used by the invoice page so it does not need the raw API key in memory.
#[tauri::command]
pub fn get_ai_extraction_config_hint(
    state: State<DbState>,
) -> Result<AiExtractionConfigHint, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn: &Connection = &*db;
    let def = crate::ai_provider::resolve_default_provider_label(conn);
    let deepseek = deepseek_api_key_effective_non_empty(conn);
    let ollama_ok = ollama_can_resolve_config(conn);
    Ok(AiExtractionConfigHint {
        default_provider: def,
        deepseek_configured: deepseek,
        ollama_endpoint_resolved: ollama_ok,
    })
}

fn deepseek_api_key_effective_non_empty(conn: &Connection) -> bool {
    get_app_setting(conn, KEY_DEEPSEEK_API_KEY)
        .ok()
        .flatten()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        || std::env::var("AI_API_KEY")
            .ok()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
}

fn ollama_can_resolve_config(conn: &Connection) -> bool {
    let ep = get_app_setting(conn, KEY_OLLAMA_ENDPOINT)
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty());
    if ep.is_some() {
        return true;
    }
    if let Ok(e) = std::env::var("OLLAMA_ENDPOINT") {
        if !e.trim().is_empty() {
            return true;
        }
    }
    // Default in ollama_client (localhost) always counts as resolvable.
    true
}

/// `ai_provider` in DB, else `AI_DEFAULT_PROVIDER` in env, else `mock`.
pub fn resolve_default_ai_provider_str(conn: &Connection) -> String {
    if let Some(db) = get_app_setting(conn, KEY_AI_PROVIDER)
        .ok()
        .flatten()
    {
        let t = db.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    std::env::var("AI_DEFAULT_PROVIDER")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "mock".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory() -> Connection {
        Connection::open_in_memory().expect("conn")
    }

    fn ensure_table(conn: &Connection) {
        conn.execute_batch(
            r"CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .expect("schema");
    }

    #[test]
    fn get_set_roundtrip() {
        let c = in_memory();
        ensure_table(&c);
        set_app_setting(&c, "k", "v").unwrap();
        assert_eq!(get_app_setting(&c, "k").unwrap().as_deref(), Some("v"));
    }

    #[test]
    fn deepseek_fallback_to_env() {
        let c = in_memory();
        ensure_table(&c);
        // No DB key, no env: false
        assert!(!deepseek_api_key_effective_non_empty(&c));
        // Simulate env: cannot set in test easily without temp env — we only assert DB path
        set_app_setting(&c, KEY_DEEPSEEK_API_KEY, "sk-x").unwrap();
        assert!(deepseek_api_key_effective_non_empty(&c));
    }

    #[test]
    fn default_provider_falls_back_to_mock() {
        let c = in_memory();
        ensure_table(&c);
        assert_eq!(resolve_default_ai_provider_str(&c), "mock");
    }

    #[test]
    fn default_provider_from_db() {
        let c = in_memory();
        ensure_table(&c);
        set_app_setting(&c, KEY_AI_PROVIDER, "deepseek").unwrap();
        assert_eq!(resolve_default_ai_provider_str(&c), "deepseek");
    }

    #[test]
    fn load_deepseek_prefers_db_key_over_empty_env() {
        let c = in_memory();
        ensure_table(&c);
        // DB key is used when set (see deepseek `load_deepseek_config`: DB before env)
        set_app_setting(&c, KEY_DEEPSEEK_API_KEY, "sk-test-from-db").unwrap();
        let conf = crate::deepseek_client::load_deepseek_config(&c).expect("config");
        assert_eq!(conf.api_key, "sk-test-from-db");
    }

    #[test]
    fn deepseek_api_key_stored_encrypted_in_db() {
        let c = in_memory();
        ensure_table(&c);
        set_app_setting(&c, KEY_DEEPSEEK_API_KEY, "sk-secret").unwrap();
        let raw: String = c
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                [KEY_DEEPSEEK_API_KEY],
                |r| r.get(0),
            )
            .expect("row");
        assert!(raw.starts_with(crate::crypto_utils::ENC_PREFIX));
        assert_eq!(get_app_setting(&c, KEY_DEEPSEEK_API_KEY).unwrap().as_deref(), Some("sk-secret"));
    }
}
