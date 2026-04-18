import { expect, test } from '@playwright/test';

test('should load the application', async ({ page }) => {
  // Navigate to the app
  await page.goto('http://localhost:1421');

  // Check if the page loads
  await expect(page).toHaveTitle(/Vite \+ React \+ TS/);

  // Check if main content is visible
  await expect(page.locator('body')).toBeVisible();
});

test('should have basic navigation structure', async ({ page }) => {
  await page.goto('http://localhost:1421');

  // Check if main content area exists
  await expect(page.locator('#root')).toBeVisible();
});
