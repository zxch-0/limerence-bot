import { NextResponse } from 'next/server';
import { bootStatus } from '@/lib/boot';
import { storageKind } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Point de santé — utilisé par :
 *  • Render (healthCheckPath) au démarrage du service
 *  • UptimeRobot (recommandé : toutes les 5 minutes)
 *  • l'auto-ping interne (KEEPALIVE_MINUTES)
 *
 * C'est aussi ce ping qui (re)démarre le bot après une mise en veille.
 * La réponse ne bloque jamais sur Discord.
 */
export async function GET() {
  const status = await bootStatus();

  return NextResponse.json(
    {
      ok: true,
      service: 'limerence-bot',
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      booted: status.booted,
      bootedAt: status.bootedAt,
      keepAliveMinutes: status.keepAliveMinutes,
      bot: {
        configured: status.bot.configured,
        connected: status.bot.connected,
        demo: status.bot.demo,
        tag: status.bot.tag,
        ping: status.bot.ping,
        error: status.bot.error,
      },
      storage: storageKind(),
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}
