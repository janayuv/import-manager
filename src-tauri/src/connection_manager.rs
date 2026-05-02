use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryMetric {
    pub query_name: String,
    pub duration_ms: u128,
    pub row_count: usize,
    pub logged_at: String,
}

pub struct ConnectionManager {
    db_path: PathBuf,
    metrics: Mutex<VecDeque<QueryMetric>>,
}

#[allow(dead_code)]
static GLOBAL_WRITE_QUEUE: OnceLock<Mutex<()>> = OnceLock::new();

impl ConnectionManager {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            metrics: Mutex::new(VecDeque::with_capacity(200)),
        }
    }

    pub fn get_read_connection(&self) -> Result<Connection, String> {
        Connection::open_with_flags(
            &self.db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| format!("Failed to open read connection: {e}"))
    }

    pub fn track_query(&self, query_name: &str, started: Instant, row_count: usize) {
        let duration_ms = started.elapsed().as_millis();
        let metric = QueryMetric {
            query_name: query_name.to_string(),
            duration_ms,
            row_count,
            logged_at: chrono::Local::now().to_rfc3339(),
        };
        if let Ok(mut metrics) = self.metrics.lock() {
            if metrics.len() >= 200 {
                metrics.pop_front();
            }
            metrics.push_back(metric);
        }
        if duration_ms > 200 {
            log::warn!(
                target: "import_manager::boe",
                "slow_query name={} duration_ms={} rows={}",
                query_name,
                duration_ms,
                row_count
            );
        } else {
            log::info!(
                target: "import_manager::boe",
                "query name={} duration_ms={} rows={}",
                query_name,
                duration_ms,
                row_count
            );
        }
    }

    pub fn recent_metrics(&self) -> Vec<QueryMetric> {
        self.metrics
            .lock()
            .map(|m| m.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn db_path(&self) -> &PathBuf {
        &self.db_path
    }

    #[allow(dead_code)]
    pub fn with_global_write_queue<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce() -> Result<T, String>,
    {
        let lock = GLOBAL_WRITE_QUEUE.get_or_init(|| Mutex::new(()));
        let _guard = lock
            .lock()
            .map_err(|e| format!("global write queue lock failed: {e}"))?;
        f()
    }
}
