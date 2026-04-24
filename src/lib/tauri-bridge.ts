// Browser-safe bridge for Tauri APIs. Dynamically imports Tauri modules only when available.
// In web (Vercel) preview, these fall back to friendly errors to avoid build-time failures.
import type {
  OpenDialogOptions,
  SaveDialogOptions,
  ConfirmDialogOptions,
} from '@tauri-apps/plugin-dialog';

interface WindowWithTauri {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  isTauri?: boolean;
}

const hasWindow = typeof window !== 'undefined';

/**
 * Tauri 2: IPC and `invoke` use `__TAURI_INTERNALS__` and the official runtime
 * flag `globalThis.isTauri` — *not* only `window.__TAURI__` (that is for
 * `app.withGlobalTauri`). Stale `__TAURI__`-only checks make `invoke` work while
 * UI gating (e.g. Recycle Bin) thinks we are in a plain browser.
 * Playwright (`VITE_PLAYWRIGHT`) uses a stub `invoke` without a full webview.
 */
function detectTauriAtLoad(): boolean {
  if (!hasWindow) return false;
  const g = globalThis as { isTauri?: boolean };
  if (g.isTauri) return true;
  const w = window as unknown as WindowWithTauri;
  if (w.isTauri) return true;
  if (w.__TAURI__ !== undefined) return true;
  if (w.__TAURI_INTERNALS__ !== undefined) return true;
  if (import.meta.env.VITE_PLAYWRIGHT === '1') return true;
  return false;
}

const isTauri = detectTauriAtLoad();

/** Playwright runs the Vite app in Chromium with `invoke` stubbed; native Tauri dialogs are unavailable. */
const isPlaywrightBrowser =
  hasWindow && import.meta.env.VITE_PLAYWRIGHT === '1';

/**
 * When false, use browser downloads and `<input type="file">` (including Playwright automation).
 * When true, use `@tauri-apps/plugin-dialog` open/save and disk read/write.
 */
export const useNativeFileDialogs = isTauri && !isPlaywrightBrowser;

/** Sync browser confirm; never throws (WebView / policy edge cases). */
function browserConfirm(message: string): boolean {
  if (!hasWindow) return false;
  try {
    return Boolean(window.confirm(message));
  } catch {
    return false;
  }
}

export async function open(
  options?: OpenDialogOptions
): Promise<string | string[] | null> {
  if (isTauri) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    return dialog.open(options);
  }
  throw new Error('File open is not supported in web preview.');
}

export type OpenedTextFile = {
  contents: string;
  name: string | null;
  path?: string | null;
};

export const isTauriEnvironment = isTauri;

const buildAcceptString = (options?: OpenDialogOptions) => {
  if (!options?.filters || options.filters.length === 0) {
    return '';
  }

  const extensions = options.filters.flatMap(filter =>
    filter.extensions.map(ext => {
      if (!ext) return '';
      return ext.startsWith('.') ? ext : `.${ext}`;
    })
  );

  return extensions.filter(Boolean).join(',');
};

export async function openTextFile(
  options?: OpenDialogOptions
): Promise<OpenedTextFile | null> {
  if (isTauri && !isPlaywrightBrowser) {
    const selected = await open(options);
    if (!selected) {
      return null;
    }

    const filePath = Array.isArray(selected) ? selected[0] : selected;
    if (!filePath) {
      return null;
    }

    const contents = await readTextFile(filePath);
    const segments = filePath.split(/[\\/]/);
    const name = segments[segments.length - 1] ?? null;
    return {
      contents,
      name,
      path: filePath,
    };
  }

  if (!hasWindow) {
    throw new Error('File open is not supported in this environment.');
  }

  return new Promise<OpenedTextFile | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = buildAcceptString(options);
    input.style.display = 'none';

    const cleanup = () => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    const handleFocus = () => {
      window.removeEventListener('focus', handleFocus);
      setTimeout(() => {
        if (!input.files || input.files.length === 0) {
          cleanup();
          resolve(null);
        }
      }, 300);
    };

    input.addEventListener(
      'change',
      async () => {
        window.removeEventListener('focus', handleFocus);
        try {
          const file = input.files?.[0];
          if (!file) {
            cleanup();
            resolve(null);
            return;
          }
          const contents = await file.text();
          cleanup();
          resolve({
            contents,
            name: file.name ?? null,
            path: file.name ?? null,
          });
        } catch (error) {
          cleanup();
          reject(error);
        }
      },
      { once: true }
    );

    window.addEventListener('focus', handleFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

export async function save(
  options?: SaveDialogOptions
): Promise<string | null> {
  if (isTauri) {
    const dialog = await import('@tauri-apps/plugin-dialog');
    return dialog.save(options);
  }
  throw new Error('File save is not supported in web preview.');
}

/**
 * Ok/Cancel confirmation. Never rejects: Tauri plugin failures fall back to
 * `window.confirm` so callers never trigger global `unhandledrejection`.
 */
export async function confirm(
  message: string,
  options?: ConfirmDialogOptions
): Promise<boolean> {
  try {
    if (isTauri && !isPlaywrightBrowser) {
      try {
        const { confirm: tauriConfirm } =
          await import('@tauri-apps/plugin-dialog');
        return Boolean(await tauriConfirm(message, options));
      } catch (err) {
        console.warn('Dialog confirm failed:', err);
        return browserConfirm(message);
      }
    }
    return browserConfirm(message);
  } catch (err) {
    console.warn('confirm() failed:', err);
    return false;
  }
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauri) {
    const fs = await import('@tauri-apps/plugin-fs');
    return fs.readTextFile(path);
  }
  throw new Error('Reading files from disk is not supported in web preview.');
}

export async function writeTextFile(
  path: string,
  contents: string
): Promise<void> {
  if (isTauri) {
    const fs = await import('@tauri-apps/plugin-fs');
    return fs.writeTextFile(path, contents);
  }
  throw new Error('Writing files to disk is not supported in web preview.');
}
