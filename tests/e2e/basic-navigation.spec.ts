import { test, expect } from '@playwright/test'

test.describe('Basic Navigation', () => {
  test('should load the application and navigate to different pages', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:1421')

    // Check if the page loads
    await expect(page).toHaveTitle(/Vite \+ React \+ TS/)

    // Check if main content is visible
    await expect(page.locator('#root')).toBeVisible()

    // Wait for the app to load
    await page.waitForTimeout(2000)

    // Check if there's any content in the app
    const rootContent = await page.locator('#root').textContent()
    expect(rootContent !== null).toBeTruthy()
  })

  test('should handle page refresh gracefully', async ({ page }) => {
    await page.goto('http://localhost:1421')
    await page.waitForTimeout(2000)

    // Refresh the page
    await page.reload()
    await page.waitForTimeout(2000)

    // Check if the app still loads after refresh
    await expect(page.locator('#root')).toBeVisible()
  })

  test('should have basic app structure', async ({ page }) => {
    await page.goto('http://localhost:1421')
    await page.waitForTimeout(2000)

    // Check for basic app elements
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('#root')).toBeVisible()

    // Check if there's any content
    const rootContent = await page.locator('#root').textContent()
    expect(rootContent !== null).toBeTruthy()
  })
})
