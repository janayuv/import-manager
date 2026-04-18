import { expect, test, type Page } from '@playwright/test';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

/** Main scrollable region inside `AppLayout`. */
function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

/** Card panel from the shared `Card` primitive (`data-slot="card"`). */
function settingsCard(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: title }).first();
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

/**
 * Clears persisted app settings once before login. Do **not** clear inside
 * `addInitScript` — that runs on every document load (including reload) and
 * would erase values we are testing for persistence.
 */
async function loginWithFreshSettings(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => {
    try {
      localStorage.removeItem('import-manager-settings');
    } catch {
      /* ignore */
    }
  });
  await page.locator('#username').fill(defaultUser);
  await page.locator('#password').fill(defaultPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
  await expect(
    appContent(page).getByText('Operational overview across modules')
  ).toBeVisible({ timeout: 30_000 });
}

async function gotoSettings(page: Page) {
  await page.goto('/settings');
  await expect(
    appContent(page).getByRole('heading', { name: 'Settings' })
  ).toBeVisible({ timeout: 20_000 });
}

/** Radix `Select`: open trigger inside the card, then pick a portaled option. */
async function selectOptionInCard(
  page: Page,
  cardTitle: string,
  optionLabel: string
) {
  const card = settingsCard(page, cardTitle);
  await card.getByRole('combobox').click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

async function clickSaveSettings(page: Page) {
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.getByText('Settings saved successfully')).toBeVisible({
    timeout: 10_000,
  });
}

/** Theme dropdown lives in `SiteHeader` (not the Settings form); mode persists under `import-manager-theme`. */
async function setThemeModeFromHeader(
  page: Page,
  mode: 'Light' | 'Dark' | 'System'
) {
  await page
    .locator('header')
    .getByRole('button', { name: 'Toggle theme' })
    .first()
    .click();
  await page.getByRole('menuitem', { name: mode }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Settings page — formatting persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('isAuthenticated', 'true');
      } catch {
        /* ignore */
      }
    });
  });

  test('number and date formatting persist after save and full reload', async ({
    page,
  }) => {
    await loginWithFreshSettings(page);
    await gotoSettings(page);

    await selectOptionInCard(page, 'Number Formatting', '3');
    await settingsCard(page, 'Number Formatting')
      .getByPlaceholder('₹')
      .fill('€');

    await selectOptionInCard(page, 'Date Formatting', 'YYYY-MM-DD');

    await clickSaveSettings(page);

    await expect(
      settingsCard(page, 'Number Formatting').getByRole('combobox')
    ).toContainText('3', { timeout: 5000 });
    await expect(
      settingsCard(page, 'Number Formatting').getByPlaceholder('₹')
    ).toHaveValue('€');
    await expect(
      settingsCard(page, 'Date Formatting').getByRole('combobox')
    ).toContainText('YYYY-MM-DD');

    await page.reload();
    await expect(
      appContent(page).getByRole('heading', { name: 'Settings' })
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      settingsCard(page, 'Number Formatting').getByRole('combobox')
    ).toContainText('3');
    await expect(
      settingsCard(page, 'Number Formatting').getByPlaceholder('₹')
    ).toHaveValue('€');
    await expect(
      settingsCard(page, 'Date Formatting').getByRole('combobox')
    ).toContainText('YYYY-MM-DD');

    const stored = await page.evaluate(() =>
      localStorage.getItem('import-manager-settings')
    );
    expect(
      stored,
      'settings should exist in localStorage after reload'
    ).toBeTruthy();
    const parsed = JSON.parse(stored!) as {
      numberFormat: { decimalPlaces: number; currencySymbol: string };
      dateFormat: { format: string };
    };
    expect(parsed.numberFormat.decimalPlaces).toBe(3);
    expect(parsed.numberFormat.currencySymbol).toBe('€');
    expect(parsed.dateFormat.format).toBe('YYYY-MM-DD');
  });

  test('multiple settings in one session persist together after reload', async ({
    page,
  }) => {
    await loginWithFreshSettings(page);
    await gotoSettings(page);

    await selectOptionInCard(page, 'Number Formatting', '1');
    await settingsCard(page, 'Number Formatting')
      .getByPlaceholder('₹')
      .fill('£');
    await selectOptionInCard(page, 'Date Formatting', 'MM/DD/YYYY');
    await selectOptionInCard(page, 'Text Formatting', 'UPPERCASE');

    await clickSaveSettings(page);

    await page.reload();
    await expect(
      appContent(page).getByRole('heading', { name: 'Settings' })
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      settingsCard(page, 'Number Formatting').getByRole('combobox')
    ).toContainText('1');
    await expect(
      settingsCard(page, 'Number Formatting').getByPlaceholder('₹')
    ).toHaveValue('£');
    await expect(
      settingsCard(page, 'Date Formatting').getByRole('combobox')
    ).toContainText('MM/DD/YYYY');
    await expect(
      settingsCard(page, 'Text Formatting').getByRole('combobox')
    ).toContainText('UPPERCASE');

    const parsed = JSON.parse(
      (await page.evaluate(() =>
        localStorage.getItem('import-manager-settings')
      ))!
    ) as {
      numberFormat: { decimalPlaces: number; currencySymbol: string };
      dateFormat: { format: string };
      textFormat: { case: string };
    };
    expect(parsed.textFormat.case).toBe('uppercase');
  });

  test('thousands separator switch reflects immediately, after save, and after reload', async ({
    page,
  }) => {
    await loginWithFreshSettings(page);
    await gotoSettings(page);

    const thousandsSwitch = settingsCard(page, 'Number Formatting').locator(
      '[data-slot="switch"]'
    );

    const initial = await thousandsSwitch.getAttribute('data-state');
    await thousandsSwitch.click();
    await expect(thousandsSwitch).toHaveAttribute(
      'data-state',
      initial === 'checked' ? 'unchecked' : 'checked'
    );

    await clickSaveSettings(page);

    const afterSave = await thousandsSwitch.getAttribute('data-state');
    await page.reload();
    await expect(
      appContent(page).getByRole('heading', { name: 'Settings' })
    ).toBeVisible({ timeout: 20_000 });

    const reloaded = settingsCard(page, 'Number Formatting').locator(
      '[data-slot="switch"]'
    );
    await expect(reloaded).toHaveAttribute('data-state', afterSave!);

    await reloaded.click();
    await expect(reloaded).toHaveAttribute(
      'data-state',
      afterSave === 'checked' ? 'unchecked' : 'checked'
    );
    await clickSaveSettings(page);
    await page.reload();
    await expect(
      settingsCard(page, 'Number Formatting').locator('[data-slot="switch"]')
    ).toHaveAttribute(
      'data-state',
      afterSave === 'checked' ? 'unchecked' : 'checked'
    );
  });

  test('include time and trim whitespace toggles persist after reload', async ({
    page,
  }) => {
    await loginWithFreshSettings(page);
    await gotoSettings(page);

    const includeTime = settingsCard(page, 'Date Formatting').locator(
      '[data-slot="switch"]'
    );
    const trimWhitespace = settingsCard(page, 'Text Formatting').locator(
      '[data-slot="switch"]'
    );

    await includeTime.click();
    await trimWhitespace.click();

    await clickSaveSettings(page);

    const timeState = await includeTime.getAttribute('data-state');
    const trimState = await trimWhitespace.getAttribute('data-state');

    await page.goto('/');
    await expect(
      appContent(page).getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible({ timeout: 20_000 });

    await gotoSettings(page);

    await expect(
      settingsCard(page, 'Date Formatting').locator('[data-slot="switch"]')
    ).toHaveAttribute('data-state', timeState!);
    await expect(
      settingsCard(page, 'Text Formatting').locator('[data-slot="switch"]')
    ).toHaveAttribute('data-state', trimState!);
  });
});

test.describe('Settings page — theme (header)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('isAuthenticated', 'true');
      } catch {
        /* ignore */
      }
    });
  });

  test('dark mode chosen from header persists across reload', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.evaluate(() => {
      try {
        localStorage.setItem(
          'import-manager-theme',
          JSON.stringify({ mode: 'light', color: 'zinc' })
        );
      } catch {
        /* ignore */
      }
    });
    await login(page);
    await gotoSettings(page);

    await setThemeModeFromHeader(page, 'Dark');
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(
      appContent(page).getByRole('heading', { name: 'Settings' })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('html')).toHaveClass(/dark/);

    const themeRaw = await page.evaluate(() =>
      localStorage.getItem('import-manager-theme')
    );
    const theme = JSON.parse(themeRaw!) as { mode: string };
    expect(theme.mode).toBe('dark');
  });
});
