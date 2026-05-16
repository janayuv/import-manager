import { memo } from 'react';
import { Calendar, Edit3, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatAppDateTime } from '@/lib/app-timezone';
import type { BackupSchedule } from '@/components/database/types';

const IM = {
  panel: '#101010',
  alt: '#0C0C0B',
  header: '#0D0D0B',
  text: '#EFEDE8',
  muted: '#8C8A82',
  rule: '#1F1E1A',
  hover: '#161513',
  accent: '#E8A23A',
  accentBg: 'rgba(232,162,58,0.10)',
  accentBdr: 'rgba(232,162,58,0.25)',
  good: '#5FCB7D',
  goodBg: 'rgba(95,203,125,0.10)',
  goodBdr: 'rgba(95,203,125,0.22)',
  bad: '#F87171',
  badBg: 'rgba(248,113,113,0.09)',
  badBdr: 'rgba(248,113,113,0.20)',
  mono: "Consolas, 'Courier New', monospace",
} as const;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 0',
          borderBottom: `1px solid ${IM.rule}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2
            style={{
              fontFamily: IM.mono,
              fontSize: 13,
              fontWeight: 700,
              color: IM.text,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: 0,
            }}
          >
            Backup Schedules
          </h2>
          <p
            style={{
              fontFamily: IM.mono,
              fontSize: 10,
              color: IM.muted,
              margin: 0,
              letterSpacing: '0.04em',
            }}
          >
            Manage automated backup schedules
          </p>
        </div>
        <Button onClick={onCreateSchedule} useAccentColor>
          <Plus className="mr-2 h-4 w-4" />
          Create Schedule
        </Button>
      </div>

      {/* Active schedules panel */}
      <div
        style={{
          border: `1px solid ${IM.rule}`,
          background: IM.panel,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            background: IM.header,
            borderBottom: `1px solid ${IM.rule}`,
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: IM.mono,
              fontSize: 11,
              fontWeight: 700,
              color: IM.text,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Active Schedules
          </span>
          <span
            style={{
              fontFamily: IM.mono,
              fontSize: 10,
              fontWeight: 700,
              color: IM.accent,
              background: IM.accentBg,
              border: `1px solid ${IM.accentBdr}`,
              padding: '1px 6px',
            }}
          >
            {backupSchedules.length}
          </span>
        </div>

        {/* Panel body */}
        <div style={{ padding: backupSchedules.length === 0 ? '0' : '0' }}>
          {backupSchedules.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                gap: 12,
              }}
            >
              <Calendar
                style={{ width: 36, height: 36, color: IM.muted, opacity: 0.5 }}
              />
              <p
                style={{
                  fontFamily: IM.mono,
                  fontSize: 12,
                  color: IM.muted,
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                No backup schedules configured
              </p>
              <p
                style={{
                  fontFamily: IM.mono,
                  fontSize: 10,
                  color: IM.muted,
                  margin: 0,
                  opacity: 0.7,
                }}
              >
                Create your first schedule to automate backups
              </p>
            </div>
          ) : (
            <div>
              {backupSchedules.map((schedule, i) => (
                <div
                  key={schedule.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: i % 2 === 0 ? IM.panel : IM.alt,
                    borderBottom: `1px solid ${IM.rule}`,
                    minHeight: 64,
                    gap: 16,
                  }}
                >
                  {/* Schedule info */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span
                        style={{
                          fontFamily: IM.mono,
                          fontSize: 12,
                          fontWeight: 700,
                          color: IM.text,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {schedule.name}
                      </span>
                      <span
                        style={{
                          fontFamily: IM.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '1px 6px',
                          background: schedule.enabled ? IM.goodBg : IM.badBg,
                          color: schedule.enabled ? IM.good : IM.bad,
                          border: `1px solid ${schedule.enabled ? IM.goodBdr : IM.badBdr}`,
                        }}
                      >
                        {schedule.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: IM.mono,
                        fontSize: 10.5,
                        color: IM.muted,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {schedule.cron_expr ?? '—'} ·{' '}
                      {schedule.destination === 'google_drive'
                        ? 'Google Drive'
                        : 'Local'}
                    </span>
                    <span
                      style={{
                        fontFamily: IM.mono,
                        fontSize: 10,
                        color: IM.muted,
                        opacity: 0.8,
                      }}
                    >
                      Last run:{' '}
                      {schedule.last_run
                        ? formatAppDateTime(schedule.last_run)
                        : 'Never'}{' '}
                      · Next run:{' '}
                      {schedule.next_run
                        ? formatAppDateTime(schedule.next_run)
                        : 'Not set'}
                    </span>
                    {schedule.notes && (
                      <span
                        style={{
                          fontFamily: IM.mono,
                          fontSize: 10,
                          color: IM.muted,
                          opacity: 0.7,
                          fontStyle: 'italic',
                        }}
                      >
                        {schedule.notes}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRunSchedule(schedule.id!)}
                      title="Run now"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEditSchedule(schedule)}
                      title="Edit schedule"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDeleteSchedule(schedule.id!)}
                      title="Delete schedule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
