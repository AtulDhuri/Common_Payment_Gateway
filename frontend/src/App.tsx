// FILE: App.tsx
// PURPOSE: Routes: public login/register, protected gateway + payment sandbox
// DEPENDENCIES: react-router-dom, AuthContext, pages
// PHASE: 5 (payment sandbox)
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { ApiCredentials } from './pages/ApiCredentials';
import { Gateway } from './pages/Gateway';
import { Login } from './pages/Login';
import { PaymentSandbox } from './pages/PaymentSandbox';
import { Register } from './pages/Register';
import { Webhooks } from './pages/Webhooks';

export function App(): ReactNode {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/gateway" element={<Gateway />} />
              <Route path="/credentials" element={<ApiCredentials />} />
              <Route path="/webhooks" element={<Webhooks />} />
              <Route path="/sandbox" element={<PaymentSandbox />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/gateway" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
