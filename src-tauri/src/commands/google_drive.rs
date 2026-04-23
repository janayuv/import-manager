//! Google Drive backup integration (OAuth2 + Drive API v3).
//! Build with env vars: `IMPORT_MANAGER_GOOGLE_CLIENT_ID` and `IMPORT_MANAGER_GOOGLE_CLIENT_SECRET`
//! (OAuth "Desktop" client from Google Cloud Console). Add redirect URI: `http://127.0.0.1:8765/`

use chrono::Duration as ChronoDuration;
use chrono::Utc;
use futures_util::StreamExt;
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{Emitter, State, WebviewWindow};

use crate::db::DbState;

pub const GDRIVE_PATH_PREFIX: &str = "gdrive:";

const KEYRING_SERVICE: &str = "ImportManager";
const KEYRING_USER: &str = "google_drive_refresh_token";
const KEYRING_EMAIL: &str = "google_drive_user_email";
const OAUTH_REDIRECT: &str = "http://127.0.0.1:8765/";
/// drive.file + read email for status UI
const OAUTH_SCOPE: &str =
    "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

const META_GDRIVE_ACCESS: &str = "gdrive_access_token";
const META_GDRIVE_REFRESH: &str = "gdrive_refresh_token";
const META_GDRIVE_EXPIRY: &str = "gdrive_token_expiry";

static OPERATION_CANCEL: AtomicBool = AtomicBool::new(false);
static GDRIVE_TOKEN_DB_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Remember DB path so token read fallbacks can open the same file without `State`.
fn record_gdrive_token_db_path(conn: &Connection) {
    if let Some(p) = conn.path() {
        let _ = GDRIVE_TOKEN_DB_PATH.get_or_init(|| PathBuf::from(p));
    }
}

fn read_gdrive_metadata_str(conn: &Connection, key: &str) -> Option<String> {
    match conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            params![key],
            |r| r.get::<_, String>(0),
        )
        .optional()
    {
        Ok(Some(s)) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        _ => None,
    }
}

fn read_gdrive_refresh_from_metadata(conn: &Connection) -> Option<String> {
    read_gdrive_metadata_str(conn, META_GDRIVE_REFRESH)
}

/// Persist OAuth tokens in SQLite (reliable) and use when OS keyring is unavailable.
fn store_gdrive_tokens_in_metadata(
    conn: &Connection,
    access: &str,
    refresh: &str,
    access_expires_at_rfc3339: &str,
) -> Result<(), String> {
    for (k, v) in [
        (META_GDRIVE_ACCESS, access),
        (META_GDRIVE_REFRESH, refresh),
        (META_GDRIVE_EXPIRY, access_expires_at_rfc3339),
    ] {
        conn.execute(
            "INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?1, ?2)",
            params![k, v],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn clear_gdrive_metadata_tokens(conn: &Connection) {
    for k in [META_GDRIVE_ACCESS, META_GDRIVE_REFRESH, META_GDRIVE_EXPIRY] {
        let _ = conn.execute("DELETE FROM app_metadata WHERE key = ?1", params![k]);
    }
}

/// True if keyring or `app_metadata` has a non-empty refresh token.
pub fn has_gdrive_session(conn: &Connection) -> bool {
    record_gdrive_token_db_path(conn);
    if has_refresh_token() {
        return true;
    }
    read_gdrive_refresh_from_metadata(conn).is_some()
}

fn read_gdrive_refresh_from_path_file() -> Option<String> {
    let p = GDRIVE_TOKEN_DB_PATH.get()?;
    let c = Connection::open(p).ok()?;
    read_gdrive_refresh_from_metadata(&c)
}

/// Resolve refresh token: keyring first, then [app_metadata], then on-disk path fallback.
fn get_refresh_token_unified(db: Option<&Mutex<Connection>>) -> Result<String, String> {
    if let Ok(e) = keyring_entry_refresh() {
        if let Ok(s) = e.get_password() {
            if !s.is_empty() {
                return Ok(s);
            }
        }
    }
    if let Some(m) = db {
        if let Ok(g) = m.lock() {
            record_gdrive_token_db_path(&g);
            if let Some(s) = read_gdrive_refresh_from_metadata(&g) {
                return Ok(s);
            }
        }
    }
    if let Some(s) = read_gdrive_refresh_from_path_file() {
        return Ok(s);
    }
    Err(user_message("token", "Not signed in to Google Drive."))
}

/// Reset cancel flag before starting upload/download (also callable from frontend).
#[tauri::command]
pub fn google_drive_reset_cancel() {
    OPERATION_CANCEL.store(false, Ordering::SeqCst);
    log::info!(target: "google_drive", "event=cancel_reset");
}

/// User requested cancellation of in-flight transfer.
#[tauri::command]
pub fn google_drive_cancel_operation() {
    OPERATION_CANCEL.store(true, Ordering::SeqCst);
    log::info!(target: "google_drive", "event=cancel_requested");
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveTransferProgress {
    pub phase: String,
    pub percent: u32,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub attempt: Option<u32>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleDriveStatus {
    pub configured: bool,
    pub connected: bool,
    /// `not_configured` | `not_connected` | `connected`
    pub state: String,
    pub email: Option<String>,
}

fn client_id() -> Option<&'static str> {
    option_env!("IMPORT_MANAGER_GOOGLE_CLIENT_ID")
}

fn client_secret() -> Option<&'static str> {
    option_env!("IMPORT_MANAGER_GOOGLE_CLIENT_SECRET")
}

pub fn is_configured() -> bool {
    client_id().map(|s| !s.is_empty()).unwrap_or(false)
}

fn keyring_entry_refresh() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

fn keyring_entry_email() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_EMAIL).map_err(|e| e.to_string())
}

pub fn has_refresh_token() -> bool {
    keyring_entry_refresh()
        .and_then(|e| e.get_password().map_err(|e| e.to_string()))
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

fn read_stored_email() -> Option<String> {
    keyring_entry_email()
        .ok()?
        .get_password()
        .ok()
        .filter(|s| !s.is_empty())
}

fn emit_progress(win: Option<&WebviewWindow>, p: &DriveTransferProgress) {
    if let Some(w) = win {
        let _ = w.emit("gdrive-transfer-progress", p);
    }
}

fn check_cancelled() -> Result<(), String> {
    if OPERATION_CANCEL.load(Ordering::SeqCst) {
        log::warn!(target: "google_drive", "event=transfer_cancelled_by_user");
        return Err(user_message("cancelled", "Transfer was cancelled."));
    }
    Ok(())
}

/// Map HTTP/API failures to short, user-facing codes/messages.
fn user_message(kind: &str, detail: impl std::fmt::Display) -> String {
    format!("GDRIVE_ERROR:{}: {}", kind, detail)
}

pub fn parse_friendly_error(err: &str) -> String {
    if let Some(rest) = err.strip_prefix("GDRIVE_ERROR:") {
        let mut parts = rest.splitn(2, ':');
        let kind = parts.next().unwrap_or("unknown");
        let msg = parts.next().map(str::trim).unwrap_or(rest);
        return match kind {
            "oauth" => format!("Google sign-in failed: {msg}"),
            "network" => format!(
                "Network problem talking to Google. Check your internet connection. ({msg})"
            ),
            "token" => format!(
                "Your Google session expired or was revoked. Please connect Google Drive again. ({msg})"
            ),
            "permission" => format!(
                "Google Drive permission denied. Reconnect and allow Drive access. ({msg})"
            ),
            "upload" => format!("Could not upload to Google Drive: {msg}"),
            "download" => format!("Could not download from Google Drive: {msg}"),
            "cancelled" => msg.to_string(),
            _ => format!("Google Drive: {msg}"),
        };
    }
    err.to_string()
}

#[tauri::command]
pub async fn google_drive_status(
    db_state: State<'_, DbState>,
) -> Result<GoogleDriveStatus, String> {
    let configured = is_configured();
    let connected = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        record_gdrive_token_db_path(&db);
        configured && has_gdrive_session(&db)
    };
    let mut email = if connected { read_stored_email() } else { None };

    if connected && email.is_none() {
        if let Ok(tok) = get_access_token_for_transfer(Some(&db_state.db)).await {
            if let Ok(e) = fetch_user_email(&tok).await {
                if let Ok(entry) = keyring_entry_email() {
                    let _ = entry.set_password(&e);
                }
                email = Some(e);
            }
        }
    }

    let state = if !configured {
        "not_configured"
    } else if !connected {
        "not_connected"
    } else {
        "connected"
    }
    .to_string();

    Ok(GoogleDriveStatus {
        configured,
        connected,
        state,
        email,
    })
}

/// Refresh profile email from Google (call after connect or from UI).
#[tauri::command]
pub async fn google_drive_refresh_profile(
    db_state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        if !has_gdrive_session(&db) {
            return Ok(None);
        }
    }
    let tok = get_access_token_for_transfer(Some(&db_state.db)).await?;
    let email = fetch_user_email(&tok).await?;
    if let Ok(e) = keyring_entry_email() {
        let _ = e.set_password(&email);
    }
    log::info!(target: "google_drive", "event=profile_refreshed email={}", email);
    Ok(Some(email))
}

#[tauri::command]
pub async fn google_drive_disconnect(db_state: State<'_, DbState>) -> Result<(), String> {
    let e = keyring_entry_refresh()?;
    let _ = e.delete_credential();
    if let Ok(em) = keyring_entry_email() {
        let _ = em.delete_credential();
    }
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        clear_gdrive_metadata_tokens(&db);
    }
    log::info!(target: "google_drive", "event=disconnected");
    Ok(())
}

#[tauri::command]
pub async fn google_drive_connect(db_state: State<'_, DbState>) -> Result<(), String> {
    let id = client_id()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            user_message(
                "oauth",
                "OAuth is not configured for this build (IMPORT_MANAGER_GOOGLE_CLIENT_ID).",
            )
        })?
        .to_string();

    let secret = client_secret().map(|s| s.to_string());

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        urlencoding::encode(&id),
        urlencoding::encode(OAUTH_REDIRECT),
        urlencoding::encode(OAUTH_SCOPE),
    );

    log::info!(target: "google_drive", "event=oauth_browser_open");

    let code =
        std::thread::spawn(move || crate::commands::oauth_callback::capture_oauth_code(&auth_url))
            .join()
            .map_err(|_| user_message("oauth", "Sign-in thread panicked"))??;

    log::info!(target: "google_drive", "event=oauth_code_received");

    let tr = exchange_code_http(&id, secret.as_deref(), &code).await?;
    {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        record_gdrive_token_db_path(&db);
        persist_gdrive_token_exchange(&db, &tr)?;
    }

    if let Some(ref access) = tr.access_token {
        if let Ok(email) = fetch_user_email(access).await {
            if let Ok(e) = keyring_entry_email() {
                let _ = e.set_password(&email);
            }
            log::info!(
                target: "google_drive",
                "event=oauth_user_email_stored email={}",
                email
            );
        }
    }
    log::info!(
        target: "import_manager::gdrive",
        "Google Drive connected successfully"
    );
    Ok(())
}

#[derive(Debug)]
struct ExchangedGdriveTokens {
    access_token: Option<String>,
    refresh_token: String,
    expires_in_secs: i64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    #[allow(dead_code)]
    expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct UserInfoEmail {
    email: Option<String>,
}

async fn exchange_code_http(
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
) -> Result<ExchangedGdriveTokens, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| user_message("network", e.to_string()))?;

    let mut form: Vec<(&str, String)> = vec![
        ("code", code.to_string()),
        ("client_id", client_id.to_string()),
        ("redirect_uri", OAUTH_REDIRECT.to_string()),
        ("grant_type", "authorization_code".to_string()),
    ];
    if let Some(s) = client_secret {
        if !s.is_empty() {
            form.push(("client_secret", s.to_string()));
        }
    }

    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .await
        .map_err(|e| user_message("network", e.to_string()))?;

    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        log::warn!(target: "google_drive", "event=token_exchange_http_error body={}", t);
        return Err(user_message(
            "oauth",
            format!("Token exchange failed ({})", t),
        ));
    }

    let tr: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
    let refresh = tr.refresh_token.ok_or_else(|| {
        user_message(
            "oauth",
            "No refresh token returned. Revoke app access in Google Account and try again.",
        )
    })?;
    let expires_in = tr.expires_in.unwrap_or(3600);

    Ok(ExchangedGdriveTokens {
        access_token: tr.access_token,
        refresh_token: refresh,
        expires_in_secs: expires_in,
    })
}

/// Keyring (best-effort) + [app_metadata] (reliable fallback for "connected" and API).
fn persist_gdrive_token_exchange(
    conn: &Connection,
    tr: &ExchangedGdriveTokens,
) -> Result<(), String> {
    if let Ok(entry) = keyring_entry_refresh() {
        if let Err(e) = entry.set_password(&tr.refresh_token) {
            log::warn!(
                target: "google_drive",
                "event=oauth_keyring_store_failed err={} (using app_metadata only)",
                e
            );
        } else {
            log::info!(target: "google_drive", "event=oauth_token_stored");
        }
    }
    let access = tr.access_token.as_deref().unwrap_or("");
    let exp = Utc::now() + ChronoDuration::seconds(tr.expires_in_secs.clamp(1, 365 * 24 * 3600));
    store_gdrive_tokens_in_metadata(conn, access, &tr.refresh_token, &exp.to_rfc3339())?;
    Ok(())
}

async fn fetch_user_email(access_token: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| user_message("network", e.to_string()))?;
    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        return Err(user_message("permission", t));
    }
    let info: UserInfoEmail = res.json().await.map_err(|e| e.to_string())?;
    info.email
        .filter(|s| !s.is_empty())
        .ok_or_else(|| user_message("permission", "Email not returned by Google."))
}

async fn refresh_access_token(refresh_token: &str) -> Result<String, String> {
    let id = client_id()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| user_message("token", "OAuth client id missing at build time."))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| user_message("network", e.to_string()))?;

    let mut form: Vec<(&str, String)> = vec![
        ("refresh_token", refresh_token.to_string()),
        ("client_id", id.to_string()),
        ("grant_type", "refresh_token".to_string()),
    ];
    if let Some(s) = client_secret() {
        if !s.is_empty() {
            form.push(("client_secret", s.to_string()));
        }
    }

    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .await
        .map_err(|e| user_message("network", e.to_string()))?;

    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        log::warn!(target: "google_drive", "event=refresh_token_failed body={}", t);
        return Err(user_message(
            "token",
            format!("Session refresh failed: {t}"),
        ));
    }

    let tr: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
    tr.access_token
        .ok_or_else(|| user_message("token", "No access token from refresh."))
}

async fn refresh_access_token_force(db: Option<&Mutex<Connection>>) -> Result<String, String> {
    let refresh = get_refresh_token_unified(db)?;
    refresh_access_token(&refresh).await
}

/// Resolves a fresh access token (from refresh). Pass [Some(&DbState::db)] when in-app so metadata fallback works.
pub async fn get_access_token_for_transfer(
    db: Option<&Mutex<Connection>>,
) -> Result<String, String> {
    let refresh = get_refresh_token_unified(db)?;
    refresh_access_token(&refresh).await
}

/// Backward-compatible: keyring and on-disk [app_metadata] fallback (no in-memory handle).
#[allow(dead_code)] // Public API; internal paths use [get_access_token_for_transfer] with the DB handle.
pub async fn get_access_token() -> Result<String, String> {
    get_access_token_for_transfer(None).await
}

/// Delete a file created by this app on Drive (best-effort; used when pruning old backups).
pub async fn delete_file_by_id(
    file_id: &str,
    db: Option<&Mutex<Connection>>,
) -> Result<(), String> {
    if file_id.is_empty() {
        return Err(user_message("upload", "Empty Drive file id."));
    }
    let token = get_access_token_for_transfer(db).await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| user_message("network", e.to_string()))?;
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}?supportsAllDrives=true",
        file_id
    );
    let res = client
        .delete(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| user_message("network", e.to_string()))?;
    let status = res.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(());
    }
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(map_http_error(status, &body));
    }
    Ok(())
}

#[derive(Deserialize)]
struct DriveFileCreateResponse {
    id: String,
}

fn map_http_error(status: reqwest::StatusCode, body: &str) -> String {
    let s = status.as_u16();
    if s == 401 {
        return user_message("token", body);
    }
    if s == 403 {
        return user_message("permission", body);
    }
    if s == 404 {
        return user_message("download", "File not found on Drive.");
    }
    if s >= 500 {
        return user_message("network", format!("Server error HTTP {s}"));
    }
    if s == 0 || (s < 200 && s > 0) {
        return user_message("network", format!("HTTP {s}"));
    }
    user_message("upload", format!("HTTP {s}: {body}"))
}

/// Resumable upload with progress, cancel, retries (3), and 401 retry after refresh.
pub async fn upload_backup_file(
    staging: &Path,
    filename: &str,
    window: Option<&WebviewWindow>,
    db: Option<&Mutex<Connection>>,
) -> Result<String, String> {
    OPERATION_CANCEL.store(false, Ordering::SeqCst);
    let file_len = fs::metadata(staging)
        .map_err(|e| user_message("upload", e.to_string()))?
        .len();

    log::info!(
        target: "google_drive",
        "event=upload_start path={:?} file_len={} filename={}",
        staging,
        file_len,
        filename
    );

    let max_attempts = 3u32;
    let mut last_err = String::new();

    for attempt in 1..=max_attempts {
        check_cancelled()?;
        emit_progress(
            window,
            &DriveTransferProgress {
                phase: "upload".into(),
                percent: 0,
                bytes_transferred: 0,
                total_bytes: file_len,
                attempt: Some(attempt),
                message: Some(if attempt > 1 {
                    format!("Retry {attempt}/{max_attempts}…")
                } else {
                    "Starting upload…".into()
                }),
            },
        );

        match upload_once_with_progress(staging, filename, file_len, window, attempt, db).await {
            Ok(id) => {
                log::info!(
                    target: "google_drive",
                    "event=upload_finish file_id={} attempt={}",
                    id,
                    attempt
                );
                emit_progress(
                    window,
                    &DriveTransferProgress {
                        phase: "upload".into(),
                        percent: 100,
                        bytes_transferred: file_len,
                        total_bytes: file_len,
                        attempt: Some(attempt),
                        message: Some("Upload complete.".into()),
                    },
                );
                return Ok(id);
            }
            Err(e) => {
                last_err = e.clone();
                log::warn!(
                    target: "google_drive",
                    "event=upload_attempt_failed attempt={} error={}",
                    attempt,
                    e
                );
                if attempt < max_attempts
                    && (e.contains("network") || e.contains("HTTP 5") || e.contains("timeout"))
                {
                    std::thread::sleep(Duration::from_millis(800 * attempt as u64));
                    continue;
                }
                if attempt < max_attempts && (e.contains("token") || e.contains("401")) {
                    let _ = refresh_access_token_force(db).await;
                    std::thread::sleep(Duration::from_millis(400));
                    continue;
                }
                break;
            }
        }
    }

    Err(last_err)
}

async fn upload_once_with_progress(
    staging: &Path,
    filename: &str,
    file_len: u64,
    window: Option<&WebviewWindow>,
    _attempt: u32,
    db: Option<&Mutex<Connection>>,
) -> Result<String, String> {
    let token = get_access_token_for_transfer(db).await?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3600))
        .build()
        .map_err(|e| user_message("network", e.to_string()))?;

    let meta = serde_json::json!({
        "name": filename,
        "mimeType": "application/octet-stream",
    });

    let init = client
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json; charset=UTF-8")
        .header("X-Upload-Content-Type", "application/octet-stream")
        .header("X-Upload-Content-Length", file_len)
        .json(&meta)
        .send()
        .await
        .map_err(|e| user_message("network", e.to_string()))?;

    if init.status() == reqwest::StatusCode::UNAUTHORIZED {
        log::info!(target: "google_drive", "event=upload_init_401_refresh");
        let token2 = refresh_access_token_force(db).await?;
        let init2 = client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true")
            .header("Authorization", format!("Bearer {token2}"))
            .header("Content-Type", "application/json; charset=UTF-8")
            .header("X-Upload-Content-Type", "application/octet-stream")
            .header("X-Upload-Content-Length", file_len)
            .json(&meta)
            .send()
            .await
            .map_err(|e| user_message("network", e.to_string()))?;
        if !init2.status().is_success() {
            let status = init2.status();
            let t = init2.text().await.unwrap_or_default();
            return Err(map_http_error(status, &t));
        }
        return upload_from_init(client, init2, staging, file_len, window).await;
    }

    if !init.status().is_success() {
        let status = init.status();
        let t = init.text().await.unwrap_or_default();
        return Err(map_http_error(status, &t));
    }

    upload_from_init(client, init, staging, file_len, window).await
}

async fn upload_from_init(
    client: reqwest::Client,
    init: reqwest::Response,
    staging: &Path,
    file_len: u64,
    window: Option<&WebviewWindow>,
) -> Result<String, String> {
    let session_url = init
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| user_message("upload", "Missing resumable session URL."))?
        .to_string();

    let mut file = File::open(staging).map_err(|e| user_message("upload", e.to_string()))?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut uploaded: u64 = 0;

    let mut body_buf: Vec<u8> = Vec::new();
    loop {
        check_cancelled()?;
        let n = file
            .read(&mut buf)
            .map_err(|e| user_message("upload", e.to_string()))?;
        if n == 0 {
            break;
        }
        body_buf.extend_from_slice(&buf[..n]);
        uploaded += n as u64;
        let pct = if file_len > 0 {
            ((uploaded.min(file_len) * 100) / file_len) as u32
        } else {
            100
        };
        emit_progress(
            window,
            &DriveTransferProgress {
                phase: "upload".into(),
                percent: pct,
                bytes_transferred: uploaded.min(file_len),
                total_bytes: file_len,
                attempt: None,
                message: None,
            },
        );
    }

    let put = client
        .put(&session_url)
        .header("Content-Length", file_len)
        .header("Content-Type", "application/octet-stream")
        .body(body_buf)
        .send()
        .await
        .map_err(|e| user_message("network", e.to_string()))?;

    if !put.status().is_success() {
        let status = put.status();
        let t = put.text().await.unwrap_or_default();
        return Err(map_http_error(status, &t));
    }

    let created: DriveFileCreateResponse = put.json().await.map_err(|e| e.to_string())?;
    Ok(created.id)
}

pub async fn download_file_by_id(
    file_id: &str,
    dest: &Path,
    window: Option<&WebviewWindow>,
    db: Option<&Mutex<Connection>>,
) -> Result<(), String> {
    OPERATION_CANCEL.store(false, Ordering::SeqCst);

    log::info!(
        target: "google_drive",
        "event=download_start file_id={} dest={:?}",
        file_id,
        dest
    );

    let token = get_access_token_for_transfer(db).await?;
    let url = format!("https://www.googleapis.com/drive/v3/files/{file_id}?alt=media");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3600))
        .build()
        .map_err(|e| user_message("network", e.to_string()))?;

    let res = download_get_with_auth(&client, &url, &token).await?;

    let res = if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        log::info!(target: "google_drive", "event=download_401_refresh");
        let t2 = refresh_access_token_force(db).await?;
        download_get_with_auth(&client, &url, &t2).await?
    } else {
        res
    };

    if !res.status().is_success() {
        let status = res.status();
        let t = res.text().await.unwrap_or_default();
        return Err(map_http_error(status, &t));
    }

    let total = res.content_length().unwrap_or(0);

    let mut stream = res.bytes_stream();
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| user_message("download", e.to_string()))?;
    }
    let mut file = File::create(dest).map_err(|e| user_message("download", e.to_string()))?;
    let mut written: u64 = 0;

    while let Some(item) = stream.next().await {
        check_cancelled()?;
        let chunk = item.map_err(|e| user_message("network", e.to_string()))?;
        file.write_all(&chunk)
            .map_err(|e| user_message("download", e.to_string()))?;
        written += chunk.len() as u64;
        let pct = if total > 0 {
            ((written.min(total) * 100) / total) as u32
        } else if written > 0 {
            50
        } else {
            0
        };
        emit_progress(
            window,
            &DriveTransferProgress {
                phase: "download".into(),
                percent: pct,
                bytes_transferred: written,
                total_bytes: total,
                attempt: None,
                message: None,
            },
        );
    }

    log::info!(
        target: "google_drive",
        "event=download_finish file_id={} bytes={}",
        file_id,
        written
    );

    emit_progress(
        window,
        &DriveTransferProgress {
            phase: "download".into(),
            percent: 100,
            bytes_transferred: written,
            total_bytes: if total > 0 { total } else { written },
            attempt: None,
            message: Some("Download complete.".into()),
        },
    );

    Ok(())
}

async fn download_get_with_auth(
    client: &reqwest::Client,
    url: &str,
    token: &str,
) -> Result<reqwest::Response, String> {
    client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| user_message("network", e.to_string()))
}
