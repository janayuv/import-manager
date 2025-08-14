# Multi-Line Expense Feature Guide

## Overview

The Import Manager now includes a **Multi-Line Expense Feature** that allows you to add multiple expense lines at once, making it much more efficient to manage expenses for shipments.

## How to Use

### 1. Navigate to Expenses Page
- Go to the **Expenses** section in the application
- Select a shipment from the dropdown

### 2. Access Multi-Line Form
- In the expenses list view, you'll see a new button: **"Add Multiple Expenses"**
- Click this button to open the multi-line expense form

### 3. Add Expense Lines
The multi-line form provides:

#### **Add/Remove Lines**
- **"Add Expense Line"** button: Click to add new expense lines
- **Trash icon**: Click to remove expense lines (minimum 1 line required)

#### **Per Line Fields**
Each expense line includes:
- **Expense Type**: Category of expense (e.g., Freight, Insurance, Customs)
- **Service Provider**: The service provider for this expense
- **Invoice Number**: Invoice number from the service provider
- **Invoice Date**: Date of the invoice
- **Amount**: Base amount before taxes
- **CGST Rate**: Central GST percentage
- **SGST Rate**: State GST percentage
- **IGST Rate**: Integrated GST percentage
- **TDS Rate**: Tax Deducted at Source percentage
- **Remarks**: Optional notes for this specific expense

#### **Auto-Calculations**
- **Line Total**: Automatically calculated for each expense line
- **Grand Total**: Sum of all line totals
- **Default Rates**: When you select an expense type, default GST rates are automatically applied

### 4. Submit the Form
- Fill in all required fields for each expense line
- Review the grand total
- Click **"Create Expense Invoice"** to save all expenses

## Key Features

### **Efficiency Benefits**
- **Batch Entry**: Add multiple expenses in one session
- **Auto-calculations**: Real-time calculation of tax amounts and totals
- **Default Rates**: Automatic application of expense type default rates
- **Validation**: Form validation ensures all required fields are completed

### **Flexibility**
- **Dynamic Lines**: Add or remove expense lines as needed
- **Individual Control**: Each line can have different service providers, invoice numbers, and tax rates
- **Line-specific Remarks**: Add specific notes for each expense line

### **User Experience**
- **Visual Feedback**: Each expense line is clearly separated in cards
- **Real-time Totals**: See line totals and grand total update as you type
- **Responsive Design**: Works well on different screen sizes

## Example Usage

### **Scenario**: Multiple expenses from different service providers

**Expense Line 1:**
- Expense Type: Freight
- Service Provider: ABC Logistics
- Invoice Number: INV-001
- Amount: ₹50,000
- CGST: 9%, SGST: 9%

**Expense Line 2:**
- Expense Type: Insurance
- Service Provider: ABC Logistics
- Invoice Number: INV-002
- Amount: ₹5,000
- IGST: 18%

**Expense Line 3:**
- Expense Type: Customs Clearance
- Service Provider: XYZ Customs
- Invoice Number: CLR-001
- Amount: ₹15,000
- CGST: 9%, SGST: 9%, TDS: 2%

## Technical Implementation

### **Frontend Components**
- `ExpenseMultilineForm`: Main multi-line form component
- `ExpenseForm`: Original single-line form (still available)
- Toggle between forms in the expenses page

### **Backend Integration**
- Uses existing `add_expense_invoice_with_expenses` command
- Creates one expense invoice with multiple expense records
- Maintains data integrity with proper foreign key relationships

### **Database Structure**
- `expense_invoices`: Invoice header record
- `expenses`: Individual expense line items
- Automatic calculation of tax amounts and totals

## Switching Between Forms

- **Single Line**: Use the original form for quick single expense entry
- **Multi Line**: Use the new multi-line form for batch expense entry
- **Toggle**: Click "Add Multiple Expenses" to switch to multi-line mode
- **Return**: After submitting multi-line form, you return to the single-line view

## Best Practices

1. **Group Related Expenses**: Add expenses from the same service provider together
2. **Use Consistent Dates**: Use the same invoice date for related expenses
3. **Review Totals**: Always check the grand total before submitting
4. **Add Remarks**: Use remarks to provide context for each expense line
5. **Validate Data**: Ensure all required fields are completed before submission

## Troubleshooting

### **Form Validation Errors**
- Ensure all required fields (*) are filled for each expense line
- Check that amounts are greater than 0
- Verify invoice numbers are not empty

### **Calculation Issues**
- Tax rates should be between 0-100%
- Line totals are calculated automatically
- Grand total updates in real-time

### **Performance**
- The form handles multiple expense lines efficiently
- Large numbers of lines may require scrolling
- Consider breaking very large expense lists into multiple submissions

## Future Enhancements

Potential improvements for future versions:
- **Template Saving**: Save common expense line combinations
- **Bulk Import**: Import multiple expenses from CSV/Excel
- **Copy/Paste**: Copy expense line data between lines
- **Advanced Validation**: More sophisticated validation rules
- **Auto-save**: Save draft expense invoices
