use std::path::Path;

pub fn redact_secret(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "<empty>".to_string();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 8 {
        return "***".to_string();
    }
    format!("{}***{}", chars[0], chars[chars.len() - 1])
}

pub fn redact_path(path: &Path) -> String {
    path.file_name()
        .and_then(|v| v.to_str())
        .map(|name| format!("<redacted>/{}", name))
        .unwrap_or_else(|| "<redacted>".to_string())
}

pub fn redact_path_str(path: &str) -> String {
    redact_path(Path::new(path))
}
