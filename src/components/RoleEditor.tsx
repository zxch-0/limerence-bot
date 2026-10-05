'use client';

import { useActionState, useState } from 'react';
import { saveRoleAction } from '@/app/(panel)/actions';
import { SubmitButton } from './ActionForm';
import type { RoleConfig } from '@/lib/types';

export function RoleEditor({ initial }: { initial: RoleConfig }) {
  const [role, setRole] = useState<RoleConfig>(initial);
  const [state, formAction] = useActionState(saveRoleAction, null);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Nom du rôle</label>
          <input
            className="field"
            name="name"
            value={role.name}
            onChange={(e) => setRole({ ...role, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Couleur</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent"
              value={role.color}
              onChange={(e) => setRole({ ...role, color: e.target.value.toUpperCase() })}
            />
            <input
              className="field mono"
              name="color"
              value={role.color}
              onChange={(e) => setRole({ ...role, color: e.target.value.toUpperCase() })}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white/[0.02] p-4">
        <p className="mb-3 text-xs uppercase tracking-wider text-white/40">Aperçu</p>
        <p className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-3.5 w-3.5 rounded-full border border-white/20"
            style={{ backgroundColor: role.color }}
          />
          <span style={{ color: role.color }} className="font-semibold">
            {role.name || 'limerencien'}
          </span>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-xs text-white/70">
            @{role.name || 'limerencien'}
          </span>
          {role.hoist ? (
            <span className="text-xs text-white/40">affiché séparément dans la liste des membres</span>
          ) : null}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle
          name="autoAssign"
          label="Attribuer automatiquement à l’arrivée"
          hint="Chaque nouveau membre reçoit le rôle dès qu’il rejoint."
          checked={role.autoAssign}
          onChange={(v) => setRole({ ...role, autoAssign: v })}
        />
        <Toggle
          name="assignToExisting"
          label="Donner aussi aux membres déjà présents"
          hint="Appliqué lors du prochain déploiement du blueprint."
          checked={role.assignToExisting}
          onChange={(v) => setRole({ ...role, assignToExisting: v })}
        />
        <Toggle
          name="mentionable"
          label="Rôle mentionnable"
          checked={role.mentionable}
          onChange={(v) => setRole({ ...role, mentionable: v })}
        />
        <Toggle
          name="hoist"
          label="Afficher les membres de ce rôle à part"
          checked={role.hoist}
          onChange={(v) => setRole({ ...role, hoist: v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>💾 Enregistrer le rôle</SubmitButton>
        <span className="text-xs text-white/40">
          Enregistre, puis lance un déploiement pour appliquer sur Discord.
        </span>
        {state ? (
          <span className={`text-sm ${state.ok ? 'text-mint' : 'text-rose-300'}`}>{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[#c9b8ff]"
      />
      <span>
        <span className="block text-sm text-white/85">{label}</span>
        {hint ? <span className="block text-xs text-white/40">{hint}</span> : null}
      </span>
    </label>
  );
}
