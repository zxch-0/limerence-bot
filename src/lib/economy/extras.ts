import type { EconomyAccount, EconomyConfig, StoreState } from '../types';
import {
  awardXp,
  chance,
  cooldownRemaining,
  credit,
  formatMoney,
  humanDuration,
  randomInt,
  setCooldown,
  totalBalance,
  type Rng,
} from './core';
import { trackQuest } from './quests';

// ============================================================
//  Extras économiques : roue de la fortune, coffres, prestige
//  et succès (achievements). Logique pure, testable sans Discord.
// ============================================================

// ------------------------------------------------------------
//  Roue de la fortune (/spin)
// ------------------------------------------------------------

export interface SpinResult {
  ok: boolean;
  amount: number;
  jackpot: boolean;
  reason?: string;
  waitMs?: number;
}

export function runSpin(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  now: Date = new Date(),
  rng: Rng = Math.random,
): SpinResult {
  if (!config.enabled) return { ok: false, amount: 0, jackpot: false, reason: 'L’économie est désactivée.' };
  if (!config.spinEnabled) return { ok: false, amount: 0, jackpot: false, reason: 'La roue de la fortune est désactivée.' };

  const remaining = cooldownRemaining(account, 'spin', now);
  if (remaining > 0) {
    return { ok: false, amount: 0, jackpot: false, reason: `La roue est encore chaude : reviens dans ${humanDuration(remaining)}.`, waitMs: remaining };
  }

  account.spinsCount += 1;
  setCooldown(account, 'spin', config.spinCooldownHours * 3600, now);

  const jackpot = config.spinJackpotAmount > 0 && chance(config.spinJackpotChancePercent, rng);
  const amount = jackpot
    ? config.spinJackpotAmount
    : randomInt(Math.min(config.spinMin, config.spinMax), Math.max(config.spinMin, config.spinMax), rng);
  if (amount <= 0) {
    return { ok: true, amount: 0, jackpot: false, reason: 'La roue n’a rien donné cette fois…' };
  }

  const paid = credit(account, config, amount, 'spin', jackpot ? 'Jackpot de la roue' : 'Roue de la fortune', now);
  if (!paid.ok) return { ok: false, amount: 0, jackpot, reason: paid.reason ?? 'Impossible de te payer.' };
  awardXp(account, config, paid.amount, now);
  trackQuest(state, account, config, 'gain_money', paid.amount, now);
  return { ok: true, amount: paid.amount, jackpot };
}

// ------------------------------------------------------------
//  Coffres (/coffre)
// ------------------------------------------------------------

/** Ajoute des coffres à un membre (récompenses de quêtes, drops…). */
export function grantCrates(account: EconomyAccount, count: number): number {
  const qty = Math.floor(count);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  account.crates += qty;
  return qty;
}

export interface CrateResult {
  ok: boolean;
  amount: number;
  xp: number;
  jackpot: boolean;
  cratesLeft: number;
  reason?: string;
  /** true si un coffre gratuit quotidien a été obtenu automatiquement */
  freeClaimed?: boolean;
}

/**
 * Ouvre un coffre. Si le membre n’en a plus, tente de réclamer le coffre
 * gratuit quotidien (si la configuration l’autorise et que le délai est
 * écoulé).
 */
export function openCrate(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  now: Date = new Date(),
  rng: Rng = Math.random,
): CrateResult {
  if (!config.enabled) return { ok: false, amount: 0, xp: 0, jackpot: false, cratesLeft: 0, reason: 'L’économie est désactivée.' };
  if (!config.cratesEnabled) {
    return { ok: false, amount: 0, xp: 0, jackpot: false, cratesLeft: 0, reason: 'Les coffres sont désactivés.' };
  }

  let freeClaimed = false;
  if (account.crates <= 0 && config.cratesDailyFree > 0) {
    const last = account.lastFreeCrateAt ? new Date(account.lastFreeCrateAt).getTime() : 0;
    if (!last || now.getTime() - last >= 86_400_000) {
      account.crates += config.cratesDailyFree;
      account.lastFreeCrateAt = now.toISOString();
      freeClaimed = true;
    }
  }
  if (account.crates <= 0) {
    const last = account.lastFreeCrateAt ? new Date(account.lastFreeCrateAt).getTime() : 0;
    const waitMs = last ? Math.max(0, last + 86_400_000 - now.getTime()) : 0;
    return {
      ok: false,
      amount: 0,
      xp: 0,
      jackpot: false,
      cratesLeft: 0,
      reason:
        waitMs > 0
          ? `Tu n’as plus de coffre : ton prochain coffre gratuit arrive dans ${humanDuration(waitMs)}.`
          : 'Tu n’as plus de coffre : les quêtes et les drops t’en offrent !',
    };
  }

  account.crates -= 1;
  account.cratesOpened += 1;

  const jackpot = config.crateJackpotAmount > 0 && chance(config.crateJackpotChancePercent, rng);
  const amount = jackpot
    ? config.crateJackpotAmount
    : randomInt(Math.min(config.crateMin, config.crateMax), Math.max(config.crateMin, config.crateMax), rng);

  let paid = 0;
  if (amount > 0) {
    const credited = credit(account, config, amount, 'crate', jackpot ? 'Jackpot de coffre' : 'Coffre ouvert', now);
    if (credited.ok) paid = credited.amount;
  }
  let xp = 0;
  if (config.crateXp > 0) {
    const gained = awardXp(account, config, config.crateXp * Math.max(1, config.xpPerAmount), now);
    if (gained) xp = gained.xp;
  }
  trackQuest(state, account, config, 'gain_money', paid, now);
  return { ok: true, amount: paid, xp, jackpot, cratesLeft: account.crates, freeClaimed };
}

// ------------------------------------------------------------
//  Prestige (/prestige)
// ------------------------------------------------------------

export interface PrestigeResult {
  ok: boolean;
  prestige: number;
  reason?: string;
}

/**
 * Prestige : remet le compte économique à zéro (sauf les succès) contre
 * un bonus permanent de gains. La fortune totale doit atteindre le seuil
 * configuré.
 */
export function runPrestige(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  now: Date = new Date(),
): PrestigeResult {
  void state;
  if (!config.enabled) return { ok: false, prestige: account.prestige, reason: 'L’économie est désactivée.' };
  if (!config.prestigeEnabled) return { ok: false, prestige: account.prestige, reason: 'Le prestige est désactivé.' };
  if (totalBalance(account) < config.prestigeMinTotal) {
    return {
      ok: false,
      prestige: account.prestige,
      reason: `Il te faut ${formatMoney(config, config.prestigeMinTotal)} au total pour prestigier (tu as ${formatMoney(config, totalBalance(account))}).`,
    };
  }

  const startBalance = Math.max(0, config.startBalance);
  const keptAchievements = [...account.achievements];
  const fresh = {
    cash: startBalance,
    bank: 0,
    stocks: {} as EconomyAccount['stocks'],
    crates: 0,
    lotteryTickets: 0,
    xp: 0,
    level: 1,
    dailyStreak: 0,
    workStreak: 0,
    winStreak: 0,
    lossStreak: 0,
    messageStreak: 0,
    questProgress: {} as Record<string, number>,
    cooldowns: {} as EconomyAccount['cooldowns'],
  };
  account.cash = fresh.cash;
  account.bank = fresh.bank;
  // les rôles (boutique) restent : ils existent aussi sur Discord
  account.items = account.items.filter((item) => item.effect === 'role' || item.effect === 'income');
  account.stocks = fresh.stocks;
  account.crates = fresh.crates;
  account.lotteryTickets = fresh.lotteryTickets;
  account.xp = fresh.xp;
  account.level = fresh.level;
  account.dailyStreak = fresh.dailyStreak;
  account.workStreak = fresh.workStreak;
  account.winStreak = fresh.winStreak;
  account.lossStreak = fresh.lossStreak;
  account.messageStreak = fresh.messageStreak;
  account.questProgress = fresh.questProgress;
  account.cooldowns = fresh.cooldowns;
  account.jailUntil = undefined;
  account.shieldUntil = undefined;
  account.prestige += 1;
  account.achievements = keptAchievements;
  account.updatedAt = now.toISOString();

  // retrait des tickets de loterie de l’ancien cycle
  const lottery = state.meta.lottery;
  if (lottery && lottery.tickets[account.userId]) {
    delete lottery.tickets[account.userId];
  }

  credit(account, config, 0, 'prestige', `Prestige #${account.prestige}`, now);
  return { ok: true, prestige: account.prestige };
}

// ------------------------------------------------------------
//  Succès (achievements)
// ------------------------------------------------------------

export interface AchievementDef {
  id: string;
  label: string;
  emoji: string;
  description: string;
  check: (account: EconomyAccount) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_steps', label: 'Premiers pas', emoji: '👣', description: 'Gagner 1 000 pièces par ton travail ou tes jeux.', check: (a) => a.totalEarned - a.totalSpent >= 1_000 },
  { id: 'player', label: 'Joueur', emoji: '🎮', description: 'Jouer ta première partie.', check: (a) => a.gamesPlayed >= 1 },
  { id: 'veteran', label: 'Vétéran', emoji: '🎖️', description: 'Jouer 100 parties.', check: (a) => a.gamesPlayed >= 100 },
  { id: 'winner', label: 'Gagnant', emoji: '🏆', description: 'Gagner ta première partie.', check: (a) => a.gamesWon >= 1 },
  { id: 'on_fire', label: 'En feu', emoji: '🔥', description: 'Atteindre une série de 5 victoires.', check: (a) => a.winStreak >= 5 },
  { id: 'level5', label: 'Niveau 5', emoji: '📈', description: 'Atteindre le niveau 5.', check: (a) => a.level >= 5 },
  { id: 'level10', label: 'Niveau 10', emoji: '🚀', description: 'Atteindre le niveau 10.', check: (a) => a.level >= 10 },
  { id: 'thousands', label: 'Petit épargnant', emoji: '🐷', description: 'Gagner 10 000 pièces au total.', check: (a) => a.totalEarned >= 10_000 },
  { id: 'millionaire', label: 'Millionnaire', emoji: '💎', description: 'Gagner 1 000 000 de pièces au total.', check: (a) => a.totalEarned >= 1_000_000 },
  { id: 'jackpot', label: 'Jackpot', emoji: '🎟️', description: 'Remporter la loterie.', check: (a) => a.jackpotWins >= 1 },
  { id: 'investor', label: 'Investisseur', emoji: '📊', description: 'Acheter ta première action.', check: (a) => Object.keys(a.stocks).length > 0 },
  { id: 'prestiged', label: 'Renaissance', emoji: '🌟', description: 'Prestigier une fois.', check: (a) => a.prestige >= 1 },
  { id: 'collector', label: 'Collectionneur', emoji: '🎒', description: 'Posséder 5 objets en même temps.', check: (a) => a.items.length >= 5 },
  { id: 'shopper', label: 'Dépencier', emoji: '🛍️', description: 'Dépenser 1 000 pièces au total.', check: (a) => a.totalSpent >= 1_000 },
];

export interface AchievementUnlock {
  def: AchievementDef;
  reward: number;
  xp: number;
}

/**
 * Vérifie les succès, débloque les nouveaux, crédite leurs récompenses
 * et renvoie la liste des succès débloqués (pour l’annonce Discord).
 */
export function checkAchievements(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  now: Date = new Date(),
): AchievementUnlock[] {
  void state;
  if (!config.enabled || !config.achievementsEnabled) return [];
  const unlocked: AchievementUnlock[] = [];
  for (const def of ACHIEVEMENTS) {
    if (account.achievements.includes(def.id)) continue;
    let passed = false;
    try {
      passed = def.check(account);
    } catch {
      passed = false;
    }
    if (!passed) continue;
    account.achievements.push(def.id);
    if (config.achievementReward > 0) {
      credit(account, config, config.achievementReward, 'achievement', `Succès : ${def.label}`, now);
    }
    let xp = 0;
    if (config.achievementXp > 0) {
      const gained = awardXp(account, config, config.achievementXp * Math.max(1, config.xpPerAmount), now);
      if (gained) xp = gained.xp;
    }
    unlocked.push({ def, reward: config.achievementReward, xp });
  }
  if (unlocked.length) account.updatedAt = now.toISOString();
  return unlocked;
}

/** Progression d’un membre sur tous les succès. */
export function achievementProgress(account: EconomyAccount): Array<{ def: AchievementDef; unlocked: boolean }> {
  return ACHIEVEMENTS.map((def) => ({ def, unlocked: account.achievements.includes(def.id) }));
}
