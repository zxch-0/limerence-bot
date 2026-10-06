import Link from 'next/link';
import { Card, EmptyState, PageHeader, Pill, Stat, relativeDate, shortDate } from '@/components/ui';
import { getContext } from '@/lib/panel';
import { allChannels } from '@/lib/config';
import { storageKind } from '@/lib/store';
import { isDemoMode } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { state, config, bot, info, demo } = await getContext();
  const channels = allChannels(config);
  const textCount = channels.filter((c) => c.kind === 'text').length;
  const voiceCount = channels.filter((c) => c.kind === 'voice').length;
  const pending = state.confessions.filter((c) => c.status === 'pending');
  const published = state.confessions.filter((c) => c.status === 'published');
  const scheduled = state.announcements.filter((a) => a.status === 'scheduled');
  const report = state.meta.blueprintReport;

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description={`Bot Limerence · ${info.name}${demo ? ' (démonstration)' : ''}`}
        action={
          <Link href="/setup" className="btn btn-primary">
            🚀 Déployer le blueprint
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Membres"
          value={info.memberCount}
          hint={`${info.onlineCount} en ligne · ${info.roleCount} rôles`}
        />
        <Stat
          label="Structure prévue"
          value={`${channels.length}`}
          hint={`${config.categories.length} catégories · ${textCount} texte · ${voiceCount} vocal`}
          tone="ok"
        />
        <Stat
          label="Confessions"
          value={pending.length}
          hint={`${published.length} publiée(s) au total`}
          tone={pending.length ? 'warn' : 'info'}
        />
        <Stat
          label="Annonces programmées"
          value={scheduled.length}
          hint={`${state.announcements.length} au total`}
          tone="info"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="État du bot"
          subtitle="Connexion Discord et permissions"
          className="lg:col-span-2"
        >
          <div className="space-y-3 text-sm">
            <Row label="Statut">
              {bot.connected ? (
                <Pill tone="ok">connecté {bot.tag ? `· ${bot.tag}` : ''}</Pill>
              ) : bot.demo ? (
                <Pill tone="warn">mode démo — bot non configuré</Pill>
              ) : (
                <Pill tone="error">hors ligne</Pill>
              )}
            </Row>
            <Row label="Latence">
              {bot.ping !== null ? `${bot.ping} ms` : '—'}
              <span className="text-white/30"> · serveur : {info.id}</span>
            </Row>
            <Row label="Rôle automatique">
              <span
                className="mr-2 inline-block h-3 w-3 rounded-full border border-white/20 align-middle"
                style={{ backgroundColor: config.role.color }}
              />
              <span className="font-medium text-white/85">{config.role.name}</span>
              {config.role.autoAssign ? (
                <Pill tone="ok">auto à l’arrivée</Pill>
              ) : (
                <Pill tone="muted">désactivé</Pill>
              )}
            </Row>
            <Row label="Préfixe des salons texte">
              <span className="mono rounded-lg bg-white/5 px-2 py-0.5 text-lilac">{config.prefix}</span>
              <span className="ml-2 text-white/40">
                ex. {config.prefix} chat 💬
              </span>
            </Row>
            <Row label="Persistance">
              <Pill tone={storageKind() === 'postgres' ? 'ok' : 'muted'}>{storageKind()}</Pill>
            </Row>
            <Row label="Dernier déploiement">
              {report ? (
                <>
                  {shortDate(report.finishedAt)}{' '}
                  <span className="text-white/40">par {state.meta.lastSetupBy ?? '—'}</span>
                </>
              ) : (
                <span className="text-white/40">jamais lancé</span>
              )}
            </Row>
          </div>

          {isDemoMode() ? (
            <p className="mt-4 rounded-xl border border-line bg-white/[0.02] p-3 text-xs text-white/45">
              Pour passer en réel : renseigne les variables Discord dans Render, puis lance le
              déploiement depuis l’onglet <Link href="/setup" className="text-lilac underline">Déployer le blueprint</Link>.
            </p>
          ) : null}
        </Card>

        <Card title="Raccourcis">
          <div className="grid gap-2 text-sm">
            <QuickLink href="/setup" emoji="🚀" label="Créer / réparer le serveur" />
            <QuickLink href="/structure" emoji="🔎" label="Vérifier la structure" />
            <QuickLink href="/confessions" emoji="🤫" label="Modérer les confessions" />
            <QuickLink href="/announcements" emoji="📣" label="Publier une annonce" />
            <QuickLink href="/moderation" emoji="🛡️" label="Modération" />
            <QuickLink href="/settings" emoji="⚙️" label="Réglages & connexion" />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Journal récent" subtitle="Dernières actions du bot et du panel">
          {state.logs.length === 0 ? (
            <EmptyState>Aucune action enregistrée pour le moment.</EmptyState>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {state.logs.slice(0, 6).map((log) => (
                <li key={log.id} className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {{ info: 'ℹ️', success: '✅', warn: '⚠️', error: '⛔', moderation: '🔨' }[log.level]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-white/85">{log.action}</span>
                    <span className="block truncate text-xs text-white/40">
                      {log.detail} · {relativeDate(log.at)} · {log.source}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/logs" className="mt-4 inline-block text-xs text-lilac hover:underline">
            Voir tout le journal →
          </Link>
        </Card>

        <Card title="Blueprint" subtitle="Ce que le bot crée sur ton serveur">
          <div className="space-y-3 text-sm">
            {config.categories.map((cat) => (
              <div key={cat.key}>
                <p className="text-white/85">
                  {cat.emoji} <span className="font-medium">{cat.slug}</span>
                  {cat.adminOnly ? <span className="ml-2 text-xs text-white/35">(admin)</span> : null}
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {cat.channels.map((ch) => (
                    <span
                      key={ch.key}
                      className="rounded-lg border border-line bg-white/[0.03] px-2 py-0.5 text-xs text-white/60"
                    >
                      {ch.kind === 'voice'
                        ? `${ch.emoji} ${ch.label ?? ch.slug}`
                        : `${config.prefix} ${ch.slug} ${ch.emoji}`}
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 pb-2 last:border-none last:pb-0">
      <span className="text-white/45">{label}</span>
      <span className="text-right text-white/80">{children}</span>
    </div>
  );
}

function QuickLink({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2 text-white/70 transition hover:border-lilac/40 hover:text-white"
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span className="ml-auto text-white/25">→</span>
    </Link>
  );
}
