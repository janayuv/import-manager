# Security — Import Manager

**App:** Import Manager v1.0.5  
**Model:** Single-user Windows desktop app (Tauri 2 + Rust + React)  
**Data:** Local SQLite database in `%APPDATA%\com.jana.importmanager\`

---

## Threat model

Import Manager is a single-operator tool running on a trusted, password-protected Windows machine. There is no network-exposed API, no multi-tenant surface, and no remote login.

| Threat | Likelihood | Mitigation |
|--------|-----------|------------|
| Lost or stolen laptop | Medium | BitLocker full-disk encryption (operator responsibility — see OPERATOR_RUNBOOK.md) |
| Malicious file opened during import | Low | Parameterized SQL everywhere; no dynamic SQL; Zod-validated input at IPC boundary |
| Backup file intercepted in transit | Low | AES-256-GCM (IMBK2, 600 k PBKDF2 iterations) before upload |
| Dependency supply-chain compromise | Low | cargo-deny + cargo-audit + gitleaks in CI; Codecov coverage gating |
| Session hijack | Very low | bcrypt-hashed credentials; Rust-side desktop session; strict CSP (no unsafe-eval, object-src none) |
| OAuth token theft | Very low | Tokens in Windows Credential Manager (keyring); PKCE desktop flow; no compiled-in secrets |

### What is NOT in scope

- Network attacks (no inbound ports)
- Multi-user privilege escalation (single operator)
- Browser-based XSS (Tauri WebView2 with strict CSP)

---

## Data protection

### At rest

The live SQLite database is **plaintext**. Protection relies on:

1. **BitLocker (required)** — encrypt the entire system drive. See OPERATOR_RUNBOOK.md § "Data encryption at rest".
2. **Windows user account password** — prevents casual access on a shared or unattended machine.

### Backup encryption

All backup files are encrypted with AES-256-GCM before writing to disk or Google Drive:

- **Format:** IMBK2 (magic header + 16-byte salt + 12-byte nonce + GCM ciphertext+tag)
- **KDF:** PBKDF2-HMAC-SHA256, 600 000 iterations (OWASP 2024 minimum)
- **Key storage:** Windows Credential Manager (`keyring` crate); no plaintext key material stored in the database
- **Verify-after-write:** every backup is header+tag-verified immediately after creation

Legacy IMBK1 backups (100 000 iterations) are still decryptable; new backups are always written as IMBK2.

### Google Drive sync

- OAuth 2.0 Desktop App + PKCE flow — no client secret compiled into the binary
- Tokens stored in Windows Credential Manager
- Only encrypted `.enc` files are uploaded; the plaintext database never leaves the machine via Drive

---

## CI security pipeline

| Check | Runs on |
|-------|---------|
| `gitleaks` (secret scan) | Every push + pre-commit |
| `cargo-deny` (license + advisory) | Every PR |
| `cargo audit` (RUSTSEC advisories) | Every PR |
| `eslint-plugin-security` | Every PR |
| `npm audit` | Pre-commit hook |
| `lock().unwrap()` regression gate | Every PR (backend-check job) |

---

## Known accepted risks

| Risk | Accepted because |
|------|-----------------|
| Plaintext SQLite at rest | BitLocker on the OS drive covers the threat model for a single-user trusted machine; SQLCipher integration deferred to v2 |
| ~224 `Option::unwrap()` in non-IPC Rust code | Post-guard patterns; being tracked for cleanup; mutex lock unwraps are fully eliminated and CI-gated |

---

## Vulnerability disclosure

This is a private single-operator application. To report a security issue:

**Contact:** jana.acc@gmail.com  
**Subject line:** `[Import Manager Security]`

There is no public bug bounty. Issues are triaged within 7 days.

---

*Last updated: 2026-06-11 (v1.0.5)*
