import Link from 'next/link';
import { InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, PageHeader, Pill, relativeDate, shortDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { clearLogsAction } from '../actions';
import type { LogLevel } from '@/lib/types';

export const dynamic = 'force-dynamic';

const LEVELS: Array<{ key: LogLevel | 'all'; label: string }> = [
  { key: 'all', label: 'Tout' },
  { key: 'info', label: 'Info' },
  { key: 'success', label: 'Succès' },
  { key: 'warn', label: 'Alerte' },
  { key: 'error', label: 'Erreur' },
  { key: 'moderation', label: 'Modération' },
];

const ICONS: Record<LogLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '⛔',
  moderation: '🔨',
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ niveau?: string }>;
}) {
  const { niveau } = await searchParams;
  const level = (LEVELS.find((l) => l.key === niveau)?.key ?? 'all') as LogLevel | 'all';
  const { state } = await getContext();
  const logs = state.logs.filter((l) => (level === 'all' ? true : l.level === level));

  return (
    <>
      <PageHeader
        title="Journal"
        description="Chaque action du bot, du panel et des administrateurs est horodatée ici (et recopiée dans le salon Discord de logs si activé)."
        action={
          <InlineAction
            action={clearLogsAction}
            fields={{ level: '' }}
            className="btn btn-danger btn-xs"
          >
            🗑️ Vider le journal
          </InlineAction>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {LEVELS.map((l) => {
          const count = l.key === 'all' ? state.logs.length : state.logs.filter((x) => x.level === l.key).length;
          return (
            <Link
              key={l.key}
              href={l.key === 'all' ? '/logs' : `/logs?niveau=${l.key}`}
              className={`btn btn-xs ${level === l.key ? 'btn-primary' : 'btn-ghost'}`}
            >
              {l.label} {count ? `(${count})` : ''}
            </Link>
          );
        })}
      </div>

      <Card title="Événements" subtitle={`${logs.length} entrée(s)`}>
        {logs.length === 0 ? (
          <EmptyState>Aucun événement pour ce filtre.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>Action</th>
                  <th>Détail</th>
                  <th>Source</th>
                  <th>Quand</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="w-8">{ICONS[log.level]}</td>
                    <td className="text-white/85">{log.action}</td>
                    <td className="text-white/55">{log.detail ?? '—'}</td>
                    <td className="mono text-xs text-white/40">{log.source}</td>
                    <td className="text-xs text-white/40" title={shortDate(log.at)}>
                      {relativeDate(log.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-white/35">
        Conservation : {state.config.logs.maxEntries} entrées maximum ·{' '}
        {state.config.logs.keepInPanel ? 'journal du panel activé' : 'journal du panel désactivé'}
        {state.config.logs.enabled ? ` · miroir Discord vers « ${state.config.logs.channelKey} »` : ''}
      </p>
    </>
  );
}
