// src/lib/settings.ts
export interface NumberFormatSettings {
  decimalPlaces: number
  useThousandsSeparator: boolean
  currencySymbol: string
  currencyPosition: 'before' | 'after'
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
const defaultModuleFields = {
  shipment: {
    'supplierId': { visible: true, order: 1, width: '150px' },
    'invoiceNumber': { visible: true, order: 2, width: '150px' },
    'invoiceDate': { visible: true, order: 3, width: '120px' },
    'goodsCategory': { visible: true, order: 4, width: '120px' },
    'invoiceCurrency': { visible: true, order: 5, width: '80px' },
    'invoiceValue': { visible: true, order: 6, width: '120px' },
    'incoterm': { visible: true, order: 7, width: '100px' },
    'vesselName': { visible: true, order: 8, width: '150px' },
    'blAwbNumber': { visible: true, order: 9, width: '120px' },
    'etd': { visible: true, order: 10, width: '100px' },
    'eta': { visible: true, order: 11, width: '100px' },
    'status': { visible: true, order: 12, width: '120px' },
    'actions': { visible: true, order: 13, width: '100px' }
  },
  invoice: {
    'invoiceNumber': { visible: true, order: 1, width: '150px' },
    'invoiceDate': { visible: true, order: 2, width: '120px' },
    'status': { visible: true, order: 3, width: '100px' },
    'calculatedTotal': { visible: true, order: 4, width: '120px' },
    'shipmentTotal': { visible: true, order: 5, width: '120px' },
    'actions': { visible: true, order: 6, width: '100px' }
  },
  boe: {
    'beNumber': { visible: true, order: 1, width: '150px' },
    'beDate': { visible: true, order: 2, width: '120px' },
    'location': { visible: true, order: 3, width: '150px' },
    'totalAssessmentValue': { visible: true, order: 4, width: '150px' },
    'dutyAmount': { visible: true, order: 5, width: '120px' },
    'paymentDate': { visible: true, order: 6, width: '120px' },
    'dutyPaid': { visible: true, order: 7, width: '120px' },
    'challanNumber': { visible: true, order: 8, width: '120px' },
    'actions': { visible: true, order: 9, width: '100px' }
  },
  boeSummary: {
    'partNo': { visible: true, order: 1, width: '150px' },
    'description': { visible: true, order: 2, width: '200px' },
    'assessableValue': { visible: true, order: 3, width: '120px' },
    'bcd': { visible: true, order: 4, width: '100px' },
    'sws': { visible: true, order: 5, width: '100px' },
    'igst': { visible: true, order: 6, width: '100px' },
    'totalDuty': { visible: true, order: 7, width: '120px' },
    'qty': { visible: true, order: 8, width: '80px' },
    'perUnitDuty': { visible: true, order: 9, width: '120px' },
    'landedCostPerUnit': { visible: true, order: 10, width: '150px' },
    'actualDuty': { visible: true, order: 11, width: '120px' },
    'savings': { visible: true, order: 12, width: '100px' }
  },
  supplier: {
    'id': { visible: true, order: 1, width: '120px' },
    'supplierName': { visible: true, order: 2, width: '200px' },
    'shortName': { visible: true, order: 3, width: '120px' },
    'country': { visible: true, order: 4, width: '120px' },
    'phone': { visible: true, order: 5, width: '120px' },
    'email': { visible: true, order: 6, width: '200px' },
    'isActive': { visible: true, order: 7, width: '100px' },
    'actions': { visible: true, order: 8, width: '100px' }
  },
  itemMaster: {
    'partNumber': { visible: true, order: 1, width: '150px' },
    'itemDescription': { visible: true, order: 2, width: '200px' },
    'currency': { visible: true, order: 3, width: '80px' },
    'unitPrice': { visible: true, order: 4, width: '120px' },
    'hsnCode': { visible: true, order: 5, width: '120px' },
    'supplierId': { visible: true, order: 6, width: '150px' },
    'isActive': { visible: true, order: 7, width: '100px' },
    'actions': { visible: true, order: 8, width: '100px' }
  },
  expenses: {
    'expenseTypeId': { visible: true, order: 1, width: '120px' },
    'serviceProviderId': { visible: true, order: 2, width: '150px' },
    'invoiceNo': { visible: true, order: 3, width: '120px' },
    'invoiceDate': { visible: true, order: 4, width: '120px' },
    'amount': { visible: true, order: 5, width: '120px' },
    'cgstAmount': { visible: true, order: 6, width: '100px' },
    'sgstAmount': { visible: true, order: 7, width: '100px' },
    'igstAmount': { visible: true, order: 8, width: '100px' },
    'tdsAmount': { visible: true, order: 9, width: '100px' },
    'totalAmount': { visible: true, order: 10, width: '120px' },
    'remarks': { visible: true, order: 11, width: '150px' },
    'actions': { visible: true, order: 12, width: '100px' }
  }
}

// Default settings
export const defaultSettings: AppSettings = {
  numberFormat: {
    decimalPlaces: 2,
    useThousandsSeparator: true,
    currencySymbol: '₹',
    currencyPosition: 'before'
  },
  dateFormat: {
    format: 'DD/MM/YYYY',
    includeTime: false,
    timeFormat: '24h'
  },
  textFormat: {
    case: 'sentencecase',
    trimWhitespace: true
  },
  modules: {
    shipment: {
      fields: defaultModuleFields.shipment,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10
    },
    invoice: {
      fields: defaultModuleFields.invoice,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10
    },
    boe: {
      fields: defaultModuleFields.boe,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10
    },
    boeSummary: {
      fields: defaultModuleFields.boeSummary,
      showTotals: true,
      showActions: false,
      itemsPerPage: 10
    },
    supplier: {
      fields: defaultModuleFields.supplier,
      showTotals: false,
      showActions: true,
      itemsPerPage: 10
    },
    itemMaster: {
      fields: defaultModuleFields.itemMaster,
      showTotals: false,
      showActions: true,
      itemsPerPage: 10
    },
    expenses: {
      fields: defaultModuleFields.expenses,
      showTotals: true,
      showActions: true,
      itemsPerPage: 10
    }
  }
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
      const hasOldSupplierFields = parsed.modules?.supplier?.fields && 
        (parsed.modules.supplier.fields.name || 
         parsed.modules.supplier.fields.gstin || 
         parsed.modules.supplier.fields.state)
      
      if (hasOldSupplierFields) {
        console.log('Detected old supplier fields structure, clearing settings...')
        localStorage.removeItem(SETTINGS_STORAGE_KEY)
        return defaultSettings
      }
      
      // Merge with defaults to ensure all properties exist
      return { ...defaultSettings, ...parsed }
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
  return defaultSettings
}

// Save settings to localStorage
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save settings:', error)
  }
}

// Clear all settings and reset to defaults
export function clearSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY)
    console.log('Settings cleared and reset to defaults')
  } catch (error) {
    console.error('Failed to clear settings:', error)
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
  settings: NumberFormatSettings = loadSettings().numberFormat
): string {
  if (value === null || value === undefined) return '-'
  
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: settings.decimalPlaces,
    maximumFractionDigits: settings.decimalPlaces,
    useGrouping: settings.useThousandsSeparator
  }
  
  const formatted = new Intl.NumberFormat('en-IN', options).format(value)
  
  if (settings.currencySymbol) {
    return settings.currencyPosition === 'before' 
      ? `${settings.currencySymbol}${formatted}`
      : `${formatted}${settings.currencySymbol}`
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
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: settings.decimalPlaces,
    maximumFractionDigits: settings.decimalPlaces,
    useGrouping: settings.useThousandsSeparator
  }
  
  return new Intl.NumberFormat('en-IN', options).format(value)
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
      formatted = formatted.replace(/\w\S*/g, (txt) => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
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
        ...updates
      }
    }
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
            ...updates
          }
        }
      }
    }
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
