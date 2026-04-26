import { describe, expect, it } from 'vitest';

import { formatBatchProgressLine } from './ai-invoice-batch-ui';

describe('formatBatchProgressLine', () => {
  it('renders 3 of 10 with file name', () => {
    expect(formatBatchProgressLine(3, 10, 'inv.pdf')).toBe(
      'Processing file 3 of 10... (inv.pdf)'
    );
  });
});
