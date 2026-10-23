// FILE: pages/Login.tsx
// PURPOSE: Login page
// DEPENDENCIES: AuthForm
// PHASE: 5 (payment sandbox)
import type { ReactNode } from 'react';
import { AuthForm } from '../components/AuthForm';

export function Login(): ReactNode {
  return <AuthForm mode="login" />;
}
