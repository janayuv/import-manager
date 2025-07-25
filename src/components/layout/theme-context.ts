// src/components/ui/layout/theme-context.ts
import { createContext, useContext } from "react"

export type Theme = "light" | "dark" | "system"

export type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  setTheme: () => null,
})

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")
  return context
}