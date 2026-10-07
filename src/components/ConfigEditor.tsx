'use client';

import { useMemo, useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ConfigValues, FieldDef } from '@/lib/schema-fields';
import type { ActionState } from '@/lib/types';

// ============================================================
//  Éditeur de configuration générique.
//
//  Les options sont décrites par des métadonnées (FieldDef) :
//  ce composant les transforme en formulaire complet, avec
//  recherche, dépendances entre options et barre d'enregistrement
//  collante. Un seul composant couvre les ~260 options du bot.
// ============================================================

export interface ConfigSectionView {
  id: string;
  label: string;
  emoji?: string;
  description?: string;
  fields: FieldDef[];
}

export type ConfigAction = (prev: ActionState | null, formData: FormData) => Promise<ActionState>;

const KIND_SUFFIX: Record<string, string> = {
  percent: '%',
  minutes: 'min',
  hours: 'h',
};

function toInputValue(kind: FieldDef['kind'], value: ConfigValues[string]): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'on' : '';
  return String(value ?? '');
}

function SubmitBar({ label, dirty, onReset }: { label: string; dirty: number; onReset: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-ink-soft/90 p-3 shadow-[0_18px_50px_-24px_rgba(0,0,0,1)] backdrop-blur">
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Enregistrement…' : label}
      </button>
      {dirty > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={onReset} disabled={pending}>
          Annuler les {dirty} modification{dirty > 1 ? 's' : ''}
        </button>
      ) : (
        <span className="text-xs text-white/40">Aucune modification en attente.</span>
      )}
    </div>
  );
}

export function ConfigEditor({
  sections,
  values,
  action,
  submitLabel = 'Enregistrer',
  footer,
}: {
  sections: ConfigSectionView[];
  values: ConfigValues;
  action: ConfigAction;
  submitLabel?: string;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const current = (field: FieldDef): ConfigValues[string] => {
    const override = overrides[field.key];
    if (override !== undefined) {
      if (field.kind === 'boolean') return override === 'on';
      if (Array.isArray(values[field.key])) return override ? override.split(',').map((i) => i.trim()).filter(Boolean) : [];
      return override;
    }
    return values[field.key];
  };

  const track = (key: string, raw: string) => setOverrides((prev) => ({ ...prev, [key]: raw }));

  const kindByKey = useMemo(() => {
    const map: Record<string, FieldDef['kind']> = {};
    for (const section of sections) {
      for (const field of section.fields) map[field.key] = field.kind;
    }
    return map;
  }, [sections]);

  const dirty = useMemo(
    () =>
      Object.entries(overrides).filter(
        ([key, raw]) => toInputValue(kindByKey[key] ?? 'string', values[key]) !== raw,
      ).length,
    [overrides, kindByKey, values],
  );

  const needle = query.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => {
          if (!needle) return true;
          return (
            field.label.toLowerCase().includes(needle) ||
            field.key.toLowerCase().includes(needle) ||
            (field.hint ?? '').toLowerCase().includes(needle)
          );
        }),
      }))
      .filter((section) => section.fields.length > 0);
  }, [needle, sections]);

  const editedKeys = useMemo(
    () => sections.flatMap((section) => section.fields.map((field) => field.key)).join(','),
    [sections],
  );

  return (
    <form action={formAction} className="space-y-5">
      {/* Les clés réellement éditées : une page peut n'afficher qu'une partie
          des options sans écraser le reste de la configuration. */}
      <input type="hidden" name="__keys" value={editedKeys} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="field max-w-sm"
          placeholder="Rechercher une option (ex. « vol », « drop », « intérêt »)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="text-xs text-white/40">
          {sections.reduce((total, section) => total + section.fields.length, 0)} options ·{' '}
          {visibleSections.reduce((total, section) => total + section.fields.length, 0)} affichée(s)
        </span>
      </div>

      {visibleSections.map((section) => (
        <section key={section.id} className="glass rounded-2xl border border-line p-5" id={`section-${section.id}`}>
          <header className="mb-4">
            <h2 className="text-base font-semibold text-white/90">
              {section.emoji ? `${section.emoji} ` : ''}
              {section.label}
            </h2>
            {section.description ? (
              <p className="mt-0.5 text-sm text-white/45">{section.description}</p>
            ) : null}
          </header>

          <div className="grid gap-3 md:grid-cols-2">
            {section.fields.map((field) => {
              if (field.dependsOn) {
                const parent = sections.flatMap((s) => s.fields).find((f) => f.key === field.dependsOn);
                if (parent && current(parent) !== true) {
                  // Option inactive : masquée mais transmise à l'identique,
                  // pour ne jamais écraser une valeur enregistrée.
                  return (
                    <input
                      key={field.key}
                      type="hidden"
                      name={field.key}
                      value={field.kind === 'boolean' ? (current(field) === true ? 'on' : '') : toInputValue(field.kind, current(field))}
                    />
                  );
                }
              }
              return <FieldRow key={field.key} field={field} value={current(field)} onInput={track} />;
            })}
          </div>
        </section>
      ))}

      <SubmitBar label={submitLabel} dirty={dirty} onReset={() => setOverrides({})} />

      {state ? (
        <p className={`text-sm ${state.ok ? 'text-mint' : 'text-rose-300'}`} role="status">
          {state.message}
        </p>
      ) : null}

      {footer}
    </form>
  );
}

function FieldRow({
  field,
  value,
  onInput,
}: {
  field: FieldDef;
  value: ConfigValues[string];
  onInput: (key: string, raw: string) => void;
}) {
  const raw = toInputValue(field.kind, value);
  const suffix = field.unit ?? KIND_SUFFIX[field.kind];

  if (field.kind === 'boolean') {
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-3 md:col-span-2">
        <input
          type="checkbox"
          name={field.key}
          checked={value === true}
          onChange={(event) => onInput(field.key, event.target.checked ? 'on' : '')}
          className="mt-0.5 h-4 w-4 accent-[#c9b8ff]"
        />
        <span>
          <span className="block text-sm text-white/85">{field.label}</span>
          {field.hint ? <span className="block text-xs text-white/40">{field.hint}</span> : null}
        </span>
      </label>
    );
  }

  const isList = field.kind === 'list' || field.kind === 'channel' || field.kind === 'role';

  return (
    <div className={isList || field.kind === 'multiline' ? 'md:col-span-2' : ''}>
      <label className="label">{field.label}</label>

      {field.kind === 'select' ? (
        <select
          name={field.key}
          className="field"
          value={raw}
          onChange={(event) => onInput(field.key, event.target.value)}
        >
          {(field.choices ?? []).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : field.kind === 'multiline' ? (
        <textarea
          name={field.key}
          className="field min-h-24"
          rows={4}
          maxLength={field.maxLength}
          value={raw}
          onChange={(event) => onInput(field.key, event.target.value)}
        />
      ) : field.kind === 'color' ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="h-10 w-12 rounded-lg border border-line bg-transparent"
            value={/^#[0-9a-f]{6}$/i.test(raw) ? raw : '#ffffff'}
            onChange={(event) => onInput(field.key, event.target.value)}
            aria-label={`Couleur — ${field.label}`}
          />
          <input
            type="text"
            name={field.key}
            className="field"
            value={raw}
            onChange={(event) => onInput(field.key, event.target.value)}
          />
        </div>
      ) : isList ? (
        <textarea
          name={field.key}
          className="field mono min-h-20"
          rows={3}
          placeholder={
            field.kind === 'list' ? 'valeur1, valeur2, valeur3' : 'un identifiant Discord par ligne'
          }
          value={raw}
          onChange={(event) => onInput(field.key, event.target.value)}
        />
      ) : (
        <div className="relative">
          <input
            type={
              field.kind === 'integer' ||
              field.kind === 'number' ||
              field.kind === 'percent' ||
              field.kind === 'minutes' ||
              field.kind === 'hours'
                ? 'number'
                : 'text'
            }
            name={field.key}
            className="field"
            min={field.min}
            max={field.max}
            step={field.step}
            maxLength={field.maxLength}
            value={raw}
            onChange={(event) => onInput(field.key, event.target.value)}
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/35">
              {suffix}
            </span>
          ) : null}
        </div>
      )}

      {field.hint ? <p className="mt-1 text-xs text-white/35">{field.hint}</p> : null}
      {typeof field.min === 'number' || typeof field.max === 'number' ? (
        <p className="mt-0.5 text-[11px] text-white/25">
          Intervalle autorisé : {field.min ?? '-∞'} → {field.max ?? '+∞'}
        </p>
      ) : null}
    </div>
  );
}
