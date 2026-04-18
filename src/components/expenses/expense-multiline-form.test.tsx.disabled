import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExpenseMultilineForm } from './expense-multiline-form'
import { invoke } from '@tauri-apps/api/core'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('ExpenseMultilineForm', () => {
  const mockServiceProviders = [
    { id: 'provider1', name: 'Test Provider 1' },
    { id: 'provider2', name: 'Test Provider 2' },
  ]

  const mockExpenseTypes = [
    {
      id: 'type1',
      name: 'Customs Duty',
      defaultCgstRate: 900,
      defaultSgstRate: 900,
      defaultIgstRate: 0,
      isActive: true,
    },
    {
      id: 'type2',
      name: 'Freight',
      defaultCgstRate: 0,
      defaultSgstRate: 0,
      defaultIgstRate: 1800,
      isActive: true,
    },
  ]

  const mockPreview = {
    lines: [
      {
        expense_type_id: 'type1',
        expense_type_name: 'Customs Duty',
        amount_paise: 100000,
        cgst_rate: 900,
        sgst_rate: 900,
        igst_rate: 0,
        tds_rate: 0,
        cgst_amount_paise: 9000,
        sgst_amount_paise: 9000,
        igst_amount_paise: 0,
        tds_amount_paise: 0,
        total_amount_paise: 118000,
        net_amount_paise: 118000,
        remarks: 'Test',
      },
    ],
    total_amount_paise: 100000,
    total_cgst_amount_paise: 9000,
    total_sgst_amount_paise: 9000,
    total_igst_amount_paise: 0,
    total_tds_amount_paise: 0,
    net_amount_paise: 118000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(invoke as vi.MockedFunction<typeof invoke>).mockResolvedValue(mockServiceProviders)
  })

  it('renders the form with initial state', () => {
    render(
      <ExpenseMultilineForm shipmentId="test-shipment" onSuccess={vi.fn()} onCancel={vi.fn()} />
    )

    expect(screen.getByText('Add Multiple Expenses')).toBeInTheDocument()
    expect(screen.getByText('Expense Lines')).toBeInTheDocument()
    expect(screen.getByText('Line 1')).toBeInTheDocument()
  })

  it('loads service providers and expense types on mount', async () => {
    ;(invoke as vi.MockedFunction<typeof invoke>)
      .mockResolvedValueOnce(mockServiceProviders)
      .mockResolvedValueOnce(mockExpenseTypes)

    render(
      <ExpenseMultilineForm shipmentId="test-shipment" onSuccess={vi.fn()} onCancel={vi.fn()} />
    )

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_service_providers')
      expect(invoke).toHaveBeenCalledWith('get_expense_types')
    })
  })

  it('adds new expense line when Add Line button is clicked', () => {
    render(
      <ExpenseMultilineForm shipmentId="test-shipment" onSuccess={vi.fn()} onCancel={vi.fn()} />
    )

    const addButton = screen.getByText('Add Line')
    fireEvent.click(addButton)

    expect(screen.getByText('Line 2')).toBeInTheDocument()
  })

  it('removes expense line when remove button is clicked', () => {
    render(
      <ExpenseMultilineForm shipmentId="test-shipment" onSuccess={vi.fn()} onCancel={vi.fn()} />
    )

    // Add a second line first
    const addButton = screen.getByText('Add Line')
    fireEvent.click(addButton)

    // Now remove the second line
    const removeButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('svg')?.getAttribute('data-lucide') === 'trash-2')
    fireEvent.click(removeButtons[1]) // Click the second remove button

    expect(screen.queryByText('Line 2')).not.toBeInTheDocument()
  })

  it('shows preview when Preview button is clicked', async () => {
    ;(invoke as vi.MockedFunction<typeof invoke>)
      .mockResolvedValueOnce(mockServiceProviders)
      .mockResolvedValueOnce(mockExpenseTypes)
      .mockResolvedValueOnce(mockPreview)

    render(
      <ExpenseMultilineForm shipmentId="test-shipment" onSuccess={vi.fn()} onCancel={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('Preview')).toBeInTheDocument()
    })

    // Fill in required fields
    const serviceProviderSelect = screen.getByDisplayValue('')
    fireEvent.change(serviceProviderSelect, { target: { value: 'provider1' } })

    const invoiceNumberInput = screen.getByPlaceholderText('Enter invoice number')
    fireEvent.change(invoiceNumberInput, { target: { value: 'INV-001' } })

    const expenseTypeSelect = screen.getByDisplayValue('')
    fireEvent.change(expenseTypeSelect, { target: { value: 'type1' } })

    const amountInput = screen.getByDisplayValue('0')
    fireEvent.change(amountInput, { target: { value: '1000' } })

    // Click preview button
    const previewButton = screen.getByText('Preview')
    fireEvent.click(previewButton)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('preview_expense_invoice', expect.any(Object))
    })
  })

  it('submits form with correct payload structure', async () => {
    const onSuccess = vi.fn()
    ;(invoke as vi.MockedFunction<typeof invoke>)
      .mockResolvedValueOnce(mockServiceProviders)
      .mockResolvedValueOnce(mockExpenseTypes)
      .mockResolvedValueOnce({ invoice_id: 'test-invoice' })

    render(
      <ExpenseMultilineForm shipmentId="test-shipment" onSuccess={onSuccess} onCancel={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('Preview')).toBeInTheDocument()
    })

    // Fill in required fields
    const serviceProviderSelect = screen.getByDisplayValue('')
    fireEvent.change(serviceProviderSelect, { target: { value: 'provider1' } })

    const invoiceNumberInput = screen.getByPlaceholderText('Enter invoice number')
    fireEvent.change(invoiceNumberInput, { target: { value: 'INV-001' } })

    const expenseTypeSelect = screen.getByDisplayValue('')
    fireEvent.change(expenseTypeSelect, { target: { value: 'type1' } })

    const amountInput = screen.getByDisplayValue('0')
    fireEvent.change(amountInput, { target: { value: '1000' } })

    // Submit form
    const submitButton = screen.getByText('Create Invoice')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('create_expense_invoice', {
        payload: expect.objectContaining({
          shipment_id: 'test-shipment',
          service_provider_id: 'provider1',
          invoice_number: 'INV-001',
          lines: expect.arrayContaining([
            expect.objectContaining({
              expense_type_id: 'type1',
              amount_paise: 100000, // 1000 * 100
            }),
          ]),
        }),
      })
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('shows validation error when required fields are missing', async () => {
    render(
      <ExpenseMultilineForm shipmentId="test-shipment" onSuccess={vi.fn()} onCancel={vi.fn()} />
    )

    // Try to submit without filling required fields
    const submitButton = screen.getByText('Create Invoice')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Please fill in all required fields')).toBeInTheDocument()
    })
  })
})
