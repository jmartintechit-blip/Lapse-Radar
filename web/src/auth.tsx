import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';

import { getDict, serverMessage, useI18n } from './i18n';
import { jsonHeaders } from './api';

export type User = { id: string; email: string; isDemo: boolean; emailVerified: boolean };

// undefined = still asking the server, null = signed out.
type AuthState = {
  user: User | null | undefined;
  authenticate: (
    mode: 'login' | 'signup' | 'demo',
    email: string,
    password: string,
  ) => Promise<string | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth needs an AuthProvider');
  return ctx;
}

const send = (path: string, body?: unknown) =>
  fetch(`/api${path}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body ?? {}),
  });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      setUser(res.ok ? ((await res.json()) as User) : null);
    } catch {
      setUser(null);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const authenticate: AuthState['authenticate'] = async (mode, email, password) => {
    try {
      const res = await send(`/auth/${mode}`, { email, password });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return body?.error?.message ? serverMessage(body.error.message) : getDict().generic;
      }
      await refresh();
      return null;
    } catch {
      return getDict().offline;
    }
  };

  const logout = async () => {
    await send('/auth/logout').catch(() => undefined);
    setUser(null);
  };

  return <AuthContext value={{ user, authenticate, logout, refresh }}>{children}</AuthContext>;
}

export function RequireUser() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (user === undefined)
    return (
      <main>
        <p role="status">{t.loading}</p>
      </main>
    );
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
