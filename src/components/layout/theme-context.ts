// src/components/ui/layout/theme-context.ts
import { createContext, useContext } from 'react';

// Based on your themes.d.ts file
export type ThemeColor =
  | 'zinc'
  | 'rose'
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'violet'
  | 'slate'
  | 'gray'
  | 'neutral'
  | 'stone'
  | 'amber'
  | 'lime'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'indigo'
  | 'purple'
  | 'fuchsia'
  | 'pink';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface Theme {
  mode: ThemeMode;
  color: ThemeColor;
}

export interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleMode: () => void;
  setColor: (color: ThemeColor) => void;
  isDark: boolean;
  isLight: boolean;
  isSystem: boolean;
}

export const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: { mode: 'system', color: 'zinc' },
  setTheme: () => null,
  toggleMode: () => null,
  setColor: () => null,
  isDark: false,
  isLight: false,
  isSystem: true,
});

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
