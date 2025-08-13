'use client'

import * as React from 'react'
import { loadSettings, saveSettings, updateModuleSettings, updateModuleField, type AppSettings, type ModuleSettings, type ModuleFieldSettings } from './settings'

interface SettingsContextType {
  settings: AppSettings
  updateSettings: (newSettings: AppSettings) => void
  updateNumberSettings: (updates: Partial<AppSettings['numberFormat']>) => void
  updateDateSettings: (updates: Partial<AppSettings['dateFormat']>) => void
  updateTextSettings: (updates: Partial<AppSettings['textFormat']>) => void
  updateModuleSettings: (moduleName: keyof AppSettings['modules'], updates: Partial<ModuleSettings>) => void
  updateModuleField: (moduleName: keyof AppSettings['modules'], fieldName: string, updates: Partial<ModuleFieldSettings>) => void
}

export const SettingsContext = React.createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<AppSettings | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  
  // Initialize settings on mount
  React.useEffect(() => {
    try {
      const loadedSettings = loadSettings()
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
      // Use default settings if loading fails
      setSettings(loadSettings())
    } finally {
      setIsLoading(false)
    }
  }, [])
  
  // Show loading state while settings are being initialized
  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-medium">Loading application settings...</div>
          <div className="text-sm text-muted-foreground">Please wait while settings are being initialized.</div>
        </div>
      </div>
    )
  }

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

  const updateModuleSettingsWrapper = (moduleName: keyof AppSettings['modules'], updates: Partial<ModuleSettings>) => {
    const updatedSettings = updateModuleSettings(moduleName, updates)
    setSettings(updatedSettings)
  }

  const updateModuleFieldWrapper = (moduleName: keyof AppSettings['modules'], fieldName: string, updates: Partial<ModuleFieldSettings>) => {
    const updatedSettings = updateModuleField(moduleName, fieldName, updates)
    setSettings(updatedSettings)
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      updateNumberSettings,
      updateDateSettings,
      updateTextSettings,
      updateModuleSettings: updateModuleSettingsWrapper,
      updateModuleField: updateModuleFieldWrapper,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}


