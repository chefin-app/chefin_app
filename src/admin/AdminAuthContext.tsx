import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/src/services/auth-context';
import { AdminApiError, fetchAdminSession } from './api';
import type { AdminAccessStatus, AdminIdentity } from './types';

interface AdminAuthValue {
  admin: AdminIdentity | null;
  status: AdminAccessStatus;
  error: string | null;
  refresh: () => Promise<AdminIdentity | null>;
}

const AdminAuthContext = createContext<AdminAuthValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [status, setStatus] = useState<AdminAccessStatus>('checking');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async (): Promise<AdminIdentity | null> => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      setAdmin(null);
      setError(null);
      setStatus('unauthenticated');
      return null;
    }

    const currentRequest = ++requestId.current;
    setStatus('checking');
    setError(null);
    try {
      const identity = await fetchAdminSession(accessToken);
      if (currentRequest !== requestId.current) return null;
      setAdmin(identity);
      setStatus('authenticated');
      return identity;
    } catch (caught: unknown) {
      if (currentRequest !== requestId.current) return null;
      const apiError = caught instanceof AdminApiError ? caught : null;
      setAdmin(null);
      setError(caught instanceof Error ? caught.message : 'Admin access could not be verified.');
      setStatus(
        apiError?.status === 401
          ? 'unauthenticated'
          : apiError?.status === 403
            ? 'forbidden'
            : 'error'
      );
      return null;
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (initializing) return;
    refresh();
    return () => {
      requestId.current += 1;
    };
  }, [initializing, refresh]);

  return (
    <AdminAuthContext.Provider value={{ admin, status, error, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return context;
}
