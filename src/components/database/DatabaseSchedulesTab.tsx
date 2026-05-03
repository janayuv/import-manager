import { memo } from 'react';
import { Calendar, Edit3, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatAppDateTime } from '@/lib/app-timezone';
import type { BackupSchedule } from '@/components/database/types';

export interface DatabaseSchedulesTabProps {
  backupSchedules: BackupSchedule[];
  onCreateSchedule: () => void;
  onRunSchedule: (scheduleId: number) => void;
  onEditSchedule: (schedule: BackupSchedule) => void;
  onDeleteSchedule: (scheduleId: number) => void;
}

export const DatabaseSchedulesTab = memo(function DatabaseSchedulesTab({
  backupSchedules,
  onCreateSchedule,
  onRunSchedule,
  onEditSchedule,
  onDeleteSchedule,
}: DatabaseSchedulesTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Backup Schedules</h2>
          <p className="text-muted-foreground">
            Manage automated backup schedules
          </p>
        </div>
        <Button onClick={onCreateSchedule} useAccentColor>
          <Plus className="mr-2 h-4 w-4" />
          Create Schedule
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Schedules</CardTitle>
          <CardDescription>
            {backupSchedules.length} backup schedules configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backupSchedules.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <Calendar className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No backup schedules configured</p>
              <p className="text-sm">
                Create your first schedule to automate backups
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {backupSchedules.map(schedule => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{schedule.name}</h3>
                      <Badge
                        variant={schedule.enabled ? 'default' : 'secondary'}
                      >
                        {schedule.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {schedule.cron_expr ?? '—'} •{' '}
                      {schedule.destination === 'google_drive'
                        ? 'Google Drive'
                        : 'Local'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Last run:{' '}
                      {schedule.last_run
                        ? formatAppDateTime(schedule.last_run)
                        : 'Never'}{' '}
                      • Next run:{' '}
                      {schedule.next_run
                        ? formatAppDateTime(schedule.next_run)
                        : 'Not set'}
                    </p>
                    {schedule.notes && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {schedule.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRunSchedule(schedule.id!)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEditSchedule(schedule)}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDeleteSchedule(schedule.id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
});
