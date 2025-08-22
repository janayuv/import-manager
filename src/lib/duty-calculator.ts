/*
================================================================================
| FILE: src/app/dashboard/boe-entry/lib/duty-calculator.ts                     |
| (MODIFIED)                                                                   |
|------------------------------------------------------------------------------|
| DESCRIPTION:                                                                 |
| Implemented precise rounding at each step of the calculation as per your     |
| requirement to ensure accurate duty values.                                  |
================================================================================
*/
import type { BoeItemInput, CalculatedDutyItem, CalculationResult, Shipment } from '@/types/boe-entry'

interface CalculatorInput {
  shipment: Shipment
  formValues: {
    exchangeRate: number
    freightCost: number
    exwCost: number
    insuranceRate: number
    interest?: number
  }
  itemInputs: BoeItemInput[]
}

// Helper function for consistent rounding
const round = (value: number, decimals: number): number => {
  return parseFloat(value.toFixed(decimals))
}

export function calculateDuties({ shipment, formValues, itemInputs }: CalculatorInput): CalculationResult {
  const calculatedItems: CalculatedDutyItem[] = []
  const totalInvoiceValue = shipment.invoiceValue

  shipment.items.forEach((item) => {
    const correspondingInput = itemInputs.find((i) => i.partNo === item.partNo)
    if (!correspondingInput) return

    // --- COMMON INITIAL CALCULATION WITH ROUNDING ---
    const itemForexValue = item.lineTotal
    const exRate = formValues.exchangeRate

    const itemValueInr = round(itemForexValue * exRate, 2)
    const itemFreight = round((formValues.freightCost / totalInvoiceValue) * itemForexValue, 2)
    const itemExw = round((formValues.exwCost / totalInvoiceValue) * itemForexValue, 2)
    const itemInsurance = round((itemValueInr + itemExw) * (formValues.insuranceRate / 100), 1)

    const assessableValue = round(itemValueInr + itemFreight + itemExw + itemInsurance, 1)

    // --- DUTY CALCULATION BASED ON METHOD ---
    let bcdValueRaw = 0
    let swsValueRaw = 0
    let igstValueRaw = 0

    const boeBcdRate = correspondingInput.boeBcdRate / 100
    const boeSwsRate = correspondingInput.boeSwsRate / 100
    const boeIgstRate = correspondingInput.boeIgstRate / 100
    const actualBcdRate = item.actualBcdRate / 100

    switch (correspondingInput.calculationMethod) {
      case 'Standard':
      case 'CEPA':
        bcdValueRaw = assessableValue * boeBcdRate
        swsValueRaw = bcdValueRaw * boeSwsRate
        igstValueRaw = (assessableValue + bcdValueRaw + swsValueRaw) * boeIgstRate
        break

      case 'Rodtep': {
        bcdValueRaw = assessableValue * boeBcdRate
        const actualBcdValueForSws = assessableValue * actualBcdRate
        swsValueRaw = actualBcdValueForSws * boeSwsRate
        const actualBcdValueForIgst = assessableValue * actualBcdRate
        igstValueRaw = (assessableValue + actualBcdValueForIgst + swsValueRaw) * boeIgstRate
        break
      }
    }

    // --- APPLY FINAL ROUNDING TO DUTY VALUES ---
    const bcdValue = round(bcdValueRaw, 1)
    const swsValue = round(swsValueRaw, 1)
    const igstValue = round(igstValueRaw, 1)

    calculatedItems.push({
      partNo: item.partNo,
      description: item.description,
      assessableValue,
      bcdValue,
      swsValue,
      igstValue,
    })
  })

  // --- AGGREGATE TOTALS WITH ROUNDING ---
  const bcdTotal = Math.round(calculatedItems.reduce((sum, item) => sum + item.bcdValue, 0))
  const swsTotal = Math.round(calculatedItems.reduce((sum, item) => sum + item.swsValue, 0))
  const igstTotal = Math.round(calculatedItems.reduce((sum, item) => sum + item.igstValue, 0))
  const interest = formValues.interest || 0

  // Final total rounded to the nearest whole number
  const customsDutyTotal = Math.round(bcdTotal + swsTotal + igstTotal + interest)

  return {
    calculatedItems,
    bcdTotal,
    swsTotal,
    igstTotal,
    interest,
    customsDutyTotal,
  }
}
