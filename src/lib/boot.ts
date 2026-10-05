import { startBot, botStatus } from './discord/client';
import { getState } from './store';

// ============================================================
//  Amorçage du bot (une seule fois par process)
//
//  Appelé par /health (pinguée par Render au démarrage puis par
//  UptimeRobot toutes les 5 min) et à chaque chargement du panel.
//  Avantage : aucun bundling edge de discord.js, donc build simple
//  et démarrage immédiat au premier ping.
// ============================================================

interface BootGlobals {
  booted: boolean;
  booting: Promise<void> | null;
  keepAlive: NodeJS.Timeout | null;
  bootedAt: string | null;
}

const g: BootGlobals = ((globalThis as typeof globalThis & { __limerenceBoot?: BootGlobals })
  .__limerenceBoot ??= { booted: false, booting: null, keepAlive: null, bootedAt: null });

const KEEPALIVE_MINUTES = Math.max(0, Number(process.env.KEEPALIVE_MINUTES ?? '10') || 0);

function startKeepAlive() {
  if (g.keepAlive || KEEPALIVE_MINUTES <= 0) return;
  const base = process.env.PUBLIC_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  if (!base) return;

  g.keepAlive = setInterval(async () => {
    try {
      const res = await fetch(`${base.replace(/\/+$/, '')}/health`, { cache: 'no-store' });
      console.log(`[keepalive] /health -> ${res.status}`);
    } catch (err) {
      console.warn('[keepalive] ping échoué :', (err as Error).message);
    }
  }, KEEPALIVE_MINUTES * 60_000);

  console.log(`[boot] auto-ping /health toutes les ${KEEPALIVE_MINUTES} min`);
}

/** Démarre le bot + le maintien en éveil. Idempotent et non bloquant. */
export function ensureBoot(): Promise<void> {
  if (g.booting) return g.booting;
  g.booting = (async () => {
    try {
      await getState();
    } catch (err) {
      console.error('[boot] configuration illisible :', (err as Error).message);
    }
    startKeepAlive();
    try {
      await startBot();
    } catch (err) {
      console.error('[boot] démarrage du bot échoué :', (err as Error).message);
    }
    g.booted = true;
    g.bootedAt = new Date().toISOString();
  })();
  return g.booting;
}

export interface BootStatus {
  booted: boolean;
  bootedAt: string | null;
  keepAliveMinutes: number;
  bot: ReturnType<typeof botStatus>;
}

export async function bootStatus(): Promise<BootStatus> {
  // on relance une tentative si le bot n'est pas connecté (ex : après une veille Render)
  if (!g.booting || (!botStatus().connected && !botStatus().demo)) {
    void ensureBoot();
  }
  return {
    booted: g.booted,
    bootedAt: g.bootedAt,
    keepAliveMinutes: KEEPALIVE_MINUTES,
    bot: botStatus(),
  };
}
