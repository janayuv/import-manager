import { expect, test, type Page } from '@playwright/test';

async function readRootAccent(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim()
  );
}

/** Opens the custom accent dialog (Vite dev only; see SiteHeader __E2E_openCustomAccent). */
async function openCustomColorDialog(page: Page) {
  await expect(page.locator('header')).toBeVisible();
  await page.evaluate(() => {
    const w = window as Window & { __E2E_openCustomAccent?: () => void };
    if (!w.__E2E_openCustomAccent) {
      throw new Error(
        'E2E helper missing: run Playwright against `npm run dev` (Vite dev).'
      );
    }
    w.__E2E_openCustomAccent();
  });
  await expect(
    page.getByRole('dialog', { name: 'Custom Accent Color' })
  ).toBeVisible({ timeout: 8000 });
}

test.describe('Custom Accent Color Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('isAuthenticated', 'true');
      } catch {
        /* ignore */
      }
    });
    await page.goto('/');
  });

  test('should open custom color picker dialog', async ({ page }) => {
    await openCustomColorDialog(page);

    await expect(
      page.getByText('Choose a custom color for your accent elements')
    ).toBeVisible();
  });

  test('should validate hex color input', async ({ page }) => {
    await openCustomColorDialog(page);

    await page.fill('input[placeholder="#3b82f6"]', 'invalid-color');
    await expect(
      page.getByText(/please enter a valid hex color/i)
    ).toBeVisible();

    // Test valid hex input
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');
    await expect(
      page.getByText(/please enter a valid hex color/i)
    ).not.toBeVisible();
  });

  test('should show color preview', async ({ page }) => {
    await openCustomColorDialog(page);

    // Enter a valid color
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');

    // Check that color preview updates
    const preview = page.locator('[aria-label*="Color preview"]');
    await expect(preview).toBeVisible();

    // The preview should have the background color set
    const backgroundColor = await preview.evaluate(
      el => window.getComputedStyle(el).backgroundColor
    );
    expect(backgroundColor).toContain('rgb(255, 87, 51)'); // #ff5733 in RGB
  });

  test('should show contrast warning for low contrast colors', async ({
    page,
  }) => {
    // Open custom color picker
    await openCustomColorDialog(page);

    // Enter a low contrast color (light gray on white background)
    await page.fill('input[placeholder="#3b82f6"]', '#f0f0f0');

    // Check that contrast warning appears
    await expect(page.locator('text=Low contrast ratio')).toBeVisible();
    await expect(page.locator('text=Text may be hard to read')).toBeVisible();
  });

  test('should save custom color and apply it', async ({ page }) => {
    // Open custom color picker
    await openCustomColorDialog(page);

    // Enter a custom color
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');

    // Save the color
    await page.click('button:has-text("Save Color")');

    // Check that modal closes
    await expect(page.locator('text=Custom Accent Color')).not.toBeVisible();

    // Check that CSS variable is set
    const accentColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent')
    );
    expect(accentColor.trim()).toBe('#ff5733');
  });

  test('should reset to default color', async ({ page }) => {
    const baselineAccent = await readRootAccent(page);

    // First set a custom color
    await openCustomColorDialog(page);
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');
    await page.click('button:has-text("Save Color")');

    // Verify custom color is applied
    expect(await readRootAccent(page)).toBe('#ff5733');

    // Reset to default
    await openCustomColorDialog(page);
    await page.click('button:has-text("Reset to Default")');

    // Theme default is a real color (e.g. oklch), not an empty custom override
    expect(await readRootAccent(page)).toBe(baselineAccent);
  });

  test('should persist custom color across page reloads', async ({ page }) => {
    // Set a custom color
    await openCustomColorDialog(page);
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');
    await page.click('button:has-text("Save Color")');

    // Reload the page
    await page.reload();

    // Check that custom color is still applied
    const accentColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent')
    );
    expect(accentColor.trim()).toBe('#ff5733');
  });

  test('should work with native color picker', async ({ page }) => {
    // Open custom color picker
    await openCustomColorDialog(page);

    // Use native color picker
    const colorInput = page.locator('input[type="color"]');
    await colorInput.fill('#ff5733');

    // Check that hex input updates
    await expect(page.locator('input[placeholder="#3b82f6"]')).toHaveValue(
      '#ff5733'
    );

    // Check that preview updates
    const preview = page.locator('[aria-label*="Color preview"]');
    const backgroundColor = await preview.evaluate(
      el => window.getComputedStyle(el).backgroundColor
    );
    expect(backgroundColor).toContain('rgb(255, 87, 51)');
  });

  test('should cancel without saving', async ({ page }) => {
    const baselineAccent = await readRootAccent(page);

    // Open custom color picker
    await openCustomColorDialog(page);

    // Enter a color
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');

    // Cancel
    await page.click('button:has-text("Cancel")');

    // Check that modal closes
    await expect(page.locator('text=Custom Accent Color')).not.toBeVisible();

    // Check that color wasn't saved
    expect(await readRootAccent(page)).toBe(baselineAccent);
  });

  test('should disable save button for invalid colors', async ({ page }) => {
    // Open custom color picker
    await openCustomColorDialog(page);

    // Enter invalid color
    await page.fill('input[placeholder="#3b82f6"]', 'invalid');

    // Check that save button is disabled
    await expect(page.locator('button:has-text("Save Color")')).toBeDisabled();

    // Enter valid color
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');

    // Check that save button is enabled
    await expect(page.locator('button:has-text("Save Color")')).toBeEnabled();
  });
});
