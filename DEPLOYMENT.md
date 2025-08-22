# Deployment Guide for Import Manager

This guide will help you set up CI/CD for the Import Manager Tauri application using GitHub Actions.

## 🚀 Quick Start

1. **Push the `.github` directory** to your repository
2. **Update configuration** files with your details
3. **Set up secrets** for code signing (optional)
4. **Create your first release**

## 📁 What Was Added

```
.github/
├── workflows/
│   ├── ci.yml                      # Continuous Integration
│   ├── release.yml                 # Release builds
│   ├── code-quality.yml           # Code quality checks
│   └── dependabot-auto-merge.yml  # Auto-merge dependencies
├── dependabot.yml                 # Dependency updates config
└── README.md                      # Detailed CI/CD documentation
```

## ⚙️ Configuration Steps

### 1. Update Dependabot Configuration

Edit `.github/dependabot.yml` and replace all instances of `"your-github-username"` with your actual GitHub username.

### 2. Repository Settings

Go to your GitHub repository settings and configure:

#### Branch Protection (Recommended)

- Settings → Branches → Add rule for `main`
- Enable "Require status checks to pass before merging"
- Select the CI checks you want to require

#### Secrets for Code Signing (Optional)

- Settings → Secrets and variables → Actions
- Add the following secrets:

```bash
# Generate Tauri signing keys
npx @tauri-apps/cli signer generate -w tauri-private.key

# Add these secrets to GitHub:
TAURI_PRIVATE_KEY      # Contents of the private key file
TAURI_KEY_PASSWORD     # Password for the key (if you set one)
```

## 🔄 Workflows Explained

### CI Workflow (`ci.yml`)

**Triggers:** Push to main/develop, Pull requests to main
**What it does:**

- Tests and builds frontend (React/TypeScript)
- Tests and builds Tauri app on Windows only
- Runs security audits for dependencies
- Performs linting and type checking

### Release Workflow (`release.yml`)

**Triggers:** Git tags starting with `v` (e.g., `v1.0.0`)
**What it does:**

- Builds production binaries for Windows only
- Creates GitHub releases with downloadable assets
- Signs applications (if secrets are configured)
- Supports universal macOS builds (Intel + Apple Silicon)

### Code Quality Workflow (`code-quality.yml`)

**Triggers:** Push to main/develop, Pull requests to main
**What it does:**

- Runs ESLint for JavaScript/TypeScript
- Checks TypeScript compilation
- Runs Prettier formatting checks
- Runs Rust formatting (rustfmt) and linting (clippy)

### Dependabot Auto-merge (`dependabot-auto-merge.yml`)

**Triggers:** Dependabot pull requests
**What it does:**

- Automatically merges safe dependency updates
- Only merges patch and minor version updates
- Requires all CI checks to pass first

## 🏷️ Creating Releases

### Method 1: Git Tags

```bash
# Create and push a tag
git tag v1.0.0
git push origin v1.0.0
```

### Method 2: GitHub CLI

```bash
# Create a release with notes
gh release create v1.0.0 --title "Import Manager v1.0.0" --notes "## Features\n- Added new dashboard\n- Improved performance"
```

### Method 3: GitHub Web UI

1. Go to your repository → Releases
2. Click "Create a new release"
3. Choose or create a tag (e.g., `v1.0.0`)
4. Fill in release title and description
5. Publish release

## 🔍 Monitoring & Troubleshooting

### Check Workflow Status

- Go to your repository → Actions tab
- View all workflow runs and their status
- Click on failed runs to see detailed logs

### Common Issues

**Build failures on Windows:**

```bash
# The workflow installs these dependencies automatically:
# SQLCipher and other Windows-specific dependencies are handled by the CI
```

**Code signing issues:**

- Verify `TAURI_PRIVATE_KEY` secret is set correctly
- Ensure the private key is in PEM format
- Check that `TAURI_KEY_PASSWORD` matches your key password

**TypeScript/ESLint errors:**

- Fix locally first: `npm run lint`
- Check TypeScript: `npx tsc --noEmit`
- The CI will fail if there are any linting errors

## 🛠️ Customization

You can customize the workflows by editing the YAML files:

### Add Additional Platforms

```yaml
# In release.yml, add more platforms (Windows only):
matrix:
  platform: [windows-latest]
```

### Change Node.js Version

```yaml
# Update all workflows:
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20' # Change from '18' to '20'
```

### Add Environment Variables

```yaml
# In any workflow:
env:
  CUSTOM_VAR: 'value'
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## 📊 Advanced Features

### Auto-versioning

Consider adding semantic-release for automatic version bumping:

```bash
npm install --save-dev semantic-release
```

### Multi-stage Deployments

You can add staging environments by creating additional workflows with different triggers.

### Code Coverage

Add code coverage reporting by integrating with services like Codecov:

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
```

## 📚 Additional Resources

- [Tauri Building Documentation](https://tauri.app/v1/guides/building/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Tauri Action Repository](https://github.com/tauri-apps/tauri-action)

## 🆘 Getting Help

If you encounter issues:

1. Check the GitHub Actions logs for detailed error messages
2. Refer to the Tauri documentation for platform-specific issues
3. Check if your local build works: `npm run tauri build`
4. Verify all required secrets are properly set

Happy deploying! 🚀
