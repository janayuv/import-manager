import { describe, expect, it } from 'vitest';

import { formatAvgConfidencePercent } from './ai-analytics-format';

describe('formatAvgConfidencePercent', () => {
  it('returns em dash for null', () => {
    expect(formatAvgConfidencePercent(null)).toBe('—');
  });
  it('formats ratio as percent', () => {
    expect(formatAvgConfidencePercent(0.875)).toBe('87.5%');
  });
});
