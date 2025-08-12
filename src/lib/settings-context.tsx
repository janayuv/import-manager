'use client'

import * as React from 'react'
import { loadSettings, saveSettings, type AppSettings } from './settings'

interface SettingsContextType {
  settings: AppSettings
  updateSettings: (newSettings: AppSettings) => void
  updateNumberSettings: (updates: Partial<AppSettings['numberFormat']>) => void
  updateDateSettings: (updates: Partial<AppSettings['dateFormat']>) => void
  updateTextSettings: (updates: Partial<AppSettings['textFormat']>) => void
}

const SettingsContext = React.createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<AppSettings>(loadSettings())

  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  const updateNumberSettings = (updates: Partial<AppSettings['numberFormat']>) => {
    const newSettings = {
      ...settings,
      numberFormat: { ...settings.numberFormat, ...updates }
    }
    updateSettings(newSettings)
  }

  const updateDateSettings = (updates: Partial<AppSettings['dateFormat']>) => {
    const newSettings = {
      ...settings,
      dateFormat: { ...settings.dateFormat, ...updates }
    }
    updateSettings(newSettings)
  }

  const updateTextSettings = (updates: Partial<AppSettings['textFormat']>) => {
    const newSettings = {
      ...settings,
      textFormat: { ...settings.textFormat, ...updates }
    }
    updateSettings(newSettings)
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      updateNumberSettings,
      updateDateSettings,
      updateTextSettings,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = React.useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
