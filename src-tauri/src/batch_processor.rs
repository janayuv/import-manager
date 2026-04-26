//! Sequential batch processing for [`crate::commands::ai_extraction::extract_invoice_with_ai_inner`] (no change to per-file logic).

use crate::commands::ai_extraction::{
    extract_invoice_with_ai_inner, ExtractInvoiceRequest, ExtractInvoiceResponse,
};
use crate::db::DbState;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

/// Emitted before each file is processed: `{ current, total, fileName }`.
pub const BATCH_PROGRESS_EVENT: &str = "ai-invoice-batch-progress";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatchInvoiceItemResult {
    pub file_name: String,
    /// `"success"` or `"error"`.
    pub status: String,
    pub error: Option<String>,
    pub confidence_score: Option<f32>,
    pub log_id: Option<i64>,
    /// On success, full extraction for review / save in the UI.
    pub extraction: Option<ExtractInvoiceResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInvoiceBatchResult {
    pub results: Vec<BatchInvoiceItemResult>,
    pub total: usize,
    pub success_count: usize,
    pub error_count: usize,
}

/// Core loop: one [`extract_invoice_with_ai_inner`] per file, continue on error. No `App` events.
/// Only the `#[cfg(test)]` module calls this; production entry is [`process_invoice_batch`].
#[allow(dead_code)]
pub fn process_invoice_batch_inner(
    conn: &Connection,
    files: Vec<ExtractInvoiceRequest>,
) -> ProcessInvoiceBatchResult {
    process_invoice_batch_with_progress(conn, files, None)
}

fn process_invoice_batch_with_progress(
    conn: &Connection,
    files: Vec<ExtractInvoiceRequest>,
    app: Option<&AppHandle>,
) -> ProcessInvoiceBatchResult {
    let total = files.len();
    let mut results: Vec<BatchInvoiceItemResult> = Vec::with_capacity(total);
    let mut success_count: usize = 0;
    let mut error_count: usize = 0;
    for (i, request) in files.into_iter().enumerate() {
        if let Some(app) = app {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.emit(
                    BATCH_PROGRESS_EVENT,
                    serde_json::json!({
                        "current": i + 1,
                        "total": total,
                        "fileName": request.file_name,
                    }),
                );
            }
        }
        let file_name = request.file_name.clone();
        match extract_invoice_with_ai_inner(conn, request) {
            Ok(r) => {
                success_count += 1;
                let conf = r.confidence_score;
                let log_id = r.log_id;
                results.push(BatchInvoiceItemResult {
                    file_name,
                    status: "success".to_string(),
                    error: None,
                    confidence_score: Some(conf),
                    log_id: Some(log_id),
                    extraction: Some(r),
                });
            }
            Err(e) => {
                error_count += 1;
                results.push(BatchInvoiceItemResult {
                    file_name,
                    status: "error".to_string(),
                    error: Some(e),
                    confidence_score: None,
                    log_id: None,
                    extraction: None,
                });
            }
        }
    }
    ProcessInvoiceBatchResult {
        results,
        total,
        success_count,
        error_count,
    }
}

#[tauri::command]
pub fn process_invoice_batch(
    app: AppHandle,
    files: Vec<ExtractInvoiceRequest>,
    state: State<'_, DbState>,
) -> Result<ProcessInvoiceBatchResult, String> {
    if files.is_empty() {
        return Ok(ProcessInvoiceBatchResult {
            results: vec![],
            total: 0,
            success_count: 0,
            error_count: 0,
        });
    }
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?;
    Ok(process_invoice_batch_with_progress(&*conn, files, Some(&app)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::DatabaseMigrations;
    use rusqlite::Connection;

    fn conn() -> Connection {
        let mut c = Connection::open_in_memory().expect("in memory");
        DatabaseMigrations::run_migrations_test(&mut c).expect("migrate");
        c
    }

    fn mock_request(name: &str) -> ExtractInvoiceRequest {
        ExtractInvoiceRequest {
            file_bytes: vec![1, 2, 3, 4],
            file_name: name.to_string(),
            supplier_hint: None,
            provider: "mock".to_string(),
        }
    }

    #[test]
    fn single_file_succeeds() {
        let c = conn();
        let r = process_invoice_batch_inner(&c, vec![mock_request("a.pdf")]);
        assert_eq!(r.total, 1);
        assert_eq!(r.success_count, 1);
        assert_eq!(r.error_count, 0);
        assert_eq!(r.results[0].status, "success");
        assert!(r.results[0].extraction.is_some());
    }

    #[test]
    fn multiple_files_processed_sequentially() {
        let c = conn();
        let r = process_invoice_batch_inner(
            &c,
            vec![mock_request("a.pdf"), mock_request("b.pdf")],
        );
        assert_eq!(r.total, 2);
        assert_eq!(r.success_count, 2);
        assert_eq!(r.error_count, 0);
        assert_eq!(r.results[0].file_name, "a.pdf");
        assert_eq!(r.results[1].file_name, "b.pdf");
    }

    #[test]
    fn one_failure_does_not_stop_others() {
        let c = conn();
        let bad = ExtractInvoiceRequest {
            file_bytes: vec![],
            file_name: "empty.pdf".to_string(),
            supplier_hint: None,
            provider: "mock".to_string(),
        };
        let r = process_invoice_batch_inner(
            &c,
            vec![bad, mock_request("good.pdf")],
        );
        assert_eq!(r.total, 2);
        assert_eq!(r.success_count, 1);
        assert_eq!(r.error_count, 1);
        assert_eq!(r.results[0].status, "error");
        assert!(r.results[0].error.as_ref().is_some_and(|e| e.contains("file_bytes")));
        assert_eq!(r.results[1].status, "success");
    }
}
