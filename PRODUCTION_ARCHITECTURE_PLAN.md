# PRODUCTION_ARCHITECTURE_PLAN.md — Import Manager v1.0.5

**Date:** 2026-06-11
**Source of truth:** [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) (score 70/100, conditionally production-ready)
**Companion:** [docs/PRODUCTION_GRADE_PLAN.md](docs/PRODUCTION_GRADE_PLAN.md) — task-level execution plan. This document defines the **target architecture**; the companion defines the work breakdown. Where they overlap, this document states the destination and references the companion's phase for the journey.
**Operator model:** Single trusted owner, Windows-only, two PCs sharing one SQLite database via encrypted backup sync.

---

## 1. Executive Overview

Import Manager v1.0.5 is architecturally sound at its boundaries — strict IPC discipline, parameterized SQL, strict CSP, signed updater — but carries three structural defects that no amount of feature work can compensate for: a panic-propagation model that can brick the database layer (66× poisonable mutex unwraps), secrets compiled into the distributed binary, and referential integrity that exists on paper but not at runtime (FK pragma never enabled).

The target architecture preserves what works (local-first, Context-based state, IPC-as-only-DB-boundary, soft deletes) and changes four structural things:

1. **Fallible-by-construction backend** — no reachable panic path from any IPC command; one DB-access helper, one error type, lint-enforced.
2. **Zero secrets in the artifact** — PKCE OAuth, runtime configuration, machine-bound key storage, signed installer.
3. **Integrity-enforcing data layer** — FKs on, restore drill automated, encryption-at-rest decision made explicit.
4. **One UI system** — Industrial Console as the only shell, with a shared virtualized table core that all 29 pages inherit.

This is an evolution, not a rewrite. Every section below describes target state, the gap from v1.0.5, and the architectural decision — not implementation steps.

---

## 2. Target Production Architecture

### 2.1 Frontend architecture

**Target:** Feature-sliced React 19 with a thin page layer.

```
src/
├── pages/            # Route shells only: compose features, own routing concerns, <300 lines each
├── features/         # (evolved from components/) one folder per domain:
│   └── <domain>/     #   supplier/, shipment/, invoice/, boe/, expenses/...
│       ├── table-*.tsx       # industrial table (columns + shell wiring)
│       ├── form-*.tsx        # RHF + Zod forms
│       ├── hooks/            # domain data hooks wrapping safeInvoke
│       └── export/           # domain export adapters
├── components/ui/    # Radix/shadcn primitives (unchanged)
├── lib/              # cross-domain utilities (unchanged role)
└── providers/        # Settings, User, Notification, Theme (unchanged)
```

- **Page = composition root.** The audit's giant files (`database-management.tsx` ~4019 ln, `operations-center.tsx` ~2974 ln, `InvoiceWizard.tsx` ~1765 ln) violate this; target is no page or component over ~500 lines, with tabs/panels/wizard-steps as lazy sub-components (audit M3).
- **All routes lazy.** Currently 8 heavy pages lazy, rest eager (audit L5). Target: `React.lazy` per route, vendor chunking unchanged.
- **State stays Context + localStorage** per CLAUDE.md — no Redux/Zustand. localStorage entries gain a `version` field with migrate-on-load (audit L2). React Query remains scoped to the three pages already using it; policy documented to resolve PRODUCTION_GRADE_PLAN.md gap G12.

### 2.2 Rust backend architecture

**Target:** Three-layer backend with panic-free command surface.

```
src-tauri/src/
├── commands/      # IPC adapters ONLY: deserialize, authorize, delegate, serialize
├── services/      # business logic: BOE calc, backup orchestration, schedulers (exists, expand)
├── repository/    # NEW: all SQL lives here; one module per aggregate
├── db/            # connection management, runtime pragmas, migration runner
└── utils/         # crypto, keyring (unchanged role)
```

- **Commands become thin.** Today commands hold SQL directly. Target: a command never touches `Connection`; it calls a service or repository function. This makes the unwrap purge (audit C1) durable — there is exactly one place that acquires the lock.
- **No `unwrap()`/`expect()` reachable from IPC.** Enforced via `#![deny(clippy::unwrap_used, clippy::expect_used)]` on `commands/`, `services/`, `repository/`.
- **One error type.** `enum AppError` (Database, Validation, Auth, Integration, LockPoisoned, …) with `impl From<AppError> for IpcError` — replacing 1993 ad-hoc `.map_err(|e| e.to_string())` sites with `?` and preserving the existing `ipc_error.rs` categorization at the boundary.

### 2.3 IPC boundaries

**Target: unchanged contract, hardened enforcement.** The audit confirmed 100% `safeInvoke` discipline frontend-side — keep it, and make it structural:

- ESLint `no-restricted-imports` rule banning `invoke` from `@tauri-apps/api/core` outside `src/lib/ipc-safe.ts` (closes PRODUCTION_GRADE_PLAN.md G4 permanently).
- Every command returns `Result<T, IpcError-serialized>` — already true; the new `AppError → IpcError` mapping guarantees no raw rusqlite error strings (column/table names) cross the boundary (audit "error detail leakage" finding).
- Pagination contract stays: `Option<String> search_text`, `Option<i64> limit/offset` on all list commands; no unbounded fetches (PRODUCTION_GRADE_PLAN.md 5.2).

### 2.4 Service layer

**Target responsibilities** (most already exist; the change is that commands stop bypassing them):

| Service | Owns |
|---------|------|
| `backup_service` | schedule, encrypt, upload, **restore verification** |
| `boe_service` | duty calculations, attachment reconciliation |
| `integrity_service` | NEW — `foreign_key_check` sweeps, orphan quarantine, WAL checkpoint |
| `session_service` | desktop session, idle timeout, permission checks |
| `sync_service` | Google Drive OAuth (PKCE), token refresh, single-writer lock detection |

Long-running services follow the **chunked-lock rule** (see §5.4): acquire the DB lock per batch, never for the duration of a job.

### 2.5 Repository layer

**Target:** New layer, introduced incrementally (new code first, migration opportunistic).

- One module per aggregate: `supplier_repo`, `shipment_repo`, `invoice_repo`, `boe_repo`, `expense_repo`.
- All SQL is prepared + `params![]` (already universal — preserve under lint review).
- Soft-delete filter (`deleted_at IS NULL`) applied in repository functions, not at call sites — removes the per-command consistency burden.
- The single `db()` lock-acquire helper (fallible, never unwrap) lives here.

### 2.6 Database layer

**Target runtime configuration** (single place, `configure_sqlite_runtime()`):

```
PRAGMA journal_mode = WAL;          -- existing
PRAGMA synchronous = NORMAL;        -- existing
PRAGMA busy_timeout = 5000;         -- existing
PRAGMA temp_store = MEMORY;         -- existing
PRAGMA foreign_keys = ON;           -- NEW (audit C3)
```

- Connection model stays `Mutex<Connection>` — correct for single-user (audit M1); the architecture fixes are poisoning-safety and chunked locks, not pooling.
- Refinery migrations unchanged (V1…V79+, append-only).
- Encryption-at-rest: explicit decision required — see §3.3.

---

## 3. Security Architecture

### 3.1 Secret management

**Principle: the shipped binary contains zero secrets.**

| Secret | Today | Target |
|--------|-------|--------|
| Google OAuth client secret | compiled via `option_env!` (audit C2) | none — PKCE desktop flow; client ID configured at runtime (`app_metadata`) |
| Backup encryption key | Windows keyring, plaintext SQLite fallback (audit H3) | keyring primary; fallback DPAPI-wrapped or feature disabled (fail loud) |
| OAuth tokens | keyring + app_metadata fallback | unchanged (sound) |
| `VITE_ADMIN_PASSWORD_HASH` | silent dev-default fallback (audit H5) | build **fails** if unset in production mode (extend `prebuild-check.ps1`; aligns PRODUCTION_GRADE_PLAN.md 4.1) |
| Updater private key | CI secret | unchanged; verify presence in release workflow |

### 3.2 OAuth redesign

Google Drive sync moves to the **OAuth 2.0 Desktop App + PKCE** model:

1. Client registered as "Desktop app" type — Google treats the secret as non-confidential; PKCE removes the need to ship it at all.
2. Authorization code flow with `code_challenge`/`code_verifier`, loopback redirect (existing `http://127.0.0.1:*` in CSP `connect-src` already permits this).
3. Client ID entered once via first-run setup UI → `app_metadata`; the compile-time `option_env!` path is deleted.
4. Currently-shipped client secret rotated in Google Cloud Console after release (every existing binary contains it).
5. Token storage unchanged: keyring primary, refresh-before-expiry.

### 3.3 Database encryption strategy

**Decision required — two valid architectures, no shipping the current half-state** (SQLCipher DLLs bundled but unused, audit H1):

- **Option A (full):** rusqlite `sqlcipher` feature; key generated on first run, held in Windows keyring; one-time migration (`sqlcipher_export()`) with mandatory pre-migration backup; restore path tested against both encrypted and legacy plaintext backups.
- **Option B (documented boundary):** BitLocker/device encryption declared a deployment requirement in OPERATOR_RUNBOOK.md; dead SQLCipher DLLs removed from the bundle; backup encryption (AES-256-GCM) remains the data-leaves-the-machine protection.

**Recommendation: Option B for v1.1, Option A as a v2 milestone.** Single-user + BitLocker covers the realistic threat (lost/stolen device) at 1/10th the engineering risk; Option A's migration touches the most dangerous code path in the app (the only copy of the business data).

### 3.4 Key management

Target key hierarchy:

```
Windows Credential Manager (keyring crate)
├── backup-encryption-key (32B random)      ← never falls back to plaintext
├── oauth-refresh-token
└── [Option A] db-encryption-key
DPAPI (machine+user bound)                   ← wraps any unavoidable DB-stored material
```

- PBKDF2 for password-derived backup keys: **100k → 600k iterations**, versioned header (`IMBK1` read-compat, `IMBK2` written) per audit H3.
- Key export/import UI retained for cross-PC restore (PRODUCTION_GRADE_PLAN.md 3.4) — exported keys are passphrase-wrapped, never raw.

### 3.5 Permission model

Single-user does not mean permission-free — RBAC stays for defense-in-depth and future-proofing:

- Frontend: `useHasPermission()` gates UI affordances (existing, tested in `permissions.test.ts`).
- Backend: every mutating command validates the session via `session_service` before delegating — closes the `admin-001` hardcoded-user debt (PRODUCTION_GRADE_PLAN.md G11) structurally: repository functions take a `user_id` parameter, no defaults.
- Audit trail: `user_activity_audit_logs` writes move into the service layer so they cannot be skipped by individual commands.

---

## 4. Data Architecture

### 4.1 SQLite strategy

Local-first, single file, single writer — affirmed. WAL + `synchronous=NORMAL` + busy_timeout is the right durability/perf point for this workload. Additions:

- **Single-writer enforcement:** lock-file sentinel at startup; refuse (or warn loudly) if the DB appears open elsewhere — mitigates the top item in PRODUCTION_GRADE_PLAN.md's risk register (simultaneous open on two PCs → corruption).
- **Scheduled `PRAGMA quick_check`** in the existing heavy background tick; failures surface in the Error Center, trigger backup prompt.

### 4.2 Foreign-key enforcement

Three-step architecture (audit C3):

1. **Sweep:** one-time `PRAGMA foreign_key_check` across all tables; orphans logged to a quarantine table (visible in admin UI), repaired or soft-deleted with audit entries.
2. **Enforce:** `PRAGMA foreign_keys = ON` in `configure_sqlite_runtime()` — ships only after the sweep is clean.
3. **Monitor:** `integrity_service` re-runs `foreign_key_check` in the heavy tick; any violation is a bug, reported through error memory.

Soft-delete remains the primary deletion model; FK enforcement guards the hard-delete paths (recycle-bin purge) with `ON DELETE RESTRICT` semantics by default.

### 4.3 Migration strategy

Refinery append-only model retained, hardened:

- **Pre-migration auto-backup:** on version-bump startup, snapshot before refinery runs (PRODUCTION_GRADE_PLAN.md 3.5). Failed migration = restore + clear operator message, never a half-migrated DB.
- **Migration CI test:** fresh DB → all migrations → seed smoke data → `foreign_key_check` (PRODUCTION_GRADE_PLAN.md 1C).
- FK-sweep repairs ship as a numbered migration, not ad-hoc SQL.

### 4.4 Backup architecture

Existing design retained (AES-256-GCM, scheduled, Google Drive), with three upgrades:

```
[SQLite DB] → snapshot (WAL-checkpointed) → AES-256-GCM (IMBK2, 600k PBKDF2)
            → local backup dir (rotated)
            → Google Drive (PKCE OAuth)
Key: Windows keyring → DPAPI wrap (fallback) → never plaintext
```

- **Verify-after-write:** every backup is opened and header+tag-verified immediately after creation; unverifiable backup = loud failure, not a silent success log.
- Backup scheduler decoupled from command-path mutex health (a poisoned lock must never silently kill backups — resolved by C1 fix + chunked locks).

### 4.5 Recovery architecture

**Recovery is the product's real SLA for a single user.** Target:

- **Automated restore drill in CI:** create → populate → backup → wipe → restore → row-count + checksum verify (audit M11, PRODUCTION_GRADE_PLAN.md 3.2). This test gates releases.
- **In-app restore flow** covers: latest local, chosen file, Drive download; each path verifies before replacing the live DB (live DB renamed, not deleted, until verification passes).
- **Recovery time objective:** ≤ 15 minutes from clean machine to working app with restored data (per PRODUCTION_GRADE_PLAN.md target), documented as runbook drill.

---

## 5. Reliability Architecture

### 5.1 Error handling

Layered model, one type per layer:

```
rusqlite::Error / io::Error / reqwest::Error
        ↓ From impls
AppError (repository/services)        — context-preserving, internal
        ↓ single mapping at IPC boundary
IpcError { code, message, correlationId } — sanitized, user-safe
        ↓ safeInvoke + parseIpcError (existing, unchanged)
toast.error(ipcErrorMessage(e)) + error memory capture
```

- No `unwrap`/`expect` in command-reachable code (lint-enforced, audit C1).
- Every user-initiated failure produces a visible toast — export modules' silent `console.error` failures (audit M13) are eliminated by routing exports through the same error path.

### 5.2 Logging

Current stack is production-grade (tauri-plugin-log, 5 MB × 5 rotation, stdout/webview/file targets) — retained. Additions:

- Frontend `logger.ts` → `log_client_event` remains the only sanctioned client logging; new `console.*` blocked by ESLint in `pages/` and `features/`.
- **Correlation IDs** flow from `safeInvoke` through IpcError into Rust logs — one ID traces a user action across both processes.
- Log redaction review: no tokens, keys, or row data at `info` level; `debug` level never enabled in release builds.

### 5.3 Crash recovery

- Panic hook (existing, `main.rs:108–123`) retained for last-resort capture into error memory.
- With C1 fixed, mutex poisoning becomes recoverable: the `db()` helper returns `AppError::LockPoisoned`, surfaced as a "restart recommended" dialog instead of cascading panics.
- On startup after non-clean exit (sentinel file): run `quick_check`, offer backup-now, log a crash-recovery event.

### 5.4 Long-running jobs

All background work (backup, BOE reconciliation, integrity checks, dashboard cache, WAL checkpoint) follows:

1. **Chunked locking** — acquire/release per batch (≤100ms hold target), never per job (audit M1).
2. **Cancellation-aware** — jobs check a shutdown flag; app exit doesn't strand half-done work.
3. **Health-reported** — existing background_health metrics retained; consecutive failures escalate to in-app notification.

### 5.5 Concurrency model

Affirmed: single `Mutex<Connection>`, synchronous commands, one background thread with fast (60s) and heavy (15min) ticks. No async pool — wrong complexity for one user. The reliability fixes are poisoning-safety (§5.3) and chunked locks (§5.4), which together remove both failure modes the audit attributed to this model.

---

## 6. UI Architecture

### 6.1 Industrial Console rollout

Target: **one design system, all 29 pages.** Current adoption 5/29 (audit M5). Architecture, not page-by-page tasks (those are PRODUCTION_GRADE_PLAN.md Phase 2):

- Tokens (`table-industrial.css` custom properties) promoted from `components/supplier/` to a shared `src/styles/industrial/` location — supplier stops being the de-facto token owner.
- Page categories and their shells:
  - **List pages** → `im-table-shell` (done for 5; remaining: Frozen Shipments, Recycle Bin)
  - **Dashboard/Reports** → `im-page-header` + status bar + monospace KPI treatment
  - **Settings/Admin consoles** → header + section tokens; no table shell required
- CLAUDE.md's class reference becomes the contract; new pages cannot ship off-theme (review checklist item).

### 6.2 Module boundaries

Feature-folder structure (§2.1) gives each domain a single owner directory. Cross-feature imports allowed only via:

- `lib/` (pure utilities),
- `components/ui/` (primitives),
- explicit shared modules (e.g. the table core, export engine).

No feature imports another feature's internals — prevents the duplication pattern the audit found in CSV import (M12) and date helpers (L1) from recurring.

### 6.3 Large-file decomposition strategy

Standard pattern for the three giants (audit M3) and any future offender:

```
pages/database-management.tsx (4019 ln)
  → pages/database-management.tsx          (~150 ln: tab router + shared state)
  → features/db-management/tabs/BackupTab.tsx        (lazy)
  → features/db-management/tabs/MigrationTab.tsx     (lazy)
  → features/db-management/tabs/IntegrityTab.tsx     (lazy)
  ...
```

- Decomposition is **move-only** (no behavior change), verified by existing E2E specs per page.
- Wizard variant: each `InvoiceWizard` step becomes a component owning its own Zod schema slice; the wizard shell owns step state and the **full-payload pass-through rule** from CLAUDE.md (no silent field drops).
- Budget: pages ≤300 lines, components ≤500 lines; tracked by a lint-stage size check.

### 6.4 Table virtualization strategy

One shared table core, virtualized once, inherited everywhere (audit M4):

- `@tanstack/react-virtual` integrated into the industrial table shell (the single component behind all `im-table-shell` pages) — fixed 36px row height makes virtualization trivial and exact.
- Activation threshold: virtualize when row count > 200; below that, plain render (avoids scroll-jank complexity for small lists).
- Accessibility built into the same core: `aria-rowcount`/`aria-rowindex` (required once rows are windowed), `aria-sort` on headers, `aria-selected` on rows (audit M8) — one implementation, 29 pages inherit.

---

## 7. Testing Architecture

Test pyramid for a desktop app whose CI cannot cheaply run the real shell:

```
            ┌─ Packaged EXE smoke (per release) ─┐   3–5 scenarios
         ┌──┤ Playwright stub E2E (CI, all 24)  ├──┐  workflows/UI
      ┌──┤  Rust integration (cargo test)        ├──┤  backup/restore/migrations
   ┌──┤  Vitest unit (lib + features)            ├──┤  calculations/parsing
   └──┴──────────────────────────────────────────┴──┘
```

### 7.1 Unit tests (Vitest)

- Target coverage: ≥60% lines global, ≥85% for `financial.ts`/`permissions.ts` (adopts PRODUCTION_GRADE_PLAN.md Phase 1A thresholds; audit measured ~37% current).
- Priority gap-fill order from the audit: export modules (`export-boe-pdf.ts`, `export-boe-excel.ts`), `auth.ts`, `settings.ts`, `tauri-bridge.ts`.
- Colocated `*.test.ts` per CLAUDE.md convention.

### 7.2 Rust tests

- `cargo llvm-cov` added to CI for visibility (audit M2 — currently ~48 tests, unmeasured coverage).
- Integration tests as first-class: backup→restore round-trip, migration chain on fresh DB, FK-check post-migration, recycle-bin restore, BOE calculation snapshots (PRODUCTION_GRADE_PLAN.md 1C).
- Repository layer (§2.5) makes command logic testable without Tauri runtime — the structural payoff of the three-layer split.

### 7.3 Playwright strategy

- **All 24 specs run** — fast tier on every PR, slow tier (responsive, perf-audit) in nightly with failure alerts (audit H4a; closes PRODUCTION_GRADE_PLAN.md G2).
- Stub mode (`VITE_PLAYWRIGHT=1`) acknowledged as a UI-contract test, not an integration test — its blind spots (real IPC, CSP, WebView2) are covered by tiers above it, not by pretending.
- `accessibility.spec.ts` expands with axe checks per themed page as §6 rollout proceeds.

### 7.4 Packaged EXE validation

The audit's H4b gap. Target, in cost order:

1. **Now:** scripted manual checklist per release (PRODUCTION_GRADE_PLAN.md Appendix A) on clean VM — login, one CRUD cycle per module, backup+restore, updater check.
2. **Next:** automated smoke via tauri-driver/WebDriver against the built exe with a test DB — 3–5 scenarios (login, supplier CRUD, backup command), weekly + pre-release (PRODUCTION_GRADE_PLAN.md Phase 7).
3. Release workflow uploads the exact tested artifact — no rebuild between test and publish.

### 7.5 Coverage gates

- Vitest thresholds CI-enforced (fail, not report) with diff-aware Codecov PR comments (audit M2; closes G10).
- Ratchet policy: thresholds only go up; raising them is a release-notes item.
- `cargo llvm-cov` reported initially, gated once baseline established.

---

## 8. Release Architecture

### 8.1 CI/CD

Pipeline target (additions to the existing green stack marked **new**):

```
PR:       lint + tsc + prettier → clippy -D warnings + fmt + cargo-deny
          → cargo audit (new) → vitest (gated coverage, new gate)
          → cargo test + llvm-cov (new) → playwright fast tier (all-spec, new)
          → tauri build
Nightly:  playwright slow tier + perf baselines + drift report
Release:  full PR pipeline → signed build (new) → packaged smoke (new)
          → artifact upload + latest.json
```

CodeQL and gitleaks workflows unchanged.

### 8.2 Code signing

Two signatures, two purposes:

1. **Authenticode** on MSI/NSIS installers (audit H2 — currently absent): OV/EV certificate or Azure Trusted Signing; integrated via `bundle > windows > signCommand` in `tauri.conf.json`; HSM-or-CI-secret key custody documented. Verified on a clean VM (SmartScreen pass) each release.
2. **Minisign** on updater artifacts — already configured; `TAURI_PRIVATE_KEY` presence in CI secrets verified and documented (PRODUCTION_GRADE_PLAN.md 6.1).

### 8.3 Release workflow

Tag-driven (`v*`), script-gated:

1. `bump-version.ps1` syncs package.json / Cargo.toml / tauri.conf.json (exists; pre-push verification already in place).
2. `local-release-check.ps1` extended into the single pre-tag gate: type-check, lint, unit+coverage, cargo test, gitleaks, npm/cargo audit, **env-secret presence check** (audit H5).
3. CI builds, signs, smoke-tests the packaged artifact, publishes GitHub release with changelog (`release-notes` skill / conventional commits).
4. Rollback path: previous release's artifacts stay published; updater `latest.json` can be repointed; DB pre-migration backup (§4.3) makes downgrade data-safe.

### 8.4 Update workflow

- Tauri updater with minisign verification (existing) — delta update tested home→office machine pair per release.
- **Update = migration event:** updater-triggered restart runs the pre-migration auto-backup before refinery (§4.3); a failed update never leaves the operator without a working DB.
- Update channel: single stable channel; no betas for a single-operator product.

---

## 9. Implementation Roadmap

Maps audit findings (C/H/M/L IDs) and PRODUCTION_GRADE_PLAN.md phases (P-GP) to architecture milestones. Effort figures in PRODUCTION_AUDIT.md §7.

### Phase A — Critical fixes (~1 week)
*Audit P0. The app must not be able to brick itself or rot its data.*

| Work | Resolves | Architecture section |
|------|----------|---------------------|
| Fallible `db()` helper + purge 66 unwraps + clippy gate | C1 | §2.2, §5.1 |
| FK sweep → quarantine → `PRAGMA foreign_keys = ON` | C3 | §4.2 |
| Build fails on missing `VITE_ADMIN_PASSWORD_HASH` | H5 | §3.1 |
| Automated restore drill in CI | M11 | §4.5 |

### Phase B — Security hardening (~2–3 weeks incl. cert lead time)
*Audit P1 + P-GP Phase 4.*

| Work | Resolves | Architecture section |
|------|----------|---------------------|
| PKCE OAuth, delete `option_env!` path, rotate secret | C2 | §3.2 |
| Authenticode signing in release workflow | H2 | §8.2 |
| Encryption-at-rest decision executed (Option B recommended) | H1 | §3.3 |
| PBKDF2 600k (IMBK2) + DPAPI key fallback | H3 | §3.4 |
| cargo audit in CI | M10 | §8.1 |

### Phase C — Reliability (~2–3 weeks)
*Structural backend work; overlaps P-GP Phases 1C/3/5.*

| Work | Resolves | Architecture section |
|------|----------|---------------------|
| `AppError` type + boundary mapping (replaces string errors) | error-leak finding | §5.1 |
| Repository layer introduction (new code first) | structural | §2.5 |
| Chunked locking for background jobs | M1 | §5.4 |
| Single-writer lock sentinel + crash-recovery startup path | P-GP risk #1 | §4.1, §5.3 |
| Rust llvm-cov + integration test suite | M2 | §7.2 |
| All 24 Playwright specs in CI (fast/nightly split) | H4a | §7.3 |

### Phase D — UX consistency (~3–5 weeks)
*P-GP Phase 2 executed under this document's UI architecture.*

| Work | Resolves | Architecture section |
|------|----------|---------------------|
| Shared virtualized + ARIA table core | M4, M8 | §6.4 |
| Industrial Console rollout: Dashboard, Expenses, Reports, Settings, Frozen, Recycle Bin | M5 | §6.1 |
| Decompose database-management / operations-center / InvoiceWizard | M3 | §6.3 |
| Vitest coverage gates + export/auth test gap-fill | M2 | §7.1, §7.5 |
| Export error handling through standard path; CSV import consolidation | M12, M13 | §5.1, §6.2 |

### Phase E — Production polish (~1–2 weeks)
*Audit P3 + packaged validation.*

| Work | Resolves | Architecture section |
|------|----------|---------------------|
| Remove `sqlite3` + `react-hot-toast`; dead scripts; duplicate route | M6, M9 | §2.1 |
| Docs refresh to current version (CLAUDE.md/AGENTS.md/P-GP) | M7 | — |
| Date-helper consolidation; localStorage versioning; SECURITY.md; skip-link; lazy routes | L1–L5 | §2.1, §6.1 |
| Packaged-EXE smoke harness (tauri-driver) | H4b | §7.4 |
| Clean-VM signed-install + auto-update verification | release gate | §8.3, §8.4 |

**Sequencing rule:** A strictly before B (panic-free backend before security refactors touch it); C and D can interleave (backend vs frontend work for a single implementer); E last. Matches PRODUCTION_AUDIT.md's 12-step implementation order.

---

## 10. Success Criteria

Production-ready when **all** measurable targets hold:

**Stability & integrity**
- [ ] `grep -r "lock().unwrap()" src-tauri/src` → 0; clippy `unwrap_used` deny active on commands/services/repository
- [ ] `PRAGMA foreign_keys` reports ON at runtime; `foreign_key_check` clean in CI and in heavy-tick monitoring
- [ ] Restore drill green in CI on every release build; manual cross-PC restore ≤ 15 min (drill executed twice, P-GP Phase 3 exit gate)
- [ ] Crash → restart → `quick_check` clean: verified scenario test

**Security**
- [ ] `strings` scan of release exe finds no OAuth client secret; old secret rotated
- [ ] Installer Authenticode-signed; SmartScreen-clean on reference VM
- [ ] Backup format IMBK2 (600k PBKDF2); no plaintext key material in SQLite (verified by integration test)
- [ ] Production build hard-fails without `VITE_ADMIN_PASSWORD_HASH`
- [ ] cargo audit + cargo-deny + gitleaks + CodeQL all green, no unacknowledged HIGH advisories

**Quality**
- [ ] Vitest ≥60% lines global, ≥85% financial/permissions — CI-gated
- [ ] Rust coverage measured in CI (llvm-cov), baseline gated
- [ ] 24/24 Playwright specs running (PR fast tier + nightly slow tier); nightly failure alerts on
- [ ] Packaged-EXE smoke (≥3 scenarios) passes per release

**UX**
- [ ] 29/29 pages on Industrial Console tokens; zero hardcoded title colors
- [ ] No page >300 lines, no component >500 lines (lint-checked)
- [ ] Tables virtualized above 200 rows; p95 list load < 500ms at 1000 rows (P-GP Phase 5 target)
- [ ] axe checks pass per themed page; tables expose aria-sort/selected/rowcount; skip-link present

**Release**
- [ ] One-command release gate (`local-release-check.ps1`) covers every quality-gate checklist item from P-GP
- [ ] Auto-update home→office verified per release; rollback path documented and tested once
- [ ] Versions aligned across package.json/Cargo.toml/tauri.conf.json (pre-push check, existing) and docs current

---

*Architecture plan generated 2026-06-11 from PRODUCTION_AUDIT.md (v1.0.5). No application code was modified. Companion execution detail: docs/PRODUCTION_GRADE_PLAN.md.*
