# Security

## Reporting a Vulnerability

To report a security vulnerability, email **jana.acc@gmail.com** with subject `[SECURITY] Import Manager`.
Include a description, reproduction steps, and impact assessment. You will receive a response within 5 business days.
Do not open a public GitHub issue for security vulnerabilities.

## Threat Model

Import Manager is a **single-user, Windows-only desktop application** with no network-facing surface except optional Google Drive sync. The threat model is accordingly narrow:

| Threat | Mitigation |
|--------|-----------|
| Malicious file opened as backup | AES-256-GCM authentication tag rejects tampered files; IMBK2 magic header verified before decryption |
| Backup key extracted from disk | Backup encryption key stored in Windows Credential Manager (DPAPI-protected); plaintext SQLite fallback only when keyring unavailable |
| Weak backup key derivation | PBKDF2-HMAC-SHA-256 with 600,000 iterations (OWASP 2024 minimum) as of IMBK2 format |
| OAuth client secret embedded in binary | Client ID/secret stored at runtime in `app_metadata` table only; no compile-time `option_env!` baking |
| SQL injection | All DB access uses parameterised `rusqlite` prepared statements — no string-interpolated SQL |
| XSS in WebView | Strict CSP in `tauri.conf.json`: no `unsafe-eval`, no `object-src`; Tauri IPC boundary enforced |
| Privilege escalation via IPC | All IPC commands run in the same user process; no privileged Rust surface exposed beyond declared Tauri capabilities |
| Secrets committed to repo | gitleaks pre-commit hook + CI scan; no secrets in `.env.example` |
| Dependency vulnerabilities | `cargo-deny` + `cargo-audit` in CI; `npm audit` in pre-build check |
| Database at rest | Bundled plain SQLite. **Operator requirement: enable BitLocker (or equivalent) on the drive hosting the app data directory.** Backup `.enc` files are AES-256-GCM encrypted regardless. |

## Backup Encryption Design

New backups are written in **IMBK2** format:

```
IMBK2 (5 bytes) | salt (16 bytes) | nonce (12 bytes) | ciphertext + GCM tag
```

- Algorithm: AES-256-GCM
- KDF: PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt
- Key storage: Windows Credential Manager via `keyring` crate; SQLite `app_metadata` fallback

Legacy **IMBK1** files (100,000 PBKDF2 iterations) are still decryptable and will be re-encrypted as IMBK2 on the next scheduled backup.

## Pre-commit and CI Security Gates

| Gate | Tool | Trigger |
|------|------|---------|
| Secret scanning | gitleaks | Pre-commit + CI |
| Dependency advisories | cargo-deny, cargo-audit | CI backend-check |
| npm advisories | npm audit (high+) | Pre-build check |
| Static analysis | Clippy (-D warnings) | CI backend-check |
| Code scanning | CodeQL | CI (codeql.yml) |

## Additional Documentation

- Security checklist: `docs/SECURITY_CHECKLIST.md`
- Governance (key rotation, incident response): `docs/SECURITY_GOVERNANCE.md`
- Git history remediation: `docs/GIT_HISTORY_REMEDIATION.md`
