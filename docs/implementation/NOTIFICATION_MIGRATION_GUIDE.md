# Notification System Migration Guide

## Overview
This guide outlines the migration from scattered toast notifications to a unified, professional notification system across all modules.

## Current Issues Identified

### 1. Inconsistent Notification Patterns
- **Shipment Module**: Uses `toast.success()`, `toast.error()` with varying message formats
- **Invoice Module**: Similar patterns but different wording
- **BOE Module**: Inconsistent success/error messages
- **Expense Module**: Limited error handling, missing notifications
- **Supplier/Item Modules**: Basic toast notifications

### 2. Missing Notifications
- Dashboard module has no notifications
- Some error cases lack proper user feedback
- Loading states not consistently handled
- No persistent notification system usage

### 3. Styling Inconsistencies
- Different toast styles across modules
- No unified design system
- Inconsistent color schemes
- Poor mobile responsiveness

## New Unified System

### Core Components
1. **useUnifiedNotifications Hook**: Centralized notification management
2. **Enhanced Sonner Configuration**: Professional, minimalized styling
3. **Improved Notification Components**: Better UX and accessibility
4. **Module-Specific Helpers**: Consistent patterns per module

### Key Features
- ✅ Consistent messaging patterns
- ✅ Professional, minimalized styling
- ✅ Loading states with proper dismissal
- ✅ Module-specific notification helpers
- ✅ Centralized notification management
- ✅ Better error handling with context
- ✅ Support for both toast and persistent notifications
- ✅ Category-based organization
- ✅ Improved accessibility
- ✅ Better mobile responsiveness

## Migration Steps

### Step 1: Replace Import Statements
```typescript
// OLD
import { toast } from 'sonner';

// NEW
import { useUnifiedNotifications } from '@/hooks/useUnifiedNotifications';
```

### Step 2: Initialize Hook
```typescript
// Add to component
const notifications = useUnifiedNotifications();
```

### Step 3: Replace Notification Calls

#### Success Notifications
```typescript
// OLD
toast.success(`Shipment ${invoiceNumber} created.`);

// NEW
notifications.shipment.created(invoiceNumber);
```

#### Error Notifications
```typescript
// OLD
toast.error('Failed to save shipment.');

// NEW
notifications.shipment.error('save', String(error));
```

#### Loading States
```typescript
// OLD
const toastId = toast.loading('Saving...');
// ... operation
toast.success('Saved!', { id: toastId });

// NEW
const loadingId = notifications.loading('Saving...');
// ... operation
notifications.dismiss(loadingId);
notifications.shipment.created(invoiceNumber);
```

### Step 4: Module-Specific Patterns

#### Shipment Module
```typescript
notifications.shipment.created(invoiceNumber);
notifications.shipment.updated(invoiceNumber);
notifications.shipment.deleted(invoiceNumber);
notifications.shipment.imported(count);
notifications.shipment.exported(count);
notifications.shipment.delivered(invoiceNumber);
notifications.shipment.error(operation, error);
```

#### Invoice Module
```typescript
notifications.invoice.created(invoiceNumber, status);
notifications.invoice.updated(invoiceNumber);
notifications.invoice.deleted(invoiceNumber);
notifications.invoice.finalized(invoiceNumber);
notifications.invoice.imported(count);
notifications.invoice.error(operation, error);
```

#### BOE Module
```typescript
notifications.boe.created(beNumber);
notifications.boe.updated(beNumber);
notifications.boe.deleted(beNumber);
notifications.boe.imported(count);
notifications.boe.error(operation, error);
```

#### Expense Module
```typescript
notifications.expense.created(invoiceNo);
notifications.expense.updated(invoiceNo);
notifications.expense.deleted(invoiceNo);
notifications.expense.imported(count);
notifications.expense.error(operation, error);
```

#### Supplier Module
```typescript
notifications.supplier.created(name);
notifications.supplier.updated(name);
notifications.supplier.deleted(name);
notifications.supplier.imported(count);
notifications.supplier.error(operation, error);
```

#### Item Module
```typescript
notifications.item.created(partNumber);
notifications.item.updated(partNumber);
notifications.item.deleted(partNumber);
notifications.item.imported(count);
notifications.item.exported(count);
notifications.item.error(operation, error);
```

#### System Module
```typescript
notifications.system.backup('started' | 'completed' | 'failed');
notifications.system.maintenance(message);
notifications.system.update(version);
notifications.system.error(operation, error);
```

## Files to Update

### High Priority (Core Modules)
1. `src/pages/shipment.tsx` - Replace all toast calls
2. `src/pages/invoice.tsx` - Replace all toast calls
3. `src/pages/boe.tsx` - Replace all toast calls
4. `src/pages/boe-entry.tsx` - Replace all toast calls
5. `src/pages/expenses.tsx` - Add missing notifications
6. `src/pages/supplier.tsx` - Replace all toast calls
7. `src/pages/item.tsx` - Replace all toast calls

### Medium Priority (Components)
1. `src/components/expenses/expense-form.tsx` - Replace toast calls
2. `src/components/expenses/expense-data-manager.tsx` - Replace toast calls
3. `src/components/expenses/expense-reports.tsx` - Replace toast calls
4. `src/components/expenses/expense-import.tsx` - Add notifications
5. `src/components/expenses/expense-multiline-form.tsx` - Add notifications

### Low Priority (Supporting Files)
1. `src/pages/dashboard.tsx` - Add notifications for data loading errors
2. `src/components/notifications/NotificationDemo.tsx` - Update examples
3. Test files - Update notification expectations

## Testing Checklist

### Before Migration
- [ ] Document current notification behavior
- [ ] Test all notification scenarios
- [ ] Note any missing notifications

### After Migration
- [ ] Test all CRUD operations
- [ ] Test error scenarios
- [ ] Test loading states
- [ ] Test mobile responsiveness
- [ ] Test accessibility
- [ ] Test persistent notifications
- [ ] Verify consistent styling

## Benefits After Migration

1. **Consistency**: All modules use the same notification patterns
2. **Professional Appearance**: Clean, minimalized design
3. **Better UX**: Loading states, proper error handling
4. **Maintainability**: Centralized notification logic
5. **Accessibility**: Better screen reader support
6. **Mobile Friendly**: Responsive design
7. **Categorization**: Notifications organized by module
8. **Flexibility**: Support for both toast and persistent notifications

## Rollback Plan

If issues arise during migration:
1. Keep the old toast imports as fallback
2. Migrate one module at a time
3. Test thoroughly before proceeding
4. Maintain backward compatibility during transition

## Next Steps

1. ✅ Create unified notification hook
2. ✅ Enhance Sonner configuration
3. ✅ Update notification components
4. 🔄 Migrate shipment module (example)
5. ⏳ Migrate remaining modules
6. ⏳ Add missing notifications
7. ⏳ Test all scenarios
8. ⏳ Update documentation
