import {
  memo,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Clock,
  Cloud,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { formatAppDateTime } from '@/lib/app-timezone';
import type {
  BackupHealthMetrics,
  BackupInfo,
  BackupRedundancySettings,
  GoogleDriveStatus,
} from '@/components/database/types';
import {
  backupTypeLabel,
  gdriveCloudBlocked,
  gdriveStatusIndicator,
} from '@/components/database/backup-helpers';

export interface DatabaseBackupCreateForm {
  destination: string;
  filename: string;
  include_wal: boolean;
  notes: string;
}

export interface DatabaseBackupRestoreTabProps {
  isPlaywrightBuild: boolean;
  onPlaywrightRestoreFileChange: (
    e: ChangeEvent<HTMLInputElement>
  ) => void | Promise<void>;
  backupHealth: BackupHealthMetrics | null;
  redundancyForm: BackupRedundancySettings;
  setRedundancyForm: Dispatch<SetStateAction<BackupRedundancySettings>>;
  redundancySaving: boolean;
  onSaveRedundancySettings: () => void | Promise<void>;
  backupInProgress: boolean;
  backupProgress: number;
  backupForm: DatabaseBackupCreateForm;
  setBackupForm: Dispatch<SetStateAction<DatabaseBackupCreateForm>>;
  googleDriveStatus: GoogleDriveStatus | null;
  onRefreshGoogleProfile: () => void | Promise<void>;
  onDisconnectGoogleDrive: () => void | Promise<void>;
  onConnectGoogleDrive: () => void | Promise<void>;
  onBackupNow: () => void | Promise<void>;
  backupHistory: BackupInfo[];
  formatBytes: (bytes: number) => string;
  onRestorePreview: (backupPath: string) => void | Promise<void>;
  onDownloadPlaywrightSnapshot?: (backupPath: string) => void | Promise<void>;
}

export const DatabaseBackupRestoreTab = memo(function DatabaseBackupRestoreTab({
  isPlaywrightBuild,
  onPlaywrightRestoreFileChange,
  backupHealth,
  redundancyForm,
  setRedundancyForm,
  redundancySaving,
  onSaveRedundancySettings,
  backupInProgress,
  backupProgress,
  backupForm,
  setBackupForm,
  googleDriveStatus,
  onRefreshGoogleProfile,
  onDisconnectGoogleDrive,
  onConnectGoogleDrive,
  onBackupNow,
  backupHistory,
  formatBytes,
  onRestorePreview,
  onDownloadPlaywrightSnapshot,
}: DatabaseBackupRestoreTabProps) {
  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'in_progress':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  }

  return (
    <>
      {isPlaywrightBuild && (
        <div className="sr-only">
          <label htmlFor="database-restore-file-input">
            Upload backup JSON for restore (Playwright)
          </label>
          <input
            id="database-restore-file-input"
            type="file"
            accept=".json,application/json"
            data-testid="database-restore-file-input"
            onChange={e => void onPlaywrightRestoreFileChange(e)}
          />
        </div>
      )}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Backup health</CardTitle>
            <CardDescription>
              Last validation, restore simulation, and redundancy status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {backupHealth &&
            backupHealth.alerts &&
            backupHealth.alerts.length > 0 ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-inside list-disc text-sm">
                    {backupHealth.alerts.map(a => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {backupHealth ? (
              <div className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-foreground font-medium">
                    Last backup (metadata):{' '}
                  </span>
                  {backupHealth.lastBackupTime
                    ? formatAppDateTime(backupHealth.lastBackupTime)
                    : '—'}
                </p>
                <p>
                  <span className="text-foreground font-medium">
                    Latest local file:{' '}
                  </span>
                  {backupHealth.latestLocalBackupFilename ?? '—'}
                </p>
                <p>
                  <span className="text-foreground font-medium">Age: </span>
                  {backupHealth.backupAgeHours != null
                    ? `${backupHealth.backupAgeHours.toFixed(1)} h`
                    : '—'}
                </p>
                <p>
                  <span className="text-foreground font-medium">
                    Validation:{' '}
                  </span>
                  {backupHealth.lastValidationStatus ?? '—'}
                  {backupHealth.lastValidationAt
                    ? ` (${formatAppDateTime(backupHealth.lastValidationAt)})`
                    : ''}
                </p>
                <p>
                  <span className="text-foreground font-medium">
                    Restore simulation:{' '}
                  </span>
                  {backupHealth.lastRestoreSimulationStatus ?? '—'}
                  {backupHealth.lastRestoreSimulationAt
                    ? ` (${formatAppDateTime(
                        backupHealth.lastRestoreSimulationAt
                      )})`
                    : ''}
                </p>
                <p>
                  <span className="text-foreground font-medium">
                    Secondary folder:{' '}
                  </span>
                  {backupHealth.secondaryRedundancyEnabled
                    ? backupHealth.secondaryRedundancyPath || '(path empty)'
                    : 'off'}
                </p>
                {backupHealth.sizeTrendNote ? (
                  <p className="text-amber-700 sm:col-span-2 dark:text-amber-400">
                    <span className="font-medium">Size trend: </span>
                    {backupHealth.sizeTrendNote}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Loading health metrics…
              </p>
            )}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-medium">Secondary backup folder</h4>
              <p className="text-muted-foreground text-xs">
                When enabled, each local backup is copied here and the folder is
                used if the primary AppData path cannot be prepared (disk full
                or permission).
              </p>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="secondary-enabled"
                  checked={redundancyForm.enabled}
                  onCheckedChange={v =>
                    setRedundancyForm(prev => ({
                      ...prev,
                      enabled: v === true,
                    }))
                  }
                  disabled={redundancySaving}
                />
                <Label htmlFor="secondary-enabled" className="font-normal">
                  Enable secondary path
                </Label>
              </div>
              <Input
                placeholder="e.g. D:\ImportManagerBackup or \\server\share\im"
                value={redundancyForm.secondaryPath}
                onChange={e =>
                  setRedundancyForm(prev => ({
                    ...prev,
                    secondaryPath: e.target.value,
                  }))
                }
                disabled={redundancySaving}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={redundancySaving}
                onClick={() => void onSaveRedundancySettings()}
              >
                {redundancySaving ? 'Saving…' : 'Save redundancy settings'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create Backup</CardTitle>
              <CardDescription>Create a new database backup</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {backupInProgress &&
                backupForm.destination !== 'google_drive' && (
                  <Alert>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <AlertDescription>
                      Creating backup... {backupProgress}%
                      <Progress value={backupProgress} className="mt-2" />
                    </AlertDescription>
                  </Alert>
                )}

              {googleDriveStatus?.state === 'not_configured' && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Google Drive requires OAuth credentials at build time (
                    <code className="text-xs">
                      IMPORT_MANAGER_GOOGLE_CLIENT_ID
                    </code>
                    ). Local backups work without this.
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    <Cloud className="mr-1 inline h-4 w-4" />
                    Google Drive
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {googleDriveStatus?.state === 'connected' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="Refresh account email"
                        onClick={() => void onRefreshGoogleProfile()}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {googleDriveStatus?.configured ? (
                      googleDriveStatus.state === 'connected' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void onDisconnectGoogleDrive()}
                        >
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void onConnectGoogleDrive()}
                        >
                          Connect
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>
                <p className="text-sm font-medium">
                  {gdriveStatusIndicator(googleDriveStatus)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {googleDriveStatus?.state === 'not_configured'
                    ? 'Not available in this build.'
                    : googleDriveStatus?.state === 'connected'
                      ? 'You can back up to Google Drive or restore from cloud backups below. Retry and cancel are shown during upload or download.'
                      : 'Connect once to upload encrypted backups to your own Drive (app-created files only).'}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="destination">Destination</Label>
                  <Select
                    value={backupForm.destination}
                    onValueChange={value =>
                      setBackupForm(prev => ({
                        ...prev,
                        destination: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local Storage</SelectItem>
                      <SelectItem value="google_drive">Google Drive</SelectItem>
                      <SelectItem value="s3" disabled>
                        AWS S3 (Coming Soon)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="filename">Filename (optional)</Label>
                  <Input
                    id="filename"
                    placeholder="Auto-generated if empty"
                    value={backupForm.filename}
                    onChange={e =>
                      setBackupForm(prev => ({
                        ...prev,
                        filename: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Optional backup notes"
                    value={backupForm.notes}
                    onChange={e =>
                      setBackupForm(prev => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                  />
                </div>

                <Button
                  onClick={() => void onBackupNow()}
                  disabled={
                    backupInProgress ||
                    (backupForm.destination === 'google_drive' &&
                      gdriveCloudBlocked(googleDriveStatus))
                  }
                  className="w-full"
                  useAccentColor
                >
                  {backupInProgress ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Creating Backup...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Create Backup Now
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backup History</CardTitle>
              <CardDescription>Recent database backups</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {backupHistory.map(backup => (
                  <div
                    key={backup.id ?? backup.path}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(backup.status)}
                      <div>
                        <p className="text-sm font-medium">{backup.filename}</p>
                        <p className="text-muted-foreground text-xs">
                          Type: {backupTypeLabel(backup)}
                        </p>
                        {backupTypeLabel(backup) === 'Google Drive' && (
                          <p className="text-muted-foreground text-xs">
                            Google Drive file name: {backup.filename}
                          </p>
                        )}
                        <p className="text-muted-foreground text-xs">
                          {formatAppDateTime(backup.created_at)}
                          {' • '}
                          {backup.size_bytes != null
                            ? formatBytes(backup.size_bytes)
                            : 'Unknown size'}
                        </p>
                        {backup.destination === 'local' &&
                        backup.validation_status != null &&
                        backup.validation_status !== '' ? (
                          <p className="text-muted-foreground text-xs">
                            Validation: {backup.validation_status}
                            {backup.validation_checked_at
                              ? ` • ${formatAppDateTime(backup.validation_checked_at)}`
                              : ''}
                          </p>
                        ) : null}
                        {backup.destination === 'local' &&
                        backup.restore_simulation_status != null &&
                        backup.restore_simulation_status !== '' ? (
                          <p className="text-muted-foreground text-xs">
                            Restore test: {backup.restore_simulation_status}
                            {backup.restore_simulation_checked_at
                              ? ` • ${formatAppDateTime(backup.restore_simulation_checked_at)}`
                              : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {isPlaywrightBuild && onDownloadPlaywrightSnapshot && (
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() =>
                            void onDownloadPlaywrightSnapshot(backup.path)
                          }
                        >
                          <Download className="mr-1 h-4 w-4" />
                          Download snapshot
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onRestorePreview(backup.path)}
                        disabled={backup.status !== 'completed'}
                      >
                        <Upload className="mr-1 h-4 w-4" />
                        Preview Restore
                      </Button>
                    </div>
                  </div>
                ))}
                {backupHistory.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    No backups found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
});
