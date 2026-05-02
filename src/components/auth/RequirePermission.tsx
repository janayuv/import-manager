import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { toast } from 'sonner';

import { useUser } from '@/lib/user-context';
import type { Permission } from '@/lib/permissions';

interface RequirePermissionProps {
  permission: Permission;
  /**
   * Where to redirect when the active user lacks the permission. Defaults to
   * `/` so users always land on a page they can see.
   */
  redirectTo?: string;
}

/**
 * Route element that gates child routes by permission. Renders a small
 * spinner while the session is loading, redirects with a toast if the user is
 * missing the permission, and otherwise renders `<Outlet />`.
 */
export function RequirePermission({
  permission,
  redirectTo = '/',
}: RequirePermissionProps) {
  const { isLoading, hasPermission, user } = useUser();
  const allowed = !isLoading && hasPermission(permission);
  const denied = !isLoading && !allowed;
  const toastedRef = useRef(false);

  useEffect(() => {
    if (denied && !toastedRef.current) {
      toastedRef.current = true;
      toast.error(
        user
          ? `You do not have permission to access that page (${permission}).`
          : 'Sign in is required to access that page.'
      );
    }
  }, [denied, permission, user]);

  if (isLoading) {
    return (
      <div
        className="flex h-full min-h-[40vh] w-full items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="text-muted-foreground h-10 w-10 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <Navigate
        to={redirectTo}
        replace
        state={{ deniedPermission: permission }}
      />
    );
  }

  return <Outlet />;
}
