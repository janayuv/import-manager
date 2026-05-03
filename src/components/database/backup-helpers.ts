import type {
  BackupInfo,
  GoogleDriveStatus,
} from '@/components/database/types';

export function backupTypeLabel(backup: BackupInfo): 'Google Drive' | 'Local' {
  return backup.destination === 'google_drive' ||
    backup.path.startsWith('gdrive:')
    ? 'Google Drive'
    : 'Local';
}

export function gdriveCloudBlocked(status: GoogleDriveStatus | null): boolean {
  if (!status) return true;
  return status.state === 'not_configured' || status.state === 'not_connected';
}

export function isGdriveBackupPath(path: string): boolean {
  return path.startsWith('gdrive:');
}

export function gdriveStatusIndicator(
  status: GoogleDriveStatus | null
): string {
  if (!status) return '● Loading…';
  if (status.state === 'not_configured') return '● Not Configured';
  if (status.state === 'not_connected') return '● Not Connected';
  return `● Connected${status.email ? ` (${status.email})` : ''}`;
}

export function normalizeGoogleDriveStatus(
  raw: Partial<GoogleDriveStatus> | null | undefined
): GoogleDriveStatus {
  const configured = Boolean(raw?.configured);
  const connected = Boolean(raw?.connected);
  let state = raw?.state;
  if (!state) {
    if (!configured) state = 'not_configured';
    else if (!connected) state = 'not_connected';
    else state = 'connected';
  }
  return {
    configured,
    connected,
    state,
    email: raw?.email ?? null,
  };
}
