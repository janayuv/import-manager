import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Download, HardDrive, Shield, Upload } from 'lucide-react';
import { formatAppDateTime } from '@/lib/app-timezone';
import type { DatabaseStats } from '@/components/database/types';
import { totalRecordsFromStats } from '@/components/database/types';

export interface DatabaseSummaryStripProps {
  stats: DatabaseStats | null;
  formatBytes: (bytes: number) => string;
  isTauriEnvironment: boolean;
  onExportBackupKey: () => void;
  onImportBackupKey: () => void;
}

export const DatabaseSummaryStrip = memo(function DatabaseSummaryStrip({
  stats,
  formatBytes,
  isTauriEnvironment,
  onExportBackupKey,
  onImportBackupKey,
}: DatabaseSummaryStripProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Database Size</CardTitle>
          <HardDrive className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats ? formatBytes(Number(stats.db_size_bytes ?? 0)) : '0 Bytes'}
          </div>
          <p className="text-muted-foreground text-xs">
            {stats ? totalRecordsFromStats(stats) : 0} total records
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Last Backup</CardTitle>
          <Download className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats?.last_backup
              ? formatAppDateTime(stats.last_backup).split(' ')[0]
              : 'Never'}
          </div>
          <p className="text-muted-foreground text-xs">
            {stats?.last_backup
              ? formatAppDateTime(stats.last_backup).split(' ')[1]
              : 'No backups yet'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Next Backup</CardTitle>
          <Clock className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats?.next_scheduled_backup
              ? formatAppDateTime(stats.next_scheduled_backup).split(' ')[0]
              : 'None'}
          </div>
          <p className="text-muted-foreground text-xs">
            {stats?.next_scheduled_backup
              ? formatAppDateTime(stats.next_scheduled_backup).split(' ')[1]
              : 'No schedules'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Security</CardTitle>
          <Shield className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            <Badge
              variant={
                stats?.encryption_status === 'Encrypted' ||
                stats?.encryption_status === 'AES-256 Enabled'
                  ? 'default'
                  : 'secondary'
              }
            >
              {stats?.encryption_status || 'None'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Backups: AES-256-GCM (key in system keyring)
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void onExportBackupKey();
              }}
              disabled={!isTauriEnvironment}
              title="Save backup_key.imkey for disaster recovery or new PC"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export Backup Key
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void onImportBackupKey();
              }}
              disabled={!isTauriEnvironment}
              title="Restore a key you exported on another device"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import Backup Key
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
