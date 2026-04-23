# Changelog

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
