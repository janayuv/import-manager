import * as React from 'react';

import type {
  AppSettings,
  ModuleFieldSettings,
  ModuleSettings,
} from './settings';

export type SettingsContextType = {
  settings: AppSettings;
  updateSettings: (settings: AppSettings) => void;
  updateNumberSettings: (updates: Partial<AppSettings['numberFormat']>) => void;
  updateDateSettings: (updates: Partial<AppSettings['dateFormat']>) => void;
  updateTextSettings: (updates: Partial<AppSettings['textFormat']>) => void;
  updateModuleSettings: (
    moduleName: keyof AppSettings['modules'],
    updates: Partial<ModuleSettings>
  ) => void;
  updateModuleField: (
    moduleName: keyof AppSettings['modules'],
    fieldName: string,
    updates: Partial<ModuleFieldSettings>
  ) => void;
};

export const SettingsContext = React.createContext<
  SettingsContextType | undefined
>(undefined);
