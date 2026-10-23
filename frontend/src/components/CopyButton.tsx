// FILE: components/CopyButton.tsx
// PURPOSE: Copies a value to the clipboard and shows "Copied" briefly (folder-structure.md: shared components)
// DEPENDENCIES: ui
// PHASE: 6 (moved out of the API Credentials page in PHASE 8)
import { useState, type ReactNode } from 'react';
import { buttonSecondary } from './ui';

export function CopyButton({ label, value }: { label: string; value: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className={buttonSecondary} onClick={() => void copy()}>
      {copied ? 'Copied' : label}
    </button>
  );
}
