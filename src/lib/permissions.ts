/**
 * Canonical Role and Permission catalog mirrored from
 * `src-tauri/src/security/permissions.rs`.
 *
 * Drift between the two layers is detected by `permissions.parity.test.ts`
 * which calls the Rust `get_role_permissions_matrix` IPC and compares it to
 * `ROLE_PERMISSIONS` here.
 */

export const ROLES = [
  'administrator',
  'manager',
  'operator',
  'viewer',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'data.read',
  'data.write',
  'data.delete',
  'backup.create',
  'backup.restore',
  'backup.schedule',
  'backup.settings',
  'audit.view',
  'recycle_bin.view',
  'recycle_bin.restore',
  'recycle_bin.purge',
  'admin.activity_log',
  'admin.user_activity',
  'admin.system_health',
  'admin.system_tools',
  'automation.view',
  'automation.mutate',
  'automation.ops_center',
  'role.read',
  'role.write',
  'role.bootstrap',
  'security.change_password',
  'security.session_read',
  'security.lockout_manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

/**
 * Maps a stored role string (canonical or legacy) onto the canonical Role.
 * Returns `null` for unknown values so callers can render safe fallbacks.
 */
export function normalizeRole(input: string | undefined | null): Role | null {
  if (!input) {
    return null;
  }
  const normalized = String(input).replace(/\s+/g, '').toLowerCase();
  switch (normalized) {
    case 'administrator':
    case 'admin':
      return 'administrator';
    case 'manager':
    case 'db_manager':
    case 'dbmanager':
      return 'manager';
    case 'operator':
    case 'user':
      return 'operator';
    case 'viewer':
    case 'readonly':
    case 'read_only':
      return 'viewer';
    default:
      return null;
  }
}

/**
 * Authoritative role -> permission matrix. Administrator implicitly has every
 * permission; the explicit set keeps the snapshot stable for the parity test.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  administrator: new Set<Permission>(PERMISSIONS),
  manager: new Set<Permission>([
    'data.read',
    'data.write',
    'data.delete',
    'backup.create',
    'backup.restore',
    'backup.schedule',
    'backup.settings',
    'audit.view',
    'recycle_bin.view',
    'recycle_bin.restore',
    'automation.view',
    'automation.mutate',
    'automation.ops_center',
    'security.session_read',
  ]),
  operator: new Set<Permission>([
    'data.read',
    'data.write',
    'recycle_bin.view',
  ]),
  viewer: new Set<Permission>([
    'data.read',
    'audit.view',
    'recycle_bin.view',
    'automation.view',
  ]),
};

/** Returns true iff the role is granted the permission (administrator bypasses). */
export function roleHas(
  role: Role | null | undefined,
  permission: Permission
): boolean {
  if (!role) {
    return false;
  }
  if (role === 'administrator') {
    return true;
  }
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Convenience for code paths that hold the raw role string. */
export function roleStringHas(
  rawRole: string | undefined | null,
  permission: Permission
): boolean {
  return roleHas(normalizeRole(rawRole), permission);
}

/** Permissions granted to `role`, in `PERMISSIONS` order. */
export function permissionsFor(role: Role | null | undefined): Permission[] {
  if (!role) {
    return [];
  }
  return PERMISSIONS.filter(p => roleHas(role, p));
}

/** Type-guard so backend-supplied permission lists can be narrowed safely. */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

/** Snapshot used by the parity test to compare against the Rust matrix. */
export function rolePermissionsSnapshot(): Array<{
  role: Role;
  permissions: Permission[];
}> {
  return ROLES.map(role => ({
    role,
    permissions: permissionsFor(role),
  }));
}
