// FILE: auth/AuthContext.tsx
// PURPOSE: Login state for the app, plus ProtectedRoute
// DEPENDENCIES: api/endpoints, auth/session, react-router-dom
// PHASE: 5 (payment sandbox)
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { onSessionExpired } from '../api/client';
import { authApi, type User } from '../api/endpoints';
import { clearSession, getTokens, saveTokens } from './session';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(getTokens() !== null);

  useEffect(() => {
    if (!getTokens()) return;
    authApi
      .me()
      .then(setUser)
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    saveTokens(await authApi.login(email, password));
    setUser(await authApi.me());
  }, []);

  const register = useCallback(
    async (email: string, password: string): Promise<void> => {
      await authApi.register(email, password);
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback((): void => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function ProtectedRoute(): ReactNode {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-slate-500">Loading...</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
