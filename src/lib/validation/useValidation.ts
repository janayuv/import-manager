import { toast } from 'sonner'
import * as z from 'zod'

import { useCallback, useMemo, useState } from 'react'

import { validateCsvData, validateData, validateFileUpload, validateUserInput } from './index'

// Validation state interface - removed unused interface

// Validation hook options
interface UseValidationOptions<T> {
  schema: z.ZodSchema<T>
  initialData?: Partial<T>
  onValidationSuccess?: (data: T) => void
  onValidationError?: (errors: string[]) => void
  showToast?: boolean
  validateOnChange?: boolean
  validateOnBlur?: boolean
}

// Validation hook return type
interface UseValidationReturn<T> {
  // State
  data: Partial<T>
  errors: Record<keyof T, string[]>
  touched: Record<keyof T, boolean>
  isValid: boolean
  isSubmitting: boolean

  // Actions
  setData: (data: Partial<T>) => void
  setField: (field: keyof T, value: T[keyof T]) => void
  setTouched: (field: keyof T, touched: boolean) => void
  validate: () => boolean
  validateField: (field: keyof T) => boolean
  reset: () => void
  submit: (onSubmit?: (data: T) => Promise<void>) => Promise<boolean>

  // Utilities
  getFieldError: (field: keyof T) => string | undefined
  hasFieldError: (field: keyof T) => boolean
  isFieldTouched: (field: keyof T) => boolean
}

export function useValidation<T extends Record<string, unknown>>({
  schema,
  initialData = {},
  onValidationSuccess,
  onValidationError,
  showToast = true,
  validateOnChange = false,
  validateOnBlur = true,
}: UseValidationOptions<T>): UseValidationReturn<T> {
  // State
  const [data, setDataState] = useState<Partial<T>>(initialData)
  const [errors, setErrors] = useState<Record<keyof T, string[]>>({} as Record<keyof T, string[]>)
  const [touched, setTouchedState] = useState<Record<keyof T, boolean>>({} as Record<keyof T, boolean>)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Memoized validation state
  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0 && Object.keys(data).length > 0
  }, [errors, data])

  // Set data with optional validation
  const setData = useCallback(
    (newData: Partial<T>) => {
      setDataState(newData)

      if (validateOnChange) {
        const result = validateData(schema, { ...data, ...newData })
        if (!result.success) {
          const newErrors: Record<keyof T, string[]> = {} as Record<keyof T, string[]>
          result.errors.forEach((error) => {
            const [field] = error.split(':')
            if (field in newData) {
              newErrors[field as keyof T] = [error.split(':')[1]?.trim() || error]
            }
          })
          setErrors((prev) => ({ ...prev, ...newErrors }))
        }
      }
    },
    [data, schema, validateOnChange]
  )

  // Set individual field
  const setField = useCallback(
    (field: keyof T, value: T[keyof T]) => {
      setData({ ...data, [field]: value })
    },
    [data, setData]
  )

  // Set touched state
  const setTouched = useCallback(
    (field: keyof T, touched: boolean) => {
      setTouchedState((prev) => ({ ...prev, [field]: touched }))

      if (validateOnBlur && touched) {
        validateField(field)
      }
    },
    [validateOnBlur, validateField]
  )

  // Validate entire form
  const validate = useCallback((): boolean => {
    const result = validateData(schema, data)

    if (result.success) {
      setErrors({} as Record<keyof T, string[]>)
      return true
    } else {
      const newErrors: Record<keyof T, string[]> = {} as Record<keyof T, string[]>
      result.errors.forEach((error) => {
        const [field, ...messageParts] = error.split(':')
        const message = messageParts.join(':').trim()
        if (field in data) {
          newErrors[field as keyof T] = [message]
        }
      })
      setErrors(newErrors)

      if (showToast && onValidationError) {
        onValidationError(result.errors)
      }

      return false
    }
  }, [data, schema, showToast, onValidationError])

  // Validate individual field
  const validateField = useCallback(
    (field: keyof T): boolean => {
      const fieldData = { [field]: data[field] }
      // Create a simple field validation
      const result = validateData(schema, fieldData)

      if (result.success) {
        setErrors((prev) => ({ ...prev, [field]: [] }))
        return true
      } else {
        const fieldErrors = result.errors
          .filter((error) => error.startsWith(field as string))
          .map((error) => error.split(':')[1]?.trim() || error)

        setErrors((prev) => ({ ...prev, [field]: fieldErrors }))
        return false
      }
    },
    [data, schema]
  )

  // Reset form
  const reset = useCallback(() => {
    setDataState(initialData)
    setErrors({} as Record<keyof T, string[]>)
    setTouchedState({} as Record<keyof T, boolean>)
    setIsSubmitting(false)
  }, [initialData])

  // Submit form
  const submit = useCallback(
    async (onSubmit?: (data: T) => Promise<void>): Promise<boolean> => {
      setIsSubmitting(true)

      try {
        if (!validate()) {
          setIsSubmitting(false)
          return false
        }

        const validatedData = schema.parse(data) as T

        if (onValidationSuccess) {
          onValidationSuccess(validatedData)
        }

        if (onSubmit) {
          await onSubmit(validatedData)
        }

        setIsSubmitting(false)
        return true
      } catch {
        setIsSubmitting(false)

        if (showToast) {
          toast.error('Validation failed. Please check your input.')
        }

        return false
      }
    },
    [data, schema, validate, onValidationSuccess, showToast]
  )

  // Utility functions
  const getFieldError = useCallback(
    (field: keyof T): string | undefined => {
      return errors[field]?.[0]
    },
    [errors]
  )

  const hasFieldError = useCallback(
    (field: keyof T): boolean => {
      return errors[field]?.length > 0
    },
    [errors]
  )

  const isFieldTouched = useCallback(
    (field: keyof T): boolean => {
      return touched[field] || false
    },
    [touched]
  )

  return {
    // State
    data,
    errors,
    touched,
    isValid,
    isSubmitting,

    // Actions
    setData,
    setField,
    setTouched,
    validate,
    validateField,
    reset,
    submit,

    // Utilities
    getFieldError,
    hasFieldError,
    isFieldTouched,
  }
}

// Specialized hooks for common validation patterns

// File upload validation hook
export function useFileValidation(
  options: {
    maxSize?: number
    allowedTypes?: string[]
    allowedExtensions?: string[]
    showToast?: boolean
  } = {}
) {
  const { showToast = true, ...validationOptions } = options

  const validateFile = useCallback(
    (file: File) => {
      const result = validateFileUpload(file, validationOptions)

      if (!result.success && showToast) {
        toast.error(result.error)
      }

      return result
    },
    [validationOptions, showToast]
  )

  return { validateFile }
}

// CSV validation hook
export function useCsvValidation<T>(schema: z.ZodSchema<T>) {
  const validateCsv = useCallback(
    (data: unknown[]) => {
      return validateCsvData(data, schema)
    },
    [schema]
  )

  return { validateCsv }
}

// User input validation hook
export function useInputValidation(
  options: {
    maxLength?: number
    allowHtml?: boolean
    checkSqlInjection?: boolean
    checkXss?: boolean
    showToast?: boolean
  } = {}
) {
  const { showToast = true, ...validationOptions } = options

  const validateInput = useCallback(
    (input: string) => {
      const result = validateUserInput(input, validationOptions)

      if (!result.success && showToast) {
        toast.error(result.error)
      }

      return result
    },
    [validationOptions, showToast]
  )

  return { validateInput }
}

// Real-time validation hook
export function useRealTimeValidation<T>(
  schema: z.ZodSchema<T>,

  options: {
    debounceMs?: number
    showToast?: boolean
  } = {}
) {
  const { showToast = false } = options
  const [validationErrors, setValidationErrors] = useState<Record<keyof T, string[]>>({} as Record<keyof T, string[]>)

  const validateRealTime = useCallback(
    (field: keyof T, value: T[keyof T]) => {
      const fieldData = { [field]: value }
      // Create a simple field validation
      const result = validateData(schema, fieldData)

      if (result.success) {
        setValidationErrors((prev) => ({ ...prev, [field]: [] }))
      } else {
        const fieldErrors = result.errors
          .filter((error) => error.startsWith(field as string))
          .map((error) => error.split(':')[1]?.trim() || error)

        setValidationErrors((prev) => ({ ...prev, [field]: fieldErrors }))

        if (showToast && fieldErrors.length > 0) {
          toast.error(fieldErrors[0])
        }
      }
    },
    [schema, showToast]
  )

  return {
    validationErrors,
    validateRealTime,
    clearErrors: () => setValidationErrors({} as Record<keyof T, string[]>),
  }
}
