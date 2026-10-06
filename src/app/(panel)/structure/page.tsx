import Link from 'next/link';
import { ActionForm } from '@/components/ActionForm';
import { Card, PageHeader, Pill, shortDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { auditBlueprint } from '@/lib/blueprint';
import { channelName } from '@/lib/config';
import { auditAction, runBlueprintAction } from '../actions';

export const dynamic = 'force-dynamic';

interface Row {
  key: string;
  kind: string;
  expected: string;
  actual: string | null;
  status: 'ok' | 'missing' | 'outdated';
}

export default async function StructurePage() {
  const { config, guild, demo, state } = await getContext();

  let rows: Row[];
  if (guild) {
    rows = await auditBlueprint(guild, config);
  } else {
    rows = [
      {
        key: 'role',
        kind: 'role',
        expected: config.role.name,
        actual: null,
        status: 'missing' as const,
      },
      ...config.categories.flatMap((cat) => [
        {
          key: `cat:${cat.key}`,
          kind: 'category',
          expected: `${cat.emoji} ${cat.slug}`,
          actual: null,
          status: 'missing' as const,
        },
        ...cat.channels.map((ch) => ({
          key: ch.key,
          kind: ch.kind === 'voice' ? 'salon vocal' : 'salon texte',
          expected: channelName(ch, config.prefix),
          actual: null,
          status: 'missing' as const,
        })),
      ]),
    ];
  }

  const missing = rows.filter((r) => r.status === 'missing');
  const outdated = rows.filter((r) => r.status === 'outdated');
  const okCount = rows.length - missing.length - outdated.length;
  const report = state.meta.blueprintReport;

  return (
    <>
      <PageHeader
        title="Structure du serveur"
        description="Comparaison entre le blueprint enregistré et la réalité du serveur Discord."
        action={
          <div className="flex gap-2">
            <ActionForm action={auditAction} submitLabel="🔎 Relancer l’audit" className="">
              <span />
            </ActionForm>
            <ActionForm
              action={runBlueprintAction}
              submitLabel="🚀 Tout créer / réparer"
              className=""
              pendingLabel="…"
            >
              <span />
            </ActionForm>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone="ok">{okCount} conforme(s)</Pill>
        <Pill tone={missing.length ? 'error' : 'muted'}>{missing.length} manquant(s)</Pill>
        <Pill tone={outdated.length ? 'warn' : 'muted'}>{outdated.length} à mettre à jour</Pill>
        {demo ? <Pill tone="warn">aperçu démo (bot hors ligne)</Pill> : null}
      </div>

      <Card title="Vérification détaillée" subtitle={`${rows.length} éléments vérifiés`}>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                <th>Nom attendu</th>
                <th>Sur le serveur</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="text-white/45">{row.kind}</td>
                  <td className="mono text-white/85">{row.expected}</td>
                  <td className="mono text-white/55">{row.actual ?? '—'}</td>
                  <td>
                    {row.status === 'ok' ? (
                      <Pill tone="ok">ok</Pill>
                    ) : row.status === 'missing' ? (
                      <Pill tone="error">manquant</Pill>
                    ) : (
                      <Pill tone="warn">à aligner</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {report ? (
        <Card
          className="mt-4"
          title="Dernier déploiement"
          subtitle={`${shortDate(report.finishedAt)} · ${state.meta.lastSetupBy ?? '—'}`}
        >
          <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
            {report.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-white/65">
                <span>
                  {{ created: '🟢', updated: '🔵', skipped: '⚪', error: '🔴', ok: '✅' }[s.level]}
                </span>
                <span>{s.message}</span>
              </li>
            ))}
          </ul>
          <Link href="/setup" className="mt-3 inline-block text-xs text-lilac hover:underline">
            Relancer un déploiement →
          </Link>
        </Card>
      ) : null}
    </>
  );
}
