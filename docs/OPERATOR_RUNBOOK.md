# Operator runbook (desktop)

Short procedures for support and on-call. This app stores data in a local SQLite file under the Windows app data directory for `com.jana.importmanager`.

## Current release

- **Application version:** **v0.3.1** (shown in **Help → About**, **Admin → System health**, diagnostics `manifest.json` as `appVersion`, and startup logs).
- **Schema version:** Shown on **Admin → System health** (applied vs expected from embedded migrations—do not rely on hardcoded numbers in docs).
- **Support bundle:** **Help → Export diagnostics…** — see [Diagnostics export](#diagnostics-export-support-bundle) below.
- **Admin navigation:** Use the sidebar **Administration** group (activity, user audit, health, tools) and **Automation & operations** (automation center, rules, operations center).

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

1. **What:** The dashboard uses `dashboard_metrics_cache` (short TTL) and daily **KPI / exception / workflow snapshots** in tables such as `dashboard_kpi_snapshot` for faster loads when filters are at default scope.
2. **When it refreshes:** A background tick runs dashboard maintenance (see `dashboard_cache::tick_dashboard_maintenance`). Opening the dashboard with full-scope filters can also trigger snapshot generation paths when today’s row is missing.
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

Production installers must be built with **`IMPORT_MANAGER_ADMIN_PASSWORD_HASH`** set to a bcrypt hash of the desired admin password (and optionally **`IMPORT_MANAGER_ADMIN_USERNAME`**). Debug/non-release builds fall back to a development hash when the variable is unset; **release** builds leave the hash empty unless you set the variable, which disables login until configured.
