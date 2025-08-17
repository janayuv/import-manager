// src/lib/settings.ts
export interface NumberFormatSettings {
  decimalPlaces: number
  useThousandsSeparator: boolean
  currencySymbol: string
  currencyPosition: 'before' | 'after'
  showCurrency: boolean
  useCompactNotation: boolean
  compactThreshold: number
  useScientificNotation: boolean
  scientificThreshold: number
  negativeFormat: 'minus' | 'parentheses' | 'brackets'
  zeroFormat: '0' | '0.00' | '-'
}

export interface DateFormatSettings {
  format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-MM-YYYY'
  includeTime: boolean
  timeFormat: '12h' | '24h'
}

export interface TextFormatSettings {
  case: 'lowercase' | 'uppercase' | 'titlecase' | 'sentencecase'
  trimWhitespace: boolean
}

export interface ModuleFieldSettings {
  visible: boolean
  order: number
  width?: string
  case?: 'lowercase' | 'uppercase' | 'titlecase' | 'sentencecase' | 'none'
  trimWhitespace?: boolean
  numberFormat?: 'currency' | 'percentage' | 'decimal' | 'integer' | 'scientific'
  precision?: number
  showSign?: boolean
}

export interface ModuleSettings {
  fields: Record<string, ModuleFieldSettings>
  showTotals: boolean
  showActions: boolean
  itemsPerPage: number
}

export interface AppSettings {
  numberFormat: NumberFormatSettings
  dateFormat: DateFormatSettings
  textFormat: TextFormatSettings
  modules: {
    shipment: ModuleSettings
    invoice: ModuleSettings
    boe: ModuleSettings
    boeSummary: ModuleSettings
    supplier: ModuleSettings
    itemMaster: ModuleSettings
    expenses: ModuleSettings
  }
}

// Default module field configurations - Updated to match actual data structure
const defaultModuleFields: Record<string, Record<string, ModuleFieldSettings>> = {
  shipment: {
    supplierId: {
      visible: true,
      order: 1,
      width: '150px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    invoiceNumber: {
      visible: true,
      order: 2,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    invoiceDate: {
      visible: true,
      order: 3,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    goodsCategory: {
      visible: true,
      order: 4,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    invoiceCurrency: {
      visible: true,
      order: 5,
      width: '80px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    invoiceValue: {
      visible: true,
      order: 6,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    incoterm: {
      visible: true,
      order: 7,
      width: '100px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    vesselName: {
      visible: true,
      order: 8,
      width: '150px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    blAwbNumber: {
      visible: true,
      order: 9,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    blAwbDate: {
      visible: true,
      order: 10,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    shipmentMode: {
      visible: true,
      order: 11,
      width: '100px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    shipmentType: {
      visible: true,
      order: 12,
      width: '100px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    containerNumber: {
      visible: true,
      order: 13,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    grossWeightKg: {
      visible: true,
      order: 14,
      width: '120px',
      numberFormat: 'decimal' as const,
      precision: 2,
      showSign: false,
    },
    etd: { visible: true, order: 15, width: '100px', case: 'none' as const, trimWhitespace: false },
    eta: { visible: true, order: 16, width: '100px', case: 'none' as const, trimWhitespace: false },
    status: {
      visible: true,
      order: 17,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    dateOfDelivery: {
      visible: true,
      order: 18,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    actions: {
      visible: true,
      order: 19,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
  },
  invoice: {
    invoiceId: {
      visible: true,
      order: 1,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    supplierName: {
      visible: true,
      order: 2,
      width: '200px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    invoiceNumber: {
      visible: true,
      order: 3,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    invoiceDate: {
      visible: true,
      order: 4,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    partNumber: {
      visible: true,
      order: 5,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    itemDescription: {
      visible: true,
      order: 6,
      width: '200px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    hsnCode: {
      visible: true,
      order: 7,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    currency: {
      visible: true,
      order: 8,
      width: '80px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    unit: {
      visible: true,
      order: 9,
      width: '80px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    quantity: {
      visible: true,
      order: 10,
      width: '100px',
      numberFormat: 'integer' as const,
      precision: 0,
      showSign: false,
    },
    unitPrice: {
      visible: true,
      order: 11,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    lineTotal: {
      visible: true,
      order: 12,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    bcd: {
      visible: true,
      order: 13,
      width: '100px',
      numberFormat: 'percentage' as const,
      precision: 2,
      showSign: false,
    },
    igst: {
      visible: true,
      order: 14,
      width: '100px',
      numberFormat: 'percentage' as const,
      precision: 2,
      showSign: false,
    },
    invoiceTotal: {
      visible: true,
      order: 15,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    shipmentTotal: {
      visible: true,
      order: 16,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    status: {
      visible: true,
      order: 17,
      width: '100px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    actions: {
      visible: true,
      order: 18,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
  },
  boe: {
    id: {
      visible: true,
      order: 1,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    beNumber: {
      visible: true,
      order: 2,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    beDate: {
      visible: true,
      order: 3,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    location: {
      visible: true,
      order: 4,
      width: '150px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    totalAssessmentValue: {
      visible: true,
      order: 5,
      width: '150px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    dutyAmount: {
      visible: true,
      order: 6,
      width: '120px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    paymentDate: {
      visible: true,
      order: 7,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    dutyPaid: {
      visible: true,
      order: 8,
      width: '120px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    challanNumber: {
      visible: true,
      order: 9,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    refId: {
      visible: true,
      order: 10,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    transactionId: {
      visible: true,
      order: 11,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    actions: {
      visible: true,
      order: 12,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
  },
  boeSummary: {
    partNo: {
      visible: true,
      order: 1,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    description: {
      visible: true,
      order: 2,
      width: '200px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    assessableValue: {
      visible: true,
      order: 3,
      width: '120px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    totalDuty: {
      visible: true,
      order: 4,
      width: '120px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    actualDuty: {
      visible: true,
      order: 5,
      width: '120px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    qty: {
      visible: true,
      order: 6,
      width: '80px',
      numberFormat: 'integer' as const,
      showSign: false,
    },
    landedCostPerUnit: {
      visible: true,
      order: 7,
      width: '150px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    perUnitDuty: {
      visible: true,
      order: 8,
      width: '120px',
      numberFormat: 'currency' as const,
      showSign: false,
    },
    bcd: {
      visible: true,
      order: 9,
      width: '100px',
      numberFormat: 'decimal' as const,
      showSign: false,
    },
    sws: {
      visible: true,
      order: 10,
      width: '100px',
      numberFormat: 'decimal' as const,
      showSign: false,
    },
    igst: {
      visible: true,
      order: 11,
      width: '100px',
      numberFormat: 'decimal' as const,
      showSign: false,
    },
    savings: {
      visible: true,
      order: 12,
      width: '100px',
      numberFormat: 'currency' as const,
      showSign: true,
    },
  },
  supplier: {
    id: {
      visible: true,
      order: 1,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    supplierName: {
      visible: true,
      order: 2,
      width: '200px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    shortName: {
      visible: true,
      order: 3,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    country: {
      visible: true,
      order: 4,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    phone: { visible: true, order: 5, width: '120px', case: 'none' as const, trimWhitespace: true },
    email: {
      visible: true,
      order: 6,
      width: '200px',
      case: 'lowercase' as const,
      trimWhitespace: true,
    },
    beneficiaryName: {
      visible: true,
      order: 7,
      width: '150px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    bankName: {
      visible: true,
      order: 8,
      width: '150px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    branch: {
      visible: true,
      order: 9,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    bankAddress: {
      visible: true,
      order: 10,
      width: '200px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    accountNo: {
      visible: true,
      order: 11,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: true,
    },
    iban: {
      visible: true,
      order: 12,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    swiftCode: {
      visible: true,
      order: 13,
      width: '100px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    isActive: {
      visible: true,
      order: 14,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    actions: {
      visible: true,
      order: 15,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
  },
  itemMaster: {
    id: {
      visible: true,
      order: 1,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    partNumber: {
      visible: true,
      order: 2,
      width: '150px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    itemDescription: {
      visible: true,
      order: 3,
      width: '200px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    unit: {
      visible: true,
      order: 4,
      width: '80px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    currency: {
      visible: true,
      order: 5,
      width: '80px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    unitPrice: {
      visible: true,
      order: 6,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    hsnCode: {
      visible: true,
      order: 7,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    supplierId: {
      visible: true,
      order: 8,
      width: '150px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    isActive: {
      visible: true,
      order: 9,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    countryOfOrigin: {
      visible: true,
      order: 10,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    bcd: {
      visible: true,
      order: 11,
      width: '80px',
      numberFormat: 'percentage' as const,
      precision: 2,
      showSign: false,
    },
    sws: {
      visible: true,
      order: 12,
      width: '80px',
      numberFormat: 'percentage' as const,
      precision: 2,
      showSign: false,
    },
    igst: {
      visible: true,
      order: 13,
      width: '80px',
      numberFormat: 'percentage' as const,
      precision: 2,
      showSign: false,
    },
    technicalWriteUp: {
      visible: true,
      order: 14,
      width: '200px',
      case: 'sentencecase' as const,
      trimWhitespace: true,
    },
    category: {
      visible: true,
      order: 15,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    endUse: {
      visible: true,
      order: 16,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    netWeightKg: {
      visible: true,
      order: 17,
      width: '100px',
      numberFormat: 'decimal' as const,
      precision: 2,
      showSign: false,
    },
    purchaseUom: {
      visible: true,
      order: 18,
      width: '100px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    grossWeightPerUomKg: {
      visible: true,
      order: 19,
      width: '120px',
      numberFormat: 'decimal' as const,
      precision: 2,
      showSign: false,
    },
    photoPath: {
      visible: true,
      order: 20,
      width: '150px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    actions: {
      visible: true,
      order: 21,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
  },
  expenses: {
    id: {
      visible: true,
      order: 1,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    shipmentId: {
      visible: true,
      order: 2,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    expenseTypeId: {
      visible: true,
      order: 3,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    serviceProviderId: {
      visible: true,
      order: 4,
      width: '150px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    invoiceNo: {
      visible: true,
      order: 5,
      width: '120px',
      case: 'uppercase' as const,
      trimWhitespace: true,
    },
    invoiceDate: {
      visible: true,
      order: 6,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    amount: {
      visible: true,
      order: 7,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    cgstAmount: {
      visible: true,
      order: 8,
      width: '100px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    sgstAmount: {
      visible: true,
      order: 9,
      width: '100px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    igstAmount: {
      visible: true,
      order: 10,
      width: '100px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    tdsAmount: {
      visible: true,
      order: 11,
      width: '100px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    totalAmount: {
      visible: true,
      order: 12,
      width: '120px',
      numberFormat: 'currency' as const,
      precision: 2,
      showSign: false,
    },
    remarks: {
      visible: true,
      order: 13,
      width: '150px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    createdBy: {
      visible: true,
      order: 14,
      width: '120px',
      case: 'titlecase' as const,
      trimWhitespace: true,
    },
    createdAt: {
      visible: true,
      order: 15,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    updatedAt: {
      visible: true,
      order: 16,
      width: '120px',
      case: 'none' as const,
      trimWhitespace: false,
    },
    actions: {
      visible: true,
      order: 17,
      width: '100px',
      case: 'none' as const,
      trimWhitespace: false,
    },
  },
}

// Default settings
export const defaultSettings: AppSettings = {
  numberFormat: {
    decimalPlaces: 2,
    useThousandsSeparator: true,
    currencySymbol: '₹',
    currencyPosition: 'before',
    showCurrency: true,
    useCompactNotation: false,
    compactThreshold: 1000,
    useScientificNotation: false,
    scientificThreshold: 1000000,
    negativeFormat: 'minus',
    zeroFormat: '0',
  },
  dateFormat: {
    format: 'DD/MM/YYYY',
    includeTime: false,
    timeFormat: '24h',
  },
  textFormat: {
    case: 'sentencecase',
    trimWhitespace: true,
  },
  modules: {
    shipment: {
      fields: defaultModuleFields.shipment,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10,
    },
    invoice: {
      fields: defaultModuleFields.invoice,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10,
    },
    boe: {
      fields: defaultModuleFields.boe,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10,
    },
    boeSummary: {
      fields: defaultModuleFields.boeSummary,
      showTotals: true,
      showActions: false,
      itemsPerPage: 10,
    },
    supplier: {
      fields: defaultModuleFields.supplier,
      showTotals: false,
      showActions: true,
      itemsPerPage: 10,
    },
    itemMaster: {
      fields: defaultModuleFields.itemMaster,
      showTotals: false,
      showActions: true,
      itemsPerPage: 10,
    },
    expenses: {
      fields: defaultModuleFields.expenses,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10,
    },
  },
}

// Deep merge function for settings
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target }

  for (const key in source) {
    if (
      source[key] !== undefined &&
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      const targetValue = (target[key] as Record<string, unknown>) || {}
      const sourceValue = source[key] as Record<string, unknown>
      result[key] = deepMerge(targetValue, sourceValue) as T[Extract<keyof T, string>]
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[Extract<keyof T, string>]
    }
  }

  return result
}

// Settings storage key
const SETTINGS_STORAGE_KEY = 'import-manager-settings'

// Load settings from localStorage
export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (stored) {
      const parsed = JSON.parse(stored)

      // Check if the stored settings have the old supplier fields structure
      const hasOldSupplierFields =
        parsed.modules?.supplier?.fields &&
        (parsed.modules.supplier.fields.name ||
          parsed.modules.supplier.fields.gstin ||
          parsed.modules.supplier.fields.state)

      if (hasOldSupplierFields) {
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return defaultSettings
      }

      // Check if shipment module is missing new fields
      const shipmentFields = parsed.modules?.shipment?.fields
      const hasOldShipmentFields =
        shipmentFields &&
        (!shipmentFields.blAwbDate ||
          !shipmentFields.shipmentMode ||
          !shipmentFields.shipmentType ||
          !shipmentFields.containerNumber ||
          !shipmentFields.grossWeightKg ||
          !shipmentFields.dateOfDelivery)

      if (hasOldShipmentFields) {
        console.log(
          '🔧 loadSettings - Detected old shipment fields structure, clearing settings...'
        )
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return defaultSettings
      }

      // Check if invoice module is missing new fields
      const invoiceFields = parsed.modules?.invoice?.fields
      const hasOldInvoiceFields =
        invoiceFields &&
        (!invoiceFields.invoiceId ||
          !invoiceFields.supplierName ||
          !invoiceFields.partNumber ||
          !invoiceFields.itemDescription ||
          !invoiceFields.hsnCode ||
          !invoiceFields.currency ||
          !invoiceFields.unit ||
          !invoiceFields.quantity ||
          !invoiceFields.unitPrice ||
          !invoiceFields.lineTotal ||
          !invoiceFields.bcd ||
          !invoiceFields.igst ||
          !invoiceFields.invoiceTotal)

      if (hasOldInvoiceFields) {
        console.log('🔧 loadSettings - Detected old invoice fields structure, clearing settings...')
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return defaultSettings
      }

      // Check if BOE module is missing new fields
      const boeFields = parsed.modules?.boe?.fields
      const hasOldBoeFields =
        boeFields && (!boeFields.id || !boeFields.refId || !boeFields.transactionId)

      if (hasOldBoeFields) {
        console.log('🔧 loadSettings - Detected old BOE fields structure, clearing settings...')
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return defaultSettings
      }

      // Check if expenses module is missing new fields
      const expensesFields = parsed.modules?.expenses?.fields
      const hasOldExpensesFields =
        expensesFields &&
        (!expensesFields.id ||
          !expensesFields.shipmentId ||
          !expensesFields.createdBy ||
          !expensesFields.createdAt ||
          !expensesFields.updatedAt)

      if (hasOldExpensesFields) {
        console.log(
          '🔧 loadSettings - Detected old expenses fields structure, clearing settings...'
        )
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return defaultSettings
      }

      // Check if item master module is missing new fields
      const itemMasterFields = parsed.modules?.itemMaster?.fields
      const hasOldItemMasterFields = itemMasterFields && !itemMasterFields.id

      if (hasOldItemMasterFields) {
        console.log(
          '🔧 loadSettings - Detected old item master fields structure, clearing settings...'
        )
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return defaultSettings
      }

      // Deep merge with defaults to ensure all properties exist
      const mergedSettings = deepMerge(
        defaultSettings as unknown as Record<string, unknown>,
        parsed as unknown as Record<string, unknown>
      ) as unknown as AppSettings

      // Force shipmentType to be uppercase (fix for existing settings)
      if (mergedSettings.modules?.shipment?.fields?.shipmentType) {
        mergedSettings.modules.shipment.fields.shipmentType.case = 'uppercase'
      }

      return mergedSettings
    }
  } catch (error) {
    console.error('🔧 loadSettings - Failed to load settings:', error)
  }

  return defaultSettings
}

// Save settings to localStorage
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('🔧 saveSettings - Failed to save settings:', error)
  }
}

// Clear all settings and reset to defaults
export function clearSettings(): void {
  try {
    localStorage.clear()
    console.log('🔧 Settings cleared successfully')
    window.location.reload()
  } catch (error) {
    console.error('Failed to clear settings:', error)
  }
}

// Force refresh settings to apply new defaults
export function refreshSettings(): AppSettings {
  clearSettings()
  return loadSettings()
}

// Clear table page size settings to force refresh from module settings
export function clearTablePageSizeSettings(): void {
  try {
    // Clear all table page size settings
    const keysToRemove = [
      'shipment-table-page-size',
      'invoice-table-page-size',
      'boe-table-page-size',
      'boe-summary-table-page-size',
      'supplier-table-page-size',
      'item-table-page-size',
      'item-master-table-page-size',
      'expense-table-page-size',
    ]

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key)
    })

    // Also clear the main settings to force refresh
    localStorage.removeItem('import-manager-settings')

    console.log('🔧 Table page size settings and main settings cleared successfully')

    // Force page reload to apply new settings
    window.location.reload()
  } catch (error) {
    console.error('Failed to clear table page size settings:', error)
  }
}

// Make it available globally for console access
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).clearTablePageSizeSettings =
    clearTablePageSizeSettings
  ;(window as unknown as Record<string, unknown>).clearAllSettings = clearSettings
  ;(window as unknown as Record<string, unknown>).forceReloadSettings = () => {
    localStorage.clear()
    window.location.reload()
  }
}

// Update specific setting
export function updateSettings<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): AppSettings {
  const current = loadSettings()
  const updated = { ...current, [key]: value }
  saveSettings(updated)
  return updated
}

// Format number based on settings
export function formatNumber(
  value: number | null | undefined,
  settings: NumberFormatSettings = loadSettings().numberFormat,
  fieldSettings?: Partial<ModuleFieldSettings>
): string {
  if (value === null || value === undefined) {
    if (settings.zeroFormat === '-') return '-'
    if (settings.zeroFormat === '0') return '0'
    if (settings.zeroFormat === '0.00') return '0.00'
    return '-'
  }

  // Handle zero values
  if (value === 0) {
    if (settings.zeroFormat === '-') return '-'
    if (settings.zeroFormat === '0') return '0'
    if (settings.zeroFormat === '0.00') return '0.00'
  }

  // Handle negative values
  const isNegative = value < 0
  const absValue = Math.abs(value)

  // Determine precision from field settings or global settings
  const precision = fieldSettings?.precision ?? settings.decimalPlaces

  // Handle scientific notation
  if (settings.useScientificNotation && absValue >= settings.scientificThreshold) {
    const options: Intl.NumberFormatOptions = {
      notation: 'scientific',
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      useGrouping: settings.useThousandsSeparator,
    }
    const formatted = new Intl.NumberFormat('en-US', options).format(absValue)
    return isNegative ? `-${formatted}` : formatted
  }

  // Handle compact notation (K, M, B)
  if (settings.useCompactNotation && absValue >= settings.compactThreshold) {
    const options: Intl.NumberFormatOptions = {
      notation: 'compact',
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      useGrouping: settings.useThousandsSeparator,
    }
    const formatted = new Intl.NumberFormat('en-US', options).format(absValue)
    return isNegative ? `-${formatted}` : formatted
  }

  // Handle different number formats
  let formatted: string
  const baseOptions: Intl.NumberFormatOptions = {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping: settings.useThousandsSeparator,
  }

  switch (fieldSettings?.numberFormat) {
    case 'currency':
      if (settings.showCurrency) {
        const currencyOptions: Intl.NumberFormatOptions = {
          ...baseOptions,
          style: 'currency',
          currency: 'INR',
        }
        formatted = new Intl.NumberFormat('en-US', currencyOptions).format(absValue)
      } else {
        formatted = new Intl.NumberFormat('en-US', baseOptions).format(absValue)
        if (settings.currencySymbol) {
          formatted =
            settings.currencyPosition === 'before'
              ? `${settings.currencySymbol}${formatted}`
              : `${formatted}${settings.currencySymbol}`
        }
      }
      break

    case 'percentage':
      // Don't use style: 'percent' to avoid automatic % symbol
      formatted = new Intl.NumberFormat('en-US', baseOptions).format(absValue)
      break

    case 'integer': {
      const integerOptions: Intl.NumberFormatOptions = {
        ...baseOptions,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }
      formatted = new Intl.NumberFormat('en-US', integerOptions).format(absValue)
      break
    }

    case 'scientific': {
      const scientificOptions: Intl.NumberFormatOptions = {
        ...baseOptions,
        notation: 'scientific',
      }
      formatted = new Intl.NumberFormat('en-US', scientificOptions).format(absValue)
      break
    }

    default: // decimal
      formatted = new Intl.NumberFormat('en-US', baseOptions).format(absValue)
      break
  }

  // Handle negative formatting
  if (isNegative) {
    switch (settings.negativeFormat) {
      case 'minus':
        formatted = `-${formatted}`
        break
      case 'parentheses':
        formatted = `(${formatted})`
        break
      case 'brackets':
        formatted = `[${formatted}]`
        break
    }
  }

  // Handle sign display
  if (fieldSettings?.showSign && !isNegative && value > 0) {
    formatted = `+${formatted}`
  }

  return formatted
}

// Format currency based on settings
export function formatCurrency(
  value: number | null | undefined,
  settings: NumberFormatSettings = loadSettings().numberFormat
): string {
  if (value === null || value === undefined) return '-'

  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: settings.decimalPlaces,
    maximumFractionDigits: settings.decimalPlaces,
    useGrouping: settings.useThousandsSeparator,
  }

  return new Intl.NumberFormat('en-US', options).format(value)
}

// Format date based on settings
export function formatDate(
  date: string | Date | null | undefined,
  settings: DateFormatSettings = loadSettings().dateFormat
): string {
  if (!date) return '-'

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  const day = dateObj.getDate().toString().padStart(2, '0')
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
  const year = dateObj.getFullYear()

  let formatted = ''
  switch (settings.format) {
    case 'DD/MM/YYYY':
      formatted = `${day}/${month}/${year}`
      break
    case 'MM/DD/YYYY':
      formatted = `${month}/${day}/${year}`
      break
    case 'YYYY-MM-DD':
      formatted = `${year}-${month}-${day}`
      break
    case 'DD-MM-YYYY':
      formatted = `${day}-${month}-${year}`
      break
  }

  if (settings.includeTime) {
    const hours = dateObj.getHours()
    const minutes = dateObj.getMinutes().toString().padStart(2, '0')

    if (settings.timeFormat === '12h') {
      const ampm = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours % 12 || 12
      formatted += ` ${displayHours}:${minutes} ${ampm}`
    } else {
      formatted += ` ${hours.toString().padStart(2, '0')}:${minutes}`
    }
  }

  return formatted
}

// Format text based on settings
export function formatText(
  text: string | null | undefined,
  settings: TextFormatSettings = loadSettings().textFormat
): string {
  if (!text) return '-'

  let formatted = text

  if (settings.trimWhitespace) {
    formatted = formatted.trim()
  }

  switch (settings.case) {
    case 'lowercase':
      formatted = formatted.toLowerCase()
      break
    case 'uppercase':
      formatted = formatted.toUpperCase()
      break
    case 'titlecase':
      formatted = formatted.replace(
        /\w\S*/g,
        (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      )
      break
    case 'sentencecase':
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase()
      break
  }

  return formatted
}

// Module settings helpers
export function getModuleSettings(moduleName: keyof AppSettings['modules']): ModuleSettings {
  const settings = loadSettings()
  return settings.modules[moduleName]
}

export function updateModuleSettings(
  moduleName: keyof AppSettings['modules'],
  updates: Partial<ModuleSettings>
): AppSettings {
  const current = loadSettings()
  const updated = {
    ...current,
    modules: {
      ...current.modules,
      [moduleName]: {
        ...current.modules[moduleName],
        ...updates,
      },
    },
  }
  saveSettings(updated)
  return updated
}

export function updateModuleField(
  moduleName: keyof AppSettings['modules'],
  fieldName: string,
  updates: Partial<ModuleFieldSettings>
): AppSettings {
  const current = loadSettings()

  const moduleSettings = current.modules[moduleName]

  const updated = {
    ...current,
    modules: {
      ...current.modules,
      [moduleName]: {
        ...moduleSettings,
        fields: {
          ...moduleSettings.fields,
          [fieldName]: {
            ...moduleSettings.fields[fieldName],
            ...updates,
          },
        },
      },
    },
  }

  saveSettings(updated)
  return updated
}

export function getVisibleFields(moduleName: keyof AppSettings['modules']): string[] {
  const moduleSettings = getModuleSettings(moduleName)
  return Object.entries(moduleSettings.fields)
    .filter(([, config]) => config.visible)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([fieldName]) => fieldName)
}

export function getFieldConfig(
  moduleName: keyof AppSettings['modules'],
  fieldName: string
): ModuleFieldSettings | undefined {
  const moduleSettings = getModuleSettings(moduleName)
  return moduleSettings.fields[fieldName]
}

// Make it available globally for console access
if (typeof window !== 'undefined') {
  // @ts-expect-error - Adding properties to window object
  window.clearAllSettings = clearSettings
  // @ts-expect-error - Adding properties to window object
  window.forceReloadSettings = () => {
    localStorage.clear()
    window.location.reload()
  }
}
