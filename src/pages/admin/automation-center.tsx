import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';

import { Bot, Gauge, HeartPulse, Wrench } from 'lucide-react';

import { formatAppDateTime } from '@/lib/app-timezone';
import { getSystemHealthMetrics } from '@/lib/system-health';
import { useHasPermission } from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${ms} ms`;
}

export default function AdminAutomationCenterPage() {
  const viewOk = useHasPermission('automation.view');

  const healthQ = useQuery({
    queryKey: ['admin-automation-center-health'] as const,
    queryFn: () => getSystemHealthMetrics(),
    enabled: viewOk,
    staleTime: 30_000,
  });

  if (!viewOk) {
    return <Navigate to="/" replace />;
  }

  const bg = healthQ.data?.backgroundTaskDurations;

  return (
    <div className="im-page">
      <AppBar
        crumbs={['Import Manager', 'Administration', 'Automation Center']}
      />
      <div
        className="im-dashboard-body"
        style={{
          maxWidth: 960,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            padding: '14px 24px 12px',
            borderBottom: '1px solid var(--color-im-rule)',
            flexShrink: 0,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--color-im-text)',
              fontFamily: 'var(--font-im-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            Automation Center
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 11.5,
              color: 'var(--color-im-faint)',
            }}
          >
            Background maintenance visibility, quick links to rule execution and
            the operations console. Scheduled job detail will extend this layout
            over time.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/admin/automation-rules" className="im-btn">
            <Bot
              style={{
                display: 'inline',
                width: 14,
                height: 14,
                marginRight: 4,
              }}
            />
            Rule console
          </Link>
          <Link to="/admin/operations-center" className="im-btn">
            <Gauge
              style={{
                display: 'inline',
                width: 14,
                height: 14,
                marginRight: 4,
              }}
            />
            Operations center
          </Link>
          <Link to="/admin/system-health" className="im-btn">
            <HeartPulse
              style={{
                display: 'inline',
                width: 14,
                height: 14,
                marginRight: 4,
              }}
            />
            System health
          </Link>
          <Link to="/admin/system-tools" className="im-btn">
            <Wrench
              style={{
                display: 'inline',
                width: 14,
                height: 14,
                marginRight: 4,
              }}
            />
            System tools
          </Link>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Background thread (last tick)
            </span>
            <span className="im-section__sub">
              Timings from the in-app maintenance loop (aligned with logs).
              Refreshes with the query.
            </span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            {healthQ.isLoading ? (
              <div
                style={{
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
                role="status"
                aria-label="Loading background task timings"
              >
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        height: 14,
                        width: 160,
                        background: 'var(--color-im-rule)',
                        borderRadius: 2,
                      }}
                    />
                    <div
                      style={{
                        height: 14,
                        width: 56,
                        background: 'var(--color-im-rule)',
                        borderRadius: 2,
                        flexShrink: 0,
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : healthQ.isError ? (
              <div
                style={{
                  padding: 16,
                  border: '1px solid var(--color-im-bad)',
                  borderRadius: 4,
                  color: 'var(--color-im-bad)',
                  fontSize: 12.5,
                }}
              >
                Could not load system health:{' '}
                {healthQ.error instanceof Error
                  ? healthQ.error.message
                  : String(healthQ.error)}
              </div>
            ) : (
              <div className="im-table-scroll">
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th">Task</th>
                      <th className="im-th" style={{ textAlign: 'right' }}>
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      [
                        'Fast tick (total)',
                        formatMs(bg?.fastTickTotalMs ?? null),
                      ],
                      [
                        'Backup schedules',
                        formatMs(bg?.backupSchedulesMs ?? null),
                      ],
                      [
                        'Dashboard maintenance',
                        formatMs(bg?.dashboardMaintenanceMs ?? null),
                      ],
                      ['Governance', formatMs(bg?.governanceMs ?? null)],
                      [
                        'Heavy tick (total)',
                        formatMs(bg?.heavyTickTotalMs ?? null),
                      ],
                      [
                        'BOE maintenance',
                        formatMs(bg?.boeMaintenanceMs ?? null),
                      ],
                      [
                        'Integrity check',
                        formatMs(bg?.integrityCheckMs ?? null),
                      ],
                    ].map(([label, dur], i) => (
                      <tr
                        key={label}
                        className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                      >
                        <td className="im-td">{label}</td>
                        <td className="im-td" style={{ textAlign: 'right' }}>
                          {dur}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Snapshot &amp; cache snapshot
            </span>
            <span className="im-section__sub">
              Latest dashboard snapshot timestamps from system health
              (read-only).
            </span>
          </div>
          <div
            className="im-section__body"
            style={{
              fontSize: 12.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <p style={{ margin: 0 }}>
              <span style={{ color: 'var(--color-im-muted)' }}>
                Latest snapshot row:{' '}
              </span>
              {healthQ.data?.lastSnapshotTime ?? '—'}
            </p>
            <p style={{ margin: 0 }}>
              <span style={{ color: 'var(--color-im-muted)' }}>
                Last manual rebuild:{' '}
              </span>
              {healthQ.data?.lastDashboardSnapshotRebuildAt
                ? formatAppDateTime(healthQ.data.lastDashboardSnapshotRebuildAt)
                : '—'}
            </p>
            <span className="im-badge is-neutral" style={{ fontWeight: 400 }}>
              Native v{healthQ.data?.appVersion ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
