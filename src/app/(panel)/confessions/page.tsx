import Link from 'next/link';
import { InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, PageHeader, Pill, shortDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import {
  approveConfessionAction,
  deleteConfessionAction,
  rejectConfessionAction,
} from '../actions/content';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'pending', label: 'En attente' },
  { key: 'published', label: 'Publiées' },
  { key: 'rejected', label: 'Refusées' },
  { key: 'all', label: 'Toutes' },
] as const;

type Filter = (typeof FILTERS)[number]['key'];

export default async function ConfessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const filter = (FILTERS.find((item) => item.key === statut)?.key ?? 'pending') as Filter;

  const { config, state } = await getContext();
  const cfg = config.confessions;
  const list = state.confessions.filter((item) => (filter === 'all' ? true : item.status === filter));
  const counts = {
    pending: state.confessions.filter((item) => item.status === 'pending').length,
    published: state.confessions.filter((item) => item.status === 'published').length,
    rejected: state.confessions.filter((item) => item.status === 'rejected').length,
    all: state.confessions.length,
  };

  return (
    <>
      <PageHeader
        title="Confessions anonymes"
        description="Les membres envoient une confession avec /confession : le bot l'anonymise, la soumet à validation puis la publie avec les réactions choisies."
        action={
          <Link className="btn btn-ghost" href="/welcome">
            Réglages des confessions
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone={cfg.enabled ? 'ok' : 'warn'}>{cfg.enabled ? 'activées' : 'désactivées'}</Pill>
        <Pill tone="info">{cfg.requireApproval ? 'validation requise' : 'publication directe'}</Pill>
        <Pill tone="muted">cooldown {cfg.cooldownSeconds}s</Pill>
        <Pill tone="muted">{cfg.maxLength} caractères max</Pill>
        <Pill tone="muted">{cfg.reactions.length} réaction(s)</Pill>
      </div>

      <Card
        title="Confessions"
        subtitle="Valide, refuse ou supprime"
        action={
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Link
                key={item.key}
                href={`/confessions?statut=${item.key}`}
                className={`btn btn-xs ${filter === item.key ? 'btn-primary' : 'btn-ghost'}`}
              >
                {item.label} {counts[item.key] ? `(${counts[item.key]})` : ''}
              </Link>
            ))}
          </div>
        }
      >
        {list.length === 0 ? (
          <EmptyState>
            Aucune confession dans cette catégorie. Les membres les envoient avec{' '}
            <span className="mono">/confession</span>.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {list.map((confession) => (
              <li key={confession.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/40">
                  {confession.status === 'pending' ? (
                    <Pill tone="warn">en attente</Pill>
                  ) : confession.status === 'published' ? (
                    <Pill tone="ok">publiée</Pill>
                  ) : (
                    <Pill tone="error">refusée</Pill>
                  )}
                  <span>{shortDate(confession.createdAt)}</span>
                  <span className="mono">auteur {confession.authorId}</span>
                  {confession.rejectionReason ? (
                    <span className="text-rose-300">motif : {confession.rejectionReason}</span>
                  ) : null}
                  <span className="mono ml-auto">#{confession.id.slice(0, 8)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-white/80">{confession.content}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {confession.status !== 'published' ? (
                    <InlineAction
                      action={approveConfessionAction}
                      fields={{ id: confession.id }}
                      className="btn btn-success btn-xs"
                    >
                      Publier
                    </InlineAction>
                  ) : null}
                  {confession.status === 'pending' ? (
                    <InlineAction
                      action={rejectConfessionAction}
                      fields={{ id: confession.id }}
                      className="btn btn-danger btn-xs"
                    >
                      Refuser
                    </InlineAction>
                  ) : null}
                  <InlineAction
                    action={deleteConfessionAction}
                    fields={{ id: confession.id }}
                    className="btn btn-ghost btn-xs"
                    confirm="Supprimer définitivement cette confession du panel ?"
                  >
                    Supprimer du panel
                  </InlineAction>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
