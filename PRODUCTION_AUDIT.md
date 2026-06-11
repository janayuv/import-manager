# PRODUCTION_AUDIT.md — Import Manager

**Audit date:** 2026-06-11
**Version audited:** 1.0.5 (package.json / Cargo.toml / tauri.conf.json aligned)
**Scope:** Full architecture and production-readiness audit — project structure, Tauri architecture, React architecture, TypeScript quality, Rust backend, SQLite design, security, error handling, logging, state management, performance, memory, duplication, technical debt, UX/UI consistency, accessibility, export/import, backup/recovery, Windows deployment, packaging.
**Method:** Read-only static analysis of the repository. No code changes were made.

---

## 1. Executive Summary

**Overall production score: 70/100 — Launchable With Caveats.**

Import Manager is a well-engineered Tauri 2 desktop application with unusually strong frontend discipline and a hardened build pipeline. The codebase shows deliberate engineering: strict TypeScript with zero `any`/`@ts-ignore` debt, a universally enforced `safeInvoke` IPC wrapper, 100% parameterized SQL, a strict CSP with no `unsafe-eval`, structured logging with rotation (tauri-plugin-log, 5 MB / 5 files), WAL journal mode with `busy_timeout`, a hardened release profile (LTO, strip, single codegen unit), and a CI pipeline running cargo-deny, gitleaks, and CodeQL with a signed updater configured.

The score is capped below "Strong" by three critical findings — a pervasive mutex-poisoning failure mode (66× `state.db.lock().unwrap()`), Google OAuth secrets compiled into the distributed binary, and SQLite foreign keys that are declared but never enforced — plus two deployment-grade gaps: no Windows code signing (SmartScreen friction on every install) and a database that is plaintext at rest despite SQLCipher DLLs being shipped.

**Verdict:** Conditionally production-ready. Safe to continue using today as a single-user tool on a trusted machine. Before calling it "premium production-grade," fix the three critical items (estimated 2–3 days combined) and the code-signing + encryption-at-rest gaps (P1).

**Single-user deployment considerations.** This app runs on one operator's Windows machine with a local SQLite file. That context genuinely reduces several risks: there is no multi-tenant attack surface, no network-exposed API, and the single `Mutex<Connection>` serialization model is acceptable for one user. However, single-user does **not** mitigate: (a) mutex poisoning — one panic still bricks the session and risks data-loss-adjacent states; (b) plaintext data at rest — a stolen or disposed laptop exposes all business records; (c) compiled-in OAuth secrets — anyone with the installer can extract them; (d) missing FK enforcement — the user's own data silently accumulates orphans over years of use. For a single-user app, **data durability and recoverability are the top production concerns**, which elevates the backup-restore drill and FK findings above where they'd sit in a typical web audit.

---

## 2. Critical Issues

### C1. Mutex poisoning via `state.db.lock().unwrap()`

- **Severity:** Critical
- **Evidence:** 66 occurrences of `state.db.lock().unwrap()` across `src-tauri/src/commands/` (e.g. `suppliers.rs:14`, `security.rs:88/107/134`); 527 total `.unwrap()` calls in `src-tauri/src/`.
- **Impact:** If any command panics while holding the database lock, the `Mutex` is poisoned and **every subsequent `.unwrap()` on it panics**. One bad row, one arithmetic overflow, one unexpected NULL during any of 45 command modules permanently bricks all database access until app restart. The registered panic hook (`main.rs:108–123`) logs the first panic but cannot un-poison the mutex. Background jobs (backup scheduler, WAL checkpoint, integrity checks) share the same lock, so a poisoned mutex also kills scheduled backups silently.
- **Recommended fix:** Replace all 66 call sites with a fallible acquire — e.g. a helper `fn db<'a>(state: &'a DbState) -> Result<MutexGuard<'a, Connection>, String>` using `.lock().map_err(|_| "database lock poisoned; please restart".to_string())`, or `PoisonError::into_inner()` where read-only recovery is safe. Add a Clippy lint gate (`unwrap_used` deny in `commands/`) to prevent regression. Mechanical change; pattern is identical at every site.
- **Effort:** M (8–16 h including test pass)

### C2. Google OAuth client secret compiled into the binary

- **Severity:** Critical
- **Evidence:** `src-tauri/src/commands/google_drive.rs:238–244` — `option_env!("IMPORT_MANAGER_GOOGLE_CLIENT_ID")` / `option_env!("IMPORT_MANAGER_GOOGLE_CLIENT_SECRET")`. CI release builds set these as secrets, embedding them as static strings in the shipped `.exe`.
- **Impact:** The client secret is trivially extractable from the distributed binary with `strings`-level tooling. An attacker can impersonate the app in OAuth flows (phishing consent screens under the app's identity, quota abuse, potential token interception in some grant configurations). Google explicitly treats desktop-app client secrets as non-confidential, but the current setup *also* supports a runtime `app_metadata` path (`google_drive.rs:247–263`) — meaning the compile-time path is unnecessary risk.
- **Recommended fix:** Stop setting `IMPORT_MANAGER_GOOGLE_CLIENT_*` at build time in CI; make the runtime `app_metadata` configuration the only path, with a first-run setup prompt. Use the OAuth "Desktop app" client type + PKCE so no secret is required at all. Rotate the currently-shipped client secret in Google Cloud Console after the change (every released binary contains it).
- **Effort:** S–M (4–8 h + secret rotation)

### C3. Foreign keys declared but never enforced

- **Severity:** Critical
- **Evidence:** Schema declares `FOREIGN KEY ... REFERENCES` constraints (e.g. `src-tauri/src/db.rs:549, 581`), and migration `V10__add_missing_fk_indexes.sql` adds FK indexes — but `configure_sqlite_runtime()` (`src-tauri/src/main.rs:43–57`) sets WAL/synchronous/busy_timeout/temp_store and **never** issues `PRAGMA foreign_keys = ON`. It is enabled only in isolated spots (`audit_log_runtime_verify.rs:19`, `db_management.rs:3918`, `recycle_bin.rs:1335`).
- **Impact:** SQLite defaults FKs to OFF per connection. Every declared constraint is decorative: deleting a supplier can strand shipments, deleting a shipment can strand invoices and BOE rows. With soft deletes as the primary pattern the blast radius is reduced, but hard-delete paths exist (recycle-bin purge, system-table cleanup), and years of single-user operation will silently accumulate referential rot that surfaces as report discrepancies and export inconsistencies.
- **Recommended fix:** Add `PRAGMA foreign_keys = ON;` to `configure_sqlite_runtime()` before any query runs. **Prerequisite:** run an orphan-detection sweep first (one-time integrity script using `PRAGMA foreign_key_check`) and repair/quarantine violations, otherwise existing orphans will cause constraint failures on future writes. Add the check to the existing system-integrity background task.
- **Effort:** M (8–16 h: 1 h for the pragma, the rest for orphan detection/repair + verification)

---

## 3. High Priority Issues

### H1. Database plaintext at rest

- **Severity:** High
- **Evidence:** `Cargo.toml` uses rusqlite with the `bundled` (plain SQLite) feature; `build.rs:46–93` copies SQLCipher DLLs into the bundle but no code path links against them. Only backup artifacts are encrypted (AES-256-GCM, `utils/encryption.rs`).
- **Impact:** All business data — suppliers, invoices, duty calculations, financials — is readable by anyone with file access to `%APPDATA%`. Laptop theft or disposal exposes everything. Shipping unused SQLCipher DLLs also creates a false impression of encryption.
- **Recommended fix:** Decide explicitly. Option A: integrate SQLCipher properly (rusqlite `sqlcipher` feature + key from Windows keyring) — real fix, migration required for existing DBs. Option B: document a BitLocker/full-disk-encryption requirement in the operator runbook and **remove** the dead SQLCipher DLLs from the bundle. Either is defensible for single-user; shipping the half-state is not.
- **Effort:** Option A: L (24–40 h incl. migration + restore-path testing). Option B: S (2–4 h)

### H2. No Windows code signing

- **Severity:** High
- **Evidence:** No `signtool`/certificate references in `.github/workflows/release.yml`, `build.rs`, or `scripts/`. Tauri updater artifacts are minisign-signed (good), but the MSI/NSIS installers are not Authenticode-signed.
- **Impact:** SmartScreen "unrecognized app" warnings on every fresh install; some AV products quarantine unsigned installers. Undermines the "premium" goal and trains the user to click through security warnings.
- **Recommended fix:** Acquire an OV (or EV for instant reputation) code-signing certificate; integrate signing into the release workflow (Tauri supports `certificateThumbprint`/`signCommand` in `tauri.conf.json` bundle > windows). Azure Trusted Signing is a lower-cost alternative. Verify on a clean VM.
- **Effort:** M (8–16 h + certificate procurement lead time and annual cost)

### H3. Weak KDF iterations + plaintext key fallback

- **Severity:** High
- **Evidence:** `utils/encryption.rs:16` — `const PBKDF2_ITERS: u32 = 100_000;` (OWASP 2024 recommends 600k+ for PBKDF2-HMAC-SHA256). `utils/backup_keyring.rs:92–110` — when the Windows keyring is unavailable, the 32-byte backup key falls back to the `app_metadata` table **in the unencrypted SQLite DB**, base64-encoded plaintext.
- **Impact:** Backup encryption is only as strong as its weakest path: an attacker with the DB file may find the backup key sitting next to the data it protects, making backup encryption moot. 100k iterations makes password-derived keys ~6× cheaper to brute-force than current guidance.
- **Recommended fix:** Raise iterations to 600k (version the header — `IMBK2` — and keep `IMBK1` read support for old backups). For the fallback: either refuse to enable encrypted backups without a working keyring (fail loudly), or wrap the fallback key with a machine-bound secret (DPAPI via `windows` crate is the natural Windows answer).
- **Effort:** M (8–16 h)

### H4. E2E coverage gaps: 13/24 specs excluded from CI; packaged `.exe` never tested

- **Severity:** High
- **Evidence:** `package.json` `test:e2e:ci` enumerates 11 of 24 Playwright specs; excluded: responsive suites, `e2e/` folder specs, `custom-accent-color`, `runtime_performance_audit`, others. All E2E runs use `VITE_PLAYWRIGHT=1` stub mode against the Vite dev server (port 1422) — the real Rust IPC layer, CSP, WebView2 integration, and installer are never exercised automatically.
- **Impact:** Regressions in real IPC serialization, CSP violations, packaging, and responsive layouts can ship green. The release gate tests a simulation of the app, not the app.
- **Recommended fix:** (1) Run all 24 specs in CI — move slow suites to a nightly workflow if the 25-min budget is tight. (2) Add one smoke test against the packaged build per release (tauri-driver/WebDriver, or a scripted manual checklist in the release SOP as interim). Aligns with PRODUCTION_GRADE_PLAN.md Phase 7.
- **Effort:** Spec inclusion: S (2–4 h). Packaged-app smoke harness: L (24–40 h)

### H5. `VITE_ADMIN_PASSWORD_HASH` silent dev-default in production builds

- **Severity:** High
- **Evidence:** `src/lib/auth.ts:33` — hardcoded dev bcrypt hash (`DEV_WEB_PASSWORD_HASH`) used when `VITE_ADMIN_PASSWORD_HASH` is unset at build time (checked at `auth.ts:143–157`). No build-time failure if the env var is missing.
- **Impact:** A production build made without the secret silently ships with a known dev password for the web-preview auth path. Tauri production auth goes through the Rust session instead, which limits exposure — but the failure mode is silent, and silent security downgrades are how known-credential builds end up in releases.
- **Recommended fix:** Fail the production build when `VITE_ADMIN_PASSWORD_HASH` is unset and not in Playwright/dev mode — a check in `scripts/prebuild-check.ps1` (already wired into the build) or a Vite-config assertion. Document in the release SOP.
- **Effort:** S (2–4 h)

---

## 4. Medium Priority Issues

| # | Issue | Evidence | Impact | Recommended fix | Effort |
|---|-------|----------|--------|-----------------|--------|
| M1 | Single `Mutex<Connection>` serializes all DB access | `main.rs:306` (`DbState`); long jobs e.g. `reconcile_boe_attachments` (`main.rs:241`), integrity checks (`main.rs:419–442`) hold the lock | Background maintenance blocks UI commands; perceived freezes during heavy ticks | Acceptable for single user; mitigate by chunking long jobs (acquire/release per batch) rather than introducing a pool | M (8–16 h) |
| M2 | Coverage ~37%, thresholds not CI-enforced; no Rust coverage | `vitest.config.ts:36–44` (30% floor, config-only); 12 unit-test files; ~48 Rust `#[test]`s, no tarpaulin/llvm-cov | Regressions in untested modules (auth.ts, tauri-bridge.ts, settings.ts, all export modules) merge silently | Gate Codecov in CI with diff-aware thresholds; add `cargo llvm-cov` job; prioritize tests for export + auth modules | M (8–16 h setup; ongoing for tests) |
| M3 | Giant files | `src/pages/database-management.tsx` (~4019 ln), `src/pages/admin/operations-center.tsx` (~2974), `src/components/invoice/wizard/InvoiceWizard.tsx` (~1765) | Unreviewable diffs, re-render scope blowups, merge friction | Split tabs/panels/wizard-steps into lazy sub-components; no behavior change | L (16–24 h each) |
| M4 | No table virtualization | No react-window/`@tanstack/react-virtual` anywhere; TanStack tables in 8+ pages render all rows | DOM bloat + lag at 1–2k rows; memory growth on long sessions | Add `@tanstack/react-virtual` to the industrial table shell once, inherit everywhere | M (8–16 h) |
| M5 | Industrial Console theme on 5/29 pages (17%) | Completed: Supplier, Shipment, Invoice, Item, BOE. Remaining: Dashboard, Expenses, Reports, Settings, Frozen Shipments, Recycle Bin, 9 admin pages, account | Two visual languages in one app — directly contradicts "premium" goal | Execute PRODUCTION_GRADE_PLAN.md Phase 2; prioritize Dashboard + Settings (highest traffic) | L (8–16 h per page; ~80–120 h total) |
| M6 | Dead dependencies: `sqlite3` npm (~35 MB), `react-hot-toast` | Both in `package.json`; backend is Rust/rusqlite; sonner is the active toast lib (a couple of legacy `react-hot-toast` call sites may remain, e.g. boe-summary) | Install weight, audit surface, dual-toast confusion | `npm uninstall sqlite3`; migrate stray toast calls to sonner, then remove react-hot-toast | S (2–4 h) |
| M7 | Documentation version drift | CLAUDE.md / AGENTS.md / PRODUCTION_GRADE_PLAN.md state v0.4.10; repo is v1.0.5; "pages remaining" lists are stale | Agents and humans plan against stale facts (this audit had to reconcile several) | Refresh all three; add version-stamp check to release SOP | S (2–4 h) |
| M8 | Accessibility gaps | No `aria-sort`/`aria-selected`/row-count attrs in data tables; no skip-to-main link; dark-theme (#0D0D0B bg) contrast unverified; `@axe-core/playwright` installed but only one a11y spec | Keyboard/AT users hit walls in the core tables; single-user today, but operator needs change | Add ARIA to the shared industrial table shell; add skip link in `AppLayout.tsx`; expand axe coverage to all themed pages | M (8–16 h) |
| M9 | Dead scripts + duplicate route | ~12 one-off scripts in `scripts/` (3 encryption-test variants, `db-stress.js`, `quality-server.js`, …); `/frozen-shipments` route appears twice in `src/App.tsx` | Namespace noise; ambiguous routing | Archive dead scripts to `scripts/archive/`; delete duplicate route | S (2–4 h) |
| M10 | No `cargo audit` in CI | `backend-check` runs cargo-deny (advisories mode) only | Some RUSTSEC advisories surface later than desired | Add `cargo audit` step or confirm deny.toml advisories DB covers it | S (1–2 h) |
| M11 | Backup restore drill not automated | Backup/restore commands exist; no `cargo test` round-trip (create → backup → wipe → restore → verify) | For a single-user app this is the disaster-recovery story — untested restore = no backup | Add integration test: backup→restore→row-count+checksum verify, in CI | M (8–16 h) |
| M12 | CSV import duplication | `src/lib/csv-helpers.ts` is canonical, but `expense-import.tsx` re-implements parsing; papaparse `error` callback unused in places | Inconsistent validation/error UX per domain; malformed-file handling varies | Route all imports through csv-helpers; add explicit papaparse error handling + toast | M (8–16 h) |
| M13 | Export-module console noise | `boe-summary/client.tsx` (~ln 180, 200): `console.error('❌ Failed to open print window…')` etc. | Stripped in prod builds, but signals missing user-facing error handling — failures are invisible to the user | Replace with `toast.error` + logger from `debug-utils.ts` | S (2–4 h) |

---

## 5. Low Priority Issues

| # | Issue | Evidence | Recommended fix | Effort |
|---|-------|----------|-----------------|--------|
| L1 | Date-helper duplication | `formatDate()` in `export-boe-pdf.ts` vs `formatDateDDMMMYYYY()` in `export-boe-excel.ts`; canonical lib is `src/lib/date-format.ts` | Consolidate into date-format.ts | S (1–2 h) |
| L2 | localStorage lacks versioning/TTL | `import-manager-settings`, `currentUser` keys persisted with no schema version; UserProvider backfills fields ad hoc | Add `version` field + migrate-on-load | S (2–4 h) |
| L3 | Minimal SECURITY.md | ~471 bytes, placeholder | Document threat model (single-user desktop), backup-encryption design, disclosure contact | S (1–2 h) |
| L4 | Missing skip-to-main link | None in `AppLayout.tsx` | Standard skip link before sidebar | S (1 h) |
| L5 | Eager-loaded light routes | `LoginPage`, `SetupPage` imported eagerly in `App.tsx` while 8 heavy pages are lazy | Lazy-load remaining routes for marginal startup gain | S (1–2 h) |

---

## 6. Production-Grade Roadmap

Phases ordered by risk reduction per hour. Cross-references `docs/PRODUCTION_GRADE_PLAN.md` (its Phase 0 hygiene work appears complete but unmarked; Phase 2 = theming, Phase 7 = native E2E).

### P0 — Hardening (stability + data integrity) · ~3–5 days
The app must not be able to brick itself or rot its own data.
1. **C1** Eliminate `db.lock().unwrap()` poisoning path (66 sites) + Clippy `unwrap_used` gate.
2. **C3** Enable `PRAGMA foreign_keys = ON` + one-time `foreign_key_check` orphan sweep/repair.
3. **M11** Automated backup→restore round-trip test in CI.
4. **H5** Fail production builds on missing `VITE_ADMIN_PASSWORD_HASH`.

### P1 — Security & Deployment · ~1.5–3 weeks (incl. certificate lead time)
Make the shipped artifact trustworthy.
1. **C2** Remove compiled-in OAuth secrets; PKCE/runtime-config only; rotate exposed secret.
2. **H2** Windows code signing in release workflow; clean-VM SmartScreen verification.
3. **H1** Encryption-at-rest decision: SQLCipher integration **or** documented BitLocker requirement + remove dead DLLs.
4. **H3** PBKDF2 → 600k (versioned format) + fix plaintext key fallback (DPAPI or fail-loud).
5. **M10** `cargo audit` in CI.

### P2 — Quality & UX · ~3–5 weeks
Make it feel and test like a premium product.
1. **H4** All 24 Playwright specs in CI (+ nightly split); packaged-app smoke test per release.
2. **M2** Coverage gates in CI (TS + Rust); fill auth/export-module test gaps.
3. **M5** Industrial Console theming for Dashboard, Expenses, Reports, Settings, Frozen Shipments, Recycle Bin (per PRODUCTION_GRADE_PLAN.md Phase 2).
4. **M4** Virtualize the shared table shell.
5. **M3** Split the three giant files.
6. **M8** Accessibility: ARIA on tables, skip link, axe coverage.
7. **M12/M13** Consolidate CSV import; user-facing export error handling.

### P3 — Polish · ~1 week
1. **M6** Remove `sqlite3` + `react-hot-toast`.
2. **M7** Refresh CLAUDE.md / AGENTS.md / PRODUCTION_GRADE_PLAN.md to v1.0.5 reality.
3. **M9** Archive dead scripts; fix duplicate route.
4. **M1** Chunk long-running background jobs to release the DB lock between batches.
5. **L1–L5** Date-helper consolidation, localStorage versioning, SECURITY.md, skip link, lazy routes.

**Exit criteria for "premium production-grade":** P0 + P1 complete, all-spec E2E green in CI, signed installer verified on clean VM, restore drill automated, theming complete on all primary pages.

---

## 7. Effort Estimates

Scale: **S** = 1–4 h · **M** = 8–16 h · **L** = 16–40 h. One engineer, familiar with the codebase.

| ID | Item | Size | Hours |
|----|------|------|-------|
| C1 | Fix 66× mutex `.unwrap()` + lint gate | M | 8–16 |
| C2 | OAuth secrets out of binary + PKCE + rotation | S–M | 4–8 |
| C3 | FK enforcement + orphan sweep/repair | M | 8–16 |
| H1 | Encryption-at-rest (SQLCipher path) | L | 24–40 |
| H1-alt | Encryption-at-rest (document BitLocker + remove DLLs) | S | 2–4 |
| H2 | Windows code signing in CI | M | 8–16 (+ cert procurement) |
| H3 | PBKDF2 600k + key-fallback fix | M | 8–16 |
| H4a | All 24 specs in CI / nightly split | S | 2–4 |
| H4b | Packaged-app smoke harness | L | 24–40 |
| H5 | Build-time env fail-fast | S | 2–4 |
| M1 | Chunk long background jobs | M | 8–16 |
| M2 | Coverage gates (TS + Rust) | M | 8–16 (+ ongoing) |
| M3 | Split 3 giant files | L | 48–72 total |
| M4 | Table virtualization | M | 8–16 |
| M5 | Theme 6 remaining primary pages | L | 80–120 total |
| M6 | Remove dead deps | S | 2–4 |
| M7 | Documentation refresh | S | 2–4 |
| M8 | Accessibility pass | M | 8–16 |
| M9 | Script archive + duplicate route | S | 2–4 |
| M10 | cargo audit in CI | S | 1–2 |
| M11 | Automated restore drill | M | 8–16 |
| M12 | CSV import consolidation | M | 8–16 |
| M13 | Export error handling | S | 2–4 |
| L1–L5 | Low-priority batch | S | 6–10 total |

**Totals:** P0 ≈ 26–52 h · P1 ≈ 25–86 h (path-dependent on H1 choice) · P2 ≈ 186–300 h · P3 ≈ 20–34 h.
**Minimum credible "production-grade" bar (P0 + P1 with H1-alt):** ≈ 50–100 engineering hours.

**Suggested implementation order:**

1. **C1** (mutex unwrap) — highest crash-risk reduction, mechanical, unblocks everything else
2. **C3** (FK enforcement + orphan sweep) — stops ongoing data rot the moment it lands
3. **H5** (env fail-fast) — 2-hour fix that closes a silent security downgrade
4. **M11** (automated restore drill) — proves the disaster-recovery story before relying on it
5. **C2** (OAuth secret removal + rotation) — do before next public release
6. **H2** (code signing) — start certificate procurement now; lead time dominates
7. **H1** (encryption-at-rest decision) — pick Option A or B; don't ship the half-state again
8. **H3** (KDF + key fallback) — pairs naturally with H1 work
9. **H4a → M10 → M2** (CI: full E2E specs, cargo audit, coverage gates) — cheap pipeline wins
10. **M4 → M5 → M3** (virtualization, theming, file splits) — the premium-feel block
11. **M6–M9, M12–M13, L1–L5** — batch as cleanup sprints between feature work
12. **H4b** (packaged-app smoke harness) — last; highest cost, do once the rest is stable

---

## Appendix: Strengths (preserve these)

- Zero `any` / `as any` / `@ts-ignore` across `src/`; `strict: true` tsconfig with unused-checks.
- 100% `safeInvoke` IPC discipline; standardized `parseIpcError`/`ipcErrorMessage`; global error capture + ErrorBoundary.
- 100% parameterized SQL (`params![]` / `params_from_iter`); no dynamic SQL from user input observed.
- Strict CSP (no `unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`); asset protocol scoped.
- tauri-plugin-log with 5 MB rotation × 5 files; panic hook persists to error memory; background-health metrics.
- SQLite runtime: WAL, `synchronous=NORMAL`, `busy_timeout=5000`, FK indexes (V10); consistent soft-delete pattern.
- Hardened release profile: LTO, strip, codegen-units=1.
- CI: ESLint/Prettier/tsc, clippy `-D warnings`, rustfmt, cargo-deny, gitleaks, CodeQL, Codecov, Windows-only enforcement.
- Minisign-signed updater with GitHub releases endpoint; MSI + NSIS bundles.
- Versions aligned at 1.0.5 across package.json / Cargo.toml / tauri.conf.json.

*Read-only audit. Generated 2026-06-11.*
