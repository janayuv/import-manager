# Expense Multiline Form Guide

## Overview
The Expense Multiline Form allows users to add multiple expense lines to a single invoice. This is useful when you have multiple expense types (purposes) that need to be recorded under the same invoice from the same service provider.

## Key Features

### 1. Multiple Expense Lines
- Add multiple expense lines to a single invoice
- Each line can have a different expense type (purpose)
- All lines share the same invoice number and service provider

### 2. Duplicate Expense Type Detection
- **Real-time validation**: The form detects when multiple lines use the same expense type
- **Visual warning**: A yellow alert appears when duplicates are detected
- **Prevention**: The submit button is disabled when duplicates exist
- **Combination option**: Users can automatically combine duplicate expense types

### 3. Auto-sync Functionality
- Invoice number and service provider are automatically synchronized across all lines
- When you change the invoice number or service provider on any line, it updates all lines
- This ensures consistency since all lines belong to the same invoice

### 4. Smart Validation
- Prevents submission with duplicate expense types
- Ensures all required fields are filled
- Validates that all lines use the same invoice number and service provider
- Provides specific error messages for different validation issues

## How to Use

### Adding Multiple Expenses
1. Select an expense type for each line
2. Choose a service provider (will sync across all lines)
3. Enter invoice number (will sync across all lines)
4. Set invoice date
5. Enter amounts and tax rates for each line
6. Add remarks if needed

### Handling Duplicate Expense Types
When you have multiple lines with the same expense type:

**Option 1: Combine Automatically**
- Click the "Combine Duplicates" button in the warning alert
- The system will merge all lines with the same expense type
- Amounts will be summed, remarks will be combined

**Option 2: Use Different Expense Types**
- Change one or more expense types to avoid duplicates
- This is useful when the same service has different purposes

### Best Practices
1. **Use different expense types** for different purposes (e.g., "Freight" vs "Handling")
2. **Combine amounts** when the same expense type appears multiple times
3. **Use remarks** to provide additional context for each line
4. **Verify totals** before submitting

## Technical Implementation

### Duplicate Detection
```typescript
// Real-time detection of duplicate expense types
useEffect(() => {
  const expenseTypeIds = expenseLines
    .map(line => line.expenseTypeId)
    .filter(id => id !== '')
  
  const uniqueIds = new Set(expenseTypeIds)
  
  if (expenseTypeIds.length !== uniqueIds.size) {
    // Show warning and disable submit
  }
}, [expenseLines, expenseTypes])
```

### Auto-sync Implementation
```typescript
// Automatically sync invoice number and service provider
if (field === 'invoiceNo' || field === 'serviceProviderId') {
  setExpenseLines(prevLines =>
    prevLines.map(line => ({
      ...line,
      [field]: value
    }))
  )
}
```

### Combination Logic
```typescript
// Combine duplicate expense types
const combineDuplicateExpenseTypes = () => {
  const expenseTypeGroups = new Map<string, ExpenseLine[]>()
  
  // Group by expense type
  expenseLines.forEach(line => {
    if (line.expenseTypeId) {
      const existing = expenseTypeGroups.get(line.expenseTypeId) || []
      expenseTypeGroups.set(line.expenseTypeId, [...existing, line])
    }
  })
  
  // Create combined lines
  expenseTypeGroups.forEach((lines, expenseTypeId) => {
    if (lines.length > 1) {
      // Sum amounts, combine remarks, use first line's rates
    }
  })
}
```

## Error Messages

- **"Duplicate expense type detected"**: Multiple lines use the same expense type
- **"All expense lines must use the same invoice number"**: Invoice numbers don't match
- **"All expense lines must use the same service provider"**: Service providers don't match
- **"Please fill in all required fields"**: Missing required information

## Database Structure

The form creates:
1. **One expense invoice** with shared invoice details
2. **Multiple expense records** linked to the invoice
3. **Automatic total calculations** for the invoice

This ensures data integrity while allowing flexible expense tracking.
