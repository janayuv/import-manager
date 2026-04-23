/**
 * Warn when Vite `define` did not inject build metadata (e.g. misconfigured custom build).
 * Does not throw; safe for tests and web-only preview.
 */
export function validateBuildMetadata(): void {
  if (typeof import.meta === 'undefined') {
    return;
  }
  const v = import.meta.env?.VITE_APP_VERSION;
  const t = import.meta.env?.VITE_BUILD_TIME;
  if (v == null || v === '' || t == null || t === '') {
    console.warn(
      '[Import Manager] Build metadata missing (VITE_APP_VERSION / VITE_BUILD_TIME)'
    );
  }
}
