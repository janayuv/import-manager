# Platform Restrictions

## Windows Only

This project (import-manager) is designed exclusively for Windows and is not compatible with Linux, macOS, or other operating systems.

### Enforcement Rules

1. **Tauri Build Target**: Must always be Windows (msi/exe) only
2. **Cross-Platform Settings**: Ignore or block any cross-platform build settings in tauri.conf.json
3. **CI/CD Workflows**: Use `windows-latest` for build, test, and release jobs; auxiliary workflows (for example CodeQL, gitleaks, format, workflow lint) may use `ubuntu-latest` when they do not ship Windows binaries
4. **Documentation**: All documentation and comments must clarify "This project runs only on Windows"
5. **PR/Issue Policy**: Reject or warn against PRs/issues suggesting Linux/macOS builds

### Current Configuration

#### Tauri Configuration Files

- `src-tauri/tauri.conf.json`: Targets only `["msi", "exe"]` ✅
- `src-tauri/tauri-insecure.conf.json`: Targets only `["msi", "exe"]` ✅

#### GitHub Actions Workflows

Application build, test, and release automation use `windows-latest` (see `ci.yml`, `release.yml`, `nightly.yml`, `dependabot-auto-merge.yml`, and `workflow-lint.yml`). Additional workflows use `ubuntu-latest` for tooling that does not produce Windows installers (for example `codeql.yml`, `format.yml`, and `gitleaks.yml`).

Current workflow files:

- `.github/workflows/ci.yml` ✅
- `.github/workflows/release.yml` ✅
- `.github/workflows/codeql.yml` ✅
- `.github/workflows/nightly.yml` ✅
- `.github/workflows/format.yml` ✅
- `.github/workflows/gitleaks.yml` ✅
- `.github/workflows/dependabot-auto-merge.yml` ✅
- `.github/workflows/workflow-lint.yml` ✅

### Windows-Specific Dependencies

The application depends on Windows-specific integrations including:

- **SQLCipher DLLs**: `sqlcipher.dll`, `libcrypto-3-x64.dll`, `libssl-3-x64.dll`, `zlib1.dll`
- **Windows Registry**: Access for application settings and configuration
- **Windows File System**: Windows-specific file paths and operations
- **Windows Security APIs**: Windows-specific encryption and security features
- **Windows Build Tools**: MSVC toolchain and Windows SDK requirements

### Development Guidelines

#### Code Changes

- Do not add cross-platform build configurations
- Reject PRs that suggest Linux/macOS compatibility
- All documentation should clarify Windows-only support
- Test only on Windows environments

#### Build Process

- Use Windows-specific PowerShell commands in CI/CD
- Ensure all shell scripts are compatible with PowerShell
- Use Windows path separators and environment variables

#### Testing

- All tests must run on Windows
- Use Windows-specific test utilities and commands
- Validate Windows-specific functionality

### Reason for Windows-Only Design

This design choice ensures:

1. **Optimal Performance**: Native Windows integration without cross-platform overhead
2. **Security**: Leverage Windows-specific security features and APIs
3. **Reliability**: Eliminate cross-platform compatibility issues
4. **User Experience**: Provide seamless Windows integration
5. **Maintenance**: Focus development efforts on a single platform

### Compliance Checklist

- [x] Tauri build targets restricted to Windows formats
- [x] Build and release CI jobs use `windows-latest`; tooling workflows may use `ubuntu-latest`
- [x] Documentation clearly states Windows-only support
- [x] PowerShell commands used in Windows workflows
- [x] Windows-specific DLLs and dependencies included
- [x] No cross-platform build configurations
- [x] Platform restrictions documented in README
- [x] Security features use Windows-specific APIs

### Monitoring

Regular checks should be performed to ensure:

1. No cross-platform configurations are accidentally added
2. New build and release workflows use `windows-latest`; tooling-only workflows may use `ubuntu-latest` when appropriate
3. Documentation remains accurate about platform restrictions
4. Build process continues to target Windows only
