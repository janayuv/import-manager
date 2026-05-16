import { safeInvoke as invoke } from '@/lib/ipc-safe';
import {
  Activity,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatAppDateTime } from '@/lib/app-timezone';
import { ipcErrorMessage, parseIpcError } from '@/lib/ipc-error';
import {
  useCurrentUserId,
  useHasPermission,
  useUser,
} from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';

type SecurityPolicy = {
  lockoutThreshold: number;
  lockoutWindowMinutes: number;
  lockoutDurationMinutes: number;
  idleTimeoutMinutes: number;
};

type SecuritySettings = {
  policy: SecurityPolicy;
  passwordHistoryDepth: number;
  passwordHistoryDepthMin: number;
  passwordHistoryDepthMax: number;
};

type SecurityAlertItem = {
  severity: string;
  code: string;
  message: string;
};

type SecurityTrendDay = {
  day: string;
  failedLogins: number;
  lockouts: number;
  passwordChanges: number;
};

type DesktopSessionRow = {
  userId: string;
  username: string;
  name: string;
  email: string;
  role: string;
  sessionId: string;
  sessionStartedRfc3339: string;
  lastActivityRfc3339: string;
  expiresAtRfc3339: string;
  idleTimeoutMinutes: number;
  permissions: string[];
};

type LockoutStatus = {
  locked: boolean;
  failures: number;
  lockedUntilRfc3339: string | null;
  secondsUntilUnlock: number | null;
};

type AuthEvent = {
  id: string;
  userId: string | null;
  actionName: string;
  entityType: string | null;
  entityId: string | null;
  detailsJson: string | null;
  status: string;
  timestamp: string;
  severity?: string;
};

type SecurityDashboardMetrics = {
  activeSessionCount: number;
  sessionStartedRfc3339: string | null;
  failedLoginAttemptsLast24h: number;
  lockoutsTriggeredLast7d: number;
  lastPasswordChangedRfc3339: string | null;
  policyVersion: number;
  passwordHistoryDepth: number;
  warnings: string[];
  alerts: SecurityAlertItem[];
};

const PASSWORD_POLICY_RULES: Array<{
  id: string;
  label: string;
  check: (p: string) => boolean;
}> = [
  { id: 'len', label: 'At least 6 characters', check: p => p.length >= 6 },
  { id: 'upper', label: 'Has uppercase (A–Z)', check: p => /[A-Z]/.test(p) },
  { id: 'lower', label: 'Has lowercase (a–z)', check: p => /[a-z]/.test(p) },
  { id: 'digit', label: 'Has digit (0–9)', check: p => /[0-9]/.test(p) },
  {
    id: 'symbol',
    label: 'Has symbol (!@#$%…)',
    check: p => /[^A-Za-z0-9\s]/.test(p),
  },
  {
    id: 'space',
    label: 'No whitespace',
    check: p => p.length === 0 || !/\s/.test(p),
  },
];

function statusPill(status: string) {
  if (status === 'success')
    return <span className="im-status-pill is-active">SUCCESS</span>;
  if (status === 'warning')
    return <span className="im-status-pill is-warn">WARNING</span>;
  return (
    <span className="im-status-pill is-inactive">{status.toUpperCase()}</span>
  );
}

function severityPill(severity: string) {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL')
    return <span className="im-status-pill is-inactive">CRITICAL</span>;
  if (s === 'SECURITY')
    return <span className="im-status-pill is-accent">SECURITY</span>;
  if (s === 'WARNING')
    return <span className="im-status-pill is-warn">WARNING</span>;
  return <span className="im-status-pill is-neutral">INFO</span>;
}

export default function SecurityCenterPage() {
  const { user, refreshUser } = useUser();
  const callerUserId = useCurrentUserId();
  const canChangePassword = useHasPermission('security.change_password');
  const canManageLockout = useHasPermission('security.lockout_manage');

  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [policyDraft, setPolicyDraft] = useState<SecurityPolicy | null>(null);
  const [passwordHistoryDraft, setPasswordHistoryDraft] = useState<
    number | null
  >(null);
  const [trendDays, setTrendDays] = useState<SecurityTrendDay[]>([]);
  const [sessions, setSessions] = useState<DesktopSessionRow[]>([]);
  const [terminating, setTerminating] = useState(false);
  const [lockoutStatus, setLockoutStatus] = useState<LockoutStatus | null>(
    null
  );
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [metrics, setMetrics] = useState<SecurityDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [authPageSize, setAuthPageSize] = useState(10);
  const [authPageIndex, setAuthPageIndex] = useState(0);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [currentPwd, setCurrentPwd] = useState('');
  const [nextPwd, setNextPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changing, setChanging] = useState(false);

  const passwordChecks = useMemo(
    () =>
      PASSWORD_POLICY_RULES.map(rule => ({
        ...rule,
        passed: rule.check(nextPwd),
      })),
    [nextPwd]
  );
  const passwordsMatch = nextPwd.length > 0 && nextPwd === confirmPwd;
  const policyOk = passwordChecks.every(r => r.passed) && passwordsMatch;

  const loadAll = useCallback(async () => {
    if (!callerUserId.trim()) return;
    setLoading(true);
    try {
      const [s, lock, m, trend, sess] = await Promise.all([
        invoke<SecuritySettings>('get_security_settings', { callerUserId }),
        invoke<LockoutStatus>('get_lockout_status', {
          callerUserId,
          targetUserId: null,
        }),
        invoke<SecurityDashboardMetrics>('get_security_dashboard_metrics', {
          callerUserId,
        }),
        invoke<SecurityTrendDay[]>('get_security_trend_series', {
          callerUserId,
          days: 14,
        }),
        invoke<DesktopSessionRow[]>('get_active_desktop_sessions', {
          callerUserId,
        }),
      ]);
      setSettings(s);
      setPolicyDraft(s.policy);
      setPasswordHistoryDraft(s.passwordHistoryDepth);
      setLockoutStatus(lock);
      setMetrics(m);
      setTrendDays(trend);
      setSessions(sess);
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to load security settings.'));
    } finally {
      setLoading(false);
    }
  }, [callerUserId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadEvents = useCallback(async () => {
    if (!callerUserId.trim()) return;
    try {
      const evts = await invoke<AuthEvent[]>('get_recent_auth_events', {
        callerUserId,
        limit: authPageSize,
        offset: authPageIndex * authPageSize,
      });
      setEvents(evts);
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to load auth events.'));
    }
  }, [callerUserId, authPageSize, authPageIndex]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const onSavePolicy = useCallback(async () => {
    if (!policyDraft || passwordHistoryDraft == null) return;
    setSavingPolicy(true);
    try {
      const updated = await invoke<SecuritySettings>(
        'update_security_settings',
        {
          callerUserId,
          input: {
            lockoutThreshold: policyDraft.lockoutThreshold,
            lockoutWindowMinutes: policyDraft.lockoutWindowMinutes,
            lockoutDurationMinutes: policyDraft.lockoutDurationMinutes,
            idleTimeoutMinutes: policyDraft.idleTimeoutMinutes,
            passwordHistoryDepth: passwordHistoryDraft,
          },
        }
      );
      setSettings(updated);
      setPolicyDraft(updated.policy);
      setPasswordHistoryDraft(updated.passwordHistoryDepth);
      toast.success('Security policy updated.');
      void loadAll();
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to update security policy.'));
    } finally {
      setSavingPolicy(false);
    }
  }, [callerUserId, policyDraft, passwordHistoryDraft, loadAll]);

  const onTerminateSession = useCallback(
    async (sessionId: string) => {
      if (!canManageLockout) return;
      setTerminating(true);
      try {
        await invoke('terminate_desktop_session_for_admin', {
          callerUserId,
          targetSessionId: sessionId,
        });
        toast.success('Session terminated.');
        refreshUser();
        void loadAll();
      } catch (e) {
        toast.error(ipcErrorMessage(e, 'Failed to terminate session.'));
      } finally {
        setTerminating(false);
      }
    },
    [callerUserId, canManageLockout, loadAll, refreshUser]
  );

  const { criticalAlerts, warningAlerts } = useMemo(() => {
    const list = metrics?.alerts ?? [];
    return {
      criticalAlerts: list.filter(a => a.severity.toLowerCase() === 'critical'),
      warningAlerts: list.filter(a => a.severity.toLowerCase() === 'warning'),
    };
  }, [metrics?.alerts]);

  const policyFormUnchanged = useMemo(() => {
    if (!settings || !policyDraft || passwordHistoryDraft == null) return true;
    return (
      JSON.stringify(policyDraft) === JSON.stringify(settings.policy) &&
      passwordHistoryDraft === settings.passwordHistoryDepth
    );
  }, [settings, policyDraft, passwordHistoryDraft]);

  const onChangePassword = useCallback(async () => {
    if (!policyOk) {
      toast.error('Password does not meet the policy requirements.');
      return;
    }
    setChanging(true);
    try {
      await invoke('change_admin_password', {
        callerUserId,
        currentPassword: currentPwd,
        newPassword: nextPwd,
      });
      toast.success(
        'Password updated. Please use the new password next time you sign in.'
      );
      setCurrentPwd('');
      setNextPwd('');
      setConfirmPwd('');
    } catch (e) {
      const parsed = parseIpcError(e);
      toast.error(parsed?.message ?? 'Failed to change password.');
    } finally {
      setChanging(false);
    }
  }, [callerUserId, currentPwd, nextPwd, policyOk]);

  const onResetLockout = useCallback(async () => {
    try {
      await invoke('reset_account_lockout', {
        callerUserId,
        targetUserId: null,
      });
      toast.success('Account lockout reset.');
      void loadAll();
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to reset lockout.'));
    }
  }, [callerUserId, loadAll]);

  const onLogoutAll = useCallback(async () => {
    try {
      await invoke('clear_desktop_session');
      toast.success('Session ended.');
      refreshUser();
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to end session.'));
    }
  }, [refreshUser]);

  return (
    <div className="im-page">
      <AppBar
        crumbs={['Import Manager', 'Administration', 'Security Center']}
      />
      <div
        className="im-dashboard-body"
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
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
            Security Center
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 11.5,
              color: 'var(--color-im-faint)',
            }}
          >
            Manage the administrator password, session controls, and account
            lockout policy. All changes are recorded in the activity log.
          </p>
        </div>

        {criticalAlerts.length > 0 ? (
          <div
            style={{
              border: '1px solid var(--color-im-bad)',
              borderRadius: 4,
              padding: '12px 16px',
              background: 'rgba(var(--color-im-bad-rgb, 220,53,69),0.08)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--color-im-bad)',
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <AlertTriangle size={16} /> Critical security alerts
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5 }}>
              {criticalAlerts.map(a => (
                <li key={`${a.code}-${a.message.slice(0, 40)}`}>{a.message}</li>
              ))}
            </ul>
          </div>
        ) : warningAlerts.length > 0 ? (
          <div
            style={{
              border: '1px solid var(--color-im-accent)',
              borderRadius: 4,
              padding: '12px 16px',
              background: 'rgba(232,162,58,0.08)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--color-im-accent)',
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <AlertTriangle size={16} /> Security warnings
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12.5 }}>
              {warningAlerts.map(a => (
                <li key={`${a.code}-${a.message.slice(0, 40)}`}>{a.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          {/* Security health */}
          <div className="im-section" style={{ gridColumn: 'span 1' }}>
            <div className="im-section__header">
              <span className="im-section__label">
                <Activity
                  style={{
                    display: 'inline',
                    width: 14,
                    height: 14,
                    marginRight: 4,
                  }}
                />
                // Security health
              </span>
              <span className="im-section__sub">
                Live metrics from the database and this desktop session.
              </span>
            </div>
            <div className="im-section__body" style={{ fontSize: 12.5 }}>
              {metrics ? (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        Active sessions
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>
                        {metrics.activeSessionCount}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        Policy version
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>
                        {metrics.policyVersion}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        Failed logins (24h)
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>
                        {metrics.failedLoginAttemptsLast24h}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        Lockouts (7d)
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 600 }}>
                        {metrics.lockoutsTriggeredLast7d}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div
                      style={{ fontSize: 11.5, color: 'var(--color-im-muted)' }}
                    >
                      Password history depth
                    </div>
                    <div style={{ fontWeight: 500 }}>
                      {metrics.passwordHistoryDepth}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{ fontSize: 11.5, color: 'var(--color-im-muted)' }}
                    >
                      Session started
                    </div>
                    <div style={{ fontWeight: 500 }}>
                      {metrics.sessionStartedRfc3339
                        ? formatAppDateTime(metrics.sessionStartedRfc3339)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{ fontSize: 11.5, color: 'var(--color-im-muted)' }}
                    >
                      Last password change
                    </div>
                    <div style={{ fontWeight: 500 }}>
                      {metrics.lastPasswordChangedRfc3339
                        ? formatAppDateTime(metrics.lastPasswordChangedRfc3339)
                        : '—'}
                    </div>
                  </div>
                  {metrics.warnings.length > 0 ? (
                    <div
                      style={{
                        border: '1px solid var(--color-im-bad)',
                        borderRadius: 4,
                        padding: '6px 10px',
                      }}
                    >
                      <div
                        style={{
                          color: 'var(--color-im-bad)',
                          fontSize: 11.5,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        Warnings
                      </div>
                      <ul
                        style={{
                          color: 'var(--color-im-muted)',
                          fontSize: 11.5,
                          margin: 0,
                          paddingLeft: 16,
                        }}
                      >
                        {metrics.warnings.map(w => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p
                      style={{
                        color: 'var(--color-im-faint)',
                        fontSize: 11.5,
                        margin: 0,
                      }}
                    >
                      No active warnings.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--color-im-muted)' }}>Loading…</div>
              )}
            </div>
          </div>

          {/* Active session */}
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">
                <ShieldCheck
                  style={{
                    display: 'inline',
                    width: 14,
                    height: 14,
                    marginRight: 4,
                  }}
                />
                // Active session
              </span>
              <span className="im-section__sub">
                Tracks the desktop session bound to this user.
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
              <div>
                <span style={{ color: 'var(--color-im-muted)' }}>User:</span>{' '}
                <span style={{ fontWeight: 500 }}>{user?.name ?? '—'}</span>
                {user?.role ? (
                  <span
                    className="im-badge is-neutral"
                    style={{ marginLeft: 8 }}
                  >
                    {user.role}
                  </span>
                ) : null}
              </div>
              <div>
                <span style={{ color: 'var(--color-im-muted)' }}>
                  Idle timeout:
                </span>{' '}
                {settings ? `${settings.policy.idleTimeoutMinutes} min` : '—'}
              </div>
              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid var(--color-im-rule)',
                  margin: '4px 0',
                }}
              />
              <div>
                <button
                  className="im-btn im-btn--sm"
                  onClick={() => void onLogoutAll()}
                  disabled={loading}
                >
                  End session
                </button>
              </div>
            </div>
          </div>

          {/* Account lockout */}
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">
                <ShieldAlert
                  style={{
                    display: 'inline',
                    width: 14,
                    height: 14,
                    marginRight: 4,
                  }}
                />
                // Account lockout
              </span>
              <span className="im-section__sub">
                Status of the administrator account.
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
              {lockoutStatus ? (
                <>
                  <div>
                    <span style={{ color: 'var(--color-im-muted)' }}>
                      State:
                    </span>{' '}
                    {lockoutStatus.locked ? (
                      <span className="im-status-pill is-inactive">LOCKED</span>
                    ) : (
                      <span className="im-status-pill is-active">UNLOCKED</span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-im-muted)' }}>
                      Recent failures:
                    </span>{' '}
                    {lockoutStatus.failures}
                  </div>
                  {lockoutStatus.lockedUntilRfc3339 ? (
                    <div>
                      <span style={{ color: 'var(--color-im-muted)' }}>
                        Locked until:
                      </span>{' '}
                      {formatAppDateTime(lockoutStatus.lockedUntilRfc3339)}
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ color: 'var(--color-im-muted)' }}>Loading…</div>
              )}
              {canManageLockout ? (
                <div>
                  <button
                    className="im-btn im-btn--sm"
                    onClick={() => void onResetLockout()}
                    disabled={!lockoutStatus || loading}
                  >
                    Reset lockout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Active desktop sessions table */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Active desktop sessions
            </span>
            <span className="im-section__sub">
              Terminate a session to force sign-in again. Requires{' '}
              <code style={{ fontSize: 11 }}>security.lockout_manage</code>.
            </span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            {sessions.length === 0 ? (
              <p
                style={{
                  padding: 16,
                  color: 'var(--color-im-muted)',
                  fontSize: 12.5,
                }}
              >
                No active desktop session.
              </p>
            ) : (
              <div className="im-table-scroll">
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th">User</th>
                      <th className="im-th">Role</th>
                      <th className="im-th">Started</th>
                      <th className="im-th">Session id</th>
                      <th className="im-th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => (
                      <tr
                        key={s.sessionId}
                        className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                      >
                        <td className="im-td" style={{ fontWeight: 500 }}>
                          {s.username}
                        </td>
                        <td className="im-td">
                          <span className="im-badge is-neutral">{s.role}</span>
                        </td>
                        <td
                          className="im-td"
                          style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}
                        >
                          {formatAppDateTime(s.sessionStartedRfc3339)}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11,
                          }}
                        >
                          {s.sessionId.slice(0, 8)}…
                        </td>
                        <td className="im-td">
                          {canManageLockout ? (
                            <button
                              className="im-btn im-btn--danger im-btn--sm"
                              disabled={terminating}
                              onClick={() =>
                                void onTerminateSession(s.sessionId)
                              }
                            >
                              Terminate
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Security trends chart */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Security trends (14 days)
            </span>
            <span className="im-section__sub">
              Daily counts from the database: failed sign-ins, lockouts,
              successful password rotations.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ height: 320, width: '100%', minWidth: 0 }}
          >
            {trendDays.length === 0 ? (
              <p style={{ color: 'var(--color-im-muted)', fontSize: 12.5 }}>
                No trend data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart
                  data={trendDays}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-im-rule)"
                  />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    width={36}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="failedLogins"
                    name="Failed logins"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="lockouts"
                    name="Lockouts"
                    stroke="var(--color-im-bad)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="passwordChanges"
                    name="Password changes"
                    stroke="var(--color-im-good)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Change password */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Change administrator password
            </span>
            <span className="im-section__sub">
              Passwords are hashed with Argon2id and rotated immediately. Old
              password hashes are kept in the audit history.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {!canChangePassword ? (
              <p
                style={{
                  color: 'var(--color-im-muted)',
                  fontSize: 12.5,
                  margin: 0,
                }}
              >
                Your role does not include `security.change_password`.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label htmlFor="sec-current" className="im-field-label">
                      Current password
                    </label>
                    <input
                      id="sec-current"
                      className="im-input"
                      type="password"
                      value={currentPwd}
                      onChange={e => setCurrentPwd(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label htmlFor="sec-new" className="im-field-label">
                      New password
                    </label>
                    <input
                      id="sec-new"
                      className="im-input"
                      type="password"
                      value={nextPwd}
                      onChange={e => setNextPwd(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label htmlFor="sec-confirm" className="im-field-label">
                      Confirm new password
                    </label>
                    <input
                      id="sec-confirm"
                      className="im-input"
                      type="password"
                      value={confirmPwd}
                      onChange={e => setConfirmPwd(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <ul
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 4,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    fontSize: 11.5,
                  }}
                >
                  {passwordChecks.map(rule => (
                    <li
                      key={rule.id}
                      style={{
                        color: rule.passed
                          ? 'var(--color-im-good)'
                          : 'var(--color-im-muted)',
                      }}
                    >
                      {rule.passed ? '✓' : '·'} {rule.label}
                    </li>
                  ))}
                  <li
                    style={{
                      color: passwordsMatch
                        ? 'var(--color-im-good)'
                        : 'var(--color-im-muted)',
                    }}
                  >
                    {passwordsMatch ? '✓' : '·'} New and confirm match
                  </li>
                </ul>
                <div>
                  <button
                    className="im-btn im-btn--primary"
                    onClick={() => void onChangePassword()}
                    disabled={changing || !policyOk || currentPwd.length === 0}
                  >
                    {changing ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Lockout & idle policy */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Lockout &amp; idle policy
            </span>
            <span className="im-section__sub">
              Applies to every desktop login. Stored in `app_settings`.
            </span>
          </div>
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {policyDraft ? (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 12,
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">Lockout threshold</label>
                    <input
                      className="im-input"
                      type="number"
                      min={1}
                      max={20}
                      value={policyDraft.lockoutThreshold}
                      onChange={e =>
                        setPolicyDraft({
                          ...policyDraft,
                          lockoutThreshold: Number(e.target.value || 0),
                        })
                      }
                      disabled={!canManageLockout}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">Window (minutes)</label>
                    <input
                      className="im-input"
                      type="number"
                      min={1}
                      max={1440}
                      value={policyDraft.lockoutWindowMinutes}
                      onChange={e =>
                        setPolicyDraft({
                          ...policyDraft,
                          lockoutWindowMinutes: Number(e.target.value || 0),
                        })
                      }
                      disabled={!canManageLockout}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">
                      Lock duration (minutes)
                    </label>
                    <input
                      className="im-input"
                      type="number"
                      min={1}
                      max={10080}
                      value={policyDraft.lockoutDurationMinutes}
                      onChange={e =>
                        setPolicyDraft({
                          ...policyDraft,
                          lockoutDurationMinutes: Number(e.target.value || 0),
                        })
                      }
                      disabled={!canManageLockout}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">
                      Idle timeout (minutes)
                    </label>
                    <input
                      className="im-input"
                      type="number"
                      min={1}
                      max={720}
                      value={policyDraft.idleTimeoutMinutes}
                      onChange={e =>
                        setPolicyDraft({
                          ...policyDraft,
                          idleTimeoutMinutes: Number(e.target.value || 0),
                        })
                      }
                      disabled={!canManageLockout}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <label className="im-field-label">
                      Password history depth
                    </label>
                    <input
                      className="im-input"
                      type="number"
                      min={settings?.passwordHistoryDepthMin ?? 1}
                      max={settings?.passwordHistoryDepthMax ?? 24}
                      value={passwordHistoryDraft ?? ''}
                      onChange={e =>
                        setPasswordHistoryDraft(
                          Number(e.target.value || 0) ||
                            (settings?.passwordHistoryDepthMin ?? 1)
                        )
                      }
                      disabled={!canManageLockout}
                    />
                    <p
                      style={{
                        color: 'var(--color-im-faint)',
                        fontSize: 11,
                        margin: 0,
                      }}
                    >
                      Reject new passwords matching any of the last N stored
                      hashes (range {settings?.passwordHistoryDepthMin ?? 1}–
                      {settings?.passwordHistoryDepthMax ?? 24}). Saving updates
                      policy version.
                    </p>
                  </div>
                </div>
                <div>
                  <button
                    className="im-btn im-btn--primary"
                    onClick={() => void onSavePolicy()}
                    disabled={
                      !canManageLockout || savingPolicy || policyFormUnchanged
                    }
                  >
                    {savingPolicy ? 'Saving…' : 'Save policy'}
                  </button>
                </div>
              </>
            ) : (
              <p
                style={{
                  color: 'var(--color-im-muted)',
                  fontSize: 12.5,
                  margin: 0,
                }}
              >
                Loading…
              </p>
            )}
          </div>
        </div>

        {/* Recent auth events */}
        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Recent authentication events
            </span>
            <span className="im-section__sub">
              Server-side paginated view of{' '}
              <code style={{ fontSize: 11 }}>auth.*</code> events from the
              activity audit log.
            </span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            {/* Pagination toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                borderBottom: '1px solid var(--color-im-rule)',
                flexWrap: 'wrap',
              }}
            >
              <label
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-im-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Rows per page
                <select
                  className="im-input"
                  style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}
                  value={authPageSize}
                  onChange={e => {
                    setAuthPageSize(Number(e.target.value));
                    setAuthPageIndex(0);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={() => setAuthPageIndex(i => Math.max(0, i - 1))}
                disabled={loading || authPageIndex === 0}
              >
                Previous
              </button>
              <button
                type="button"
                className="im-btn im-btn--sm"
                onClick={() => setAuthPageIndex(i => i + 1)}
                disabled={loading || events.length < authPageSize}
              >
                Next
              </button>
              <span className="im-badge is-neutral" style={{ fontSize: 11 }}>
                Page {authPageIndex + 1} · {events.length} row(s)
              </span>
            </div>
            <div className="im-table-scroll">
              <table className="im-table">
                <thead>
                  <tr>
                    <th className="im-th">Time</th>
                    <th className="im-th">Event</th>
                    <th className="im-th">Severity</th>
                    <th className="im-th">Status</th>
                    <th className="im-th">User</th>
                    <th className="im-th">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr className="im-tr">
                      <td
                        className="im-td"
                        colSpan={6}
                        style={{
                          textAlign: 'center',
                          color: 'var(--color-im-muted)',
                        }}
                      >
                        No events recorded.
                      </td>
                    </tr>
                  ) : (
                    events.map((ev, i) => (
                      <tr
                        key={ev.id}
                        className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                      >
                        <td
                          className="im-td"
                          style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}
                        >
                          {formatAppDateTime(ev.timestamp)}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11.5,
                          }}
                        >
                          {ev.actionName}
                        </td>
                        <td className="im-td">
                          {severityPill(ev.severity ?? 'INFO')}
                        </td>
                        <td className="im-td">{statusPill(ev.status)}</td>
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11.5,
                          }}
                        >
                          {ev.userId ?? '—'}
                        </td>
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11,
                          }}
                        >
                          {ev.detailsJson ?? ''}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
