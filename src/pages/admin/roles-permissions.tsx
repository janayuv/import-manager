import { invoke } from '@tauri-apps/api/core';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ipcErrorMessage } from '@/lib/ipc-error';
import {
  PERMISSIONS,
  ROLES,
  type Permission,
  type Role,
} from '@/lib/permissions';
import { useCurrentUserId, useUser } from '@/lib/user-context';

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
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Roles & permissions
        </h1>
        <p className="text-muted-foreground text-sm">
          Read-only view of the canonical role-to-permission matrix shared by
          the Rust IPC layer and the React UI.
        </p>
      </div>

      {adminRows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Bootstrap administrator</CardTitle>
            <CardDescription>
              No administrator role is configured. Click below to assign the
              currently signed-in user as the first administrator. This action
              is allowed exactly once and is recorded in the audit log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onBootstrap} disabled={bootstrapping || !user?.id}>
              {bootstrapping
                ? 'Assigning…'
                : `Bootstrap as ${user?.name ?? 'current user'}`}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map(role => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base capitalize">
                {role}
                {role === 'administrator' ? (
                  <Badge variant="default">superuser</Badge>
                ) : null}
              </CardTitle>
              <CardDescription>{ROLE_DESCRIPTION[role]}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground text-xs">
                {grantedSet.get(role)?.size ?? 0} of {PERMISSIONS.length}{' '}
                permissions
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
          <CardDescription>
            Mirrors `src-tauri/src/security/permissions.rs::role_has`. A check
            mark means the role grants the permission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission</TableHead>
                  {ROLES.map(role => (
                    <TableHead key={role} className="text-center capitalize">
                      {role}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {PERMISSIONS.map((permission: Permission) => (
                  <TableRow key={permission}>
                    <TableCell className="font-mono text-xs">
                      {permission}
                    </TableCell>
                    {ROLES.map(role => {
                      const allowed =
                        role === 'administrator' ||
                        grantedSet.get(role)?.has(permission);
                      return (
                        <TableCell key={role} className="text-center">
                          {allowed ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-500" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role assignments</CardTitle>
          <CardDescription>
            Users currently mapped to a role in `user_roles`.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userRoles.length === 0 ? (
            <p className="text-muted-foreground text-sm">No role rows.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRoles.map(row => (
                  <TableRow key={row.id ?? row.user_id}>
                    <TableCell className="font-mono text-xs">
                      {row.user_id}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{row.created_at}</TableCell>
                    <TableCell className="text-xs">{row.updated_at}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
