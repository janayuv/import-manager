'use client';

import * as React from 'react';

import {
  type AppSettings,
  type ModuleFieldSettings,
  type ModuleSettings,
  loadSettings,
  saveSettings,
  updateModuleField,
  updateModuleSettings,
} from './settings';
import { SettingsContext } from './settings-context-definition';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Initialize settings on mount
  React.useEffect(() => {
    try {
      const loadedSettings = loadSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Use default settings if loading fails
      setSettings(loadSettings());
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Show loading state while settings are being initialized
  if (isLoading || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">
            Loading application settings...
          </div>
          <div className="text-muted-foreground text-sm">
            Please wait while settings are being initialized.
          </div>
        </div>
      </div>
    );
  }

  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const updateNumberSettings = (
    updates: Partial<AppSettings['numberFormat']>
  ) => {
    const newSettings = {
      ...settings,
      numberFormat: { ...settings.numberFormat, ...updates },
    };
    updateSettings(newSettings);
  };

  const updateDateSettings = (updates: Partial<AppSettings['dateFormat']>) => {
    const newSettings = {
      ...settings,
      dateFormat: { ...settings.dateFormat, ...updates },
    };
    updateSettings(newSettings);
  };

  const updateTextSettings = (updates: Partial<AppSettings['textFormat']>) => {
    const newSettings = {
      ...settings,
      textFormat: { ...settings.textFormat, ...updates },
    };
    updateSettings(newSettings);
  };

  const updateModuleSettingsWrapper = (
    moduleName: keyof AppSettings['modules'],
    updates: Partial<ModuleSettings>
  ) => {
    const updatedSettings = updateModuleSettings(moduleName, updates);
    setSettings(updatedSettings);
  };

  const updateModuleFieldWrapper = (
    moduleName: keyof AppSettings['modules'],
    fieldName: string,
    updates: Partial<ModuleFieldSettings>
  ) => {
    const updatedSettings = updateModuleField(moduleName, fieldName, updates);
    setSettings(updatedSettings);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        updateNumberSettings,
        updateDateSettings,
        updateTextSettings,
        updateModuleSettings: updateModuleSettingsWrapper,
        updateModuleField: updateModuleFieldWrapper,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
