import { randomUUID } from 'node:crypto';
import type {
  BlackjackConfig,
  BlackjackGame,
  BlackjackHand,
  BlackjackStats,
  EconomyConfig,
  StoreState,
} from '../types';
import { credit, debit, ensureAccount, formatMoney } from '../economy/core';
import {
  blackjackRatio,
  canDouble,
  canSplit,
  canSurrender,
  canTakeInsurance,
  createShoe,
  drawCard,
  handValue,
  isBlackjack,
  maxInsurance,
  needsReshuffle,
  perfectPairMultiplier,
  settleGame,
  sideBet21Plus3Multiplier,
  type Settlement,
  type Rng,
} from './engine';

// ============================================================
//  Table de blackjack — création des parties, actions, règlement
//  L'argent est débité à la mise puis recrédité au règlement :
//  aucune partie ne peut faire disparaître de l'argent.
// ============================================================

export type BlackjackAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'insurance';

export interface TableOptions {
  rng?: Rng;
  now?: Date;
}

export interface TableResult {
  ok: boolean;
  error?: string;
  game?: BlackjackGame;
  settlement?: Settlement;
  /** montant net crédité (positif) ou débité (négatif) par l'action */
  net?: number;
  /** mise réellement engagée à l'instant T */
  wagered?: number;
  /** texte explicatif pour le joueur */
  note?: string;
}

function emptyStats(): BlackjackStats {
  return {
    hands: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    wagered: 0,
    returned: 0,
    biggestWin: 0,
    bestStreak: 0,
  };
}

export function getStats(state: StoreState, userId: string): BlackjackStats {
  return state.blackjackStats[userId] ?? emptyStats();
}

export function ensureStats(state: StoreState, userId: string): BlackjackStats {
  const existing = state.blackjackStats[userId];
  if (existing) return existing;
  const created = emptyStats();
  state.blackjackStats[userId] = created;
  return created;
}

function newHand(bet: number, sideBet = 0): BlackjackHand {
  return {
    cards: [],
    bet,
    sideBet,
    stood: false,
    doubled: false,
    busted: false,
    blackjack: false,
    surrendered: false,
  };
}

export function totalWagered(game: BlackjackGame): number {
  return (
    game.hands.reduce((sum, hand) => sum + hand.bet, 0) + game.insuranceBet + game.sideBet
  );
}

/** Mise maximale autorisée par la configuration. */
export function maxAllowedBet(config: BlackjackConfig, economy: EconomyConfig, balance: number): number {
  const limits: number[] = [];
  if (config.maxBet > 0) limits.push(config.maxBet);
  if (config.maxBetPercentOfBalance > 0) limits.push(Math.floor((balance * config.maxBetPercentOfBalance) / 100));
  if (economy.betMax > 0) limits.push(economy.betMax);
  if (economy.betMaxPercentOfBalance > 0) {
    limits.push(Math.floor((balance * economy.betMaxPercentOfBalance) / 100));
  }
  if (!limits.length) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(...limits));
}

export interface NewGameInput {
  guildId: string;
  userId: string;
  channelId: string;
  bet: number;
  sideBet?: number;
  config: BlackjackConfig;
  economy: EconomyConfig;
}

/** Ouvre une partie : vérifie les règles, débite la mise, distribue les cartes. */
export function newGame(state: StoreState, input: NewGameInput, options: TableOptions = {}): TableResult {
  const { config, economy } = input;
  const now = options.now ?? new Date();
  const rng = options.rng ?? Math.random;

  if (!config.enabled) return { ok: false, error: 'Le blackjack est désactivé sur ce serveur.' };
  if (!economy.enabled) return { ok: false, error: 'L’économie est désactivée sur ce serveur.' };
  if (!economy.gamblingEnabled) return { ok: false, error: 'Les jeux d’argent sont désactivés.' };

  const existing = state.blackjack[input.userId];
  if (existing && config.oneGamePerUser && existing.status !== 'finished' && existing.status !== 'abandoned') {
    return { ok: false, error: 'Tu as déjà une partie en cours : joue-la avant d’en ouvrir une autre.' };
  }

  const account = ensureAccount(state, input.userId);
  const bet = Math.round(input.bet);
  if (!Number.isFinite(bet) || bet <= 0) return { ok: false, error: 'Mise invalide.' };
  const minBet = Math.max(config.minBet, economy.betMin);
  if (bet < minBet) return { ok: false, error: `Mise minimum : ${formatMoney(economy, minBet)}.` };

  const cap = maxAllowedBet(config, economy, account.cash);
  if (Number.isFinite(cap) && bet > cap) {
    return { ok: false, error: `Mise maximum autorisée : ${formatMoney(economy, cap)}.` };
  }

  const sideBetCap = Math.floor((bet * Math.max(0, Math.min(100, config.sideBetMaxPercent))) / 100);
  const sideBet = Math.min(Math.max(0, Math.round(input.sideBet ?? 0)), sideBetCap);

  if (economy.dailyLossLimitEnabled && economy.dailyLossLimit > 0 && account.lostToday >= economy.dailyLossLimit) {
    return { ok: false, error: `Plafond de perte quotidienne atteint (${formatMoney(economy, economy.dailyLossLimit)}).` };
  }

  const totalStake = bet + sideBet;
  const paid = debit(account, economy, totalStake, 'bet-loss', 'Mise blackjack', now);
  if (!paid.ok) return { ok: false, error: paid.reason ?? 'Solde insuffisant.' };

  const game: BlackjackGame = {
    id: randomUUID(),
    guildId: input.guildId,
    userId: input.userId,
    channelId: input.channelId,
    shoe: [],
    drawIndex: 0,
    hands: [newHand(bet, sideBet)],
    activeHand: 0,
    splitsUsed: 0,
    dealer: [],
    holeRevealed: false,
    insuranceBet: 0,
    insuranceResolved: false,
    baseBet: bet,
    sideBet,
    status: 'playing',
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    timeoutAt: now.getTime() + config.turnTimeoutSeconds * 1000,
    firstAction: true,
  };

  // sabot partagé par serveur : on ne remélange que lorsque la
  // pénétration configurée est dépassée (comme dans un vrai casino)
  const shoes = state.meta.shoes ?? {};
  const saved = shoes[input.guildId];
  const reusable: BlackjackGame | null = saved
    ? ({ shoe: saved.cards, drawIndex: saved.index } as BlackjackGame)
    : null;
  if (reusable && reusable.shoe.length && !needsReshuffle(reusable, config)) {
    game.shoe = [...reusable.shoe];
    game.drawIndex = reusable.drawIndex;
  } else {
    game.shoe = createShoe(config.decks, rng);
    game.drawIndex = 0;
  }

  const first = drawCard(game);
  const dealerUp = drawCard(game);
  const second = drawCard(game);
  const dealerHole = drawCard(game);
  if (!first || !dealerUp || !second || !dealerHole) {
    credit(account, economy, totalStake, 'bet-win', 'Mise rendue (sabot vide)', now);
    return { ok: false, error: 'Sabot invalide : relance une partie.' };
  }

  game.hands[0].cards = [first, second];
  game.dealer = [dealerUp, dealerHole];
  game.hands[0].blackjack = isBlackjack(game.hands[0].cards);

  const pairMultiplier = perfectPairMultiplier(config, game.hands[0].cards);
  if (sideBet > 0 && pairMultiplier > 0) {
    const payout = Math.round(sideBet * pairMultiplier);
    credit(account, economy, payout, 'bet-win', 'Paire parfaite', now);
  }

  // L'assurance n'est proposée que si le joueur n'a pas déjà un blackjack.
  game.status =
    !game.hands[0].blackjack && canTakeInsurance(config, game) ? 'insurance' : 'playing';

  state.blackjack[input.userId] = game;

  const notes: string[] = [];
  if (sideBet > 0) {
    const multiplier21 = sideBet21Plus3Multiplier(config, game.hands[0].cards, game.dealer[0]);
    notes.push(
      multiplier21 > 0
        ? `🎰 21+3 gagné (×${multiplier21}) : +${formatMoney(economy, Math.round(sideBet * multiplier21))}`
        : '🎰 21+3 perdu.',
    );
    if (pairMultiplier > 0) {
      notes.push(`👑 Paire parfaite (×${pairMultiplier}) : +${formatMoney(economy, Math.round(sideBet * pairMultiplier))}`);
    }
  }

  return { ok: true, game, wagered: totalWagered(game), note: notes.join('\n') || undefined };
}

export function getGame(state: StoreState, userId: string): BlackjackGame | null {
  return state.blackjack[userId] ?? null;
}

export function dropGame(state: StoreState, userId: string): void {
  delete state.blackjack[userId];
}

// ------------------------------------------------------------
//  Actions du joueur
// ------------------------------------------------------------

export interface ActionInput {
  action: BlackjackAction;
  amount?: number;
  config: BlackjackConfig;
  economy: EconomyConfig;
}

export function playerAction(state: StoreState, userId: string, input: ActionInput, options: TableOptions = {}): TableResult {
  const { config, economy } = input;
  const now = options.now ?? new Date();
  const game = state.blackjack[userId];
  if (!game) return { ok: false, error: 'Tu n’as aucune partie en cours. Lance `/blackjack`.' };
  if (game.status === 'finished' || game.status === 'abandoned') {
    dropGame(state, userId);
    return { ok: false, error: 'Cette partie est terminée.' };
  }

  const account = ensureAccount(state, userId);
  game.updatedAt = now.getTime();
  game.timeoutAt = now.getTime() + config.turnTimeoutSeconds * 1000;

  if (input.action === 'insurance') {
    if (!canTakeInsurance(config, game)) return { ok: false, error: 'L’assurance n’est pas disponible ici.', game };
    const cap = maxInsurance(config, game.baseBet);
    const wanted = Math.min(Math.round(input.amount ?? cap), cap);
    if (wanted <= 0) return { ok: false, error: 'Montant d’assurance invalide.', game };
    const paid = debit(account, economy, wanted, 'bet-loss', 'Assurance blackjack', now);
    if (!paid.ok) return { ok: false, error: paid.reason ?? 'Solde insuffisant.', game };
    game.insuranceBet = paid.amount;
    game.status = 'playing';
    return { ok: true, game, net: -paid.amount };
  }

  if (game.status === 'insurance') {
    // le joueur refuse l'assurance : on encaisse la mise et on continue
    game.status = 'playing';
  }

  const hand = game.hands[game.activeHand];
  if (!hand) return { ok: false, error: 'Aucune main active.', game };

  switch (input.action) {
    case 'hit': {
      if (hand.stood || hand.surrendered) return { ok: false, error: 'Cette main est déjà terminée.', game };
      const card = drawCard(game);
      if (!card) return { ok: false, error: 'Le sabot est vide : relance une partie.', game };
      hand.cards.push(card);
      game.firstAction = false;
      const value = handValue(hand.cards);
      if (value.total > 21) {
        hand.busted = true;
        hand.stood = true;
      }
      advanceHand(game);
      return { ok: true, game };
    }

    case 'stand': {
      hand.stood = true;
      game.firstAction = false;
      advanceHand(game);
      return { ok: true, game };
    }

    case 'double': {
      if (!canDouble(config, game)) return { ok: false, error: 'La double n’est pas possible ici.', game };
      const paid = debit(account, economy, hand.bet, 'bet-loss', 'Double blackjack', now);
      if (!paid.ok) return { ok: false, error: paid.reason ?? 'Solde insuffisant pour doubler.', game };
      hand.bet += paid.amount;
      hand.doubled = true;
      const card = drawCard(game);
      if (!card) return { ok: false, error: 'Le sabot est vide.', game };
      hand.cards.push(card);
      if (handValue(hand.cards).total > 21) hand.busted = true;
      hand.stood = true;
      game.firstAction = false;
      advanceHand(game);
      return { ok: true, game, net: -paid.amount };
    }

    case 'split': {
      if (!canSplit(config, game)) return { ok: false, error: 'Le split n’est pas possible ici.', game };
      const paid = debit(account, economy, hand.bet, 'bet-loss', 'Split blackjack', now);
      if (!paid.ok) return { ok: false, error: paid.reason ?? 'Solde insuffisant pour splitter.', game };
      const [first, second] = hand.cards;
      hand.cards = [first];
      const extra = newHand(paid.amount);
      extra.cards = [second];
      extra.fromSplit = game.activeHand;
      game.hands.splice(game.activeHand + 1, 0, extra);
      game.splitsUsed += 1;
      game.firstAction = false;
      // une carte sur chaque main splittée
      const cardA = drawCard(game);
      const cardB = drawCard(game);
      if (cardA) hand.cards.push(cardA);
      if (cardB) extra.cards.push(cardB);
      for (const target of [hand, extra]) {
        if (handValue(target.cards).total > 21) target.busted = true;
      }
      return { ok: true, game, net: -paid.amount };
    }

    case 'surrender': {
      if (!canSurrender(config, game)) return { ok: false, error: 'L’abandon n’est plus possible.', game };
      hand.surrendered = true;
      hand.stood = true;
      game.firstAction = false;
      advanceHand(game);
      return { ok: true, game };
    }

    default:
      return { ok: false, error: 'Action inconnue.', game };
  }
}

/** Passe à la main suivante ; renvoie true si toutes les mains sont jouées. */
function advanceHand(game: BlackjackGame): boolean {
  for (let index = 0; index < game.hands.length; index += 1) {
    const candidate = game.hands[index];
    if (candidate.stood || candidate.busted || candidate.surrendered) continue;
    game.activeHand = index;
    return false;
  }
  game.activeHand = game.hands.length - 1;
  return true;
}

export function isRoundComplete(game: BlackjackGame): boolean {
  return game.hands.every((hand) => hand.stood || hand.busted || hand.surrendered);
}

// ------------------------------------------------------------
//  Règlement
// ------------------------------------------------------------

export interface FinishResult {
  settlement: Settlement;
  credited: number;
  net: number;
  tax: number;
  streakBonus: number;
  pity: number;
  account: StoreState['accounts'][string];
}

/** Termine la partie : le donneur joue, les gains sont crédités. */
export function finishGame(
  state: StoreState,
  userId: string,
  input: { config: BlackjackConfig; economy: EconomyConfig },
  options: TableOptions = {},
): FinishResult | null {
  const { config, economy } = input;
  const now = options.now ?? new Date();
  const game = state.blackjack[userId];
  if (!game) return null;

  const account = ensureAccount(state, userId);
  const settlement = settleGame(game, config);

  let credited = 0;
  for (const hand of settlement.hands) {
    if (hand.returned > 0) credited += hand.returned;
  }
  // l'assurance gagnante est déjà comptée dans `settlement.returned`
  credited += settlement.insuranceProfit > 0 ? settlement.insuranceProfit : 0;
  credited += settlement.sideBetProfit > 0 ? settlement.sideBetProfit : 0;

  let net = settlement.net;
  let streakBonus = 0;
  if (config.winStreakBonusEnabled && net > 0 && account.winStreak > 0) {
    const steps = Math.min(account.winStreak, config.winStreakMaxSteps);
    streakBonus = Math.round((net * config.winStreakBonusPercent * steps) / 100);
    net += streakBonus;
    credited += streakBonus;
  }

  let tax = 0;
  if (net > 0 && config.taxPercent > 0) {
    tax = Math.round((net * config.taxPercent) / 100);
    net -= tax;
    credited -= tax;
  }

  let pity = 0;
  if (net < 0 && config.loseStreakPityPercent > 0 && account.lossStreak + 1 >= 3) {
    pity = Math.round((settlement.wagered * config.loseStreakPityPercent) / 100);
    net += pity;
    credited += pity;
  }

  if (credited > 0) credit(account, economy, credited, 'bet-win', 'Blackjack', now);

  // statistiques
  const stats = ensureStats(state, userId);
  stats.hands += 1;
  stats.wagered += settlement.wagered;
  stats.returned += Math.max(0, credited);
  account.gamesPlayed += 1;
  if (settlement.outcome === 'blackjack') {
    stats.blackjacks += 1;
    account.gamesWon += 1;
  }
  if (net > 0) {
    stats.wins += 1;
    account.gamesWon += 1;
    account.winStreak += 1;
    account.lossStreak = 0;
    account.totalWon += net;
    stats.biggestWin = Math.max(stats.biggestWin, net);
    stats.bestStreak = Math.max(stats.bestStreak, account.winStreak);
    account.bestBlackjackWin = Math.max(account.bestBlackjackWin, net);
  } else if (net < 0) {
    stats.losses += 1;
    account.winStreak = 0;
    account.lossStreak += 1;
    account.totalLost += -net;
    account.lostToday += -net;
  } else {
    stats.pushes += 1;
    account.winStreak = 0;
  }

  game.status = 'finished';
  game.holeRevealed = true;
  game.result = {
    outcome: settlement.outcome,
    net,
    summary: settlement.summary,
  };
  dropGame(state, userId);

  // le sabot entamé est conservé pour les parties suivantes du serveur
  const shoes = state.meta.shoes ?? {};
  shoes[game.guildId] = { cards: game.shoe, index: game.drawIndex };
  state.meta.shoes = shoes;

  return { settlement, credited, net, tax, streakBonus, pity, account };
}

/**
 * Abandonne une partie sans jouer. La mise est perdue, sauf si un
 * pourcentage de remboursement est demandé : il est alors réellement
 * crédité au compte du membre.
 */
export function abandonGame(state: StoreState, userId: string, refundPercent = 0, now: Date = new Date()): number {
  const game = state.blackjack[userId];
  if (!game) return 0;
  const refund = Math.round((totalWagered(game) * Math.max(0, Math.min(100, refundPercent))) / 100);
  dropGame(state, userId);
  if (refund > 0) {
    credit(ensureAccount(state, userId), state.config.economy, refund, 'bet-win', 'Partie de blackjack abandonnée', now);
  }
  return refund;
}

export {
  blackjackRatio,
  maxInsurance,
  canSplit,
  canDouble,
  canSurrender,
  canTakeInsurance,
  handValue,
  isBlackjack,
  needsReshuffle,
  totalWagered as wageredOf,
};
