// src/components/ui/layout/theme-context.ts
import { createContext, useContext } from 'react'

// Based on your themes.d.ts file
export type ThemeColor = 'zinc' | 'rose' | 'blue' | 'green' | 'orange' | 'red' | 'yellow' | 'violet'
export type ThemeMode = 'dark' | 'light' | 'system'

export interface Theme {
  mode: ThemeMode
  color: ThemeColor
}

export interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: { mode: 'system', color: 'zinc' },
  setTheme: () => null,
})

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
