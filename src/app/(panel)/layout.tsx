import { redirect } from 'next/navigation';
import { Sidebar, type NavGroup } from '@/components/Sidebar';
import { requireAdmin } from '@/lib/auth';
import { ensureBoot } from '@/lib/boot';
import { botStatus } from '@/lib/discord/client';
import { getState } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  if (!user) redirect('/login');

  // (re)démarre le bot si besoin — jamais bloquant
  void ensureBoot();

  const state = await getState();
  const bot = botStatus();
  const pendingConfessions = state.confessions.filter((c) => c.status === 'pending').length;
  const scheduledAnnouncements = state.announcements.filter((a) => a.status === 'scheduled').length;
  const activeWarns = state.cases.filter((c) => c.type === 'warn' && c.active).length;
  const openTables = Object.values(state.blackjack).filter((game) => game.status !== 'finished').length;

  const groups: NavGroup[] = [
    {
      id: 'general',
      label: 'Général',
      items: [
        { href: '/', label: 'Tableau de bord', emoji: '✦' },
        { href: '/ui', label: 'Interface du bot', emoji: '🎨' },
        { href: '/welcome', label: 'Accueil & salons', emoji: '👋' },
        { href: '/logs', label: 'Journal', emoji: '🧾', badge: state.logs.length || undefined },
        { href: '/settings', label: 'Réglages', emoji: '⚙️' },
      ],
    },
    {
      id: 'economy',
      label: 'Économie & jeux',
      items: [
        { href: '/economy', label: 'Configuration', emoji: '💰' },
        { href: '/economy/players', label: 'Comptes des membres', emoji: '👥' },
        { href: '/blackjack', label: 'Blackjack', emoji: '🃏', badge: openTables || undefined },
        { href: '/casino', label: 'Casino', emoji: '🎰' },
        { href: '/shop', label: 'Boutique', emoji: '🛒', badge: state.shopItems.length || undefined },
      ],
    },
    {
      id: 'moderation',
      label: 'Modération',
      items: [
        { href: '/moderation', label: 'Sanctions & dossiers', emoji: '🛡️' },
        { href: '/warns', label: 'Avertissements', emoji: '⚠️', badge: activeWarns || undefined },
        { href: '/automod', label: 'Auto-modération', emoji: '🤖' },
      ],
    },
    {
      id: 'community',
      label: 'Communauté',
      items: [
        { href: '/confessions', label: 'Confessions', emoji: '🤫', badge: pendingConfessions || undefined },
        { href: '/announcements', label: 'Annonces', emoji: '📣', badge: scheduledAnnouncements || undefined },
        { href: '/embeds', label: 'Embeds personnalisés', emoji: '🪄', badge: state.embeds.length || undefined },
      ],
    },
  ];

  return (
    <div className="min-h-dvh lg:pl-72">
      <Sidebar
        groups={groups}
        user={{
          name: user.globalName ?? user.username,
          avatarUrl: user.avatarUrl,
        }}
        bot={{ connected: bot.connected, demo: bot.demo, tag: bot.tag }}
      />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-20 lg:px-8 lg:pt-10">
        {bot.demo ? (
          <div className="mb-6 rounded-2xl border border-sand/30 bg-sand/10 p-4 text-sm text-sand">
            <strong className="font-medium">Mode démo.</strong> Le bot n’est pas encore configuré :
            les données affichées sont fictives. Ajoute <code>DISCORD_TOKEN</code>,{' '}
            <code>DISCORD_CLIENT_ID</code>, <code>DISCORD_CLIENT_SECRET</code> et{' '}
            <code>DISCORD_GUILD_ID</code> dans Render pour passer en réel.
          </div>
        ) : null}
        {!bot.demo && !bot.connected ? (
          <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
            <strong className="font-medium">Bot hors ligne.</strong>{' '}
            {bot.error ?? 'Connexion Discord indisponible.'}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
