// FILE: components/SecretField.tsx
// PURPOSE: Password-style input for gateway secrets: never prefilled, no autofill, no reveal toggle (coding-standards.md)
// DEPENDENCIES: none
// PHASE: 5 (payment sandbox)
import type { ReactNode } from 'react';

interface Props {
  id: string;
  label: string;
  value: string;
  required: boolean;
  /** A value is already stored server-side. It is never shown, only acknowledged. */
  configured: boolean;
  onChange: (value: string) => void;
}

export function SecretField({ id, label, value, required, configured, onChange }: Props): ReactNode {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <input
        id={id}
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={configured ? '************  (stored, enter again to update)' : ''}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </div>
  );
}
