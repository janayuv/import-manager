// src/components/layout/theme-provider.tsx
import { useEffect, useState } from 'react';

import {
  type Theme,
  type ThemeColor,
  ThemeProviderContext,
  type ThemeProviderState,
} from './theme-context';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

const THEME_COLORS: ThemeColor[] = [
  'zinc',
  'slate',
  'gray',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

export function ThemeProvider({
  children,
  defaultTheme = { mode: 'system', color: 'blue' },
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const storedTheme = localStorage.getItem(storageKey);
      if (storedTheme) {
        return JSON.parse(storedTheme);
      }
    } catch (e) {
      console.error('Failed to parse theme from localStorage', e);
      localStorage.removeItem(storageKey);
    }
    return defaultTheme;
  });

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem(storageKey, JSON.stringify(newTheme));
    setThemeState(newTheme);
  };

  const toggleMode = () => {
    const newMode =
      theme.mode === 'light'
        ? 'dark'
        : theme.mode === 'dark'
          ? 'system'
          : 'light';
    setTheme({ ...theme, mode: newMode });
  };

  const setColor = (color: ThemeColor) => {
    setTheme({ ...theme, color });
  };

  useEffect(() => {
    const root = window.document.documentElement;

    // Remove all previous theme classes
    root.classList.remove('light', 'dark');
    THEME_COLORS.forEach(color => root.classList.remove(`theme-${color}`));

    // Determine effective mode (resolving "system")
    const effectiveMode =
      theme.mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme.mode;

    // Add new theme classes with smooth transition
    root.style.setProperty('--transition-duration', '0.3s');
    root.classList.add(effectiveMode);
    root.classList.add(`theme-${theme.color}`);

    // Sync with Tauri window theme if available
    if (window.__TAURI__) {
      try {
        // Set window theme for better OS integration
        window.__TAURI__.window.getCurrent().then(tauriWindow => {
          tauriWindow.setTheme(effectiveMode);
        });
      } catch (e) {
        console.warn('Failed to sync theme with Tauri window:', e);
      }
    }
  }, [theme]);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme.mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = window.document.documentElement;
      const effectiveMode = mediaQuery.matches ? 'dark' : 'light';

      root.classList.remove('light', 'dark');
      root.classList.add(effectiveMode);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme.mode]);

  const value: ThemeProviderState = {
    theme,
    setTheme,
    toggleMode,
    setColor,
    isDark: theme.mode === 'dark',
    isLight: theme.mode === 'light',
    isSystem: theme.mode === 'system',
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
