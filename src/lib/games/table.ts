import type { GamesConfig } from './config';
import type {
  EconomyAccount,
  EconomyConfig,
  GameSession,
  MinesSession,
  CrashSession,
  QuestDef,
  StoreState,
} from '../types';
import {
  awardXp,
  cooldownRemaining,
  credit,
  debit,
  formatMoney,
  humanDuration,
  randomInt,
  setCooldown,
  type Rng,
} from '../economy/core';
import { trackQuest } from '../economy/quests';
import { checkAchievements } from '../economy/extras';
import { crashPoint, createMines, minesMultiplier, revealMinesTile, MINES_GRID_SIZE, PLINKO_TABLES } from './engine';

// ============================================================
//  Casino — couche commune : mises, règlement, statistiques,
//  sessions interactives (mines, crash).
//
//  L’argent est débité à la mise puis recrédité au règlement :
//  aucune partie ne peut faire disparaître de l’argent.
// ============================================================

export interface GameContext {
  now?: Date;
  rng?: Rng;
}

// ------------------------------------------------------------
//  Mises communes
// ------------------------------------------------------------

/** Mise maximale autorisée (casino + économie). */
export function maxAllowedCasinoBet(economy: EconomyConfig, balance: number): number {
  const limits: number[] = [];
  if (economy.betMax > 0) limits.push(economy.betMax);
  if (economy.betMaxPercentOfBalance > 0) limits.push(Math.floor((balance * economy.betMaxPercentOfBalance) / 100));
  if (!limits.length) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(...limits));
}

export interface BetCheck {
  ok: boolean;
  error?: string;
  waitMs?: number;
}

/** Garde-fous communs : activation, cooldown, plafond de perte quotidienne. */
export function checkBet(
  state: StoreState,
  account: EconomyAccount,
  games: GamesConfig,
  economy: EconomyConfig,
  bet: number,
  ctx: GameContext = {},
): BetCheck {
  void state;
  const now = ctx.now ?? new Date();
  if (!economy.enabled) return { ok: false, error: 'L’économie est désactivée sur ce serveur.' };
  if (!games.enabled) return { ok: false, error: 'Le casino est désactivé sur ce serveur.' };
  if (!economy.gamblingEnabled) return { ok: false, error: 'Les jeux d’argent sont désactivés.' };

  const value = Math.round(bet);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Mise invalide.' };
  const minBet = Math.max(1, economy.betMin);
  if (value < minBet) return { ok: false, error: `Mise minimum : ${formatMoney(economy, minBet)}.` };
  const cap = maxAllowedCasinoBet(economy, account.cash);
  if (Number.isFinite(cap) && value > cap) {
    return { ok: false, error: `Mise maximum autorisée : ${formatMoney(economy, cap)}.` };
  }

  const remaining = cooldownRemaining(account, 'game', now);
  if (remaining > 0) {
    return { ok: false, error: `Patience : prochain jeu dans ${humanDuration(remaining)}.`, waitMs: remaining };
  }
  if (economy.dailyLossLimitEnabled && economy.dailyLossLimit > 0 && account.lostToday >= economy.dailyLossLimit) {
    return { ok: false, error: `Plafond de perte quotidienne atteint (${formatMoney(economy, economy.dailyLossLimit)}).` };
  }
  return { ok: true };
}

export interface OutcomeInfo {
  levelUp?: { from: number; to: number };
  achievements: string[];
  questsCompleted: QuestDef[];
}

/**
 * Applique le résultat d’une partie terminée : crédits (mise × multiplicateur
 * moins taxe), statistiques, quêtes, XP et succès. Renvoie le net (positif
 * = gain, négatif = perte) et les événements de progression.
 */
export function applyGameOutcome(
  state: StoreState,
  account: EconomyAccount,
  economy: EconomyConfig,
  input: { bet: number; multiplier: number; gameLabel: string },
  ctx: GameContext = {},
): { net: number; payout: number; tax: number; credited: number; info: OutcomeInfo } {
  const now = ctx.now ?? new Date();
  const bet = Math.round(input.bet);
  const gross = Math.round(bet * input.multiplier);
  const tax = gross > 0 ? Math.round((gross * Math.min(50, Math.max(0, economy.gamblingTaxPercent))) / 100) : 0;
  const payout = Math.max(0, gross - tax);
  let credited = 0;
  if (payout > 0) {
    const paid = credit(account, economy, payout, 'bet-win', `${input.gameLabel}`, now);
    if (paid.ok) credited = paid.amount;
  }
  const net = credited - bet;

  // statistiques
  account.gamesPlayed += 1;
  if (net > 0) {
    account.gamesWon += 1;
    account.winStreak += 1;
    account.lossStreak = 0;
    account.totalWon += net;
  } else if (net < 0) {
    account.winStreak = 0;
    account.lossStreak += 1;
    account.totalLost += -net;
    account.lostToday += -net;
  } else {
    account.winStreak = 0;
  }

  // quêtes
  const quests = trackQuest(state, account, economy, 'play_games', 1, now);
  if (net > 0) {
    quests.completed.push(...trackQuest(state, account, economy, 'win_games', 1, now).completed);
    quests.completed.push(...trackQuest(state, account, economy, 'gain_money', net, now).completed);
  } else if (net < 0) {
    quests.completed.push(...trackQuest(state, account, economy, 'spend_money', -net, now).completed);
  }

  // XP + succès
  const info: OutcomeInfo = { achievements: [], questsCompleted: quests.completed };
  if (net > 0) {
    const xp = awardXp(account, economy, net, now);
    if (xp?.leveledUp) info.levelUp = { from: xp.level - xp.levelsGained, to: xp.level };
  }
  for (const unlock of checkAchievements(state, account, economy, now)) {
    info.achievements.push(unlock.def.id);
  }
  account.updatedAt = now.toISOString();
  return { net, payout, tax, credited, info };
}

// ------------------------------------------------------------
//  Jeux instantanés (roulette, coinflip, dés, slots, plinko)
// ------------------------------------------------------------

export interface InstantGameResult {
  ok: boolean;
  error?: string;
  waitMs?: number;
  net: number;
  payout: number;
  multiplier: number;
  tax: number;
  resultLabel: string;
  balanceAfter: number;
  info: OutcomeInfo;
}

export interface InstantGameInput {
  userId: string;
  bet: number;
  games: GamesConfig;
  economy: EconomyConfig;
  gameLabel: string;
}

/**
 * Joue un jeu instantané : vérifie la mise, la débite, résout le résultat
 * via `resolve` puis crédite les gains (taxe comprise).
 */
export function playInstantGame(
  state: StoreState,
  account: EconomyAccount,
  input: InstantGameInput,
  resolve: (rng: Rng) => { multiplier: number; label: string },
  ctx: GameContext = {},
): InstantGameResult {
  const now = ctx.now ?? new Date();
  const rng = ctx.rng ?? Math.random;
  const check = checkBet(state, account, input.games, input.economy, input.bet, ctx);
  if (!check.ok) {
    return {
      ok: false,
      error: check.error,
      waitMs: check.waitMs,
      net: 0,
      payout: 0,
      multiplier: 0,
      tax: 0,
      resultLabel: '',
      balanceAfter: account.cash,
      info: { achievements: [], questsCompleted: [] },
    };
  }

  const bet = Math.round(input.bet);
  const paid = debit(account, input.economy, bet, 'bet-loss', `Mise — ${input.gameLabel}`, now);
  if (!paid.ok) {
    return {
      ok: false,
      error: paid.reason ?? 'Solde insuffisant.',
      net: 0,
      payout: 0,
      multiplier: 0,
      tax: 0,
      resultLabel: '',
      balanceAfter: account.cash,
      info: { achievements: [], questsCompleted: [] },
    };
  }
  setCooldown(account, 'game', Math.max(input.economy.betCooldownSeconds, input.games.cooldownSeconds), now);

  const outcome = resolve(rng);
  const settled = applyGameOutcome(state, account, input.economy, {
    bet,
    multiplier: outcome.multiplier,
    gameLabel: input.gameLabel,
  }, ctx);

  return {
    ok: true,
    net: settled.net,
    payout: settled.payout,
    multiplier: outcome.multiplier,
    tax: settled.tax,
    resultLabel: outcome.label,
    balanceAfter: account.cash,
    info: settled.info,
  };
}

// ------------------------------------------------------------
//  Sessions interactives (mines, crash)
// ------------------------------------------------------------

export function getSession(state: StoreState, userId: string): GameSession | null {
  return state.meta.gameSessions?.[userId] ?? null;
}

export function dropSession(state: StoreState, userId: string): void {
  if (state.meta.gameSessions) delete state.meta.gameSessions[userId];
}

// ---------- Mines ----------

export interface MinesStart {
  ok: boolean;
  error?: string;
  session?: MinesSession;
}

export function startMines(
  state: StoreState,
  account: EconomyAccount,
  input: { userId: string; guildId: string; channelId: string; bet: number; mines: number; games: GamesConfig; economy: EconomyConfig },
  ctx: GameContext = {},
): MinesStart {
  const now = ctx.now ?? new Date();
  const rng = ctx.rng ?? Math.random;
  if (!input.games.minesEnabled) return { ok: false, error: 'Le démineur est désactivé.' };
  if (getSession(state, input.userId)) return { ok: false, error: 'Tu as déjà une partie en cours.' };

  const check = checkBet(state, account, input.games, input.economy, input.bet, ctx);
  if (!check.ok) return { ok: false, error: check.error };

  const mines = Math.max(1, Math.min(input.games.minesMaxMines, Math.floor(input.mines)));
  const paid = debit(account, input.economy, Math.round(input.bet), 'bet-loss', 'Mise — Mines', now);
  if (!paid.ok) return { ok: false, error: paid.reason ?? 'Solde insuffisant.' };
  setCooldown(account, 'game', Math.max(input.economy.betCooldownSeconds, input.games.cooldownSeconds), now);

  const game = createMines(mines, rng);
  const session: MinesSession = {
    kind: 'mines',
    userId: input.userId,
    guildId: input.guildId,
    channelId: input.channelId,
    bet: Math.round(input.bet),
    mines: game.mines,
    grid: game.grid,
    revealed: [],
    cashedOut: false,
    finished: false,
    createdAt: now.getTime(),
    timeoutAt: now.getTime() + input.games.minesTimeoutSeconds * 1000,
  };
  state.meta.gameSessions = state.meta.gameSessions ?? {};
  state.meta.gameSessions[input.userId] = session;
  return { ok: true, session };
}

export interface MinesPlay {
  ok: boolean;
  error?: string;
  safe?: boolean;
  busted?: boolean;
  won?: boolean;
  multiplier: number;
  payout: number;
  net: number;
  revealed: number;
  info: OutcomeInfo;
}

/** Révèle une tuile de la partie de mines du membre. */
export function playMinesTile(
  state: StoreState,
  account: EconomyAccount,
  userId: string,
  index: number,
  games: GamesConfig,
  economy: EconomyConfig,
  ctx: GameContext = {},
): MinesPlay {
  const session = getSession(state, userId);
  if (!session || session.kind !== 'mines') {
    return { ok: false, error: 'Aucune partie de mines en cours.', multiplier: 0, payout: 0, net: 0, revealed: 0, info: { achievements: [], questsCompleted: [] } };
  }
  const now = ctx.now ?? new Date();
  session.timeoutAt = now.getTime() + games.minesTimeoutSeconds * 1000;

  const game = { grid: session.grid, mines: session.mines, size: MINES_GRID_SIZE, revealed: [...session.revealed] };
  const reveal = revealMinesTile(game, index, games);
  session.revealed = game.revealed;

  if (reveal.mine) {
    session.finished = true;
    const settled = applyGameOutcome(state, account, economy, { bet: session.bet, multiplier: 0, gameLabel: 'Mines' }, ctx);
    dropSession(state, userId);
    return {
      ok: true,
      safe: false,
      busted: true,
      multiplier: 0,
      payout: 0,
      net: settled.net,
      revealed: session.revealed.length,
      info: settled.info,
    };
  }

  if (reveal.won) {
    const multiplier = reveal.multiplier;
    session.finished = true;
    session.cashedOut = true;
    const settled = applyGameOutcome(state, account, economy, { bet: session.bet, multiplier, gameLabel: 'Mines' }, ctx);
    dropSession(state, userId);
    return {
      ok: true,
      safe: true,
      won: true,
      multiplier,
      payout: settled.payout,
      net: settled.net,
      revealed: session.revealed.length,
      info: settled.info,
    };
  }

  return {
    ok: true,
    safe: true,
    multiplier: reveal.multiplier,
    payout: Math.round(session.bet * reveal.multiplier),
    net: 0,
    revealed: session.revealed.length,
    info: { achievements: [], questsCompleted: [] },
  };
}

/** Encaisse la partie de mines en cours au multiplicateur actuel. */
export function cashoutMines(
  state: StoreState,
  account: EconomyAccount,
  userId: string,
  games: GamesConfig,
  economy: EconomyConfig,
  ctx: GameContext = {},
): MinesPlay {
  const session = getSession(state, userId);
  if (!session || session.kind !== 'mines') {
    return { ok: false, error: 'Aucune partie de mines en cours.', multiplier: 0, payout: 0, net: 0, revealed: 0, info: { achievements: [], questsCompleted: [] } };
  }
  if (session.revealed.length === 0) {
    return { ok: false, error: 'Révèle au moins une tuile avant d’encaisser.', multiplier: 0, payout: 0, net: 0, revealed: 0, info: { achievements: [], questsCompleted: [] } };
  }
  session.cashedOut = true;
  session.finished = true;
  const multiplier = minesMultiplier({ grid: session.grid, mines: session.mines, size: MINES_GRID_SIZE, revealed: session.revealed }, session.revealed.length, games);
  const settled = applyGameOutcome(state, account, economy, { bet: session.bet, multiplier, gameLabel: 'Mines' }, ctx);
  dropSession(state, userId);
  return {
    ok: true,
    safe: true,
    won: true,
    multiplier,
    payout: settled.payout,
    net: settled.net,
    revealed: session.revealed.length,
    info: settled.info,
  };
}

// ---------- Crash ----------

export interface CrashStart {
  ok: boolean;
  error?: string;
  session?: CrashSession;
}

export function startCrash(
  state: StoreState,
  account: EconomyAccount,
  input: { userId: string; guildId: string; channelId: string; bet: number; games: GamesConfig; economy: EconomyConfig },
  ctx: GameContext = {},
): CrashStart {
  const now = ctx.now ?? new Date();
  const rng = ctx.rng ?? Math.random;
  if (!input.games.crashEnabled) return { ok: false, error: 'Le crash est désactivé.' };
  if (getSession(state, input.userId)) return { ok: false, error: 'Tu as déjà une partie en cours.' };

  const check = checkBet(state, account, input.games, input.economy, input.bet, ctx);
  if (!check.ok) return { ok: false, error: check.error };

  const paid = debit(account, input.economy, Math.round(input.bet), 'bet-loss', 'Mise — Crash', now);
  if (!paid.ok) return { ok: false, error: paid.reason ?? 'Solde insuffisant.' };
  setCooldown(account, 'game', Math.max(input.economy.betCooldownSeconds, input.games.cooldownSeconds), now);

  const session: CrashSession = {
    kind: 'crash',
    userId: input.userId,
    guildId: input.guildId,
    channelId: input.channelId,
    bet: Math.round(input.bet),
    crashAt: crashPoint(input.games, rng),
    startedAt: now.getTime(),
    cashedOut: false,
    finished: false,
    // assez de temps pour atteindre le plafond de la fusée, même avec une croissance lente
    timeoutAt: now.getTime() + crashWindowMs(input.games),
  };
  state.meta.gameSessions = state.meta.gameSessions ?? {};
  state.meta.gameSessions[input.userId] = session;
  return { ok: true, session };
}

/** Durée maximale d’une partie de crash : temps pour atteindre le plafond + marge. */
export function crashWindowMs(games: GamesConfig): number {
  const growth = Math.max(0.01, games.crashGrowthPercent / 100);
  const ticks = Math.log(Math.max(2, games.crashMaxMultiplier)) / Math.log(1 + growth);
  return Math.max(120_000, Math.ceil(ticks) * Math.max(300, games.crashTickMs) + 30_000);
}

/** Multiplicateur actuel d’une partie de crash (jamais au-dessus du crash). */
export function crashMultiplierNow(session: CrashSession, games: GamesConfig, now: Date = new Date()): number {
  const elapsed = now.getTime() - session.startedAt;
  const ticks = Math.max(0, elapsed / Math.max(1, games.crashTickMs));
  const growth = Math.max(0, games.crashGrowthPercent) / 100;
  const raw = Math.pow(1 + growth, ticks);
  const capped = Math.min(raw, games.crashMaxMultiplier, session.crashAt);
  return Math.round(capped * 100) / 100;
}

/** La partie de crash a-t-elle explosé ? */
export function crashCrashed(session: CrashSession, games: GamesConfig, now: Date = new Date()): boolean {
  return crashMultiplierNow(session, games, now) >= session.crashAt;
}

export interface CrashPlay {
  ok: boolean;
  error?: string;
  cashedOut?: boolean;
  crashed?: boolean;
  multiplier: number;
  payout: number;
  net: number;
  info: OutcomeInfo;
}

/** Encaisse la partie de crash au multiplicateur actuel. */
export function cashoutCrash(
  state: StoreState,
  account: EconomyAccount,
  userId: string,
  games: GamesConfig,
  economy: EconomyConfig,
  ctx: GameContext = {},
): CrashPlay {
  const session = getSession(state, userId);
  if (!session || session.kind !== 'crash') {
    return { ok: false, error: 'Aucune partie de crash en cours.', multiplier: 0, payout: 0, net: 0, info: { achievements: [], questsCompleted: [] } };
  }
  const now = ctx.now ?? new Date();
  if (crashCrashed(session, games, now)) {
    session.finished = true;
    const settled = applyGameOutcome(state, account, economy, { bet: session.bet, multiplier: 0, gameLabel: 'Crash' }, ctx);
    dropSession(state, userId);
    return { ok: true, crashed: true, multiplier: session.crashAt, payout: 0, net: settled.net, info: settled.info };
  }
  const multiplier = crashMultiplierNow(session, games, now);
  session.cashedOut = true;
  session.finished = true;
  const settled = applyGameOutcome(state, account, economy, { bet: session.bet, multiplier, gameLabel: 'Crash' }, ctx);
  dropSession(state, userId);
  return { ok: true, cashedOut: true, multiplier, payout: settled.payout, net: settled.net, info: settled.info };
}

/** La fusée explose sans encaissement : la mise est perdue. */
export function crashExplode(
  state: StoreState,
  account: EconomyAccount,
  userId: string,
  games: GamesConfig,
  economy: EconomyConfig,
  ctx: GameContext = {},
): CrashPlay {
  const session = getSession(state, userId);
  if (!session || session.kind !== 'crash') {
    return { ok: false, error: 'Aucune partie de crash en cours.', multiplier: 0, payout: 0, net: 0, info: { achievements: [], questsCompleted: [] } };
  }
  const now = ctx.now ?? new Date();
  if (!crashCrashed(session, games, now)) {
    return { ok: false, error: 'La fusée n’a pas encore explosé.', multiplier: crashMultiplierNow(session, games, now), payout: 0, net: 0, info: { achievements: [], questsCompleted: [] } };
  }
  session.finished = true;
  const settled = applyGameOutcome(state, account, economy, { bet: session.bet, multiplier: 0, gameLabel: 'Crash' }, ctx);
  dropSession(state, userId);
  return { ok: true, crashed: true, multiplier: session.crashAt, payout: 0, net: settled.net, info: settled.info };
}

// ------------------------------------------------------------
//  Expiration des sessions (filet de sécurité du planificateur)
// ------------------------------------------------------------

/** Termine les sessions expirées (perdues si pas encaissées). Renvoie les sessions concernées. */
export function expireSessions(
  state: StoreState,
  economy: EconomyConfig,
  now: Date = new Date(),
): GameSession[] {
  const sessions = state.meta.gameSessions ?? {};
  const expired: GameSession[] = [];
  for (const [userId, session] of Object.entries(sessions)) {
    if (session.timeoutAt > now.getTime()) continue;
    if (session.kind === 'crash' && !session.cashedOut && !session.finished) {
      // crash non encaissé à temps : la fusée explose
      const account = state.accounts[userId];
      if (account) {
        applyGameOutcome(state, account, economy, { bet: session.bet, multiplier: 0, gameLabel: 'Crash (expiré)' }, { now });
      }
    }
    if (session.kind === 'mines' && !session.cashedOut && !session.finished) {
      const account = state.accounts[userId];
      if (account) {
        applyGameOutcome(state, account, economy, { bet: session.bet, multiplier: 0, gameLabel: 'Mines (expiré)' }, { now });
      }
    }
    session.finished = true;
    expired.push(session);
    delete sessions[userId];
  }
  if (expired.length) state.meta.gameSessions = sessions;
  return expired;
}

/** Chance de gagner rapidement (indicateur d’équilibre, utilisé par le panel). */
export function crashSurvivalChance(multiplier: number): number {
  if (multiplier <= 1) return 100;
  return Math.max(0, Math.min(100, Math.round((1 / multiplier) * 99 * 100) / 100));
}

/** Récapitule les jeux activés (pour le menu /casino). */
export function enabledGames(games: GamesConfig): Array<{ id: string; label: string; emoji: string; minPayout: string }> {
  const list: Array<{ id: string; label: string; emoji: string; minPayout: string }> = [];
  if (games.rouletteEnabled) list.push({ id: 'roulette', label: 'Roulette', emoji: '🎡', minPayout: `×${games.rouletteColorPayout} → ×${games.rouletteStraightPayout}` });
  if (games.coinflipEnabled) list.push({ id: 'coinflip', label: 'Pile ou face', emoji: '🪙', minPayout: `×${games.coinflipPayout}` });
  if (games.diceEnabled) list.push({ id: 'dice', label: 'Dés', emoji: '🎲', minPayout: `×${games.diceRangePayout} → ×${games.diceExactPayout}` });
  if (games.slotsEnabled) list.push({ id: 'slots', label: 'Machine à sous', emoji: '🎰', minPayout: `×${games.slotsTwoMultiplier} → ×${games.slotsJackpotMultiplier}` });
  if (games.minesEnabled) list.push({ id: 'mines', label: 'Mines', emoji: '💣', minPayout: '×1 → ×24' });
  if (games.crashEnabled) list.push({ id: 'crash', label: 'Crash', emoji: '🚀', minPayout: `×1 → ×${games.crashMaxMultiplier}` });
  if (games.plinkoEnabled) {
    const all = Object.values(PLINKO_TABLES).flat();
    list.push({ id: 'plinko', label: 'Plinko', emoji: '🪂', minPayout: `×${Math.min(...all)} → ×${Math.max(...all)}` });
  }
  return list;
}

/** Tirage aléatoire simple pour les animations (utilisé par la couche bot). */
export function randomBetween(min: number, max: number, rng: Rng = Math.random): number {
  return randomInt(min, max, rng);
}

