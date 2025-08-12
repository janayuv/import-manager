'use client'

import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { BoeItemInput, CalculationMethod, InvoiceItem } from '@/types/boe-entry'
import React from 'react'

interface ItemsTableProps {
  items: InvoiceItem[]
  itemInputs: BoeItemInput[]
  setItemInputs: Dispatch<SetStateAction<BoeItemInput[]>>
}

export function ItemsTable({ items = [], itemInputs, setItemInputs }: ItemsTableProps) {
  const handleInputChange = (index: number, field: keyof BoeItemInput, value: string | number) => {
    const updatedInputs = [...itemInputs]
    updatedInputs[index] = {
      ...updatedInputs[index],
      [field]: value,
    }
    setItemInputs(updatedInputs)

    // Validate BCD rates when BOE BCD is changed
    if (field === 'boeBcdRate') {
      const item = items[index]
      const actualBcd = item.actualBcdRate
      const boeBcd = value as number
      
      // Show warning if BOE BCD > Actual BCD (BOE BCD should not be higher than Actual BCD)
      if (boeBcd > 0 && boeBcd > actualBcd) {
        toast.warning(`BCD Discrepancy Alert`, {
          description: `Part ${item.partNo}: BOE BCD (${boeBcd}%) > Actual BCD (${actualBcd}%). Please verify the rates.`,
          duration: 5000,
        })
      }
    }
  }

  // Removed unused function

  // Validate all items on component mount and when items change
  React.useEffect(() => {
    if (items.length > 0 && itemInputs.length > 0) {
      // Show discrepancies if BOE BCD > Actual BCD (BOE BCD should not be higher than Actual BCD)
      const discrepancies = items.map((item, index) => {
        const actualBcd = item.actualBcdRate
        const boeBcd = itemInputs[index]?.boeBcdRate || 0
        return {
          partNo: item.partNo,
          actualBcd,
          boeBcd,
          hasDiscrepancy: boeBcd > 0 && boeBcd > actualBcd // BOE BCD > Actual BCD
        }
      }).filter(d => d.hasDiscrepancy)

      if (discrepancies.length > 0) {
        const partNumbers = discrepancies.map(d => d.partNo).join(', ')
        toast.error(`BCD Discrepancy Found`, {
          description: `BOE BCD > Actual BCD for parts: ${partNumbers}. Please review and correct.`,
          duration: 8000,
        })
      }
    }
  }, [items, itemInputs])

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-pink-800 text-gray-100">
            <TableHead className="w-[150px]">Part No</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">HS Code</TableHead>
            <TableHead className="text-right">Actual BCD %</TableHead>
            <TableHead className="text-right">Actual SWS %</TableHead>
            <TableHead className="text-right">Actual IGST %</TableHead>
            <TableHead className="w-[150px]">Calc Method</TableHead>
            <TableHead className="w-[120px] text-right">BOE BCD %</TableHead>
            <TableHead className="w-[120px] text-right">BOE SWS %</TableHead>
            <TableHead className="w-[120px] text-right">BOE IGST %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const actualBcd = item.actualBcdRate
            const boeBcd = itemInputs[index]?.boeBcdRate || 0
            const hasBcdDiscrepancy = boeBcd > 0 && boeBcd > actualBcd

            return (
              <TableRow key={item.partNo} className={hasBcdDiscrepancy ? 'bg-red-50' : ''}>
                <TableCell className="font-medium">{item.partNo}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right">{item.qty ?? '-'}</TableCell>
                <TableCell className="text-right">
                  {item.unitPrice != null ? item.unitPrice.toFixed(2) : '-'}
                </TableCell>
                <TableCell className="text-right">{item.hsCode ?? '-'}</TableCell>
                {/* --- NEW: Display actual rates from shipment --- */}
                <TableCell className="text-right">{item.actualBcdRate.toFixed(2)}%</TableCell>
                <TableCell className="text-right">{item.actualSwsRate.toFixed(2)}%</TableCell>
                <TableCell className="text-right">{item.actualIgstRate.toFixed(2)}%</TableCell>
                <TableCell>
                  <Select
                    value={itemInputs[index]?.calculationMethod || 'Standard'}
                    onValueChange={(value: CalculationMethod) =>
                      handleInputChange(index, 'calculationMethod', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="CEPA">CEPA</SelectItem>
                      <SelectItem value="Rodtep">Rodtep</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className={`text-right ${hasBcdDiscrepancy ? 'border-red-500 bg-red-50' : ''}`}
                    value={itemInputs[index]?.boeBcdRate ?? ''}
                    onChange={(e) =>
                      handleInputChange(index, 'boeBcdRate', parseFloat(e.target.value) || 0)
                    }
                    title={hasBcdDiscrepancy ? `Actual BCD (${actualBcd}%) > BOE BCD (${boeBcd}%)` : ''}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="text-right"
                    value={itemInputs[index]?.boeSwsRate ?? ''}
                    onChange={(e) =>
                      handleInputChange(index, 'boeSwsRate', parseFloat(e.target.value) || 0)
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="bg-gray-100 text-right"
                    value={itemInputs[index]?.boeIgstRate ?? ''}
                    readOnly // IGST should not be user-editable here
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      
      {/* BCD Discrepancy Summary */}
      {items.some((item, index) => {
        const actualBcd = item.actualBcdRate
        const boeBcd = itemInputs[index]?.boeBcdRate || 0
        return boeBcd > 0 && boeBcd > actualBcd
      }) && (
        <div className="p-4 bg-red-50 border-t border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">BCD Discrepancy Alert</span>
          </div>
          <p className="mt-1 text-sm text-red-600">
            BOE BCD rates are higher than Actual BCD rates for some items. Please review and correct the rates.
          </p>
        </div>
      )}
    </div>
  )
}
