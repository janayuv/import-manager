# Import Manager - Comprehensive Application Guide

## 📋 Table of Contents
1. [Application Overview](#application-overview)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [Core Modules](#core-modules)
4. [Database Schema](#database-schema)
5. [User Interface](#user-interface)
6. [Security Features](#security-features)
7. [Import/Export Capabilities](#importexport-capabilities)
8. [Reporting & Analytics](#reporting--analytics)
9. [Settings & Configuration](#settings--configuration)
10. [Development & Testing](#development--testing)
11. [Deployment & Distribution](#deployment--distribution)

---

## 🎯 Application Overview

**Import Manager** is a comprehensive Windows-only desktop application designed for managing import/export operations. Built with modern web technologies and packaged as a native desktop app, it provides a complete solution for businesses dealing with international trade, customs clearance, and logistics management.

### Key Features
- **Complete Import/Export Lifecycle Management**: From supplier onboarding to final delivery
- **Customs Clearance Support**: BOE (Bill of Entry) management with automatic calculations
- **Expense Tracking**: Comprehensive expense management with GST calculations
- **Multi-format Data Import/Export**: CSV and Excel file support
- **Real-time Analytics**: Dashboard with business metrics and reporting
- **Enterprise Security**: Database encryption and secure data handling
- **Responsive Design**: Modern UI that adapts to different screen sizes

### Target Users
- Import/Export Companies
- Customs Brokers
- Logistics Managers
- Trade Compliance Officers
- Business Owners in International Trade

---

## 🏗️ Architecture & Technology Stack

### Frontend Technologies
- **React 19**: Modern React with latest features
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Accessible component primitives
- **React Hook Form**: Form management with validation
- **TanStack Table**: Advanced data table functionality
- **Recharts**: Data visualization and charts
- **Framer Motion**: Smooth animations and transitions

### Backend Technologies
- **Tauri**: Rust-based desktop app framework
- **SQLite**: Embedded database with SQLCipher encryption
- **Rusqlite**: Rust SQLite bindings
- **Refinery**: Database migration management

### Development Tools
- **Vite**: Fast build tool and development server
- **ESLint**: Code linting and quality assurance
- **Prettier**: Code formatting
- **Husky**: Git hooks for quality gates
- **Playwright**: End-to-end testing
- **Vitest**: Unit testing framework

### Platform Support
- **Windows 10/11 (64-bit)**: Primary platform
- **Not Compatible**: Linux and macOS (by design)

---

## 📦 Core Modules

### 1. Dashboard Module
**Location**: `src/pages/dashboard.tsx`

The central hub providing real-time insights into business operations:

**Features**:
- **KPI Cards**: Key performance indicators with visual metrics
- **Recent Activity**: Latest shipments, invoices, and BOE entries
- **Quick Actions**: Fast access to common operations
- **Analytics Charts**: Visual representation of business data
- **Status Overview**: Current state of all active shipments

**Key Components**:
- `KpiCard`: Displays individual metrics
- `ActivityFeed`: Shows recent system activity
- `QuickActionPanel`: Common task shortcuts

### 2. Supplier Management Module
**Location**: `src/pages/supplier.tsx`, `src/components/supplier/`

Comprehensive supplier information and relationship management:

**Features**:
- **Supplier CRUD**: Create, read, update, delete supplier records
- **Banking Information**: Complete financial details storage
- **Contact Management**: Multiple contact methods and persons
- **Status Tracking**: Active/inactive supplier management
- **Bulk Import**: CSV/Excel import for multiple suppliers

**Database Tables**:
- `suppliers`: Main supplier information
- `countries`: Country reference data

**Key Components**:
- `SupplierForm`: Add/edit supplier details
- `SupplierTable`: Data display with sorting/filtering
- `SupplierView`: Detailed supplier information display

### 3. Shipment Management Module
**Location**: `src/pages/shipment.tsx`, `src/components/shipment/`

Complete shipment lifecycle tracking from origin to destination:

**Features**:
- **Shipment Tracking**: End-to-end shipment monitoring
- **Status Management**: Multi-stage status workflow
- **Document Management**: Bill of Lading, AWB, container details
- **Timeline Tracking**: ETD, ETA, and delivery dates
- **Weight Management**: Gross weight and container tracking
- **Freeze/Unfreeze**: Prevent modifications to completed shipments

**Database Tables**:
- `shipments`: Main shipment data
- `incoterms`, `shipment_modes`, `shipment_types`, `shipment_statuses`: Reference data

**Key Components**:
- `ProfessionalShipmentForm`: Advanced shipment entry form
- `ShipmentMultilineForm`: Bulk shipment entry
- `ShipmentViewDialog`: Detailed shipment information
- `ResponsiveDataTable`: Adaptive data display

### 4. Item Master Module
**Location**: `src/pages/item.tsx`, `src/components/item/`

Product catalog management with HSN codes and duty calculations:

**Features**:
- **Item Catalog**: Complete product database
- **HSN Code Management**: Harmonized System of Nomenclature codes
- **Duty Rate Configuration**: BCD, SWS, IGST rates
- **Multi-currency Support**: Price management in different currencies
- **Technical Specifications**: Detailed product information
- **Photo Management**: Product image storage
- **Category Management**: Product classification

**Database Tables**:
- `items`: Main item/product data
- `units`, `currencies`, `bcd_rates`, `sws_rates`, `igst_rates`, `categories`, `end_uses`, `purchase_uoms`: Reference data

**Key Components**:
- `ItemForm`: Product entry and editing
- `ItemTable`: Product listing with search/filter
- `ItemView`: Detailed product information

### 5. Invoice Management Module
**Location**: `src/pages/invoice.tsx`, `src/components/invoice/`

Import invoice processing with line item management:

**Features**:
- **Invoice Processing**: Complete invoice lifecycle management
- **Line Item Management**: Detailed item-wise invoice processing
- **Multi-item Support**: Handle invoices with multiple products
- **Quantity & Pricing**: Unit price and quantity management
- **Status Tracking**: Invoice processing status
- **Bulk Import**: CSV/Excel import for multiple invoices

**Database Tables**:
- `invoices`: Main invoice data
- `invoice_line_items`: Individual line items

**Key Components**:
- `InvoiceForm`: Invoice entry form
- `InvoiceWizard`: Step-by-step invoice creation
- `InvoiceViewDialog`: Invoice details display
- `InvoiceTable`: Invoice listing and management

### 6. BOE (Bill of Entry) Management Module
**Location**: `src/pages/boe.tsx`, `src/pages/boe-entry.tsx`, `src/pages/boe-summary.tsx`

Customs clearance and duty calculation system:

**Features**:
- **BOE Entry**: Complete Bill of Entry processing
- **Duty Calculations**: Automatic BCD, SWS, IGST calculations
- **Assessment Value**: Customs valuation management
- **Payment Tracking**: Duty payment status and challan details
- **Document Management**: BOE document storage
- **Status Workflow**: Multi-stage BOE processing status

**Database Tables**:
- `boe_details`: BOE header information
- `boe_calculations`: Detailed calculation data

**Key Components**:
- `BoeEntryForm`: BOE data entry
- `BoeCalculationResults`: Duty calculation display
- `BoeSummaryTable`: BOE overview and status
- `BoeDetailsTable`: Detailed BOE information

### 7. Expense Management Module
**Location**: `src/pages/expenses.tsx`, `src/components/expenses/`

Comprehensive expense tracking and management system:

**Features**:
- **Expense Tracking**: Complete expense lifecycle management
- **Service Provider Management**: Vendor and service provider database
- **Expense Type Configuration**: Customizable expense categories
- **GST Calculations**: Automatic CGST, SGST, IGST calculations
- **Invoice Management**: Expense invoice processing
- **Bulk Import**: CSV/Excel import for multiple expenses
- **Reporting**: Detailed expense reports and analytics

**Database Tables**:
- `service_providers`: Service provider information
- `expense_types`: Expense category definitions
- `expense_invoices`: Expense invoice headers
- `expenses`: Individual expense records
- `expense_attachments`: Document attachments

**Key Components**:
- `ExpenseForm`: Individual expense entry
- `ExpenseMultilineForm`: Bulk expense entry
- `ExpenseImport`: CSV/Excel import functionality
- `ExpenseReports`: Analytics and reporting
- `ShipmentSelector`: Shipment-specific expense management

### 8. Reports Module
**Location**: `src/pages/reports.tsx`

Comprehensive reporting and analytics system:

**Features**:
- **Financial Reports**: Cost analysis and profit calculations
- **Expense Reports**: Detailed expense breakdowns
- **Shipment Reports**: Logistics performance metrics
- **Custom Reports**: User-defined report generation
- **Export Capabilities**: PDF, Excel, CSV export options
- **Dashboard Analytics**: Real-time business metrics

**Key Components**:
- `ReportGenerator`: Dynamic report creation
- `AnalyticsDashboard`: Visual data representation
- `ExportOptions`: Multiple export formats

### 9. Settings Module
**Location**: `src/pages/settings.tsx`

Application configuration and customization:

**Features**:
- **Module Settings**: Per-module configuration options
- **Display Settings**: UI customization and preferences
- **Data Settings**: Default values and validation rules
- **User Preferences**: Personal application settings
- **Theme Management**: Dark/light theme switching
- **Accent Colors**: Custom color scheme selection

**Key Components**:
- `ModuleSettings`: Module-specific configuration
- `ThemeProvider`: Theme management
- `SettingsForm`: Configuration interface

---

## 🗄️ Database Schema

### Core Tables

#### Suppliers Table
```sql
CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    short_name TEXT,
    country TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    beneficiary_name TEXT,
    bank_name TEXT,
    branch TEXT,
    bank_address TEXT,
    account_no TEXT,
    iban TEXT,
    swift_code TEXT,
    is_active BOOLEAN NOT NULL
);
```

#### Shipments Table
```sql
CREATE TABLE shipments (
    id TEXT PRIMARY KEY, 
    supplier_id TEXT NOT NULL, 
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL, 
    goods_category TEXT NOT NULL, 
    invoice_value REAL NOT NULL,
    invoice_currency TEXT NOT NULL, 
    incoterm TEXT NOT NULL, 
    shipment_mode TEXT,
    shipment_type TEXT, 
    bl_awb_number TEXT, 
    bl_awb_date TEXT, 
    vessel_name TEXT,
    container_number TEXT, 
    gross_weight_kg REAL, 
    etd TEXT, 
    eta TEXT,
    status TEXT, 
    date_of_delivery TEXT, 
    is_frozen BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);
```

#### Items Table
```sql
CREATE TABLE items (
    id TEXT PRIMARY KEY,
    part_number TEXT NOT NULL UNIQUE,
    item_description TEXT NOT NULL,
    unit TEXT NOT NULL,
    currency TEXT NOT NULL,
    unit_price REAL NOT NULL,
    hsn_code TEXT NOT NULL,
    supplier_id TEXT,
    is_active BOOLEAN NOT NULL,
    country_of_origin TEXT,
    bcd TEXT,
    sws TEXT,
    igst TEXT,
    technical_write_up TEXT,
    category TEXT,
    end_use TEXT,
    net_weight_kg REAL,
    purchase_uom TEXT,
    gross_weight_per_uom_kg REAL,
    photo_path TEXT,
    FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
);
```

#### Expense Management Tables
```sql
-- Service Providers
CREATE TABLE service_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gstin TEXT UNIQUE,
    state TEXT,
    contact_person TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expense Types
CREATE TABLE expense_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    default_cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    default_sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    default_igst_rate DECIMAL(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expense Invoices
CREATE TABLE expense_invoices (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    service_provider_id TEXT NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    total_cgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_sgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_igst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    remarks TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id),
    FOREIGN KEY (service_provider_id) REFERENCES service_providers(id),
    UNIQUE(service_provider_id, invoice_no)
);

-- Expenses
CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    expense_invoice_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    service_provider_id TEXT NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    expense_type_id TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    cgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    sgst_rate DECIMAL(5, 2) DEFAULT 0.00,
    igst_rate DECIMAL(5, 2) DEFAULT 0.00,
    tds_rate DECIMAL(5, 2) DEFAULT 0.00,
    cgst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * cgst_rate / 100) STORED,
    sgst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * sgst_rate / 100) STORED,
    igst_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * igst_rate / 100) STORED,
    tds_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount * tds_rate / 100) STORED,
    total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount + (amount * (cgst_rate + sgst_rate + igst_rate) / 100)) STORED,
    remarks TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_invoice_id) REFERENCES expense_invoices(id),
    FOREIGN KEY (shipment_id) REFERENCES shipments(id),
    FOREIGN KEY (service_provider_id) REFERENCES service_providers(id),
    FOREIGN KEY (expense_type_id) REFERENCES expense_types(id),
    UNIQUE(expense_invoice_id, expense_type_id)
);
```

### Reference Tables
The application includes numerous reference tables for dropdown options:
- `units`, `currencies`, `countries`
- `bcd_rates`, `sws_rates`, `igst_rates`
- `categories`, `end_uses`, `purchase_uoms`
- `incoterms`, `shipment_modes`, `shipment_types`, `shipment_statuses`

---

## 🎨 User Interface

### Design System
- **Modern Design**: Clean, professional interface following modern design principles
- **Responsive Layout**: Adapts to different screen sizes and resolutions
- **Accessibility**: WCAG compliant with keyboard navigation and screen reader support
- **Theme Support**: Dark and light themes with custom accent colors

### Key UI Components

#### Navigation
- **Sidebar Navigation**: Module-based navigation with collapsible sections
- **Breadcrumbs**: Clear navigation hierarchy
- **Search**: Global search functionality across modules

#### Data Display
- **Responsive Tables**: Adaptive table layouts with sorting, filtering, and pagination
- **Data Cards**: Key information display in card format
- **Charts & Graphs**: Visual data representation using Recharts
- **Status Indicators**: Color-coded status badges and indicators

#### Forms
- **Multi-step Forms**: Complex data entry with wizard-style interfaces
- **Validation**: Real-time form validation with error messages
- **Auto-complete**: Smart suggestions and dropdowns
- **Bulk Entry**: Multi-line forms for bulk data entry

#### Modals & Dialogs
- **View Dialogs**: Detailed information display
- **Form Dialogs**: Inline editing capabilities
- **Confirmation Dialogs**: Safe deletion and action confirmations
- **Progress Indicators**: Loading states and progress tracking

---

## 🔒 Security Features

### Database Encryption
- **SQLCipher Integration**: AES-256 encryption for all database content
- **Secure Key Management**: Keys stored in Windows Credential Manager
- **Automatic Migration**: Seamless migration from plaintext to encrypted databases
- **Strong Cryptography**: PBKDF2-HMAC-SHA512 with 256K iterations

### Application Security
- **Code Signing**: ED25519 signing keys for application verification
- **Auto-update Security**: Secure update verification
- **Input Validation**: Comprehensive input sanitization and validation
- **SQL Injection Prevention**: Parameterized queries and prepared statements

### Data Protection
- **Local Storage**: All data stored locally on user's machine
- **No Cloud Sync**: No data transmission to external servers
- **Backup System**: Automatic database backup before migrations
- **Audit Trail**: Comprehensive logging of all operations

---

## 📥 Import/Export Capabilities

### Supported Formats
- **CSV Files**: Comma-separated values with UTF-8 encoding
- **Excel Files**: .xlsx and .xls formats
- **Template Downloads**: Pre-formatted templates with sample data

### Import Features
- **Bulk Import**: Import hundreds of records at once
- **Data Validation**: Comprehensive validation with detailed error reporting
- **Preview Mode**: Review imported data before final import
- **Progress Tracking**: Real-time progress indication during import
- **Error Handling**: Detailed validation errors with row-specific feedback

### Export Features
- **Multiple Formats**: PDF, Excel, CSV export options
- **Custom Reports**: User-defined report generation
- **Data Filtering**: Export filtered data sets
- **Scheduled Exports**: Automated report generation

### Import Templates
Each module provides downloadable templates:
- **Supplier Template**: Company information and banking details
- **Shipment Template**: Logistics and shipping information
- **Item Template**: Product catalog with HSN codes
- **Invoice Template**: Invoice data with line items
- **Expense Template**: Expense tracking with GST calculations

---

## 📊 Reporting & Analytics

### Dashboard Analytics
- **KPI Metrics**: Key performance indicators with visual representation
- **Trend Analysis**: Historical data trends and patterns
- **Comparative Analysis**: Period-over-period comparisons
- **Real-time Updates**: Live data updates and notifications

### Financial Reports
- **Cost Analysis**: Detailed cost breakdown by shipment
- **Profit Calculations**: Revenue and profit analysis
- **Expense Reports**: Comprehensive expense tracking and analysis
- **Tax Reports**: GST and duty calculations and summaries

### Operational Reports
- **Shipment Reports**: Logistics performance and tracking
- **Supplier Performance**: Vendor analysis and evaluation
- **Inventory Reports**: Item master and stock analysis
- **Custom Reports**: User-defined report generation

### Export Options
- **PDF Reports**: Professional formatted reports
- **Excel Exports**: Detailed data with formulas and formatting
- **CSV Exports**: Raw data for further analysis
- **Print Support**: Direct printing capabilities

---

## ⚙️ Settings & Configuration

### Module Settings
Each module has customizable settings:
- **Display Options**: Column visibility and ordering
- **Default Values**: Pre-filled form values
- **Validation Rules**: Custom validation criteria
- **Workflow Settings**: Status transitions and approvals

### User Preferences
- **Theme Selection**: Dark/light theme with custom accent colors
- **Language Settings**: Interface language preferences
- **Notification Settings**: Alert and notification preferences
- **Display Settings**: Screen resolution and layout preferences

### System Configuration
- **Database Settings**: Connection and performance tuning
- **Security Settings**: Encryption and access control
- **Backup Settings**: Automatic backup configuration
- **Update Settings**: Auto-update preferences

---

## 🧪 Development & Testing

### Code Quality
- **TypeScript**: Strict type checking and type safety
- **ESLint**: Code quality and style enforcement
- **Prettier**: Consistent code formatting
- **Husky**: Pre-commit hooks for quality gates

### Testing Framework
- **Unit Tests**: Vitest for component and function testing
- **Integration Tests**: End-to-end testing with Playwright
- **Accessibility Tests**: Automated accessibility testing
- **Performance Tests**: Application performance monitoring

### Development Tools
- **Hot Reload**: Instant development feedback
- **Debug Tools**: Comprehensive debugging capabilities
- **Error Boundaries**: Graceful error handling
- **Development Server**: Local development environment

### CI/CD Pipeline
- **GitHub Actions**: Automated testing and deployment
- **Code Quality Checks**: Automated linting and formatting
- **Security Scanning**: Vulnerability detection
- **Automated Builds**: Production build generation

---

## 🚀 Deployment & Distribution

### Build Process
- **Tauri Build**: Native desktop application compilation
- **Asset Bundling**: Static asset optimization
- **Code Signing**: Application signing for distribution
- **Installer Creation**: Windows installer generation

### Distribution
- **GitHub Releases**: Automated release management
- **Auto-updates**: Secure application updates
- **Version Management**: Semantic versioning
- **Release Notes**: Detailed change documentation

### Platform Requirements
- **Windows 10/11**: 64-bit operating system
- **Minimum RAM**: 4GB recommended
- **Storage**: 500MB for application and data
- **Network**: Internet connection for updates

---

## 📚 Additional Resources

### Documentation
- **Setup Guide**: Installation and configuration instructions
- **User Manual**: Comprehensive user documentation
- **API Documentation**: Backend command reference
- **Troubleshooting**: Common issues and solutions

### Support
- **GitHub Issues**: Bug reports and feature requests
- **Community Forum**: User community and support
- **Email Support**: Direct technical support
- **Video Tutorials**: Step-by-step usage guides

### Development
- **Contributing Guide**: How to contribute to the project
- **Code of Conduct**: Community guidelines
- **License**: MIT License for open source usage
- **Roadmap**: Future development plans

---

## 🎯 Conclusion

Import Manager is a comprehensive, enterprise-grade desktop application designed specifically for Windows users in the import/export industry. With its modern architecture, robust security features, and comprehensive module coverage, it provides a complete solution for managing international trade operations.

The application's modular design allows for easy customization and extension, while its security features ensure data protection and compliance. The responsive UI and comprehensive reporting capabilities make it suitable for businesses of all sizes, from small importers to large logistics companies.

Built with modern web technologies and packaged as a native desktop application, Import Manager offers the best of both worlds: the power and flexibility of web technologies with the performance and security of native desktop applications.

---

**Last Updated**: December 2024  
**Version**: 0.1.4  
**Platform**: Windows 10/11 (64-bit)  
**License**: MIT License
