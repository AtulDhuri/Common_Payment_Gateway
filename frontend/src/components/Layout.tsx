// FILE: components/Layout.tsx
// PURPOSE: App shell with navigation and logout
// DEPENDENCIES: AuthContext, react-router-dom
// PHASE: 5 (payment sandbox)
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const link = ({ isActive }: { isActive: boolean }): string =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`;

export function Layout(): ReactNode {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-semibold">Payment Hub</span>
            <nav className="flex gap-1">
              <NavLink to="/gateway" className={link}>
                Gateway
              </NavLink>
              <NavLink to="/credentials" className={link}>
                API Credentials
              </NavLink>
              <NavLink to="/webhooks" className={link}>
                Webhooks
              </NavLink>
              <NavLink to="/sandbox" className={link}>
                Payment Sandbox
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{user?.email}</span>
            <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
