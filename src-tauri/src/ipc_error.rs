//! Structured errors returned from selected Tauri commands for consistent UI handling.
use serde::{Deserialize, Serialize};
use std::fmt;

/// Serialized to the webview when a command fails (`code`, `message`, optional `details`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
}

#[allow(dead_code)]
impl IpcError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
            correlation_id: None,
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    pub fn with_correlation_id(mut self, correlation_id: impl Into<String>) -> Self {
        self.correlation_id = Some(correlation_id.into());
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
            message,
            details: None,
            correlation_id: None,
        }
    }
}

impl From<rusqlite::Error> for IpcError {
    fn from(e: rusqlite::Error) -> Self {
        Self {
            code: "sqlite".to_string(),
            message: e.to_string(),
            details: None,
            correlation_id: None,
        }
    }
}

impl From<serde_json::Error> for IpcError {
    fn from(e: serde_json::Error) -> Self {
        Self {
            code: "json".to_string(),
            message: e.to_string(),
            details: None,
            correlation_id: None,
        }
    }
}
