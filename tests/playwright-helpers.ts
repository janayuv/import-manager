import type { Buffer } from 'node:buffer';

import { expect, type Page } from '@playwright/test';

const E2E_USERNAME = process.env.E2E_USERNAME ?? 'Jana';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'inzi@123$%';

/** Main outlet from `AppLayout` (page content below site header). */
export function appContent(page: Page) {
  return page.getByRole('main');
}

/** Industrial Console primary sidebar (`app-sidebar.tsx`). */
export function primarySidebar(page: Page) {
  return page.locator('aside.im-sidebar');
}

export async function expectLoggedInDashboard(page: Page) {
  await expect(page.getByTestId('dashboard-page')).toBeVisible({
    timeout: 30_000,
  });
}

/** Stable selectors: `#username` / `#password` / `data-testid=login-submit`. */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(E2E_USERNAME);
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL('/', { timeout: 30_000 });
  await expectLoggedInDashboard(page);
}

/**
 * Admin login with a clean stub DB. Reset runs on `/login` after `invoke` is wired so
 * pages reflect seeded Playwright data.
 */
export async function loginWithFreshDatabase(page: Page) {
  await page.goto('/login');
  await waitForPlaywrightInvoke(page);
  await resetPlaywrightDatabase(page);
  await reloadPlaywrightPageForStubHydrate(page);
  await page.locator('#username').fill(E2E_USERNAME);
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL('/', { timeout: 30_000 });
  await expectLoggedInDashboard(page);
}

export async function expandSidebarGroup(page: Page, parentLinkName: string) {
  const root = primarySidebar(page);
  const parentRow = root.locator('.im-sb-row').filter({
    has: page.getByRole('link', { name: parentLinkName, exact: true }),
  });
  const subLinks = parentRow.locator('.im-sb-submenu .im-sb-sublink');
  if (
    await subLinks
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }
  await parentRow
    .getByRole('link', { name: parentLinkName, exact: true })
    .click();
  await expect(subLinks.first()).toBeVisible({ timeout: 5000 });
}

export async function clickSidebarLink(page: Page, name: string) {
  await primarySidebar(page).getByRole('link', { name, exact: true }).click();
}

export function shipmentStatusBar(page: Page) {
  return appContent(page).locator('.im-table-statusbar');
}

export async function expectPageMarker(page: Page, text: string) {
  const main = appContent(page);
  const title = main.locator('h1').filter({ hasText: text });
  if ((await title.count()) > 0) {
    await expect(title.first()).toBeVisible({ timeout: 20_000 });
    return;
  }
  await expect(main.getByText(text).first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function clickPageHeaderButton(page: Page, name: string) {
  await appContent(page)
    .locator('.im-page-header__actions')
    .getByRole('button', { name })
    .click();
}

export async function clickExpensesTab(
  page: Page,
  name: 'Manage Expenses' | 'Import Expenses'
) {
  await appContent(page).getByRole('button', { name, exact: true }).click();
}

export async function expectShipmentTableReady(page: Page) {
  await expect(shipmentStatusBar(page)).toBeVisible({ timeout: 20_000 });
}

export async function expectShipmentTotalCount(page: Page, count: number) {
  await expect(shipmentStatusBar(page).locator('strong').first()).toHaveText(
    String(count),
    { timeout: 20_000 }
  );
}

export function invoiceStatusBar(page: Page) {
  return appContent(page).locator('.im-table-statusbar');
}

/** Invoice list is line-level; status bar Total matches loaded row count (not header badge). */
export async function expectInvoiceRecordBadge(page: Page, count: number) {
  await expect(invoiceStatusBar(page).locator('strong').first()).toHaveText(
    String(count),
    { timeout: 20_000 }
  );
}

export async function expectSupplierRecordBadge(page: Page, count: number) {
  await expect(appContent(page).locator('.im-record-badge')).toHaveText(
    `${count} RECORDS`,
    { timeout: 20_000 }
  );
}

/** @deprecated Use `primarySidebar` — legacy shadcn sidebar selector. */
export function sidebar(page: Page) {
  return primarySidebar(page);
}

/** @deprecated Use `expandSidebarGroup`. */
export async function expandNavGroup(page: Page, parentLinkName: string) {
  await expandSidebarGroup(page, parentLinkName);
}

export async function waitForPlaywrightInvoke(page: Page) {
  await page.waitForFunction(
    () =>
      typeof (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__?: (
            cmd: string,
            args?: Record<string, unknown>
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__ === 'function',
    { timeout: 60_000 }
  );
}

export async function resetPlaywrightDatabase(page: Page) {
  await page.evaluate(async () => {
    const inv = (
      window as unknown as {
        __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
          cmd: string,
          args?: Record<string, unknown>
        ) => Promise<unknown>;
      }
    ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
    await inv('reset_test_database');
  });
}

/** Call after `resetPlaywrightDatabase` on `/login` so the stub module re-runs `tryHydrateLiveDbFromSession`. */
export async function reloadPlaywrightPageForStubHydrate(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPlaywrightInvoke(page);
}

export type BridgeFileInputPayload =
  | string
  | { name: string; mimeType: string; buffer: Buffer };

/**
 * `openTextFile` in `tauri-bridge` appends a temporary `<input type="file">` to
 * `document.body` and calls `click()`. Playwright's `filechooser` event is
 * unreliable for that path in Firefox; set files on the input directly instead.
 */
export async function setFilesOnBridgeFileInput(
  page: Page,
  file: BridgeFileInputPayload
): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll('input[type="file"]').length > 0,
    { timeout: 10_000 }
  );
  const input = page.locator('input[type="file"]');
  if (typeof file === 'string') {
    await input.last().setInputFiles(file);
  } else {
    await input.last().setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
  }
}
