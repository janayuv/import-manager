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
import { getCurrentUser, setAuthenticated } from '@/lib/auth';
import type { User } from '@/lib/auth';
import { ipcErrorMessage } from '@/lib/ipc-error';
import {
  useCurrentUserId,
  useHasPermission,
  useUser,
} from '@/lib/user-context';

export const AccountDetailsPage = () => {
  const [user] = useState<User | null>(getCurrentUser());

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-blue-600">
              Account Details
            </CardTitle>
            <CardDescription>
              User information not found. Please log in again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-blue-600">
            Account Details
          </CardTitle>
          <CardDescription>
            Manage your user account information and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <strong>Name:</strong> {user.name}
            </div>
            <div>
              <strong>Email:</strong> {user.email}
            </div>
            <div>
              <strong>Username:</strong> {user.username}
            </div>
            <div>
              <strong>Role:</strong> {user.role}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const AccountUpdatePage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { refreshUser } = useUser();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      setName(currentUser.name);
      setEmail(currentUser.email);
    }
  }, []);

  const save = async () => {
    setIsLoading(true);
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        toast.error('User not found. Please log in again.');
        return;
      }

      // Update the user object with new data
      const updatedUser: User = {
        ...currentUser,
        name: name.trim(),
        email: email.trim(),
      };

      // Save the updated user data
      setAuthenticated(true, updatedUser);

      // Refresh the user context to update the UI
      refreshUser();

      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Update Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm">Name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="text-sm">Email</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <Button onClick={save} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export const AccountPasswordPage = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const callerUserId = useCurrentUserId();
  const canChangePassword = useHasPermission('security.change_password');

  const change = async () => {
    if (next.length < 12) {
      toast.error('Password must be at least 12 characters');
      return;
    }
    if (next !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await invoke('change_admin_password', {
        callerUserId,
        currentPassword: current,
        newPassword: next,
      });
      toast.success('Password updated. Use the new password next time.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to change password.'));
    } finally {
      setBusy(false);
    }
  };

  if (!canChangePassword) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Your role does not include `security.change_password`.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Open the{' '}
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => navigate('/admin/security-center')}
            >
              security center
            </button>{' '}
            for the full session, lockout, and audit view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm">Current Password</label>
            <Input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </div>
          <div>
            <label className="text-sm">New Password</label>
            <Input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
          <div>
            <label className="text-sm">Confirm Password</label>
            <Input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
          <Button onClick={() => void change()} disabled={busy}>
            {busy ? 'Updating…' : 'Update Password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
