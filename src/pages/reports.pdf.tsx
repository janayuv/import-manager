import { useRef } from 'react'
import { Button } from '@/components/ui/button'
// no-op util imports here

type PdfProps = {
  rows: Array<Record<string, unknown>>
  totals?: { qty: number; assessable_value: number; bcd_amount: number; sws_amount: number; igst_amount: number; expenses_total: number }
}

export function ReportPdfView({ rows, totals }: PdfProps) {
  const ref = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Button onClick={handlePrint}>Print / Save PDF</Button>
      </div>
      <div ref={ref} className="bg-white p-4">
        <h1 className="mb-2 text-xl font-bold">Consolidated Import Report</h1>
        <div className="mb-4 text-sm">Generated: {new Date().toLocaleString()}</div>
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              {['Supplier','Invoice No','Date','Part No','Description','Unit','Qty','Unit Price','Assessable Value','BCD','SWS','IGST','Expenses','LDC/qty'].map((h) => (
                <th key={h} className="border px-2 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border px-2 py-1">{r.supplier}</td>
                <td className="border px-2 py-1">{r.invoice_no}</td>
                <td className="border px-2 py-1">{r.invoice_date}</td>
                <td className="border px-2 py-1">{r.part_no}</td>
                <td className="border px-2 py-1">{r.description}</td>
                <td className="border px-2 py-1">{r.unit}</td>
                <td className="border px-2 py-1 text-right">{r.qty}</td>
                <td className="border px-2 py-1 text-right">{r.unit_price}</td>
                <td className="border px-2 py-1 text-right">{r.assessable_value}</td>
                <td className="border px-2 py-1 text-right">{r.bcd_amount}</td>
                <td className="border px-2 py-1 text-right">{r.sws_amount}</td>
                <td className="border px-2 py-1 text-right">{r.igst_amount}</td>
                <td className="border px-2 py-1 text-right">{r.expenses_total}</td>
                <td className="border px-2 py-1 text-right">{r.ldc_per_qty}</td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="font-semibold">
                <td className="border px-2 py-1" colSpan={6}>Totals</td>
                <td className="border px-2 py-1 text-right">{totals.qty?.toFixed(2)}</td>
                <td className="border px-2 py-1" />
                <td className="border px-2 py-1 text-right">{totals.assessable_value?.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{totals.bcd_amount?.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{totals.sws_amount?.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{totals.igst_amount?.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">{totals.expenses_total?.toFixed(2)}</td>
                <td className="border px-2 py-1" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}


