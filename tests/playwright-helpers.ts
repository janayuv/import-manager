import type { Page } from '@playwright/test';

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
