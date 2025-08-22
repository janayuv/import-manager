// src/lib/csv-helpers.ts (ENHANCED)
// Comprehensive CSV import/export with edge case handling and robustness
import DOMPurify from 'dompurify'
import Papa from 'papaparse'

import type { Item } from '@/types/item'
import type { Option } from '@/types/options'

// A type for the raw CSV data row where all values are initially strings.
type CsvRow = {
  [key: string]: string
}

// CSV Configuration and Limits
const CSV_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_ROWS: 10000,
  MAX_COLUMN_LENGTH: 1000,
  ALLOWED_ENCODINGS: ['utf-8', 'utf-8-bom', 'iso-8859-1'] as const,
  REQUIRED_HEADERS: {
    items: ['partNumber', 'itemDescription', 'unit', 'currency', 'unitPrice'] as string[],
    shipments: ['invoiceNumber', 'invoiceDate', 'invoiceValue'] as string[],
    suppliers: ['supplierName', 'country'] as string[],
    boes: ['beNumber', 'beDate'] as string[],
  },
} as const

// CSV Validation and Error Types
export interface CsvValidationError {
  row: number
  column: string
  message: string
  severity: 'error' | 'warning'
}

export interface CsvValidationResult {
  isValid: boolean
  errors: CsvValidationError[]
  warnings: CsvValidationError[]
  rowCount: number
  processedRows: number
  skippedRows: number
}

// Security and Sanitization
const sanitizeString = (input: string): string => {
  if (typeof input !== 'string') return ''
  // Remove potential script tags and dangerous content
  return DOMPurify.sanitize(input.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}

const validateFileSize = (content: string): boolean => {
  const sizeInBytes = new Blob([content]).size
  return sizeInBytes <= CSV_CONFIG.MAX_FILE_SIZE
}

const validateRowCount = (rows: CsvRow[]): boolean => {
  return rows.length <= CSV_CONFIG.MAX_ROWS
}

const validateColumnLength = (value: string): boolean => {
  return value.length <= CSV_CONFIG.MAX_COLUMN_LENGTH
}

const detectEncoding = (content: string): string => {
  // Simple encoding detection
  if (content.startsWith('\uFEFF')) return 'utf-8-bom'
  if (/[\x80-\xFF]/.test(content)) return 'utf-8'
  return 'iso-8859-1'
}

// Enhanced CSV Validation
export const validateCsvContent = (
  content: string,
  requiredHeaders: string[],
  dataType: 'items' | 'shipments' | 'suppliers' | 'boes'
): CsvValidationResult => {
  const result: CsvValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    rowCount: 0,
    processedRows: 0,
    skippedRows: 0,
  }

  try {
    // File size validation
    if (!validateFileSize(content)) {
      result.errors.push({
        row: 0,
        column: 'file',
        message: `File size exceeds maximum limit of ${CSV_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
        severity: 'error',
      })
      result.isValid = false
      return result
    }

    // Encoding detection
    const encoding = detectEncoding(content)
    if (!CSV_CONFIG.ALLOWED_ENCODINGS.includes(encoding.toLowerCase() as 'utf-8' | 'utf-8-bom' | 'iso-8859-1')) {
      result.warnings.push({
        row: 0,
        column: 'encoding',
        message: `Detected encoding '${encoding}' may cause issues. Recommended: UTF-8`,
        severity: 'warning',
      })
    }

    // Parse CSV with error handling
    Papa.parse<CsvRow>(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        // Handle parsing errors
        if (results.errors.length > 0) {
          results.errors.forEach((error) => {
            result.errors.push({
              row: error.row || 0,
              column: 'parsing',
              message: `CSV parsing error: ${error.message}`,
              severity: 'error',
            })
          })
          result.isValid = false
        }

        // Row count validation
        if (!validateRowCount(results.data)) {
          result.errors.push({
            row: 0,
            column: 'rows',
            message: `Row count (${results.data.length}) exceeds maximum limit of ${CSV_CONFIG.MAX_ROWS}`,
            severity: 'error',
          })
          result.isValid = false
        }

        result.rowCount = results.data.length

        // Header validation
        const actualHeaders = results.meta.fields || []
        const missingHeaders = requiredHeaders.filter((header) => !actualHeaders.includes(header))

        if (missingHeaders.length > 0) {
          result.errors.push({
            row: 0,
            column: 'headers',
            message: `Missing required headers: ${missingHeaders.join(', ')}`,
            severity: 'error',
          })
          result.isValid = false
        }

        // Data validation
        results.data.forEach((row, index) => {
          const rowNumber = index + 2 // +2 because of 0-based index and header row

          // Check for empty required fields
          requiredHeaders.forEach((header) => {
            const value = row[header]
            if (!value || value.trim() === '') {
              result.errors.push({
                row: rowNumber,
                column: header,
                message: `Required field '${header}' is empty`,
                severity: 'error',
              })
              result.isValid = false
            }
          })

          // Validate column lengths
          Object.entries(row).forEach(([column, value]) => {
            if (value && !validateColumnLength(value)) {
              result.warnings.push({
                row: rowNumber,
                column,
                message: `Value length exceeds recommended limit of ${CSV_CONFIG.MAX_COLUMN_LENGTH} characters`,
                severity: 'warning',
              })
            }
          })

          // Data type specific validation
          if (dataType === 'items') {
            validateItemRow(row, rowNumber, result)
          } else if (dataType === 'shipments') {
            validateShipmentRow(row, rowNumber, result)
          } else if (dataType === 'suppliers') {
            validateSupplierRow(row, rowNumber, result)
          } else if (dataType === 'boes') {
            validateBoeRow(row, rowNumber, result)
          }

          result.processedRows++
        })
      },
      error: (error: Error) => {
        result.errors.push({
          row: 0,
          column: 'parsing',
          message: `CSV parsing error: ${error.message}`,
          severity: 'error',
        })
        result.isValid = false
      },
    })
  } catch (error) {
    result.errors.push({
      row: 0,
      column: 'validation',
      message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'error',
    })
    result.isValid = false
  }

  return result
}

// Data type specific validation functions
const validateItemRow = (row: CsvRow, rowNumber: number, result: CsvValidationResult) => {
  // Validate numeric fields
  const numericFields = ['unitPrice', 'netWeightKg', 'grossWeightPerUomKg']
  numericFields.forEach((field) => {
    const value = row[field]
    if (value && isNaN(parseFloat(value))) {
      result.errors.push({
        row: rowNumber,
        column: field,
        message: `Invalid numeric value: ${value}`,
        severity: 'error',
      })
      result.isValid = false
    }
  })

  // Validate tax rates
  const taxFields = ['bcd', 'sws', 'igst']
  taxFields.forEach((field) => {
    const value = row[field]
    if (value) {
      const numValue = parseFloat(value)
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        result.warnings.push({
          row: rowNumber,
          column: field,
          message: `Tax rate should be between 0-100%: ${value}`,
          severity: 'warning',
        })
      }
    }
  })

  // Validate email format if present
  const email = row.email
  if (email && !isValidEmail(email)) {
    result.warnings.push({
      row: rowNumber,
      column: 'email',
      message: `Invalid email format: ${email}`,
      severity: 'warning',
    })
  }
}

const validateShipmentRow = (row: CsvRow, rowNumber: number, result: CsvValidationResult) => {
  // Validate invoice value
  const invoiceValue = row.invoiceValue
  if (invoiceValue && (isNaN(parseFloat(invoiceValue)) || parseFloat(invoiceValue) < 0)) {
    result.errors.push({
      row: rowNumber,
      column: 'invoiceValue',
      message: `Invalid invoice value: ${invoiceValue}`,
      severity: 'error',
    })
    result.isValid = false
  }

  // Validate dates
  const dateFields = ['invoiceDate', 'etd', 'eta', 'dateOfDelivery']
  dateFields.forEach((field) => {
    const value = row[field]
    if (value && !isValidDate(value)) {
      result.warnings.push({
        row: rowNumber,
        column: field,
        message: `Invalid date format: ${value}`,
        severity: 'warning',
      })
    }
  })
}

const validateSupplierRow = (row: CsvRow, rowNumber: number, result: CsvValidationResult) => {
  // Validate email
  const email = row.email
  if (email && !isValidEmail(email)) {
    result.warnings.push({
      row: rowNumber,
      column: 'email',
      message: `Invalid email format: ${email}`,
      severity: 'warning',
    })
  }

  // Validate phone number
  const phone = row.phone
  if (phone && !isValidPhone(phone)) {
    result.warnings.push({
      row: rowNumber,
      column: 'phone',
      message: `Invalid phone format: ${phone}`,
      severity: 'warning',
    })
  }
}

const validateBoeRow = (row: CsvRow, rowNumber: number, result: CsvValidationResult) => {
  // Validate numeric fields
  const numericFields = ['totalAssessmentValue', 'dutyAmount', 'dutyPaid']
  numericFields.forEach((field) => {
    const value = row[field]
    if (value && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
      result.errors.push({
        row: rowNumber,
        column: field,
        message: `Invalid numeric value: ${value}`,
        severity: 'error',
      })
      result.isValid = false
    }
  })

  // Validate dates
  const dateFields = ['beDate', 'paymentDate']
  dateFields.forEach((field) => {
    const value = row[field]
    if (value && !isValidDate(value)) {
      result.warnings.push({
        row: rowNumber,
        column: field,
        message: `Invalid date format: ${value}`,
        severity: 'warning',
      })
    }
  })
}

// Utility validation functions
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[+]?[1-9][\d]{0,15}$/
  return phoneRegex.test(phone.replace(/[\s\-()]/g, ''))
}

const isValidDate = (date: string): boolean => {
  const parsed = new Date(date)
  return !isNaN(parsed.getTime())
}

/**
 * Enhanced CSV export with error handling and formatting
 */
export const exportItemsToCsv = (itemsToExport: Item[], suppliers: Option[]): string => {
  try {
    if (!itemsToExport || itemsToExport.length === 0) {
      throw new Error('No items to export')
    }

    const exportableData = itemsToExport.map((item) => {
      const supplier = suppliers.find((s) => s.value === item.supplierId)

      // Sanitize and format data for export
      return {
        id: sanitizeString(item.id || ''),
        partNumber: sanitizeString(item.partNumber || ''),
        itemDescription: sanitizeString(item.itemDescription || ''),
        unit: sanitizeString(item.unit || ''),
        currency: sanitizeString(item.currency || ''),
        unitPrice: item.unitPrice || 0,
        hsnCode: sanitizeString(item.hsnCode || ''),
        supplierName: supplier ? sanitizeString(supplier.label) : sanitizeString(item.supplierId || ''),
        isActive: item.isActive,
        countryOfOrigin: sanitizeString(item.countryOfOrigin || ''),
        bcd: item.bcd || '',
        sws: item.sws || '',
        igst: item.igst || '',
        technicalWriteUp: sanitizeString(item.technicalWriteUp || ''),
        category: sanitizeString(item.category || ''),
        endUse: sanitizeString(item.endUse || ''),
        netWeightKg: item.netWeightKg || 0,
        purchaseUom: sanitizeString(item.purchaseUom || ''),
        grossWeightPerUomKg: item.grossWeightPerUomKg || 0,
        photoPath: sanitizeString(item.photoPath || ''),
      }
    })

    return Papa.unparse(exportableData)
  } catch (error) {
    console.error('CSV export error:', error)
    throw new Error(`Failed to export CSV: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Enhanced CSV import with comprehensive validation and error handling
 */
export const importItemsFromCsv = (
  csvContent: string,
  existingItems: Item[],
  suppliers: Option[]
): { newItems: Item[]; skippedCount: number; validationResult: CsvValidationResult } => {
  try {
    // Validate CSV content
    const validationResult = validateCsvContent(csvContent, CSV_CONFIG.REQUIRED_HEADERS.items, 'items')

    if (!validationResult.isValid) {
      return { newItems: [], skippedCount: 0, validationResult }
    }

    // Parse CSV with enhanced error handling
    let parsedData: CsvRow[] = []
    let parseErrors: Papa.ParseError[] = []

    Papa.parse<CsvRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        parsedData = results.data
        parseErrors = results.errors
      },
      error: (error: Error) => {
        console.error('CSV parsing error:', error)
        validationResult.errors.push({
          row: 0,
          column: 'parsing',
          message: `CSV parsing error: ${error.message}`,
          severity: 'error',
        })
      },
    })

    if (parseErrors.length > 0) {
      parseErrors.forEach((error) => {
        validationResult.errors.push({
          row: error.row || 0,
          column: 'parsing',
          message: `CSV parsing error: ${error.message}`,
          severity: 'error',
        })
      })
      return { newItems: [], skippedCount: 0, validationResult }
    }

    const existingPartNumbers = new Set(existingItems.map((item) => item.partNumber))
    let skippedCount = 0

    // Determine the next available ID to avoid collisions
    const maxId = existingItems.reduce((max, item) => {
      const num = parseInt(item.id.replace('ITM-', ''), 10)
      return !isNaN(num) && num > max ? num : max
    }, 0)
    let nextId = maxId + 1

    const newItems: Item[] = []

    for (const row of parsedData) {
      // Skip if part number is missing or already exists
      if (!row.partNumber || existingPartNumbers.has(row.partNumber)) {
        skippedCount++
        continue
      }

      // Find the supplierId by matching the name from the CSV
      const supplier = suppliers.find((s) => s.label.toLowerCase() === row.supplierName?.toLowerCase())

      // Sanitize and validate data before creating item
      const sanitizedPartNumber = sanitizeString(row.partNumber)
      if (!sanitizedPartNumber) {
        skippedCount++
        continue
      }

      // Manually construct the new Item object with proper validation and sanitization
      const newItem: Item = {
        id: `ITM-${(nextId++).toString().padStart(3, '0')}`,
        partNumber: sanitizedPartNumber,
        itemDescription: sanitizeString(row.itemDescription || ''),
        unit: sanitizeString(row.unit || ''),
        currency: sanitizeString(row.currency || ''),
        unitPrice: parseFloat(row.unitPrice || '0') || 0,
        hsnCode: sanitizeString(row.hsnCode || ''),
        supplierId: supplier ? supplier.value : undefined,
        isActive: row.isActive ? row.isActive.toLowerCase() === 'true' : true,
        countryOfOrigin: sanitizeString(row.countryOfOrigin || ''),
        bcd: row.bcd ? parseFloat(row.bcd) : undefined,
        sws: row.sws ? parseFloat(row.sws) : undefined,
        igst: row.igst ? parseFloat(row.igst) : undefined,
        technicalWriteUp: sanitizeString(row.technicalWriteUp || ''),
        category: sanitizeString(row.category || ''),
        endUse: sanitizeString(row.endUse || ''),
        netWeightKg: parseFloat(row.netWeightKg || '0') || 0,
        purchaseUom: sanitizeString(row.purchaseUom || ''),
        grossWeightPerUomKg: parseFloat(row.grossWeightPerUomKg || '0') || 0,
        photoPath: sanitizeString(row.photoPath || ''),
      }

      newItems.push(newItem)
    }

    return { newItems, skippedCount, validationResult }
  } catch (error) {
    console.error('CSV import error:', error)
    const validationResult: CsvValidationResult = {
      isValid: false,
      errors: [
        {
          row: 0,
          column: 'import',
          message: `Import error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error',
        },
      ],
      warnings: [],
      rowCount: 0,
      processedRows: 0,
      skippedRows: 0,
    }
    return { newItems: [], skippedCount: 0, validationResult }
  }
}

/**
 * Generate CSV template with headers and sample data
 */
export const generateCsvTemplate = (dataType: 'items' | 'shipments' | 'suppliers' | 'boes'): string => {
  const templates = {
    items: [
      'partNumber,itemDescription,unit,currency,unitPrice,hsnCode,supplierName,isActive,countryOfOrigin,bcd,sws,igst,technicalWriteUp,category,endUse,netWeightKg,purchaseUom,grossWeightPerUomKg,photoPath',
      'ABC-001,Sample Item,PC,USD,10.50,HSN123,Sample Supplier,true,China,5.0,2.5,18.0,Technical description,Electronics,Industrial,0.5,KG,0.6,',
    ],
    shipments: [
      'invoiceNumber,invoiceDate,invoiceValue,invoiceCurrency,supplierId,goodsCategory,incoterm,shipmentMode,shipmentType,blAwbNumber,blAwbDate,vesselName,containerNumber,grossWeightKg,etd,eta,status,dateOfDelivery',
      'INV-001,2024-01-15,50000,USD,SUP-001,Electronics,FOB,Sea,FCL,BL123456,2024-01-10,Test Vessel,CONT001,1000,2024-01-12,2024-01-20,in-transit,2024-01-25',
    ],
    suppliers: [
      'supplierName,shortName,country,email,phone,beneficiaryName,bankName,branch,bankAddress,accountNo,iban,swiftCode,isActive',
      'Sample Supplier,SS,China,supplier@example.com,+86-123-456-7890,Beneficiary Name,Bank Name,Branch Name,Bank Address,1234567890,IBAN123456,SWIFT123,true',
    ],
    boes: [
      'beNumber,beDate,location,totalAssessmentValue,dutyAmount,paymentDate,dutyPaid,challanNumber,refId,transactionId',
      'BE123456,2024-01-15,Mumbai,50000,5000,2024-01-16,5000,CHL123,REF123,TXN123',
    ],
  }

  const template = templates[dataType]
  return template.join('\n')
}

/**
 * Handle CSV encoding issues and convert to UTF-8
 */
export const normalizeCsvEncoding = (content: string): string => {
  // Remove BOM if present
  if (content.startsWith('\uFEFF')) {
    content = content.slice(1)
  }

  // Handle common encoding issues
  try {
    // Try to decode as UTF-8
    return decodeURIComponent(escape(content))
  } catch {
    // If that fails, return as-is (might be already correct)
    return content
  }
}

/**
 * Create a comprehensive CSV import report
 */
export const createImportReport = (
  validationResult: CsvValidationResult,
  newItems: Item[],
  skippedCount: number
): string => {
  const report = [
    '=== CSV Import Report ===',
    `Total Rows: ${validationResult.rowCount}`,
    `Processed Rows: ${validationResult.processedRows}`,
    `New Items: ${newItems.length}`,
    `Skipped Rows: ${skippedCount}`,
    '',
  ]

  if (validationResult.errors.length > 0) {
    report.push('=== ERRORS ===')
    validationResult.errors.forEach((error) => {
      report.push(`Row ${error.row}, Column ${error.column}: ${error.message}`)
    })
    report.push('')
  }

  if (validationResult.warnings.length > 0) {
    report.push('=== WARNINGS ===')
    validationResult.warnings.forEach((warning) => {
      report.push(`Row ${warning.row}, Column ${warning.column}: ${warning.message}`)
    })
    report.push('')
  }

  report.push('=== SUMMARY ===')
  if (validationResult.isValid && newItems.length > 0) {
    report.push('✅ Import completed successfully')
  } else if (!validationResult.isValid) {
    report.push('❌ Import failed due to validation errors')
  } else {
    report.push('⚠️ Import completed with warnings')
  }

  return report.join('\n')
}
