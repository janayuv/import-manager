import { test, expect } from '@playwright/test';

test.describe('Custom Accent Color Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should open custom color picker when clicking custom color option', async ({
    page,
  }) => {
    // Click the palette button to open color selector
    await page.click('[title="Change theme color"]');

    // Wait for dropdown to be visible
    await expect(page.locator('[role="menu"]')).toBeVisible();

    // Click the custom color option (plus button)
    await page.click('[title="Custom Color"]');

    // Check that custom color picker modal opens
    await expect(page.locator('text=Custom Accent Color')).toBeVisible();
    await expect(
      page.locator('text=Choose a custom color for your accent elements')
    ).toBeVisible();
  });

  test('should validate hex color input', async ({ page }) => {
    // Open custom color picker
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');

    // Test invalid hex input
    await page.fill('input[placeholder="#3b82f6"]', 'invalid-color');
    await expect(
      page.locator('text=Please enter a valid hex color')
    ).toBeVisible();

    // Test valid hex input
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');
    await expect(
      page.locator('text=Please enter a valid hex color')
    ).not.toBeVisible();
  });

  test('should show color preview', async ({ page }) => {
    // Open custom color picker
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');

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
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');

    // Enter a low contrast color (light gray on white background)
    await page.fill('input[placeholder="#3b82f6"]', '#f0f0f0');

    // Check that contrast warning appears
    await expect(page.locator('text=Low contrast ratio')).toBeVisible();
    await expect(page.locator('text=Text may be hard to read')).toBeVisible();
  });

  test('should save custom color and apply it', async ({ page }) => {
    // Open custom color picker
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');

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
    // First set a custom color
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');
    await page.click('button:has-text("Save Color")');

    // Verify custom color is applied
    let accentColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent')
    );
    expect(accentColor.trim()).toBe('#ff5733');

    // Reset to default
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');
    await page.click('button:has-text("Reset to Default")');

    // Check that custom color is removed
    accentColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent')
    );
    expect(accentColor.trim()).toBe('');
  });

  test('should persist custom color across page reloads', async ({ page }) => {
    // Set a custom color
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');
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
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');

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
    // Open custom color picker
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');

    // Enter a color
    await page.fill('input[placeholder="#3b82f6"]', '#ff5733');

    // Cancel
    await page.click('button:has-text("Cancel")');

    // Check that modal closes
    await expect(page.locator('text=Custom Accent Color')).not.toBeVisible();

    // Check that color wasn't saved
    const accentColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent')
    );
    expect(accentColor.trim()).toBe('');
  });

  test('should disable save button for invalid colors', async ({ page }) => {
    // Open custom color picker
    await page.click('[title="Change theme color"]');
    await page.click('[title="Custom Color"]');

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
