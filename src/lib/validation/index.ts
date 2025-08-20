import * as z from 'zod'
import DOMPurify from 'dompurify'

// ============================================================================
// CORE VALIDATION SCHEMAS
// ============================================================================

// Common validation patterns
export const patterns = {
  // Email validation
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // Phone number (international format)
  phone: /^[+]?[1-9][\d]{0,15}$/,

  // Currency codes (ISO 4217)
  currency: /^[A-Z]{3}$/,

  // Country codes (ISO 3166-1 alpha-2)
  country: /^[A-Z]{2}$/,

  // HSN/SAC codes (Indian GST)
  hsnCode: /^[0-9]{4,8}$/,

  // GSTIN (Indian GST number)
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,

  // PAN (Indian PAN number)
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,

  // Invoice number (alphanumeric with common separators)
  invoiceNumber: /^[A-Z0-9\-_/]+$/,

  // Part number (alphanumeric with common separators)
  partNumber: /^[A-Z0-9\-_/.]+$/,

  // Container number (ISO 6346)
  containerNumber: /^[A-Z]{4}[0-9]{7}$/,

  // BL/AWB number (alphanumeric)
  blAwbNumber: /^[A-Z0-9-]+$/,

  // Bank account number (numeric)
  accountNumber: /^[0-9]{9,18}$/,

  // SWIFT/BIC code
  swiftCode: /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/,

  // IBAN (basic pattern)
  iban: /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/,
} as const

// Common validation messages
export const messages = {
  required: 'This field is required.',
  invalidEmail: 'Please enter a valid email address.',
  invalidPhone: 'Please enter a valid phone number.',
  invalidCurrency: 'Please enter a valid currency code (e.g., USD, EUR, INR).',
  invalidCountry: 'Please enter a valid country code (e.g., US, IN, DE).',
  invalidHsnCode: 'Please enter a valid HSN/SAC code (4-8 digits).',
  invalidGstin: 'Please enter a valid GSTIN.',
  invalidPan: 'Please enter a valid PAN number.',
  invalidInvoiceNumber:
    'Invoice number can only contain letters, numbers, hyphens, underscores, and forward slashes.',
  invalidPartNumber:
    'Part number can only contain letters, numbers, hyphens, underscores, dots, and forward slashes.',
  invalidContainerNumber: 'Please enter a valid container number (4 letters + 7 digits).',
  invalidBlAwbNumber: 'BL/AWB number can only contain letters, numbers, and hyphens.',
  invalidAccountNumber: 'Please enter a valid account number (9-18 digits).',
  invalidSwiftCode: 'Please enter a valid SWIFT/BIC code.',
  invalidIban: 'Please enter a valid IBAN.',
  minLength: (min: number) => `Must be at least ${min} characters.`,
  maxLength: (max: number) => `Must be no more than ${max} characters.`,
  minValue: (min: number) => `Must be at least ${min}.`,
  maxValue: (max: number) => `Must be no more than ${max}.`,
  positiveNumber: 'Must be a positive number.',
  percentage: 'Must be a percentage between 0 and 100.',
  futureDate: 'Date cannot be in the future.',
  pastDate: 'Date cannot be in the past.',
  duplicateValue: 'This value already exists.',
} as const

// ============================================================================
// BASE VALIDATION SCHEMAS
// ============================================================================

// Base string sanitization
const baseSanitizedString = z
  .string()
  .min(1, messages.required)
  .transform((val) => DOMPurify.sanitize(val.trim()))
  .refine((val) => val.length > 0, messages.required)

// String sanitization and validation with length constraints
export const sanitizedString = (minLength?: number, maxLength?: number) => {
  let schema = baseSanitizedString

  if (minLength) {
    schema = schema.pipe(z.string().min(minLength, messages.minLength(minLength))) as any
  }

  if (maxLength) {
    schema = schema.pipe(z.string().max(maxLength, messages.maxLength(maxLength))) as any
  }

  return schema
}

// Email validation with sanitization
export const emailSchema = z
  .string()
  .min(1, messages.required)
  .email(messages.invalidEmail)
  .transform((val) => DOMPurify.sanitize(val.trim().toLowerCase()))

// Phone number validation
export const phoneSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.phone, messages.invalidPhone)
  .transform((val) => val.trim())

// Currency code validation
export const currencySchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.currency, messages.invalidCurrency)
  .transform((val) => val.trim().toUpperCase())

// Country code validation
export const countrySchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.country, messages.invalidCountry)
  .transform((val) => val.trim().toUpperCase())

// HSN/SAC code validation
export const hsnCodeSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.hsnCode, messages.invalidHsnCode)
  .transform((val) => val.trim())

// GSTIN validation
export const gstinSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.gstin, messages.invalidGstin)
  .transform((val) => val.trim().toUpperCase())

// PAN validation
export const panSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.pan, messages.invalidPan)
  .transform((val) => val.trim().toUpperCase())

// Invoice number validation
export const invoiceNumberSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.invoiceNumber, messages.invalidInvoiceNumber)
  .transform((val) => DOMPurify.sanitize(val.trim().toUpperCase()))

// Part number validation
export const partNumberSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.partNumber, messages.invalidPartNumber)
  .transform((val) => DOMPurify.sanitize(val.trim().toUpperCase()))

// Container number validation
export const containerNumberSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.containerNumber, messages.invalidContainerNumber)
  .transform((val) => val.trim().toUpperCase())

// BL/AWB number validation
export const blAwbNumberSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.blAwbNumber, messages.invalidBlAwbNumber)
  .transform((val) => DOMPurify.sanitize(val.trim().toUpperCase()))

// Bank account number validation
export const accountNumberSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.accountNumber, messages.invalidAccountNumber)
  .transform((val) => val.trim())

// SWIFT code validation
export const swiftCodeSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.swiftCode, messages.invalidSwiftCode)
  .transform((val) => val.trim().toUpperCase())

// IBAN validation
export const ibanSchema = z
  .string()
  .min(1, messages.required)
  .regex(patterns.iban, messages.invalidIban)
  .transform((val) => val.trim().toUpperCase())

// Positive number validation
export const positiveNumberSchema = z
  .number()
  .min(0, messages.positiveNumber)
  .transform((val) => Math.round(val * 100) / 100) // Round to 2 decimal places

// Percentage validation (0-100)
export const percentageSchema = z
  .number()
  .min(0, messages.minValue(0))
  .max(100, messages.maxValue(100))
  .transform((val) => Math.round(val * 100) / 100)

// Date validation (not in future)
export const pastDateSchema = z
  .string()
  .min(1, messages.required)
  .transform((val) => {
    const date = new Date(val)
    return date.toISOString().split('T')[0]
  })
  .refine((val) => {
    const date = new Date(val)
    const today = new Date()
    today.setHours(23, 59, 59, 999) // End of today
    return date <= today
  }, messages.futureDate)

// ============================================================================
// ENTITY-SPECIFIC SCHEMAS
// ============================================================================

// Supplier validation schema
export const supplierSchema = z.object({
  supplierName: sanitizedString(2, 100),
  shortName: z
    .string()
    .optional()
    .transform((val) => (val ? DOMPurify.sanitize(val.trim()) : undefined)),
  country: countrySchema,
  email: emailSchema,
  phone: phoneSchema,
  beneficiaryName: sanitizedString(2, 100),
  bankName: sanitizedString(2, 100),
  branch: sanitizedString(2, 100),
  bankAddress: sanitizedString(10, 500),
  accountNo: accountNumberSchema,
  iban: ibanSchema.optional(),
  swiftCode: swiftCodeSchema.optional(),
  isActive: z.boolean().default(true),
})

// Shipment validation schema
export const shipmentSchema = z.object({
  supplierId: z.string().min(1, messages.required),
  invoiceNumber: invoiceNumberSchema,
  invoiceDate: pastDateSchema,
  goodsCategory: sanitizedString(2, 50),
  invoiceValue: positiveNumberSchema,
  invoiceCurrency: currencySchema,
  incoterm: sanitizedString(2, 20),
  shipmentMode: sanitizedString(2, 20),
  shipmentType: sanitizedString(2, 20),
  blAwbNumber: blAwbNumberSchema.optional(),
  blAwbDate: pastDateSchema.optional(),
  vesselName: sanitizedString(undefined, 100).optional(),
  containerNumber: containerNumberSchema.optional(),
  grossWeightKg: positiveNumberSchema.optional(),
  etd: pastDateSchema.optional(),
  eta: pastDateSchema.optional(),
  status: z.enum(['docu-received', 'in-transit', 'arrived', 'cleared', 'delivered']),
  dateOfDelivery: pastDateSchema.optional(),
  isFrozen: z.boolean().default(false),
})

// Item validation schema
export const itemSchema = z.object({
  partNumber: partNumberSchema,
  itemDescription: sanitizedString(10, 500),
  unit: sanitizedString(1, 20),
  currency: currencySchema,
  unitPrice: positiveNumberSchema,
  hsnCode: hsnCodeSchema,
  supplierId: z.string().optional(),
  isActive: z.boolean().default(true),
  countryOfOrigin: countrySchema.optional(),
  bcd: percentageSchema.optional(),
  sws: percentageSchema.optional(),
  igst: percentageSchema.optional(),
  technicalWriteUp: z.string().max(2000, messages.maxLength(2000)).optional(),
  category: sanitizedString(undefined, 50).optional(),
  endUse: sanitizedString(undefined, 50).optional(),
  netWeightKg: positiveNumberSchema.optional(),
  purchaseUom: sanitizedString(undefined, 20).optional(),
  grossWeightPerUomKg: positiveNumberSchema.optional(),
  photoPath: z.string().optional(),
})

// Expense validation schema
export const expenseSchema = z.object({
  expenseTypeId: z.string().min(1, messages.required),
  serviceProviderId: z.string().min(1, messages.required),
  invoiceNo: invoiceNumberSchema,
  invoiceDate: pastDateSchema,
  amount: positiveNumberSchema,
  cgstRate: percentageSchema.optional(),
  sgstRate: percentageSchema.optional(),
  igstRate: percentageSchema.optional(),
  tdsRate: percentageSchema.optional(),
  remarks: z.string().max(500, messages.maxLength(500)).optional(),
})

// BOE validation schema
export const boeSchema = z.object({
  beNumber: sanitizedString(1, 50),
  beDate: pastDateSchema,
  location: sanitizedString(2, 100),
  totalAssessmentValue: positiveNumberSchema,
  dutyAmount: positiveNumberSchema,
  dutyPaid: positiveNumberSchema.optional(),
  challanNumber: sanitizedString(undefined, 50).optional(),
  refId: sanitizedString(undefined, 100).optional(),
  transactionId: sanitizedString(undefined, 100).optional(),
  paymentDate: pastDateSchema.optional(),
})

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

// Generic validation function
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const validatedData = schema.parse(data)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = (error as any).errors.map(
        (err: any) => `${err.path.join('.')}: ${err.message}`
      )
      return { success: false, errors }
    }
    return { success: false, errors: ['Unknown validation error'] }
  }
}

// Safe validation function (doesn't throw)
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  try {
    return schema.parse(data)
  } catch {
    return null
  }
}

// Sanitize HTML content
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p'],
    ALLOWED_ATTR: ['href', 'target'],
  })
}

// Sanitize text content
export function sanitizeText(text: string): string {
  return DOMPurify.sanitize(text.trim(), { ALLOWED_TAGS: [] })
}

// Validate and sanitize file upload
export function validateFileUpload(
  file: File,
  options: {
    maxSize?: number // in bytes
    allowedTypes?: string[]
    allowedExtensions?: string[]
  } = {}
): { success: true; file: File } | { success: false; error: string } {
  const { maxSize = 10 * 1024 * 1024, allowedTypes = [], allowedExtensions = [] } = options

  // Check file size
  if (file.size > maxSize) {
    return {
      success: false,
      error: `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`,
    }
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return { success: false, error: `File type ${file.type} is not allowed` }
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !allowedExtensions.includes(extension)) {
      return { success: false, error: `File extension .${extension} is not allowed` }
    }
  }

  return { success: true, file }
}

// Validate CSV data
export function validateCsvData<T>(
  data: unknown[],
  schema: z.ZodSchema<T>
): {
  valid: T[]
  invalid: Array<{ index: number; errors: string[] }>
} {
  const valid: T[] = []
  const invalid: Array<{ index: number; errors: string[] }> = []

  data.forEach((row, index) => {
    const result = validateData(schema, row)
    if (result.success) {
      valid.push(result.data)
    } else {
      invalid.push({ index, errors: result.errors })
    }
  })

  return { valid, invalid }
}

// ============================================================================
// SECURITY UTILITIES
// ============================================================================

// Check for SQL injection patterns
export function containsSqlInjection(text: string): boolean {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(\b(OR|AND)\b\s+['"]\w+['"]\s*=\s*['"]\w+['"])/i,
    /(--|\/\*|\*\/|;)/,
    /(\b(WAITFOR|DELAY)\b)/i,
  ]

  return sqlPatterns.some((pattern) => pattern.test(text))
}

// Check for XSS patterns
export function containsXss(text: string): boolean {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  ]

  return xssPatterns.some((pattern) => pattern.test(text))
}

// Validate and sanitize user input
export function validateUserInput(
  input: string,
  options: {
    maxLength?: number
    allowHtml?: boolean
    checkSqlInjection?: boolean
    checkXss?: boolean
  } = {}
): { success: true; sanitized: string } | { success: false; error: string } {
  const { maxLength = 1000, allowHtml = false, checkSqlInjection = true, checkXss = true } = options

  // Check length
  if (input.length > maxLength) {
    return { success: false, error: `Input must be no more than ${maxLength} characters` }
  }

  // Check for SQL injection
  if (checkSqlInjection && containsSqlInjection(input)) {
    return { success: false, error: 'Input contains potentially dangerous SQL patterns' }
  }

  // Check for XSS
  if (checkXss && containsXss(input)) {
    return { success: false, error: 'Input contains potentially dangerous XSS patterns' }
  }

  // Sanitize
  const sanitized = allowHtml ? sanitizeHtml(input) : sanitizeText(input)

  return { success: true, sanitized }
}

// Export types
export type SupplierInput = z.input<typeof supplierSchema>
export type SupplierOutput = z.output<typeof supplierSchema>
export type ShipmentInput = z.input<typeof shipmentSchema>
export type ShipmentOutput = z.output<typeof shipmentSchema>
export type ItemInput = z.input<typeof itemSchema>
export type ItemOutput = z.output<typeof itemSchema>
export type ExpenseInput = z.input<typeof expenseSchema>
export type ExpenseOutput = z.output<typeof expenseSchema>
export type BoeInput = z.input<typeof boeSchema>
export type BoeOutput = z.output<typeof boeSchema>

// Re-export validation hooks
export {
  useValidation,
  useFileValidation,
  useCsvValidation,
  useInputValidation,
  useRealTimeValidation,
} from './useValidation'
