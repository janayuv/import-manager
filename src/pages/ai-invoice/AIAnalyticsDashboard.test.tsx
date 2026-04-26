import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AIAnalyticsDashboard from './AIAnalyticsDashboard';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('AIAnalyticsDashboard', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('loads summary and provider data without throwing', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_ai_extraction_summary') {
        return Promise.resolve({
          total: 2,
          successCount: 1,
          failureCount: 1,
          ocrCount: 0,
          avgConfidence: 0.85,
        });
      }
      if (cmd === 'get_provider_usage_summary') {
        return Promise.resolve([{ providerUsed: 'mock', count: 2 }]);
      }
      return Promise.reject(new Error('unknown cmd'));
    });

    render(<AIAnalyticsDashboard />);

    await waitFor(() => {
      const body = document.body.textContent ?? '';
      expect(body).toMatch(/Total extractions/);
      expect(body).toMatch(/2/);
      expect(body).toMatch(/Extraction outcomes/);
      expect(body).toMatch(/By provider/);
      expect(body).toMatch(/Provider usage/);
      expect(body).toMatch(/mock/);
    });
  });

  it('renders with empty dataset from backend', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_ai_extraction_summary') {
        return Promise.resolve({
          total: 0,
          successCount: 0,
          failureCount: 0,
          ocrCount: 0,
          avgConfidence: null,
        });
      }
      if (cmd === 'get_provider_usage_summary') {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error('unknown cmd'));
    });

    render(<AIAnalyticsDashboard />);
    await waitFor(() => {
      const t = document.body.textContent ?? '';
      expect(t).toMatch(/No extraction data yet/);
      const unavailable = t.match(/Chart data unavailable/g);
      expect(unavailable?.length).toBe(2);
    });
  });
});
