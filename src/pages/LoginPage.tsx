import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import { useState } from 'react';

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
import { ipcErrorMessage } from '@/lib/ipc-error';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      toast.error(ipcErrorMessage(error, 'Login failed. Please try again.'));
    } finally {
      setIsLoading(false);
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
            <Button
              type="submit"
              className="w-full"
              data-testid="login-submit"
              onClick={() => void handleLogin()}
              disabled={isLoading}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
