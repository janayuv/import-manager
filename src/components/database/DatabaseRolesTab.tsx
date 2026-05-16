import { memo } from 'react';
import { Edit3, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/components/database/types';

const IM = {
  panel: '#101010',
  alt: '#0C0C0B',
  header: '#0D0D0B',
  text: '#EFEDE8',
  muted: '#8C8A82',
  rule: '#1F1E1A',
  accent: '#E8A23A',
  accentBg: 'rgba(232,162,58,0.10)',
  accentBdr: 'rgba(232,162,58,0.25)',
  blue: '#60A5FA',
  blueBg: 'rgba(96,165,250,0.08)',
  blueBdr: 'rgba(96,165,250,0.20)',
  mono: "Consolas, 'Courier New', monospace",
} as const;

export interface DatabaseRolesTabProps {
  userRoles: UserRole[];
  onDeleteRole: (roleId: number) => void;
}

export const DatabaseRolesTab = memo(function DatabaseRolesTab({
  userRoles,
  onDeleteRole,
}: DatabaseRolesTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 0',
          borderBottom: `1px solid ${IM.rule}`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2
            style={{
              fontFamily: IM.mono,
              fontSize: 13,
              fontWeight: 700,
              color: IM.text,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: 0,
            }}
          >
            User Roles
          </h2>
          <p
            style={{
              fontFamily: IM.mono,
              fontSize: 10,
              color: IM.muted,
              margin: 0,
              letterSpacing: '0.04em',
            }}
          >
            Manage user roles and permissions
          </p>
        </div>
        <Button
          onClick={() => toast.info('Role creation feature coming soon')}
          useAccentColor
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Role
        </Button>
      </div>

      {/* Roles panel */}
      <div
        style={{
          border: `1px solid ${IM.rule}`,
          background: IM.panel,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            background: IM.header,
            borderBottom: `1px solid ${IM.rule}`,
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: IM.mono,
              fontSize: 11,
              fontWeight: 700,
              color: IM.text,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            User Roles
          </span>
          <span
            style={{
              fontFamily: IM.mono,
              fontSize: 10,
              fontWeight: 700,
              color: IM.accent,
              background: IM.accentBg,
              border: `1px solid ${IM.accentBdr}`,
              padding: '1px 6px',
            }}
          >
            {userRoles.length}
          </span>
        </div>

        {/* Panel body */}
        <div>
          {userRoles.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                gap: 12,
              }}
            >
              <Users
                style={{ width: 36, height: 36, color: IM.muted, opacity: 0.5 }}
              />
              <p
                style={{
                  fontFamily: IM.mono,
                  fontSize: 12,
                  color: IM.muted,
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                No user roles configured
              </p>
              <p
                style={{
                  fontFamily: IM.mono,
                  fontSize: 10,
                  color: IM.muted,
                  margin: 0,
                  opacity: 0.7,
                }}
              >
                Create roles to manage user permissions
              </p>
            </div>
          ) : (
            <div>
              {userRoles.map((role, i) => (
                <div
                  key={role.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: i % 2 === 0 ? IM.panel : IM.alt,
                    borderBottom: `1px solid ${IM.rule}`,
                    minHeight: 56,
                    gap: 16,
                  }}
                >
                  {/* Role info */}
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: IM.mono,
                          fontSize: 12,
                          fontWeight: 700,
                          color: IM.text,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {role.user_id}
                      </span>
                      <span
                        style={{
                          fontFamily: IM.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '1px 6px',
                          background: IM.blueBg,
                          color: IM.blue,
                          border: `1px solid ${IM.blueBdr}`,
                        }}
                      >
                        {role.role}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: IM.mono,
                        fontSize: 10,
                        color: IM.muted,
                        opacity: 0.8,
                      }}
                    >
                      Created: {new Date(role.created_at).toLocaleDateString()}
                    </span>
                    {role.permissions && (
                      <span
                        style={{
                          fontFamily: IM.mono,
                          fontSize: 10,
                          color: IM.muted,
                          opacity: 0.7,
                        }}
                      >
                        Custom permissions: {role.permissions}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        toast.info('Role editing feature coming soon')
                      }
                      title="Edit role"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDeleteRole(role.id!)}
                      title="Delete role"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
