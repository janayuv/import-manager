//! Read-only metrics from `ai_extraction_log` (no changes to the extraction pipeline).

use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Aggregated counts and average confidence for all rows in `ai_extraction_log`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiExtractionSummary {
    pub total: i64,
    pub success_count: i64,
    pub failure_count: i64,
    pub ocr_count: i64,
    /// `None` when there are no rows with a non-null `confidence_score`, or no rows.
    pub avg_confidence: Option<f64>,
}

/// One row from `GROUP BY provider_used`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageRow {
    pub provider_used: String,
    pub count: i64,
}

/// Runs the summary aggregate query (read-only).
pub fn read_ai_extraction_summary(conn: &rusqlite::Connection) -> Result<AiExtractionSummary, String> {
    let (total, s_ok, f_ok, o_ok, avg) = conn
        .query_row(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failure_count,
                SUM(CASE WHEN status = 'ocr-fallback' THEN 1 ELSE 0 END) AS ocr_count,
                AVG(confidence_score) AS avg_confidence
            FROM ai_extraction_log",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                    row.get::<_, Option<f64>>(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(AiExtractionSummary {
        total,
        success_count: s_ok.unwrap_or(0),
        failure_count: f_ok.unwrap_or(0),
        ocr_count: o_ok.unwrap_or(0),
        avg_confidence: avg,
    })
}

/// `provider_used` usage counts, sorted by `provider_used` for stable output.
pub fn read_provider_usage_summary(
    conn: &rusqlite::Connection,
) -> Result<Vec<ProviderUsageRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT provider_used, COUNT(*) AS cnt
             FROM ai_extraction_log
             GROUP BY provider_used
             ORDER BY provider_used",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ProviderUsageRow {
                provider_used: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out: Vec<ProviderUsageRow> = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_ai_extraction_summary(state: State<'_, DbState>) -> Result<AiExtractionSummary, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    read_ai_extraction_summary(&*conn)
}

#[tauri::command]
pub fn get_provider_usage_summary(
    state: State<'_, DbState>,
) -> Result<Vec<ProviderUsageRow>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    read_provider_usage_summary(&*conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::DatabaseMigrations;
    use rusqlite::params;
    use rusqlite::Connection;

    fn conn_with_log() -> Connection {
        let mut c = Connection::open_in_memory().expect("in memory");
        DatabaseMigrations::run_migrations_test(&mut c).expect("migrate");
        c
    }

    fn insert_row(
        conn: &Connection,
        status: &str,
        provider: &str,
        confidence: Option<f64>,
    ) {
        conn.execute(
            "INSERT INTO ai_extraction_log (file_hash, file_name, supplier_hint, provider_used, prompt_version, status, confidence_score) \
             VALUES ('h1', 'f1', NULL, ?1, 'v1', ?2, ?3)",
            params![provider, status, confidence],
        )
        .expect("ins");
    }

    #[test]
    fn empty_dataset_all_zeros_and_no_avg() {
        let c = conn_with_log();
        let s = read_ai_extraction_summary(&c).expect("q");
        assert_eq!(s.total, 0);
        assert_eq!(s.success_count, 0);
        assert_eq!(s.ocr_count, 0);
        assert!(s.avg_confidence.is_none());
        let p = read_provider_usage_summary(&c).expect("p");
        assert!(p.is_empty());
    }

    #[test]
    fn summary_counts_by_status() {
        let c = conn_with_log();
        insert_row(&c, "success", "mock", Some(0.8));
        insert_row(&c, "success", "deepseek", Some(0.9));
        insert_row(&c, "failed", "deepseek", None);
        insert_row(&c, "ocr-fallback", "local", Some(0.4));
        insert_row(&c, "mock", "mock", None);
        let s = read_ai_extraction_summary(&c).expect("q");
        assert_eq!(s.total, 5);
        assert_eq!(s.success_count, 2);
        assert_eq!(s.failure_count, 1);
        assert_eq!(s.ocr_count, 1);
        let avg = s.avg_confidence.expect("avg");
        // (0.8 + 0.9 + 0.4) / 3 = 0.7 for rows with numeric confidence; mock row NULL excluded from AVG? AVG ignores NULL, so 3 values -> (0.8+0.9+0.4)/3
        assert!((avg - (0.8 + 0.9 + 0.4) / 3.0).abs() < 0.0001);
    }

    #[test]
    fn provider_grouping() {
        let c = conn_with_log();
        insert_row(&c, "success", "mock", None);
        insert_row(&c, "success", "mock", None);
        insert_row(&c, "failed", "deepseek", None);
        let p = read_provider_usage_summary(&c).expect("p");
        assert_eq!(p.len(), 2);
        let mock = p.iter().find(|x| x.provider_used == "mock").expect("m");
        assert_eq!(mock.count, 2);
        let d = p.iter().find(|x| x.provider_used == "deepseek").expect("d");
        assert_eq!(d.count, 1);
    }
}
