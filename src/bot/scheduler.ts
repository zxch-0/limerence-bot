import type { Client } from 'discord.js';
import { getGuild } from '../lib/discord/client';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { processDueAnnouncements } from './announcements';
import { reconcileTempRooms } from './tempRooms';
import { expireTimedOutGames } from './blackjack';
import { applyBankInterest } from '../lib/economy/actions';
import { processDrops, processVoiceRewards } from './rewards';
import { restock } from '../lib/shop/items';
import { pruneCases } from '../lib/moderation/cases';
import { formatMoney, leaderboard } from '../lib/economy/core';

// ============================================================
//  Planificateur interne
//  annonces programmées · intérêts bancaires · récompenses vocales
//  drops · réassort boutique · parties de blackjack expirées
//  ménage des salons temporaires et des dossiers
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

  let tickCount = 0;

  const tick = async () => {
    if (g.ticking) return;
    g.ticking = true;
    tickCount += 1;
    try {
      if (!client.isReady()) return;
      const guild = await getGuild(false);
      const state = await getState();

      // 1) parties de blackjack abandonnées par le temps (toujours, même sans serveur)
      await expireTimedOutGames().catch(() => undefined);

      if (!guild) return;

      // 2) annonces programmées
      const sent = await processDueAnnouncements(guild).catch(() => 0);
      if (sent) console.log(`[scheduler] ${sent} annonce(s) envoyée(s)`);

      // 3) récompenses vocales (à chaque tick)
      await processVoiceRewards(guild).catch(() => undefined);

      // 4) intérêts bancaires
      const interestHours = Math.max(1, state.config.economy.interestIntervalHours);
      const lastInterest = state.meta.lastInterestAt ? new Date(state.meta.lastInterestAt).getTime() : 0;
      if (Date.now() - lastInterest >= interestHours * 3_600_000) {
        const report = await updateState((s) => applyBankInterest(s, s.config.economy));
        await updateState((s) => {
          s.meta.lastInterestAt = new Date().toISOString();
          return null;
        });
        if (report.members > 0) {
          await addLog({
            level: 'economy',
            source: 'bot',
            action: 'Intérêts bancaires versés',
            detail: `${report.members} compte(s) · ${formatMoney(state.config.economy, report.total)}`,
          });
        }
      }

      // 5) réassort boutique
      const restockHours = Math.max(1, state.config.shop.restockEveryHours);
      const lastRestock = state.meta.lastRestockAt ? new Date(state.meta.lastRestockAt).getTime() : 0;
      if (state.config.shop.restockEnabled && Date.now() - lastRestock >= restockHours * 3_600_000) {
        const count = await updateState((s) => {
          const restocked = restock(s, s.config.shop);
          s.meta.lastRestockAt = new Date().toISOString();
          return restocked;
        });
        if (count > 0) {
          await addLog({ level: 'info', source: 'bot', action: 'Réassort de la boutique', detail: `${count} article(s)` });
        }
      }

      // 6) rôle du plus riche
      if (state.config.economy.richestRoleEnabled && /^\d{15,25}$/.test(state.config.economy.richestRoleId)) {
        const refreshHours = Math.max(1, state.config.economy.richestRefreshHours);
        const lastRoleAt = state.meta.lastRichestRoleAt ? new Date(state.meta.lastRichestRoleAt).getTime() : 0;
        if (Date.now() - lastRoleAt >= refreshHours * 3_600_000) {
          const changed = await assignRichestRole(guild.id).catch(() => false);
          await updateState((s) => {
            s.meta.lastRichestRoleAt = new Date().toISOString();
            return null;
          });
          if (changed) {
            await addLog({
              level: 'economy',
              source: 'bot',
              action: 'Rôle du plus riche attribué',
              detail: `<@${changed}>`,
            });
          }
        }
      }

      // 7) cagnottes (toutes les minutes)
      if (tickCount % 2 === 0) await processDrops(guild).catch(() => undefined);

      // 8) ménage (toutes les 10 minutes)
      if (tickCount % 20 === 0) {
        await reconcileTempRooms(guild).catch(() => undefined);
        await updateState((s) => pruneCases(s, s.config.moderation)).catch(() => undefined);
      }
    } catch (err) {
      console.error('[scheduler] erreur :', (err as Error).message);
    } finally {
      g.ticking = false;
    }
  };

  g.timers.push(setInterval(tick, TICK_MS));
  void tick();
  console.log('[scheduler] démarré (tick 30s)');
}

/** Donne le rôle « plus riche » au premier du classement ; renvoie son ID s'il a changé. */
async function assignRichestRole(guildId: string): Promise<string | false> {
  const state = await getState();
  const roleId = state.config.economy.richestRoleId;
  const { getReadyClient } = await import('../lib/discord/client');
  const client = getReadyClient();
  if (!client) return false;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const members = await guild.members.fetch().catch(() => null);
  const ids = new Set<string>();
  const bots = new Set<string>();
  for (const member of members?.values() ?? []) {
    if (!member) continue;
    ids.add(member.id);
    if (member.user.bot) bots.add(member.id);
  }
  const entries = leaderboard(state, state.config.economy, { guildMemberIds: ids, knownBotIds: bots });
  const winner = entries[0];
  if (!winner) return false;

  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return false;
  if (state.meta.lastRichestRoleId === winner.userId) return false;

  for (const member of members?.values() ?? []) {
    if (!member) continue;
    if (member.user.bot || !member.roles.cache.has(roleId)) continue;
    if (member.id === winner.userId) continue;
    await member.roles.remove(roleId, 'Le titre du plus riche a changé de main').catch(() => undefined);
  }
  const target = members?.get(winner.userId) ?? null;
  if (!target) return false;
  const added = await target.roles.add(roleId, 'Membre le plus riche').then(() => true).catch(() => false);
  if (!added) return false;
  await updateState((s) => {
    s.meta.lastRichestRoleId = winner.userId;
    return null;
  });
  return winner.userId;
}

export function stopScheduler(): void {
  for (const timer of g.timers) clearInterval(timer);
  g.timers = [];
  g.running = false;
}
