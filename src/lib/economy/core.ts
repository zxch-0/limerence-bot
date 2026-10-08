import { randomUUID } from 'node:crypto';
import type { StoreState } from '../types';
import type { EconomyAccount, EconomyConfig, Transaction, TransactionType } from '../types';

// ============================================================
//  Cœur de l'économie : comptes, plafonds, cooldowns, journal
//
//  Toutes les fonctions de ce fichier sont déterministes : le hasard
//  est injecté (rng) afin que la logique soit testable sans Discord.
// ============================================================

export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

export function randomInt(min: number, max: number, rng: Rng = defaultRng): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (high === low) return Math.round(low);
  return Math.floor(rng() * (high - low + 1)) + low;
}

export function chance(percent: number, rng: Rng = defaultRng): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return rng() * 100 < percent;
}

export function pick<T>(items: readonly T[], rng: Rng = defaultRng): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(rng() * items.length) % items.length];
}

export function todayStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// ------------------------------------------------------------
//  Comptes
// ------------------------------------------------------------

export function createAccount(userId: string, config: EconomyConfig, now: Date = new Date()): EconomyAccount {
  const iso = now.toISOString();
  return {
    userId,
    cash: Math.max(0, config.startBalance),
    bank: 0,
    createdAt: iso,
    updatedAt: iso,
    dayStamp: todayStamp(now),
    totalEarned: Math.max(0, config.startBalance),
    totalSpent: 0,
    totalWon: 0,
    totalLost: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    bestBlackjackWin: 0,
    dailyStreak: 0,
    workStreak: 0,
    winStreak: 0,
    lossStreak: 0,
    messageStreak: 0,
    invitesRewarded: 0,
    earnedFromMessagesToday: 0,
    earnedFromVoiceToday: 0,
    paidOutToday: 0,
    lostToday: 0,
    workToday: 0,
    robToday: 0,
    begToday: 0,
    cooldowns: {},
    items: [],
    history: [],
    xp: 0,
    level: 1,
    prestige: 0,
    incomeTotal: 0,
    questProgress: {},
    lotteryTickets: 0,
    jackpotWins: 0,
    stocks: {},
    marketProfit: 0,
    crates: 0,
    cratesOpened: 0,
    spinsCount: 0,
    achievements: [],
  };
}

/**
 * Complète un compte chargé depuis une version précédente du bot : les champs
 * ajoutés plus tard (XP, quêtes, bourse, succès…) reçoivent leur valeur par
 * défaut. Sans cela, un ancien compte ferait échouer les nouvelles commandes.
 */
export function hydrateAccount(account: EconomyAccount): EconomyAccount {
  const fresh = createAccount(account.userId, { startBalance: 0 } as EconomyConfig);
  const record = account as unknown as Record<string, unknown>;
  const defaults = fresh as unknown as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    if (record[key] === undefined || record[key] === null) record[key] = defaults[key];
  }
  if (!Array.isArray(account.achievements)) account.achievements = [];
  if (!Array.isArray(account.items)) account.items = [];
  if (!Array.isArray(account.history)) account.history = [];
  if (typeof account.cooldowns !== 'object' || account.cooldowns === null) account.cooldowns = {};
  if (typeof account.stocks !== 'object' || account.stocks === null) account.stocks = {};
  if (typeof account.questProgress !== 'object' || account.questProgress === null) account.questProgress = {};
  return account;
}

/** Renvoie le compte d'un membre, créé à la volée s'il n'existe pas. */
export function ensureAccount(state: StoreState, userId: string): EconomyAccount {
  const existing = state.accounts[userId];
  if (existing) return rollDay(existing, state.config.economy);
  const created = createAccount(userId, state.config.economy);
  if (state.config.economy.logTransactions) {
    pushTransaction(created, state.config.economy, {
      type: 'start',
      amount: created.cash,
      label: 'Solde de départ',
    });
  }
  state.accounts[userId] = created;
  return created;
}

/** Remet à zéro les compteurs quotidiens quand la date a changé. */
export function rollDay(account: EconomyAccount, config: EconomyConfig, now: Date = new Date()): EconomyAccount {
  const stamp = todayStamp(now);
  if (account.dayStamp === stamp) return account;
  account.dayStamp = stamp;
  account.earnedFromMessagesToday = 0;
  account.earnedFromVoiceToday = 0;
  account.paidOutToday = 0;
  account.lostToday = 0;
  account.workToday = 0;
  account.robToday = 0;
  account.begToday = 0;
  account.questProgress = {};
  void config;
  return account;
}

export function totalBalance(account: EconomyAccount): number {
  return account.cash + account.bank;
}

// ------------------------------------------------------------
//  Cooldowns
// ------------------------------------------------------------

export function cooldownRemaining(account: EconomyAccount, key: string, now: Date = new Date()): number {
  const until = account.cooldowns[key];
  if (!until) return 0;
  const diff = new Date(until).getTime() - now.getTime();
  if (Number.isNaN(diff)) return 0;
  return Math.max(0, diff);
}

export function setCooldown(account: EconomyAccount, key: string, seconds: number, now: Date = new Date()): void {
  if (seconds <= 0) {
    delete account.cooldowns[key];
    return;
  }
  account.cooldowns[key] = new Date(now.getTime() + seconds * 1000).toISOString();
}

export function isJailed(account: EconomyAccount, now: Date = new Date()): boolean {
  if (!account.jailUntil) return false;
  const until = new Date(account.jailUntil).getTime();
  if (Number.isNaN(until) || until <= now.getTime()) {
    delete account.jailUntil;
    return false;
  }
  return true;
}

export function hasShield(account: EconomyAccount, now: Date = new Date()): boolean {
  if (!account.shieldUntil) return false;
  const until = new Date(account.shieldUntil).getTime();
  if (Number.isNaN(until) || until <= now.getTime()) {
    delete account.shieldUntil;
    return false;
  }
  return true;
}

/** Formate une durée restante de façon lisible. */
export function humanDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

// ------------------------------------------------------------
//  Mouvements d'argent
// ------------------------------------------------------------

export interface MoneyResult {
  ok: boolean;
  amount: number;
  reason?: string;
}

export function pushTransaction(
  account: EconomyAccount,
  config: EconomyConfig,
  input: { type: TransactionType; amount: number; label?: string },
  now: Date = new Date(),
): Transaction | null {
  if (!config.logTransactions) return null;
  const transaction: Transaction = {
    id: randomUUID(),
    at: now.toISOString(),
    type: input.type,
    amount: Math.round(input.amount),
    balanceAfter: totalBalance(account),
    label: input.label,
  };
  account.history.unshift(transaction);
  const size = Math.max(0, Math.min(200, config.historySize));
  account.history = account.history.slice(0, size);
  return transaction;
}

/** Applique le bonus du rôle « boost ». */
export function applyBoost(config: EconomyConfig, roleIds: string[], amount: number): number {
  if (!config.boostRoleId || config.boostMultiplierPercent <= 0) return amount;
  if (!roleIds.includes(config.boostRoleId)) return amount;
  return amount * (1 + config.boostMultiplierPercent / 100);
}

/**
 * Crédite la poche d'un membre en respectant plafond de solde,
 * arrondi et journal. Renvoie le montant réellement crédité.
 */
export function credit(
  account: EconomyAccount,
  config: EconomyConfig,
  amount: number,
  type: TransactionType,
  label?: string,
  now: Date = new Date(),
): MoneyResult {
  let value = amount;
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, amount: 0, reason: 'Montant invalide.' };
  }
  if (config.roundAmounts) value = Math.round(value);

  if (config.maxBalance > 0 && account.cash + value > config.maxBalance) {
    value = Math.max(0, config.maxBalance - account.cash);
    if (value === 0) {
      return { ok: false, amount: 0, reason: 'Ta poche est pleine : dépose en banque avec `/bank depot`.' };
    }
  }

  account.cash += value;
  account.totalEarned += value;
  account.updatedAt = now.toISOString();
  pushTransaction(account, config, { type, amount: value, label }, now);
  return { ok: true, amount: value };
}

/**
 * Débite la poche d'un membre. Refuse si le solde est insuffisant
 * (sauf si les soldes négatifs sont autorisés).
 */
export function debit(
  account: EconomyAccount,
  config: EconomyConfig,
  amount: number,
  type: TransactionType,
  label?: string,
  now: Date = new Date(),
): MoneyResult {
  const value = config.roundAmounts ? Math.round(amount) : amount;
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, amount: 0, reason: 'Montant invalide.' };
  }
  const floor = config.allowNegative ? config.balanceFloor : Math.max(0, config.balanceFloor);
  if (account.cash - value < floor) {
    return {
      ok: false,
      amount: 0,
      reason: `Solde insuffisant : il te manque ${formatMoney(config, value - account.cash)}.`,
    };
  }
  account.cash -= value;
  account.totalSpent += value;
  account.updatedAt = now.toISOString();
  pushTransaction(account, config, { type, amount: -value, label }, now);
  return { ok: true, amount: value };
}

/** Transfère de la banque vers la poche (ou l'inverse). */
export function moveBetweenPockets(
  account: EconomyAccount,
  config: EconomyConfig,
  amount: number,
  direction: 'deposit' | 'withdraw',
  now: Date = new Date(),
): MoneyResult {
  const value = Math.round(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, amount: 0, reason: 'Montant invalide.' };

  if (direction === 'deposit') {
    if (value < config.bankDepositMin) {
      return { ok: false, amount: 0, reason: `Dépôt minimum : ${formatMoney(config, config.bankDepositMin)}.` };
    }
    if (account.cash < value) {
      return { ok: false, amount: 0, reason: `Tu n’as que ${formatMoney(config, account.cash)} en poche.` };
    }
    if (config.maxBank > 0 && account.bank + value > config.maxBank) {
      return { ok: false, amount: 0, reason: 'Ta banque est pleine.' };
    }
    account.cash -= value;
    account.bank += value;
  } else {
    if (value < config.bankWithdrawMin) {
      return { ok: false, amount: 0, reason: `Retrait minimum : ${formatMoney(config, config.bankWithdrawMin)}.` };
    }
    if (account.bank < value) {
      return { ok: false, amount: 0, reason: `Tu n’as que ${formatMoney(config, account.bank)} en banque.` };
    }
    account.bank -= value;
    account.cash += value;
  }

  account.updatedAt = now.toISOString();
  pushTransaction(
    account,
    config,
    {
      type: direction,
      amount: direction === 'deposit' ? -value : value,
      label: direction === 'deposit' ? 'Dépôt en banque' : 'Retrait bancaire',
    },
    now,
  );
  return { ok: true, amount: value };
}

// ------------------------------------------------------------
//  Formatage & classement
// ------------------------------------------------------------

export function formatMoney(config: EconomyConfig, amount: number): string {
  const value = Math.round(amount);
  const formatted = Math.abs(value).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
  const sign = value < 0 ? '-' : '';
  const name = Math.abs(value) > 1 ? config.currencyPlural : config.currencyName;
  return `${sign}${formatted} ${config.currencySymbol} ${name}`.replace(/\s+/g, ' ').trim();
}

export function shortMoney(config: EconomyConfig, amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} ${config.currencySymbol}`;
}

export interface LeaderboardEntry {
  userId: string;
  total: number;
  cash: number;
  bank: number;
  rank: number;
}

export function leaderboard(
  state: StoreState,
  config: EconomyConfig,
  options: { knownBotIds?: Set<string>; guildMemberIds?: Set<string> } = {},
): LeaderboardEntry[] {
  const ignored = new Set(config.leaderboardIgnoredIds);
  const entries = Object.values(state.accounts)
    .filter((account) => !ignored.has(account.userId))
    .filter((account) => (config.leaderboardHideBots ? !options.knownBotIds?.has(account.userId) : true))
    .filter((account) => (options.guildMemberIds ? options.guildMemberIds.has(account.userId) : true))
    .map((account) => ({
      userId: account.userId,
      total: totalBalance(account),
      cash: account.cash,
      bank: account.bank,
      rank: 0,
    }))
    .sort((a, b) => b.total - a.total || a.userId.localeCompare(b.userId));

  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return entries;
}

export function rankOf(entries: LeaderboardEntry[], userId: string): number {
  return entries.find((entry) => entry.userId === userId)?.rank ?? 0;
}

/** Masse monétaire totale (poche + banque) : indicateur d'inflation du panel. */
export function moneySupply(state: StoreState): { cash: number; bank: number; total: number; accounts: number } {
  let cash = 0;
  let bank = 0;
  for (const account of Object.values(state.accounts)) {
    cash += account.cash;
    bank += account.bank;
  }
  return { cash, bank, total: cash + bank, accounts: Object.keys(state.accounts).length };
}

// ------------------------------------------------------------
//  Progression : XP, niveaux, prestige
// ------------------------------------------------------------

/** XP nécessaire pour passer du niveau `level` au niveau suivant. */
export function xpToNext(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return Math.ceil(100 + safe * 75);
}

/** Niveau atteint avec `xp` points d’expérience (le niveau 1 démarre à 0 XP). */
export function levelFromXp(xp: number): { level: number; intoLevel: number; toNext: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  let guard = 0;
  while (remaining >= xpToNext(level) && guard < 10_000) {
    remaining -= xpToNext(level);
    level += 1;
    guard += 1;
  }
  return { level, intoLevel: remaining, toNext: xpToNext(level) };
}

/**
 * Multiplicateur de gains apporté par la progression : bonus de niveau
 * (déblocable) + bonus de prestige (permanent). Le bonus de rôle « boost »
 * est appliqué séparément par `applyBoost`.
 */
export function progressionMultiplier(config: EconomyConfig, account: EconomyAccount): number {
  if (!config.xpEnabled) return 1;
  const levelBonus = Math.min(
    config.levelBonusMaxPercent,
    Math.max(0, account.level - 1) * config.levelBonusPercent,
  );
  const prestigeBonus = config.prestigeEnabled ? account.prestige * config.prestigeBonusPercent : 0;
  return 1 + (levelBonus + prestigeBonus) / 100;
}

export interface XpGain {
  xp: number;
  level: number;
  leveledUp: boolean;
  levelsGained: number;
  rewardPaid: number;
}

/**
 * Attribue de l’XP à partir d’un montant gagné, applique les montées de
 * niveau et crédite la récompense de niveau. Retourne false si l’XP est
 * désactivée ou si le montant est nul.
 */
export function awardXp(
  account: EconomyAccount,
  config: EconomyConfig,
  earnedAmount: number,
  now: Date = new Date(),
): XpGain | null {
  if (!config.xpEnabled || earnedAmount <= 0) return null;
  const per = Math.max(1, config.xpPerAmount);
  const gained = Math.floor(earnedAmount / per);
  if (gained <= 0) return null;

  const before = account.level;
  account.xp += gained;
  const resolved = levelFromXp(account.xp);
  account.level = resolved.level;
  const levelsGained = Math.max(0, resolved.level - before);

  let rewardPaid = 0;
  if (levelsGained > 0 && config.levelReward > 0) {
    const reward = levelsGained * config.levelReward;
    const paid = credit(account, config, reward, 'levelup', `Montée au niveau ${account.level}`);
    if (paid.ok) rewardPaid = paid.amount;
  }
  account.updatedAt = now.toISOString();
  return {
    xp: gained,
    level: account.level,
    leveledUp: levelsGained > 0,
    levelsGained,
    rewardPaid,
  };
}
