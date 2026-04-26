import { isValidHexColor, normalizeHexColor } from '@/lib/color-utils';

const STORAGE_KEY = 'vite-ui-theme';

function effectiveModeFromStored(mode: string | undefined): 'light' | 'dark' {
  if (mode === 'dark' || mode === 'light') return mode;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Sets `--accent` on `documentElement` from localStorage before React's first
 * commit so the value matches theme context immediately after reload. WebKit
 * (Playwright) can read computed `--accent` before the ThemeProvider effect runs;
 * this avoids a brief window where the CSS theme default (e.g. `oklch`) wins.
 */
export function applyCustomAccentFromLocalStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const theme = JSON.parse(raw) as {
      mode?: string;
      customAccentColor?: string;
    };
    if (!theme.customAccentColor || !isValidHexColor(theme.customAccentColor)) {
      return;
    }
    const normalized = normalizeHexColor(theme.customAccentColor);
    const eff = effectiveModeFromStored(theme.mode);
    const fg = eff === 'dark' ? '#ffffff' : '#000000';
    const root = document.documentElement;
    root.style.setProperty('--accent', normalized);
    root.style.setProperty('--accent-foreground', fg);
  } catch {
    /* ignore */
  }
}
