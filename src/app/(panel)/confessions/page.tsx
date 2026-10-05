import Link from 'next/link';
import { ActionForm, InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, Field, PageHeader, Pill, Toggle, shortDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { allChannels } from '@/lib/config';
import {
  approveConfessionAction,
  deleteConfessionAction,
  rejectConfessionAction,
  saveConfessionsAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'pending', label: 'En attente' },
  { key: 'published', label: 'Publiées' },
  { key: 'rejected', label: 'Refusées' },
  { key: 'all', label: 'Toutes' },
] as const;

export default async function ConfessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const filter = (FILTERS.find((f) => f.key === statut)?.key ?? 'pending') as
    | 'pending'
    | 'published'
    | 'rejected'
    | 'all';

  const { config, state } = await getContext();
  const cfg = config.confessions;
  const textChannels = allChannels(config).filter((c) => c.kind === 'text');

  const list = state.confessions.filter((c) => (filter === 'all' ? true : c.status === filter));
  const counts = {
    pending: state.confessions.filter((c) => c.status === 'pending').length,
    published: state.confessions.filter((c) => c.status === 'published').length,
    rejected: state.confessions.filter((c) => c.status === 'rejected').length,
    all: state.confessions.length,
  };

  return (
    <>
      <PageHeader
        title="Confessions anonymes"
        description="Les membres envoient une confession avec /confession : le bot l’anonymise, la soumet à validation et la publie dans le salon confessions avec les réactions choisies."
      />

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card title="Réglages" subtitle="Salons, validation et réactions">
          <ActionForm action={saveConfessionsAction} submitLabel="💾 Enregistrer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Salon de publication">
                <select className="field" name="targetChannelKey" defaultValue={cfg.targetChannelKey}>
                  {textChannels.map((c) => (
                    <option key={c.key} value={c.key}>
                      {config.prefix} {c.slug} {c.emoji}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Salon de validation (admin)">
                <select className="field" name="reviewChannelKey" defaultValue={cfg.reviewChannelKey}>
                  {textChannels.map((c) => (
                    <option key={c.key} value={c.key}>
                      {config.prefix} {c.slug} {c.emoji}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Délai anti-spam (secondes)">
                <input
                  type="number"
                  min={0}
                  className="field"
                  name="cooldownSeconds"
                  defaultValue={cfg.cooldownSeconds}
                />
              </Field>
              <Field label="Longueur maximale">
                <input
                  type="number"
                  min={50}
                  max={2000}
                  className="field"
                  name="maxLength"
                  defaultValue={cfg.maxLength}
                />
              </Field>
              <Field label="Réactions sous chaque confession" className="sm:col-span-2">
                <input
                  className="field"
                  name="reactions"
                  defaultValue={cfg.reactions.join(', ')}
                  placeholder="❤️, 😮, 🥺"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                name="enabled"
                label="Activer les confessions"
                defaultChecked={cfg.enabled}
              />
              <Toggle
                name="requireApproval"
                label="Validation par un admin avant publication"
                description="Sinon la confession part directement dans le salon."
                defaultChecked={cfg.requireApproval}
              />
              <Toggle
                name="notifyReviewChannel"
                label="Alerter dans le salon de validation"
                description="Carte avec boutons Publier / Refuser."
                defaultChecked={cfg.notifyReviewChannel}
              />
              <Toggle
                name="logsEnabled"
                label="Envoyer les logs dans Discord"
                description={`Salon : ${config.logs.channelKey}`}
                defaultChecked={config.logs.enabled}
              />
              <Toggle
                name="keepInPanel"
                label="Conserver les logs dans le panel"
                defaultChecked={config.logs.keepInPanel}
              />
              <Field label="Salon des logs">
                <select className="field" name="logsChannelKey" defaultValue={config.logs.channelKey}>
                  {textChannels.map((c) => (
                    <option key={c.key} value={c.key}>
                      {config.prefix} {c.slug} {c.emoji}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card
          title="File d’attente"
          subtitle="Relecture avant publication"
          action={
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={`/confessions?statut=${f.key}`}
                  className={`btn btn-xs ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {f.label} {counts[f.key] ? `(${counts[f.key]})` : ''}
                </Link>
              ))}
            </div>
          }
        >
          {list.length === 0 ? (
            <EmptyState>
              Aucune confession dans cette catégorie. Les membres les envoient avec{' '}
              <span className="mono">/confession</span> (formulaire ou message direct).
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {list.map((c) => (
                <li key={c.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/40">
                    {c.status === 'pending' ? (
                      <Pill tone="warn">en attente</Pill>
                    ) : c.status === 'published' ? (
                      <Pill tone="ok">publiée</Pill>
                    ) : (
                      <Pill tone="error">refusée</Pill>
                    )}
                    <span>{shortDate(c.createdAt)}</span>
                    <span className="mono">auteur {c.authorId}</span>
                    <span className="mono ml-auto">#{c.id.slice(0, 8)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-white/80">{c.content}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.status !== 'published' ? (
                      <InlineAction
                        action={approveConfessionAction}
                        fields={{ id: c.id }}
                        className="btn btn-success btn-xs"
                      >
                        ✅ Publier
                      </InlineAction>
                    ) : null}
                    {c.status === 'pending' ? (
                      <InlineAction
                        action={rejectConfessionAction}
                        fields={{ id: c.id }}
                        className="btn btn-danger btn-xs"
                      >
                        🗑️ Refuser
                      </InlineAction>
                    ) : null}
                    <InlineAction
                      action={deleteConfessionAction}
                      fields={{ id: c.id }}
                      className="btn btn-ghost btn-xs"
                    >
                      Supprimer du panel
                    </InlineAction>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
