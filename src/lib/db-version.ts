import { invoke } from '@tauri-apps/api/core';

import { isTauriEnvironment } from '@/lib/tauri-bridge';

const DB_VERSION_KEY = 'db_version';

/** Logical database version from `app_metadata` (default `1` after migration). */
export async function getDatabaseVersion(): Promise<string> {
  if (!isTauriEnvironment) {
    return '1';
  }
  try {
    const v = await invoke<string | null>('get_app_metadata_value', {
      key: DB_VERSION_KEY,
    });
    return v && v.length > 0 ? v : '1';
  } catch {
    return '1';
  }
}

export async function setDatabaseVersion(version: string): Promise<void> {
  if (!isTauriEnvironment) {
    return;
  }
  await invoke('set_app_metadata_value', {
    key: DB_VERSION_KEY,
    value: version,
  });
}
