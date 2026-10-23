// FILE: components/AuthForm.tsx
// PURPOSE: Shared login/register form
// DEPENDENCIES: AuthContext, ui
// PHASE: 5 (payment sandbox)
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert, buttonPrimary, inputClass } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }): ReactNode {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError([]);
    try {
      await (isLogin ? login(email, password) : register(email, password));
      navigate('/gateway', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? [err.message, ...err.lines()] : ['Something went wrong']);
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{isLogin ? 'Log in to Payment Hub' : 'Create your account'}</h1>
        {error.length > 0 && (
          <Alert kind="error">
            {error.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </Alert>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password {!isLogin && <span className="font-normal text-slate-500">(min 8 characters)</span>}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? 'Please wait...' : isLogin ? 'Log in' : 'Register'}
        </button>
        <p className="text-center text-sm text-slate-600">
          {isLogin ? (
            <>
              No account? <Link to="/register" className="text-indigo-600 hover:underline">Register</Link>
            </>
          ) : (
            <>
              Have an account? <Link to="/login" className="text-indigo-600 hover:underline">Log in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
