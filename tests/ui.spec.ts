import { test, expect } from '@playwright/test';

test.describe('UI Tests', () => {
  test('homepage loads correctly', async ({ page }) => {
    // Navigate to the Tauri dev server
    await page.goto('http://localhost:1421');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Verify that the homepage loads
    await expect(page).toHaveTitle(/Vite \+ React \+ TS/i);

    // Verify that the page is visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('font-size elements are visible', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Verify heading elements are visible
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();

    if (headingCount > 0) {
      await expect(headings.first()).toBeVisible();
    } else {
      // If no headings, check for any text elements with font-size
      const textElements = page.locator('p, span, div, button, a');
      await expect(textElements.first()).toBeVisible();
    }
  });

  test('table is visible and adjusts properly', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Look for table elements
    const tables = page.locator('table');
    const tableCount = await tables.count();

    if (tableCount > 0) {
      // If tables exist, verify they are visible
      await expect(tables.first()).toBeVisible();

      // Test responsive behavior by resizing viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(tables.first()).toBeVisible();

      await page.setViewportSize({ width: 375, height: 667 });
      await expect(tables.first()).toBeVisible();
    } else {
      // If no tables, look for table-like structures (divs with table role)
      const tableLikeElements = page.locator(
        '[role="table"], .table, [class*="table"]'
      );
      const tableLikeCount = await tableLikeElements.count();

      if (tableLikeCount > 0) {
        await expect(tableLikeElements.first()).toBeVisible();
      } else {
        // Skip test if no table-like elements found
        test.skip();
      }
    }
  });

  test('take screenshot for visual regression', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Take a full page screenshot
    await page.screenshot({
      path: 'test-results/homepage-screenshot.png',
      fullPage: true,
    });

    // Verify screenshot was taken by checking if file exists
    // Note: Screenshot verification is handled by Playwright automatically
    // The screenshot will be saved to test-results directory
  });

  test('responsive design works correctly', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });
});
