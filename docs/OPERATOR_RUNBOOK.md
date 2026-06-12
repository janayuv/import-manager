# Operator runbook (desktop)

Short procedures for support and on-call. This app stores data in a local SQLite file under the Windows app data directory for `com.jana.importmanager`.

## Current release

- **Application version:** **v1.0.5** (shown in **Help → About**, **Admin → System health**, diagnostics `manifest.json` as `appVersion`, and startup logs).
- **Schema version:** Shown on **Admin → System health** (applied vs expected from embedded migrations — 80+ migrations as of v1.0.5).
- **Support bundle:** **Help → Export diagnostics…** — see [Diagnostics export](#diagnostics-export-support-bundle) below.
- **Admin navigation:** Use the sidebar **Administration** group (activity, user audit, health, tools) and **Automation & operations** (automation center, rules, operations center).

---

## Data encryption at rest (required)

> **Security requirement:** The SQLite database (`import-manager.db`) is stored in plaintext. All business records — suppliers, invoices, duty calculations, financials — are readable by anyone with file access to `%APPDATA%\com.jana.importmanager\`.

**You must enable BitLocker (or equivalent full-disk encryption) on every PC that runs Import Manager.**

### Enabling BitLocker (Windows 10/11 Pro)

1. Open **Start → Settings → System → Storage → Advanced storage settings → Disk & volumes**.
2. Select the system drive (C:) → **Properties → Turn on BitLocker**.
3. Save the recovery key to a USB drive or Microsoft account — store it separately from the PC.
4. Allow encryption to complete before leaving the PC unattended.

Windows Home users: use **Device Encryption** (Settings → Privacy & Security → Device Encryption) or upgrade to Pro.

### Why this is required

Import Manager backup files are AES-256-GCM encrypted. However, the live database on disk is not encrypted by the application itself. BitLocker ensures that a lost or stolen device does not expose business data.

Backup encryption (AES-256-GCM, IMBK2 format, 600 000 PBKDF2 iterations) protects data that leaves the machine via Google Drive or USB transfer. BitLocker protects data that stays on the machine.

---

## Cross-PC operations (home ↔ office)

> **Single-writer rule:** Never open the same database file on two PCs simultaneously. SQLite does not support concurrent writers from separate processes. Always close the app on PC-A before opening it on PC-B.

### Moving the database between PCs

1. Close Import Manager on the source PC.
2. Locate the database: `%APPDATA%\com.jana.importmanager\` → `import-manager.db` (and any sidecar files).
3. Copy `import-manager.db` to a USB drive or shared network path.
4. On the destination PC, close Import Manager if running.
5. Replace the destination `import-manager.db` with the copied file.
6. Open Import Manager — it will run any pending migrations automatically.
7. Verify: check shipment count, a recent invoice, and dashboard KPIs.

### Startup lock-file warning

If the app detects another instance may have the DB open (lock file present), a warning is shown at startup. **Do not dismiss and continue if you are unsure** — check that the source PC is fully closed first.

### Using Google Drive sync

1. Connect Drive in **Settings → Google Drive** on each PC.
2. After each session on PC-A, trigger a manual or scheduled backup → it uploads an encrypted `.enc` file to Drive.
3. On PC-B, use **Settings → Database management → Restore from Drive** to download and decrypt the latest backup.
4. Google Drive is a *sync point*, not a live shared database — treat it as a manual hand-off, not automatic sync.

---

## Backup and restore

### Manual backup

1. Go to **Settings → Database management → Backup**.
2. Choose a destination folder (prefer external drive or network share, not the same disk as the DB).
3. Confirm the `.enc` backup file was created (filename includes timestamp).

### Scheduled backups

- Configured in **Settings → Database management → Scheduled backup**.
- Check **Last backup** timestamp — if it is more than 24 h old, run a manual backup now.
- Backup files are AES-256-GCM encrypted; the key is stored in the Windows keyring.

### Restore procedure

1. Close Import Manager.
2. Copy the current `import-manager.db` aside as `import-manager.db.bak` (safety copy).
3. Open Import Manager → **Settings → Database management → Restore**.
4. Select the `.enc` backup file. The app decrypts and replaces the active database.
5. Restart Import Manager. Migrations run automatically.
6. Verify row counts: suppliers, shipments, invoices. Check a recent invoice against paper records.
7. **Sign off:** record the date, backup file used, and row counts in your ops log.

### Restore drill (run before every major upgrade)

Perform this drill twice per release on both PCs:

```
□ 1. Create a fresh manual backup — note the filename and timestamp.
□ 2. Record current counts: suppliers N, shipments N, invoices N.
□ 3. Close Import Manager.
□ 4. Copy import-manager.db aside (import-manager.db.pre-drill).
□ 5. Run Restore from the backup created in step 1.
□ 6. Restart Import Manager.
□ 7. Verify counts match step 2.
□ 8. Open one recent invoice and confirm line items are correct.
□ 9. Restore import-manager.db.pre-drill → rename back to import-manager.db (undo the drill).
□ 10. Sign off with date + initials in ops log.
```

---

## Encryption key export / import

The backup encryption key is stored in the Windows keyring (`com.jana.importmanager/backup_key`). It must be exported before migrating to a new PC — without it, existing `.enc` backups cannot be decrypted.

### Export key (source PC)

1. Go to **Settings → Database management → Export backup key**.
2. Save the `backup_key.imkey` file to a USB drive or secure location.
3. **Never email or cloud-sync this file unencrypted** — it is the master key for all backups.

### Import key (destination PC)

1. Go to **Settings → Database management → Import backup key**.
2. Select the `backup_key.imkey` file. If a key already exists, confirm replacement.
3. After import, verify by running a restore of an existing `.enc` backup.

### Key rotation

- If you suspect the key was compromised, generate a new key and re-encrypt all backups.
- There is no automatic rotation — this is a manual admin action.

---

## Backup and restore

1. **In-app backups:** Use **Settings → Database management** (or your documented backup path) to run scheduled backups and confirm the backup directory is on durable storage (not only the local disk being replaced).
2. **Files to preserve:** The primary database is typically `import-manager.db` (and any sidecar files your deployment uses, such as encryption companions). Keep at least one full backup before upgrades or bulk imports.
3. **Restore:** Restore from a known-good backup file using the application’s database management / restore flow. If the app refuses to open a file (encryption or corruption), stop and copy the failing file aside for analysis, then restore an older backup.
4. **After restore:** Log in again; verify shipment counts and a recent invoice against expectations. Dashboard KPIs may take one refresh cycle to match restored data.

## Migration failures

1. **Symptom:** The app fails to start with a migration or schema error in logs (`app.log` via the log plugin output directory, or the in-app Logs view when available).
2. **Do not delete** `import-manager.db` without a backup. Capture the exact error text and the app version.
3. **Refinery** runs forward-only migrations at startup. If a migration partially applied, treat the database as damaged: restore from backup, or contact development with the error and DB copy.
4. **CI / dev:** A pre-migration snapshot may exist beside the DB (see startup code in `main.rs` / `migrations.rs`). Production users should rely on normal backups rather than manual file surgery.

## Dashboard KPI snapshots and cache

1. **What:** The dashboard uses `dashboard_metrics_cache` (**TTL: 180 seconds / 3 minutes** — `CACHE_TTL_SECS` in `dashboard_cache.rs`) and daily **KPI / exception / workflow snapshots** in tables such as `dashboard_kpi_snapshot` for faster loads when filters are at default scope. The React Query client adds a further **60-second stale window** before refetching.
2. **When it refreshes:** A background tick runs dashboard maintenance (see `dashboard_cache::tick_dashboard_maintenance`). Opening the dashboard with full-scope filters can also trigger snapshot generation paths when today’s row is missing. **Total worst-case staleness: ~4 minutes** (180s backend TTL + 60s React Query stale time).
3. **If numbers look stale after bulk edits:** Use the dashboard **Refresh** control (invalidates client query cache and refetches). Data mutations from shipments/invoices/BOE already invalidate the metrics cache on many write paths; if something still looks wrong, restart the app once after confirming writes succeeded.
4. **Retention:** KPI snapshot retention can be tuned via app metadata (`kpi_snapshot_retention_days`); operators normally do not need to delete snapshot rows manually.
5. **Manual rebuild:** Administrators can run **Admin → System tools → Rebuild dashboard cache** to clear `dashboard_metrics_cache` and regenerate KPI, exception, and workflow snapshots in one controlled step. Only one rebuild runs at a time; partial failures are reported in-app. The UI shows a **correlation ID** for each attempt; **Admin → System health** shows **Last manual snapshot rebuild** after a run completes. Check logs (`correlation_id=` on `rebuild_dashboard_snapshots_*` events) if warnings appear.

## Diagnostics export (support bundle)

1. **Who:** Users with permission to view audit-related diagnostics (same gate as exporting logs for support).
2. **Where:** **Help → Export diagnostics…** — choose a folder and filename for a single `.zip`.
3. **Contents:** `manifest.json` (`correlationId` for the export, `appVersion`, optional `versionDetail.clientReportedAppVersion` / `clientMatchesNative`, embedded migration head, schema health summary, safe app metadata keys, snapshot row counts, non-sensitive environment summary), plus a tail of `app.log` (large logs are truncated safely).
4. **Never included:** Passwords, session tokens, OAuth secrets, or key material—only operational metadata suitable for troubleshooting.
5. **Tracing:** Search logs for `correlation_id=` on the same export as in the manifest when escalating to engineering.

## Schema status (admin)

1. **Where:** **Admin → System health** shows applied vs expected migration version, pending migration rows, and integrity messages.
2. **States:** OK, migration pending, version mismatch, or migration failed—non-OK states are highlighted at the top of the page. If you see a failure, capture logs and the diagnostics zip before changing files on disk.

## Release builds and admin login

Administrator username and password are **not** baked into release binaries. On first launch against a new database, the app prompts for a **one-time setup**; credentials are stored in `app_settings` in the SQLite file (Argon2id hash). **Recovery mode** (`--recovery` / `IMPORT_MANAGER_RECOVERY=1`) can still reset lockout, policy, and the administrator password if you are locked out.

If you copy an existing database between PCs, credentials move with the file; otherwise run setup on each fresh database.
