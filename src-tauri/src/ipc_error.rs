//! Structured errors returned from selected Tauri commands for consistent UI handling.
use serde::{Deserialize, Serialize};
use std::fmt;

/// Serialized to the webview when a command fails (`code`, `message`, optional `details`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub category: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

#[allow(dead_code)]
impl IpcError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        let code_str = code.into();
        let msg_str = message.into();
        crate::commands::error_memory::record_ipc_error_autolog(
            &code_str,
            categorize_code(&code_str),
            &msg_str,
        );
        Self {
            category: categorize_code(&code_str).to_string(),
            code: code_str,
            message: msg_str,
            details: None,
            correlation_id: None,
            retryable: None,
        }
    }

    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.category = category.into();
        self
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    pub fn with_correlation_id(mut self, correlation_id: impl Into<String>) -> Self {
        self.correlation_id = Some(correlation_id.into());
        self
    }

    pub fn with_retryable(mut self, retryable: bool) -> Self {
        self.retryable = Some(retryable);
        self
    }
}

impl fmt::Display for IpcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for IpcError {}

impl From<String> for IpcError {
    fn from(message: String) -> Self {
        Self {
            code: "internal".to_string(),
            category: "internal".to_string(),
            message,
            details: None,
            correlation_id: None,
            retryable: None,
        }
    }
}

impl From<rusqlite::Error> for IpcError {
    fn from(e: rusqlite::Error) -> Self {
        Self {
            code: "sqlite".to_string(),
            category: "database".to_string(),
            message: e.to_string(),
            details: None,
            correlation_id: None,
            retryable: Some(false),
        }
    }
}

impl From<serde_json::Error> for IpcError {
    fn from(e: serde_json::Error) -> Self {
        Self {
            code: "json".to_string(),
            category: "validation".to_string(),
            message: e.to_string(),
            details: None,
            correlation_id: None,
            retryable: Some(false),
        }
    }
}

impl From<std::io::Error> for IpcError {
    fn from(e: std::io::Error) -> Self {
        Self {
            code: "io".to_string(),
            category: "internal".to_string(),
            message: e.to_string(),
            details: None,
            correlation_id: None,
            retryable: Some(false),
        }
    }
}

impl From<&str> for IpcError {
    fn from(message: &str) -> Self {
        Self::new("internal", message)
    }
}

fn categorize_code(code: &str) -> &'static str {
    if code.starts_with("auth") {
        "auth"
    } else if code.contains("validation") || code == "missing_parent" || code == "json" {
        "validation"
    } else if code.contains("sqlite") || code.contains("db") {
        "database"
    } else if code.contains("google_drive") || code.contains("network") {
        "integration"
    } else {
        "internal"
    }
}
