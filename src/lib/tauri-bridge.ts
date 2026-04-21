// Browser-safe bridge for Tauri APIs. Dynamically imports Tauri modules only when available.
// In web (Vercel) preview, these fall back to friendly errors to avoid build-time failures.
import type {
  OpenDialogOptions,
  SaveDialogOptions,
  ConfirmDialogOptions,
} from '@tauri-apps/plugin-dialog';

interface WindowWithTauri {
  __TAURI__?: unknown;
}

const hasWindow = typeof window !== 'undefined';
const isTauri =
  hasWindow && (window as WindowWithTauri).__TAURI__ !== undefined;

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
  if (isTauri) {
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
    if (isTauri) {
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
