# CI/CD Setup for Import Manager

This directory contains GitHub Actions workflows for continuous integration and deployment of the Import Manager Tauri application.

## Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

Runs on every push to `main`/`develop` branches and on pull requests to `main`.

**Jobs:**

- **test-frontend**: Runs linting, testing, and building of the React frontend
- **test-tauri**: Builds and tests the Tauri application on Windows, macOS, and Ubuntu
- **security-audit**: Runs security audits for both npm and Cargo dependencies

### 2. Release Workflow (`.github/workflows/release.yml`)

Triggers on Git tags starting with `v` (e.g., `v1.0.0`) or manual workflow dispatch.

**Features:**

- Builds production releases for Windows, macOS, and Ubuntu
- Creates GitHub releases with downloadable assets
- Supports code signing (when configured)
- Universal builds for macOS (Intel + Apple Silicon)

### 3. Dependabot Auto-merge (`.github/workflows/dependabot-auto-merge.yml`)

Automatically merges safe dependency updates from Dependabot.

## Required Secrets

To use the release workflow with code signing, add these secrets to your GitHub repository:

### Repository Secrets (Settings → Secrets and variables → Actions)

1. **TAURI_PRIVATE_KEY**: Your Tauri private key for code signing

   ```bash
   # Generate a new keypair
   npm run tauri signer generate -- -w ~/.tauri/myapp.key
   # The private key content goes here
   ```

2. **TAURI_KEY_PASSWORD**: Password for the private key (if you set one)

## Setup Instructions

### 1. Repository Setup

1. Push this `.github` directory to your repository
2. Update the `dependabot.yml` file to replace `"your-github-username"` with your actual GitHub username

### 2. Package.json Scripts

Ensure your `package.json` includes these scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "test": "vitest",
    "tauri": "tauri"
  }
}
```

### 3. Code Signing (Optional but Recommended)

For production releases, set up code signing:

#### Generate Tauri Signing Keys

```bash
# Install Tauri CLI if not already installed
npm install -g @tauri-apps/cli

# Generate signing keys
npm run tauri signer generate -- -w ~/.tauri/import-manager.key

# This will output:
# - A private key (save as TAURI_PRIVATE_KEY secret)
# - A public key (commit to your repository)
```

#### Add Public Key to Tauri Config

Add the public key to your `src-tauri/tauri.conf.json`:

```json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": ["https://releases.myapp.com/{{target}}/{{current_version}}"],
      "dialog": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

### 4. Creating Releases

To create a new release:

1. **Using Git Tags:**

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Using GitHub CLI:**

   ```bash
   gh release create v1.0.0 --title "Release v1.0.0" --notes "Release notes here"
   ```

3. **Manual Trigger:**
   Go to Actions → Release → Run workflow

### 5. Branch Protection Rules (Recommended)

Set up branch protection for `main`:

1. Go to Settings → Branches
2. Add rule for `main` branch
3. Enable:
   - Require status checks to pass before merging
   - Require branches to be up to date before merging
   - Require review from code owners
   - Include administrators

## Troubleshooting

### Common Issues

1. **Build Failures on Ubuntu:**
   - Ensure all system dependencies are installed in the workflow
   - Check that the `libgtk-3-dev` and other packages are correctly specified

2. **Windows Build Issues:**
   - Make sure your Rust code doesn't use Unix-specific dependencies
   - Check file path separators and case sensitivity

3. **macOS Universal Builds:**
   - The workflow builds universal binaries (Intel + Apple Silicon)
   - This may increase build time but provides better compatibility

4. **Code Signing Failures:**
   - Verify that `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD` secrets are set correctly
   - Ensure the private key format is correct (PEM format)

### Monitoring

- Check the Actions tab in your GitHub repository for workflow runs
- Set up notifications for failed builds
- Review security audit results regularly

## Customization

You can customize the workflows by:

1. **Changing trigger conditions** in the `on:` section
2. **Modifying build targets** in the strategy matrix
3. **Adding additional testing steps** or quality checks
4. **Configuring different release channels** (stable, beta, alpha)

For more advanced configurations, refer to:

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Tauri Action Documentation](https://github.com/tauri-apps/tauri-action)
- [Tauri Building Documentation](https://tauri.app/v1/guides/building/)
