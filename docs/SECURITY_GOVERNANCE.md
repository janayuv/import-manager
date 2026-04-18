# Security governance

This document defines **ongoing** security expectations for Import Manager after the **[v1.0.0-secure-baseline](https://github.com/janayuv/import-manager/releases/tag/v1.0.0-secure-baseline)** release. It complements **[docs/SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md)** (contributor checklist) and **[docs/GIT_HISTORY_REMEDIATION.md](GIT_HISTORY_REMEDIATION.md)** (one-time history cleanup record).

---

## Secret handling rules

1. **Never commit secrets** — API keys, tokens, passwords, PEM blocks, signing keys, or session material must not appear in source, tests, fixtures, docs, or workflow YAML (except `${{ secrets.* }}` references).
2. **Use `.env` locally** — Copy **`.env.example`**, keep **`.env`** gitignored; load configuration via environment variables in code and CI secrets in Actions.
3. **Principle of least privilege** — Grant CI and runtime credentials only the scopes required; prefer short-lived tokens where the platform supports them.
4. **No secret-shaped training data** — Documentation and examples must use obviously fake placeholders (see existing security docs); avoid strings that match common scanner rules (`sk-…` with high entropy, full PEM headers, live URLs with embedded credentials).
5. **Leak response** — If a secret is committed, follow **Incident response** and **Key rotation** below; do not rely on `git revert` alone when material reached a remote.

---

## Branch protection policies

### Goals

- **Default branch** (`main`) is the trust boundary: only reviewed, CI-verified changes merge.
- **Direct pushes** and **force-pushes** are restricted so history and configuration cannot be bypassed casually.
- **Required checks** prevent merges when build, lint, typecheck, or **gitleaks** fail.

### GitHub branch protection recommendations

Configure these in **GitHub → Settings → Branches → Branch protection rules** for `main` (and `develop` if used as a long-lived integration branch):

| Recommendation | Rationale |
|----------------|-----------|
| **Require a pull request before merging** | Ensures review trail and blocks unilateral changes to the default line. |
| **Required approvals: ≥ 1** (≥ 2 for sensitive repos) | Reduces single-person mistakes and abuse; use code owners where appropriate. |
| **Dismiss stale pull request approvals when new commits are pushed** | Guarantees reviewers saw the final diff. |
| **Require conversation resolution before merging** | Ensures open review threads are not ignored. |
| **Require status checks to pass** | Include **gitleaks** workflow and your primary CI (e.g. lint, typecheck, tests). Use “required” checks only for jobs that are stable and fast enough to not block emergency fixes. |
| **Require branches to be up to date before merging** | Merges are tested against the latest `main`. |
| **Require linear history** (optional) | Simplifies bisect and audit; choose based on team merge strategy. |
| **Do not allow bypassing the above settings** | Applies rules to admins unless a documented break-glass process exists. |
| **Restrict who can push to matching branches** | Limit direct pushes to release managers or automation only, if needed. |
| **Allow force pushes: Off** (default for `main`) | Prevents history rewrite without controlled process; align with **[docs/GIT_HISTORY_REMEDIATION.md](GIT_HISTORY_REMEDIATION.md)** if an exception is ever required. |
| **Allow deletions: Off** | Prevents accidental branch deletion. |

**Dependabot:** Keep Dependabot enabled; merge its PRs only after the same checks pass. Do not lower checks for dependency PRs without team agreement.

---

## Code review requirements

1. **Every non-trivial change** merges via **pull request** with at least one **approval** from someone other than the author when team size allows.
2. **Security-sensitive changes** (auth, crypto, file/network IO, workflow secrets, signing, database encryption) require explicit review for:
   - injection and path handling
   - secret and key handling
   - error paths that might leak data
3. **No self-merge** on critical paths unless policy explicitly allows and is documented.
4. **Automated checks** (ESLint, tests, **gitleaks**) must be **green**; reviewers do not waive failures without a recorded exception and follow-up issue.
5. **Documentation** — When behavior or threat model changes, update **SECURITY**, **checklist**, or this governance doc as appropriate.

---

## Incident response steps

1. **Contain** — Revoke or rotate exposed credentials immediately; disable compromised integrations if needed.
2. **Assess** — Identify scope (repos, branches, CI logs, artifacts, forks, caches). Use GitHub Security tab and audit logs where available.
3. **Remediate** — Remove secrets from the tree; if they reached a remote, follow rotation and consider **history rewrite** per **[docs/GIT_HISTORY_REMEDIATION.md](GIT_HISTORY_REMEDIATION.md)** with maintainer approval.
4. **Verify** — Run `npm run security:full` (full gitleaks) and affected tests; confirm CI and branch protection still enforce policy.
5. **Communicate** — Notify affected maintainers and, if users or downstreams are impacted, follow your disclosure policy.
6. **Post-incident** — Document lessons learned; update governance or checklists to prevent recurrence.

---

## Key rotation procedures

### When to rotate

- Any secret **may have been exposed** (commit, log, screenshot, shared branch, misconfigured workflow).
- **Scheduled** rotation for long-lived keys where your policy defines a maximum lifetime (e.g. yearly signing keys, quarterly API keys).

### How to rotate (high level)

1. **Issue new credentials** at the provider (GitHub secrets, cloud APIs, signing infrastructure) **before** invalidating the old ones if zero-downtime rotation is required.
2. **Update** GitHub **Actions secrets** and local **`.env`** templates (never commit values); update **Tauri** / updater signing config per vendor docs.
3. **Invalidate** the old key at the provider once traffic confirms the new key works.
4. **Audit** — Search repo and forks for old fingerprints; re-run **gitleaks** and dependency scans.
5. **Record** — Note rotation date and owner in internal runbooks (not in the public repo).

### Signing keys (Tauri / release)

Follow **[Tauri distribution](https://v2.tauri.app/distribute/)** guidance: keys live only in secure storage and CI secrets; never commit `*.pem` or private key material. After rotation, rebuild and re-sign release artifacts as needed.

---

## Related documents

| Document | Purpose |
|----------|---------|
| [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) | Day-to-day contributor checklist |
| [GIT_HISTORY_REMEDIATION.md](GIT_HISTORY_REMEDIATION.md) | Audit record of history rewrite |
| [SECURITY.md](SECURITY.md) | Security implementation overview |
| Root [SECURITY.md](../SECURITY.md) | Index into `docs/` security content |

---

**Review cadence:** Revisit this document **at least annually** or after a security incident, dependency on a new secret type, or material CI/GitHub change.
