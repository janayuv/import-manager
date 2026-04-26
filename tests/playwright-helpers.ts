import type { Buffer } from 'node:buffer';

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
