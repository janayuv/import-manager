import { Page } from '@playwright/test';

import { TestUtils } from '../utils/test-utils';

export class ExpensesPage {
  private utils: TestUtils;

  constructor(private page: Page) {
    this.utils = new TestUtils(page);
  }

  /**
   * Navigate to expenses page
   */
  async goto() {
    await this.utils.navigateTo('/expenses');
  }

  /**
   * Check if expenses page is loaded
   */
  async expectLoaded() {
    await this.utils.expectVisible('h1:has-text("Manage Expenses")');
    await this.utils.expectVisible('[data-testid="expenses-tabs"]');
  }

  /**
   * Select a shipment
   */
  async selectShipment(shipmentId: string) {
    await this.page.click('[data-testid="shipment-selector"]');
    await this.page.click(`[data-value="${shipmentId}"]`);
    await this.page.waitForTimeout(500);
  }

  /**
   * Switch to a specific tab
   */
  async switchToTab(tabName: 'manage' | 'import' | 'debug') {
    await this.page.click(`[data-testid="tab-${tabName}"]`);
    await this.page.waitForTimeout(500);
  }

  /**
   * Add a new expense
   */
  async addExpense(expenseData: {
    expenseType: string;
    serviceProvider: string;
    invoiceNo: string;
    amount: string;
    remarks?: string;
  }) {
    await this.page.click('[data-testid="add-expense-button"]');

    // Fill expense form
    await this.utils.selectOption(
      '[data-testid="expense-type-select"]',
      expenseData.expenseType
    );
    await this.utils.selectOption(
      '[data-testid="service-provider-select"]',
      expenseData.serviceProvider
    );
    await this.utils.fillField(
      '[data-testid="invoice-no-input"]',
      expenseData.invoiceNo
    );
    await this.utils.fillField(
      '[data-testid="amount-input"]',
      expenseData.amount
    );

    if (expenseData.remarks) {
      await this.utils.fillField(
        '[data-testid="remarks-input"]',
        expenseData.remarks
      );
    }

    await this.page.click('[data-testid="save-expense-button"]');
    await this.utils.waitForToast('Expense added successfully');
  }

  /**
   * Edit an expense
   */
  async editExpense(
    rowIndex: number,
    newData: Partial<{
      expenseType: string;
      serviceProvider: string;
      invoiceNo: string;
      amount: string;
      remarks: string;
    }>
  ) {
    await this.utils.clickTableRow(rowIndex);
    await this.page.click('[data-testid="edit-expense-button"]');

    // Update fields
    if (newData.expenseType) {
      await this.utils.selectOption(
        '[data-testid="expense-type-select"]',
        newData.expenseType
      );
    }
    if (newData.serviceProvider) {
      await this.utils.selectOption(
        '[data-testid="service-provider-select"]',
        newData.serviceProvider
      );
    }
    if (newData.invoiceNo) {
      await this.utils.fillField(
        '[data-testid="invoice-no-input"]',
        newData.invoiceNo
      );
    }
    if (newData.amount) {
      await this.utils.fillField(
        '[data-testid="amount-input"]',
        newData.amount
      );
    }
    if (newData.remarks) {
      await this.utils.fillField(
        '[data-testid="remarks-input"]',
        newData.remarks
      );
    }

    await this.page.click('[data-testid="save-expense-button"]');
    await this.utils.waitForToast('Expense updated successfully');
  }

  /**
   * Delete an expense
   */
  async deleteExpense(rowIndex: number) {
    await this.utils.clickTableRow(rowIndex);
    await this.page.click('[data-testid="delete-expense-button"]');
    await this.utils.confirmDialog();
    await this.utils.waitForToast('Expense deleted successfully');
  }

  /**
   * Import expenses from file
   */
  async importExpenses(filePath: string) {
    await this.switchToTab('import');
    await this.utils.uploadFile('[data-testid="file-upload"]', filePath);
    await this.page.waitForTimeout(2000); // Wait for file processing
    await this.page.click('[data-testid="import-button"]');
    await this.utils.waitForToast('Successfully imported');
  }

  /**
   * Get expenses count
   */
  async getExpensesCount() {
    return await this.utils.getTableRowCount('[data-testid="expenses-table"]');
  }

  /**
   * Search expenses
   */
  async searchExpenses(searchTerm: string) {
    await this.utils.fillField('[data-testid="search-input"]', searchTerm);
    await this.page.waitForTimeout(500);
  }

  /**
   * Export expenses
   */
  async exportExpenses() {
    await this.page.click('[data-testid="export-button"]');
    await this.utils.waitForToast('Export completed');
  }
}
