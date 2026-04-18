/* eslint-disable security/detect-non-literal-fs-filename -- fixture CSV paths and Playwright download temp paths */
import fs from 'node:fs';
import path from 'node:path';

import Papa from 'papaparse';
import { expect, test, type Download, type Page } from '@playwright/test';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

const shipmentValidCsv = path.join(
  process.cwd(),
  'test-data/shipment/valid/shipment-valid.csv'
);
const invoiceBulkValidCsv = path.join(
  process.cwd(),
  'test-data/invoice/valid/invoice-bulk-valid.csv'
);
const boeValidCsv = path.join(
  process.cwd(),
  'test-data/boe/valid/boe-valid.csv'
);
const expenseImportValidCsv = path.join(
  process.cwd(),
  'test-data/expenses/valid/expense-import-valid.csv'
);

function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

async function waitForPlaywrightInvoke(page: Page) {
  await page.waitForFunction(
    () =>
      typeof (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__?: (
            cmd: string
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__ === 'function',
    { timeout: 60_000 }
  );
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(defaultUser);
  await page.locator('#password').fill(defaultPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
  await expect(
    appContent(page).getByText('Operational overview across modules')
  ).toBeVisible({ timeout: 30_000 });
}

function sidebar(page: Page) {
  return page.locator('[data-sidebar="sidebar"]');
}

async function expandNavGroup(page: Page, parentLinkName: string) {
  const root = sidebar(page);
  const row = root.locator('[data-sidebar="menu-item"]').filter({
    has: page.getByRole('link', { name: parentLinkName, exact: true }),
  });
  const subLink = row.locator('[data-sidebar="menu-sub-button"]');
  if (
    await subLink
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }
  await row.getByRole('button', { name: 'Toggle' }).click();
  await expect(subLink.first()).toBeVisible({ timeout: 5000 });
}

async function clickSidebarLink(page: Page, name: string) {
  await sidebar(page).getByRole('link', { name, exact: true }).click();
}

async function expectPageMarker(page: Page, text: string) {
  await expect(
    appContent(page).getByText(text, { exact: true }).first()
  ).toBeVisible({
    timeout: 20_000,
  });
}

function sonnerSuccess(page: Page, text: string | RegExp) {
  return page
    .locator('[data-sonner-toast][data-type="success"]')
    .filter({ hasText: text });
}

async function readDownloadText(download: Download): Promise<string> {
  const fp = await download.path();
  if (!fp) {
    throw new Error('Download did not produce a file path');
  }
  return fs.readFileSync(fp, 'utf-8');
}

function parseCsv<T extends Record<string, unknown>>(csvText: string): T[] {
  const parsed = Papa.parse<T>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(e => e.message).join('; '));
  }
  return parsed.data;
}

function parseInrCell(s: string): number {
  const cleaned = s.replace(/[₹,\s]/g, '').trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

test.describe.configure({ mode: 'serial' });

test.describe('UI data integrity (import vs export)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await waitForPlaywrightInvoke(page);
    await page.evaluate(async () => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            cmd: string
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      await inv('reset_test_database');
    });
  });

  test('shipment: import then export preserves row count and key fields', async ({
    page,
  }) => {
    const importText = fs.readFileSync(shipmentValidCsv, 'utf-8');
    const importRows = parseCsv<Record<string, string>>(importText);
    expect(importRows.length).toBeGreaterThan(0);

    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');

    const content = appContent(page);
    await expect(content.getByText('Showing 1 of 1 shipments')).toBeVisible({
      timeout: 20_000,
    });

    const importChooser = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import' }).click();
    (await importChooser).setFiles(shipmentValidCsv);
    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 20_000,
    });

    const expectedTotal = 1 + importRows.length;
    await expect(
      content.getByText(
        `Showing ${expectedTotal} of ${expectedTotal} shipments`
      )
    ).toBeVisible({ timeout: 20_000 });

    const exportDl = page.waitForEvent('download');
    await content.getByRole('button', { name: 'Export CSV' }).click();
    const exported = await exportDl;
    expect(exported.suggestedFilename()).toMatch(/shipment/i);

    const exportText = await readDownloadText(exported);
    const exportRows = parseCsv<Record<string, string>>(exportText);
    expect(exportRows.length).toBe(expectedTotal);

    const byInvoice = new Map(
      exportRows.map(r => [r.invoiceNumber?.trim() ?? '', r])
    );

    for (const imp of importRows) {
      const inv = imp.invoiceNumber?.trim();
      expect(inv).toBeTruthy();
      const row = byInvoice.get(inv);
      expect(row, `missing export row for ${inv}`).toBeTruthy();
      if (!row) continue;
      // supplierId in import maps to supplierName on export (label may be case-formatted by settings)
      expect(row.supplierName?.trim().toLowerCase()).toBe('seed supplier');
      // "shipment date" in UI is stored as invoiceDate on shipments
      expect(row.invoiceDate?.trim()).toBe(imp.invoiceDate?.trim());
      expect(row.supplierId).toBeUndefined();
    }
  });

  test('invoice: bulk import then line export matches quantities and totals', async ({
    page,
  }) => {
    const importText = fs.readFileSync(invoiceBulkValidCsv, 'utf-8');
    const importRows = parseCsv<Record<string, string>>(importText);
    expect(importRows.length).toBe(2);

    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoice Details');

    const content = appContent(page);
    await expect(content.getByText('Showing 0 invoices')).toBeVisible({
      timeout: 20_000,
    });

    const fc = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import Bulk' }).click();
    (await fc).setFiles(invoiceBulkValidCsv);
    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 20_000,
    });

    await expect(content.getByText('Showing 2 invoices')).toBeVisible({
      timeout: 20_000,
    });

    await content.getByRole('button', { name: 'Open menu' }).first().click();
    await page.getByRole('menuitem', { name: /View/i }).click();

    await expect(
      page.getByRole('dialog').filter({ hasText: /View Invoice/i })
    ).toBeVisible({ timeout: 10_000 });

    const exportDl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export Items/i }).click();
    const downloaded = await exportDl;
    expect(downloaded.suggestedFilename()).toMatch(/items\.csv$/i);

    const exportText = await readDownloadText(downloaded);
    const exportRows = parseCsv<Record<string, string>>(exportText);
    expect(exportRows.length).toBe(importRows.length);

    const byPart = new Map(
      exportRows.map(r => [(r['Part No'] ?? r.partNumber ?? '').trim(), r])
    );

    let sumLine = 0;
    for (const imp of importRows) {
      const pn = imp.itemPartNumber?.trim();
      const row = byPart.get(pn);
      expect(row, `missing export for part ${pn}`).toBeTruthy();
      if (!row) continue;
      const qty = Number.parseFloat(String(row.Qty ?? row.quantity ?? '0'));
      const unit = Number.parseFloat(
        String(row['Unit Price'] ?? row.unitPrice ?? '0')
      );
      const lineTotal = Number.parseFloat(
        String(row['Line Total'] ?? row.lineTotal ?? '0')
      );
      expect(qty).toBeCloseTo(Number.parseFloat(imp.quantity), 5);
      expect(unit).toBeCloseTo(Number.parseFloat(imp.unitPrice), 5);
      expect(lineTotal).toBeCloseTo(qty * unit, 2);
      sumLine += lineTotal;
    }
    expect(sumLine).toBeCloseTo(12 * 125.5 + 4 * 88, 2);
  });

  test('BOE: import then export preserves identifiers and numeric fields', async ({
    page,
  }) => {
    const importText = fs.readFileSync(boeValidCsv, 'utf-8');
    const importRows = parseCsv<Record<string, string>>(importText);
    expect(importRows.length).toBe(2);

    await expandNavGroup(page, 'BOE');
    await clickSidebarLink(page, 'View All BOE');
    await expectPageMarker(page, 'Bill of Entry Details');

    const content = appContent(page);
    const fc = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import' }).click();
    (await fc).setFiles(boeValidCsv);
    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 20_000,
    });

    for (const row of importRows) {
      await expect(content.getByText(row.beNumber.trim())).toBeVisible({
        timeout: 15_000,
      });
    }

    const exportDl = page.waitForEvent('download');
    await content.getByRole('button', { name: 'Export' }).click();
    const downloaded = await exportDl;
    expect(downloaded.suggestedFilename()).toMatch(/boe/i);

    const exportText = await readDownloadText(downloaded);
    const exportRows = parseCsv<Record<string, string>>(exportText);
    expect(exportRows.length).toBe(importRows.length);

    const byBe = new Map(exportRows.map(r => [(r.beNumber ?? '').trim(), r]));

    for (const imp of importRows) {
      const be = imp.beNumber.trim();
      const ex = byBe.get(be);
      expect(ex, `missing export for ${be}`).toBeTruthy();
      if (!ex) continue;
      expect(
        Number.parseFloat(String(ex.totalAssessmentValue ?? '0'))
      ).toBeCloseTo(
        Number.parseFloat(String(imp.totalAssessmentValue ?? '0')),
        2
      );
      expect(Number.parseFloat(String(ex.dutyPaid ?? '0'))).toBeCloseTo(
        Number.parseFloat(String(imp.dutyPaid ?? '0')),
        2
      );
      expect((ex.location ?? '').trim()).toBe((imp.location ?? '').trim());
    }
  });

  test('expenses: import then detailed report CSV matches invoice numbers and totals', async ({
    page,
  }) => {
    const importText = fs.readFileSync(expenseImportValidCsv, 'utf-8');
    const importRows = parseCsv<Record<string, string>>(importText);
    expect(importRows.length).toBe(2);
    const expectedTotalSum = importRows.reduce(
      (s, r) => s + Number.parseFloat(r['Total Amount'] ?? '0'),
      0
    );

    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Manage Expenses');
    await expectPageMarker(page, 'Manage Expenses');

    await expect(page.getByText('Loading shipments...')).toBeHidden({
      timeout: 20_000,
    });

    await page.getByRole('tab', { name: 'Import Expenses' }).click();
    const importSection = appContent(page);
    const shipmentCombo = importSection.getByRole('combobox').first();
    await shipmentCombo.click();
    await page.locator('[data-slot="command-item"]').first().click();

    await importSection
      .locator('#file-upload')
      .setInputFiles(expenseImportValidCsv);
    await expect(
      importSection.getByRole('button', { name: /Import \d+ Expenses/i })
    ).toBeVisible({ timeout: 15_000 });
    await importSection
      .getByRole('button', { name: /Import \d+ Expenses/i })
      .click();
    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: 25_000,
    });

    await page.getByRole('tab', { name: 'Manage Expenses' }).click();
    const manage = appContent(page);
    await manage.getByRole('combobox').first().click();
    await page.locator('[data-slot="command-item"]').first().click();

    await manage.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(sonnerSuccess(page, 'Report Generated')).toBeVisible({
      timeout: 25_000,
    });

    const exportDl = page.waitForEvent('download');
    await manage.getByRole('button', { name: 'CSV', exact: true }).click();
    const downloaded = await exportDl;
    expect(downloaded.suggestedFilename()).toMatch(/expense|report|csv/i);

    const exportText = await readDownloadText(downloaded);
    const exportRows = parseCsv<Record<string, string>>(exportText);
    expect(exportRows.length).toBe(importRows.length);

    const invSet = new Set(importRows.map(r => (r['Invoice No'] ?? '').trim()));
    for (const r of exportRows) {
      const inv = (r['Invoice Number'] ?? '').trim();
      expect(invSet.has(inv)).toBe(true);
    }

    const shipmentRef = (exportRows[0]?.['Shipment Number'] ?? '').trim();
    expect(shipmentRef).toMatch(/TEST-INV-SHP-001/);

    let sumExported = 0;
    for (const r of exportRows) {
      sumExported += parseInrCell(String(r['Total (₹)'] ?? '0'));
    }
    expect(sumExported).toBeCloseTo(expectedTotalSum, 2);
  });
});
