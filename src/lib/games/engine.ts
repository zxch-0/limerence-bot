import type { GamesConfig } from './config';
import type { Rng } from '../economy/core';

// ============================================================
//  Moteurs des jeux du casino — logique pure
//
//  Chaque jeu est une fonction déterministe : le hasard est injecté
//  (rng) pour que tout soit testable sans Discord. Les multiplicateurs
//  sont lus dans la configuration ; un gain = mise × multiplicateur.
// ============================================================

// ------------------------------------------------------------
//  Roulette (européenne : 0-36, 0 vert, 18 rouges, 18 noirs)
// ------------------------------------------------------------

export const ROULETTE_REDS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteBet =
  | { kind: 'straight'; number: number }
  | { kind: 'color'; color: 'rouge' | 'noir' | 'vert' }
  | { kind: 'parity'; parity: 'pair' | 'impair' }
  | { kind: 'dozen'; dozen: 1 | 2 | 3 };

export interface RouletteResult {
  win: boolean;
  multiplier: number;
  landed: number;
  color: 'rouge' | 'noir' | 'vert';
  label: string;
}

export function spinRoulette(bet: RouletteBet, config: GamesConfig, rng: Rng = Math.random): RouletteResult {
  const landed = Math.floor(rng() * 37);
  const color: RouletteResult['color'] = landed === 0 ? 'vert' : ROULETTE_REDS.has(landed) ? 'rouge' : 'noir';
  let win = false;
  let multiplier = 0;
  let label = `La bille tombe sur **${landed}** (${color})`;

  switch (bet.kind) {
    case 'straight':
      win = landed === bet.number;
      multiplier = win ? config.rouletteStraightPayout : 0;
      label = win ? `Numéro plein ! **${landed}**` : `La bille tombe sur **${landed}** (${color}) — perdu.`;
      break;
    case 'color':
      win = landed !== 0 && color === bet.color;
      if (bet.color === 'vert') win = landed === 0;
      multiplier = win ? (bet.color === 'vert' ? config.rouletteStraightPayout : config.rouletteColorPayout) : 0;
      break;
    case 'parity':
      win = landed !== 0 && (bet.parity === 'pair' ? landed % 2 === 0 : landed % 2 === 1);
      multiplier = win ? config.rouletteEvenPayout : 0;
      break;
    case 'dozen': {
      const dozen = landed === 0 ? 0 : Math.floor((landed - 1) / 12) + 1;
      win = dozen === bet.dozen;
      multiplier = win ? config.rouletteDozenPayout : 0;
      break;
    }
  }
  return { win, multiplier, landed, color, label };
}

// ------------------------------------------------------------
//  Pile ou face
// ------------------------------------------------------------

export interface CoinflipResult {
  win: boolean;
  multiplier: number;
  side: 'pile' | 'face';
}

export function flipCoin(choice: 'pile' | 'face', config: GamesConfig, rng: Rng = Math.random): CoinflipResult {
  const side: CoinflipResult['side'] = rng() < 0.5 ? 'pile' : 'face';
  const win = side === choice;
  return { win, multiplier: win ? config.coinflipPayout : 0, side };
}

// ------------------------------------------------------------
//  Dés
// ------------------------------------------------------------

export type DiceBet =
  | { kind: 'exact'; number: number }
  | { kind: 'parity'; parity: 'pair' | 'impair' }
  | { kind: 'range'; range: 'bas' | 'haut' };

export interface DiceResult {
  win: boolean;
  multiplier: number;
  roll: number;
  label: string;
}

export function rollDice(bet: DiceBet, config: GamesConfig, rng: Rng = Math.random): DiceResult {
  const roll = 1 + Math.floor(rng() * 6);
  let win = false;
  let multiplier = 0;
  let label = `🎲 Le dé affiche **${roll}**`;
  if (bet.kind === 'exact') {
    win = roll === bet.number;
    multiplier = win ? config.diceExactPayout : 0;
    if (win) label = `🎯 Exact ! Le dé affiche **${roll}**`;
  } else if (bet.kind === 'parity') {
    win = bet.parity === 'pair' ? roll % 2 === 0 : roll % 2 === 1;
    multiplier = win ? config.diceRangePayout : 0;
  } else {
    win = bet.range === 'bas' ? roll <= 3 : roll >= 4;
    multiplier = win ? config.diceRangePayout : 0;
  }
  return { win, multiplier, roll, label };
}

// ------------------------------------------------------------
//  Machine à sous
// ------------------------------------------------------------

export interface SlotSymbol {
  emoji: string;
  /** poids relatif à la roulette (plus le poids est haut, plus le symbole tombe souvent) */
  weight: number;
}

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { emoji: '🍒', weight: 26 },
  { emoji: '🍋', weight: 22 },
  { emoji: '🔔', weight: 18 },
  { emoji: '⭐', weight: 14 },
  { emoji: '7️⃣', weight: 10 },
  { emoji: '💎', weight: 2 }, // jackpot : multiplicateur depuis la config
];

export interface SlotsResult {
  reels: [string, string, string];
  multiplier: number;
  jackpot: boolean;
  win: boolean;
  label: string;
}

export function spinSlots(config: GamesConfig, rng: Rng = Math.random): SlotsResult {
  const totalWeight = SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
  const draw = (): SlotSymbol => {
    let roll = rng() * totalWeight;
    for (const symbol of SLOT_SYMBOLS) {
      roll -= symbol.weight;
      if (roll < 0) return symbol;
    }
    return SLOT_SYMBOLS[0];
  };
  const reels: [string, string, string] = [draw().emoji, draw().emoji, draw().emoji];
  const [a, b, c] = reels;

  let multiplier = 0;
  let jackpot = false;
  if (a === b && b === c) {
    if (a === config.slotsJackpotSymbol) {
      multiplier = config.slotsJackpotMultiplier;
      jackpot = true;
    } else {
      multiplier = config.slotsThreeMultiplier;
    }
  } else if (a === b || b === c || a === c) {
    multiplier = config.slotsTwoMultiplier;
  }
  return {
    reels,
    multiplier,
    jackpot,
    win: multiplier > 0,
    label: multiplier > 0 ? `🎰 ${reels.join(' ')} — ×${multiplier}` : `🎰 ${reels.join(' ')} — perdu`,
  };
}

// ------------------------------------------------------------
//  Mines (démineur)
// ------------------------------------------------------------

export interface MinesGame {
  /** true = mine à cette position */
  grid: boolean[];
  mines: number;
  size: number;
  revealed: number[];
}

/**
 * 24 tuiles : 4 rangées de 5 + une dernière rangée de 4 tuiles et le
 * bouton « Encaisser » (Discord limite un message à 5 rangées de boutons).
 */
export const MINES_GRID_SIZE = 24;

/** Crée une grille de `mines` mines parmi 25 tuiles (répartition aléatoire). */
export function createMines(mines: number, rng: Rng = Math.random): MinesGame {
  const size = MINES_GRID_SIZE;
  const count = Math.max(1, Math.min(size - 1, Math.floor(mines)));
  const grid = new Array<boolean>(size).fill(false);
  let placed = 0;
  while (placed < count) {
    const index = Math.floor(rng() * size);
    if (!grid[index]) {
      grid[index] = true;
      placed += 1;
    }
  }
  return { grid, mines: count, size, revealed: [] };
}

/**
 * Multiplicateur « fair » après `safe` tuiles sûres révélées : produit des
 * probabilités conditionnelles, avec l’avantage maison retiré.
 * Exemple : 1 mine sur 25 → révéler 24 tuiles sûres = ×25 (moins l’edge).
 */
export function minesMultiplier(game: MinesGame, safe: number, config: GamesConfig): number {
  const total = game.size;
  const mines = game.mines;
  let multiplier = 1;
  for (let revealed = 0; revealed < safe; revealed += 1) {
    // inverse de la probabilité de survivre à la tuile suivante
    multiplier *= (total - revealed) / (total - mines - revealed);
  }
  const edge = Math.min(0.5, Math.max(0, config.minesHouseEdgePercent) / 100);
  return multiplier * (1 - edge);
}

export interface MinesReveal {
  safe: boolean;
  mine: boolean;
  multiplier: number;
  busted: boolean;
  won: boolean;
}

/** Révèle une tuile : safe = gain possible à ce multiplicateur, mine = partie perdue. */
export function revealMinesTile(game: MinesGame, index: number, config: GamesConfig): MinesReveal {
  if (index < 0 || index >= game.size || game.revealed.includes(index)) {
    return { safe: false, mine: false, multiplier: minesMultiplier(game, game.revealed.length, config), busted: false, won: false };
  }
  const mine = game.grid[index];
  if (mine) {
    game.revealed.push(index);
    return { safe: false, mine: true, multiplier: 0, busted: true, won: false };
  }
  game.revealed.push(index);
  const safe = game.revealed.length;
  const won = safe === game.size - game.mines;
  return {
    safe: true,
    mine: false,
    multiplier: minesMultiplier(game, safe, config),
    busted: false,
    won,
  };
}

/** Toutes les tuiles sûres ont été révélées : multiplicateur final. */
export function minesCompleteMultiplier(game: MinesGame, config: GamesConfig): number {
  return minesMultiplier(game, game.size - game.mines, config);
}

// ------------------------------------------------------------
//  Crash (fusée)
// ------------------------------------------------------------

/**
 * Point de crash décidé à l’avance : distribution exponentielle avec un
 * avantage maison de 1 %, plafonné par `crashMaxMultiplier`.
 * P(crash ≥ x) ≈ 1 / x pour x ≥ 1.
 */
export function crashPoint(config: GamesConfig, rng: Rng = Math.random): number {
  const roll = 1 - rng(); // évite le 0
  const raw = 0.99 / roll; // avantage maison 1 %
  const capped = Math.min(config.crashMaxMultiplier, Math.max(1, raw));
  return Math.round(capped * 100) / 100;
}

/** Multiplicateur affiché à un instant donné (croissance exponentielle par paliers). */
export function crashMultiplierAt(elapsedMs: number, config: GamesConfig): number {
  const ticks = Math.max(0, elapsedMs / Math.max(1, config.crashTickMs));
  const growth = Math.max(0, config.crashGrowthPercent) / 100;
  const multiplier = Math.pow(1 + growth, ticks);
  return Math.round(Math.min(multiplier, config.crashMaxMultiplier) * 100) / 100;
}

/** La fusée a-t-elle explosé à ce multiplicateur ? */
export function crashHasCrashed(multiplier: number, crashAt: number): boolean {
  return multiplier >= crashAt;
}

// ------------------------------------------------------------
//  Plinko
// ------------------------------------------------------------

export type PlinkoRisk = 'faible' | 'moyen' | 'eleve';

/** Tables de multiplicateurs (13 fentes, bords = plus rares et plus hautes). */
// Retour total (mise comprise) par fente. Chaque table a un RTP ≈ 97 %
// (somme des probabilités binomiales × multiplicateurs).
export const PLINKO_TABLES: Record<PlinkoRisk, number[]> = {
  faible: [6, 2.25, 1.5, 1.5, 1.2, 1, 0.3, 1, 1.2, 1.5, 1.5, 2.25, 6],
  moyen: [27, 7.5, 3, 1.6, 1.2, 0.8, 0.2, 0.8, 1.2, 1.6, 3, 7.5, 27],
  eleve: [200, 30, 5, 1.5, 0.6, 0.6, 0, 0.6, 0.6, 1.5, 5, 30, 200],
};

export const PLINKO_ROWS = 12;

export interface PlinkoResult {
  multiplier: number;
  slot: number;
  win: boolean;
  label: string;
}

/** Lâche une bille à travers 12 rangées de piquets (loi binomiale). */
export function dropPlinko(risk: PlinkoRisk, rng: Rng = Math.random): PlinkoResult {
  const table = PLINKO_TABLES[risk] ?? PLINKO_TABLES.moyen;
  let slot = 0;
  for (let row = 0; row < PLINKO_ROWS; row += 1) {
    if (rng() < 0.5) slot += 1;
  }
  const multiplier = table[Math.min(slot, table.length - 1)];
  return {
    multiplier,
    slot,
    win: multiplier >= 1,
    label: `🪂 La bille atterrit en fente **${slot + 1}** — ×${multiplier}`,
  };
}
