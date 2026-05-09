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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ipcErrorMessage, parseIpcError } from '@/lib/ipc-error';
import { isTauriEnvironment } from '@/lib/tauri-bridge';

type DesktopAuthSetupStatus = {
  setupRequired: boolean;
};

export function SetupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isTauriEnvironment) {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const status = await invoke<DesktopAuthSetupStatus>(
          'get_desktop_auth_setup_status'
        );
        if (cancelled) return;
        if (!status.setupRequired) {
          navigate('/login', { replace: true });
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not check setup status. Try signing in.');
          navigate('/login', { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async () => {
    if (!username.trim() || !password || !passwordConfirm) {
      toast.error('Please fill in username and both password fields');
      return;
    }
    setIsLoading(true);
    try {
      await invoke('complete_desktop_admin_setup', {
        input: {
          username: username.trim(),
          password,
          passwordConfirm,
        },
      });
      toast.success(
        'Administrator account saved. Sign in with your credentials.'
      );
      navigate('/login', { replace: true });
    } catch (error) {
      const parsed = parseIpcError(error);
      if (
        parsed?.code === 'auth_config' &&
        parsed.message.includes('already configured')
      ) {
        navigate('/login', { replace: true });
      }
      toast.error(ipcErrorMessage(error, 'Could not finish setup'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      void handleSubmit();
    }
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-blue-600">
            Welcome — set up administrator
          </CardTitle>
          <CardDescription>
            This runs once per database. Choose your sign-in username and a
            strong password (stored only on this PC / your shared data folder).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="setup-username">Username</Label>
              <Input
                id="setup-username"
                autoComplete="username"
                placeholder="Administrator username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={isLoading}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setup-password">Password</Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                placeholder="Minimum 12 characters; upper, lower, digit, symbol"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isLoading}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setup-password-confirm">Confirm password</Label>
              <Input
                id="setup-password-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                disabled={isLoading}
                onKeyDown={handleKeyDown}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              data-testid="setup-submit"
              onClick={() => void handleSubmit()}
              disabled={
                isLoading || !username.trim() || !password || !passwordConfirm
              }
            >
              {isLoading ? 'Saving…' : 'Save and continue'}
            </Button>
            <button
              type="button"
              className="text-muted-foreground text-center text-xs underline-offset-4 hover:underline"
              disabled={isLoading}
              onClick={() => navigate('/login', { replace: true })}
            >
              Already set up — go to login
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
