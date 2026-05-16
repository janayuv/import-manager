import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { formatAppDateTime } from '@/lib/app-timezone';
import {
  getSystemHealthMetrics,
  type SystemHealthMetrics,
} from '@/lib/system-health';
import { useHasPermission } from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KiB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MiB`;
  return `${(mb / 1024).toFixed(2)} GiB`;
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${ms} ms`;
}

function formatUnixMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  try {
    return formatAppDateTime(new Date(ms).toISOString());
  } catch {
    return String(ms);
  }
}

function schemaStateLabel(state: string): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'migration_pending':
      return 'Migration pending';
    case 'version_mismatch':
      return 'Version mismatch';
    case 'migration_failed':
      return 'Migration failed';
    default:
      return state;
  }
}

function schemaStatePillClass(state: string): string {
  if (state === 'ok') return 'im-status-pill is-active';
  if (state === 'migration_pending') return 'im-status-pill is-warn';
  return 'im-status-pill is-inactive';
}

export default function AdminSystemHealthPage() {
  const isAdmin = useHasPermission('admin.system_health');

  const [data, setData] = useState<SystemHealthMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await getSystemHealthMetrics();
      setData(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const bg = data?.backgroundTaskDurations;
  const healthy = data?.healthSummary.overall === 'healthy';
  const sh = data?.schemaHealth;
  const schemaOk = sh?.state === 'ok';

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Administration', 'System Health']} />
      <div
        className="im-dashboard-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        <div
          style={{
            padding: '14px 24px 12px',
            borderBottom: '1px solid var(--color-im-rule)',
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
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
              System Health
            </h1>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: 11.5,
                color: 'var(--color-im-faint)',
              }}
            >
              Database footprint, backup and snapshot recency, background task
              timings, and active exception workflows. Refreshes every 30
              seconds and when you return to this tab.
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              className={
                schemaOk
                  ? 'im-status-pill is-active'
                  : 'im-status-pill is-inactive'
              }
              data-testid="schema-health-badge"
            >
              Schema: {sh ? schemaStateLabel(sh.state) : '—'}
            </span>
            <span
              className={
                healthy ? 'im-status-pill is-active' : 'im-status-pill is-warn'
              }
            >
              {healthy ? 'Healthy' : 'Warning'}
            </span>
          </div>
        </div>

        {sh && !schemaOk ? (
          <div
            className="im-section"
            style={{ borderColor: 'var(--color-im-bad)' }}
            data-testid="schema-health-alert"
          >
            <div className="im-section__header">
              <span
                className="im-section__label"
                style={{ color: 'var(--color-im-bad)' }}
              >
                // Database schema: {schemaStateLabel(sh.state)}
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
                  Applied version:{' '}
                </span>
                {sh.appliedVersion}
                <span style={{ color: 'var(--color-im-muted)' }}>
                  {' '}
                  — expected:{' '}
                </span>
                {sh.expectedVersion}
                {sh.pendingMigrationRows > 0 ? (
                  <>
                    <span style={{ color: 'var(--color-im-muted)' }}>
                      {' '}
                      — pending rows:{' '}
                    </span>
                    {sh.pendingMigrationRows}
                  </>
                ) : null}
              </p>
              {sh.integrityError ? (
                <p
                  style={{
                    color: 'var(--color-im-bad)',
                    wordBreak: 'break-word',
                    margin: 0,
                  }}
                  role="alert"
                >
                  {sh.integrityError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            style={{ color: 'var(--color-im-bad)', fontSize: 12.5 }}
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading && !data ? (
          <p style={{ color: 'var(--color-im-muted)', fontSize: 12.5 }}>
            Loading…
          </p>
        ) : null}

        {data?.healthSummary.warnings.length ? (
          <div
            className="im-section"
            style={{ borderColor: 'var(--color-im-accent)' }}
          >
            <div className="im-section__header">
              <span className="im-section__label">// Warnings</span>
            </div>
            <div className="im-section__body">
              <ul
                style={{
                  listStyle: 'disc inside',
                  fontSize: 12.5,
                  margin: 0,
                  padding: 0,
                }}
              >
                {data.healthSummary.warnings.map(w => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          <div className="im-section" data-testid="operational-visibility-card">
            <div className="im-section__header">
              <span className="im-section__label">
                // Release &amp; operations
              </span>
            </div>
            <div
              className="im-section__body"
              style={{
                fontSize: 12.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Application version:{' '}
                </span>
                <span
                  className="font-mono"
                  data-testid="system-health-app-version"
                >
                  v{data?.appVersion ?? '—'}
                </span>
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Last manual snapshot rebuild:{' '}
                </span>
                {data?.lastDashboardSnapshotRebuildAt
                  ? formatAppDateTime(data.lastDashboardSnapshotRebuildAt)
                  : '—'}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: 'var(--color-im-faint)',
                }}
              >
                Diagnostics export (Help menu → Export diagnostics) requires
                audit permission; the bundle records native app version and
                optional client-reported version for parity checks.
              </p>
            </div>
          </div>
          <div className="im-section" data-testid="schema-health-card">
            <div className="im-section__header">
              <span className="im-section__label">
                // Schema &amp; migrations
              </span>
            </div>
            <div
              className="im-section__body"
              style={{
                fontSize: 12.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <p style={{ margin: 0 }}>
                <span
                  className={
                    sh
                      ? schemaStatePillClass(sh.state)
                      : 'im-status-pill is-neutral'
                  }
                >
                  {sh ? schemaStateLabel(sh.state) : '—'}
                </span>
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Applied version:{' '}
                </span>
                {sh?.appliedVersion ?? '—'}
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Expected version:{' '}
                </span>
                {sh?.expectedVersion ?? '—'}
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Pending migration rows:{' '}
                </span>
                {sh?.pendingMigrationRows ?? '—'}
              </p>
              {sh?.integrityError ? (
                <p
                  style={{
                    color: 'var(--color-im-bad)',
                    fontSize: 11.5,
                    wordBreak: 'break-all',
                    margin: 0,
                  }}
                >
                  {sh.integrityError}
                </p>
              ) : (
                <p
                  style={{
                    color: 'var(--color-im-faint)',
                    fontSize: 11.5,
                    margin: 0,
                  }}
                >
                  Integrity check: no blocking issues reported.
                </p>
              )}
            </div>
          </div>
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Database</span>
            </div>
            <div
              className="im-section__body"
              style={{
                fontSize: 12.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>Size: </span>
                {formatBytes(data?.databaseSizeBytes ?? 0)}
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>Pages: </span>
                {data?.databasePageCount ?? '—'} ×{' '}
                {data?.databasePageSize ?? '—'} bytes
              </p>
            </div>
          </div>
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">
                // Backup &amp; snapshots
              </span>
            </div>
            <div
              className="im-section__body"
              style={{
                fontSize: 12.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Last backup:{' '}
                </span>
                {data?.lastBackupTime
                  ? formatAppDateTime(data.lastBackupTime)
                  : '—'}
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Latest snapshot row:{' '}
                </span>
                {data?.lastSnapshotTime ?? '—'}
              </p>
            </div>
          </div>
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Workflows</span>
            </div>
            <div className="im-section__body" style={{ fontSize: 12.5 }}>
              <p style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Active (in progress):{' '}
                </span>
                {data?.activeWorkflowCount ?? '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Background task durations
            </span>
            <span className="im-section__sub">
              Last recorded timings from the in-app maintenance thread (aligned
              with background logs).
            </span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            <div className="im-table-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th">Task</th>
                    <th className="im-th">Last run</th>
                    <th className="im-th" style={{ textAlign: 'right' }}>
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: 'Fast tick (total)',
                      lastRun: formatUnixMs(bg?.lastFastTickUnixMs ?? null),
                      duration: formatMs(bg?.fastTickTotalMs ?? null),
                    },
                    {
                      label: 'Backup schedules tick',
                      lastRun: '—',
                      duration: formatMs(bg?.backupSchedulesMs ?? null),
                    },
                    {
                      label: 'Dashboard maintenance',
                      lastRun: '—',
                      duration: formatMs(bg?.dashboardMaintenanceMs ?? null),
                    },
                    {
                      label: 'Governance tick',
                      lastRun: '—',
                      duration: formatMs(bg?.governanceMs ?? null),
                    },
                    {
                      label: 'Heavy tick (total)',
                      lastRun: formatUnixMs(bg?.lastHeavyTickUnixMs ?? null),
                      duration: formatMs(bg?.heavyTickTotalMs ?? null),
                    },
                  ].map((row, i) => (
                    <tr
                      key={row.label}
                      className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                    >
                      <td className="im-td">{row.label}</td>
                      <td className="im-td">{row.lastRun}</td>
                      <td className="im-td" style={{ textAlign: 'right' }}>
                        {row.duration}
                      </td>
                    </tr>
                  ))}
                  <tr className="im-tr">
                    <td className="im-td">BOE maintenance</td>
                    <td className="im-td">
                      {bg?.lastBoeMaintenanceError ? (
                        <span
                          style={{
                            color: 'var(--color-im-bad)',
                            fontSize: 11.5,
                          }}
                        >
                          {bg.lastBoeMaintenanceError}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="im-td" style={{ textAlign: 'right' }}>
                      {formatMs(bg?.boeMaintenanceMs ?? null)}
                    </td>
                  </tr>
                  <tr className="im-tr is-alt">
                    <td className="im-td">Integrity check</td>
                    <td className="im-td">
                      {bg?.lastIntegrityError ? (
                        <span
                          style={{
                            color: 'var(--color-im-bad)',
                            fontSize: 11.5,
                          }}
                        >
                          {bg.lastIntegrityError}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="im-td" style={{ textAlign: 'right' }}>
                      {formatMs(bg?.integrityCheckMs ?? null)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
