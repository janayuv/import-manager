import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { useTheme } from '@/components/layout/theme-context';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Tauri
Object.defineProperty(window, '__TAURI__', {
  value: {
    window: {
      getCurrent: vi.fn().mockResolvedValue({
        setTheme: vi.fn(),
      }),
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('ThemeProvider Custom Accent Color', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('should initialize with default theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toEqual({
      mode: 'system',
      color: 'blue',
    });
    expect(result.current.theme.customAccentColor).toBeUndefined();
  });

  it('should load custom accent color from localStorage', () => {
    const storedTheme = {
      mode: 'light',
      color: 'red',
      customAccentColor: '#ff5733',
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(storedTheme));

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme.customAccentColor).toBe('#ff5733');
  });

  it('should set custom accent color', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setCustomAccentColor('#ff5733');
    });

    expect(result.current.theme.customAccentColor).toBe('#ff5733');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'vite-ui-theme',
      JSON.stringify({
        mode: 'system',
        color: 'blue',
        customAccentColor: '#ff5733',
      })
    );
  });

  it('should normalize hex color when setting', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setCustomAccentColor('#abc');
    });

    expect(result.current.theme.customAccentColor).toBe('#aabbcc');
  });

  it('should remove custom accent color when set to null', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    // First set a custom color
    act(() => {
      result.current.setCustomAccentColor('#ff5733');
    });

    expect(result.current.theme.customAccentColor).toBe('#ff5733');

    // Then remove it
    act(() => {
      result.current.setCustomAccentColor(null);
    });

    expect(result.current.theme.customAccentColor).toBeUndefined();
  });

  it('should ignore invalid hex colors', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setCustomAccentColor('invalid-color');
    });

    expect(result.current.theme.customAccentColor).toBeUndefined();
  });

  it('should handle localStorage errors gracefully', () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('localStorage error');
    });

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toEqual({
      mode: 'system',
      color: 'blue',
    });
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('vite-ui-theme');
  });

  it('should persist theme changes to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme({
        mode: 'dark',
        color: 'green',
        customAccentColor: '#00ff00',
      });
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'vite-ui-theme',
      JSON.stringify({
        mode: 'dark',
        color: 'green',
        customAccentColor: '#00ff00',
      })
    );
  });
});
