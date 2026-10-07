import type { ConfigOf, ConfigValues, FieldDef, SectionDef } from '../schema-fields';

// ============================================================
//  Blackjack — configuration complète (38 options)
//  Mêmes mécanismes que l'économie : une seule liste de champs.
// ============================================================

export const BLACKJACK_SECTIONS = [
  { id: 'access', label: 'Accès & mises', emoji: '🎟️', description: 'Qui peut jouer, où, et pour combien.' },
  { id: 'shoe', label: 'Sabot & distribution', emoji: '🃏', description: 'Nombre de jeux de cartes et mélange.' },
  { id: 'rules', label: 'Règles de la table', emoji: '📜', description: 'Règles casino : donneur, double, split, assurance, abandon.' },
  { id: 'payouts', label: 'Paiements', emoji: '💵', description: 'Multiplicateurs appliqués aux gains.' },
  { id: 'sidebets', label: 'Paris annexes', emoji: '🎰', description: '21+3 et Paire parfaite.' },
  { id: 'pace', label: 'Rythme de jeu', emoji: '⏱️', description: 'Temps de réflexion, abandon automatique, anti-spam.' },
  { id: 'display', label: 'Affichage', emoji: '🖥️', description: 'Apparence de la table dans Discord.' },
] as const satisfies readonly SectionDef[];

export const BLACKJACK_FIELDS = [
  // ---------- Accès & mises ----------
  { key: 'enabled', label: 'Activer le blackjack', kind: 'boolean', section: 'access' },
  { key: 'minBet', label: 'Mise minimum', kind: 'integer', section: 'access', min: 1, max: 1_000_000 },
  { key: 'maxBet', label: 'Mise maximum (0 = illimité)', kind: 'integer', section: 'access', min: 0, max: 100_000_000 },
  { key: 'maxBetPercentOfBalance', label: 'Mise maximum (% du solde, 0 = illimité)', kind: 'percent', section: 'access', min: 0, max: 100 },
  { key: 'allowedChannels', label: 'Salons autorisés (vide = partout)', kind: 'channel', section: 'access', maxItems: 15 },
  { key: 'oneGamePerUser', label: 'Une seule partie par membre', kind: 'boolean', section: 'access' },
  { key: 'cooldownSeconds', label: 'Délai entre deux parties (secondes)', kind: 'integer', section: 'access', min: 0, max: 3600 },
  { key: 'allowQuickBetAliases', label: 'Accepter « all » et « half » comme mise', kind: 'boolean', section: 'access' },
  { key: 'taxPercent', label: 'Taxe sur les gains (%)', kind: 'percent', section: 'access', min: 0, max: 50 },

  // ---------- Sabot ----------
  { key: 'decks', label: 'Nombre de jeux de 52 cartes', kind: 'integer', section: 'shoe', min: 1, max: 8 },
  { key: 'shufflePenetrationPercent', label: 'Mélange après X % du sabot (%)', kind: 'percent', section: 'shoe', min: 25, max: 100 },
  { key: 'reshuffleEveryHand', label: 'Mélanger à chaque main', kind: 'boolean', section: 'shoe', hint: 'Moins réaliste mais impossible à compter.' },

  // ---------- Règles ----------
  { key: 'dealerStandsOnSoft17', label: 'Le donneur reste sur un 17 souple', kind: 'boolean', section: 'rules' },
  { key: 'allowDoubleDown', label: 'Autoriser la double', kind: 'boolean', section: 'rules' },
  { key: 'doubleOnAnyTwoCards', label: 'Double sur n’importe quelles deux cartes', kind: 'boolean', section: 'rules', dependsOn: 'allowDoubleDown' },
  { key: 'doubleAfterSplit', label: 'Double après un split', kind: 'boolean', section: 'rules', dependsOn: 'allowDoubleDown' },
  { key: 'allowSplit', label: 'Autoriser le split', kind: 'boolean', section: 'rules' },
  { key: 'maxSplits', label: 'Nombre de splits maximum', kind: 'integer', section: 'rules', min: 1, max: 4, dependsOn: 'allowSplit' },
  { key: 'splitAcesOneCard', label: 'Une seule carte par as splitté', kind: 'boolean', section: 'rules', dependsOn: 'allowSplit' },
  { key: 'allowSurrender', label: 'Autoriser l’abandon (surrender tardif)', kind: 'boolean', section: 'rules' },
  { key: 'surrenderRefundPercent', label: 'Part de la mise remboursée à l’abandon (%)', kind: 'percent', section: 'rules', min: 0, max: 100, dependsOn: 'allowSurrender' },
  { key: 'allowInsurance', label: 'Autoriser l’assurance', kind: 'boolean', section: 'rules' },
  { key: 'insuranceMaxPercent', label: 'Assurance maximum (% de la mise)', kind: 'percent', section: 'rules', min: 10, max: 100, dependsOn: 'allowInsurance' },
  { key: 'blackjackBeats21', label: 'Un blackjack bat toujours 21', kind: 'boolean', section: 'rules' },
  { key: 'pushReturnsBet', label: 'Égalité : la mise est rendue', kind: 'boolean', section: 'rules' },
  { key: 'dealerPeeksForBlackjack', label: 'Le donneur vérifie son blackjack avant le jeu', kind: 'boolean', section: 'rules' },

  // ---------- Paiements ----------
  { key: 'blackjackPayout', label: 'Paiement du blackjack', kind: 'select', section: 'payouts', choices: [{ value: '3:2', label: '3:2 (casino)' }, { value: '6:5', label: '6:5' }, { value: '2:1', label: '2:1 (généreux)' }] },
  { key: 'insurancePayout', label: 'Paiement de l’assurance', kind: 'select', section: 'payouts', choices: [{ value: '2:1', label: '2:1' }, { value: '3:1', label: '3:1' }] },
  { key: 'winStreakBonusEnabled', label: 'Bonus de série de victoires', kind: 'boolean', section: 'payouts' },
  { key: 'winStreakBonusPercent', label: 'Bonus par victoire d’affilée (%)', kind: 'percent', section: 'payouts', min: 0, max: 50, dependsOn: 'winStreakBonusEnabled' },
  { key: 'winStreakMaxSteps', label: 'Nombre de victoires prises en compte', kind: 'integer', section: 'payouts', min: 1, max: 10, dependsOn: 'winStreakBonusEnabled' },
  { key: 'loseStreakPityPercent', label: 'Remise après une série de pertes (%)', kind: 'percent', section: 'payouts', min: 0, max: 50, hint: 'Pourcentage de la dernière mise rendue après 3 pertes.' },

  // ---------- Paris annexes ----------
  { key: 'sideBet21Plus3Enabled', label: 'Activer le pari 21+3', kind: 'boolean', section: 'sidebets' },
  { key: 'sideBet21Plus3Payout', label: 'Multiplicateur 21+3 (flush)', kind: 'number', section: 'sidebets', min: 1, max: 100, step: 0.5, dependsOn: 'sideBet21Plus3Enabled' },
  { key: 'perfectPairsEnabled', label: 'Activer « Paire parfaite »', kind: 'boolean', section: 'sidebets' },
  { key: 'perfectPairsPayout', label: 'Multiplicateur de la paire parfaite', kind: 'number', section: 'sidebets', min: 1, max: 100, step: 0.5, dependsOn: 'perfectPairsEnabled' },
  { key: 'sideBetMaxPercent', label: 'Pari annexe maximum (% de la mise)', kind: 'percent', section: 'sidebets', min: 10, max: 100 },

  // ---------- Rythme ----------
  { key: 'turnTimeoutSeconds', label: 'Temps de réflexion (secondes)', kind: 'integer', section: 'pace', min: 15, max: 600 },
  { key: 'autoActionOnTimeout', label: 'Action automatique à la fin du temps', kind: 'select', section: 'pace', choices: [{ value: 'stand', label: 'Rester' }, { value: 'hit', label: 'Tirer' }, { value: 'forfeit', label: 'Abandonner la mise' }] },
  { key: 'warnBeforeTimeoutSeconds', label: 'Avertir X secondes avant la fin', kind: 'integer', section: 'pace', min: 0, max: 120 },
  { key: 'showOdds', label: 'Afficher les probabilités restantes', kind: 'boolean', section: 'pace' },

  // ---------- Affichage ----------
  { key: 'tableColor', label: 'Couleur de la table', kind: 'color', section: 'display' },
  { key: 'cardBack', label: 'Emoji du dos de carte', kind: 'string', section: 'display', maxLength: 8 },
  { key: 'footerText', label: 'Texte du pied de page', kind: 'string', section: 'display', maxLength: 120 },
] as const satisfies readonly FieldDef[];

export type BlackjackConfig = ConfigOf<typeof BLACKJACK_FIELDS>;

export const DEFAULT_BLACKJACK_CONFIG: BlackjackConfig = {
  enabled: true,
  minBet: 25,
  maxBet: 0,
  maxBetPercentOfBalance: 0,
  allowedChannels: [],
  oneGamePerUser: true,
  cooldownSeconds: 5,
  allowQuickBetAliases: true,
  taxPercent: 2,

  decks: 6,
  shufflePenetrationPercent: 75,
  reshuffleEveryHand: false,

  dealerStandsOnSoft17: true,
  allowDoubleDown: true,
  doubleOnAnyTwoCards: true,
  doubleAfterSplit: true,
  allowSplit: true,
  maxSplits: 3,
  splitAcesOneCard: true,
  allowSurrender: true,
  surrenderRefundPercent: 50,
  allowInsurance: true,
  insuranceMaxPercent: 50,
  blackjackBeats21: true,
  pushReturnsBet: true,
  dealerPeeksForBlackjack: true,

  blackjackPayout: '3:2',
  insurancePayout: '2:1',
  winStreakBonusEnabled: true,
  winStreakBonusPercent: 2,
  winStreakMaxSteps: 5,
  loseStreakPityPercent: 10,

  sideBet21Plus3Enabled: true,
  sideBet21Plus3Payout: 9,
  perfectPairsEnabled: true,
  perfectPairsPayout: 12,
  sideBetMaxPercent: 50,

  turnTimeoutSeconds: 90,
  autoActionOnTimeout: 'stand',
  warnBeforeTimeoutSeconds: 20,
  showOdds: true,

  tableColor: '#1E7A4C',
  cardBack: '🂠',
  footerText: 'Limerence • Blackjack',
};

export const BLACKJACK_OPTIONS_COUNT = BLACKJACK_FIELDS.length;

export const BLACKJACK_DEFAULT_VALUES: ConfigValues = { ...DEFAULT_BLACKJACK_CONFIG };
