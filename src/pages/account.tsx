import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { toast } from 'sonner';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppBar, PageHeader } from '@/components/shared/im';
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
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'Account']} />
        <PageHeader
          title="Account Details"
          subtitle="User information not found. Please log in again."
        />
      </div>
    );
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Account']} />
      <PageHeader
        title="Account Details"
        subtitle="Manage your user account information and preferences"
      />
      <div className="im-dashboard-body">
        <div className="im-section">
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
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
        </div>
      </div>
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
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Account', 'Update Profile']} />
      <PageHeader title="Update Profile" />
      <div className="im-dashboard-body">
        <div className="im-section">
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div>
              <label className="im-field-label">Name</label>
              <input
                className="im-input"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="im-field-label">Email</label>
              <input
                className="im-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => void save()}
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
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
    if (next.length < 6) {
      toast.error('Password must be at least 6 characters');
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
      <div className="im-page">
        <AppBar crumbs={['Import Manager', 'Account', 'Change Password']} />
        <PageHeader
          title="Change Password"
          subtitle="Your role does not include security.change_password."
        />
      </div>
    );
  }

  return (
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Account', 'Change Password']} />
      <PageHeader
        title="Change Password"
        subtitle="Open the security center for the full session, lockout, and audit view."
      />
      <div className="im-dashboard-body">
        <div className="im-section">
          <div
            className="im-section__body"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <p style={{ color: 'var(--color-im-muted)', fontSize: 13 }}>
              Open the{' '}
              <button
                type="button"
                style={{
                  color: 'var(--color-im-accent)',
                  textDecoration: 'underline',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
                onClick={() => navigate('/admin/security-center')}
              >
                security center
              </button>{' '}
              for the full session, lockout, and audit view.
            </p>
            <div>
              <label className="im-field-label">Current Password</label>
              <input
                className="im-input"
                type="password"
                value={current}
                onChange={e => setCurrent(e.target.value)}
                autoComplete="current-password"
                disabled={busy}
              />
            </div>
            <div>
              <label className="im-field-label">New Password</label>
              <input
                className="im-input"
                type="password"
                value={next}
                onChange={e => setNext(e.target.value)}
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
            <div>
              <label className="im-field-label">Confirm Password</label>
              <input
                className="im-input"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
            <div>
              <button
                type="button"
                className="im-btn im-btn--primary"
                onClick={() => void change()}
                disabled={busy}
              >
                {busy ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
