import { safeInvoke as invoke } from '@/lib/ipc-safe';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ipcErrorMessage } from '@/lib/ipc-error';
import {
  PERMISSIONS,
  ROLES,
  type Permission,
  type Role,
} from '@/lib/permissions';
import { useCurrentUserId, useUser } from '@/lib/user-context';
import { AppBar } from '@/components/shared/im';

type MatrixRow = { role: string; permissions: string[] };
type UserRoleRow = {
  id?: number;
  user_id: string;
  role: string;
  permissions: string | null;
  created_at: string;
  updated_at: string;
};

const ROLE_DESCRIPTION: Record<Role, string> = {
  administrator:
    'Full access — bypasses every permission check. Reserved for the operator account (Jana).',
  manager:
    'Operates the database: backups, restores, audit, automation, soft-delete review.',
  operator:
    'Read/write data plus recycle-bin viewing. No backup or audit access.',
  viewer: 'Read-only data + audit log + automation observability.',
};

export default function RolesPermissionsPage() {
  const { user } = useUser();
  const callerUserId = useCurrentUserId();
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  const grantedSet = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const row of matrix) {
      out.set(row.role, new Set(row.permissions));
    }
    return out;
  }, [matrix]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, urs] = await Promise.all([
        invoke<MatrixRow[]>('get_role_permissions_matrix'),
        invoke<UserRoleRow[]>('get_user_roles', {
          callerUserId,
        }).catch(() => [] as UserRoleRow[]),
      ]);
      setMatrix(m);
      setUserRoles(urs);
    } catch (e) {
      toast.error(ipcErrorMessage(e, 'Failed to load roles & permissions.'));
    } finally {
      setLoading(false);
    }
  }, [callerUserId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const adminRows = userRoles.filter(
    r =>
      r.role.trim().toLowerCase() === 'administrator' ||
      r.role.trim().toLowerCase() === 'admin'
  );

  const onBootstrap = useCallback(async () => {
    if (!user?.id) {
      toast.error('Sign in before bootstrapping the admin role.');
      return;
    }
    setBootstrapping(true);
    try {
      await invoke('bootstrap_first_admin_if_eligible', {
        userId: user.id,
        callerUserId,
      });
      toast.success('Administrator role assigned.');
      void loadAll();
    } catch (e) {
      toast.error(
        ipcErrorMessage(e, 'Failed to bootstrap administrator role.')
      );
    } finally {
      setBootstrapping(false);
    }
  }, [callerUserId, loadAll, user?.id]);

  return (
    <div className="im-page">
      <AppBar
        crumbs={['Import Manager', 'Administration', 'Roles & Permissions']}
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
            Roles &amp; Permissions
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 11.5,
              color: 'var(--color-im-faint)',
            }}
          >
            Read-only view of the canonical role-to-permission matrix shared by
            the Rust IPC layer and the React UI.
          </p>
        </div>

        {adminRows.length === 0 ? (
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">
                // Bootstrap administrator
              </span>
            </div>
            <div
              className="im-section__body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: 'var(--color-im-muted)',
                }}
              >
                No administrator role is configured. Click below to assign the
                currently signed-in user as the first administrator. This action
                is allowed exactly once and is recorded in the audit log.
              </p>
              <div>
                <button
                  className="im-btn im-btn--primary"
                  onClick={() => void onBootstrap()}
                  disabled={bootstrapping || !user?.id}
                >
                  {bootstrapping
                    ? 'Assigning…'
                    : `Bootstrap as ${user?.name ?? 'current user'}`}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}
        >
          {ROLES.map(role => (
            <div key={role} className="im-section">
              <div className="im-section__header">
                <span
                  className="im-section__label"
                  style={{ textTransform: 'capitalize' }}
                >
                  // {role}
                  {role === 'administrator' ? (
                    <span
                      className="im-status-pill is-accent"
                      style={{ marginLeft: 8 }}
                    >
                      superuser
                    </span>
                  ) : null}
                </span>
              </div>
              <div
                className="im-section__body"
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: 'var(--color-im-muted)',
                  }}
                >
                  {ROLE_DESCRIPTION[role]}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11.5,
                    color: 'var(--color-im-faint)',
                  }}
                >
                  {grantedSet.get(role)?.size ?? 0} of {PERMISSIONS.length}{' '}
                  permissions
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Permission matrix</span>
            <span className="im-section__sub">
              Mirrors `src-tauri/src/security/permissions.rs::role_has`. A check
              mark means the role grants the permission.
            </span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            {loading ? (
              <p
                style={{
                  padding: 16,
                  color: 'var(--color-im-muted)',
                  fontSize: 12.5,
                }}
              >
                Loading…
              </p>
            ) : (
              <div className="im-table-scroll">
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th">Permission</th>
                      {ROLES.map(role => (
                        <th
                          key={role}
                          className="im-th"
                          style={{
                            textAlign: 'center',
                            textTransform: 'capitalize',
                          }}
                        >
                          {role}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map((permission: Permission, i) => (
                      <tr
                        key={permission}
                        className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                      >
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11.5,
                          }}
                        >
                          {permission}
                        </td>
                        {ROLES.map(role => {
                          const allowed =
                            role === 'administrator' ||
                            grantedSet.get(role)?.has(permission);
                          return (
                            <td
                              key={role}
                              className="im-td"
                              style={{ textAlign: 'center' }}
                            >
                              {allowed ? (
                                <Check
                                  style={{
                                    display: 'inline',
                                    width: 16,
                                    height: 16,
                                    color: 'var(--color-im-good)',
                                  }}
                                />
                              ) : (
                                <span
                                  style={{ color: 'var(--color-im-faint)' }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
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
            <span className="im-section__label">// Role assignments</span>
            <span className="im-section__sub">
              Users currently mapped to a role in `user_roles`.
            </span>
          </div>
          <div className="im-section__body" style={{ padding: 0 }}>
            {userRoles.length === 0 ? (
              <p
                style={{
                  padding: 16,
                  color: 'var(--color-im-muted)',
                  fontSize: 12.5,
                }}
              >
                No role rows.
              </p>
            ) : (
              <div className="im-table-scroll">
                <table className="im-table">
                  <thead>
                    <tr>
                      <th className="im-th">User ID</th>
                      <th className="im-th">Role</th>
                      <th className="im-th">Created</th>
                      <th className="im-th">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRoles.map((row, i) => (
                      <tr
                        key={row.id ?? row.user_id}
                        className={`im-tr${i % 2 !== 0 ? 'is-alt' : ''}`}
                      >
                        <td
                          className="im-td"
                          style={{
                            fontFamily: 'Consolas, "Courier New", monospace',
                            fontSize: 11.5,
                          }}
                        >
                          {row.user_id}
                        </td>
                        <td className="im-td">
                          <span className="im-badge is-neutral">
                            {row.role}
                          </span>
                        </td>
                        <td className="im-td" style={{ fontSize: 11.5 }}>
                          {row.created_at}
                        </td>
                        <td className="im-td" style={{ fontSize: 11.5 }}>
                          {row.updated_at}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
