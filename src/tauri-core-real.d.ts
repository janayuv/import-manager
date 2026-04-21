/**
 * Type-only shim: `vite.config.ts` aliases `@tauri-apps/api/core-real` to the real
 * `core.js` when Playwright stubs `invoke`. `tsc` has no Vite aliases, so this
 * declaration maps the synthetic module id to the published core types.
 */
declare module '@tauri-apps/api/core-real' {
  export * from '@tauri-apps/api/core';
}
