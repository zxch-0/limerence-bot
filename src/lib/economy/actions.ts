import type { EconomyAccount, EconomyConfig, StoreState } from '../types';
import {
  applyBoost,
  chance,
  cooldownRemaining,
  credit,
  debit,
  ensureAccount,
  formatMoney,
  hasShield,
  humanDuration,
  isJailed,
  pick,
  pushTransaction,
  randomInt,
  setCooldown,
  totalBalance,
  type Rng,
} from './core';

// ============================================================
//  Actions économiques (daily, work, crime, rob, beg, search, pay…)
//
//  Logique pure : aucune dépendance à Discord. Chaque action vérifie
//  l'activation, les cooldowns, les plafonds quotidiens et l'anti-abus
//  avant de toucher au solde.
// ============================================================

const DISCORD_EPOCH = 1_420_070_400_000n;

/** Date de création d'un compte Discord déduite de son identifiant. */
export function snowflakeToDate(id: string): Date | null {
  const raw = BigInt(id.replace(/\D/g, '') || '0');
  if (raw <= 0n) return null;
  const ms = Number((raw >> 22n) + DISCORD_EPOCH);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms);
}

export function accountAgeDays(id: string, now: Date = new Date()): number {
  const created = snowflakeToDate(id);
  if (!created) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - created.getTime()) / 86_400_000);
}

export interface ActionContext {
  now?: Date;
  rng?: Rng;
  /** rôles Discord du membre (pour le bonus « boost ») */
  roleIds?: string[];
  /** affichage du membre (messages) */
  displayName?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  amount?: number;
}

function ctx(context: ActionContext): { now: Date; rng: Rng; roleIds: string[] } {
  return {
    now: context.now ?? new Date(),
    rng: context.rng ?? Math.random,
    roleIds: context.roleIds ?? [],
  };
}

function blockedMessage(): string {
  return 'L’économie est désactivée sur ce serveur.';
}

function guard(config: EconomyConfig, enabled: boolean, feature: string): ActionResult | null {
  if (!config.enabled) return { ok: false, message: blockedMessage() };
  if (!enabled) return { ok: false, message: `La commande \`${feature}\` est désactivée par l’administration.` };
  return null;
}

function tooRecent(config: EconomyConfig, userId: string, hours: number, now: Date): ActionResult | null {
  if (!config.antiAltEnabled && hours <= 0) return null;
  const requiredDays = config.antiAltEnabled ? config.antiAltAccountAgeDays : 0;
  const requiredHours = Math.max(hours, requiredDays * 24);
  if (requiredHours <= 0) return null;
  const age = accountAgeDays(userId, now) * 24;
  if (age < requiredHours) {
    return {
      ok: false,
      message: `Ton compte est trop récent pour utiliser cette commande (${Math.floor(age)} h sur ${requiredHours} h requises).`,
    };
  }
  return null;
}

function cooldownMessage(key: string, ms: number): ActionResult {
  return { ok: false, message: `⏳ Patience : prochaine ${key} dans **${humanDuration(ms)}**.` };
}

function checkCooldown(
  account: EconomyAccount,
  key: string,
  label: string,
  now: Date,
): ActionResult | null {
  const remaining = cooldownRemaining(account, key, now);
  return remaining > 0 ? cooldownMessage(label, remaining) : null;
}

// ------------------------------------------------------------
//  /daily
// ------------------------------------------------------------

export function runDaily(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  context: ActionContext = {},
): ActionResult {
  const { now, rng, roleIds } = ctx(context);
  const blocked = guard(config, config.dailyEnabled, '/daily') ?? tooRecent(config, account.userId, 0, now);
  if (blocked) return blocked;

  const waiting = checkCooldown(account, 'daily', 'récompense quotidienne', now);
  if (waiting) return waiting;

  const last = account.cooldowns.daily;
  const missed =
    config.dailyResetOnMiss && last
      ? now.getTime() - new Date(last).getTime() > config.dailyCooldownHours * 3_600_000 * 2
      : false;
  account.dailyStreak = missed ? 0 : account.dailyStreak + 1;

  const streakBonus = Math.min(
    config.dailyStreakMaxBonus,
    Math.max(0, account.dailyStreak - 1) * config.dailyStreakBonus,
  );
  const weekly = account.dailyStreak > 0 && account.dailyStreak % 7 === 0 ? config.dailyWeeklyBonus : 0;
  const base = applyBoost(config, roleIds, randomInt(config.dailyMin, config.dailyMax, rng));
  const total = Math.round(base + streakBonus + weekly);

  const paid = credit(account, config, total, 'daily', `Quotidien (série ${account.dailyStreak})`, now);
  if (!paid.ok) return { ok: false, message: paid.reason ?? 'Impossible de te payer.' };

  setCooldown(account, 'daily', config.dailyCooldownHours * 3600, now);
  account.updatedAt = now.toISOString();
  void state;

  const parts = [`📅 Récompense quotidienne : **${formatMoney(config, paid.amount)}**`];
  if (streakBonus > 0) parts.push(`🔥 Série de ${account.dailyStreak} jour(s) : +${formatMoney(config, streakBonus)}`);
  if (weekly > 0) parts.push(`🎉 Bonus du 7e jour : +${formatMoney(config, weekly)}`);
  parts.push(`Prochain /daily dans ${humanDuration(config.dailyCooldownHours * 3_600_000)}.`);
  return { ok: true, message: parts.join('\n'), amount: paid.amount };
}

// ------------------------------------------------------------
//  /work
// ------------------------------------------------------------

export function runWork(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  context: ActionContext = {},
): ActionResult {
  const { now, rng, roleIds } = ctx(context);
  const blocked = guard(config, config.workEnabled, '/work') ?? tooRecent(config, account.userId, 0, now);
  if (blocked) return blocked;
  if (isJailed(account, now)) {
    return { ok: false, message: `🚓 Tu es en prison jusqu’à <t:${Math.floor(new Date(account.jailUntil ?? now.toISOString()).getTime() / 1000)}:R>.` };
  }

  const waiting = checkCooldown(account, 'work', 'session de travail', now);
  if (waiting) return waiting;

  if (config.workDailyCap > 0 && account.workToday >= config.workDailyCap) {
    return { ok: false, message: `Tu as déjà travaillé ${account.workToday} fois aujourd’hui.` };
  }

  const job = pick(config.workJobs, rng) ?? 'petit boulot';
  const salary = applyBoost(config, roleIds, randomInt(config.workMin, config.workMax, rng));
  account.workToday += 1;
  setCooldown(account, 'work', config.workCooldownMinutes * 60, now);

  if (chance(config.workFailChancePercent, rng)) {
    const penalty = Math.round((salary * config.workFailPenaltyPercent) / 100);
    account.workStreak = 0;
    if (penalty > 0) debit(account, config, penalty, 'work', `Échec au travail (${job})`, now);
    account.updatedAt = now.toISOString();
    void state;
    return {
      ok: false,
      message: `🛠️ ${job} : ça ne s’est pas passé comme prévu…${penalty > 0 ? ` Tu perds ${formatMoney(config, penalty)}.` : ''}`,
      amount: -penalty,
    };
  }

  account.workStreak += 1;
  const paid = credit(account, config, salary, 'work', `Travail : ${job}`, now);
  if (!paid.ok) return { ok: false, message: paid.reason ?? 'Impossible de te payer.' };
  return {
    ok: true,
    message: `🛠️ Tu travailles comme **${job}** et gagnes **${formatMoney(config, paid.amount)}**.`,
    amount: paid.amount,
  };
}

// ------------------------------------------------------------
//  /crime
// ------------------------------------------------------------

export function runCrime(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  context: ActionContext = {},
): ActionResult {
  const { now, rng, roleIds } = ctx(context);
  const blocked = guard(config, config.crimeEnabled, '/crime') ?? tooRecent(config, account.userId, 0, now);
  if (blocked) return blocked;
  if (isJailed(account, now)) return { ok: false, message: '🚓 Tu es déjà en prison.' };
  if (totalBalance(account) < config.crimeMinBalance) {
    return { ok: false, message: `Il te faut au moins ${formatMoney(config, config.crimeMinBalance)} pour tenter un coup.` };
  }

  const waiting = checkCooldown(account, 'crime', 'nouveau coup', now);
  if (waiting) return waiting;

  const loot = applyBoost(config, roleIds, randomInt(config.crimeMin, config.crimeMax, rng));
  setCooldown(account, 'crime', config.crimeCooldownMinutes * 60, now);

  if (chance(config.crimeSuccessChancePercent, rng)) {
    const paid = credit(account, config, loot, 'crime', 'Butin', now);
    if (!paid.ok) return { ok: false, message: paid.reason ?? 'Impossible d’encaisser le butin.' };
    return { ok: true, message: `🕵️ Coup réussi ! Butin : **${formatMoney(config, paid.amount)}**.`, amount: paid.amount };
  }

  const fine = Math.round((account.cash * config.crimeFailPenaltyPercent) / 100);
  if (fine > 0) debit(account, config, fine, 'crime', 'Amende', now);
  if (config.crimeJailEnabled) {
    account.jailUntil = new Date(now.getTime() + config.crimeJailMinutes * 60_000).toISOString();
  }
  account.updatedAt = now.toISOString();
  void state;
  return {
    ok: false,
    message: `🚨 Raté ! Amende de **${formatMoney(config, fine)}**${config.crimeJailEnabled ? ` et ${config.crimeJailMinutes} minutes de prison.` : '.'}`,
    amount: -fine,
  };
}

// ------------------------------------------------------------
//  /rob
// ------------------------------------------------------------

export function runRob(
  state: StoreState,
  account: EconomyAccount,
  victimId: string,
  config: EconomyConfig,
  context: ActionContext = {},
): ActionResult {
  const { now, rng } = ctx(context);
  const blocked =
    guard(config, config.robEnabled, '/rob') ??
    tooRecent(config, account.userId, config.robBlockNewAccountHours, now);
  if (blocked) return blocked;
  if (isJailed(account, now)) return { ok: false, message: '🚓 Impossible de voler depuis ta cellule.' };
  if (victimId === account.userId) return { ok: false, message: 'Tu ne peux pas te voler toi-même.' };

  const waiting = checkCooldown(account, 'rob', 'nouveau vol', now);
  if (waiting) return waiting;
  if (config.robDailyCap > 0 && account.robToday >= config.robDailyCap) {
    return { ok: false, message: `Tu as déjà volé ${account.robToday} fois aujourd’hui.` };
  }

  const victim = state.accounts[victimId];
  if (!victim || victim.cash < config.robMinVictimBalance) {
    return {
      ok: false,
      message: `Cette personne n’a pas assez d’argent en poche (minimum ${formatMoney(config, config.robMinVictimBalance)}).`,
    };
  }
  if (config.robShieldEnabled && hasShield(victim, now)) {
    account.robToday += 1;
    setCooldown(account, 'rob', config.robCooldownMinutes * 60, now);
    return { ok: false, message: '🛡️ La victime était protégée par un bouclier anti-vol !' };
  }

  const percent = randomInt(config.robMinPercent, config.robMaxPercent, rng) / 100;
  const target = Math.max(1, Math.round(victim.cash * percent));
  account.robToday += 1;
  setCooldown(account, 'rob', config.robCooldownMinutes * 60, now);

  if (chance(config.robSuccessChancePercent, rng)) {
    const taken = debit(victim, config, target, 'rob', `Volé par ${account.userId}`, now);
    if (!taken.ok) return { ok: false, message: 'Le vol a échoué au dernier moment.' };
    const net = Math.round(taken.amount * (1 - config.robTaxPercent / 100));
    const paid = credit(account, config, net, 'rob', 'Vol réussi', now);
    if (!paid.ok) return { ok: false, message: paid.reason ?? 'Impossible d’encaisser.' };
    return {
      ok: true,
      message: `🥷 Vol réussi : **${formatMoney(config, paid.amount)}** (taxe ${config.robTaxPercent} %).`,
      amount: paid.amount,
    };
  }

  const fine = Math.round((target * config.robFailPenaltyPercent) / 100);
  if (fine > 0) debit(account, config, fine, 'rob', 'Vol raté : amende', now);
  account.updatedAt = now.toISOString();
  return {
    ok: false,
    message: `🚔 Vol raté ! Tu paies une amende de **${formatMoney(config, fine)}**.`,
    amount: -fine,
  };
}

// ------------------------------------------------------------
//  /beg
// ------------------------------------------------------------

export function runBeg(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  context: ActionContext = {},
): ActionResult {
  const { now, rng } = ctx(context);
  const blocked = guard(config, config.begEnabled, '/beg') ?? tooRecent(config, account.userId, 0, now);
  if (blocked) return blocked;

  const waiting = checkCooldown(account, 'beg', 'nouvelle manche', now);
  if (waiting) return waiting;
  if (config.begDailyCap > 0 && account.begToday >= config.begDailyCap) {
    return { ok: false, message: `Tu as déjà fait la manche ${account.begToday} fois aujourd’hui.` };
  }

  account.begToday += 1;
  setCooldown(account, 'beg', config.begCooldownMinutes * 60, now);

  if (chance(config.begRefuseChancePercent, rng)) {
    account.updatedAt = now.toISOString();
    void state;
    return { ok: false, message: '🙏 Personne n’a voulu te donner quoi que ce soit…' };
  }

  const amount = randomInt(config.begMin, config.begMax, rng);
  const paid = credit(account, config, amount, 'beg', 'Manche', now);
  if (!paid.ok) return { ok: false, message: paid.reason ?? 'Impossible d’encaisser.' };
  const line = pick(config.begLines, rng) ?? 'Quelqu’un te donne quelques pièces.';
  return { ok: true, message: `🙏 ${line} **${formatMoney(config, paid.amount)}**`, amount: paid.amount };
}

// ------------------------------------------------------------
//  /search
// ------------------------------------------------------------

export function runSearch(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  context: ActionContext = {},
): ActionResult {
  const { now, rng } = ctx(context);
  const blocked = guard(config, config.searchEnabled, '/search') ?? tooRecent(config, account.userId, 0, now);
  if (blocked) return blocked;

  const waiting = checkCooldown(account, 'search', 'nouvelle fouille', now);
  if (waiting) return waiting;

  setCooldown(account, 'search', config.searchCooldownSeconds, now);
  const place = pick(config.searchPlaces, rng) ?? 'les environs';

  if (chance(config.searchFailChancePercent, rng)) {
    account.updatedAt = now.toISOString();
    void state;
    return { ok: false, message: `🔎 Tu fouilles ${place}… rien du tout.` };
  }

  const amount = randomInt(config.searchMin, config.searchMax, rng);
  const paid = credit(account, config, amount, 'search', `Fouille : ${place}`, now);
  if (!paid.ok) return { ok: false, message: paid.reason ?? 'Impossible d’encaisser.' };
  return { ok: true, message: `🔎 Tu fouilles ${place} et trouves **${formatMoney(config, paid.amount)}**.`, amount: paid.amount };
}

// ------------------------------------------------------------
//  /pay
// ------------------------------------------------------------

export function runPay(
  state: StoreState,
  account: EconomyAccount,
  targetId: string,
  amount: number,
  config: EconomyConfig,
  context: ActionContext = {},
): ActionResult {
  const { now } = ctx(context);
  const blocked =
    guard(config, config.payEnabled, '/pay') ??
    tooRecent(config, account.userId, config.payBlockNewAccountHours, now);
  if (blocked) return blocked;
  if (targetId === account.userId) return { ok: false, message: 'Tu ne peux pas te payer toi-même.' };

  const value = Math.round(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, message: 'Montant invalide.' };
  if (value < config.payMinAmount) {
    return { ok: false, message: `Montant minimum : ${formatMoney(config, config.payMinAmount)}.` };
  }
  if (config.payMaxAmount > 0 && value > config.payMaxAmount) {
    return { ok: false, message: `Montant maximum : ${formatMoney(config, config.payMaxAmount)}.` };
  }

  const waiting = checkCooldown(account, 'pay', 'nouveau transfert', now);
  if (waiting) return waiting;
  if (config.payDailyCap > 0 && account.paidOutToday + value > config.payDailyCap) {
    return {
      ok: false,
      message: `Plafond de transfert quotidien atteint (${formatMoney(config, config.payDailyCap)}).`,
    };
  }

  const sent = debit(account, config, value, 'pay-out', `Transfert vers ${targetId}`, now);
  if (!sent.ok) return { ok: false, message: sent.reason ?? 'Transfert impossible.' };

  const target = ensureAccount(state, targetId);
  const received = Math.round(value * (1 - config.payTaxPercent / 100));
  credit(target, config, received, 'pay-in', `Transfert de ${account.userId}`, now);

  account.paidOutToday += value;
  setCooldown(account, 'pay', config.payCooldownSeconds, now);

  return {
    ok: true,
    message: `💸 Transfert effectué : **${formatMoney(config, received)}** reçus${config.payTaxPercent > 0 ? ` (taxe ${config.payTaxPercent} %)` : ''}.`,
    amount: received,
  };
}

// ------------------------------------------------------------
//  Récompenses passives (messages, vocal, réactions)
// ------------------------------------------------------------

/** Bonus temporaire (en %) apporté par les boosters achetés en boutique. */
export function boosterBonusPercent(account: EconomyAccount, now: Date = new Date()): number {
  let bonus = 0;
  for (const item of account.items) {
    if (item.effect !== 'booster') continue;
    if (!item.expiresAt || new Date(item.expiresAt).getTime() <= now.getTime()) continue;
    bonus += item.effectValue ?? 0;
  }
  return bonus;
}

/** Supprime les objets expirés d'un inventaire. */
export function pruneExpiredItems(account: EconomyAccount, now: Date = new Date()): number {
  const before = account.items.length;
  account.items = account.items.filter(
    (item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime(),
  );
  return before - account.items.length;
}

export interface PassiveReward {
  ok: boolean;
  amount: number;
  capped?: boolean;
}

export function runMessageReward(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  context: ActionContext = {},
): PassiveReward {
  const { now, rng, roleIds } = ctx(context);
  if (!config.enabled || !config.messageRewardEnabled) return { ok: false, amount: 0 };

  if (cooldownRemaining(account, 'message', now) > 0) return { ok: false, amount: 0 };

  const streakBonus = config.messageStreakEnabled
    ? Math.min(config.messageStreakMaxPercent, account.messageStreak * config.messageStreakPercent) / 100
    : 0;
  const shopBooster = boosterBonusPercent(account, now) / 100;
  const raw = applyBoost(
    config,
    roleIds,
    randomInt(config.messageMin, config.messageMax, rng) * (1 + streakBonus + shopBooster),
  );
  let amount = config.roundAmounts ? Math.round(raw) : raw;

  let capped = false;
  if (config.messageDailyCapEnabled && config.messageDailyCap > 0) {
    const room = config.messageDailyCap - account.earnedFromMessagesToday;
    if (room <= 0) return { ok: false, amount: 0, capped: true };
    if (amount > room) {
      amount = room;
      capped = true;
    }
  }
  if (amount <= 0) return { ok: false, amount: 0 };

  const paid = credit(account, config, amount, 'message', 'Message', now);
  if (!paid.ok) return { ok: false, amount: 0 };
  account.earnedFromMessagesToday += paid.amount;
  setCooldown(account, 'message', config.messageCooldownSeconds, now);
  void state;
  return { ok: true, amount: paid.amount, capped };
}

export function runVoiceReward(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  minutes: number,
  context: ActionContext = {},
): PassiveReward {
  const { now, rng, roleIds } = ctx(context);
  if (!config.enabled || !config.voiceRewardEnabled || minutes <= 0) return { ok: false, amount: 0 };

  const perMinute = randomInt(config.voiceMinPerHour, config.voiceMaxPerHour, rng) / 60;
  let amount = applyBoost(config, roleIds, perMinute * minutes);

  if (config.voiceDailyCapEnabled && config.voiceDailyCap > 0) {
    const room = config.voiceDailyCap - account.earnedFromVoiceToday;
    if (room <= 0) return { ok: false, amount: 0, capped: true };
    if (amount > room) amount = room;
  }
  amount = config.roundAmounts ? Math.round(amount) : amount;
  if (amount <= 0) return { ok: false, amount: 0 };

  const paid = credit(account, config, amount, 'voice', `Vocal (${Math.round(minutes)} min)`, now);
  if (!paid.ok) return { ok: false, amount: 0 };
  account.earnedFromVoiceToday += paid.amount;
  void state;
  return { ok: true, amount: paid.amount };
}

export function runReactionReward(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  context: ActionContext = {},
): PassiveReward {
  const { now, rng } = ctx(context);
  if (!config.enabled || !config.reactionRewardEnabled) return { ok: false, amount: 0 };
  if (cooldownRemaining(account, 'reaction', now) > 0) return { ok: false, amount: 0 };
  const amount = randomInt(config.reactionMin, config.reactionMax, rng);
  const paid = credit(account, config, amount, 'reaction', 'Réaction', now);
  if (!paid.ok) return { ok: false, amount: 0 };
  setCooldown(account, 'reaction', config.reactionCooldownSeconds, now);
  void state;
  return { ok: true, amount: paid.amount };
}

// ------------------------------------------------------------
//  Intérêts bancaires
// ------------------------------------------------------------

export interface InterestReport {
  members: number;
  total: number;
}

/** Verse les intérêts bancaires (appelé par le planificateur). */
export function applyBankInterest(
  state: StoreState,
  config: EconomyConfig,
  now: Date = new Date(),
): InterestReport {
  if (!config.enabled || !config.bankEnabled || !config.interestEnabled) {
    return { members: 0, total: 0 };
  }
  let members = 0;
  let total = 0;
  for (const account of Object.values(state.accounts)) {
    if (account.bank < config.interestMinBank) continue;
    const gross = (account.bank * config.interestRatePercent) / 100;
    const amount = Math.min(config.interestMax, Math.round(gross));
    if (amount <= 0) continue;
    const room = config.maxBank > 0 ? Math.max(0, config.maxBank - account.bank) : amount;
    const credited = Math.min(amount, room);
    if (credited <= 0) continue;
    account.bank += credited;
    account.totalEarned += credited;
    account.updatedAt = now.toISOString();
    pushTransaction(account, config, { type: 'interest', amount: credited, label: 'Intérêts bancaires' }, now);
    members += 1;
    total += credited;
  }
  return { members, total };
}
