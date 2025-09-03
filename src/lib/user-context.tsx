import React, { createContext, useContext, useEffect, useState } from 'react';

import { getCurrentUser } from './auth';
import type { User } from './auth';

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  refreshUser: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = () => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  };

  useEffect(() => {
    refreshUser();
    setIsLoading(false);
  }, []);

  return (
    <UserContext.Provider value={{ user, isLoading, refreshUser }}>
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
