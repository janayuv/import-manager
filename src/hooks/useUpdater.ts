import { check } from '@tauri-apps/plugin-updater';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { Update } from '@tauri-apps/plugin-updater';

export type UpdaterPhase =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; update: Update; version: string }
  | { phase: 'downloading' }
  | { phase: 'done' }
  | { phase: 'up-to-date' }
  | { phase: 'error'; message: string };

export function useUpdater() {
  const [state, setState] = useState<UpdaterPhase>({ phase: 'idle' });

  const applyUpdate = useCallback(async (update: Update) => {
    setState({ phase: 'downloading' });
    try {
      await update.downloadAndInstall();
      setState({ phase: 'done' });
      toast.success('Update installed. Restart to apply.');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ phase: 'error', message });
      toast.error(`Update failed: ${message}`);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    setState({ phase: 'checking' });
    try {
      const update = await check();
      if (!update?.available) {
        setState({ phase: 'up-to-date' });
        toast.success('You are on the latest version.');
        return;
      }
      setState({ phase: 'available', update, version: update.version });
      toast.info(`Update available: v${update.version}`, {
        action: { label: 'Install', onClick: () => applyUpdate(update) },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState({ phase: 'error', message });
      toast.error(`Update check failed: ${message}`);
    }
  }, [applyUpdate]);

  return { state, checkForUpdates };
}
