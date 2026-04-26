//! AI provider selection for invoice extraction (mock vs remote).

use rusqlite::Connection;

/// Resolves the default provider string from the database, then `AI_DEFAULT_PROVIDER` env, then `mock`.
pub fn resolve_default_provider_label(conn: &Connection) -> String {
    crate::app_settings::resolve_default_ai_provider_str(conn)
}

/// Back-end extraction provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProvider {
    /// Local deterministic demo (no network).
    Mock,
    /// DeepSeek Vision / chat API (see `deepseek_client`). Primary cloud provider.
    DeepSeek,
    /// Local Ollama (see `ollama_client`). Fallback; same prompts as DeepSeek.
    LocalOllama,
}

impl AiProvider {
    /// Parse from request string (e.g. JSON `provider` field). Case-insensitive.
    pub fn from_config_str(s: &str) -> Result<Self, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "mock" => Ok(AiProvider::Mock),
            "deepseek" => Ok(AiProvider::DeepSeek),
            "local" | "ollama" => Ok(AiProvider::LocalOllama),
            other => Err(format!(
                "Unknown AI provider \"{other}\": use \"mock\", \"deepseek\", or \"local\""
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_mock_and_deepseek() {
        assert_eq!(AiProvider::from_config_str("mock").unwrap(), AiProvider::Mock);
        assert_eq!(
            AiProvider::from_config_str("DEEPSEEK").unwrap(),
            AiProvider::DeepSeek
        );
        assert_eq!(AiProvider::from_config_str("local").unwrap(), AiProvider::LocalOllama);
        assert_eq!(AiProvider::from_config_str("OLLAMA").unwrap(), AiProvider::LocalOllama);
    }

    #[test]
    fn unknown_provider_errs() {
        assert!(AiProvider::from_config_str("openai").is_err());
    }
}
