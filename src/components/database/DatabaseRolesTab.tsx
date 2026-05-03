import { memo } from 'react';
import { Edit3, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { UserRole } from '@/components/database/types';

export interface DatabaseRolesTabProps {
  userRoles: UserRole[];
  onDeleteRole: (roleId: number) => void;
}

export const DatabaseRolesTab = memo(function DatabaseRolesTab({
  userRoles,
  onDeleteRole,
}: DatabaseRolesTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Roles</h2>
          <p className="text-muted-foreground">
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

      <Card>
        <CardHeader>
          <CardTitle>User Roles</CardTitle>
          <CardDescription>
            {userRoles.length} user roles configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userRoles.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>No user roles configured</p>
              <p className="text-sm">Create roles to manage user permissions</p>
            </div>
          ) : (
            <div className="space-y-4">
              {userRoles.map(role => (
                <div
                  key={role.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{role.user_id}</h3>
                      <Badge variant="outline">{role.role}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Created: {new Date(role.created_at).toLocaleDateString()}
                    </p>
                    {role.permissions && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Custom permissions: {role.permissions}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        toast.info('Role editing feature coming soon')
                      }
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDeleteRole(role.id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
});
