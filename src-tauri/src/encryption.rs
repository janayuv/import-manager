use base64::Engine;
use keyring::Entry;
use rand::Rng;
use rusqlite::{Connection, Result};
use std::io::Read;
use std::path::Path;

const KEYRING_SERVICE: &str = "com.jana.importmanager";
const KEYRING_USERNAME: &str = "database_key";

pub struct DatabaseEncryption {
    keyring_entry: Entry,
}

impl DatabaseEncryption {
    pub fn new() -> Self {
        Self {
            keyring_entry: Entry::new(KEYRING_SERVICE, KEYRING_USERNAME)
                .expect("Failed to create keyring entry"),
        }
    }

    /// Generate a new encryption key
    pub fn generate_key() -> Vec<u8> {
        let mut rng = rand::thread_rng();
        let mut key = [0u8; 32]; // 256-bit key
        rng.fill(&mut key);
        key.to_vec()
    }

    /// Store encryption key in OS keychain
    pub fn store_key(&self, key: &[u8]) -> Result<()> {
        let key_b64 = base64::engine::general_purpose::STANDARD.encode(key);
        self.keyring_entry
            .set_password(&key_b64)
            .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;
        Ok(())
    }

    /// Retrieve encryption key from OS keychain
    pub fn retrieve_key(&self) -> Result<Vec<u8>> {
        let key_b64 = self
            .keyring_entry
            .get_password()
            .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;

        base64::engine::general_purpose::STANDARD
            .decode(&key_b64)
            .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))
    }

    /// Check if database is encrypted
    pub fn is_encrypted(db_path: &Path) -> Result<bool> {
        // First, try to read the file header to check if it's a valid SQLite file
        let mut file = std::fs::File::open(db_path)
            .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;
        let mut header = [0u8; 16];
        file.read_exact(&mut header)
            .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;

        // Check if it's a valid SQLite header
        let sqlite_header = b"SQLite format 3";
        if header.starts_with(sqlite_header) {
            // It's a valid SQLite file, so it's not encrypted
            Ok(false)
        } else {
            // It's not a valid SQLite header, so it's likely encrypted
            Ok(true)
        }
    }

    /// Migrate plaintext database to encrypted
    pub fn migrate_to_encrypted(&self, plaintext_path: &Path, encrypted_path: &Path) -> Result<()> {
        // Generate new encryption key
        let key = Self::generate_key();
        self.store_key(&key)?;

        // Create encrypted database
        let encrypted_conn = Connection::open(encrypted_path)?;

        // Enable encryption with SQLCipher
        encrypted_conn.execute_batch(&format!(
            "PRAGMA cipher_page_size = 4096;
             PRAGMA kdf_iter = 256000;
             PRAGMA cipher_hmac_algorithm = HMAC_SHA512;
             PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512;
             PRAGMA key = \"x'{}'\";",
            hex::encode(&key)
        ))?;

        // Attach plaintext database and export to encrypted
        let plaintext_path_str = plaintext_path.to_str().unwrap();
        encrypted_conn.execute(
            "ATTACH DATABASE ?1 AS plaintext KEY ''",
            [plaintext_path_str],
        )?;

        encrypted_conn.execute("SELECT sqlcipher_export('main','plaintext')", [])?;
        encrypted_conn.execute("DETACH DATABASE plaintext", [])?;

        Ok(())
    }

    /// Open encrypted database with stored key
    pub fn open_encrypted(&self, db_path: &Path) -> Result<Connection> {
        let key = self.retrieve_key()?;
        let conn = Connection::open(db_path)?;

        // Enable encryption with SQLCipher
        conn.execute_batch(&format!(
            "PRAGMA cipher_page_size = 4096;
             PRAGMA kdf_iter = 256000;
             PRAGMA cipher_hmac_algorithm = HMAC_SHA512;
             PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512;
             PRAGMA key = \"x'{}'\";",
            hex::encode(&key)
        ))?;

        Ok(conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_generation() {
        let key = DatabaseEncryption::generate_key();
        assert_eq!(key.len(), 32);
    }
}
