// src/components/ui/layout/theme-provider.tsx
import { useEffect, useState } from 'react'

import {
  type Theme,
  type ThemeColor,
  ThemeProviderContext,
  type ThemeProviderState,
} from './theme-context'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

const THEME_COLORS: ThemeColor[] = [
  'zinc',
  'rose',
  'blue',
  'green',
  'orange',
  'red',
  'yellow',
  'violet',
]

export function ThemeProvider({
  children,
  defaultTheme = { mode: 'system', color: 'zinc' },
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const storedTheme = localStorage.getItem(storageKey)
      if (storedTheme) {
        return JSON.parse(storedTheme)
      }
    } catch (e) {
      console.error('Failed to parse theme from localStorage', e)
      localStorage.removeItem(storageKey)
    }
    return defaultTheme
  })

  useEffect(() => {
    const root = window.document.documentElement

    // Remove all previous theme classes
    root.classList.remove('light', 'dark')
    THEME_COLORS.forEach((color) => root.classList.remove(`theme-${color}`))

    // Determine effective mode (resolving "system")
    const effectiveMode =
      theme.mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme.mode

    // Add new theme classes
    root.classList.add(effectiveMode)
    root.classList.add(`theme-${theme.color}`)
  }, [theme])

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, JSON.stringify(newTheme))
      setTheme(newTheme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
