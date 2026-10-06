'use client';

import { useState } from 'react';

export function CopyButton({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? '✓ Copié' : `⧉ ${label}`}
    </button>
  );
}
