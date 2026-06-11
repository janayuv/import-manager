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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::TempDir;

    fn make_seed_db(path: &std::path::Path) {
        let conn = Connection::open(path).expect("open seed db");
        conn.execute_batch(
            "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, value REAL NOT NULL);
             INSERT INTO items (name, value) VALUES ('alpha', 1.5);
             INSERT INTO items (name, value) VALUES ('beta', 2.75);
             INSERT INTO items (name, value) VALUES ('gamma', 3.0);",
        )
        .expect("seed");
    }

    fn row_count(path: &std::path::Path) -> u32 {
        let conn = Connection::open(path).expect("open db");
        conn.query_row("SELECT COUNT(*) FROM items", [], |r| r.get::<_, u32>(0))
            .expect("count")
    }

    fn value_sum(path: &std::path::Path) -> f64 {
        let conn = Connection::open(path).expect("open db");
        conn.query_row("SELECT SUM(value) FROM items", [], |r| r.get::<_, f64>(0))
            .expect("sum")
    }

    /// Encrypt → delete original → decrypt → verify row counts and data integrity (M11).
    #[test]
    fn backup_restore_roundtrip_imbk2() {
        let dir = TempDir::new().expect("tempdir");
        let db_path = dir.path().join("original.db");
        let enc_path = dir.path().join("backup.enc");
        let restored_path = dir.path().join("restored.db");

        make_seed_db(&db_path);
        assert_eq!(row_count(&db_path), 3);

        let pw = "ci-drill-password";
        encrypt_file(&db_path, &enc_path, pw).expect("encrypt");
        assert!(enc_path.exists());
        assert!(
            enc_path.metadata().unwrap().len() > db_path.metadata().unwrap().len(),
            "encrypted file must be larger than plaintext"
        );

        std::fs::remove_file(&db_path).expect("remove original");
        assert!(!db_path.exists());

        decrypt_file(&enc_path, &restored_path, pw).expect("decrypt");
        assert!(restored_path.exists());
        assert_eq!(row_count(&restored_path), 3, "row count after restore");
        let sum = value_sum(&restored_path);
        assert!((sum - 7.25_f64).abs() < 1e-9, "checksum mismatch: {sum}");
    }

    /// Wrong password must return Err; no valid file created.
    #[test]
    fn wrong_password_rejected() {
        let dir = TempDir::new().expect("tempdir");
        let db_path = dir.path().join("original.db");
        let enc_path = dir.path().join("backup.enc");
        let bad_path = dir.path().join("bad.db");

        make_seed_db(&db_path);
        encrypt_file(&db_path, &enc_path, "correct").expect("encrypt");
        let result = decrypt_file(&enc_path, &bad_path, "wrong");
        assert!(result.is_err(), "wrong password must fail");
    }

    /// IMBK1 legacy format must still decrypt successfully.
    #[test]
    fn imbk1_legacy_decrypt_compat() {
        let dir = TempDir::new().expect("tempdir");
        let db_path = dir.path().join("seed.db");
        let enc_path = dir.path().join("legacy.enc");
        let restored_path = dir.path().join("legacy_restored.db");

        make_seed_db(&db_path);
        let plain = std::fs::read(&db_path).expect("read db");
        let pw = "legacy-compat-test";

        // Hand-craft IMBK1 payload with 100k iterations to test read-compat path.
        use aes_gcm::aead::{AeadCore, KeyInit, OsRng};
        use aes_gcm::{Aes256Gcm, Key};
        use hmac::Hmac;
        use pbkdf2::pbkdf2;
        use rand::RngCore;
        use sha2::Sha256;
        type H = Hmac<Sha256>;
        let mut salt = [0u8; SALT_LEN];
        rand::thread_rng().fill_bytes(&mut salt);
        let mut key_bytes = [0u8; 32];
        pbkdf2::<H>(pw.as_bytes(), &salt, PBKDF2_ITERS_V1, &mut key_bytes).unwrap();
        let k = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(k);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ct = cipher.encrypt(&nonce, plain.as_ref()).unwrap();
        let mut out = Vec::new();
        out.extend_from_slice(MAGIC_V1);
        out.extend_from_slice(&salt);
        out.extend_from_slice(nonce.as_slice());
        out.extend_from_slice(&ct);
        std::fs::write(&enc_path, out).expect("write legacy enc");

        decrypt_file(&enc_path, &restored_path, pw).expect("IMBK1 decrypt");
        assert_eq!(row_count(&restored_path), 3, "IMBK1 restore row count");
    }
}
