import { Page } from '@playwright/test'

import { TestUtils } from '../utils/test-utils'

export class DashboardPage {
  private utils: TestUtils

  constructor(private page: Page) {
    this.utils = new TestUtils(page)
  }

  /**
   * Navigate to dashboard
   */
  async goto() {
    await this.utils.navigateTo('/')
  }

  /**
   * Check if dashboard is loaded
   */
  async expectLoaded() {
    await this.utils.expectVisible('h1:has-text("Dashboard")')
    await this.utils.expectVisible('[data-testid="stats-cards"]')
  }

  /**
   * Get stats card values
   */
  async getStats() {
    const suppliers = await this.page.locator('[data-testid="stat-suppliers"] .text-2xl').textContent()
    const items = await this.page.locator('[data-testid="stat-items"] .text-2xl').textContent()
    const shipments = await this.page.locator('[data-testid="stat-shipments"] .text-2xl').textContent()
    const boes = await this.page.locator('[data-testid="stat-boes"] .text-2xl').textContent()

    return {
      suppliers: parseInt(suppliers || '0'),
      items: parseInt(items || '0'),
      shipments: parseInt(shipments || '0'),
      boes: parseInt(boes || '0'),
    }
  }

  /**
   * Change timeframe filter
   */
  async changeTimeframe(timeframe: 'weekly' | 'monthly' | '3-month' | '6-month' | 'yearly') {
    await this.page.selectOption('[data-testid="timeframe-select"]', timeframe)
    await this.page.waitForTimeout(1000) // Wait for chart to update
  }

  /**
   * Change currency filter
   */
  async changeCurrency(currency: string) {
    await this.page.selectOption('[data-testid="currency-select"]', currency)
    await this.page.waitForTimeout(1000) // Wait for chart to update
  }

  /**
   * Check if charts are visible
   */
  async expectChartsVisible() {
    await this.utils.expectVisible('[data-testid="shipment-chart"]')
    await this.utils.expectVisible('[data-testid="status-chart"]')
  }

  /**
   * Navigate to a module from dashboard
   */
  async navigateToModule(moduleName: string) {
    await this.page.click(`[data-testid="nav-${moduleName.toLowerCase()}"]`)
  }
}
