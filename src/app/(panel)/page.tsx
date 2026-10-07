import Link from 'next/link';
import { Card, EmptyState, PageHeader, Pill, Stat, relativeDate } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { getContext, inviteUrl } from '@/lib/panel';
import { hasExplicitWelcomeChannel, welcomeChannelId } from '@/lib/welcome';
import { missingSlots } from '@/lib/channels';
import { CHANNEL_SLOT_META } from '@/lib/types';
import { formatMoney, leaderboard, moneySupply } from '@/lib/economy/core';
import { storageKind } from '@/lib/store';
import { restartBotAction } from './actions/config';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { state, config, bot, info, demo } = await getContext();

  const accounts = Object.values(state.accounts);
  const supply = moneySupply(state);
  const hands = Object.values(state.blackjackStats).reduce((total, stats) => total + stats.hands, 0);
  const wagered = Object.values(state.blackjackStats).reduce((total, stats) => total + stats.wagered, 0);
  const activeWarns = state.cases.filter((modCase) => modCase.type === 'warn' && modCase.active).length;
  const openCases = state.cases.filter((modCase) => modCase.active).length;
  const missing = missingSlots(config);
  const welcomeTarget = welcomeChannelId(config);
  const invite = inviteUrl();

  const top = leaderboard(state, config.economy, {
    guildMemberIds: undefined,
    knownBotIds: undefined,
  }).slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Bonjour, ${info.name}`}
        description="Tout ce que le bot gère sur ton serveur : économie, blackjack, boutique et modération."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {invite ? (
              <a className="btn btn-ghost" href={invite} target="_blank" rel="noreferrer">
                Inviter le bot
              </a>
            ) : null}
            <ActionForm
              action={restartBotAction}
              submitLabel={bot.connected ? 'Resynchroniser' : 'Démarrer le bot'}
              className="contents"
              pendingLabel="Redémarrage…"
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Membres suivis"
          value={accounts.length}
          hint={`${formatMoney(config.economy, supply.total)} en circulation`}
        />
        <Stat
          label="Parties de blackjack"
          value={hands}
          hint={`${formatMoney(config.economy, wagered)} misés au total`}
          tone="ok"
        />
        <Stat
          label="Avertissements actifs"
          value={activeWarns}
          hint={`${openCases} dossier(s) au total`}
          tone={activeWarns ? 'warn' : 'info'}
        />
        <Stat
          label="Articles en boutique"
          value={state.shopItems.filter((item) => item.enabled).length}
          hint={`${state.shopItems.length} au catalogue`}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card title="État du système" subtitle="Bot, stockage et tâches planifiées">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Bot" value={bot.tag ?? (bot.demo ? 'mode démo' : 'hors ligne')} />
            <Row label="Latence" value={bot.ping ? `${bot.ping} ms` : '—'} />
            <Row label="Serveur" value={`${info.name} · ${info.memberCount} membres`} />
            <Row label="Salons" value={`${info.channelCount} salon(s)`} />
            <Row label="Stockage" value={storageKind()} />
            <Row label="Installé" value={relativeDate(state.meta.installedAt)} />
            <Row label="Derniers intérêts" value={relativeDate(state.meta.lastInterestAt)} />
            <Row label="Dernier réassort" value={relativeDate(state.meta.lastRestockAt)} />
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {config.economy.enabled ? <Pill tone="ok">économie active</Pill> : <Pill tone="warn">économie coupée</Pill>}
            {config.blackjack.enabled ? <Pill tone="ok">blackjack actif</Pill> : <Pill tone="warn">blackjack coupé</Pill>}
            {config.shop.enabled ? <Pill tone="ok">boutique active</Pill> : <Pill tone="warn">boutique coupée</Pill>}
            {config.moderation.warnEnabled ? <Pill tone="ok">avertissements actifs</Pill> : <Pill tone="warn">avertissements coupés</Pill>}
            {config.moderation.automodEnabled ? <Pill tone="ok">auto-modération</Pill> : <Pill tone="muted">auto-modération coupée</Pill>}
          </div>
        </Card>

        <Card
          title="Salons du bot"
          subtitle="Le bot n’utilise que des salons existants"
          action={<Link className="btn btn-ghost btn-xs" href="/welcome">Configurer</Link>}
        >
          {missing.length === 0 ? (
            <p className="text-sm text-white/60">
              Les {Object.keys(config.channels).length} emplacements sont renseignés.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm text-white/60">
              {missing.map((slot) => (
                <li key={slot} className="flex items-center gap-2">
                  <span>{CHANNEL_SLOT_META[slot].emoji}</span>
                  <span>{CHANNEL_SLOT_META[slot].label}</span>
                  <Pill tone="warn">non défini</Pill>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill
              tone={
                !config.welcome.enabled ? 'muted' : hasExplicitWelcomeChannel(config) ? 'ok' : welcomeTarget ? 'warn' : 'error'
              }
            >
              {config.welcome.enabled
                ? hasExplicitWelcomeChannel(config)
                  ? `bienvenue → salon choisi (${welcomeTarget})`
                  : welcomeTarget
                    ? `bienvenue → emplacement (${welcomeTarget})`
                    : 'bienvenue → aucun salon trouvé'
                : 'bienvenue coupée'}
            </Pill>
            <Link className="btn btn-ghost btn-xs" href="/welcome">
              Choisir le salon
            </Link>
          </div>
          <p className="mt-3 text-xs text-white/35">
            Aucun salon n’est obligatoire : le bot fonctionne même si certains emplacements restent vides.
          </p>
        </Card>

        <Card title="Classement" subtitle={`Top 5 en ${config.economy.currencyPlural.toLowerCase()}`}>
          {top.length === 0 ? (
            <EmptyState>Aucun compte pour le moment — les membres gagnent de l’argent en discutant.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Membre</th>
                  <th>Poche</th>
                  <th>Banque</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {top.map((entry) => (
                  <tr key={entry.userId}>
                    <td className="text-white/45">{entry.rank}</td>
                    <td className="mono">{entry.userId}</td>
                    <td>{formatMoney(config.economy, entry.cash)}</td>
                    <td>{formatMoney(config.economy, entry.bank)}</td>
                    <td className="text-mint">{formatMoney(config.economy, entry.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="Journal"
          subtitle="Dernières actions du bot et du panel"
          action={<Link className="btn btn-ghost btn-xs" href="/logs">Tout voir</Link>}
        >
          {state.logs.length === 0 ? (
            <EmptyState>Le journal est vide.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {state.logs.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 border-b border-line/60 pb-2 last:border-none">
                  <Pill tone={entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'muted'}>
                    {entry.level}
                  </Pill>
                  <span className="flex-1 text-white/70">
                    {entry.action}
                    {entry.detail ? <span className="text-white/40"> — {entry.detail}</span> : null}
                  </span>
                  <span className="text-xs text-white/35">{relativeDate(entry.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/ui" emoji="🎨" title="Interface" hint="Thème, menu central et cartes du bot" />
        <QuickLink href="/economy" emoji="💰" title="Économie" hint="144 options : gains, drops, vols, banque…" />
        <QuickLink href="/blackjack" emoji="🃏" title="Blackjack" hint="Règles, mises, splits, assurance" />
        <QuickLink href="/shop" emoji="🛒" title="Boutique" hint="Articles, stock, rôles, boosters" />
        <QuickLink href="/moderation" emoji="🛡️" title="Modération" hint="Avertissements, sanctions, dossiers" />
      </div>

      {demo ? (
        <p className="mt-6 text-xs text-white/35">
          Le bot n’est pas connecté : les compteurs reflètent les données enregistrées, pas le serveur Discord.
        </p>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
      <dt className="text-xs uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-0.5 text-sm text-white/80">{value}</dd>
    </div>
  );
}

function QuickLink({ href, emoji, title, hint }: { href: string; emoji: string; title: string; hint: string }) {
  return (
    <Link href={href} className="glass rounded-2xl border border-line p-4 transition hover:border-lilac/40">
      <p className="text-lg">{emoji}</p>
      <p className="mt-1 text-sm font-medium text-white/90">{title}</p>
      <p className="mt-0.5 text-xs text-white/40">{hint}</p>
    </Link>
  );
}
