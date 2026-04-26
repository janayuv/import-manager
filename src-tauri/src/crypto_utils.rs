//! AES-256-GCM for sensitive `app_settings` values (V0.2.3+).
//! Key material: `APP_SECRET_KEY` env, else SHA-256 of a machine-scoped string.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use sha2::Digest;

/// Stored values that begin with this are AES-GCM–encrypted and base64-wrapped.
pub const ENC_PREFIX: &str = "enc1:";

const NONCE_LEN: usize = 12;

/// Derives 32 bytes for AES-256. Prefer `APP_SECRET_KEY` when set (portable, explicit).
/// Otherwise use a host + user + OS string (not secret; stabilizes a per-machine key).
fn derive_key_bytes() -> [u8; 32] {
    if let Ok(s) = std::env::var("APP_SECRET_KEY") {
        let t = s.trim();
        if !t.is_empty() {
            let mut h = sha2::Sha256::new();
            h.update(t.as_bytes());
            h.update(b"|import-manager-app-crypto-derive|v1");
            return h.finalize().into();
        }
    }
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| std::env::var("HOST"))
        .unwrap_or_else(|_| "default-host".to_string());
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "default-user".to_string());
    let material = format!("{host}|{user}|{}|import-manager-machine-id|v1", std::env::consts::OS);
    let mut h = sha2::Sha256::new();
    h.update(material.as_bytes());
    h.finalize().into()
}

fn cipher() -> Aes256Gcm {
    let key: [u8; 32] = derive_key_bytes();
    let k = Key::<Aes256Gcm>::from_slice(&key);
    Aes256Gcm::new(k)
}

/// Returns AES-256-GCM ciphertext, ASCII-safe: `enc1:` + base64( nonce(12) || ct+tag ).
pub fn encrypt_value(plain_text: &str) -> Result<String, String> {
    if plain_text.is_empty() {
        return Ok(String::new());
    }
    let c = cipher();
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = c
        .encrypt(&nonce, plain_text.as_bytes())
        .map_err(|e| format!("AES-GCM encryption failed: {e}"))?;
    let mut raw: Vec<u8> = Vec::with_capacity(NONCE_LEN + ct.len());
    raw.extend_from_slice(nonce.as_slice());
    raw.extend_from_slice(&ct);
    Ok(format!("{}{}", ENC_PREFIX, B64.encode(&raw)))
}

/// Decrypts values produced by [`encrypt_value`]. If the value does not use [`ENC_PREFIX`], returns
/// the string as-is (legacy plaintext rows).
pub fn decrypt_value(encrypted_text: &str) -> Result<String, String> {
    if encrypted_text.is_empty() {
        return Ok(String::new());
    }
    if !encrypted_text.starts_with(ENC_PREFIX) {
        return Ok(encrypted_text.to_string());
    }
    let b64 = encrypted_text[ENC_PREFIX.len()..]
        .trim();
    if b64.is_empty() {
        return Err("Encrypted value is empty after prefix.".to_string());
    }
    let raw = B64
        .decode(b64)
        .map_err(|e| format!("Invalid base64 for encrypted setting: {e}"))?;
    if raw.len() < NONCE_LEN + 16 {
        return Err("Encrypted payload is too short.".to_string());
    }
    let nonce = Nonce::from_slice(&raw[..NONCE_LEN]);
    let ct = &raw[NONCE_LEN..];
    let c = cipher();
    let plain = c
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "AES-GCM decryption failed (wrong key or corrupt data).".to_string())?;
    String::from_utf8(plain).map_err(|e| format!("Decrypted data is not UTF-8: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_roundtrip() {
        let s = "sk-test-secret-abc";
        let enc = encrypt_value(s).unwrap();
        assert!(enc.starts_with(ENC_PREFIX));
        assert_ne!(enc, s);
        let out = decrypt_value(&enc).unwrap();
        assert_eq!(out, s);
    }

    #[test]
    fn decrypt_passes_through_plaintext_legacy() {
        let p = "plain-old-key";
        assert_eq!(decrypt_value(p).unwrap(), p);
    }

    #[test]
    fn empty_encrypt_is_empty() {
        assert_eq!(encrypt_value("").unwrap(), "");
        assert_eq!(decrypt_value("").unwrap(), "");
    }
}
