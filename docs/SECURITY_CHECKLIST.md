# Security checklist

Use this list before pushing changes and when onboarding to the Import Manager repository.

## Never commit secrets

- Do not put API keys, tokens, passwords, PEM blocks, or signing material in source files, YAML workflows (except `${{ secrets.* }}`), tests, fixtures, or documentation examples.
- Prefer GitHub Actions **encrypted secrets** for CI and **local `.env`** (gitignored) for development.
- If you accidentally commit a secret, assume it is compromised: remove it from history (for example with `git filter-repo`), rotate the credential, and invalidate the old value at the provider.

## Use `.env` only

- Copy **`.env.example`** to **`.env`** in the repo root and set real values there. **`.env`** is listed in **`.gitignore`** and must never be committed.
- Reference configuration in code via `process.env.*` (or your stack’s equivalent), not hardcoded literals.
- Do not commit `.env.local`, `.env.production`, or other environment files that hold real data.

## Rotate secrets if exposed

- If a key or token appears in git history, a log, a screenshot, or a shared branch—even briefly—**rotate it** at the service that issued it and update GitHub / local `.env` with the new value.
- After rotation, confirm old credentials are revoked or disabled where the provider allows it.

## Run gitleaks before pushing

- **Pre-commit** runs a gitleaks scan via Husky (`npm run security:gitleaks`).
- For a **full-repo** scan across all refs (recommended before release or after large merges), run:

  ```bash
  npm run security:full
  ```

- CI runs **`gitleaks detect --source . --no-banner`** on every push and pull request to `main` and `develop`; fix findings before merging.

## Related files

| File | Purpose |
|------|---------|
| `.gitleaks.toml` | Gitleaks rules and path allowlists (generated dirs only). |
| `.env.example` | Safe template for local environment variables. |
| `.gitignore` | Ensures `.env` and other sensitive paths stay untracked. |
| `.github/workflows/gitleaks.yml` | CI secret scanning. |

### History Remediation Reference

For details about the one-time history rewrite and developer reset instructions:

[docs/GIT_HISTORY_REMEDIATION.md](GIT_HISTORY_REMEDIATION.md)
