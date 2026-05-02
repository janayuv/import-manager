import { invoke } from '@tauri-apps/api/core';
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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatAppDateTime } from '@/lib/app-timezone';
import { ipcErrorMessage, parseIpcError } from '@/lib/ipc-error';
import {
  useCurrentUserId,
  useHasPermission,
  useUser,
} from '@/lib/user-context';

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
  { id: 'len', label: 'At least 12 characters', check: p => p.length >= 12 },
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

function statusBadge(status: string) {
  if (status === 'success') {
    return <Badge variant="default">success</Badge>;
  }
  if (status === 'warning') {
    return <Badge className="bg-amber-600 hover:bg-amber-600">warning</Badge>;
  }
  return <Badge variant="destructive">{status}</Badge>;
}

function severityBadge(severity: string) {
  const s = severity.toUpperCase();
  if (s === 'CRITICAL') {
    return <Badge variant="destructive">critical</Badge>;
  }
  if (s === 'SECURITY') {
    return (
      <Badge className="bg-violet-700 hover:bg-violet-700">security</Badge>
    );
  }
  if (s === 'WARNING') {
    return <Badge className="bg-amber-600 hover:bg-amber-600">warning</Badge>;
  }
  return <Badge variant="secondary">info</Badge>;
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
      const [s, lock, evts, m, trend, sess] = await Promise.all([
        invoke<SecuritySettings>('get_security_settings', {
          callerUserId,
        }),
        invoke<LockoutStatus>('get_lockout_status', {
          callerUserId,
          targetUserId: null,
        }),
        invoke<AuthEvent[]>('get_recent_auth_events', {
          callerUserId,
          limit: 50,
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
      setEvents(evts);
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
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Security center
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage the administrator password, session controls, and account
          lockout policy. All changes are recorded in the activity log.
        </p>
      </div>

      {criticalAlerts.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Critical security alerts</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {criticalAlerts.map(a => (
                <li key={`${a.code}-${a.message.slice(0, 40)}`}>{a.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : warningAlerts.length > 0 ? (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100">
          <AlertTriangle className="text-amber-600" />
          <AlertTitle>Security warnings</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {warningAlerts.map(a => (
                <li key={`${a.code}-${a.message.slice(0, 40)}`}>{a.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="md:col-span-2 lg:col-span-1 lg:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Security health
            </CardTitle>
            <CardDescription>
              Live metrics from the database and this desktop session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {metrics ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-muted-foreground text-xs">
                      Active sessions
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {metrics.activeSessionCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      Policy version
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {metrics.policyVersion}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      Failed logins (24h)
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {metrics.failedLoginAttemptsLast24h}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">
                      Lockouts (7d)
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {metrics.lockoutsTriggeredLast7d}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    Password history depth
                  </div>
                  <div className="font-medium tabular-nums">
                    {metrics.passwordHistoryDepth}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    Session started
                  </div>
                  <div className="font-medium">
                    {metrics.sessionStartedRfc3339
                      ? formatAppDateTime(metrics.sessionStartedRfc3339)
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    Last password change
                  </div>
                  <div className="font-medium">
                    {metrics.lastPasswordChangedRfc3339
                      ? formatAppDateTime(metrics.lastPasswordChangedRfc3339)
                      : '—'}
                  </div>
                </div>
                {metrics.warnings.length > 0 ? (
                  <div className="border-destructive/30 bg-destructive/5 rounded-md border p-2">
                    <div className="text-destructive mb-1 text-xs font-medium">
                      Warnings
                    </div>
                    <ul className="text-muted-foreground list-inside list-disc text-xs">
                      {metrics.warnings.map(w => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No active warnings.
                  </p>
                )}
              </>
            ) : (
              <div className="text-muted-foreground">Loading…</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Active session
            </CardTitle>
            <CardDescription>
              Tracks the desktop session bound to this user.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">User:</span>{' '}
              <span className="font-medium">{user?.name ?? '—'}</span>
              {user?.role ? (
                <Badge className="ml-2" variant="outline">
                  {user.role}
                </Badge>
              ) : null}
            </div>
            <div>
              <span className="text-muted-foreground">Idle timeout:</span>{' '}
              {settings ? `${settings.policy.idleTimeoutMinutes} min` : '—'}
            </div>
            <Separator />
            <Button
              variant="outline"
              size="sm"
              onClick={onLogoutAll}
              disabled={loading}
            >
              End session
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active desktop sessions</CardTitle>
            <CardDescription>
              Terminate a session to force sign-in again. Requires{' '}
              <code className="text-xs">security.lockout_manage</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No active desktop session.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Session id</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map(s => (
                    <TableRow key={s.sessionId}>
                      <TableCell className="font-medium">
                        {s.username}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.role}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatAppDateTime(s.sessionStartedRfc3339)}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {s.sessionId.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        {canManageLockout ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={terminating}
                            onClick={() => void onTerminateSession(s.sessionId)}
                          >
                            Terminate
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Account lockout
            </CardTitle>
            <CardDescription>
              Status of the administrator account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lockoutStatus ? (
              <>
                <div>
                  <span className="text-muted-foreground">State:</span>{' '}
                  {lockoutStatus.locked ? (
                    <Badge variant="destructive">Locked</Badge>
                  ) : (
                    <Badge variant="default">Unlocked</Badge>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Recent failures:
                  </span>{' '}
                  {lockoutStatus.failures}
                </div>
                {lockoutStatus.lockedUntilRfc3339 ? (
                  <div>
                    <span className="text-muted-foreground">Locked until:</span>{' '}
                    {formatAppDateTime(lockoutStatus.lockedUntilRfc3339)}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-muted-foreground">Loading…</div>
            )}
            {canManageLockout ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetLockout}
                disabled={!lockoutStatus || loading}
              >
                Reset lockout
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Security trends (14 days)</CardTitle>
          <CardDescription>
            Daily counts from the database: failed sign-ins, lockouts,
            successful password rotations.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px] w-full min-w-0">
          {trendDays.length === 0 ? (
            <p className="text-muted-foreground text-sm">No trend data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={trendDays}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="passwordChanges"
                  name="Password changes"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change administrator password</CardTitle>
          <CardDescription>
            Passwords are hashed with Argon2id and rotated immediately. Old
            password hashes are kept in the audit history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canChangePassword ? (
            <p className="text-muted-foreground text-sm">
              Your role does not include `security.change_password`.
            </p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="sec-current">Current password</Label>
                  <Input
                    id="sec-current"
                    type="password"
                    value={currentPwd}
                    onChange={e => setCurrentPwd(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sec-new">New password</Label>
                  <Input
                    id="sec-new"
                    type="password"
                    value={nextPwd}
                    onChange={e => setNextPwd(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sec-confirm">Confirm new password</Label>
                  <Input
                    id="sec-confirm"
                    type="password"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <ul className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
                {passwordChecks.map(rule => (
                  <li
                    key={rule.id}
                    className={rule.passed ? 'text-emerald-600' : ''}
                  >
                    {rule.passed ? '✓' : '·'} {rule.label}
                  </li>
                ))}
                <li className={passwordsMatch ? 'text-emerald-600' : ''}>
                  {passwordsMatch ? '✓' : '·'} New and confirm match
                </li>
              </ul>
              <Button
                onClick={onChangePassword}
                disabled={changing || !policyOk || currentPwd.length === 0}
              >
                {changing ? 'Updating…' : 'Update password'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lockout & idle policy</CardTitle>
          <CardDescription>
            Applies to every desktop login. Stored in `app_settings`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policyDraft ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1">
                  <Label>Lockout threshold</Label>
                  <Input
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
                <div className="space-y-1">
                  <Label>Window (minutes)</Label>
                  <Input
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
                <div className="space-y-1">
                  <Label>Lock duration (minutes)</Label>
                  <Input
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
                <div className="space-y-1">
                  <Label>Idle timeout (minutes)</Label>
                  <Input
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
                <div className="space-y-1 md:col-span-2 lg:col-span-1">
                  <Label>Password history depth</Label>
                  <Input
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
                  <p className="text-muted-foreground text-[11px]">
                    Reject new passwords matching any of the last N stored
                    hashes (range {settings?.passwordHistoryDepthMin ?? 1}–
                    {settings?.passwordHistoryDepthMax ?? 24}
                    ). Saving updates policy version.
                  </p>
                </div>
              </div>
              <Button
                onClick={onSavePolicy}
                disabled={
                  !canManageLockout || savingPolicy || policyFormUnchanged
                }
              >
                {savingPolicy ? 'Saving…' : 'Save policy'}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent authentication events</CardTitle>
          <CardDescription>
            Last 50 entries from the user activity audit log filtered to
            `auth.*`.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-muted-foreground text-center"
                  >
                    No events recorded.
                  </TableCell>
                </TableRow>
              ) : (
                events.map(ev => (
                  <TableRow key={ev.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatAppDateTime(ev.timestamp)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.actionName}
                    </TableCell>
                    <TableCell>
                      {severityBadge(ev.severity ?? 'INFO')}
                    </TableCell>
                    <TableCell>{statusBadge(ev.status)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.userId ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {ev.detailsJson ?? ''}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
