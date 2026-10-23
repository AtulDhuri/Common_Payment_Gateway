// FILE: components/DynamicForm.tsx
// PURPOSE: Renders a gateway form from /providers/:code/fields. No provider-specific code (coding-standards.md)
// DEPENDENCIES: SecretField, api/endpoints
// PHASE: 5 (payment sandbox)
import type { ReactNode } from 'react';
import type { ProviderField } from '../api/endpoints';
import { SecretField } from './SecretField';

interface Props {
  fields: ProviderField[];
  values: Record<string, string>;
  /** Field keys whose secret is already stored on the server. */
  configuredSecrets: ReadonlySet<string>;
  onChange: (fieldKey: string, value: string) => void;
}

export function DynamicForm({ fields, values, configuredSecrets, onChange }: Props): ReactNode {
  return (
    <div className="space-y-4">
      {[...fields]
        .sort((a, b) => a.order - b.order)
        .map((f) =>
          f.type === 'secret' ? (
            <SecretField
              key={f.fieldKey}
              id={`field-${f.fieldKey}`}
              label={f.label}
              required={f.required}
              value={values[f.fieldKey] ?? ''}
              configured={configuredSecrets.has(f.fieldKey)}
              onChange={(v) => onChange(f.fieldKey, v)}
            />
          ) : (
            <div key={f.fieldKey}>
              <label htmlFor={`field-${f.fieldKey}`} className="mb-1 block text-sm font-medium text-slate-700">
                {f.label}
                {f.required && <span className="text-red-600"> *</span>}
              </label>
              <input
                id={`field-${f.fieldKey}`}
                type="text"
                autoComplete="off"
                value={values[f.fieldKey] ?? ''}
                onChange={(e) => onChange(f.fieldKey, e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          ),
        )}
    </div>
  );
}
