# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it to us by emailing [your-email@example.com] or creating a private security advisory on GitHub.

## Current Security Status

### Known Vulnerabilities

#### Moderate: glib crate unsoundness (RUSTSEC-2024-0429)
- **Status**: Acknowledged, monitoring for updates
- **Impact**: Potential memory safety issues in GTK bindings
- **Affected**: Linux builds only (Tauri dependency)
- **Mitigation**: 
  - This is a transitive dependency from Tauri framework
  - We cannot directly fix this as it's not our direct dependency
  - Monitoring Tauri updates for resolution
  - Windows builds are not affected

#### Unmaintained Dependencies (Warnings)
- **Status**: Acknowledged, monitoring for alternatives
- **Impact**: No immediate security risk, but long-term maintenance concern
- **Affected**: GTK-related crates (Linux builds only)
- **Mitigation**:
  - These are Tauri framework dependencies
  - Monitoring for Tauri updates that address these
  - Consider Windows-only builds if Linux support is not critical

## Security Measures

### Automated Security Checks
- **npm audit**: Runs on every CI build
- **cargo audit**: Runs on every CI build
- **Dependabot**: Automated dependency updates
- **Branch Protection**: Required status checks before merging

### Development Guidelines
1. **Never commit secrets** or sensitive data
2. **Use environment variables** for configuration
3. **Validate all user inputs** before processing
4. **Follow secure coding practices** for both Rust and TypeScript
5. **Regular dependency updates** through Dependabot

### Response Timeline
- **Critical**: 24 hours
- **High**: 72 hours  
- **Medium**: 1 week
- **Low**: 2 weeks

## Security Updates

### Recent Security Improvements
- ✅ Added comprehensive CI security checks
- ✅ Implemented branch protection rules
- ✅ Added automated vulnerability scanning
- ✅ Created security policy documentation

### Planned Security Enhancements
- [ ] Add code signing for releases
- [ ] Implement automated security testing
- [ ] Add runtime security monitoring
- [ ] Create security incident response plan
