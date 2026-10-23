// FILE: components/ui.tsx
// PURPOSE: Small shared UI pieces: Alert, StatusBadge, Card, Button styles
// DEPENDENCIES: api/endpoints (types)
// PHASE: 5 (payment sandbox)
import type { ReactNode } from 'react';
import type { PaymentStatus } from '../api/endpoints';

export const buttonPrimary =
  'rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
export const buttonSecondary =
  'rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';

export function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const ALERT_STYLES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-green-200 bg-green-50 text-green-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
} as const;

export function Alert({
  kind,
  children,
}: {
  kind: keyof typeof ALERT_STYLES;
  children: ReactNode;
}): ReactNode {
  return <div className={`rounded-md border px-3 py-2 text-sm ${ALERT_STYLES[kind]}`}>{children}</div>;
}

const BADGE_STYLES: Record<PaymentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SUCCESS: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
  REFUNDED: 'bg-sky-100 text-sky-800',
};

export function StatusBadge({ status }: { status: PaymentStatus }): ReactNode {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_STYLES[status]}`}>{status}</span>;
}
