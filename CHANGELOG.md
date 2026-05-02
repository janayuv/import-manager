# Changelog

## v0.3.1

- **Session hardening:** Each desktop login gets a new `sessionId`; role is loaded from `user_roles`; `get_desktop_session` drops the session on expiry or DB role drift; IPC callers must match the active session user for gated commands (spoof-resistant `callerUserId`).
- **Audit logging:** Login success/failure, logout, diagnostics export, and snapshot rebuilds write to `user_activity_audit_logs` with correlation/session metadata where applicable.
- **Admin API boundaries:** `query_dashboard_activity_log`, `query_user_activity_logs`, `log_dashboard_activity`, `get_dashboard_activity_log`, `rebuild_dashboard_snapshots`, and `export_diagnostics_bundle` enforce session + role checks.
- **CSP:** `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` added for a tighter webview policy.
- **Navigation:** Collapsible **Administration** and **Automation & operations** groups; new **Automation center** page (background maintenance overview + links); **Operations center** includes an admin **Platform maintenance** strip.
- **Activity log:** Server-side pagination (`offset`); export path traversal guard for diagnostics save dialog.

## v0.3.0

Release milestone: Phase 2 reliability (schema health, diagnostics export, dashboard snapshot rebuild, correlation IDs in logs/IPC, expanded financial tests) finalized for production.

- **Versioning:** `package.json`, Tauri config, and Rust crate aligned to **0.3.0**; startup logs and diagnostics `manifest.json` use the native semver from `Cargo.toml`.
- **Diagnostics:** Single correlation ID per export; manifest includes `correlationId`, `versionDetail` (native vs client-reported app version parity when the UI supplies it); errors append correlation text for log correlation.
- **Snapshot rebuild:** Mutex prevents concurrent rebuilds; completion time stored in `app_metadata.dashboard_snapshot_last_rebuild_at`; result includes `correlationId` for UI and support.
- **System health:** Shows native **application version**, last manual rebuild time, schema-derived health (with summary warnings when not OK), and tab-visibility refresh to reduce stale readings.

## v0.1.8

Release date: 2026-04-23

- AES-256 encrypted backups
- Backup key export/import
- Google Drive backup & restore
- SHA-256 verification
- Recycle retention cleanup
- Database maintenance (VACUUM + ANALYZE)
- Security UI updates
- Injected `VITE_APP_VERSION` and `VITE_BUILD_TIME` from `package.json` at build time so support surfaces match the shipped semver
- Database management: backup, restore, schedule, and related operations record the signed-in user via `useCurrentUserId()` instead of a placeholder
- Playwright: accept `window.confirm` in the database restore E2E step (Vite stub has no Tauri dialog)

## v1.0.0-secure-baseline

- Repository history rewritten
- Secrets removed
- gitleaks integrated
- CI security scanning enabled
- Documentation added
