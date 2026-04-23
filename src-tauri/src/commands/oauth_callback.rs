//! Local HTTP redirect callback for Google OAuth (127.0.0.1:8765).
use std::io::Read;
use std::io::Write;
use std::net::TcpListener;
use std::time::Duration;

use open;

fn oauth_err(detail: impl std::fmt::Display) -> String {
    format!("GDRIVE_ERROR:oauth: {detail}")
}

const OAUTH_LOCAL_PORT: u16 = 8765;

/// Opens the browser, accepts one redirect, returns the `code` query param.
pub fn capture_oauth_code(auth_url: &str) -> Result<String, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{OAUTH_LOCAL_PORT}")).map_err(|e| {
        oauth_err(format!(
            "Could not listen on port {OAUTH_LOCAL_PORT} ({e}). Add http://127.0.0.1:{OAUTH_LOCAL_PORT}/ as a redirect URI."
        ))
    })?;
    listener.set_nonblocking(false).map_err(|e| e.to_string())?;

    open::that(auth_url).map_err(|e| oauth_err(format!("Could not open browser: {e}")))?;

    let (mut stream, _) = listener
        .accept()
        .map_err(|e| oauth_err(format!("OAuth redirect failed: {e}")))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));

    let mut buf: Vec<u8> = vec![0u8; 65536];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);

    let body: &[u8] = br#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>Import Manager</title></head><body><p>Sign-in complete. You can close this window.</p><script>setTimeout(function(){try{window.close();}catch(e){}},400);</script></body></html>"#;
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.write_all(body);

    if let Some(err) = extract_param_value(&req, "error", false) {
        if !err.is_empty() && !err.eq_ignore_ascii_case("access_denied") {
            return Err(oauth_err(format!("Google returned an error: {err}")));
        }
    }

    let code = extract_authorization_code(&req)
        .ok_or_else(|| oauth_err("No authorization code in callback."))?;
    if code.is_empty() {
        return Err(oauth_err("No authorization code in callback."));
    }

    log::info!(target: "import_manager::gdrive", "OAuth code received");
    Ok(code)
}

/// Prefer the request line, then full buffer (fragmented / unusual clients).
fn extract_authorization_code(req: &str) -> Option<String> {
    if let Some(c) = first_line_code(req) {
        if !c.is_empty() {
            return Some(c);
        }
    }
    extract_param_value(req, "code", true)
}

/// First `GET` line, query string `?` …
fn first_line_code(req: &str) -> Option<String> {
    let line = req.lines().next()?;
    let path = line.split_whitespace().nth(1)?;
    if let Some(q) = path.find('?') {
        let query = &path[q + 1..];
        return query_string_param(query, "code");
    }
    if path.contains("code=") {
        return extract_param_value(path, "code", true);
    }
    None
}

/// `query` = text after `?` (pair may include fragment after `#`).
fn query_string_param(query: &str, name: &str) -> Option<String> {
    let name_eq = format!("{name}=");
    for pair in query.split('&') {
        if let Some(rest) = pair.strip_prefix(&name_eq) {
            let v = value_until_delim(rest);
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    None
}

/// Value until `&`, space, line break, or `#`.
fn value_until_delim(rest: &str) -> String {
    let mut s = rest;
    if let Some(p) = s.find('#') {
        s = s.get(..p).unwrap_or(s);
    }
    let end = s.find(&['&', ' ', '\r', '\n', '\0'][..]).unwrap_or(s.len());
    s = s.get(..end).unwrap_or(s);
    urlencoding::decode(s)
        .map(|c| c.into_owned())
        .unwrap_or_else(|_| s.to_string())
}

fn extract_param_value(full: &str, name: &str, is_code: bool) -> Option<String> {
    let _ = is_code; // all params use same decoding
    let name_eq = format!("{name}=");
    for (idx, _) in full.match_indices(&name_eq) {
        if idx == 0
            || full
                .as_bytes()
                .get(idx.saturating_sub(1))
                .map_or(true, |b| {
                    *b == b'?' || *b == b'&' || *b == b'#' || *b == b';'
                })
        {
            let rest = &full[idx + name_eq.len()..];
            return Some(value_until_delim(rest));
        }
    }
    None
}

/// Test-only: verify parsing.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_get_line() {
        let s = "GET /?code=abc%2Fdef&state=x HTTP/1.1\r\n";
        let c = extract_authorization_code(s);
        assert_eq!(c, Some("abc/def".to_string()));
    }
}
