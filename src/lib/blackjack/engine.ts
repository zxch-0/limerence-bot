import type { BlackjackConfig, BlackjackGame, Card, Rank, Suit } from '../types';

// ============================================================
//  Moteur de blackjack — logique pure, sans Discord ni stockage
//  Le hasard est injecté (rng) pour permettre des tests déterministes.
// ============================================================

export type Rng = () => number;

export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

export const SUIT_NAMES: Record<Suit, string> = {
  S: 'pique',
  H: 'cœur',
  D: 'carreau',
  C: 'trèfle',
};

export const SUIT_EMOJI: Record<Suit, string> = {
  S: '♠️',
  H: '♥️',
  D: '♦️',
  C: '♣️',
};

export const RANK_NAMES: Record<Rank, string> = {
  A: 'As',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'Valet',
  Q: 'Dame',
  K: 'Roi',
};

// ------------------------------------------------------------
//  Sabot
// ------------------------------------------------------------

export function buildDeck(decks: number): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ rank, suit });
    }
  }
  return cards;
}

export function shuffle(cards: Card[], rng: Rng): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

export function createShoe(decks: number, rng: Rng): Card[] {
  return shuffle(buildDeck(Math.max(1, Math.min(8, Math.round(decks)))), rng);
}

// ------------------------------------------------------------
//  Valeurs des mains
// ------------------------------------------------------------

export interface HandValue {
  total: number;
  soft: boolean;
}

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10;
  return Number(rank);
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === 'A') aces += 1;
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
    if (aces === 0) soft = false;
  }
  if (aces === 0) soft = false;
  return { total, soft };
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21;
}

export function dealerMustHit(cards: readonly Card[], standSoft17: boolean): boolean {
  const { total, soft } = handValue(cards);
  if (total < 17) return true;
  if (total === 17 && soft && !standSoft17) return true;
  return false;
}

export function cardLabel(card: Card): string {
  return `${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`;
}

export function cardGlyph(card: Card): string {
  return `\`${card.rank}${card.suit}\`${SUIT_EMOJI[card.suit]}`;
}

export function handGlyph(cards: readonly Card[]): string {
  return cards.map((card) => cardGlyph(card)).join(' ');
}

// ------------------------------------------------------------
//  Distribution
// ------------------------------------------------------------

export function drawCard(game: BlackjackGame): Card | null {
  if (game.drawIndex >= game.shoe.length) return null;
  const card = game.shoe[game.drawIndex];
  game.drawIndex += 1;
  return card ?? null;
}

export function shoeRemaining(game: BlackjackGame): number {
  return Math.max(0, game.shoe.length - game.drawIndex);
}

/** Le sabot doit-il être remélangé compte tenu de la pénétration configurée ? */
export function needsReshuffle(game: BlackjackGame, config: BlackjackConfig): boolean {
  if (config.reshuffleEveryHand) return true;
  const penetration = Math.max(25, Math.min(100, config.shufflePenetrationPercent)) / 100;
  return shoeRemaining(game) < game.shoe.length * (1 - penetration);
}

// ------------------------------------------------------------
//  Règles de la table
// ------------------------------------------------------------

export function blackjackRatio(config: BlackjackConfig): number {
  if (config.blackjackPayout === '6:5') return 1.2;
  if (config.blackjackPayout === '2:1') return 2;
  return 1.5;
}

export function insuranceRatio(config: BlackjackConfig): number {
  return config.insurancePayout === '3:1' ? 3 : 2;
}

export function maxInsurance(config: BlackjackConfig, baseBet: number): number {
  const percent = Math.max(0, Math.min(100, config.insuranceMaxPercent));
  return Math.floor((baseBet * percent) / 100);
}

export function canSplit(config: BlackjackConfig, game: BlackjackGame): boolean {
  if (!config.allowSplit) return false;
  const hand = game.hands[game.activeHand];
  if (!hand || hand.cards.length !== 2 || hand.doubled || hand.stood) return false;
  if (game.hands.length - 1 >= config.maxSplits) return false;
  return cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank);
}

export function canDouble(config: BlackjackConfig, game: BlackjackGame): boolean {
  if (!config.allowDoubleDown) return false;
  const hand = game.hands[game.activeHand];
  if (!hand || hand.cards.length !== 2 || hand.doubled || hand.stood) return false;
  if (hand.fromSplit !== undefined && !config.doubleAfterSplit) return false;
  if (config.doubleOnAnyTwoCards) return true;
  const total = handValue(hand.cards).total;
  return total === 9 || total === 10 || total === 11;
}

export function canSurrender(config: BlackjackConfig, game: BlackjackGame): boolean {
  if (!config.allowSurrender) return false;
  if (!game.firstAction) return false;
  const hand = game.hands[game.activeHand];
  if (!hand || hand.cards.length !== 2) return false;
  return !hand.doubled && !hand.fromSplit;
}

export function canTakeInsurance(config: BlackjackConfig, game: BlackjackGame): boolean {
  if (!config.allowInsurance) return false;
  if (game.status !== 'insurance') return false;
  if (game.insuranceResolved || game.insuranceBet > 0) return false;
  return game.dealer[0]?.rank === 'A';
}

/** L'as splitté n'a droit qu'à une seule carte. */
export function handIsLocked(config: BlackjackConfig, game: BlackjackGame): boolean {
  const hand = game.hands[game.activeHand];
  if (!hand) return true;
  if (!config.splitAcesOneCard) return false;
  if (hand.fromSplit === undefined) return false;
  const origin = game.hands[hand.fromSplit];
  return Boolean(origin && origin.cards[0]?.rank === 'A');
}

// ------------------------------------------------------------
//  Paris annexes
// ------------------------------------------------------------

function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

/**
 * 21+3 : les deux cartes du joueur + la carte visible du donneur.
 * Les combinaisons rares paient un multiple du multiplicateur configuré.
 */
export function sideBet21Plus3Multiplier(
  config: BlackjackConfig,
  player: readonly Card[],
  dealerUp: Card | undefined,
): number {
  if (!config.sideBet21Plus3Enabled || player.length < 2 || !dealerUp) return 0;
  const cards = [player[0], player[1], dealerUp];
  const sameSuit = cards.every((card) => card.suit === cards[0].suit);
  const values = cards
    .map((card) => rankIndex(card.rank) + 1)
    .sort((a, b) => a - b);
  const consecutive = values[0] + 1 === values[1] && values[1] + 1 === values[2];
  // l'as compte haut pour la suite A-D-R
  const aceHigh = values[0] === 1 && values[1] === 12 && values[2] === 13;
  const straight = consecutive || aceHigh;
  const threeOfAKind =
    values[0] === values[1] && values[1] === values[2];

  const base = config.sideBet21Plus3Payout;
  if (sameSuit && straight) return base * 4;
  if (threeOfAKind) return base * 3;
  if (straight) return base * 2;
  if (sameSuit) return base;
  return 0;
}

export function sideBet21Plus3Label(multiplier: number): string {
  if (multiplier <= 0) return 'perdu';
  return `payé ×${multiplier}`;
}

/** Paire parfaite : les deux premières cartes du joueur. */
export function perfectPairMultiplier(config: BlackjackConfig, cards: readonly Card[]): number {
  if (!config.perfectPairsEnabled || cards.length < 2) return 0;
  const [a, b] = cards;
  if (cardValue(a.rank) !== cardValue(b.rank)) return 0;
  const base = config.perfectPairsPayout;
  if (a.suit === b.suit) return base * 2;
  const red = (suit: Suit) => suit === 'H' || suit === 'D';
  if (red(a.suit) === red(b.suit)) return base;
  return Math.max(1, Math.round(base / 2));
}

export function perfectPairLabel(multiplier: number): string {
  if (multiplier <= 0) return 'aucune paire';
  return `paire payée ×${multiplier}`;
}

// ------------------------------------------------------------
//  Règlement de la partie
// ------------------------------------------------------------

export interface HandSettlement {
  index: number;
  bet: number;
  multiplier: number;
  returned: number;
  profit: number;
  reason: string;
}

export type BlackjackOutcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | 'surrender';

export interface Settlement {
  hands: HandSettlement[];
  insuranceProfit: number;
  sideBetProfit: number;
  wagered: number;
  returned: number;
  net: number;
  outcome: BlackjackOutcome;
  summary: string;
  lines: string[];
  dealerTotal: number;
  dealerBust: boolean;
}

function dealerTotal(cards: readonly Card[]): number {
  return handValue(cards).total;
}

/** Le donneur tire ses cartes jusqu'à respecter la règle de la table. */
export function playDealer(game: BlackjackGame, config: BlackjackConfig): Card[] {
  while (dealerMustHit(game.dealer, config.dealerStandsOnSoft17)) {
    const card = drawCard(game);
    if (!card) break;
    game.dealer.push(card);
  }
  game.holeRevealed = true;
  return game.dealer;
}

export function settleGame(game: BlackjackGame, config: BlackjackConfig): Settlement {
  playDealer(game, config);

  const dealerCards = game.dealer;
  const dealerBJ = isBlackjack(dealerCards);
  const dTotal = dealerTotal(dealerCards);
  const dealerBust = dTotal > 21;

  const lines: string[] = [];
  const hands: HandSettlement[] = [];
  let wagered = 0;
  let returned = 0;
  let blackjackCount = 0;
  let bustCount = 0;

  game.hands.forEach((hand, index) => {
    wagered += hand.bet;
    const total = handValue(hand.cards).total;
    let multiplier: number;
    let reason: string;

    if (hand.surrendered) {
      multiplier = Math.max(0, Math.min(100, config.surrenderRefundPercent)) / 100;
      reason = 'abandon';
    } else if (hand.busted || total > 21) {
      multiplier = 0;
      reason = `saute (${total})`;
      bustCount += 1;
    } else if (hand.blackjack && dealerBJ) {
      multiplier = 1;
      reason = 'égalité (deux blackjacks)';
    } else if (hand.blackjack) {
      multiplier = 1 + blackjackRatio(config);
      reason = `blackjack (${config.blackjackPayout})`;
      blackjackCount += 1;
    } else if (dealerBJ) {
      multiplier = 0;
      reason = 'le donneur a un blackjack';
    } else if (dealerBust || total > dTotal) {
      multiplier = 2;
      reason = dealerBust ? 'le donneur saute' : `${total} contre ${dTotal}`;
    } else if (total === dTotal) {
      multiplier = config.pushReturnsBet ? 1 : 0;
      reason = `égalité (${total})`;
    } else {
      multiplier = 0;
      reason = `${total} contre ${dTotal}`;
    }

    const handReturned = Math.round(hand.bet * multiplier);
    hands.push({
      index,
      bet: hand.bet,
      multiplier,
      returned: handReturned,
      profit: handReturned - hand.bet,
      reason,
    });
    returned += handReturned;
    lines.push(`Main ${index + 1} : ${handGlyph(hand.cards)} — ${total} → ${reason}`);
  });

  // assurance
  let insuranceProfit = 0;
  if (game.insuranceBet > 0) {
    wagered += game.insuranceBet;
    if (dealerBJ) {
      const payout = Math.round(game.insuranceBet * insuranceRatio(config));
      insuranceProfit = payout;
      returned += payout;
      lines.push(`Assurance : ${game.insuranceBet} misés → ${payout} rendus`);
    } else {
      insuranceProfit = -game.insuranceBet;
      lines.push(`Assurance perdue (${game.insuranceBet})`);
    }
  }

  // pari annexe 21+3
  let sideBetProfit = 0;
  if (game.sideBet > 0) {
    wagered += game.sideBet;
    const multiplier = sideBet21Plus3Multiplier(config, game.hands[0]?.cards ?? [], game.dealer[0]);
    if (multiplier > 0) {
      const payout = Math.round(game.sideBet * multiplier);
      sideBetProfit = payout;
      returned += payout;
      lines.push(`21+3 ${sideBet21Plus3Label(multiplier)} : +${payout}`);
    } else {
      sideBetProfit = -game.sideBet;
      lines.push(`21+3 perdu (${game.sideBet})`);
    }
  }

  const net = returned - wagered;
  const allSurrendered = game.hands.length > 0 && game.hands.every((hand) => hand.surrendered);
  const outcome: Settlement['outcome'] =
    blackjackCount > 0
      ? 'blackjack'
      : allSurrendered
        ? 'surrender'
        : bustCount === hands.length && hands.length > 0
          ? 'bust'
          : net > 0
            ? 'win'
            : net === 0
              ? 'push'
              : 'lose';

  const summary =
    outcome === 'push'
      ? 'Égalité — mise rendue.'
      : `${net >= 0 ? '+' : ''}${net} · donneur ${dealerBust ? 'saute' : dTotal}`;

  return {
    hands,
    insuranceProfit,
    sideBetProfit,
    wagered,
    returned,
    net,
    outcome,
    summary,
    lines,
    dealerTotal: dTotal,
    dealerBust,
  };
}
