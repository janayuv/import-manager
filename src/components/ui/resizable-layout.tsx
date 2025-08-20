import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle, type PanelGroupProps } from 'react-resizable-panels'

import { cn } from '@/lib/utils'

interface ResizableLayoutProps extends Omit<PanelGroupProps, 'children'> {
  children: React.ReactNode[]
  storageKey?: string
  defaultSizes?: number[]
  minSizes?: number[]
  maxSizes?: number[]
  className?: string
  onLayoutChange?: (sizes: number[]) => void
}

export function ResizableLayout({
  children,
  storageKey = 'resizable-layout',
  defaultSizes = [50, 50],
  minSizes = [20, 20],
  maxSizes = [80, 80],
  className,
  onLayoutChange,
  ...props
}: ResizableLayoutProps) {
  const [sizes, setSizes] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length === children.length) {
          return parsed
        }
      }
    } catch (e) {
      console.warn('Failed to load saved layout:', e)
    }
    return defaultSizes
  })

  const handleLayoutChange = (newSizes: number[]) => {
    setSizes(newSizes)
    onLayoutChange?.(newSizes)

    // Save to localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify(newSizes))
    } catch (e) {
      console.warn('Failed to save layout:', e)
    }
  }

  return (
    <div className={cn('h-full w-full', className)}>
      <PanelGroup onLayout={handleLayoutChange} {...props}>
        {children.map((child, index) => (
          <div key={index} className="flex flex-col">
            <Panel
              defaultSize={sizes[index] || defaultSizes[index] || 50}
              minSize={minSizes[index] || 20}
              maxSize={maxSizes[index] || 80}
            >
              <div className="h-full w-full overflow-auto">{child}</div>
            </Panel>

            {index < children.length - 1 && (
              <PanelResizeHandle className="bg-border hover:bg-primary/50 w-1 transition-colors duration-200" />
            )}
          </div>
        ))}
      </PanelGroup>
    </div>
  )
}

// Vertical layout variant
export function ResizableVerticalLayout({
  children,
  storageKey = 'resizable-vertical-layout',
  defaultSizes = [60, 40],
  minSizes = [30, 20],
  maxSizes = [80, 70],
  className,
  onLayoutChange,
  ...props
}: ResizableLayoutProps) {
  return (
    <ResizableLayout
      storageKey={storageKey}
      defaultSizes={defaultSizes}
      minSizes={minSizes}
      maxSizes={maxSizes}
      className={className}
      onLayoutChange={onLayoutChange}
      {...props}
    >
      {children}
    </ResizableLayout>
  )
}

// Layout controls component
interface LayoutControlsProps {
  onReset: () => void
  onToggleDirection?: () => void
  direction?: 'horizontal' | 'vertical'
  className?: string
}

export function LayoutControls({
  onReset,
  onToggleDirection,
  direction = 'horizontal',
  className,
}: LayoutControlsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {onToggleDirection && (
        <button
          onClick={onToggleDirection}
          className="hover:bg-muted rounded-md p-2 text-sm transition-colors"
          title={`Switch to ${direction === 'horizontal' ? 'vertical' : 'horizontal'} layout`}
        >
          {direction === 'horizontal' ? '↔' : '↕'}
        </button>
      )}

      <button
        onClick={onReset}
        className="hover:bg-muted rounded-md p-2 text-sm transition-colors"
        title="Reset layout"
      >
        ↺
      </button>
    </div>
  )
}

// Hook for managing layout preferences
export function useLayoutPreferences(storageKey: string) {
  const [preferences, setPreferences] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  const savePreferences = (newPreferences: Record<string, unknown>) => {
    const updated = { ...preferences, ...newPreferences }
    setPreferences(updated)
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated))
    } catch (e) {
      console.warn('Failed to save layout preferences:', e)
    }
  }

  return { preferences, savePreferences }
}
