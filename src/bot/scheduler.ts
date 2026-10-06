import type { Client } from 'discord.js';
import { getGuild } from '../lib/discord/client';
import { processDueAnnouncements } from './announcements';
import { reconcileTempRooms } from './tempRooms';

// ============================================================
//  Planificateur interne : annonces programmées, ménage des
//  salons temporaires, et auto-ping /health (Render gratuit).
// ============================================================

interface SchedulerGlobals {
  timers: NodeJS.Timeout[];
  running: boolean;
  ticking: boolean;
}

const g: SchedulerGlobals = ((globalThis as typeof globalThis & {
  __limerenceScheduler?: SchedulerGlobals;
}).__limerenceScheduler ??= { timers: [], running: false, ticking: false });

const TICK_MS = 30_000;

export function startScheduler(client: Client): void {
  if (g.running) return;
  g.running = true;

  const tick = async () => {
    if (g.ticking) return;
    g.ticking = true;
    try {
      if (!client.isReady()) return;
      const guild = await getGuild(false);
      if (!guild) return;

      const sent = await processDueAnnouncements(guild);
      if (sent > 0) console.log(`[scheduler] ${sent} annonce(s) envoyée(s)`);

      // ménage des salons temporaires orphelins (toutes les 10 min)
      if (Math.floor(Date.now() / TICK_MS) % 20 === 0) {
        await reconcileTempRooms(guild);
      }
    } catch (err) {
      console.error('[scheduler] erreur :', (err as Error).message);
    } finally {
      g.ticking = false;
    }
  };

  g.timers.push(setInterval(tick, TICK_MS));
  void tick();
  console.log('[scheduler] démarré (tick 30s) — auto-ping géré par lib/boot.ts');
}

export function stopScheduler(): void {
  for (const t of g.timers) clearInterval(t);
  g.timers = [];
  g.running = false;
}
