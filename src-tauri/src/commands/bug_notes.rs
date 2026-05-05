//! In-app bug tracker (developer tool): SQLite persistence + screenshot files under app data.

use crate::db::DbState;
use base64::{engine::general_purpose::STANDARD as BASE64_STD, Engine as _};
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{Manager, State};
use uuid::Uuid;

const MAX_BUG_NOTE_ROWS: i64 = 1000;
const DEFAULT_BUG_NOTE_LIMIT: i64 = 200;
const MAX_SCREENSHOT_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugNote {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub screenshot_path: Option<String>,
    pub context: Option<String>,
    pub meta: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBugNotePayload {
    pub id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub screenshot_path: Option<String>,
    pub context: Option<String>,
    pub meta: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBugNotePayload {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub context: Option<String>,
    pub meta: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBugScreenshotPayload {
    pub bug_id: String,
    pub base64: String,
    pub mime_type: Option<String>,
}

fn lock_conn<'a>(
    state: &'a State<'a, DbState>,
) -> Result<std::sync::MutexGuard<'a, rusqlite::Connection>, String> {
    state.db.lock().map_err(|e| e.to_string())
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn validate_status_input(status: Option<&String>) -> Result<String, String> {
    let s = status
        .map(|x| x.trim().to_uppercase())
        .filter(|x| !x.is_empty())
        .unwrap_or_else(|| "OPEN".to_string());
    if s == "OPEN" || s == "SOLVED" {
        Ok(s)
    } else {
        Err(format!("Invalid status: must be OPEN or SOLVED, got '{s}'"))
    }
}

fn validate_optional_json_field(
    raw: Option<&String>,
    field_name: &str,
) -> Result<Option<String>, String> {
    match raw {
        None => Ok(None),
        Some(s) if s.trim().is_empty() => Ok(None),
        Some(s) => {
            serde_json::from_str::<Value>(s.trim())
                .map_err(|e| format!("Invalid JSON in {field_name}: {e}"))?;
            Ok(Some(s.trim().to_string()))
        }
    }
}

fn row_to_bug_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<BugNote> {
    Ok(BugNote {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        status: row.get(3)?,
        screenshot_path: row.get(4)?,
        context: row.get(5)?,
        meta: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn fetch_bug_note(conn: &rusqlite::Connection, id: &str) -> Result<BugNote, String> {
    conn.query_row(
        "SELECT id, title, description, status, screenshot_path, context, meta, created_at, updated_at \
         FROM bug_notes WHERE id = ?1",
        params![id],
        row_to_bug_note,
    )
    .map_err(|e| e.to_string())
}

fn bug_notes_attachments_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("attachments").join("bug-notes")
}

/// Removes `attachments/bug-notes/<id>/` folders that have no matching row in `bug_notes`.
pub fn cleanup_orphan_bug_screenshots(
    conn: &rusqlite::Connection,
    app_data_dir: &Path,
) -> std::io::Result<u32> {
    let root = bug_notes_attachments_root(app_data_dir);
    if !root.exists() {
        return Ok(0);
    }

    let mut ids = HashSet::new();
    let mut stmt = conn
        .prepare("SELECT id FROM bug_notes")
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    for id in rows {
        ids.insert(id.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?);
    }

    let mut removed: u32 = 0;
    for entry in std::fs::read_dir(&root)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if name.is_empty() || ids.contains(name) {
            continue;
        }
        if let Err(e) = std::fs::remove_dir_all(&path) {
            log::warn!(
                target: "import_manager::bug_notes",
                "failed to remove orphan bug screenshot dir {:?}: {}",
                path,
                e
            );
            continue;
        }
        removed += 1;
    }

    Ok(removed)
}

fn remove_bug_screenshot_dir(app: &tauri::AppHandle, bug_id: &str) {
    let Ok(base) = app.path().app_data_dir() else {
        return;
    };
    let dir = bug_notes_attachments_root(&base).join(bug_id);
    if dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&dir) {
            log::warn!(
                target: "import_manager::bug_notes",
                "failed to remove screenshot dir {:?}: {}",
                dir,
                e
            );
        }
    }
}

fn strip_data_url_base64(input: &str) -> &str {
    if let Some(idx) = input.find("base64,") {
        input[idx + 7..].trim()
    } else {
        input.trim()
    }
}

fn ext_for_mime(mime: Option<&str>) -> &'static str {
    match mime.map(str::trim).map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("image/png") => "png",
        Some("image/jpeg") | Some("image/jpg") => "jpg",
        Some("image/webp") => "webp",
        Some("image/gif") => "gif",
        _ => "png",
    }
}

#[tauri::command]
pub fn create_bug_note(state: State<DbState>, payload: CreateBugNotePayload) -> Result<BugNote, String> {
    let conn = lock_conn(&state)?;
    let bug_id = payload
        .id
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let title_trim = payload.title.trim();
    if title_trim.is_empty() {
        return Err("Title is required.".to_string());
    }

    let st = validate_status_input(payload.status.as_ref())?;
    let ctx = validate_optional_json_field(payload.context.as_ref(), "context")?;
    let meta_json = validate_optional_json_field(payload.meta.as_ref(), "meta")?;

    let ts = now_ms();
    conn.execute(
        "INSERT INTO bug_notes (id, title, description, status, screenshot_path, context, meta, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            bug_id,
            title_trim,
            payload.description,
            st,
            payload.screenshot_path,
            ctx,
            meta_json,
            ts,
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;

    fetch_bug_note(&conn, &bug_id)
}

#[tauri::command]
pub fn get_bug_notes(
    state: State<DbState>,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<BugNote>, String> {
    let conn = lock_conn(&state)?;
    let lim = limit.unwrap_or(DEFAULT_BUG_NOTE_LIMIT).clamp(1, MAX_BUG_NOTE_ROWS);

    let mut out = Vec::new();
    if let Some(st) = status.filter(|s| !s.trim().is_empty()) {
        let st_trim = st.trim().to_uppercase();
        if st_trim != "OPEN" && st_trim != "SOLVED" {
            return Err(format!("Invalid status filter: must be OPEN or SOLVED, got '{st_trim}'"));
        }
        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, status, screenshot_path, context, meta, created_at, updated_at \
                 FROM bug_notes WHERE status = ?1 ORDER BY updated_at DESC LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![st_trim, lim], row_to_bug_note)
            .map_err(|e| e.to_string())?;
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, status, screenshot_path, context, meta, created_at, updated_at \
                 FROM bug_notes ORDER BY updated_at DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![lim], row_to_bug_note)
            .map_err(|e| e.to_string())?;
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn update_bug_note(state: State<DbState>, payload: UpdateBugNotePayload) -> Result<BugNote, String> {
    let conn = lock_conn(&state)?;
    let id = payload.id.trim().to_string();
    if id.is_empty() {
        return Err("id is required.".to_string());
    }

    let mut note = fetch_bug_note(&conn, &id)?;

    if payload.title.is_none()
        && payload.description.is_none()
        && payload.status.is_none()
        && payload.context.is_none()
        && payload.meta.is_none()
    {
        return Err("No fields to update.".to_string());
    }

    if let Some(t) = payload.title {
        let tt = t.trim();
        if tt.is_empty() {
            return Err("Title cannot be empty.".to_string());
        }
        note.title = tt.to_string();
    }
    if let Some(d) = payload.description {
        note.description = if d.trim().is_empty() {
            None
        } else {
            Some(d)
        };
    }
    if let Some(s) = payload.status {
        note.status = validate_status_input(Some(&s))?;
    }
    if let Some(c) = payload.context {
        note.context = validate_optional_json_field(Some(&c), "context")?;
    }
    if let Some(m) = payload.meta {
        note.meta = validate_optional_json_field(Some(&m), "meta")?;
    }

    note.updated_at = now_ms();
    conn.execute(
        "UPDATE bug_notes SET title = ?1, description = ?2, status = ?3, context = ?4, meta = ?5, updated_at = ?6 WHERE id = ?7",
        params![
            note.title,
            note.description,
            note.status,
            note.context,
            note.meta,
            note.updated_at,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    fetch_bug_note(&conn, &id)
}

#[tauri::command]
pub fn delete_bug_note(app: tauri::AppHandle, state: State<DbState>, id: String) -> Result<(), String> {
    let conn = lock_conn(&state)?;
    let n = conn
        .execute("DELETE FROM bug_notes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("Bug note not found: {id}"));
    }
    drop(conn);
    remove_bug_screenshot_dir(&app, &id);
    Ok(())
}

#[tauri::command]
pub fn save_bug_screenshot(app: tauri::AppHandle, payload: SaveBugScreenshotPayload) -> Result<String, String> {
    let bid = payload.bug_id.trim();
    if bid.is_empty() {
        return Err("bug_id is required.".to_string());
    }

    let raw_b64 = strip_data_url_base64(&payload.base64);
    let bytes = BASE64_STD
        .decode(raw_b64.as_bytes())
        .map_err(|e| format!("Invalid base64: {e}"))?;

    if bytes.len() > MAX_SCREENSHOT_BYTES {
        return Err(format!(
            "Screenshot too large (max {} MB)",
            MAX_SCREENSHOT_BYTES / (1024 * 1024)
        ));
    }

    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = bug_notes_attachments_root(&base).join(bid);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let ext = ext_for_mime(payload.mime_type.as_deref());
    let ts = now_ms();
    let file_name = format!("{ts}.{ext}");
    let dest = dir.join(&file_name);

    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}
