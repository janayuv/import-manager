//! Metadata-driven foreign key reference counts for safe hard deletes (no cascade, FK enforcement unchanged).
#![allow(non_snake_case)]

use crate::db::DbState;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::State;

// --- Hard delete tracing (shared across reference scan + delete commands) ---

pub(crate) fn summarize_record_ids_for_log(ids: &[String]) -> String {
    match ids.len() {
        0 => "(none)".to_string(),
        1 => ids[0].clone(),
        n => format!("(count={n} first_id={})", ids[0]),
    }
}

/// Logs FK edges that reference `parent_table` and their SQLite `ON DELETE` action.
pub fn log_hard_delete_fk_cascade_impact(conn: &Connection, parent_table: &str) -> Result<(), String> {
    log::info!(
        target: "import_manager::hard_delete",
        "[HARD_DELETE] Checking FK cascade impact parent_table={}",
        parent_table
    );
    if !is_safe_ident(parent_table) || !table_exists(conn, parent_table)? {
        return Ok(());
    }
    let all_tables = list_application_tables(conn)?;
    for child in all_tables {
        if !is_safe_ident(&child) {
            continue;
        }
        let mut stmt = conn
            .prepare("SELECT * FROM pragma_foreign_key_list(?)")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![&child])
            .map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let parent_ref: String = row.get(2).map_err(|e| e.to_string())?;
            if parent_ref != parent_table {
                continue;
            }
            let from_c: String = row.get(3).map_err(|e| e.to_string())?;
            let on_delete: String = row
                .get::<_, Option<String>>(6)
                .map_err(|e| e.to_string())?
                .unwrap_or_else(|| "NO ACTION".to_string());
            log::info!(
                target: "import_manager::hard_delete",
                "[HARD_DELETE] FK cascade edge child={} column={} on_delete={} -> parent={}",
                child,
                from_c,
                on_delete,
                parent_table
            );
        }
    }
    Ok(())
}

pub(crate) struct HardDeleteFnLogGuard {
    name: &'static str,
}

impl HardDeleteFnLogGuard {
    pub(crate) fn new(name: &'static str, table: &str, record_id_summary: &str, batch_number: &str) -> Self {
        log::info!(
            target: "import_manager::hard_delete",
            "[HARD_DELETE] Enter function: {} table={} record_id={} batch_number={}",
            name,
            table,
            record_id_summary,
            batch_number
        );
        Self { name }
    }
}

impl Drop for HardDeleteFnLogGuard {
    fn drop(&mut self) {
        log::info!(
            target: "import_manager::hard_delete",
            "[HARD_DELETE] Exit function: {}",
            self.name
        );
    }
}

fn hard_delete_log_child_table_scan(child_table: &str) {
    log::info!(
        target: "import_manager::hard_delete",
        "[HARD_DELETE] Deleting related records from {}",
        child_table
    );
}

thread_local! {
    static HARD_DELETE_ENSURE_KEYS: RefCell<HashSet<(String, String)>> =
        RefCell::new(HashSet::new());
}

struct HardDeleteEnsureRecursionGuard {
    keys: Vec<(String, String)>,
}

impl HardDeleteEnsureRecursionGuard {
    fn try_enter(table: &str, record_ids: &[String]) -> Result<Self, String> {
        let mut keys = Vec::new();
        HARD_DELETE_ENSURE_KEYS.with(|cell| {
            let mut set = cell.borrow_mut();
            for id in record_ids {
                let k = (table.to_string(), id.clone());
                if set.contains(&k) {
                    log::error!(
                        target: "import_manager::hard_delete",
                        "[HARD_DELETE ERROR] Recursive delete detected table={} id={}",
                        table,
                        id
                    );
                    return Err(
                        "Recursive delete detected during reference safety check".to_string(),
                    );
                }
                set.insert(k.clone());
                keys.push(k);
            }
            Ok(())
        })?;
        Ok(Self { keys })
    }
}

impl Drop for HardDeleteEnsureRecursionGuard {
    fn drop(&mut self) {
        HARD_DELETE_ENSURE_KEYS.with(|cell| {
            let mut set = cell.borrow_mut();
            for k in &self.keys {
                set.remove(k);
            }
        });
    }
}

const IN_CLAUSE_BATCH: usize = 100;
const SCAN_BUDGET: Duration = Duration::from_secs(5);
const PREVIEW_CACHE_TTL: Duration = Duration::from_secs(5);
const MAX_REFERENCE_SCAN_ROWS: i64 = 50_000;

// --- Startup diagnostics: FK index coverage, cycle presence ---

/// Run once after DB is opened: ensure FK child-column indexes exist, and log schema cycles.
/// Never fails the app startup.
pub fn run_startup_fk_diagnostics(conn: &Connection) {
    run_fk_index_diagnostics(conn);
    run_fk_cycle_diagnostics(conn);
}

fn fk_child_index_name(child_table: &str, fk_col: &str) -> String {
    let sanitize = |s: &str| -> String {
        s.chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect::<String>()
    };
    format!("idx_{}_{}", sanitize(child_table), sanitize(fk_col))
}

/// For each (child, fk_column) in `PRAGMA foreign_key_list`, ensure a leading index exists.
fn run_fk_index_diagnostics(conn: &Connection) {
    let tables = match list_application_tables(conn) {
        Ok(t) => t,
        Err(e) => {
            log::warn!(
                target: "import_manager::schema",
                "FK index check skipped (cannot list tables): {e}"
            );
            return;
        }
    };
    let mut seen: HashSet<(String, String)> = HashSet::new();
    for child in &tables {
        if !is_safe_ident(child) {
            continue;
        }
        let mut stmt = match conn.prepare("SELECT * FROM pragma_foreign_key_list(?)") {
            Ok(s) => s,
            Err(e) => {
                log::debug!(
                    target: "import_manager::schema",
                    "pragma_foreign_key_list({}) failed: {e}",
                    child
                );
                continue;
            }
        };
        let mut rows = match stmt.query(rusqlite::params![child]) {
            Ok(r) => r,
            Err(e) => {
                log::debug!(target: "import_manager::schema", "query fk list {}: {e}", child);
                continue;
            }
        };
        loop {
            let row = match rows.next() {
                Ok(r) => r,
                Err(e) => {
                    log::debug!(
                        target: "import_manager::schema",
                        "row fk list {child}: {e}"
                    );
                    break;
                }
            };
            let Some(row) = row else {
                break;
            };
            let from_c: String = match row.get(3) {
                Ok(x) => x,
                Err(_) => continue,
            };
            if !seen.insert((child.clone(), from_c.clone())) {
                continue;
            }
            match has_leading_index_on_fk_column(conn, child, &from_c) {
                Ok(true) => {}
                Ok(false) => {
                    let idx_name = fk_child_index_name(child, &from_c);
                    let create_idx_sql = format!(
                        "CREATE INDEX IF NOT EXISTS {} ON {}({})",
                        quote_ident(&idx_name),
                        quote_ident(child),
                        quote_ident(&from_c)
                    );
                    match conn.execute(&create_idx_sql, []) {
                        Ok(_) => {
                            log::info!(
                                target: "import_manager::schema",
                                "[FK INDEX] Created index on {}.{}",
                                child,
                                from_c
                            );
                        }
                        Err(e) => {
                            log::warn!(
                                target: "import_manager::schema",
                                "Failed to create FK index for {}.{}: {}",
                                child,
                                from_c,
                                e
                            );
                        }
                    }
                }
                Err(e) => {
                    log::debug!(
                        target: "import_manager::schema",
                        "index check for {}.{}: {e}",
                        child,
                        from_c
                    );
                }
            }
        }
    }
}

/// True if some index on `child_table` has `fk_col` as its first indexed column (lowest `seqno`).
fn has_leading_index_on_fk_column(
    conn: &Connection,
    child_table: &str,
    fk_col: &str,
) -> Result<bool, String> {
    let list_sql = format!("PRAGMA index_list({})", quote_ident(child_table));
    let mut names: Vec<String> = Vec::new();
    {
        let mut stmt = conn.prepare(&list_sql).map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        while let Some(r) = rows.next().map_err(|e| e.to_string())? {
            let name: String = r.get(1).map_err(|e| e.to_string())?;
            names.push(name);
        }
    }
    for idx_name in names {
        if idx_name.is_empty() {
            continue;
        }
        let info_sql = format!("PRAGMA index_info({})", quote_ident(&idx_name));
        let mut first_name: Option<String> = None;
        let mut min_seq: i64 = i64::MAX;
        {
            let mut stmt = conn.prepare(&info_sql).map_err(|e| e.to_string())?;
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            while let Some(r) = rows.next().map_err(|e| e.to_string())? {
                let seqno: i64 = r.get(0).map_err(|e| e.to_string())?;
                let col_name: Option<String> = r.get(2).map_err(|e| e.to_string())?;
                if seqno < min_seq {
                    min_seq = seqno;
                    first_name = col_name;
                }
            }
        }
        if let Some(n) = first_name {
            if n.eq_ignore_ascii_case(fk_col) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// DFS with `visiting` stack to find directed cycles in the child→parent FK graph; log and continue.
fn run_fk_cycle_diagnostics(conn: &Connection) {
    let tables = match list_application_tables(conn) {
        Ok(t) => t,
        Err(e) => {
            log::warn!(
                target: "import_manager::schema",
                "FK cycle check skipped (cannot list tables): {e}"
            );
            return;
        }
    };
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for child in &tables {
        if !is_safe_ident(child) {
            continue;
        }
        let mut stmt = match conn.prepare("SELECT * FROM pragma_foreign_key_list(?)") {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut rows = match stmt.query(rusqlite::params![child]) {
            Ok(r) => r,
            Err(_) => continue,
        };
        loop {
            let row = match rows.next() {
                Ok(r) => r,
                Err(_) => break,
            };
            let Some(row) = row else {
                break;
            };
            let parent: String = match row.get(2) {
                Ok(p) => p,
                Err(_) => continue,
            };
            if !is_safe_ident(&parent) {
                continue;
            }
            adj.entry(child.clone()).or_default().push(parent);
        }
    }

    let mut all_nodes: HashSet<String> = HashSet::new();
    for (a, ps) in &adj {
        all_nodes.insert(a.clone());
        for p in ps {
            all_nodes.insert(p.clone());
        }
    }

    let mut visiting: HashSet<String> = HashSet::new();
    let mut done: HashSet<String> = HashSet::new();
    for n in all_nodes {
        if done.contains(&n) {
            continue;
        }
        dfs_log_fk_cycle(&adj, &n, &mut visiting, &mut done);
    }
}

fn dfs_log_fk_cycle(
    adj: &HashMap<String, Vec<String>>,
    u: &str,
    visiting: &mut HashSet<String>,
    done: &mut HashSet<String>,
) {
    if done.contains(u) {
        return;
    }
    if visiting.contains(u) {
        log::warn!(
            target: "import_manager::schema",
            "Foreign key cycle detected in schema (reached table: {})",
            u
        );
        return;
    }
    visiting.insert(u.to_string());
    if let Some(neighbors) = adj.get(u) {
        for v in neighbors {
            dfs_log_fk_cycle(adj, v, visiting, done);
        }
    }
    visiting.remove(u);
    done.insert(u.to_string());
}

/// Binds for dynamic `IN` clauses.
fn batch_ids(record_ids: &[String]) -> impl Iterator<Item = &[String]> {
    record_ids.chunks(IN_CLAUSE_BATCH)
}

fn is_safe_ident(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c == '_')
}

fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// SQL fragment: `col IS NOT NULL AND col IN (...)` — count only real FKs (excludes NULL).
fn fk_in_clause_from_col_with_null_guard(from_col: &str, placeholders: &str) -> String {
    let qc = quote_ident(from_col);
    format!("{qc} IS NOT NULL AND {qc} IN ({placeholders})")
}

/// List user tables (excludes sqlite internal).
pub fn list_application_tables(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name")
        .map_err(|e| e.to_string())?;
    let tables: Result<Vec<String>, rusqlite::Error> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect();
    tables.map_err(|e| e.to_string())
}

/// Returns true if `name` is a real table in this database.
fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    let n: Option<i32> = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
            params![name],
            |_| Ok(1),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(n.is_some())
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ReferencingFk {
    child_table: String,
    from_col: String,
}

fn table_has_id_column(conn: &Connection, table_name: &str) -> Result<bool, String> {
    let q = format!("PRAGMA table_info({})", quote_ident(table_name));
    let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(r) = rows.next().map_err(|e| e.to_string())? {
        let name: String = r.get(1).map_err(|e| e.to_string())?;
        if name.eq_ignore_ascii_case("id") {
            return Ok(true);
        }
    }
    Ok(false)
}

fn collect_child_ids_for_fk(
    conn: &Connection,
    fk: &ReferencingFk,
    parent_ids: &[String],
) -> Result<Vec<String>, String> {
    if parent_ids.is_empty() || !table_has_id_column(conn, &fk.child_table)? {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for chunk in batch_ids(parent_ids) {
        if chunk.is_empty() {
            continue;
        }
        let placeholders = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let where_ = fk_in_clause_with_null_guard(&fk.from_col, &placeholders);
        let q = format!(
            "SELECT id FROM {} WHERE {}",
            quote_ident(&fk.child_table),
            where_
        );
        let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params_from_iter(chunk.iter().map(String::as_str)))
            .map_err(|e| e.to_string())?;
        while let Some(r) = rows.next().map_err(|e| e.to_string())? {
            let id_text = match r.get::<_, String>(0) {
                Ok(s) => s,
                Err(_) => r.get::<_, i64>(0).map(|n| n.to_string()).map_err(|e| e.to_string())?,
            };
            out.push(id_text);
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

fn delete_child_rows_for_fk(
    tx: &Transaction<'_>,
    fk: &ReferencingFk,
    parent_ids: &[String],
) -> Result<i64, String> {
    let mut deleted: i64 = 0;
    for chunk in batch_ids(parent_ids) {
        if chunk.is_empty() {
            continue;
        }
        let placeholders = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let where_ = fk_in_clause_with_null_guard(&fk.from_col, &placeholders);
        let q = format!("DELETE FROM {} WHERE {}", quote_ident(&fk.child_table), where_);
        let n = tx
            .execute(&q, rusqlite::params_from_iter(chunk.iter().map(String::as_str)))
            .map_err(map_hard_delete_error_rusqlite)?;
        deleted += n as i64;
    }
    Ok(deleted)
}

fn count_child_rows_for_fk(
    conn: &Connection,
    fk: &ReferencingFk,
    parent_ids: &[String],
) -> Result<i64, String> {
    let mut total = 0_i64;
    for chunk in batch_ids(parent_ids) {
        if chunk.is_empty() {
            continue;
        }
        let placeholders = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let where_ = fk_in_clause_with_null_guard(&fk.from_col, &placeholders);
        let q = format!("SELECT COUNT(*) FROM {} WHERE {}", quote_ident(&fk.child_table), where_);
        let c: i64 = conn
            .query_row(
                &q,
                rusqlite::params_from_iter(chunk.iter().map(String::as_str)),
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        total += c;
    }
    Ok(total)
}

fn resolve_delete_order_dfs(
    conn: &Connection,
    table: &str,
    visiting: &mut HashSet<String>,
    done: &mut HashSet<String>,
    out: &mut Vec<String>,
) -> Result<(), String> {
    if done.contains(table) {
        return Ok(());
    }
    if !visiting.insert(table.to_string()) {
        log::error!(
            target: "import_manager::hard_delete",
            "[HARD_DELETE ERROR] Recursive delete detected table={}",
            table
        );
        return Ok(());
    }
    let fks = discover_referencing_fks(conn, table)?;
    for fk in &fks {
        resolve_delete_order_dfs(conn, &fk.child_table, visiting, done, out)?;
        if !out.contains(&fk.child_table) {
            out.push(fk.child_table.clone());
        }
    }
    visiting.remove(table);
    done.insert(table.to_string());
    Ok(())
}

/// Resolve FK-based hard-delete order: deepest child tables first, parent last.
pub fn log_resolved_hard_delete_order(conn: &Connection, parent_table: &str) -> Result<(), String> {
    let mut visiting = HashSet::new();
    let mut done = HashSet::new();
    let mut out = Vec::new();
    resolve_delete_order_dfs(conn, parent_table, &mut visiting, &mut done, &mut out)?;
    out.push(parent_table.to_string());
    log::info!(
        target: "import_manager::hard_delete",
        "[HARD_DELETE] Delete order resolved: {}",
        out.join(" -> ")
    );
    Ok(())
}

fn delete_children_recursive(
    tx: &Transaction<'_>,
    parent_table: &str,
    parent_ids: &[String],
    seen: &mut HashSet<(String, String)>,
) -> Result<(), String> {
    if parent_ids.is_empty() {
        return Ok(());
    }
    let fks = discover_referencing_fks(tx, parent_table)?;
    for fk in &fks {
        log::info!(
            target: "import_manager::hard_delete",
            "[HARD_DELETE] Deleting child records from {}",
            fk.child_table
        );

        let child_ids = collect_child_ids_for_fk(tx, fk, parent_ids)?;
        for cid in &child_ids {
            let k = (fk.child_table.clone(), cid.clone());
            if !seen.insert(k) {
                log::error!(
                    target: "import_manager::hard_delete",
                    "[HARD_DELETE ERROR] Recursive delete detected table={} id={}",
                    fk.child_table,
                    cid
                );
                return Err("Recursive delete detected while resolving child dependencies".to_string());
            }
        }
        delete_children_recursive(tx, &fk.child_table, &child_ids, seen)?;

        let expected = count_child_rows_for_fk(tx, fk, parent_ids)?;
        let deleted = delete_child_rows_for_fk(tx, fk, parent_ids)?;
        if expected != deleted {
            return Err(format!(
                "Child delete verification failed for {}: expected {} rows, deleted {}",
                fk.child_table, expected, deleted
            ));
        }
    }
    Ok(())
}

/// Deletes all FK-dependent child rows for the given parent IDs (child-first, metadata-driven).
pub fn delete_fk_dependent_children(
    tx: &Transaction<'_>,
    parent_table: &str,
    parent_ids: &[String],
) -> Result<(), String> {
    let _trace = HardDeleteFnLogGuard::new(
        "delete_fk_dependent_children",
        parent_table,
        &summarize_record_ids_for_log(parent_ids),
        "n/a",
    );
    log_resolved_hard_delete_order(tx, parent_table)?;
    let mut seen = HashSet::new();
    delete_children_recursive(tx, parent_table, parent_ids, &mut seen)
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct HardDeleteImpactTableCount {
    pub table: String,
    pub records: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct HardDeleteImpactPreview {
    pub root_table: String,
    pub root_records: usize,
    pub total_with_dependencies: usize,
    pub by_table: Vec<HardDeleteImpactTableCount>,
}

fn collect_hard_delete_impact_recursive(
    conn: &Connection,
    table: &str,
    ids: &[String],
    seen: &mut HashSet<(String, String)>,
    by_table: &mut HashMap<String, HashSet<String>>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let entry = by_table.entry(table.to_string()).or_default();
    for id in ids {
        entry.insert(id.clone());
        if !seen.insert((table.to_string(), id.clone())) {
            log::error!(
                target: "import_manager::hard_delete",
                "[HARD_DELETE ERROR] Recursive delete detected table={} id={}",
                table,
                id
            );
            return Err("Recursive delete detected while computing hard-delete impact".to_string());
        }
    }
    let fks = discover_referencing_fks(conn, table)?;
    for fk in fks {
        let child_ids = collect_child_ids_for_fk(conn, &fk, ids)?;
        collect_hard_delete_impact_recursive(conn, &fk.child_table, &child_ids, seen, by_table)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn preview_hard_delete_impact(
    db_state: State<'_, DbState>,
    tableName: String,
    recordIds: Vec<String>,
) -> Result<HardDeleteImpactPreview, String> {
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    let mut seen = HashSet::new();
    let mut by_table: HashMap<String, HashSet<String>> = HashMap::new();
    collect_hard_delete_impact_recursive(&db, &tableName, &recordIds, &mut seen, &mut by_table)?;
    let mut by_table_vec: Vec<HardDeleteImpactTableCount> = by_table
        .into_iter()
        .map(|(table, ids)| HardDeleteImpactTableCount {
            table,
            records: ids.len(),
        })
        .collect();
    by_table_vec.sort_by(|a, b| a.table.cmp(&b.table));
    let total_with_dependencies = by_table_vec.iter().map(|x| x.records).sum();
    Ok(HardDeleteImpactPreview {
        root_table: tableName,
        root_records: recordIds.len(),
        total_with_dependencies,
        by_table: by_table_vec,
    })
}

/// Discover (child, fk column) pairs that point to `parent_table`.
/// Deduplicate `(child, from_col)` so self-referencing and duplicate pragma rows are not double-counted.
fn discover_referencing_fks(
    conn: &Connection,
    parent_table: &str,
) -> Result<Vec<ReferencingFk>, String> {
    if !is_safe_ident(parent_table) {
        return Err("Invalid table name".to_string());
    }
    if !table_exists(conn, parent_table)? {
        return Err("Table not found".to_string());
    }
    let _trace = HardDeleteFnLogGuard::new("discover_referencing_fks", parent_table, "-", "-");

    let all_tables = list_application_tables(conn)?;
    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut out: Vec<ReferencingFk> = Vec::new();
    let mut visited_child_tables: HashSet<String> = HashSet::new();

    for child in all_tables {
        if !is_safe_ident(&child) {
            continue;
        }
        if !visited_child_tables.insert(child.clone()) {
            log::warn!(
                target: "import_manager::delete::scan",
                "Foreign key scan: duplicate table in schema list (skipping re-scan): {}",
                child
            );
            continue;
        }
        let mut stmt = conn
            .prepare("SELECT * FROM pragma_foreign_key_list(?)")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params![&child])
            .map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let parent_ref: String = row.get(2).map_err(|e| e.to_string())?;
            if parent_ref != parent_table {
                continue;
            }
            let from_c: String = row.get(3).map_err(|e| e.to_string())?;
            let key = (child.clone(), from_c.clone());
            if !seen.insert(key) {
                continue; // self-ref / duplicate definition: one logical FK
            }
            out.push(ReferencingFk {
                child_table: child.clone(),
                from_col: from_c,
            });
        }
    }
    if cfg!(debug_assertions) {
        for fk in &out {
            if fk.child_table == parent_table {
                log::debug!(
                    target: "import_manager::delete::scan",
                    "self_referencing_fk: table={} column={} -> parent={} (de-duplicated)",
                    fk.child_table,
                    fk.from_col,
                    parent_table
                );
            }
        }
    }
    Ok(out)
}

fn debug_scan_log(msg: String) {
    if cfg!(debug_assertions) || log::log_enabled!(log::Level::Debug) {
        log::debug!(target: "import_manager::delete::scan", "{}", msg);
    }
}

enum CountOutcome {
    Total(i64),
    TimedOut,
}

/// Count rows in `fk.child_table` where `from_col` matches any of `ids` (batched IN), excluding NULL FKs.
fn count_references(
    conn: &Connection,
    fk: &ReferencingFk,
    ids: &[String],
    deadline: &mut Option<Instant>,
) -> Result<CountOutcome, String> {
    if ids.is_empty() {
        return Ok(CountOutcome::Total(0));
    }
    let _trace = HardDeleteFnLogGuard::new(
        "count_references",
        &fk.child_table,
        &summarize_record_ids_for_log(ids),
        "n/a",
    );
    hard_delete_log_child_table_scan(&fk.child_table);
    if check_deadline(deadline) {
        return Ok(CountOutcome::TimedOut);
    }
    let base = format!(
        "SELECT COUNT(*) FROM {} WHERE {{}}",
        quote_ident(&fk.child_table)
    );
    let mut total: i64 = 0;
    let mut processed_rows: i64 = 0;
    for chunk in batch_ids(ids) {
        if chunk.is_empty() {
            continue;
        }
        if check_deadline(deadline) {
            return Ok(CountOutcome::TimedOut);
        }
        let placeholders = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let where_ = fk_in_clause_with_null_guard(&fk.from_col, &placeholders);
        let q = base.replace("{}", &where_);
        let c: i64 = conn
            .query_row(
                &q,
                rusqlite::params_from_iter(chunk.iter().map(String::as_str)),
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        total = total.saturating_add(c);
        processed_rows = processed_rows.saturating_add(c);
        if processed_rows > MAX_REFERENCE_SCAN_ROWS {
            log::warn!(
                target: "import_manager::delete::scan",
                "[REFERENCE_SCAN] Budget exceeded, stopping scan."
            );
            return Ok(CountOutcome::Total(total));
        }
    }
    Ok(CountOutcome::Total(total))
}

fn check_deadline(deadline: &mut Option<Instant>) -> bool {
    if let Some(t) = deadline {
        if Instant::now() > *t {
            return true;
        }
    }
    false
}

/// Same null semantics as [count_references] WHERE clause.
fn fk_in_clause_with_null_guard(from_col: &str, placeholders: &str) -> String {
    fk_in_clause_from_col_with_null_guard(from_col, placeholders)
}

enum MatchedOutcome {
    Values(Vec<String>),
    TimedOut,
}

/// Distinct `from_col` values in child that are in `ids` and non-NULL.
fn matched_parent_ids_in_fk(
    conn: &Connection,
    fk: &ReferencingFk,
    ids: &[String],
    deadline: &mut Option<Instant>,
) -> Result<MatchedOutcome, String> {
    if ids.is_empty() {
        return Ok(MatchedOutcome::Values(Vec::new()));
    }
    let _trace = HardDeleteFnLogGuard::new(
        "matched_parent_ids_in_fk",
        &fk.child_table,
        &summarize_record_ids_for_log(ids),
        "n/a",
    );
    hard_delete_log_child_table_scan(&fk.child_table);
    if check_deadline(deadline) {
        return Ok(MatchedOutcome::TimedOut);
    }
    let qtmpl = format!(
        "SELECT DISTINCT {col} FROM {ct} WHERE {{}}",
        col = quote_ident(&fk.from_col),
        ct = quote_ident(&fk.child_table)
    );
    let mut out = Vec::new();
    let mut processed_rows: i64 = 0;
    for chunk in batch_ids(ids) {
        if check_deadline(deadline) {
            return Ok(MatchedOutcome::TimedOut);
        }
        if chunk.is_empty() {
            continue;
        }
        let placeholders = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let where_ = fk_in_clause_with_null_guard(&fk.from_col, &placeholders);
        let q = qtmpl.replace("{}", &where_);
        let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query(rusqlite::params_from_iter(chunk.iter().map(String::as_str)))
            .map_err(|e| e.to_string())?;
        while let Some(r) = rows.next().map_err(|e| e.to_string())? {
            if check_deadline(deadline) {
                return Ok(MatchedOutcome::TimedOut);
            }
            let v: String = r.get(0).map_err(|e| e.to_string())?;
            out.push(v);
            processed_rows = processed_rows.saturating_add(1);
            if processed_rows > MAX_REFERENCE_SCAN_ROWS {
                log::warn!(
                    target: "import_manager::delete::scan",
                    "[REFERENCE_SCAN] Budget exceeded, stopping scan."
                );
                return Ok(MatchedOutcome::Values(out));
            }
        }
    }
    Ok(MatchedOutcome::Values(out))
}

// --- Public DTOs ---

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TableRefCount {
    pub table: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct RecordReferenceCounts {
    pub record_id: String,
    pub references: Vec<TableRefCount>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct DeleteDependencySummary {
    pub table: String,
    pub total_references: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct PreviewDeleteDependenciesResult {
    pub total_records: usize,
    pub blocked_records: usize,
    pub dependency_summary: Vec<DeleteDependencySummary>,
    pub can_hard_delete: bool,
    /// Set when the scan was aborted to stay within the time budget; [can_hard_delete] is false.
    #[serde(default)]
    pub scan_timed_out: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DependencyBlockError {
    #[serde(rename = "type")]
    pub error_type: String,
    pub details: Vec<DeleteDependencySummary>,
}

/// Safe outcome when a scan overruns the budget: hard delete must not proceed.
fn preview_timed_out_result(total: usize) -> PreviewDeleteDependenciesResult {
    log::warn!(
        target: "import_manager::delete",
        "Reference scan timed out (safe fallback: block hard delete)"
    );
    PreviewDeleteDependenciesResult {
        total_records: total,
        blocked_records: 0,
        dependency_summary: vec![],
        can_hard_delete: false,
        scan_timed_out: true,
    }
}

/// Core implementation using an open `Connection` (e.g. under a lock).
pub fn get_reference_counts_conn(
    conn: &Connection,
    table_name: &str,
    record_ids: &[String],
) -> Result<Vec<RecordReferenceCounts>, String> {
    let _trace = HardDeleteFnLogGuard::new(
        "get_reference_counts_conn",
        table_name,
        &summarize_record_ids_for_log(record_ids),
        "n/a",
    );
    let start = Instant::now();
    let mut deadline = Some(start + SCAN_BUDGET);
    if !is_safe_ident(table_name) {
        return Err("Invalid table name".to_string());
    }
    if record_ids.is_empty() {
        return Ok(vec![]);
    }
    if !table_exists(conn, table_name)? {
        return Err("Table not found".to_string());
    }
    if check_deadline(&mut deadline) {
        return Err("Reference scan timed out".to_string());
    }
    let fks = discover_referencing_fks(conn, table_name)?;
    if cfg!(debug_assertions) {
        log::debug!(
            target: "import_manager::delete::scan",
            "get_reference_counts: table={} foreign_key_edges={} selected_ids={}",
            table_name,
            fks.len(),
            record_ids.len()
        );
    }
    if fks.is_empty() {
        return Ok(record_ids
            .iter()
            .map(|id| RecordReferenceCounts {
                record_id: id.clone(),
                references: vec![],
            })
            .collect());
    }

    let mut by_id: HashMap<String, HashMap<String, i64>> = record_ids
        .iter()
        .map(|id| (id.clone(), HashMap::new()))
        .collect();

    for fk in &fks {
        for chunk in batch_ids(record_ids) {
            if check_deadline(&mut deadline) {
                return Err("Reference scan timed out".to_string());
            }
            if chunk.is_empty() {
                continue;
            }
            hard_delete_log_child_table_scan(&fk.child_table);
            let placeholders = (0..chunk.len()).map(|_| "?").collect::<Vec<_>>().join(",");
            let where_in = fk_in_clause_with_null_guard(&fk.from_col, &placeholders);
            let q = format!(
                "SELECT {col}, COUNT(*) AS c FROM {ct} WHERE {w} GROUP BY {col}",
                col = quote_ident(&fk.from_col),
                ct = quote_ident(&fk.child_table),
                w = where_in
            );
            if cfg!(debug_assertions) {
                debug_scan_log(format!(
                    "get_reference_counts: GROUP query child_table={} from_col={}",
                    fk.child_table, fk.from_col
                ));
            }
            let mut stmt = conn.prepare(&q).map_err(|e| e.to_string())?;
            let mut rows = stmt
                .query(rusqlite::params_from_iter(chunk.iter().map(String::as_str)))
                .map_err(|e| e.to_string())?;
            while let Some(r) = rows.next().map_err(|e| e.to_string())? {
                if check_deadline(&mut deadline) {
                    return Err("Reference scan timed out".to_string());
                }
                let key: String = r.get(0).map_err(|e| e.to_string())?;
                let cnt: i64 = r.get(1).map_err(|e| e.to_string())?;
                if let Some(m) = by_id.get_mut(&key) {
                    *m.entry(fk.child_table.clone()).or_insert(0) += cnt;
                }
            }
        }
    }

    let mut out = Vec::with_capacity(record_ids.len());
    for id in record_ids {
        if check_deadline(&mut deadline) {
            return Err("Reference scan timed out".to_string());
        }
        let per_table = by_id.get(id).cloned().unwrap_or_default();
        let references: Vec<TableRefCount> = per_table
            .into_iter()
            .map(|(table, count)| TableRefCount { table, count })
            .filter(|r| r.count > 0)
            .collect();
        out.push(RecordReferenceCounts {
            record_id: id.clone(),
            references,
        });
    }
    Ok(out)
}

/// Batched, aggregated preview for delete confirmation UI.
pub fn preview_delete_dependencies_conn(
    conn: &Connection,
    table_name: &str,
    record_ids: &[String],
) -> Result<PreviewDeleteDependenciesResult, String> {
    preview_delete_dependencies_conn_with_budget(conn, table_name, record_ids, SCAN_BUDGET)
}

/// Like [preview_delete_dependencies_conn] with an explicit time budget (used in unit tests for timeouts).
pub(crate) fn preview_delete_dependencies_conn_with_budget(
    conn: &Connection,
    table_name: &str,
    record_ids: &[String],
    budget: Duration,
) -> Result<PreviewDeleteDependenciesResult, String> {
    let _trace = HardDeleteFnLogGuard::new(
        "preview_delete_dependencies_conn_with_budget",
        table_name,
        &summarize_record_ids_for_log(record_ids),
        "n/a",
    );
    let start = Instant::now();
    let mut deadline = Some(start + budget);
    if !is_safe_ident(table_name) {
        return Err("Invalid table name".to_string());
    }
    if record_ids.is_empty() {
        return Ok(PreviewDeleteDependenciesResult {
            total_records: 0,
            blocked_records: 0,
            dependency_summary: vec![],
            can_hard_delete: true,
            scan_timed_out: false,
        });
    }
    if !table_exists(conn, table_name)? {
        return Err("Table not found".to_string());
    }
    if check_deadline(&mut deadline) {
        return Ok(preview_timed_out_result(record_ids.len()));
    }

    let fks = discover_referencing_fks(conn, table_name)?;
    if cfg!(debug_assertions) {
        log::debug!(
            target: "import_manager::delete::scan",
            "preview: table={} unique_fk_columns={} record_ids={}",
            table_name,
            fks.len(),
            record_ids.len()
        );
    }
    let total_records = record_ids.len();
    let id_set: HashSet<String> = record_ids.iter().cloned().collect();

    let mut summary_map: HashMap<String, i64> = HashMap::new();
    for fk in &fks {
        if check_deadline(&mut deadline) {
            return Ok(preview_timed_out_result(total_records));
        }
        if cfg!(debug_assertions) {
            log::debug!(
                target: "import_manager::delete::scan",
                "preview: counting child={} from_col={} (parent={})",
                fk.child_table, fk.from_col, table_name
            );
        }
        let t = match count_references(conn, fk, record_ids, &mut deadline)? {
            CountOutcome::TimedOut => {
                return Ok(preview_timed_out_result(total_records));
            }
            CountOutcome::Total(n) => n,
        };
        if cfg!(debug_assertions) {
            log::debug!(
                target: "import_manager::delete::scan",
                "preview: count={} table={} column={}",
                t, fk.child_table, fk.from_col
            );
        }
        if t > 0 {
            *summary_map.entry(fk.child_table.clone()).or_insert(0) += t;
        }
    }

    if check_deadline(&mut deadline) {
        return Ok(preview_timed_out_result(total_records));
    }

    let mut dependency_summary: Vec<DeleteDependencySummary> = summary_map
        .into_iter()
        .map(|(table, total_references)| DeleteDependencySummary {
            table,
            total_references,
        })
        .collect();
    dependency_summary.sort_by(|a, b| a.table.cmp(&b.table));
    let total_ref_rows: i64 = dependency_summary.iter().map(|d| d.total_references).sum();
    let can_hard_delete = total_ref_rows == 0;

    // Only selected parent IDs that still appear as non-NULL foreign keys in referencing rows.
    let mut blocked: HashSet<String> = HashSet::new();
    if !can_hard_delete {
        for fk in &fks {
            if check_deadline(&mut deadline) {
                return Ok(preview_timed_out_result(total_records));
            }
            let rows = match matched_parent_ids_in_fk(conn, fk, record_ids, &mut deadline)? {
                MatchedOutcome::TimedOut => {
                    return Ok(preview_timed_out_result(total_records));
                }
                MatchedOutcome::Values(v) => v,
            };
            for m in rows {
                if !m.is_empty() && id_set.contains(&m) {
                    blocked.insert(m);
                }
            }
        }
    }
    if check_deadline(&mut deadline) {
        return Ok(preview_timed_out_result(total_records));
    }

    Ok(PreviewDeleteDependenciesResult {
        total_records,
        blocked_records: blocked.len(),
        dependency_summary,
        can_hard_delete,
        scan_timed_out: false,
    })
}

/// Ensures a hard delete is safe: no referencing rows, and the reference scan finished (not timed out).
pub fn ensure_can_hard_delete(
    conn: &Connection,
    table_name: &str,
    record_ids: &[String],
) -> Result<(), String> {
    let _rec_guard = HardDeleteEnsureRecursionGuard::try_enter(table_name, record_ids)?;
    let _trace = HardDeleteFnLogGuard::new(
        "ensure_can_hard_delete",
        table_name,
        &summarize_record_ids_for_log(record_ids),
        "n/a",
    );
    log_hard_delete_fk_cascade_impact(conn, table_name)?;
    let p = preview_delete_dependencies_conn(conn, table_name, record_ids)?;
    if p.scan_timed_out {
        return Err(
            "Reference scan timed out; hard delete is disabled for safety. Try a smaller selection or retry."
                .to_string(),
        );
    }
    if p.can_hard_delete {
        return Ok(());
    }
    let err = DependencyBlockError {
        error_type: "DEPENDENCY_EXISTS".to_string(),
        details: p.dependency_summary,
    };
    let s = serde_json::to_string(&err).map_err(|e| e.to_string())?;
    Err(s)
}

/// Map raw SQLite delete errors to a user-facing message; log the original.
pub fn map_hard_delete_error(err: &str) -> String {
    let lower = err.to_lowercase();
    if lower.contains("foreign key") {
        log::error!(target: "import_manager::delete", "Hard delete (SQLite): {}", err);
        "Cannot hard delete — record is referenced in other modules.".to_string()
    } else {
        err.to_string()
    }
}

/// Map `rusqlite::Error` from a hard delete `execute`.
pub fn map_hard_delete_error_rusqlite(e: rusqlite::Error) -> String {
    map_hard_delete_error(&e.to_string())
}

// --- Short-lived preview cache (IPC only; [ensure_can_hard_delete] does not use this) ---

#[derive(Eq, PartialEq, Hash, Clone)]
struct PreviewCacheKey {
    table: String,
    ids_hash: u64,
}

struct PreviewCacheEntry {
    stored_at: Instant,
    result: PreviewDeleteDependenciesResult,
}

fn stable_hash_record_ids(ids: &[String]) -> u64 {
    let mut sorted: Vec<String> = ids.to_vec();
    sorted.sort();
    let mut h = DefaultHasher::new();
    for s in sorted {
        s.hash(&mut h);
    }
    h.finish()
}

fn preview_cache() -> &'static Mutex<HashMap<PreviewCacheKey, PreviewCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<PreviewCacheKey, PreviewCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prune_preview_cache(map: &mut HashMap<PreviewCacheKey, PreviewCacheEntry>, now: Instant) {
    map.retain(|_, e| now.duration_since(e.stored_at) < PREVIEW_CACHE_TTL);
}

#[tauri::command]
pub async fn get_reference_counts(
    db_state: State<'_, DbState>,
    tableName: String,
    recordIds: Vec<String>,
) -> Result<Vec<RecordReferenceCounts>, String> {
    let _trace = HardDeleteFnLogGuard::new(
        "get_reference_counts",
        &tableName,
        &summarize_record_ids_for_log(&recordIds),
        "n/a",
    );
    let db = db_state.db.lock().map_err(|e| e.to_string())?;
    get_reference_counts_conn(&db, &tableName, &recordIds)
}

#[tauri::command]
pub async fn preview_delete_dependencies(
    db_state: State<'_, DbState>,
    tableName: String,
    recordIds: Vec<String>,
) -> Result<PreviewDeleteDependenciesResult, String> {
    let _trace = HardDeleteFnLogGuard::new(
        "preview_delete_dependencies",
        &tableName,
        &summarize_record_ids_for_log(&recordIds),
        "n/a",
    );
    let scan_start = Instant::now();
    let log_table = tableName.clone();
    let key = PreviewCacheKey {
        table: tableName.clone(),
        ids_hash: stable_hash_record_ids(&recordIds),
    };

    {
        let mut g = preview_cache().lock().map_err(|e| e.to_string())?;
        let now = Instant::now();
        prune_preview_cache(&mut g, now);
        if let Some(entry) = g.get(&key) {
            if now.duration_since(entry.stored_at) < PREVIEW_CACHE_TTL {
                let p = entry.result.clone();
                let elapsed = scan_start.elapsed();
                log::info!(
                    target: "import_manager::delete",
                    "Reference scan completed in {:.2} seconds (cached)",
                    elapsed.as_secs_f64()
                );
                log::info!(
                    target: "import_manager::delete",
                    "Delete preview: table={} record_count={} can_hard_delete={} timed_out={}",
                    log_table,
                    p.total_records,
                    p.can_hard_delete,
                    p.scan_timed_out
                );
                return Ok(p);
            }
        }
    }

    let p = {
        let db = db_state.db.lock().map_err(|e| e.to_string())?;
        preview_delete_dependencies_conn(&db, &tableName, &recordIds)
    }?;

    let elapsed = scan_start.elapsed();
    log::info!(
        target: "import_manager::delete",
        "Reference scan completed in {:.2} seconds",
        elapsed.as_secs_f64()
    );
    {
        let mut g = preview_cache().lock().map_err(|e| e.to_string())?;
        let now = Instant::now();
        prune_preview_cache(&mut g, now);
        g.insert(
            key,
            PreviewCacheEntry {
                stored_at: now,
                result: p.clone(),
            },
        );
    }
    log::info!(
        target: "import_manager::delete",
        "Delete preview: table={} record_count={} can_hard_delete={} timed_out={}",
        log_table,
        p.total_records,
        p.can_hard_delete,
        p.scan_timed_out
    );
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn open_mem() -> Connection {
        let c = Connection::open_in_memory().expect("in-memory");
        c.execute_batch("PRAGMA foreign_keys = ON;")
            .expect("pragma");
        c
    }

    #[test]
    fn self_referencing_fk_counts_once_per_child_row() {
        let c = open_mem();
        c.execute_batch(
            "CREATE TABLE categories (id TEXT PRIMARY KEY, parent_id TEXT,
             FOREIGN KEY (parent_id) REFERENCES categories(id));
             INSERT INTO categories VALUES ('r', NULL);
             INSERT INTO categories VALUES ('a', 'r');
             INSERT INTO categories VALUES ('b', 'r');",
        )
        .expect("schema");
        let p = preview_delete_dependencies_conn(&c, "categories", &["r".to_string()])
            .expect("preview");
        assert!(!p.can_hard_delete, "children reference parent r");
        let cat = p
            .dependency_summary
            .iter()
            .find(|d| d.table == "categories")
            .expect("self-table summary");
        assert_eq!(
            cat.total_references, 2,
            "two child rows, not double-counted"
        );
    }

    #[test]
    fn null_foreign_key_values_not_counted() {
        let c = open_mem();
        c.execute_batch(
            "CREATE TABLE tparent (id TEXT PRIMARY KEY);
             CREATE TABLE tchild (id TEXT PRIMARY KEY, pid TEXT,
             FOREIGN KEY (pid) REFERENCES tparent(id));
             INSERT INTO tparent VALUES ('p1');
             INSERT INTO tchild VALUES ('c1', NULL);
             INSERT INTO tchild VALUES ('c2', 'p1');",
        )
        .expect("schema");
        let p =
            preview_delete_dependencies_conn(&c, "tparent", &["p1".to_string()]).expect("preview");
        assert!(!p.can_hard_delete);
        let ch = p
            .dependency_summary
            .iter()
            .find(|d| d.table == "tchild")
            .expect("tchild");
        assert_eq!(ch.total_references, 1);
    }

    #[test]
    fn large_id_list_scan_completes() {
        let c = open_mem();
        c.execute_batch("CREATE TABLE wide (id TEXT PRIMARY KEY);")
            .expect("schema");
        let ids: Vec<String> = (0..600).map(|i| format!("id_{i}")).collect();
        let p = preview_delete_dependencies_conn(&c, "wide", &ids).expect("preview");
        assert_eq!(p.total_records, 600);
        assert!(p.can_hard_delete);
        assert!(!p.scan_timed_out);
    }

    #[test]
    fn mixed_selection_blocked_records_accurate() {
        let c = open_mem();
        c.execute_batch(
            "CREATE TABLE mp (id TEXT PRIMARY KEY);
             CREATE TABLE mc (id TEXT PRIMARY KEY, pid TEXT,
             FOREIGN KEY (pid) REFERENCES mp(id));
             INSERT INTO mp VALUES ('a');
             INSERT INTO mp VALUES ('b');
             INSERT INTO mc VALUES ('x', 'a');",
        )
        .expect("schema");
        let p = preview_delete_dependencies_conn(&c, "mp", &["a".to_string(), "b".to_string()])
            .expect("preview");
        assert_eq!(p.blocked_records, 1);
        assert!(!p.can_hard_delete);
    }

    #[test]
    fn zero_budget_aborts_to_safe_preview() {
        let c = open_mem();
        c.execute_batch("CREATE TABLE zt (id TEXT PRIMARY KEY);")
            .expect("schema");
        let p = preview_delete_dependencies_conn_with_budget(
            &c,
            "zt",
            &["1".to_string()],
            Duration::ZERO,
        )
        .expect("ok err result");
        assert!(p.scan_timed_out);
        assert!(!p.can_hard_delete);
    }

    #[test]
    fn fk_leading_index_detection() {
        let c = open_mem();
        c.execute_batch(
            "CREATE TABLE p_idx (id TEXT PRIMARY KEY);
             CREATE TABLE c_idx (id TEXT PRIMARY KEY, pid TEXT,
             FOREIGN KEY (pid) REFERENCES p_idx(id));",
        )
        .expect("schema");
        assert!(!has_leading_index_on_fk_column(&c, "c_idx", "pid").expect("q"));
        c.execute_batch("CREATE INDEX c_idx_pid ON c_idx(pid);")
            .expect("ix");
        assert!(has_leading_index_on_fk_column(&c, "c_idx", "pid").expect("q2"));
    }

    #[test]
    fn fk_cycle_diagnostics_does_not_panic_on_self_reference() {
        let c = open_mem();
        c.execute_batch("CREATE TABLE cyc (id TEXT PRIMARY KEY, p TEXT REFERENCES cyc(id));")
            .expect("schema");
        run_fk_cycle_diagnostics(&c);
    }

    #[test]
    fn stable_hash_ids_order_independent() {
        let a = vec!["b".to_string(), "a".to_string()];
        let b = vec!["a".to_string(), "b".to_string()];
        assert_eq!(stable_hash_record_ids(&a), stable_hash_record_ids(&b));
    }
}
