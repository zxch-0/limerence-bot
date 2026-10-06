import { redirect } from 'next/navigation';
import { Sidebar, type NavItem } from '@/components/Sidebar';
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
  const pending = state.confessions.filter((c) => c.status === 'pending').length;
  const scheduled = state.announcements.filter((a) => a.status === 'scheduled').length;

  const items: NavItem[] = [
    { href: '/', label: 'Tableau de bord', emoji: '✦' },
    { href: '/setup', label: 'Déployer le blueprint', emoji: '🚀' },
    { href: '/structure', label: 'Structure du serveur', emoji: '🧱' },
    { href: '/channels', label: 'Salons & catégories', emoji: '📚' },
    { href: '/role', label: 'Rôle limerencien', emoji: '🤍' },
    { href: '/voice', label: 'Vocaux privés', emoji: '🎧' },
    { href: '/confessions', label: 'Confessions', emoji: '🤫', badge: pending || undefined },
    { href: '/announcements', label: 'Annonces', emoji: '📣', badge: scheduled || undefined },
    { href: '/embeds', label: 'Embeds personnalisés', emoji: '🪄', badge: state.embeds.length || undefined },
    { href: '/members', label: 'Membres', emoji: '👥' },
    { href: '/moderation', label: 'Modération', emoji: '🛡️' },
    { href: '/logs', label: 'Journal', emoji: '🧾' },
    { href: '/settings', label: 'Réglages', emoji: '⚙️' },
  ];

  return (
    <div className="min-h-dvh lg:pl-72">
      <Sidebar
        items={items}
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
