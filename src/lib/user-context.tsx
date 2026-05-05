import { invoke } from '@tauri-apps/api/core';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getCurrentUser,
  setAuthenticated,
  userFromDesktopSession,
  type DesktopSessionInfo,
  type User,
} from './auth';
import { roleHas, type Permission } from './permissions';
import { isTauriEnvironment } from './tauri-bridge';

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => void;
  /** Pure helper exposed for callbacks/effects that need a snapshot check. */
  hasPermission: (permission: Permission) => boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() =>
    typeof window !== 'undefined' ? getCurrentUser() : null
  );
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = () => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  };

  useEffect(() => {
    void (async () => {
      if (isTauriEnvironment) {
        try {
          const session = await invoke<DesktopSessionInfo | null>(
            'get_desktop_session'
          );
          if (session) {
            setAuthenticated(true, userFromDesktopSession(session));
          } else {
            setAuthenticated(false);
          }
        } catch {
          setAuthenticated(false);
        }
      }
      refreshUser();
      setIsLoading(false);
    })();
  }, []);

  useEffect(() => {
    const onAuthChanged = () => refreshUser();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'currentUser') {
        refreshUser();
      }
    };
    window.addEventListener('auth-changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth-changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const hasPermission = useMemo(() => {
    const userRole = user?.canonicalRole ?? null;
    const grantedSet = new Set<string>(user?.permissions ?? []);
    return (permission: Permission) => {
      if (!userRole) {
        return false;
      }
      if (grantedSet.size > 0) {
        return grantedSet.has(permission);
      }
      return roleHas(userRole, permission);
    };
  }, [user?.canonicalRole, user?.permissions]);

  return (
    <UserContext.Provider
      value={{ user, isLoading, refreshUser, hasPermission }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

export function useCurrentUserId(): string {
  const { user } = useUser();
  return user?.id || 'system';
}

export function useCurrentUserName(): string {
  const { user } = useUser();
  return user?.name || 'system';
}

/**
 * React hook returning a stable boolean for the given permission. Re-renders
 * automatically when the active user/role/permissions change.
 */
export function useHasPermission(permission: Permission): boolean {
  const { hasPermission } = useUser();
  return hasPermission(permission);
}
