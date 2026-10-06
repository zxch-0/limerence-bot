'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import type { ActionState } from '@/lib/types';

// ============================================================
//  Formulaire connecté à une server action, avec retour visuel
// ============================================================

export type FormAction = (
  prev: ActionState | null,
  formData: FormData,
) => Promise<ActionState>;

export function SubmitButton({
  children,
  className = 'btn btn-primary',
  pendingLabel = 'En cours…',
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  submitLabel = 'Enregistrer',
  className = 'space-y-4',
  pendingLabel,
  footer,
}: {
  action: FormAction;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  pendingLabel?: string;
  footer?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
        {footer}
        {state ? (
          <span
            className={`text-sm ${state.ok ? 'text-mint' : 'text-rose-300'}`}
            role="status"
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Formulaire simple (aucun retour visuel) pour les actions de liste. */
export function InlineAction({
  action,
  fields,
  children,
  className = 'btn btn-ghost btn-xs',
  title,
  confirm,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  children: ReactNode;
  className?: string;
  title?: string;
  confirm?: string;
}) {
  return (
    <form
      action={action}
      className="inline-flex"
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton className={className} pendingLabel="…">
        {children}
      </SubmitButton>
      {title ? <span className="sr-only">{title}</span> : null}
      {confirm ? <span className="sr-only">{confirm}</span> : null}
    </form>
  );
}
