'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveChannelsAction } from '@/app/(panel)/actions';
import { SubmitButton } from './ActionForm';
import type { BlueprintCategory, BlueprintChannel } from '@/lib/types';

// ============================================================
//  Éditeur visuel des catégories et salons
//  Règle respectée : salon texte = ➥ nom emoji
// ============================================================

export function ChannelsEditor({
  initial,
  defaults,
  prefix,
}: {
  initial: BlueprintCategory[];
  defaults: BlueprintCategory[];
  prefix: string;
}) {
  const [cats, setCats] = useState<BlueprintCategory[]>(initial);
  const [state, formAction] = useActionState(saveChannelsAction, null);

  const payload = useMemo(() => JSON.stringify(cats), [cats]);

  const mutateCat = (index: number, patch: Partial<BlueprintCategory>) =>
    setCats((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const mutateChannel = (ci: number, chi: number, patch: Partial<BlueprintChannel>) =>
    setCats((prev) =>
      prev.map((c, i) =>
        i === ci
          ? { ...c, channels: c.channels.map((ch, j) => (j === chi ? { ...ch, ...patch } : ch)) }
          : c,
      ),
    );

  const addChannel = (ci: number) =>
    setCats((prev) =>
      prev.map((c, i) =>
        i === ci
          ? {
              ...c,
              channels: [
                ...c.channels,
                {
                  key: `${c.key}-${Date.now().toString(36)}`,
                  kind: 'text' as const,
                  slug: 'nouveau-salon',
                  emoji: '✨',
                },
              ],
            }
          : c,
      ),
    );

  const removeChannel = (ci: number, chi: number) =>
    setCats((prev) =>
      prev.map((c, i) =>
        i === ci ? { ...c, channels: c.channels.filter((_, j) => j !== chi) } : c,
      ),
    );

  const addCategory = () =>
    setCats((prev) => [
      ...prev,
      {
        key: `cat-${Date.now().toString(36)}`,
        slug: 'nouvelle-catégorie',
        emoji: '📁',
        channels: [],
      },
    ]);

  const removeCategory = (ci: number) => setCats((prev) => prev.filter((_, i) => i !== ci));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="payload" value={payload} />

      {cats.map((cat, ci) => (
        <section key={cat.key} className="glass rounded-2xl border border-line p-5">
          <header className="mb-4 flex flex-wrap items-end gap-3">
            <div className="w-20">
              <label className="label">Emoji</label>
              <input
                className="field text-center"
                value={cat.emoji}
                maxLength={4}
                onChange={(e) => mutateCat(ci, { emoji: e.target.value })}
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="label">Nom de la catégorie</label>
              <input
                className="field"
                value={cat.slug}
                onChange={(e) => mutateCat(ci, { slug: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-white/60">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#c9b8ff]"
                checked={Boolean(cat.adminOnly)}
                onChange={(e) => mutateCat(ci, { adminOnly: e.target.checked })}
              />
              Catégorie admin (masquée aux membres)
            </label>
            <button
              type="button"
              onClick={() => removeCategory(ci)}
              className="btn btn-danger btn-xs ml-auto"
            >
              Supprimer la catégorie
            </button>
          </header>

          <div className="space-y-3">
            {cat.channels.map((ch, chi) => (
              <div
                key={ch.key}
                className="rounded-xl border border-line bg-white/[0.02] p-3"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-28">
                    <label className="label">Type</label>
                    <select
                      className="field"
                      value={ch.kind}
                      onChange={(e) =>
                        mutateChannel(ci, chi, { kind: e.target.value as 'text' | 'voice' })
                      }
                    >
                      <option value="text">Texte</option>
                      <option value="voice">Vocal</option>
                    </select>
                  </div>

                  <div className="w-20">
                    <label className="label">Emoji</label>
                    <input
                      className="field text-center"
                      value={ch.emoji}
                      maxLength={4}
                      onChange={(e) => mutateChannel(ci, chi, { emoji: e.target.value })}
                    />
                  </div>

                  <div className="min-w-[150px] flex-1">
                    <label className="label">{ch.kind === 'voice' ? 'Nom affiché' : 'Nom (slug)'}</label>
                    <input
                      className="field"
                      value={ch.kind === 'voice' ? (ch.label ?? ch.slug) : ch.slug}
                      onChange={(e) =>
                        ch.kind === 'voice'
                          ? mutateChannel(ci, chi, { label: e.target.value, slug: e.target.value })
                          : mutateChannel(ci, chi, { slug: e.target.value })
                      }
                    />
                  </div>

                  <div className="w-24">
                    <label className="label">Places</label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      className="field"
                      disabled={ch.kind !== 'voice'}
                      value={ch.userLimit ?? 0}
                      onChange={(e) =>
                        mutateChannel(ci, chi, { userLimit: Number(e.target.value) || 0 })
                      }
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeChannel(ci, chi)}
                    className="btn btn-danger btn-xs"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/55">
                  <span className="mono rounded-lg bg-black/40 px-2 py-1 text-lilac">
                    {ch.kind === 'voice'
                      ? `${ch.emoji} ${ch.label ?? ch.slug}`
                      : `${prefix} ${ch.slug} ${ch.emoji}`}
                  </span>

                  {ch.kind === 'text' ? (
                    <>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[#c9b8ff]"
                          checked={Boolean(ch.readOnly)}
                          onChange={(e) => mutateChannel(ci, chi, { readOnly: e.target.checked })}
                        />
                        Lecture seule
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[#c9b8ff]"
                          checked={Boolean(ch.adminOnly)}
                          onChange={(e) => mutateChannel(ci, chi, { adminOnly: e.target.checked })}
                        />
                        Admin seulement
                      </label>
                      <input
                        className="field max-w-xs flex-1"
                        placeholder="Sujet du salon (optionnel)"
                        value={ch.topic ?? ''}
                        onChange={(e) => mutateChannel(ci, chi, { topic: e.target.value })}
                      />
                    </>
                  ) : (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[#c9b8ff]"
                        checked={Boolean(ch.isHub)}
                        onChange={(e) => mutateChannel(ci, chi, { isHub: e.target.checked })}
                      />
                      Salon « rejoindre pour créer » (join-to-create)
                    </label>
                  )}
                </div>
              </div>
            ))}

            <button type="button" onClick={() => addChannel(ci)} className="btn btn-ghost btn-xs">
              ＋ Ajouter un salon
            </button>
          </div>
        </section>
      ))}

      <div className="glass sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4">
        <button type="button" onClick={addCategory} className="btn btn-ghost">
          ＋ Ajouter une catégorie
        </button>
        <button
          type="button"
          onClick={() => setCats(structuredClone(defaults))}
          className="btn btn-ghost"
        >
          ↺ Restaurer le blueprint Limerence
        </button>
        <SubmitButton pendingLabel="Enregistrement…">💾 Enregistrer la structure</SubmitButton>
        {state ? (
          <span className={`text-sm ${state.ok ? 'text-mint' : 'text-rose-300'}`}>{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
