# Advanced Data Validation & Sanitization System

This directory contains a comprehensive data validation and sanitization system for the Import Manager application, providing robust data integrity, security, and user experience improvements.

## 🎯 Overview

The validation system provides:

- **Frontend Validation**: React hooks and utilities for form validation
- **Backend Validation**: Rust-based server-side validation and sanitization
- **Security Features**: SQL injection and XSS attack prevention
- **Data Integrity**: Comprehensive field validation for all business entities
- **User Experience**: Real-time validation feedback and error handling

## 📁 File Structure

```
src/lib/validation/
├── index.ts              # Core validation schemas and utilities
├── useValidation.ts      # React hooks for validation
└── README.md            # This documentation

src-tauri/src/
└── validation.rs        # Backend validation and sanitization
```

## 🔧 Core Components

### 1. Validation Schemas (`index.ts`)

#### Base Validation Schemas

- `sanitizedString` - String validation with sanitization
- `emailSchema` - Email validation with sanitization
- `phoneSchema` - Phone number validation
- `currencySchema` - Currency code validation (ISO 4217)
- `countrySchema` - Country code validation (ISO 3166-1 alpha-2)
- `hsnCodeSchema` - HSN/SAC code validation
- `gstinSchema` - GSTIN validation
- `panSchema` - PAN validation
- `invoiceNumberSchema` - Invoice number validation
- `partNumberSchema` - Part number validation
- `containerNumberSchema` - Container number validation (ISO 6346)
- `blAwbNumberSchema` - BL/AWB number validation
- `accountNumberSchema` - Bank account number validation
- `swiftCodeSchema` - SWIFT/BIC code validation
- `ibanSchema` - IBAN validation
- `positiveNumberSchema` - Positive number validation
- `percentageSchema` - Percentage validation (0-100)
- `pastDateSchema` - Date validation (not in future)

#### Entity-Specific Schemas

- `supplierSchema` - Complete supplier validation
- `shipmentSchema` - Complete shipment validation
- `itemSchema` - Complete item validation
- `expenseSchema` - Complete expense validation
- `boeSchema` - Complete BOE validation

### 2. Validation Hooks (`useValidation.ts`)

#### Main Hook

- `useValidation<T>()` - Comprehensive form validation hook

#### Specialized Hooks

- `useFileValidation()` - File upload validation
- `useCsvValidation<T>()` - CSV data validation
- `useInputValidation()` - User input validation
- `useRealTimeValidation<T>()` - Real-time validation

### 3. Backend Validation (`validation.rs`)

#### Validation Functions

- `validate_string()` - String validation and sanitization
- `validate_email()` - Email validation
- `validate_phone()` - Phone number validation
- `validate_currency()` - Currency code validation
- `validate_country()` - Country code validation
- `validate_hsn_code()` - HSN/SAC code validation
- `validate_gstin()` - GSTIN validation
- `validate_pan()` - PAN validation
- `validate_invoice_number()` - Invoice number validation
- `validate_part_number()` - Part number validation
- `validate_container_number()` - Container number validation
- `validate_bl_awb_number()` - BL/AWB number validation
- `validate_account_number()` - Bank account number validation
- `validate_swift_code()` - SWIFT code validation
- `validate_iban()` - IBAN validation
- `validate_number()` - Number validation with min/max
- `validate_percentage()` - Percentage validation
- `validate_past_date()` - Date validation

#### Security Functions

- `contains_sql_injection()` - SQL injection detection
- `contains_xss()` - XSS attack detection
- `validate_user_input()` - Comprehensive input validation
- `sanitize_string()` - String sanitization
- `sanitize_html()` - HTML content sanitization

#### Entity Validation

- `validate_supplier()` - Supplier data validation
- `validate_shipment()` - Shipment data validation
- `validate_item()` - Item data validation
- `validate_json_data()` - Generic JSON validation
- `validate_csv_data()` - CSV data validation

## 🚀 Usage Examples

### Frontend Validation

#### Basic Form Validation

```tsx
import { supplierSchema, useValidation } from '@/lib/validation'

const SupplierForm = () => {
  const validation = useValidation({
    schema: supplierSchema,
    validateOnBlur: true,
    showToast: true,
  })

  const handleSubmit = async () => {
    const success = await validation.submit(async (data) => {
      // Submit validated data
      await saveSupplier(data)
    })

    if (!success) {
      console.log('Validation failed')
    }
  }

  return (
    <form>
      <input
        value={validation.data.supplierName || ''}
        onChange={(e) => validation.setField('supplierName', e.target.value)}
        onBlur={() => validation.setTouched('supplierName', true)}
        className={validation.hasFieldError('supplierName') ? 'error' : ''}
      />
      {validation.hasFieldError('supplierName') && (
        <span className="error">{validation.getFieldError('supplierName')}</span>
      )}

      <button onClick={handleSubmit} disabled={validation.isSubmitting}>
        Submit
      </button>
    </form>
  )
}
```

#### File Validation

```tsx
import { useFileValidation } from '@/lib/validation'

const FileUpload = () => {
  const { validateFile } = useFileValidation({
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['text/csv'],
    allowedExtensions: ['csv'],
    showToast: true,
  })

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    const result = validateFile(file)

    if (result.success) {
      // Process valid file
      processFile(result.file)
    }
  }

  return <input type="file" onChange={handleFileChange} />
}
```

#### CSV Validation

```tsx
import { itemSchema, useCsvValidation } from '@/lib/validation'

const CsvImport = () => {
  const { validateCsv } = useCsvValidation(itemSchema)

  const handleCsvImport = (csvData) => {
    const result = validateCsv(csvData)

    console.log(`${result.valid.length} valid records`)
    console.log(`${result.invalid.length} invalid records`)

    // Process valid records
    result.valid.forEach((record) => {
      saveItem(record)
    })
  }

  return <button onClick={() => handleCsvImport(data)}>Import CSV</button>
}
```

### Backend Validation

#### Rust Validation

```rust
use crate::validation::{validate_supplier, ValidationResult};

#[tauri::command]
pub fn save_supplier(data: serde_json::Value) -> Result<String, String> {
    // Validate supplier data
    let validation_result = validate_supplier(&data.as_object().unwrap());

    if !validation_result.is_valid {
        return Err(format!("Validation failed: {:?}", validation_result.errors));
    }

    // Process valid data
    // ... save to database

    Ok("Supplier saved successfully".to_string())
}
```

#### Input Sanitization

```rust
use crate::validation::{validate_user_input, sanitize_string};

#[tauri::command]
pub fn process_user_input(input: String) -> Result<String, String> {
    // Validate and sanitize input
    let validation_result = validate_user_input(
        &input,
        Some(1000), // max length
        true,       // check SQL injection
        true,       // check XSS
    );

    if !validation_result.is_valid {
        return Err("Invalid input detected".to_string());
    }

    // Use sanitized input
    let sanitized = sanitize_string(&input);

    Ok(sanitized)
}
```

## 🛡️ Security Features

### SQL Injection Prevention

- Detects common SQL injection patterns
- Validates input against malicious SQL keywords
- Sanitizes input before database operations

### XSS Attack Prevention

- Detects script tags and malicious HTML
- Removes dangerous JavaScript code
- Sanitizes HTML content with allowed tags only

### Input Sanitization

- Removes dangerous characters
- Trims whitespace
- Normalizes input formats
- Length restrictions

## 📊 Validation Patterns

### Email Validation

```regex
^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$
```

### Phone Number Validation

```regex
^[\+]?[1-9][\d]{0,15}$
```

### Currency Code Validation

```regex
^[A-Z]{3}$
```

### Country Code Validation

```regex
^[A-Z]{2}$
```

### HSN/SAC Code Validation

```regex
^[0-9]{4,8}$
```

### GSTIN Validation

```regex
^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$
```

### PAN Validation

```regex
^[A-Z]{5}[0-9]{4}[A-Z]{1}$
```

### Invoice Number Validation

```regex
^[A-Z0-9\-_/]+$
```

### Part Number Validation

```regex
^[A-Z0-9\-_/.]+$
```

### Container Number Validation

```regex
^[A-Z]{4}[0-9]{7}$
```

### BL/AWB Number Validation

```regex
^[A-Z0-9\-]+$
```

### Bank Account Number Validation

```regex
^[0-9]{9,18}$
```

### SWIFT/BIC Code Validation

```regex
^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$
```

### IBAN Validation

```regex
^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$
```

## 🔄 Error Handling

### Frontend Error Handling

```tsx
const validation = useValidation({
  schema: supplierSchema,
  onValidationError: (errors) => {
    console.error('Validation errors:', errors)
    // Custom error handling
  },
  onValidationSuccess: (data) => {
    console.log('Validation successful:', data)
    // Custom success handling
  },
})
```

### Backend Error Handling

```rust
let validation_result = validate_supplier(&data);
if !validation_result.is_valid {
    for error in validation_result.errors {
        println!("Field: {}, Error: {}, Code: {}",
                 error.field, error.message, error.code);
    }
    return Err("Validation failed".to_string());
}
```

## 🧪 Testing

### Validation Test Component

Use the `ValidationTest` component to test all validation features:

```tsx
import ValidationTest from '@/components/validation/ValidationTest'

// Add to your routes or pages
;<ValidationTest />
```

### Test Features

- Basic validation tests
- Form validation tests
- File validation tests
- CSV validation tests
- Security validation tests

## 📈 Performance Considerations

### Frontend Performance

- Validation hooks are memoized
- Real-time validation is debounced
- Error states are optimized
- Form state is efficiently managed

### Backend Performance

- Regex patterns are compiled once
- Validation functions are optimized
- Error collection is efficient
- Sanitization is fast

## 🔧 Configuration

### Validation Options

```tsx
const validation = useValidation({
  schema: supplierSchema,
  initialData: {}, // Initial form data
  validateOnChange: false, // Validate on every change
  validateOnBlur: true, // Validate on blur
  showToast: true, // Show toast notifications
  onValidationSuccess: (data) => {}, // Success callback
  onValidationError: (errors) => {}, // Error callback
})
```

### File Validation Options

```tsx
const { validateFile } = useFileValidation({
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['text/csv'], // MIME types
  allowedExtensions: ['csv'], // File extensions
  showToast: true, // Show notifications
})
```

### Input Validation Options

```tsx
const { validateInput } = useInputValidation({
  maxLength: 1000, // Max input length
  allowHtml: false, // Allow HTML content
  checkSqlInjection: true, // Check for SQL injection
  checkXss: true, // Check for XSS
  showToast: true, // Show notifications
})
```

## 🚨 Error Codes

### Validation Error Codes

- `REQUIRED` - Field is required
- `INVALID_EMAIL` - Invalid email format
- `INVALID_PHONE` - Invalid phone number
- `INVALID_CURRENCY` - Invalid currency code
- `INVALID_COUNTRY` - Invalid country code
- `INVALID_HSN` - Invalid HSN/SAC code
- `INVALID_GSTIN` - Invalid GSTIN
- `INVALID_PAN` - Invalid PAN
- `INVALID_INVOICE` - Invalid invoice number
- `INVALID_PART_NUMBER` - Invalid part number
- `INVALID_CONTAINER` - Invalid container number
- `INVALID_BL_AWB` - Invalid BL/AWB number
- `INVALID_ACCOUNT` - Invalid account number
- `INVALID_SWIFT` - Invalid SWIFT code
- `INVALID_IBAN` - Invalid IBAN
- `MIN_LENGTH` - Input too short
- `MAX_LENGTH` - Input too long
- `MIN_VALUE` - Value too small
- `MAX_VALUE` - Value too large
- `POSITIVE_NUMBER` - Must be positive
- `PERCENTAGE` - Must be 0-100
- `FUTURE_DATE` - Date cannot be in future
- `INVALID_DATE` - Invalid date format
- `SQL_INJECTION` - SQL injection detected
- `XSS` - XSS attack detected
- `INVALID_TYPE` - Invalid data type
- `UNKNOWN_ENTITY` - Unknown entity type

## 🔮 Future Enhancements

### Planned Features

- **Advanced Validation Rules**: Custom validation rules
- **Conditional Validation**: Field-dependent validation
- **Async Validation**: Server-side validation calls
- **Validation Caching**: Cache validation results
- **Batch Validation**: Validate multiple records efficiently
- **Validation Analytics**: Track validation patterns
- **Custom Error Messages**: Localized error messages
- **Validation Templates**: Pre-built validation templates

### Integration Plans

- **Sentry Integration**: Error tracking
- **Analytics Integration**: Usage analytics
- **Monitoring Integration**: Performance monitoring
- **Logging Integration**: Comprehensive logging

## 📚 Best Practices

### Frontend Best Practices

1. **Use TypeScript**: Leverage type safety
2. **Validate Early**: Validate on blur and change
3. **Show Feedback**: Provide immediate user feedback
4. **Handle Errors**: Graceful error handling
5. **Optimize Performance**: Debounce real-time validation
6. **Test Thoroughly**: Test all validation scenarios

### Backend Best Practices

1. **Validate Server-Side**: Always validate on server
2. **Sanitize Input**: Sanitize all user input
3. **Log Errors**: Log validation failures
4. **Return Clear Errors**: Provide meaningful error messages
5. **Optimize Performance**: Efficient validation algorithms
6. **Security First**: Prioritize security validation

### Security Best Practices

1. **Input Validation**: Validate all input
2. **Output Encoding**: Encode output properly
3. **SQL Injection Prevention**: Use parameterized queries
4. **XSS Prevention**: Sanitize HTML content
5. **Length Limits**: Enforce input length limits
6. **Character Filtering**: Filter dangerous characters

## 🤝 Contributing

### Adding New Validation Rules

1. Add validation pattern to `patterns` object
2. Create validation schema in `index.ts`
3. Add validation function in `validation.rs`
4. Update documentation
5. Add tests

### Adding New Entity Validation

1. Create entity schema in `index.ts`
2. Add entity validation in `validation.rs`
3. Create validation hook if needed
4. Update documentation
5. Add tests

### Testing New Features

1. Add unit tests
2. Add integration tests
3. Test edge cases
4. Test security scenarios
5. Update test component

## 📄 License

This validation system is part of the Import Manager application and follows the same license terms.

---

This comprehensive validation and sanitization system ensures data integrity, security, and excellent user experience throughout the Import Manager application.
