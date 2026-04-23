//! Recycle bin: list, restore, and permanently hard-delete soft-deleted rows.
#![allow(non_snake_case)]

use crate::commands::reference_scan::{
    ensure_can_hard_delete, list_application_tables, map_hard_delete_error_rusqlite,
};
use crate::db::DbState;
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashSet;
use std::time::Instant;
use uuid::Uuid;

const DEFAULT_PAGE_SIZE: u32 = 50;
const IN_BATCH: usize = 90;
const RECYCLE_RETENTION_DAYS_KEY: &str = "recycle_retention_days";
const DEFAULT_RECYCLE_RETENTION_DAYS: u32 = 30;

fn is_safe_table_ident(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_')
}

fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

fn table_column_names(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let q = format!("PRAGMA table_info({})", quote_ident(table));
    let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(names)
}

fn table_has_deleted_at(conn: &Connection, table: &str) -> Result<bool, String> {
    let cols = table_column_names(conn, table)?;
    Ok(cols.iter().any(|c| c.eq_ignore_ascii_case("deleted_at")))
}

fn list_soft_delete_tables_internal(conn: &Connection) -> Result<Vec<String>, String> {
    let all = list_application_tables(conn)?;
    let mut out: Vec<String> = all
        .into_iter()
        .filter(|t| is_safe_table_ident(t) && table_has_deleted_at(conn, t).unwrap_or(false))
        .collect();
    out.sort();
    Ok(out)
}

/// Tables with a `deleted_at` column.
pub fn get_soft_delete_tables_internal(conn: &Connection) -> Result<Vec<String>, String> {
    let out = list_soft_delete_tables_internal(conn)?;
    log::info!(
        target: "import_manager::recycle_bin",
        "Soft-delete tables detected: {:?}",
        out
    );
    Ok(out)
}

#[tauri::command]
pub fn get_soft_delete_tables(db_state: tauri::State<'_, DbState>) -> Result<Vec<String>, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    get_soft_delete_tables_internal(&db)
}

#[tauri::command]
pub fn get_recycle_bin_deleted_count(db_state: tauri::State<'_, DbState>) -> Result<i64, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let tables = get_soft_delete_tables_internal(&db)?;
    let mut total: i64 = 0;
    for t in tables {
        let columns = table_column_names(&db, &t)?;
        let Some(d_col) = columns
            .iter()
            .find(|c| c.eq_ignore_ascii_case("deleted_at"))
        else {
            continue;
        };
        let c: i64 = db
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {} WHERE {} IS NOT NULL",
                    quote_ident(&t),
                    quote_ident(d_col)
                ),
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        total += c;
    }
    Ok(total)
}

fn id_cell_to_string(row: &Row) -> std::result::Result<String, rusqlite::Error> {
    use rusqlite::types::ValueRef;
    match row.get_ref(0)? {
        ValueRef::Null => Ok(String::new()),
        ValueRef::Integer(n) => Ok(n.to_string()),
        ValueRef::Text(t) => Ok(String::from_utf8_lossy(t).to_string()),
        ValueRef::Real(f) => Ok(f.to_string()),
        ValueRef::Blob(b) => Ok(String::from_utf8_lossy(b).to_string()),
    }
}

/// Reads [RECYCLE_RETENTION_DAYS_KEY]; inserts default (30) if the row is missing.
fn get_recycle_retention_days(conn: &Connection) -> Result<u32, String> {
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            params![RECYCLE_RETENTION_DAYS_KEY],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if val.is_none() {
        conn.execute(
            "INSERT OR IGNORE INTO app_metadata (key, value) VALUES (?1, ?2)",
            params![
                RECYCLE_RETENTION_DAYS_KEY,
                DEFAULT_RECYCLE_RETENTION_DAYS.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let s: String = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            params![RECYCLE_RETENTION_DAYS_KEY],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let s = s.trim();
    if s.is_empty() {
        return Ok(DEFAULT_RECYCLE_RETENTION_DAYS);
    }
    s.parse::<u32>()
        .map(|n| n.clamp(1, 3650))
        .map_err(|_| "invalid recycle_retention_days in app_metadata".to_string())
}

/// Permanently removes soft-deleted rows older than the configured retention, skipping rows
/// that are still blocked by [ensure_can_hard_delete] (e.g. FK references).
pub fn cleanup_expired_recycle_records(conn: &Connection) -> Result<i64, String> {
    let retention_days = get_recycle_retention_days(conn)?;
    let time_mod = format!("-{} days", retention_days);
    let tables = list_soft_delete_tables_internal(conn)?;
    let mut total_deleted: i64 = 0;
    for table in tables {
        let columns = table_column_names(conn, &table)?;
        let Some(d_col) = columns
            .iter()
            .find(|c| c.eq_ignore_ascii_case("deleted_at"))
        else {
            continue;
        };
        if !columns.iter().any(|c| c.eq_ignore_ascii_case("id")) {
            log::warn!(
                target: "import_manager::recycle_bin",
                "Skip cleanup: table {} has no id column",
                table
            );
            continue;
        }
        let list_sql = format!(
            "SELECT id FROM {} WHERE {} IS NOT NULL AND {} < datetime('now', ?1)",
            quote_ident(&table),
            quote_ident(d_col),
            quote_ident(d_col)
        );
        let id_rows: Vec<String> = {
            let mut stmt = conn.prepare(&list_sql).map_err(|e| e.to_string())?;
            let mut id_rows: Vec<String> = Vec::new();
            let rows = stmt
                .query_map(params![time_mod.as_str()], id_cell_to_string)
                .map_err(|e| e.to_string())?;
            for row in rows {
                let s = row.map_err(|e| e.to_string())?;
                if !s.is_empty() {
                    id_rows.push(s);
                }
            }
            id_rows
        };
        if id_rows.is_empty() {
            continue;
        }
        let mut to_delete: Vec<String> = Vec::new();
        for id in id_rows {
            if ensure_can_hard_delete(conn, &table, std::slice::from_ref(&id)).is_ok() {
                to_delete.push(id);
            } else {
                log::info!(
                    target: "import_manager::recycle_bin",
                    "Skip expired cleanup (blocked by references): table={} id={}",
                    table,
                    id
                );
            }
        }
        if to_delete.is_empty() {
            continue;
        }
        for chunk in to_delete.chunks(IN_BATCH) {
            if chunk.is_empty() {
                continue;
            }
            let ph: String = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
            let del_sql = format!("DELETE FROM {} WHERE id IN ({})", quote_ident(&table), ph);
            let n = conn
                .execute(
                    &del_sql,
                    rusqlite::params_from_iter(chunk.iter().map(String::as_str)),
                )
                .map_err(map_hard_delete_error_rusqlite)?;
            total_deleted += n as i64;
        }
    }
    log::info!(
        target: "import_manager::recycle_bin",
        "Expired recycle records cleaned: {}",
        total_deleted
    );
    if total_deleted > 0 {
        if let Err(e) = super::db_maintenance::run_maintenance_after_recycle_cleanup(conn) {
            log::warn!(
                target: "import_manager::recycle_bin",
                "post-cleanup VACUUM/ANALYZE failed: {}",
                e
            );
        }
    }
    Ok(total_deleted)
}

fn cell_to_json(row: &Row, i: usize) -> Result<serde_json::Value, String> {
    use rusqlite::types::ValueRef;
    match row.get_ref(i) {
        Ok(ValueRef::Text(bytes)) => Ok(serde_json::Value::String(
            String::from_utf8_lossy(bytes).to_string(),
        )),
        Ok(ValueRef::Integer(n)) => Ok(serde_json::Value::Number(serde_json::Number::from(n))),
        Ok(ValueRef::Real(f)) => {
            if let Some(n) = serde_json::Number::from_f64(f) {
                Ok(serde_json::Value::Number(n))
            } else {
                Ok(serde_json::Value::Null)
            }
        }
        Ok(ValueRef::Null) => Ok(serde_json::Value::Null),
        Ok(ValueRef::Blob(b)) => Ok(serde_json::Value::String(
            String::from_utf8_lossy(b).to_string(),
        )),
        Err(e) => Err(e.to_string()),
    }
}

fn row_to_object(row: &Row, columns: &[String]) -> Result<serde_json::Value, String> {
    use serde_json::Value;
    let mut m = serde_json::Map::new();
    for (i, c) in columns.iter().enumerate() {
        m.insert(c.clone(), cell_to_json(row, i)?);
    }
    Ok(Value::Object(m))
}

fn value_json_key_string(v: &JsonValue) -> String {
    match v {
        JsonValue::String(s) => s.clone(),
        JsonValue::Number(n) => n.to_string(),
        _ => v.to_string(),
    }
}

fn record_deleted_at_key_for_sort(v: &JsonValue) -> String {
    v.as_object()
        .and_then(|m| {
            m.iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("deleted_at"))
                .map(|(_, val)| value_json_key_string(val))
        })
        .unwrap_or_default()
}

fn record_id_key_for_sort(v: &JsonValue) -> String {
    v.as_object()
        .and_then(|m| {
            m.iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("id"))
                .map(|(_, val)| value_json_key_string(val))
        })
        .unwrap_or_default()
}

/// Same soft-delete rows that `get_recycle_bin_deleted_count` sums, without tombstone/id-IN joins.
fn recycle_global_search_matches(needle: &str, table: &str, record: &JsonValue) -> bool {
    let o = match record.as_object() {
        Some(m) => m,
        None => return false,
    };
    let mut id_s = String::new();
    let mut del = String::new();
    let mut label = String::new();
    for (k, v) in o {
        let l = k.to_lowercase();
        if l == "id" {
            id_s = value_json_key_string(v);
        } else if l == "deleted_at" {
            del = value_json_key_string(v);
        } else if (l == "title"
            || l == "invoice_number"
            || l == "part_number"
            || l == "bl_awb_number"
            || l.contains("name"))
            && label.is_empty()
        {
            label = value_json_key_string(v);
        }
    }
    if label.is_empty() {
        label = id_s.clone();
    }
    let blob = format!("{} {} {} {}", table, id_s, label, del).to_lowercase();
    blob.contains(needle)
}

/// Loads every soft-deleted row in application tables, matching COUNT(*) filters.
fn list_all_soft_deleted_for_recycle_bin(
    conn: &Connection,
    search: Option<String>,
) -> Result<Vec<DeletedRecordItem>, String> {
    let needle = search
        .as_ref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());
    let tables = get_soft_delete_tables_internal(conn)?;
    let mut all: Vec<DeletedRecordItem> = Vec::new();
    for table in tables {
        let columns = table_column_names(conn, &table)?;
        let Some(d_col) = columns
            .iter()
            .find(|c| c.eq_ignore_ascii_case("deleted_at"))
        else {
            continue;
        };
        let col_list: String = columns
            .iter()
            .map(|c| quote_ident(c))
            .collect::<Vec<_>>()
            .join(", ");
        let count_sql = format!(
            "SELECT COUNT(*) FROM {} WHERE {} IS NOT NULL",
            quote_ident(&table),
            quote_ident(d_col)
        );
        let count: i64 = conn
            .query_row(&count_sql, [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        log::info!(
            target: "import_manager::recycle_bin",
            "Table {} has {} soft-deleted rows",
            table,
            count
        );
        let q = format!(
            "SELECT {col_list} FROM {} WHERE {} IS NOT NULL ORDER BY {} DESC",
            quote_ident(&table),
            quote_ident(d_col),
            quote_ident(d_col)
        );
        let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut after_search: i64 = 0;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let record = row_to_object(row, &columns)?;
            if let Some(ref n) = needle {
                if !recycle_global_search_matches(n, &table, &record) {
                    continue;
                }
            }
            after_search += 1;
            all.push(DeletedRecordItem {
                table: table.clone(),
                record,
            });
        }
        if needle.is_some() {
            log::info!(
                target: "import_manager::recycle_bin",
                "After search filter: {} of {} rows kept for table {}",
                after_search,
                count,
                table
            );
        }
    }
    log::info!(
        target: "import_manager::recycle_bin",
        "Total deleted rows collected: {}",
        all.len()
    );
    all.sort_by(|a, b| {
        let da = record_deleted_at_key_for_sort(&a.record);
        let db_ = record_deleted_at_key_for_sort(&b.record);
        db_.cmp(&da)
            .then_with(|| a.table.cmp(&b.table))
            .then_with(|| record_id_key_for_sort(&a.record).cmp(&record_id_key_for_sort(&b.record)))
    });
    Ok(all)
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct DeletedRecordItem {
    pub table: String,
    pub record: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDeletedRecordsResponse {
    pub total: i64,
    pub page: u32,
    #[serde(rename = "pageSize")]
    pub page_size: u32,
    pub items: Vec<DeletedRecordItem>,
}

fn get_deleted_paged_single_table(
    conn: &Connection,
    table: &str,
    search: Option<String>,
    page: u32,
    page_size: u32,
) -> Result<GetDeletedRecordsResponse, String> {
    log::info!(
        target: "import_manager::recycle_bin",
        "get_deleted_records single_table={} page={} page_size={} search={:?}",
        table,
        page,
        page_size,
        search
    );
    let columns = table_column_names(conn, table)?;
    let Some(d_col) = columns
        .iter()
        .find(|c| c.eq_ignore_ascii_case("deleted_at"))
    else {
        return Err("deleted_at column missing".to_string());
    };
    let d_q = quote_ident(d_col);
    let col_list: String = columns
        .iter()
        .map(|c| quote_ident(c))
        .collect::<Vec<_>>()
        .join(", ");
    let like_pat = search
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|n| format!("%{}%", n));

    let mut or_parts: Vec<String> = vec!["id LIKE ?".to_string()];
    for c in &columns {
        if c.eq_ignore_ascii_case("id")
            || c.eq_ignore_ascii_case("deleted_at")
            || c.eq_ignore_ascii_case("deleted_by")
        {
            continue;
        }
        or_parts.push(format!("{} LIKE ?", quote_ident(c)));
    }
    let n_like = or_parts.len();
    let search_where = format!("{} IS NOT NULL AND ({})", d_q, or_parts.join(" OR "));

    let total: i64 = if like_pat.is_some() {
        let p = like_pat.as_ref().unwrap();
        use rusqlite::types::Value;
        let vals: Vec<Value> = (0..n_like).map(|_| Value::Text(p.clone())).collect();
        let q = format!(
            "SELECT COUNT(*) FROM {} WHERE {}",
            quote_ident(table),
            search_where
        );
        let mut s = conn.prepare(&q).map_err(|e| e.to_string())?;
        s.query_row(rusqlite::params_from_iter(vals), |r| r.get(0))
            .map_err(|e| e.to_string())?
    } else {
        conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM {} WHERE {} IS NOT NULL",
                quote_ident(table),
                d_q
            ),
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?
    };

    let offset = (page - 1) * page_size;
    if total > 0 && (offset as i64) >= total {
        log::warn!(
            target: "import_manager::recycle_bin",
            "single_table page offset {} is at or past total {} for table {}",
            offset,
            total,
            table
        );
    }
    let items: Vec<DeletedRecordItem> = if like_pat.is_some() {
        let p = like_pat.as_ref().unwrap();
        use rusqlite::types::Value;
        let mut vals: Vec<Value> = (0..n_like).map(|_| Value::Text(p.clone())).collect();
        vals.push(Value::Integer(page_size as i64));
        vals.push(Value::Integer(offset as i64));
        let q = format!(
            "SELECT {} FROM {} WHERE {} ORDER BY {} DESC LIMIT ? OFFSET ?",
            col_list,
            quote_ident(table),
            search_where,
            d_q
        );
        let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params_from_iter(vals))
            .map_err(|e| e.to_string())?;
        let mut v = vec![];
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            v.push(DeletedRecordItem {
                table: table.to_string(),
                record: row_to_object(row, &columns)?,
            });
        }
        v
    } else {
        let q = format!(
            "SELECT {} FROM {} WHERE {} IS NOT NULL ORDER BY {} DESC LIMIT ? OFFSET ?",
            col_list,
            quote_ident(table),
            d_q,
            d_q
        );
        let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(params![page_size, offset])
            .map_err(|e| e.to_string())?;
        let mut v = vec![];
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            v.push(DeletedRecordItem {
                table: table.to_string(),
                record: row_to_object(row, &columns)?,
            });
        }
        v
    };

    log::info!(
        target: "import_manager::recycle_bin",
        "get_deleted_records single_table={}: total_deleted_records_before_pagination={} records_after_pagination={} (ORDER BY {} DESC, LIMIT {} OFFSET {})",
        table,
        total,
        items.len(),
        d_q,
        page_size,
        offset
    );

    Ok(GetDeletedRecordsResponse {
        total,
        page,
        page_size,
        items,
    })
}

#[tauri::command]
pub async fn get_deleted_records(
    db_state: tauri::State<'_, DbState>,
    tableName: Option<String>,
    search: Option<String>,
    page: Option<u32>,
    pageSize: Option<u32>,
) -> Result<GetDeletedRecordsResponse, String> {
    let page = page.unwrap_or(1).max(1);
    let page_size = pageSize.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, 200);
    // Treat empty / whitespace-only search as None so filters never hide all rows accidentally.
    let search = search
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    if let Some(ref t) = tableName {
        if !t.is_empty() {
            if !is_safe_table_ident(t) {
                return Err("Invalid table name".to_string());
            }
            let allowed: HashSet<String> =
                get_soft_delete_tables_internal(&db)?.into_iter().collect();
            if !allowed.contains(t) {
                return Err("Table does not support soft delete".to_string());
            }
            return get_deleted_paged_single_table(&db, t, search, page, page_size);
        }
    }

    log::info!(
        target: "import_manager::recycle_bin",
        "get_deleted_records all-tables mode: page={} page_size={} search={:?}",
        page,
        page_size,
        search
    );
    // list_all_soft_deleted_for_recycle_bin merges all soft-delete tables, sorts globally, then we paginate in memory.
    let all = list_all_soft_deleted_for_recycle_bin(&db, search)?;
    let total = all.len() as i64;
    let start = ((page - 1) * page_size) as usize;
    log::info!(
        target: "import_manager::recycle_bin",
        "get_deleted_records all-tables: total_deleted_records_before_pagination={} (global sort already applied) slice_start={}",
        total,
        start
    );
    if start > 0 && !all.is_empty() && start >= all.len() {
        log::warn!(
            target: "import_manager::recycle_bin",
            "all-tables: page offset {} is at or past end of {} records; returning empty items for this page",
            start,
            all.len()
        );
    }
    let items: Vec<DeletedRecordItem> = if start >= all.len() {
        vec![]
    } else {
        let end = (start + page_size as usize).min(all.len());
        all[start..end].to_vec()
    };
    log::info!(
        target: "import_manager::recycle_bin",
        "get_deleted_records all-tables: records_after_pagination={} (end_exclusive={})",
        items.len(),
        (start as i64) + (items.len() as i64)
    );
    Ok(GetDeletedRecordsResponse {
        total,
        page,
        page_size,
        items,
    })
}

fn table_has_column(conn: &Connection, table: &str, col: &str) -> Result<bool, String> {
    Ok(table_column_names(conn, table)?
        .iter()
        .any(|x| x.eq_ignore_ascii_case(col)))
}

#[derive(Debug, Clone, Serialize)]
struct OutgoingForeignKey {
    child_from: String,
    parent_table: String,
    parent_to: String,
}

fn list_outgoing_foreign_keys(
    conn: &Connection,
    child_table: &str,
) -> Result<Vec<OutgoingForeignKey>, String> {
    if !is_safe_table_ident(child_table) {
        return Ok(vec![]);
    }
    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut out = Vec::new();
    let mut stmt = conn
        .prepare("SELECT * FROM pragma_foreign_key_list(?)")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(rusqlite::params![child_table])
        .map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let parent_table: String = row.get(2).map_err(|e| e.to_string())?;
        let from_c: String = row.get(3).map_err(|e| e.to_string())?;
        let to_c: String = row.get(4).map_err(|e| e.to_string())?;
        let k = (from_c.clone(), parent_table.clone());
        if !seen.insert(k) {
            continue;
        }
        if !is_safe_table_ident(&parent_table) {
            continue;
        }
        out.push(OutgoingForeignKey {
            child_from: from_c,
            parent_table,
            parent_to: to_c,
        });
    }
    Ok(out)
}

/// None = parent ok; Some(reason) = blocked.
fn parent_reachable_reason(
    conn: &Connection,
    parent_table: &str,
    parent_key_col: &str,
    key: &str,
) -> Result<Option<String>, String> {
    if key.is_empty() {
        return Ok(None);
    }
    if !is_safe_table_ident(parent_table) || !is_safe_table_ident(parent_key_col) {
        return Ok(Some("invalid".to_string()));
    }
    let exists: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM {} WHERE {} = ?1",
                quote_ident(parent_table),
                quote_ident(parent_key_col)
            ),
            [key],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Ok(Some("not_found".to_string()));
    }
    if !table_has_column(conn, parent_table, "deleted_at")? {
        return Ok(None);
    }
    let del: Option<String> = conn
        .query_row(
            &format!(
                "SELECT deleted_at FROM {} WHERE {} = ?1",
                quote_ident(parent_table),
                quote_ident(parent_key_col)
            ),
            [key],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if del.as_ref().is_some_and(|s| !s.is_empty()) {
        return Ok(Some("parent_soft_deleted".to_string()));
    }
    Ok(None)
}

#[derive(Serialize, Clone)]
pub struct MissingParentDetail {
    /// Row being restored (soft-deleted child).
    pub record_id: String,
    /// Table containing the child row.
    pub child_table: String,
    /// Outgoing FK column on the child that points at the parent.
    pub fk_column: String,
    /// Parent table the FK references.
    pub parent_table: String,
    /// Value stored in `fk_column` (missing or invalid parent id).
    pub missing_parent_id: String,
    pub reason: String,
}

#[derive(Serialize)]
struct RestoreParentErrorPayload {
    #[serde(rename = "type")]
    error_type: String,
    /// Correlates all log lines and client support with this restore attempt.
    restore_attempt_id: String,
    details: Vec<MissingParentDetail>,
}

/// Ensures all non-NULL outgoing FKs point to existing, non–soft-deleted parents.
fn validate_restore_parents(
    conn: &Connection,
    child_table: &str,
    record_ids: &[String],
    restore_attempt_id: &str,
) -> Result<(), String> {
    let fks = list_outgoing_foreign_keys(conn, child_table)?;
    if fks.is_empty() {
        return Ok(());
    }
    let mut details: Vec<MissingParentDetail> = Vec::new();
    for chunk in record_ids.chunks(IN_BATCH) {
        for rid in chunk {
            for fk in &fks {
                if !table_has_column(conn, child_table, &fk.child_from)? {
                    continue;
                }
                let q = format!(
                    "SELECT {} FROM {} WHERE id = ?1 AND deleted_at IS NOT NULL",
                    quote_ident(&fk.child_from),
                    quote_ident(child_table)
                );
                let val: Option<String> =
                    match conn.query_row(&q, [rid.as_str()], |r| r.get::<_, Option<String>>(0)) {
                        Ok(v) => v,
                        Err(rusqlite::Error::QueryReturnedNoRows) => {
                            return Err(format!(
                                "Record {rid} is not in deleted state in {child_table}"
                            ));
                        }
                        Err(e) => return Err(e.to_string()),
                    };
                let val = match val {
                    None => None,
                    Some(s) if s.is_empty() => None,
                    Some(s) => Some(s),
                };
                let Some(ref pval) = val else {
                    continue;
                };
                if let Some(reason) =
                    parent_reachable_reason(conn, &fk.parent_table, &fk.parent_to, pval)?
                {
                    if reason == "invalid" {
                        return Err("Invalid parent table reference in schema".to_string());
                    }
                    details.push(MissingParentDetail {
                        record_id: rid.clone(),
                        child_table: child_table.to_string(),
                        fk_column: fk.child_from.clone(),
                        parent_table: fk.parent_table.clone(),
                        missing_parent_id: pval.clone(),
                        reason,
                    });
                }
            }
        }
    }
    if details.is_empty() {
        return Ok(());
    }
    let n = details.len();
    for d in &details {
        log::warn!(
            target: "import_manager::restore",
            "Missing parent detail: restore_attempt_id={} child_table={} record_id={} fk_column={} parent_table={} missing_parent_id={} reason={}",
            restore_attempt_id,
            d.child_table,
            d.record_id,
            d.fk_column,
            d.parent_table,
            d.missing_parent_id,
            d.reason
        );
    }
    log::warn!(
        target: "import_manager::restore",
        "Restore blocked due to missing parent: restore_attempt_id={} child_table={} issue_count={}",
        restore_attempt_id,
        child_table,
        n
    );
    let payload = RestoreParentErrorPayload {
        error_type: "MISSING_PARENT".to_string(),
        restore_attempt_id: restore_attempt_id.to_string(),
        details,
    };
    Err(serde_json::to_string(&payload).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn restore_deleted_records(
    db_state: tauri::State<'_, DbState>,
    tableName: String,
    recordIds: Vec<String>,
) -> Result<String, String> {
    if recordIds.is_empty() {
        return Err("No record ids provided".to_string());
    }
    if !is_safe_table_ident(&tableName) {
        return Err("Invalid table name".to_string());
    }
    let mut db = db_state.db.lock().map_err(|e| e.to_string())?;
    let allowed: HashSet<String> = get_soft_delete_tables_internal(&db)?.into_iter().collect();
    if !allowed.contains(&tableName) {
        return Err("Table does not support soft delete".to_string());
    }
    let restore_attempt_id = Uuid::new_v4().to_string();
    let op_started = Instant::now();
    log::info!(
        target: "import_manager::restore",
        "restore_started restore_attempt_id={} table={} record_count={}",
        restore_attempt_id,
        tableName,
        recordIds.len()
    );
    validate_restore_parents(&db, &tableName, &recordIds, &restore_attempt_id)?;
    let has_by = table_has_column(&db, &tableName, "deleted_by")?;
    let set_rest = if has_by {
        "deleted_at = NULL, deleted_by = NULL"
    } else {
        "deleted_at = NULL"
    };
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for chunk in recordIds.chunks(IN_BATCH) {
        let ph: String = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let q = format!(
            "UPDATE {} SET {} WHERE id IN ({}) AND deleted_at IS NOT NULL",
            quote_ident(&tableName),
            set_rest,
            ph
        );
        tx.execute(&q, rusqlite::params_from_iter(chunk))
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    let duration_s = op_started.elapsed().as_secs_f64();
    log::info!(
        target: "import_manager::restore",
        "Restore completed:\nrestore_attempt_id={}\nrecords={}\nduration={:.2}s",
        restore_attempt_id,
        recordIds.len(),
        duration_s
    );
    Ok("Records restored successfully".to_string())
}

#[tauri::command]
pub async fn permanently_delete_records(
    db_state: tauri::State<'_, DbState>,
    tableName: String,
    recordIds: Vec<String>,
) -> Result<String, String> {
    if recordIds.is_empty() {
        return Err("No record ids provided".to_string());
    }
    if !is_safe_table_ident(&tableName) {
        return Err("Invalid table name".to_string());
    }
    let mut db = db_state.db.lock().map_err(|e| e.to_string())?;
    let allowed: HashSet<String> = get_soft_delete_tables_internal(&db)?.into_iter().collect();
    if !allowed.contains(&tableName) {
        return Err("Table does not support soft delete".to_string());
    }
    ensure_can_hard_delete(&db, &tableName, &recordIds)?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for chunk in recordIds.chunks(IN_BATCH) {
        let ph: String = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let q = format!(
            "DELETE FROM {} WHERE id IN ({})",
            quote_ident(&tableName),
            ph
        );
        tx.execute(&q, rusqlite::params_from_iter(chunk))
            .map_err(map_hard_delete_error_rusqlite)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::delete",
        "Permanent delete from recycle: table={} count={}",
        tableName,
        recordIds.len()
    );
    Ok("Records permanently deleted".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        c
    }

    fn mk_table(c: &Connection) {
        c.execute_batch(
            "CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT, deleted_at TEXT, deleted_by TEXT);
             CREATE TABLE other (id TEXT PRIMARY KEY, name TEXT);",
        )
        .expect("ok");
    }

    #[test]
    fn discover_soft_delete_tables() {
        let c = mem();
        mk_table(&c);
        let t = get_soft_delete_tables_internal(&c).expect("t");
        assert!(t.contains(&"widgets".to_string()));
        assert!(!t.contains(&"other".to_string()));
    }

    #[test]
    fn restore_single_record_sql() {
        let c = mem();
        mk_table(&c);
        c.execute(
            "INSERT INTO widgets (id, name, deleted_at, deleted_by) VALUES ('1', 'A', '2020-01-01', 'u')",
            [],
        )
        .unwrap();
        c.execute(
            "UPDATE widgets SET deleted_at = NULL, deleted_by = NULL WHERE id = '1'",
            [],
        )
        .unwrap();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM widgets WHERE deleted_at IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn restore_bulk_sql() {
        let c = mem();
        mk_table(&c);
        c.execute(
            "INSERT INTO widgets (id, name, deleted_at) VALUES ('1','A','x'),('2','B','y')",
            [],
        )
        .unwrap();
        c.execute(
            "UPDATE widgets SET deleted_at = NULL, deleted_by = NULL WHERE id IN ('1','2')",
            [],
        )
        .unwrap();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM widgets WHERE deleted_at IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn permanent_delete_allowed_roundtrip() {
        let c = mem();
        c.execute_batch("CREATE TABLE solo (id TEXT PRIMARY KEY, deleted_at TEXT);")
            .unwrap();
        c.execute(
            "INSERT INTO solo (id, deleted_at) VALUES ('1', '2020-01-01')",
            [],
        )
        .unwrap();
        c.execute("DELETE FROM solo WHERE id = '1'", []).unwrap();
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM solo", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn permanent_delete_blocked_by_dependency() {
        let c = mem();
        c.execute_batch(
            "CREATE TABLE pblock (id TEXT PRIMARY KEY, deleted_at TEXT);
             CREATE TABLE cblock (id TEXT PRIMARY KEY, pid TEXT, deleted_at TEXT,
               FOREIGN KEY (pid) REFERENCES pblock(id));
             INSERT INTO pblock (id, deleted_at) VALUES ('1', '2020-01-01');
             INSERT INTO cblock (id, pid, deleted_at) VALUES ('c1', '1', '2020-01-01');",
        )
        .unwrap();
        let r = ensure_can_hard_delete(&c, "pblock", &["1".to_string()]);
        assert!(r.is_err(), "child references parent");
    }

    #[test]
    fn empty_recycle_soft_deleted_list() {
        let c = mem();
        mk_table(&c);
        let t = list_all_soft_deleted_for_recycle_bin(&c, None).expect("c");
        assert_eq!(t.len(), 0);
    }

    #[test]
    fn pagination_slice_respects_limit() {
        let c = mem();
        mk_table(&c);
        for i in 0..60 {
            c.execute(
                "INSERT INTO widgets (id, name, deleted_at) VALUES (?1, 'n', datetime('now'))",
                [format!("id_{i}")],
            )
            .unwrap();
        }
        let t = list_all_soft_deleted_for_recycle_bin(&c, None).expect("c");
        assert_eq!(t.len(), 60);
    }

    #[test]
    fn restore_parent_validation_blocks_missing_parent() {
        let c = mem();
        c.execute_batch(
            "CREATE TABLE p_missing (id TEXT PRIMARY KEY, deleted_at TEXT);
             CREATE TABLE c_missing (id TEXT PRIMARY KEY, parent_id TEXT, deleted_at TEXT,
               FOREIGN KEY (parent_id) REFERENCES p_missing(id));",
        )
        .unwrap();
        // Inconsistent child row: FKs were off (simulates legacy/migrated data with orphan refs).
        c.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        c.execute(
            "INSERT INTO c_missing (id, parent_id, deleted_at) VALUES ('c1', 'nope', '2020-01-01')",
            [],
        )
        .unwrap();
        c.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        let err = validate_restore_parents(&c, "c_missing", &["c1".to_string()], "test-attempt-1")
            .expect_err("err");
        assert!(err.contains("MISSING_PARENT"), "got {err}");
    }

    #[test]
    fn restore_parent_validation_blocks_soft_deleted_parent() {
        let c = mem();
        c.execute_batch(
            "CREATE TABLE p_soft (id TEXT PRIMARY KEY, deleted_at TEXT);
             CREATE TABLE c_soft (id TEXT PRIMARY KEY, parent_id TEXT, deleted_at TEXT,
               FOREIGN KEY (parent_id) REFERENCES p_soft(id));
             INSERT INTO p_soft (id, deleted_at) VALUES ('p1', '2020-01-01');
             INSERT INTO c_soft (id, parent_id, deleted_at) VALUES ('c1', 'p1', '2020-01-01');",
        )
        .unwrap();
        let err = validate_restore_parents(&c, "c_soft", &["c1".to_string()], "test-attempt-1")
            .expect_err("err");
        assert!(err.contains("MISSING_PARENT"), "got {err}");
    }

    #[test]
    fn restore_parent_validation_ok_when_parent_active() {
        let c = mem();
        c.execute_batch(
            "CREATE TABLE p_ok (id TEXT PRIMARY KEY, deleted_at TEXT);
             CREATE TABLE c_ok (id TEXT PRIMARY KEY, parent_id TEXT, deleted_at TEXT,
               FOREIGN KEY (parent_id) REFERENCES p_ok(id));
             INSERT INTO p_ok (id, deleted_at) VALUES ('p1', NULL);
             INSERT INTO c_ok (id, parent_id, deleted_at) VALUES ('c1', 'p1', '2020-01-01');",
        )
        .unwrap();
        validate_restore_parents(&c, "c_ok", &["c1".to_string()], "test-attempt-1").expect("ok");
    }
}
