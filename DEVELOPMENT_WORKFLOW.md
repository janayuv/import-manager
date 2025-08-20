# Development Workflow

## Branch Protection Rules

This repository has branch protection rules enabled for the `main` branch to ensure code quality and security.

### Protected Branches

- `main` - Production-ready code only
- `develop` - Integration branch for features

### Branch Protection Requirements

1. **Pull Request Required**: All changes must go through a pull request
2. **Status Checks Required**: All CI checks must pass before merging
3. **Code Review Required**: At least one approval required
4. **No Direct Pushes**: Direct pushes to protected branches are blocked

## Development Workflow

### 1. Feature Development

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
# ... code changes ...

# Commit your changes
git add .
git commit -m "feat: add your feature description"

# Push to remote
git push origin feature/your-feature-name
```

### 2. Creating Pull Requests

1. Go to GitHub repository
2. Click "Compare & pull request" for your branch
3. Fill in the PR description
4. Wait for CI checks to pass
5. Get code review approval
6. Merge when ready

### 3. Emergency Fixes (Admin Only)

If you need to bypass branch protection for emergency fixes:

```bash
# Only use this for critical security fixes
git push origin main --force-with-lease
```

**⚠️ Warning**: This bypasses all safety checks. Only use for:

- Critical security vulnerabilities
- Production-breaking bugs
- Emergency hotfixes

## CI/CD Pipeline

### Required Status Checks

- ✅ **check-code**: Code quality checks
- ✅ **build**: Application build
- ✅ **test**: Test suite execution

### What Each Check Does

#### check-code

- Frontend linting (ESLint)
- Type checking (TypeScript)
- Code formatting (Prettier)
- Rust formatting (cargo fmt)
- Rust linting (cargo clippy)
- Security audits (npm audit, cargo audit)

#### build

- Frontend build (Vite)
- Tauri application build
- Artifact generation

#### test

- Frontend tests (Vitest)
- Backend tests (cargo test)

## Security Guidelines

### Before Pushing

1. **Run local checks**:

   ```bash
   npm run lint
   npm run type-check
   npm run format:check
   cargo clippy
   cargo test
   ```

2. **Check for vulnerabilities**:

   ```bash
   npm audit
   cargo audit
   ```

3. **Update dependencies** (if needed):
   ```bash
   npm update
   cargo update
   ```

### Security Best Practices

- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all user inputs
- Keep dependencies updated
- Review security alerts regularly

## Troubleshooting

### CI Check Failures

If CI checks fail:

1. **Check the logs** for specific error messages
2. **Run locally** to reproduce the issue
3. **Fix the issues** in your branch
4. **Push again** to trigger new checks

### Common Issues

#### Frontend Linting Errors

```bash
npm run lint -- --fix
```

#### TypeScript Errors

```bash
npm run type-check
```

#### Rust Clippy Warnings

```bash
cargo clippy --fix
```

#### Security Vulnerabilities

```bash
npm audit fix
# or
cargo audit
```

## Release Process

### Version Tags

- Use semantic versioning (e.g., v1.0.0)
- Tag releases on the main branch
- Automated releases are created from tags

### Release Checklist

- [ ] All tests passing
- [ ] No security vulnerabilities
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] Version bumped
- [ ] Tagged and pushed

## Support

If you encounter issues with the development workflow:

1. Check this documentation
2. Review GitHub Actions logs
3. Create an issue for workflow problems
4. Contact the maintainers for urgent issues
