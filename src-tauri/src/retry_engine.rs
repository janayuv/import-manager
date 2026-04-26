//! Constrained retries for HTTP-style transient failures (no extra DB or validation paths).

use std::time::Duration;

/// How many **additional** attempts to make after the first call fails with a [retriable] error.
/// With `2`, up to 3 total attempts, with delays 1s and 2s before the 2nd and 3rd.
pub const DEFAULT_MAX_RETRIES: usize = 2;

/// Used when no transport-level retries apply (e.g. local OCR).
pub const NO_TRANSPORT_RETRIES: usize = 0;

/// `true` for network / timeout / 5xx-style transport failures. Does not match validation or client (4xx) API errors.
pub fn is_retriable_network_timeout_or_5xx(err: &str) -> bool {
    let lower = err.to_lowercase();
    if lower.contains("timeout") || lower.contains("timed out") {
        return true;
    }
    if err.contains("Network error when calling")
        || err.contains("Local AI service not available")
    {
        return true;
    }
    // e.g. "… (HTTP 502)…" for server errors; does not match HTTP 4xx
    if err.contains("HTTP 5") {
        return true;
    }
    false
}

/// For OCR, local Tesseract: no string error is retried as network (placeholder for future I/O classifiers).
pub fn never_retriable(_err: &str) -> bool {
    false
}

/// Runs `operation` up to `1 + max_retries` times, sleeping `1s` then `2s` (etc.) only after a retriable failure.
/// Non-retriable errors return immediately with no further attempts.
pub fn execute_with_retry<T, F, P>(mut operation: F, max_retries: usize, is_retriable: P) -> Result<T, String>
where
    F: FnMut() -> Result<T, String>,
    P: Fn(&str) -> bool,
{
    let max_attempts = max_retries.saturating_add(1);
    for attempt in 0..max_attempts {
        match operation() {
            Ok(v) => return Ok(v),
            Err(e) => {
                if !is_retriable(&e) || attempt + 1 >= max_attempts {
                    return Err(e);
                }
                let delay = Duration::from_secs((attempt + 1) as u64);
                let n = attempt + 1;
                log::warn!(
                    target: "import_manager::retry",
                    "Retry attempt number {n} (waiting {}s before next try)",
                    delay.as_secs()
                );
                std::thread::sleep(delay);
            }
        }
    }
    Err("Operation failed after retries".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::rc::Rc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn always_r(e: &str) -> bool {
        e == "tr"
    }

    #[test]
    fn operation_succeeds_first_try() {
        let c = Rc::new(AtomicUsize::new(0));
        let c2 = c.clone();
        let r: Result<String, String> = execute_with_retry(
            || {
                c2.fetch_add(1, Ordering::SeqCst);
                Ok("ok".to_string())
            },
            DEFAULT_MAX_RETRIES,
            always_r,
        );
        assert_eq!(r.unwrap(), "ok");
        assert_eq!(c.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn operation_succeeds_after_retry() {
        let c = Rc::new(AtomicUsize::new(0));
        let c2 = c.clone();
        let r: Result<String, String> = execute_with_retry(
            || {
                let n = c2.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    return Err("tr".to_string());
                }
                Ok("win".to_string())
            },
            2,
            always_r,
        );
        assert_eq!(r.unwrap(), "win");
        assert_eq!(c.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn operation_fails_after_max_retries() {
        let c = Rc::new(AtomicUsize::new(0));
        let c2 = c.clone();
        let r: Result<(), String> = execute_with_retry(
            || {
                c2.fetch_add(1, Ordering::SeqCst);
                Err("tr".to_string())
            },
            1,
            always_r,
        );
        assert_eq!(c.load(Ordering::SeqCst), 2);
        assert_eq!(r.unwrap_err(), "tr");
    }

    #[test]
    fn retriable_marks_5xx_and_not_4xx() {
        assert!(is_retriable_network_timeout_or_5xx("DeepSeek API error (HTTP 502): x"));
        assert!(!is_retriable_network_timeout_or_5xx("DeepSeek API error (HTTP 400): x"));
    }

    #[test]
    fn retriable_marks_timeout_and_network() {
        assert!(is_retriable_network_timeout_or_5xx("AI extraction request timed out (60s). y"));
        assert!(is_retriable_network_timeout_or_5xx("Network error when calling AI API: z"));
        assert!(is_retriable_network_timeout_or_5xx("Local AI service not available."));
    }
}
