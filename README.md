# Import Manager

A comprehensive desktop application for managing import/export operations, built with Tauri, React, and TypeScript.

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

- **Node.js** 18+ 
- **Rust** (latest stable)
- **Git**

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
src/
├── components/          # React components
│   ├── ui/             # Reusable UI components
│   ├── boe/            # BOE management components
│   ├── invoice/        # Invoice management components
│   ├── shipment/       # Shipment tracking components
│   ├── expenses/       # Expense management components
│   └── layout/         # Layout components
├── pages/              # Page components
├── lib/                # Utility functions and configurations
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
└── assets/             # Static assets

src-tauri/
├── src/                # Rust backend code
├── Cargo.toml          # Rust dependencies
└── tauri.conf.json     # Tauri configuration
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

## 🔒 Security

- **Dependabot**: Automated dependency updates
- **Security Audits**: Regular npm audit checks
- **Vulnerability Scanning**: GitHub security scanning
- **Code Quality**: Comprehensive linting and type checking

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
