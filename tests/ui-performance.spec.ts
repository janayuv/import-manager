import { Buffer } from 'node:buffer';
/* eslint-disable security/detect-non-literal-fs-filename -- Playwright download paths under test runner temp */
import fs from 'node:fs';

import Papa from 'papaparse';
import { expect, test, type Page } from '@playwright/test';

import { appendPerformanceMetric } from './performance-metrics';
import {
  reloadPlaywrightPageForStubHydrate,
  resetPlaywrightDatabase,
  waitForPlaywrightInvoke,
} from './playwright-helpers';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

/** Must stay within CI/local budget; stub backend is fast, UI parse/render dominates. */
const SHIPMENT_IMPORT_MAX_MS = 10_000;
const INVOICE_IMPORT_MAX_MS = 25_000;
const EXPENSE_FLOW_MAX_MS = 35_000;

const LARGE_SHIPMENT_COUNT = 1000;
const LARGE_INVOICE_LINE_COUNT = 600;
const LARGE_EXPENSE_COUNT = 200;

function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

async function login(page: Page) {
  await page.goto('/login');
  await waitForPlaywrightInvoke(page);
  await resetPlaywrightDatabase(page);
  await reloadPlaywrightPageForStubHydrate(page);
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

function buildLargeShipmentCsv(rowCount: number): Buffer {
  const header =
    'supplierId,invoiceNumber,invoiceDate,goodsCategory,invoiceValue,invoiceCurrency,incoterm,shipmentMode,shipmentType,blAwbNumber,blAwbDate,vesselName,containerNumber,grossWeightKg,etd,eta,status,dateOfDelivery';
  const lines: string[] = [header];
  for (let i = 1; i <= rowCount; i += 1) {
    const n = String(i).padStart(6, '0');
    lines.push(
      `Sup-001,PERF-SHIP-${n},2024-07-01,Electronics,1000,INR,FOB,FCL,40FT,BL-PERF-${n},2024-07-02,VesselPerf,CONT-PERF-${n},100,2024-07-03,2024-07-20,in-transit,`
    );
  }
  return Buffer.from(lines.join('\n'), 'utf-8');
}

function buildLargeInvoiceBulkCsv(lineCount: number): Buffer {
  const header = 'shipmentInvoiceNumber,itemPartNumber,quantity,unitPrice';
  const lines: string[] = [header];
  for (let i = 0; i < lineCount; i += 1) {
    const part = i % 2 === 0 ? 'TEST-PART-INV-001' : 'TEST-PART-INV-002';
    lines.push(`TEST-INV-SHP-001,${part},1,10.00`);
  }
  return Buffer.from(lines.join('\n'), 'utf-8');
}

function buildLargeExpenseCsv(rowCount: number): Buffer {
  const header =
    'Expense Type,Service Provider,Invoice No,Invoice Date,Amount,CGST Amount,SGST Amount,IGST Amount,TDS Amount,Total Amount,Remarks';
  const lines: string[] = [header];
  for (let i = 1; i <= rowCount; i += 1) {
    const n = String(i).padStart(5, '0');
    const isCustoms = i % 2 === 1;
    if (isCustoms) {
      lines.push(
        `Customs Clearance,ABC Logistics Ltd,PERF-EXP-${n},2024-06-15,100.00,9.00,9.00,0.00,5.00,123.00,perf row ${n}`
      );
    } else {
      lines.push(
        `Freight Charges,XYZ Customs Brokers,PERF-EXP-${n},2024-06-16,50.00,0.00,0.00,9.00,2.50,61.50,perf row ${n}`
      );
    }
  }
  return Buffer.from(lines.join('\n'), 'utf-8');
}

function sumExpenseImportTotals(csvText: string): number {
  const rows = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  }).data;
  let s = 0;
  for (const r of rows) {
    s += Number.parseFloat(r['Total Amount'] ?? '0') || 0;
  }
  return s;
}

function parseInrCell(s: string): number {
  const cleaned = s.replace(/[₹,\s]/g, '').trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

test.describe.configure({ mode: 'serial' });

test.describe('UI performance (large datasets)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test(`large shipment import (${LARGE_SHIPMENT_COUNT} rows) completes within budget and updates count`, async ({
    page,
  }, testInfo) => {
    const csv = buildLargeShipmentCsv(LARGE_SHIPMENT_COUNT);

    await clickSidebarLink(page, 'Shipment');
    await expectPageMarker(page, 'Shipment Management');

    const content = appContent(page);
    await expect(content.getByText(/Showing 1 of 1 shipments/)).toBeVisible({
      timeout: 20_000,
    });

    await content.getByRole('button', { name: 'Table' }).click();

    const importChooser = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import' }).click();
    const fc = await importChooser;

    const startMs = await page.evaluate(() => performance.now());
    await fc.setFiles({
      name: `perf-shipments-${LARGE_SHIPMENT_COUNT}.csv`,
      mimeType: 'text/csv',
      buffer: csv,
    });

    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: SHIPMENT_IMPORT_MAX_MS + 5000,
    });
    const endMs = await page.evaluate(() => performance.now());
    const elapsed = endMs - startMs;
    appendPerformanceMetric({
      testName: `ui-performance/shipment-import-${LARGE_SHIPMENT_COUNT}-rows`,
      durationMs: elapsed,
    });
    await testInfo.attach('perf-shipment-import-ms.txt', {
      body: `${Math.round(elapsed)}`,
      contentType: 'text/plain',
    });
    expect(
      elapsed,
      `shipment import took ${elapsed.toFixed(0)} ms (max ${SHIPMENT_IMPORT_MAX_MS} ms)`
    ).toBeLessThan(SHIPMENT_IMPORT_MAX_MS);

    const expected = 1 + LARGE_SHIPMENT_COUNT;
    await expect(
      content.getByText(
        new RegExp(`Showing ${expected} of ${expected} shipments`)
      )
    ).toBeVisible({ timeout: 30_000 });
  });

  test(`large invoice bulk import (${LARGE_INVOICE_LINE_COUNT} lines) within budget; UI stays interactive`, async ({
    page,
  }, testInfo) => {
    const csv = buildLargeInvoiceBulkCsv(LARGE_INVOICE_LINE_COUNT);

    await expandNavGroup(page, 'Invoice');
    await clickSidebarLink(page, 'Invoices');
    await expectPageMarker(page, 'Invoice Details');

    const content = appContent(page);
    await expect(content.getByText('Showing 0 invoices')).toBeVisible({
      timeout: 20_000,
    });

    const importChooser = page.waitForEvent('filechooser');
    await content.getByRole('button', { name: 'Import Bulk' }).click();
    const fc = await importChooser;

    const startMs = await page.evaluate(() => performance.now());
    await fc.setFiles({
      name: `perf-invoices-${LARGE_INVOICE_LINE_COUNT}.csv`,
      mimeType: 'text/csv',
      buffer: csv,
    });

    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: INVOICE_IMPORT_MAX_MS + 10_000,
    });
    const endMs = await page.evaluate(() => performance.now());
    const elapsed = endMs - startMs;
    appendPerformanceMetric({
      testName: `ui-performance/invoice-bulk-import-${LARGE_INVOICE_LINE_COUNT}-lines`,
      durationMs: elapsed,
    });
    await testInfo.attach('perf-invoice-import-ms.txt', {
      body: `${Math.round(elapsed)}`,
      contentType: 'text/plain',
    });
    expect(
      elapsed,
      `invoice import took ${elapsed.toFixed(0)} ms (max ${INVOICE_IMPORT_MAX_MS} ms)`
    ).toBeLessThan(INVOICE_IMPORT_MAX_MS);

    await expect(
      content.getByText(
        new RegExp(`Showing ${LARGE_INVOICE_LINE_COUNT} invoices`)
      )
    ).toBeVisible({ timeout: 30_000 });

    const tUi0 = await page.evaluate(() => performance.now());
    await content
      .locator('div')
      .filter({ has: page.getByText('Status:', { exact: true }) })
      .getByRole('combobox')
      .click({ timeout: 5000 });
    await page.getByRole('option', { name: /^Draft$/i }).click();
    const tUi1 = await page.evaluate(() => performance.now());
    expect(
      tUi1 - tUi0,
      'status filter interaction should stay responsive'
    ).toBeLessThan(5000);
  });

  test(`large expense import (${LARGE_EXPENSE_COUNT} rows): totals + export match import`, async ({
    page,
  }, testInfo) => {
    const csvBuffer = buildLargeExpenseCsv(LARGE_EXPENSE_COUNT);
    const csvText = csvBuffer.toString('utf-8');
    const expectedTotalSum = sumExpenseImportTotals(csvText);

    await expandNavGroup(page, 'Expenses');
    await clickSidebarLink(page, 'Manage Expenses');
    await expectPageMarker(page, 'Manage Expenses');

    await expect(page.getByText('Loading shipments...')).toBeHidden({
      timeout: 20_000,
    });

    const flowStart = await page.evaluate(() => performance.now());

    await page.getByRole('tab', { name: 'Import Expenses' }).click();
    const importSection = appContent(page);
    await importSection.getByRole('combobox').first().click();
    await page.locator('[data-slot="command-item"]').first().click();

    await importSection.locator('#file-upload').setInputFiles({
      name: `perf-expenses-${LARGE_EXPENSE_COUNT}.csv`,
      mimeType: 'text/csv',
      buffer: csvBuffer,
    });
    await expect(
      importSection.getByRole('button', { name: /Import \d+ Expenses/i })
    ).toBeVisible({ timeout: 20_000 });
    const expenseImportStart = await page.evaluate(() => performance.now());
    await importSection
      .getByRole('button', { name: /Import \d+ Expenses/i })
      .click();
    await expect(sonnerSuccess(page, 'Import Complete')).toBeVisible({
      timeout: EXPENSE_FLOW_MAX_MS,
    });
    const expenseImportEnd = await page.evaluate(() => performance.now());
    appendPerformanceMetric({
      testName: `ui-performance/expense-import-${LARGE_EXPENSE_COUNT}-rows`,
      durationMs: expenseImportEnd - expenseImportStart,
    });

    await page.getByRole('tab', { name: 'Manage Expenses' }).click();
    const manage = appContent(page);
    await manage.getByRole('combobox').first().click();
    await page.locator('[data-slot="command-item"]').first().click();

    await manage.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(sonnerSuccess(page, 'Report Generated')).toBeVisible({
      timeout: EXPENSE_FLOW_MAX_MS,
    });
    const exportStart = await page.evaluate(() => performance.now());
    const downloadPromise = page.waitForEvent('download');
    await manage.getByRole('button', { name: 'CSV', exact: true }).click();
    const dl = await downloadPromise;
    expect(dl.suggestedFilename()).toMatch(/expense|report|csv/i);
    const exportPath = await dl.path();
    if (!exportPath) throw new Error('download path missing');
    const exportText = fs.readFileSync(exportPath, 'utf-8');
    const exportEnd = await page.evaluate(() => performance.now());
    appendPerformanceMetric({
      testName: `ui-performance/expense-report-csv-export-${LARGE_EXPENSE_COUNT}-rows`,
      durationMs: exportEnd - exportStart,
    });

    const flowEnd = await page.evaluate(() => performance.now());
    const elapsed = flowEnd - flowStart;
    appendPerformanceMetric({
      testName: `ui-performance/expense-flow-import-report-export-${LARGE_EXPENSE_COUNT}-rows`,
      durationMs: elapsed,
    });
    await testInfo.attach('perf-expense-flow-ms.txt', {
      body: `${Math.round(elapsed)}`,
      contentType: 'text/plain',
    });
    expect(
      elapsed,
      `expense flow took ${elapsed.toFixed(0)} ms (max ${EXPENSE_FLOW_MAX_MS} ms)`
    ).toBeLessThan(EXPENSE_FLOW_MAX_MS);

    const exportRows = Papa.parse<Record<string, string>>(exportText, {
      header: true,
      skipEmptyLines: true,
    }).data;
    expect(exportRows.length).toBe(LARGE_EXPENSE_COUNT);

    let exportedSum = 0;
    for (const r of exportRows) {
      exportedSum += parseInrCell(String(r['Total (₹)'] ?? '0'));
    }
    expect(exportedSum).toBeCloseTo(expectedTotalSum, 1);
  });
});
