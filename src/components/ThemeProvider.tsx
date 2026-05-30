import { createContext, useContext, useEffect, useState } from 'react';
import { load } from '@tauri-apps/plugin-store';

type DesignTheme = 'default' | 'steel';
type ColorMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: DesignTheme;
  mode: ColorMode;
  setTheme: (t: DesignTheme) => void;
  setMode: (m: ColorMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const isPlaywrightStub = import.meta.env.VITE_PLAYWRIGHT === '1';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<DesignTheme>('steel');
  const [mode, setModeState] = useState<ColorMode>('system');
  const [ready, setReady] = useState(isPlaywrightStub);

  useEffect(() => {
    if (isPlaywrightStub) return;

    load('ui-prefs.json', { autoSave: true, defaults: {} })
      .then(store => {
        Promise.all([
          store.get<DesignTheme>('theme'),
          store.get<ColorMode>('mode'),
        ]).then(([t, m]) => {
          if (t) setThemeState(t);
          if (m) setModeState(m);
          setReady(true);
        });
      })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const html = document.documentElement;

    if (theme === 'steel') {
      html.dataset.theme = 'steel';
    } else {
      delete html.dataset.theme;
    }

    const applyDark = (dark: boolean) => html.classList.toggle('dark', dark);

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyDark(mq.matches);
      const handler = (e: MediaQueryListEvent) => applyDark(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyDark(mode === 'dark');
    }
  }, [theme, mode, ready]);

  const persist = async (key: string, value: string) => {
    if (isPlaywrightStub) return;

    try {
      const store = await load('ui-prefs.json', {
        autoSave: true,
        defaults: {},
      });
      await store.set(key, value);
    } catch {
      // Graceful degradation: preference lost on restart, theme still applied
    }
  };

  const setTheme = (t: DesignTheme) => {
    setThemeState(t);
    void persist('theme', t);
  };
  const setMode = (m: ColorMode) => {
    setModeState(m);
    void persist('mode', m);
  };

  if (!ready)
    return (
      <div style={{ background: 'var(--background)', minHeight: '100vh' }} />
    );

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeDesign() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeDesign must be used inside ThemeProvider');
  return ctx;
}
