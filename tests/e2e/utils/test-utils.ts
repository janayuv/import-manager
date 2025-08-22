import { Page, expect } from '@playwright/test'

export class TestUtils {
  constructor(private page: Page) {}

  /**
   * Wait for the app to be fully loaded
   */
  async waitForAppLoad() {
    await this.page.waitForLoadState('networkidle')
    // Wait for any loading spinners to disappear
    await this.page.waitForSelector('[data-testid="loading"]', { state: 'hidden', timeout: 10000 }).catch(() => {})
  }

  /**
   * Login to the application
   */
  async login() {
    // Skip login for now since the app doesn't have authentication
    await this.page.goto('/')
    await this.waitForAppLoad()
  }

  /**
   * Navigate to a specific page
   */
  async navigateTo(path: string) {
    await this.page.goto(path)
    await this.waitForAppLoad()
  }

  /**
   * Wait for toast notification
   */
  async waitForToast(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    const toastSelector = `[data-sonner-toast][data-type="${type}"]`
    await this.page.waitForSelector(toastSelector, { timeout: 5000 })
    await expect(this.page.locator(toastSelector)).toContainText(message)
  }

  /**
   * Fill a form field with validation
   */
  async fillField(selector: string, value: string) {
    await this.page.fill(selector, value)
    // Wait for any validation to complete
    await this.page.waitForTimeout(100)
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(selector: string, value: string) {
    await this.page.click(selector)
    await this.page.click(`[data-value="${value}"]`)
  }

  /**
   * Upload a file
   */
  async uploadFile(selector: string, filePath: string) {
    await this.page.setInputFiles(selector, filePath)
  }

  /**
   * Check if element is visible
   */
  async expectVisible(selector: string) {
    await expect(this.page.locator(selector)).toBeVisible()
  }

  /**
   * Check if element contains text
   */
  async expectContainsText(selector: string, text: string) {
    await expect(this.page.locator(selector)).toContainText(text)
  }

  /**
   * Wait for table to load data
   */
  async waitForTableData(selector: string = '[data-testid="data-table"]') {
    await this.page.waitForSelector(`${selector} tbody tr`, { timeout: 10000 })
  }

  /**
   * Get table row count
   */
  async getTableRowCount(selector: string = '[data-testid="data-table"]') {
    const rows = await this.page.locator(`${selector} tbody tr`).count()
    return rows
  }

  /**
   * Click on a table row by index
   */
  async clickTableRow(index: number, selector: string = '[data-testid="data-table"]') {
    await this.page.locator(`${selector} tbody tr`).nth(index).click()
  }

  /**
   * Confirm a dialog
   */
  async confirmDialog() {
    await this.page.click('[data-testid="confirm-dialog"] button:has-text("Confirm")')
  }

  /**
   * Cancel a dialog
   */
  async cancelDialog() {
    await this.page.click('[data-testid="confirm-dialog"] button:has-text("Cancel")')
  }
}
