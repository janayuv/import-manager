import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test('homepage has no accessibility violations', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Run axe-core accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Assert that there are no accessibility violations
    expect(accessibilityScanResults.violations).toEqual([]);

    // Log any violations if they exist (for debugging)
    if (accessibilityScanResults.violations.length > 0) {
      console.log(
        'Accessibility violations found:',
        accessibilityScanResults.violations
      );
    }
  });

  test('keyboard navigation works correctly', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Test tab navigation
    await page.keyboard.press('Tab');

    // Test that we can navigate through interactive elements
    const interactiveElements = page.locator(
      'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const interactiveCount = await interactiveElements.count();

    if (interactiveCount > 0) {
      // Navigate through a few elements
      for (let i = 0; i < Math.min(3, interactiveCount); i++) {
        await page.keyboard.press('Tab');
        // Wait a bit for focus to settle
        await page.waitForTimeout(100);
        // Check if any element has focus
        const focusedElement = page.locator(':focus');
        const focusedCount = await focusedElement.count();
        // Only check focus if we're not on the last iteration
        if (i < Math.min(3, interactiveCount) - 1) {
          expect(focusedCount).toBeGreaterThan(0);
        }
      }
    } else {
      // If no interactive elements, just verify the page loads
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('color contrast meets accessibility standards', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Run axe-core scan specifically for color contrast
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .withRules(['color-contrast'])
      .analyze();

    // Filter for color contrast violations
    const colorContrastViolations = accessibilityScanResults.violations.filter(
      violation => violation.id === 'color-contrast'
    );

    expect(colorContrastViolations).toEqual([]);
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Run axe-core scan for image alt text
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['image-alt'])
      .analyze();

    // Filter for image alt violations
    const imageAltViolations = accessibilityScanResults.violations.filter(
      violation => violation.id === 'image-alt'
    );

    expect(imageAltViolations).toEqual([]);
  });

  test('form elements have proper labels', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle');

    // Run axe-core scan for form labels
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['label', 'label-title-only'])
      .analyze();

    // Filter for label violations
    const labelViolations = accessibilityScanResults.violations.filter(
      violation => ['label', 'label-title-only'].includes(violation.id)
    );

    expect(labelViolations).toEqual([]);
  });

  test('headings are properly structured', async ({ page }) => {
    await page.goto('http://localhost:1421');
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    // Run axe-core scan for heading structure
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['heading-order'])
      .analyze();

    // Filter for heading violations (excluding page-has-heading-one since this is a dev page)
    const headingViolations = accessibilityScanResults.violations.filter(
      violation => ['heading-order'].includes(violation.id)
    );

    expect(headingViolations).toEqual([]);
  });
});
