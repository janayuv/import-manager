//! File-level AES-256-GCM for backup `.enc` artifacts.
//!
//! IMBK2 format (written by this version):
//!   `IMBK2` (5) + salt (16) + nonce (12) + ciphertext (includes GCM tag)
//!   PBKDF2-HMAC-SHA256 with 600,000 iterations (OWASP 2024 minimum).
//!
//! IMBK1 format (read-only, legacy):
//!   `IMBK1` (5) + salt (16) + nonce (12) + ciphertext
//!   PBKDF2-HMAC-SHA256 with 100,000 iterations. Still decryptable; re-encrypts as IMBK2 on next backup.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use hmac::Hmac;
use pbkdf2::pbkdf2;
use sha2::Sha256;
use std::fs;
use std::io::Read;
use std::path::Path;

const MAGIC_V2: &[u8; 5] = b"IMBK2";
const MAGIC_V1: &[u8; 5] = b"IMBK1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
/// Current iteration count (OWASP 2024: ≥600 k for PBKDF2-HMAC-SHA-256).
const PBKDF2_ITERS_V2: u32 = 600_000;
/// Legacy iteration count for IMBK1 read-compat.
const PBKDF2_ITERS_V1: u32 = 100_000;

type HmacSha256 = Hmac<Sha256>;

fn derive_key(password: &str, salt: &[u8; SALT_LEN], iters: u32) -> Result<[u8; 32], String> {
    let mut out = [0u8; 32];
    pbkdf2::<HmacSha256>(password.as_bytes(), salt, iters, &mut out)
        .map_err(|_| "Key derivation failed".to_string())?;
    Ok(out)
}

/// Encrypt a file with AES-256-GCM using IMBK2 format. Overwrites `output_path` if it exists.
pub fn encrypt_file(input_path: &Path, output_path: &Path, password: &str) -> Result<(), String> {
    let plain =
        fs::read(input_path).map_err(|e| format!("Failed to read file to encrypt: {}", e))?;
    if plain.is_empty() {
        return Err("Cannot encrypt an empty file".to_string());
    }
    use rand::RngCore;
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    let key = derive_key(password, &salt, PBKDF2_ITERS_V2)?;
    let k = Key::<Aes256Gcm>::from_slice(&key);
    let cipher = Aes256Gcm::new(k);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plain.as_ref())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    let mut out = Vec::with_capacity(MAGIC_V2.len() + SALT_LEN + NONCE_LEN + ct.len());
    out.extend_from_slice(MAGIC_V2);
    out.extend_from_slice(&salt);
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ct);
    fs::write(output_path, out).map_err(|e| format!("Failed to write encrypted file: {}", e))?;
    Ok(())
}

/// Decrypt a file created by `encrypt_file`. Accepts both IMBK2 and legacy IMBK1 files.
pub fn decrypt_file(input_path: &Path, output_path: &Path, password: &str) -> Result<(), String> {
    let data = fs::read(input_path).map_err(|e| format!("Failed to read encrypted file: {}", e))?;
    const HEADER_LEN: usize = 5; // MAGIC
    const MIN: usize = HEADER_LEN + SALT_LEN + NONCE_LEN + 16;
    if data.len() < MIN {
        return Err("Invalid or truncated encrypted backup file".to_string());
    }
    let iters = if data.starts_with(MAGIC_V2) {
        PBKDF2_ITERS_V2
    } else if data.starts_with(MAGIC_V1) {
        PBKDF2_ITERS_V1
    } else {
        return Err("This file is not a valid Import Manager encrypted backup".to_string());
    };
    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&data[HEADER_LEN..HEADER_LEN + SALT_LEN]);
    let n_start = HEADER_LEN + SALT_LEN;
    let ct_start = n_start + NONCE_LEN;
    let nonce = Nonce::from_slice(&data[n_start..ct_start]);
    let ct = &data[ct_start..];
    let key = derive_key(password, &salt, iters)?;
    let k = Key::<Aes256Gcm>::from_slice(&key);
    let cipher = Aes256Gcm::new(k);
    let plain = cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "Decryption failed (wrong key or corrupt file).".to_string())?;
    fs::write(output_path, &plain)
        .map_err(|e| format!("Failed to write decrypted database: {}", e))?;
    Ok(())
}

/// `true` if the path is `.enc` or the file header matches IMBK1 or IMBK2 format.
pub fn is_encrypted_backup_artifact_path(path: &Path) -> bool {
    if path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("enc"))
    {
        return true;
    }
    let mut f = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut h = [0u8; 5];
    if f.read_exact(&mut h).is_err() {
        return false;
    }
    h == *MAGIC_V2 || h == *MAGIC_V1
}
