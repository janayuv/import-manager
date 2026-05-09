import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  authenticateUser,
  setAuthenticated,
  userFromDesktopSession,
  type DesktopSessionInfo,
} from '@/lib/auth';
import { isTauriEnvironment } from '@/lib/tauri-bridge';
import { ipcErrorMessage, parseIpcError } from '@/lib/ipc-error';

type LockedState = { lockedUntilSeconds: number; message: string };

type DesktopAuthSetupStatus = {
  setupRequired: boolean;
};

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lockState, setLockState] = useState<LockedState | null>(null);
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPassword2, setRecoveryPassword2] = useState('');

  useEffect(() => {
    if (!isTauriEnvironment) return;
    void invoke<boolean>('is_recovery_mode_active')
      .then(setRecoveryActive)
      .catch(() => setRecoveryActive(false));
  }, []);

  useEffect(() => {
    if (!isTauriEnvironment) return;

    let cancelled = false;
    void (async () => {
      try {
        const status = await invoke<DesktopAuthSetupStatus>(
          'get_desktop_auth_setup_status'
        );
        if (!cancelled && status.setupRequired) {
          navigate('/setup', { replace: true });
        }
      } catch {
        /* allow login */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!lockState) return;
    const timer = window.setTimeout(
      () => {
        setLockState(null);
      },
      Math.max(1000, (lockState.lockedUntilSeconds + 1) * 1000)
    );
    return () => window.clearTimeout(timer);
  }, [lockState]);

  const handleLogin = async () => {
    if (!username || !password) {
      toast.error('Please enter both username and password');
      return;
    }

    setIsLoading(true);

    try {
      if (isTauriEnvironment) {
        const session = await invoke<DesktopSessionInfo>(
          'authenticate_desktop',
          {
            username,
            password,
            rememberMe,
          }
        );
        const user = userFromDesktopSession(session);
        setAuthenticated(true, user);
        setLockState(null);
        toast.success('Login successful!');
        navigate('/');
      } else {
        const result = await authenticateUser({ username, password });

        if (result.success && result.user) {
          setAuthenticated(true, result.user);
          toast.success('Login successful!');
          navigate('/');
        } else {
          toast.error(result.message);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      const parsed = parseIpcError(error);
      if (parsed?.code === 'auth_setup_required') {
        navigate('/setup', { replace: true });
        toast.info(parsed.message);
      } else if (parsed?.code === 'auth_locked') {
        const seconds = Number(parsed.details ?? 0);
        const minutes = Math.max(1, Math.ceil(seconds / 60));
        setLockState({
          lockedUntilSeconds: seconds,
          message: `Account locked. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        });
        toast.error(parsed.message);
      } else {
        toast.error(ipcErrorMessage(error, 'Login failed. Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const runRecoveryClearLockout = async () => {
    if (!isTauriEnvironment) return;
    setRecoveryBusy(true);
    try {
      await invoke('recovery_clear_lockout');
      setLockState(null);
      toast.success('Lockout cleared. You can sign in.');
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Could not clear lockout.'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const runRecoveryResetPolicy = async () => {
    if (!isTauriEnvironment) return;
    setRecoveryBusy(true);
    try {
      await invoke('recovery_reset_security_policy');
      toast.success('Security policy reset to defaults.');
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Could not reset policy.'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const runRecoverySetPassword = async () => {
    if (!isTauriEnvironment) return;
    if (recoveryPassword !== recoveryPassword2) {
      toast.error('New password fields do not match.');
      return;
    }
    setRecoveryBusy(true);
    try {
      await invoke('recovery_set_admin_password', {
        newPassword: recoveryPassword,
      });
      setRecoveryPassword('');
      setRecoveryPassword2('');
      toast.success('Administrator password updated.');
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Could not set password.'));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      void handleLogin();
    }
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-blue-600">
            Login
          </CardTitle>
          <CardDescription>
            Sign in to access your Import Manager account
          </CardDescription>
          {recoveryActive ? (
            <div
              role="status"
              className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
            >
              <strong className="font-medium">Recovery mode</strong> — lockout
              is bypassed for sign-in. Use the tools below only to regain
              access, then restart the app without{' '}
              <code className="text-xs">--recovery</code>.
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
              />
            </div>
            {isTauriEnvironment ? (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={v => setRememberMe(v === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="remember" className="text-sm font-normal">
                  Remember this device (30 days)
                </Label>
              </div>
            ) : null}
            {lockState && !recoveryActive ? (
              <div
                role="alert"
                data-testid="login-locked"
                className="border-destructive/40 bg-destructive/10 text-destructive rounded border px-3 py-2 text-sm"
              >
                {lockState.message}
              </div>
            ) : null}
            {recoveryActive ? (
              <div className="grid gap-3 rounded-md border border-dashed p-3 text-sm">
                <p className="text-muted-foreground text-xs">
                  Recovery-only actions (require launching with{' '}
                  <code className="text-xs">--recovery</code> or{' '}
                  <code className="text-xs">IMPORT_MANAGER_RECOVERY=1</code>).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={recoveryBusy}
                    onClick={() => void runRecoveryClearLockout()}
                  >
                    Clear lockout
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={recoveryBusy}
                    onClick={() => void runRecoveryResetPolicy()}
                  >
                    Reset security policy
                  </Button>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="recovery-pw">
                    New admin password (recovery)
                  </Label>
                  <Input
                    id="recovery-pw"
                    type="password"
                    autoComplete="new-password"
                    value={recoveryPassword}
                    onChange={e => setRecoveryPassword(e.target.value)}
                    disabled={recoveryBusy}
                  />
                  <Label htmlFor="recovery-pw2">Confirm password</Label>
                  <Input
                    id="recovery-pw2"
                    type="password"
                    autoComplete="new-password"
                    value={recoveryPassword2}
                    onChange={e => setRecoveryPassword2(e.target.value)}
                    disabled={recoveryBusy}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={
                      recoveryBusy ||
                      !recoveryPassword ||
                      recoveryPassword !== recoveryPassword2
                    }
                    onClick={() => void runRecoverySetPassword()}
                  >
                    Set administrator password
                  </Button>
                </div>
              </div>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              data-testid="login-submit"
              onClick={() => void handleLogin()}
              disabled={isLoading || (lockState !== null && !recoveryActive)}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
