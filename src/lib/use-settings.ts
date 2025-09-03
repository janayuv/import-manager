'use client';

import * as React from 'react';

import { SettingsContext } from './settings-context-definition';

export function useSettings() {
  const context = React.useContext(SettingsContext);

  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }

  return context;
}
