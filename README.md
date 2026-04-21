# Import Manager

A comprehensive desktop application for managing import/export operations, built with Tauri, React, and TypeScript.

[![Gitleaks Scan](https://github.com/janayuv/import-manager/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/janayuv/import-manager/actions/workflows/gitleaks.yml)

> **⚠️ Platform Restriction: Windows Only**  
> This application is designed exclusively for Windows and is not compatible with Linux or macOS. The app depends on Windows-specific integrations and is not intended for cross-platform use.

## 🚀 Features

### Core Functionality

- **BOE (Bill of Entry) Management**: Complete CRUD operations for BOE records
- **Invoice Management**: Handle import invoices with line items and calculations
- **Shipment Tracking**: Track shipments from supplier to delivery
- **Expense Management**: Comprehensive expense tracking and reporting
- **Item Management**: Manage product items with HSN codes and duty rates
- **Supplier Management**: Maintain supplier information and relationships

### Advanced Features

- **Multi-format Import/Export**: Support for CSV and Excel files
- **Real-time Calculations**: Automatic duty and tax calculations
- **Data Validation**: Comprehensive input validation and error handling
- **Reporting**: Detailed reports and analytics
- **Settings Management**: Configurable application settings
- **Responsive Design**: Modern, responsive UI with dark/light themes

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Tauri (Rust)
- **Database**: SQLite
- **UI Components**: Radix UI, Lucide React
- **Forms**: React Hook Form with Zod validation
- **Tables**: TanStack Table
- **Charts**: Recharts
- **Build Tool**: Vite

## 📋 Prerequisites

- **Windows 10/11** (64-bit)
- **Node.js** 18+
- **Rust** (latest stable)
- **Git**
- **gitleaks** (recommended for pre-commit secret scanning; see below)

## Installing gitleaks (Windows)

Pre-commit runs `gitleaks detect` to help prevent accidental commits of secrets. Husky invokes hooks using Git’s shell, so gitleaks must be installed and available on the **same PATH** that `cmd.exe` / PowerShell use (not only in a single terminal profile).

### Download

1. Open the [gitleaks releases](https://github.com/gitleaks/gitleaks/releases) page.
2. Download the Windows archive for your CPU (for example `gitleaks_8.x.x_windows_x64.zip`).
3. Extract `gitleaks.exe` to a folder you keep for tools (for example `C:\Tools\gitleaks\`).

### Add to PATH

1. Press **Win**, search for **environment variables**, and open **Edit the system environment variables**.
2. Click **Environment Variables**.
3. Under **User variables** (or **System variables**), select **Path** → **Edit** → **New**.
4. Add the folder that contains `gitleaks.exe` (not the `.exe` path itself), then confirm with **OK** on all dialogs.
5. **Close and reopen** terminals, VS Code, and Cursor so they pick up the updated PATH.

### Verify

```bash
gitleaks version
```

You should see a version line (for example `8.30.1`). Then from the repository root:

```bash
npm run security:gitleaks
```

A clean tree should finish with exit code `0`; leaks are reported and fail the command with a non-zero exit code.

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/janayuv/import-manager.git
cd import-manager
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Development

```bash
# Start development server
npm run dev

# In another terminal, start Tauri development
npm run tauri dev
```

### 4. Build for Production

```bash
# Build the application
npm run tauri build
```

## 📁 Project Structure

```
import-manager/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   │   ├── ui/            # Reusable UI components
│   │   ├── boe/           # BOE management components
│   │   ├── invoice/       # Invoice management components
│   │   ├── shipment/      # Shipment tracking components
│   │   ├── expenses/      # Expense management components
│   │   └── layout/        # Layout components
│   ├── pages/             # Page components
│   ├── lib/               # Utility functions and configurations
│   ├── hooks/             # Custom React hooks
│   ├── types/             # TypeScript type definitions
│   ├── contexts/          # React contexts
│   ├── providers/         # React providers
│   └── assets/            # Static assets
│
├── src-tauri/             # Tauri backend (Rust)
│   ├── src/               # Rust source code
│   ├── migrations/        # Database migrations
│   ├── capabilities/     # Tauri capabilities
│   ├── icons/             # Application icons
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
│
├── docs/                  # Documentation
│   ├── guides/           # User and developer guides
│   ├── implementation/   # Implementation details
│   ├── deployment/       # Deployment documentation
│   └── SECURITY.md       # Security documentation
│
├── scripts/               # Build and utility scripts
│   ├── mcp/              # MCP server scripts
│   └── *.ps1             # PowerShell scripts
│
├── tests/                 # Test files
│   ├── e2e/              # End-to-end tests
│   └── *.spec.ts         # Test specifications
│
├── public/                # Public static assets
├── keys/                  # Signing keys (gitignored)
└── package.json          # Node.js dependencies
```

## 🔧 Development

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check

# Type check
npm run type-check

# Run tests
npm run test
```

### Git Hooks

The project uses Husky for pre-commit hooks that automatically:

- Format code with Prettier
- Fix ESLint issues
- Run type checking
- Scan for committed secrets with **gitleaks** (`npm run security:gitleaks` / `scripts/gitleaks-scan.mjs`; install gitleaks on Windows as described above)

## 🚀 GitHub Actions

The repository includes comprehensive GitHub Actions workflows:

### Code Quality Workflow

- **Linting**: ESLint checks for code quality
- **Formatting**: Prettier formatting validation
- **Type Checking**: TypeScript compilation check
- **Build Verification**: Ensures the project builds successfully

### Security Workflow

- **Dependency Audit**: npm audit for security vulnerabilities
- **Vulnerability Reports**: Detailed security reports
- **Automated Fixes**: Dependabot for dependency updates

### Rust Checks

- **Code Formatting**: rustfmt formatting check
- **Linting**: Clippy for Rust code quality
- **Build Verification**: Cargo build and test

## Security & History Remediation

This repository previously underwent a **full history cleanup** to remove sensitive data (including leaked key material and secret-shaped content from older commits).

See **[docs/GIT_HISTORY_REMEDIATION.md](docs/GIT_HISTORY_REMEDIATION.md)** for full details about:

- why history was rewritten
- developer recovery steps
- future prevention controls

## 🔒 Security

- **Dependabot**: Automated dependency updates
- **Security Audits**: Regular npm audit checks
- **Vulnerability Scanning**: GitHub security scanning
- **Code Quality**: Comprehensive linting and type checking

**Long-term governance** (secret handling, branch protection, reviews, incidents, key rotation, and GitHub settings recommendations): **[docs/SECURITY_GOVERNANCE.md](docs/SECURITY_GOVERNANCE.md)**

## 📝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

For support, please open an issue on GitHub or contact the maintainers.

## 🎯 Roadmap

- [ ] Enhanced reporting features
- [ ] Multi-language support
- [ ] Cloud synchronization
- [ ] Mobile companion app
- [ ] Advanced analytics dashboard
- [ ] Integration with customs APIs

---

**Built with ❤️ using Tauri, React, and TypeScript**
