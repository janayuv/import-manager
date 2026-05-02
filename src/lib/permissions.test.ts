import { describe, expect, it } from 'vitest';

import {
  isPermission,
  normalizeRole,
  permissionsFor,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  rolePermissionsSnapshot,
  roleHas,
  roleStringHas,
  type Permission,
  type Role,
} from './permissions';

/**
 * The Rust matrix lives in `src-tauri/src/security/permissions.rs` and is
 * exposed via the `get_role_permissions_matrix` IPC. The expected snapshot
 * below is mirrored from `permissions::role_permissions_snapshot()`. If you
 * change the Rust matrix update both sides; an integration test on the Rust
 * side asserts that `role_permissions_snapshot()` matches this exact shape.
 */
const EXPECTED_RUST_SNAPSHOT: Array<{ role: Role; permissions: Permission[] }> =
  [
    {
      role: 'administrator',
      permissions: [...PERMISSIONS],
    },
    {
      role: 'manager',
      permissions: [
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
      ],
    },
    {
      role: 'operator',
      permissions: ['data.read', 'data.write', 'recycle_bin.view'],
    },
    {
      role: 'viewer',
      permissions: [
        'data.read',
        'audit.view',
        'recycle_bin.view',
        'automation.view',
      ],
    },
  ];

describe('permissions matrix', () => {
  it('administrator has every permission', () => {
    for (const p of PERMISSIONS) {
      expect(roleHas('administrator', p), `admin missing ${p}`).toBe(true);
    }
  });

  it('viewer cannot write or delete', () => {
    expect(roleHas('viewer', 'data.read')).toBe(true);
    expect(roleHas('viewer', 'data.write')).toBe(false);
    expect(roleHas('viewer', 'data.delete')).toBe(false);
  });

  it('manager cannot manage roles or change passwords', () => {
    expect(roleHas('manager', 'role.write')).toBe(false);
    expect(roleHas('manager', 'role.bootstrap')).toBe(false);
    expect(roleHas('manager', 'security.change_password')).toBe(false);
  });

  it('operator can write data but cannot view audit log', () => {
    expect(roleHas('operator', 'data.write')).toBe(true);
    expect(roleHas('operator', 'audit.view')).toBe(false);
    expect(roleHas('operator', 'admin.activity_log')).toBe(false);
  });

  it('null role returns false for every permission', () => {
    for (const p of PERMISSIONS) {
      expect(roleHas(null, p)).toBe(false);
      expect(roleHas(undefined, p)).toBe(false);
    }
  });

  it('snapshot matches the Rust security::permissions matrix', () => {
    expect(rolePermissionsSnapshot()).toEqual(EXPECTED_RUST_SNAPSHOT);
  });

  it('every declared role has an entry in ROLE_PERMISSIONS', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });
});

describe('normalizeRole', () => {
  it('accepts canonical names', () => {
    expect(normalizeRole('administrator')).toBe('administrator');
    expect(normalizeRole('manager')).toBe('manager');
    expect(normalizeRole('operator')).toBe('operator');
    expect(normalizeRole('viewer')).toBe('viewer');
  });

  it('accepts legacy aliases', () => {
    expect(normalizeRole('admin')).toBe('administrator');
    expect(normalizeRole('Admin')).toBe('administrator');
    expect(normalizeRole(' DB Manager ')).toBe('manager');
    expect(normalizeRole('user')).toBe('operator');
    expect(normalizeRole('readonly')).toBe('viewer');
  });

  it('returns null for unknown values', () => {
    expect(normalizeRole('superuser')).toBeNull();
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole(null)).toBeNull();
  });
});

describe('roleStringHas + helpers', () => {
  it('handles raw role strings via normalization', () => {
    expect(roleStringHas('admin', 'role.write')).toBe(true);
    expect(roleStringHas('viewer', 'data.write')).toBe(false);
    expect(roleStringHas('user', 'data.write')).toBe(true);
    expect(roleStringHas('nope', 'data.read')).toBe(false);
  });

  it('isPermission narrows known keys', () => {
    expect(isPermission('data.read')).toBe(true);
    expect(isPermission('not.a.permission')).toBe(false);
    expect(isPermission(42)).toBe(false);
  });

  it('permissionsFor returns deterministic ordering', () => {
    const a = permissionsFor('manager');
    const b = permissionsFor('manager');
    expect(a).toEqual(b);
  });
});
