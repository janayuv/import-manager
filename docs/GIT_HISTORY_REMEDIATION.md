# Git history remediation (security audit record)

This document is a **permanent audit record** of why Import Manager’s Git history was rewritten, what operations were performed, what every developer must do afterward, and how we reduce the chance of recurrence.

---

## 1. Why history was rewritten

### Secrets detected

Automated scanning (**gitleaks**) reported findings across the repository’s history, including:

- **Generic API key–shaped strings** in documentation and examples (e.g. vendor-style `sk-…` patterns used in training text).
- **Bearer tokens** and similar patterns in workflow and CI-related material.
- **CodeQL / generated artifacts** under paths such as `codeql_data/` that had been committed in the past and amplified false positives or duplicated sensitive-looking content from the rest of the tree.

Committed examples and CI snippets are still a **supply-chain and compliance risk** because they train tooling and humans to treat “almost real” material as normal.

### Private keys removed

The history contained **private signing / key material** (including paths under `keys/` and PEM-shaped content in workflows). Anything that ever appeared in a reachable commit must be treated as **potentially disclosed**, even after file deletion on the tip of a branch.

**History rewrite** was required so that **no reachable Git object** continued to carry those bytes, in addition to removing them from the current tree.

---

## 2. What was done

The following summarizes the remediation approach (exact commands may vary by clone; this is the factual record of intent and classes of operations).

### `git filter-repo`

**[git-filter-repo](https://github.com/newren/git-filter-repo)** was used to **purge specific paths** from all commits (for example leaked key files and large `codeql_data/` trees), so they no longer appear anywhere in the rewritten DAG.

### Branches reset

- **`main`** was aligned to the **clean** tip commit that contained the remediated tree (no leaked key files, sanitized docs, and secure workflows).
- **Obsolete local branches** that still pointed at pre-remediation commits (including stale **dependabot** and **feature** branches) were **deleted** so local `refs/heads/*` did not keep old objects reachable.

### Tags deleted

Release tags that pointed at **pre-remediation** commits (e.g. `v0.1.6`, `v1.0.0-rc1`) were **removed locally and on the remote** so tags could not be used to resurrect old trees. **New release tags** should be created from the clean history when publishing versions.

### Stashes cleared

**`git stash clear`** was used to remove stash entries that referenced old commits. Stashes are refs too; leaving them would have kept vulnerable blobs reachable during scans.

### Remote updates

- **`main`** and the active integration branch were **force-pushed** to `origin` after coordination (branch protection may require admin bypass or temporary rule changes).
- Obsolete **remote** branches (where applicable) and **remote tags** were deleted so the default remote no longer advertised compromised history.

---

## 3. Required developer actions

Everyone with a clone from **before** remediation must assume their local repo still has **old objects** until they refresh.

### Reset local clones

On each machine:

1. **Fetch** the new history: `git fetch origin --prune`
2. For the branch you track (usually **`main`**):  
   `git checkout main && git reset --hard origin/main`
3. For any other long-lived branches you use, **reset them to `origin/<branch>`** the same way, or delete and recreate them from the remote.

If anything looks wrong, a **fresh clone** into a new directory is the safest recovery.

### Delete stale branches

Remove **local** branches that still track old SHAs (especially old **dependabot/** or abandoned **feature/** names). After `git fetch --prune`, confirm:

```bash
git branch -vv
git for-each-ref refs/heads refs/remotes/origin
```

Nothing listed should point at pre-remediation commit messages or old “insecure test” workflow names unless you intentionally maintain a fork of legacy history (not supported for this repo).

---

## 4. Future prevention

### gitleaks in pre-commit

**Husky** runs secret scanning before commits (see **`.husky/pre-commit`** and **`npm run security:gitleaks`** / `scripts/gitleaks-scan.mjs`). Developers must keep **gitleaks** installed and on `PATH` (see README, “Installing gitleaks (Windows)”).

### gitleaks in CI

**`.github/workflows/gitleaks.yml`** runs **`gitleaks detect --source . --no-banner`** on pushes and pull requests so **secrets cannot land on the default branch** without failing the workflow.

### Secret rotation policy

Treat any material that was **ever** in a public or shared remote as **compromised until rotated**:

1. **Revoke / rotate** keys and tokens at the issuer (signing keys, API keys, CI secrets).
2. **Remove** files and literals from the tree; do not “fix” by only adding `.gitignore`.
3. **Rewrite history** when necessary (as documented here), then **invalidate** old deploy artifacts or caches that might embed old env values.

Operational checklist for contributors: **`docs/SECURITY_CHECKLIST.md`**.

---

## References (in-repo)

| Artifact | Role |
|----------|------|
| `.gitleaks.toml` | Scanner config and narrow path allowlists for generated dirs |
| `docs/SECURITY_CHECKLIST.md` | Day-to-day contributor security checklist |
| `docs/SECURITY.md` / `SECURITY.md` | Security implementation overview |
| `.github/workflows/gitleaks.yml` | CI secret scan |

---

**Maintainers:** Update this file only when a **new** history remediation occurs, so the audit trail stays chronological and trustworthy.
