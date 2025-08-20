# Production-Grade Multiline Expense Module

A complete, production-ready Rust module for handling multiline expense invoices with robust backend logic, comprehensive validation, and extensive testing.

## Features

### ✅ Core Functionality

- **Transactional Invoice Management**: Create and update expense invoices with full transaction safety
- **Idempotency Support**: Prevents duplicate invoices using idempotency keys
- **Optimistic Locking**: Prevents concurrent modification conflicts
- **Server-Side Preview**: Calculate totals without persisting to database
- **Duplicate Combination**: Merge duplicate expense lines by expense type
- **Comprehensive Validation**: Server-side validation for all inputs
- **Tax Calculation**: Precise tax calculations using basis points (paise precision)

### ✅ Production Features

- **Error Handling**: Comprehensive error types with detailed messages
- **Audit Trail**: Version tracking for all invoice changes
- **Database Safety**: Parameterized queries prevent SQL injection
- **Type Safety**: Strict TypeScript interfaces and Rust types
- **Test Coverage**: 9 comprehensive tests covering all scenarios

## Architecture

### Data Structures

```rust
// Core expense line structure
pub struct ExpenseLine {
    pub expense_type_id: String,
    pub amount_paise: i64,           // Amount in smallest currency unit
    pub cgst_rate: i32,              // Tax rates in basis points (900 = 9%)
    pub sgst_rate: i32,
    pub igst_rate: i32,
    pub tds_rate: i32,
    pub remarks: Option<String>,
}

// Invoice payload for creation/updates
pub struct ExpenseInvoicePayload {
    pub shipment_id: String,
    pub service_provider_id: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub currency: String,
    pub idempotency_key: Option<String>,
    pub lines: Vec<ExpenseLine>,
}
```

### Core Services

#### ExpenseService

- `create_or_update_invoice()`: Main upsert function with idempotency
- `preview_invoice()`: Calculate totals without persistence
- `combine_duplicates()`: Merge duplicate expense lines
- `get_invoice()`: Retrieve invoice details

#### TaxCalculator

- `calculate_tax_amount()`: Precise tax calculation using basis points
- `calculate_total_amount()`: Sum of amount + taxes
- `calculate_net_amount()`: Amount + taxes - TDS

#### ExpenseValidator

- `validate_payload()`: Comprehensive input validation
- `validate_expense_line()`: Per-line validation

## API Reference

### Tauri Commands

```rust
// Create or update expense invoice
#[tauri::command]
pub async fn create_expense_invoice(
    payload: ExpenseInvoicePayload,
    state: State<'_, DbState>,
) -> Result<ExpenseInvoiceResponse, String>

// Preview invoice calculations
#[tauri::command]
pub async fn preview_expense_invoice(
    payload: ExpenseInvoicePayload,
    state: State<'_, DbState>,
) -> Result<ExpenseInvoicePreview, String>

// Combine duplicate expense lines
#[tauri::command]
pub async fn combine_expense_duplicates(
    invoice_id: String,
    request: CombineDuplicatesRequest,
    state: State<'_, DbState>,
) -> Result<ExpenseInvoiceResponse, String>

// Get invoice details
#[tauri::command]
pub async fn get_expense_invoice(
    invoice_id: String,
    state: State<'_, DbState>,
) -> Result<ExpenseInvoiceResponse, String>
```

### Request/Response Examples

#### Create Invoice

```json
{
  "shipment_id": "shipment-123",
  "service_provider_id": "provider-456",
  "invoice_number": "INV-2025-001",
  "invoice_date": "2025-01-15",
  "currency": "INR",
  "idempotency_key": "uuid-v4-or-client-key",
  "lines": [
    {
      "expense_type_id": "customs-duty",
      "amount_paise": 150000,
      "cgst_rate": 900,
      "sgst_rate": 900,
      "igst_rate": 0,
      "tds_rate": 0,
      "remarks": "Import customs duty"
    },
    {
      "expense_type_id": "freight",
      "amount_paise": 50000,
      "cgst_rate": 0,
      "sgst_rate": 0,
      "igst_rate": 1800,
      "tds_rate": 0,
      "remarks": "Ocean freight charges"
    }
  ]
}
```

#### Response

```json
{
  "invoice_id": "uuid-generated",
  "total_amount_paise": 200000,
  "total_cgst_amount_paise": 13500,
  "total_sgst_amount_paise": 13500,
  "total_igst_amount_paise": 9000,
  "total_tds_amount_paise": 0,
  "version": 1
}
```

## Tax Calculation Policy

### Basis Points System

- **10000 basis points = 100%**
- **900 basis points = 9%**
- **1800 basis points = 18%**

### Calculation Formula

```rust
// Tax amount calculation
tax_amount = (amount_paise * rate_basis_points) / 10000

// Example: 1000 rupees (100000 paise) with 9% tax
tax_amount = (100000 * 900) / 10000 = 9000 paise = 90 rupees
```

### Rounding Policy

- All calculations use integer arithmetic
- Rounding is done per line, not aggregated
- Small amounts may round to zero (e.g., 1 paise with 9% tax = 0)

## Error Handling

### Error Types

```rust
pub enum ExpenseError {
    Database(rusqlite::Error),
    Validation(String),
    NotFound(String),
    OptimisticLockConflict { expected: i32, actual: i32 },
    DuplicateIdempotencyKey(String),
    NoExpenseLines,
    InvalidTaxRate(String),
    InvalidAmount(String),
}
```

### Common Error Scenarios

- **Validation Errors**: Invalid amounts, tax rates, or missing required fields
- **Optimistic Lock Conflicts**: Concurrent updates to same invoice
- **Idempotency Conflicts**: Duplicate idempotency keys
- **Database Errors**: Connection issues, constraint violations

## Testing

### Test Coverage (9 Tests)

1. **Tax Calculator Rounding**: Edge cases with small amounts
2. **Tax Calculator Totals**: Sum invariants and calculations
3. **Validation**: Input validation for all fields
4. **Create Invoice**: Basic invoice creation
5. **Idempotency**: Duplicate key handling
6. **Preview Invoice**: Server-side calculations
7. **Combine Duplicates**: Merging duplicate expense lines
8. **Get Invoice**: Retrieval functionality
9. **Optimistic Locking**: Concurrent update handling

### Running Tests

```bash
cd src-tauri
cargo test
```

## Database Schema

### Required Tables

```sql
-- Expense types with default tax rates
CREATE TABLE expense_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_cgst_rate INTEGER DEFAULT 0,
    default_sgst_rate INTEGER DEFAULT 0,
    default_igst_rate INTEGER DEFAULT 0,
    default_tds_rate INTEGER DEFAULT 0
);

-- Main invoice table
CREATE TABLE expense_invoices (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    service_provider_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    currency TEXT NOT NULL,
    total_amount_paise INTEGER NOT NULL,
    total_cgst_amount_paise INTEGER NOT NULL,
    total_sgst_amount_paise INTEGER NOT NULL,
    total_igst_amount_paise INTEGER NOT NULL,
    total_tds_amount_paise INTEGER NOT NULL,
    net_amount_paise INTEGER NOT NULL,
    idempotency_key TEXT,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_provider_id, invoice_number)
);

-- Individual expense lines
CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    expense_invoice_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    service_provider_id TEXT NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    expense_type_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    cgst_rate INTEGER NOT NULL,
    sgst_rate INTEGER NOT NULL,
    igst_rate INTEGER NOT NULL,
    tds_rate INTEGER NOT NULL,
    cgst_amount_paise INTEGER NOT NULL,
    sgst_amount_paise INTEGER NOT NULL,
    igst_amount_paise INTEGER NOT NULL,
    tds_amount_paise INTEGER NOT NULL,
    total_amount_paise INTEGER NOT NULL,
    net_amount_paise INTEGER NOT NULL,
    remarks TEXT,
    UNIQUE(expense_invoice_id, expense_type_id)
);
```

## Frontend Integration

### TypeScript Interfaces

```typescript
interface ExpenseLine {
  expense_type_id: string
  amount_paise: number
  cgst_rate: number
  sgst_rate: number
  igst_rate: number
  tds_rate: number
  remarks?: string
}

interface ExpenseInvoicePayload {
  shipment_id: string
  service_provider_id: string
  invoice_number: string
  invoice_date: string
  currency: string
  idempotency_key?: string
  lines: ExpenseLine[]
}
```

### Usage Example

```typescript
import { invoke } from '@tauri-apps/api/tauri'

// Create invoice
const response = await invoke('create_expense_invoice', {
  payload: {
    shipment_id: 'shipment-123',
    service_provider_id: 'provider-456',
    invoice_number: 'INV-2025-001',
    invoice_date: '2025-01-15',
    currency: 'INR',
    idempotency_key: crypto.randomUUID(),
    lines: [
      {
        expense_type_id: 'customs-duty',
        amount_paise: 150000,
        cgst_rate: 900,
        sgst_rate: 900,
        igst_rate: 0,
        tds_rate: 0,
        remarks: 'Import customs duty',
      },
    ],
  },
})

// Preview calculations
const preview = await invoke('preview_expense_invoice', { payload })

// Combine duplicates
const combined = await invoke('combine_expense_duplicates', {
  invoice_id: 'invoice-uuid',
  request: { separator: '; ' },
})
```

## Best Practices

### Security

- ✅ Parameterized queries prevent SQL injection
- ✅ Input validation on all fields
- ✅ No sensitive data in logs
- ✅ Proper error handling without information leakage

### Performance

- ✅ Transactional operations for data consistency
- ✅ Efficient database queries with proper indexing
- ✅ Minimal memory allocations
- ✅ Optimistic locking for concurrency

### Maintainability

- ✅ Comprehensive error types
- ✅ Extensive test coverage
- ✅ Clear separation of concerns
- ✅ Well-documented code
- ✅ Type-safe interfaces

### Reliability

- ✅ Idempotent operations
- ✅ Transaction rollback on errors
- ✅ Version tracking for audit trails
- ✅ Robust validation

## Deployment

### Prerequisites

- Rust 1.70+ with Cargo
- SQLite 3.x
- Tauri framework

### Build

```bash
cd src-tauri
cargo build --release
```

### Dependencies

```toml
[dependencies]
rusqlite = "0.31"
serde = { version = "1.0", features = ["derive"] }
thiserror = "1.0"
uuid = { version = "1.17.0", features = ["v4", "serde"] }
tauri = "2.0"
```

## Status: ✅ Complete

This module is **production-ready** with:

- ✅ All core functions implemented and tested
- ✅ Comprehensive error handling
- ✅ Full test coverage (9 tests passing)
- ✅ Type safety throughout
- ✅ Database transaction safety
- ✅ Idempotency and optimistic locking
- ✅ Tax calculation precision
- ✅ Input validation
- ✅ Documentation

Ready for integration into the main application!
