import React from 'react'
import { useResponsiveContext } from '@/providers/ResponsiveProvider'
import { cn } from '@/lib/utils'

interface ResponsiveFormProps {
  children: React.ReactNode
  className?: string
  onSubmit?: (e: React.FormEvent) => void
  variant?: 'default' | 'compact' | 'spacious'
}

export const ResponsiveForm: React.FC<ResponsiveFormProps> = ({
  children,
  className,
  onSubmit,
  variant = 'default',
}) => {
  const { getSpacingClass, getPaddingClass } = useResponsiveContext()

  const variantClasses = {
    default: 'space-y-6',
    compact: 'space-y-4',
    spacious: 'space-y-8',
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(variantClasses[variant], getSpacingClass(), getPaddingClass(), className)}
    >
      {children}
    </form>
  )
}

interface ResponsiveFormFieldProps {
  children: React.ReactNode
  label?: string
  description?: string
  error?: string
  required?: boolean
  className?: string
  variant?: 'default' | 'compact' | 'horizontal'
}

export const ResponsiveFormField: React.FC<ResponsiveFormFieldProps> = ({
  children,
  label,
  description,
  error,
  required = false,
  className,
  variant = 'default',
}) => {
  const { getTextClass, getSpacingClass } = useResponsiveContext()

  const variantClasses = {
    default: 'space-y-2',
    compact: 'space-y-1',
    horizontal: 'flex flex-col sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:space-x-4',
  }

  return (
    <div className={cn(variantClasses[variant], className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label
            className={cn(
              getTextClass('sm'),
              'leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
            )}
          >
            {label}
            {required && <span className="ml-1 text-red-500">*</span>}
          </label>
        </div>
      )}
      {description && <p className={cn(getTextClass('xs'), 'text-muted-foreground')}>{description}</p>}
      <div className={getSpacingClass()}>{children}</div>
      {error && <p className={cn(getTextClass('xs'), 'text-red-500')}>{error}</p>}
    </div>
  )
}

interface ResponsiveFormSectionProps {
  children: React.ReactNode
  title?: string
  description?: string
  className?: string
  variant?: 'default' | 'compact' | 'card'
}

export const ResponsiveFormSection: React.FC<ResponsiveFormSectionProps> = ({
  children,
  title,
  description,
  className,
  variant = 'default',
}) => {
  const { getTextClass, getSpacingClass, getCardClass } = useResponsiveContext()

  const variantClasses = {
    default: 'space-y-4',
    compact: 'space-y-3',
    card: cn('p-6 border rounded-lg', getCardClass()),
  }

  return (
    <div className={cn(variantClasses[variant], className)}>
      {(title || description) && (
        <div className={getSpacingClass()}>
          {title && <h3 className={cn(getTextClass('lg'), 'font-semibold')}>{title}</h3>}
          {description && <p className={cn(getTextClass('sm'), 'text-muted-foreground')}>{description}</p>}
        </div>
      )}
      <div className={getSpacingClass()}>{children}</div>
    </div>
  )
}

interface ResponsiveFormGridProps {
  children: React.ReactNode
  columns?: 1 | 2 | 3 | 4
  className?: string
  gap?: 'sm' | 'default' | 'lg'
}

export const ResponsiveFormGrid: React.FC<ResponsiveFormGridProps> = ({
  children,
  columns = 2,
  className,
  gap = 'default',
}) => {
  const { getSpacingClass } = useResponsiveContext()

  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }

  const gapClasses = {
    sm: 'gap-3',
    default: 'gap-4',
    lg: 'gap-6',
  }

  return (
    <div className={cn('grid', columnClasses[columns], gapClasses[gap], getSpacingClass(), className)}>{children}</div>
  )
}

interface ResponsiveFormActionsProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'compact' | 'sticky'
}

export const ResponsiveFormActions: React.FC<ResponsiveFormActionsProps> = ({
  children,
  className,
  variant = 'default',
}) => {
  const { getSpacingClass, getPaddingClass } = useResponsiveContext()

  const variantClasses = {
    default: 'flex items-center justify-end space-x-2 pt-6',
    compact: 'flex items-center justify-end space-x-2 pt-4',
    sticky: 'sticky bottom-0 bg-background border-t p-4 flex items-center justify-end space-x-2',
  }

  return <div className={cn(variantClasses[variant], getSpacingClass(), getPaddingClass(), className)}>{children}</div>
}
