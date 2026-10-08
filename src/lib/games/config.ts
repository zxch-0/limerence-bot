import type { ConfigOf, ConfigValues, FieldDef, SectionDef } from '../schema-fields';

// ============================================================
//  Casino — configuration des jeux d'argent (26 options)
//
//  Même mécanisme que l'économie et le blackjack : une seule liste
//  de champs, dont le type, les valeurs par défaut et le panel
//  sont dérivés. Le blackjack garde sa propre configuration.
// ============================================================

export const GAMES_SECTIONS = [
  { id: 'access', label: 'Accès', emoji: '🎟️', description: 'Activation globale du casino et salons autorisés.' },
  { id: 'roulette', label: 'Roulette', emoji: '🎡', description: 'Paiements de la roulette européenne.' },
  { id: 'coinflip', label: 'Pile ou face', emoji: '🪙', description: 'Paiement du pile ou face.' },
  { id: 'dice', label: 'Dés', emoji: '🎲', description: 'Paiements du jeu de dés.' },
  { id: 'slots', label: 'Machine à sous', emoji: '🎰', description: 'Table des symboles et multiplicateurs.' },
  { id: 'mines', label: 'Mines', emoji: '💣', description: 'Grille, avantage maison et multiplicateurs.' },
  { id: 'crash', label: 'Crash', emoji: '🚀', description: 'Vitesse de la fusée et multiplicateur maximum.' },
  { id: 'plinko', label: 'Plinko', emoji: '🪂', description: 'Jeu de billes (risque au choix du joueur).' },
] as const satisfies readonly SectionDef[];

export const GAMES_FIELDS = [
  // ---------- Accès ----------
  { key: 'enabled', label: 'Activer le casino', kind: 'boolean', section: 'access', hint: 'Coupe tous les jeux d’argent (sauf blackjack, réglé à part).' },
  { key: 'allowedChannels', label: 'Salons de jeu autorisés (vide = partout)', kind: 'channel', section: 'access', maxItems: 15 },
  { key: 'cooldownSeconds', label: 'Délai entre deux parties (secondes)', kind: 'integer', section: 'access', min: 0, max: 3600 },

  // ---------- Roulette ----------
  { key: 'rouletteEnabled', label: 'Activer la roulette', kind: 'boolean', section: 'roulette' },
  { key: 'rouletteStraightPayout', label: 'Retour d’un numéro plein (×, mise comprise)', kind: 'number', section: 'roulette', min: 1, max: 100, step: 1, dependsOn: 'rouletteEnabled' },
  { key: 'rouletteDozenPayout', label: 'Retour d’une douzaine (×, mise comprise)', kind: 'number', section: 'roulette', min: 1, max: 20, step: 0.5, dependsOn: 'rouletteEnabled' },
  { key: 'rouletteColorPayout', label: 'Retour rouge ou noir (×, mise comprise)', kind: 'number', section: 'roulette', min: 0, max: 10, step: 0.5, dependsOn: 'rouletteEnabled' },
  { key: 'rouletteEvenPayout', label: 'Retour pair ou impair (×, mise comprise)', kind: 'number', section: 'roulette', min: 0, max: 10, step: 0.5, dependsOn: 'rouletteEnabled' },

  // ---------- Pile ou face ----------
  { key: 'coinflipEnabled', label: 'Activer le pile ou face', kind: 'boolean', section: 'coinflip' },
  { key: 'coinflipPayout', label: 'Retour du pile ou face (×, mise comprise)', kind: 'number', section: 'coinflip', min: 0, max: 10, step: 0.1, dependsOn: 'coinflipEnabled', hint: 'Probabilité 50 % : 1.9 laisse ~5 % à la maison.' },

  // ---------- Dés ----------
  { key: 'diceEnabled', label: 'Activer les dés', kind: 'boolean', section: 'dice' },
  { key: 'diceExactPayout', label: 'Retour d’un numéro exact (×, mise comprise)', kind: 'number', section: 'dice', min: 1, max: 100, step: 0.1, dependsOn: 'diceEnabled', hint: 'Probabilité 1/6 : 5.7 laisse ~5 % à la maison.' },
  { key: 'diceRangePayout', label: 'Retour pair/impair/bas/haut (×, mise comprise)', kind: 'number', section: 'dice', min: 0, max: 10, step: 0.1, dependsOn: 'diceEnabled' },

  // ---------- Machine à sous ----------
  { key: 'slotsEnabled', label: 'Activer la machine à sous', kind: 'boolean', section: 'slots' },
  { key: 'slotsJackpotSymbol', label: 'Symbole du jackpot', kind: 'string', section: 'slots', maxLength: 8, dependsOn: 'slotsEnabled', hint: 'Parmi : 🍒 🍋 🔔 ⭐ 7️⃣ 💎.' },
  { key: 'slotsJackpotMultiplier', label: 'Multiplicateur du jackpot (×)', kind: 'number', section: 'slots', min: 1, max: 1000, step: 1, dependsOn: 'slotsEnabled' },
  { key: 'slotsThreeMultiplier', label: 'Retour de 3 symboles identiques (×, mise comprise)', kind: 'number', section: 'slots', min: 1, max: 100, step: 0.5, dependsOn: 'slotsEnabled' },
  { key: 'slotsTwoMultiplier', label: 'Retour de 2 symboles identiques (×, mise comprise)', kind: 'number', section: 'slots', min: 0, max: 10, step: 0.5, dependsOn: 'slotsEnabled' },

  // ---------- Mines ----------
  { key: 'minesEnabled', label: 'Activer le démineur', kind: 'boolean', section: 'mines' },
  { key: 'minesMaxMines', label: 'Nombre maximum de mines', kind: 'integer', section: 'mines', min: 1, max: 23, dependsOn: 'minesEnabled' },
  { key: 'minesHouseEdgePercent', label: 'Avantage maison (%)', kind: 'percent', section: 'mines', min: 0, max: 50, dependsOn: 'minesEnabled' },
  { key: 'minesTimeoutSeconds', label: 'Temps de réflexion (secondes)', kind: 'integer', section: 'mines', min: 30, max: 1800, dependsOn: 'minesEnabled' },

  // ---------- Crash ----------
  { key: 'crashEnabled', label: 'Activer le crash', kind: 'boolean', section: 'crash' },
  { key: 'crashTickMs', label: 'Vitesse de la fusée (ms par palier)', kind: 'integer', section: 'crash', min: 300, max: 5000, dependsOn: 'crashEnabled' },
  { key: 'crashGrowthPercent', label: 'Croissance par palier (%)', kind: 'percent', section: 'crash', min: 1, max: 100, dependsOn: 'crashEnabled' },
  { key: 'crashMaxMultiplier', label: 'Multiplicateur maximum (×)', kind: 'number', section: 'crash', min: 2, max: 1000, step: 1, dependsOn: 'crashEnabled' },

  // ---------- Plinko ----------
  { key: 'plinkoEnabled', label: 'Activer le plinko', kind: 'boolean', section: 'plinko', hint: 'Le joueur choisit le risque : faible, moyen ou élevé.' },
] as const satisfies readonly FieldDef[];

export type GamesConfig = ConfigOf<typeof GAMES_FIELDS>;

export const DEFAULT_GAMES_CONFIG: GamesConfig = {
  enabled: true,
  allowedChannels: [],
  cooldownSeconds: 3,

  rouletteEnabled: true,
  rouletteStraightPayout: 36,
  rouletteDozenPayout: 3,
  rouletteColorPayout: 2,
  rouletteEvenPayout: 2,

  coinflipEnabled: true,
  coinflipPayout: 1.9,

  diceEnabled: true,
  diceExactPayout: 5.7,
  diceRangePayout: 1.9,

  slotsEnabled: true,
  slotsJackpotSymbol: '💎',
  slotsJackpotMultiplier: 100,
  slotsThreeMultiplier: 14,
  slotsTwoMultiplier: 1,

  minesEnabled: true,
  minesMaxMines: 24,
  minesHouseEdgePercent: 5,
  minesTimeoutSeconds: 300,

  crashEnabled: true,
  crashTickMs: 1200,
  crashGrowthPercent: 6,
  crashMaxMultiplier: 100,

  plinkoEnabled: true,
};

export const GAMES_OPTIONS_COUNT = GAMES_FIELDS.length;

/** Valeurs par défaut au format générique (utilisé par le panel et les tests). */
export const GAMES_DEFAULT_VALUES: ConfigValues = { ...DEFAULT_GAMES_CONFIG };
