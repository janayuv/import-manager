import { describe, expect, it } from 'vitest'
import { buildReportCsv } from '@/lib/financial'

describe('Report CSV', () => {
  it('creates CSV with header and rows', () => {
    const rows = [
      {
        supplier: 'ABC Ltd',
        invoice_no: 'INV-001',
        invoice_date: '2024-01-10',
        part_no: 'P-01',
        description: 'Widget',
        unit: 'PCS',
        qty: 10,
        unit_price: 5,
        assessable_value: 50,
        bcd_amount: 5,
        sws_amount: 0.25,
        igst_amount: 9.45,
        expenses_total: 2.5,
        ldc_per_qty: 6.73,
      },
    ]
    const csv = buildReportCsv(rows)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('Supplier,Invoice No,Date,Part No,Description,Unit,Qty,Unit Price,Assessable Value,BCD,SWS,IGST,Expenses,LDC per qty')
    expect(lines[1]).toContain('"ABC Ltd"')
    expect(lines[1]).toContain('"INV-001"')
  })
})


