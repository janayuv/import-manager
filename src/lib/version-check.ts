import { invoke } from '@tauri-apps/api/core';

import { isTauriEnvironment } from '@/lib/tauri-bridge';

/**
 * Compares UI bundle version (from Vite) with the Tauri shell version (from Cargo).
 * Non-blocking: logs a console warning on mismatch.
 */
export async function runVersionConsistencyCheck(): Promise<void> {
  if (!isTauriEnvironment) {
    return;
  }
  const fe = import.meta.env?.VITE_APP_VERSION?.trim() ?? '';
  if (!fe) {
    return;
  }
  try {
    const shell = (await invoke<string>('get_shell_version')).trim();
    if (shell && fe !== shell) {
      console.warn(
        `[Import Manager] Version mismatch: UI bundle ${fe} vs native shell ${shell}. Reinstall or rebuild if this was unexpected.`
      );
    }
  } catch {
    console.warn(
      '[Import Manager] Could not read native app version; skipping version check.'
    );
  }
}
