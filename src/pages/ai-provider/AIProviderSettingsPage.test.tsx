import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/layout/theme-provider';

import AIProviderSettingsPage from './AIProviderSettingsPage';

const wrap = (el: React.ReactNode) => (
  <ThemeProvider
    defaultTheme={{ mode: 'light', color: 'zinc' }}
    storageKey="test-t"
  >
    {el}
  </ThemeProvider>
);

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('AIProviderSettingsPage', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it('loads and populates from get_ai_provider_settings', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_ai_provider_settings') {
        return Promise.resolve({
          aiProvider: 'deepseek',
          deepseekApiKey: 'sk-abc',
          ollamaEndpoint: 'http://x/api/chat',
          ollamaModel: 'm1',
        });
      }
      return Promise.reject(new Error('bad'));
    });

    render(wrap(<AIProviderSettingsPage />));
    await waitFor(() => {
      expect(
        (document.getElementById('ds-key') as HTMLInputElement).value
      ).toBe('sk-abc');
    });
  });

  it('calls set_ai_provider_settings on save', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_ai_provider_settings') {
        return Promise.resolve({
          aiProvider: 'mock',
          deepseekApiKey: '',
          ollamaEndpoint: 'http://localhost:11434/api/chat',
          ollamaModel: 'llama3',
        });
      }
      if (cmd === 'set_ai_provider_settings') {
        return Promise.resolve();
      }
      return Promise.reject(new Error('bad'));
    });

    render(wrap(<AIProviderSettingsPage />));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/AI provider settings/);
    });
    const saveButtons = screen.getAllByTestId('ai-provider-settings-save');
    fireEvent.click(saveButtons[0]!);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'set_ai_provider_settings',
        expect.objectContaining({
          settings: expect.objectContaining({ aiProvider: 'mock' }),
        })
      );
    });
  });
});
