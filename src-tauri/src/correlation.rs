//! Short-lived correlation IDs for workflow tracing (logs + IPC errors).

/// New unique correlation ID for a workflow entry point.
#[inline]
pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Append correlation to a flat error string (for `Result<_, String>` commands).
#[inline]
pub fn annotate_err(cid: &str, message: impl Into<String>) -> String {
    let msg = message.into();
    format!("{msg} [correlation_id={cid}]")
}
