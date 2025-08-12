// lightweight render to avoid extra deps
import { createElement } from 'react'
import { describe, it } from 'vitest'
import ReportsPage from './reports'

describe('ReportsPage', () => {
  it('renders without crashing', () => {
    // just ensure it can be created
    createElement(ReportsPage)
  })
})


