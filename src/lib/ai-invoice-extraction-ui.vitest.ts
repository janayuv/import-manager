import { describe, expect, it } from 'vitest';

import { isDeepseekApiKeyConfiguredForUi } from './ai-invoice-extraction-ui';

function patchEnv(updates: Record<string, string | undefined>, fn: () => void) {
  const m = import.meta.env as unknown as Record<string, string | undefined>;
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(updates)) {
    prev[k] = m[k];
  }
  try {
    Object.assign(m, updates);
    fn();
  } finally {
    for (const k of Object.keys(updates)) {
      m[k] = prev[k];
    }
  }
}

describe('isDeepseekApiKeyConfiguredForUi', () => {
  it('treats Playwright / stub run as configured', () => {
    patchEnv({ VITE_PLAYWRIGHT: '1' }, () => {
      expect(isDeepseekApiKeyConfiguredForUi()).toBe(true);
    });
  });

  it('treats VITE_DEEPSEEK_API_CONFIGURED=true as configured', () => {
    patchEnv(
      { VITE_PLAYWRIGHT: '0', VITE_DEEPSEEK_API_CONFIGURED: 'true' },
      () => {
        expect(isDeepseekApiKeyConfiguredForUi()).toBe(true);
      }
    );
  });

  it('treats IMPORT_MANAGER_DEEPSEEK_ENV_OK as configured', () => {
    patchEnv(
      { VITE_PLAYWRIGHT: undefined, IMPORT_MANAGER_DEEPSEEK_ENV_OK: 'true' },
      () => {
        expect(isDeepseekApiKeyConfiguredForUi()).toBe(true);
      }
    );
  });
});
