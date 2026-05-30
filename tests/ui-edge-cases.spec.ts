import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import {
  appContent,
  clickSidebarLink,
  expandNavGroup,
  clickExpensesTab,
  clickPageHeaderButton,
  expectInvoiceRecordBadge,
  expectPageMarker,
  expectShipmentTableReady,
  loginWithFreshDatabase,
  setFilesOnBridgeFileInput,
} from './playwright-helpers';

const shipmentInvalidWrongHeaders = path.join(
  process.cwd(),
  'test-data/shipment/invalid/shipment-invalid-wrong-headers.csv'
);
const invoiceBulkUnknownShipment = path.join(
  process.cwd(),
  'test-data/invoice/invalid/invoice-bulk-unknown-shipment-item.csv'
);
const itemMasterDuplicatePartNumbers = path.join(
  process.cwd(),
  'test-data/item-master/edge/item-master-duplicate-partNumber.csv'
);
const boeInvalidWrongHeaders = path.join(
  process.cwd(),
  'test-data/boe/invalid/boe-invalid-wrong-headers.csv'
);
const expenseImportHeaderOnly = path.join(
  process.cwd(),
  'test-data/expenses/invalid/expense-import-only-header.csv'
);

function sonnerError(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="error"]')
    .filter({ hasText: text });
}

function sonnerWarning(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="warning"]')
    .filter({ hasText: text });
}

function sonnerInfo(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="info"]')
    .filter({ hasText: text });
}

test.describe.configure({ mode: 'serial' });

test.describe('UI edge cases and import failures', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithFreshDatabase(page);
  });

  test('shipment: invalid CSV headers show error toast and list unchanged', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipments');

    const beforeCount = await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<Array<unknown>>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      const rows = await inv('get_shipments');
      return rows.length;
    });
    await expectShipmentTableReady(page);

    await clickPageHeaderButton(page, 'Import');
    await setFilesOnBridgeFileInput(page, shipmentInvalidWrongHeaders);

    await expect(
      sonnerError(
        page,
        /Invalid Shipment Import|invalid shipment import|Invalid file type detected/i
      )
    ).toBeVisible({ timeout: 20_000 });

    const afterCount = await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<Array<unknown>>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      const rows = await inv('get_shipments');
      return rows.length;
    });
    expect(afterCount).toBe(beforeCount);
  });

  test('invoice: unknown shipment reference shows validation warning and count unchanged', async ({
    page,
  }) => {
    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoices');

    await expectInvoiceRecordBadge(page, 0);

    await clickPageHeaderButton(page, 'Import Bulk');
    await setFilesOnBridgeFileInput(page, invoiceBulkUnknownShipment);

    await expect(
      sonnerWarning(page, /Skipping row: Shipment with invoice number/i)
    ).toBeVisible({ timeout: 20_000 });
    await expect(sonnerInfo(page, /No Valid Invoices/i)).toBeVisible({
      timeout: 15_000,
    });

    await expectInvoiceRecordBadge(page, 0);
  });

  test('item master: duplicate part numbers in one file show warning and import once', async ({
    page,
  }) => {
    await clickSidebarLink(page, 'Item Master');
    await expectPageMarker(page, 'Item Master');

    const content = appContent(page);
    await content.getByRole('button', { name: 'Import' }).click();
    await setFilesOnBridgeFileInput(page, itemMasterDuplicatePartNumbers);

    await expect(
      sonnerWarning(page, /duplicate items were skipped/i)
    ).toBeVisible({ timeout: 20_000 });

    await expect(content.getByText('IMP-DUP-001', { exact: true })).toHaveCount(
      1
    );
  });

  test('BOE: malformed CSV headers show error toast and no rows added', async ({
    page,
  }) => {
    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'View All BOE');
    await expectPageMarker(page, 'Bill of Entry');

    await clickPageHeaderButton(page, 'Import');
    await setFilesOnBridgeFileInput(page, boeInvalidWrongHeaders);

    await expect(sonnerError(page, /Import Failed/i)).toBeVisible({
      timeout: 20_000,
    });

    const boeCount = await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      const list = (await inv('get_boes')) as unknown[];
      return list.length;
    });
    expect(boeCount).toBe(0);
  });

  test('expenses: CSV missing data rows shows validation warning', async ({
    page,
  }) => {
    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Manage Expenses');
    await expectPageMarker(page, 'Manage Expenses');

    await expect(page.getByText('Loading shipments...')).toBeHidden({
      timeout: 20_000,
    });

    await clickExpensesTab(page, 'Import Expenses');

    const importSection = appContent(page);
    const fileInput = importSection.locator('#file-upload');
    await fileInput.setInputFiles(expenseImportHeaderOnly);

    await expect(sonnerWarning(page, /Expense import validation/i)).toBeVisible(
      { timeout: 20_000 }
    );
    await expect(importSection.getByText(/Validation Errors/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
