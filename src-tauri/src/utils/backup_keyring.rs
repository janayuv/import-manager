use std::path::Path;

const KEYRING_SERVICE: &str = "ImportManager";
const KEYRING_BACKUP_ENC_KEY: &str = "backup_encryption_password";

/// Returns the raw key string if present, without creating one.
pub fn get_raw_backup_key_silent() -> Option<String> {
    let e = keyring::Entry::new(KEYRING_SERVICE, KEYRING_BACKUP_ENC_KEY).ok()?;
    e.get_password()
        .ok()
        .filter(|s| s.len() >= 32)
        .map(|s| s.trim().to_string())
}

/// Key material for export (base64, same as stored in the keyring). Fails if no key exists.
pub fn get_raw_backup_key_for_export() -> Result<String, String> {
    get_raw_backup_key_silent().ok_or_else(|| {
        "No backup encryption key in the keyring. Create a backup at least once first.".to_string()
    })
}

/// Write `backup_key.imkey` contents: comment line + base64 key (32 bytes when decoded; same as keyring value).
/// Logs with target `import_manager::security`.
pub fn export_key_to_imkey_file(path: &Path) -> Result<(), String> {
    let key = get_raw_backup_key_for_export()?;
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, key.trim())
        .map_err(|_| "Stored keyring key is not valid base64".to_string())?;
    if decoded.len() != 32 {
        return Err(
            "Stored backup key has an unexpected length. Create a new backup to regenerate a key."
                .to_string(),
        );
    }
    let out = format!(
        "# Import Manager backup encryption key (32 bytes, base64)\n{}\n",
        key.trim()
    );
    std::fs::write(path, out).map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::security",
        "Backup encryption key exported"
    );
    Ok(())
}

/// Validates base64 in the file decodes to exactly 32 bytes; returns canonical base64 to store in keyring.
pub fn parse_imkey_payload(data: &str) -> Result<String, String> {
    let line = data
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#'))
        .ok_or_else(|| "Key file is empty".to_string())?;
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, line)
        .map_err(|_| "Invalid base64 in key file".to_string())?;
    if decoded.len() != 32 {
        return Err("Key file must contain a 32-byte key in standard base64 format.".to_string());
    }
    let canonical = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &decoded);
    Ok(canonical)
}

/// Read `.imkey` from disk, validate, and set keyring. Overwrites only when `replace_confirmed` is true if a key exists.
pub fn import_key_from_imkey_path(path: &Path, replace_confirmed: bool) -> Result<(), String> {
    let data =
        std::fs::read_to_string(path).map_err(|e| format!("Failed to read key file: {}", e))?;
    let key = parse_imkey_payload(&data)?;
    let e =
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_BACKUP_ENC_KEY).map_err(|e| e.to_string())?;
    let has_key = e.get_password().map(|s| s.len() >= 32).unwrap_or(false);
    if has_key && !replace_confirmed {
        return Err(
            "A backup encryption key is already in the keyring. To replace it, confirm in the app and import again."
                .to_string(),
        );
    }
    e.set_password(&key).map_err(|e| e.to_string())?;
    log::info!(
        target: "import_manager::security",
        "Backup encryption key imported"
    );
    Ok(())
}

/// 256-bit key material, base64-encoded (not stored in the app database).
pub fn get_or_create_backup_encryption_password() -> Result<String, String> {
    let e =
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_BACKUP_ENC_KEY).map_err(|e| e.to_string())?;
    match e.get_password() {
        Ok(s) if s.len() >= 32 => Ok(s),
        _ => {
            use rand::RngCore;
            let mut token = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut token);
            let pw = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, token);
            e.set_password(&pw).map_err(|e| e.to_string())?;
            log::info!(
                target: "import_manager::backup",
                "Created backup file encryption key in system keyring"
            );
            Ok(pw)
        }
    }
}
