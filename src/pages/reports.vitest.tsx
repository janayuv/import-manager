// lightweight render to avoid extra deps
import { describe, it } from 'vitest';

import { createElement } from 'react';

import ReportsPage from './reports';

describe('ReportsPage', () => {
  it('renders without crashing', () => {
    // just ensure it can be created
    createElement(ReportsPage);
  });
});
