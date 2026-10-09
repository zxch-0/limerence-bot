import type { EconomyConfig } from './economy/config';
import type { BlackjackConfig } from './blackjack/config';
import type { ShopConfig } from './shop/config';
import type { ModerationConfig } from './moderation/config';
import type { UiConfig } from './ui/config';
import type { GamesConfig } from './games/config';

// Les cinq grandes configurations sont décrites dans leur propre module ;
// elles sont réexportées ici pour n'avoir qu'un seul point d'entrée.
export type { EconomyConfig } from './economy/config';
export type { BlackjackConfig } from './blackjack/config';
export type { ShopConfig } from './shop/config';
export type { ModerationConfig } from './moderation/config';
export type { UiConfig } from './ui/config';
export type { GamesConfig } from './games/config';

// ============================================================
//  Types partagés — bot Discord, panel admin, économie, jeux,
//  boutique et modération.
//
//  Le bot ne crée plus aucune structure de serveur : tous les
//  salons utilisés sont des identifiants Discord choisis par
//  l'administrateur (voir ChannelSlot).
// ============================================================

// ------------------------------------------------------------
//  Salons utilisés par le bot
// ------------------------------------------------------------

export const CHANNEL_SLOTS = [
  'logs',
  'moderation',
  'confessions',
  'confessionReview',
  'announcements',
  'welcome',
  'economy',
  'shop',
  'blackjack',
  'rules',
  'general',
] as const;

export type ChannelSlot = (typeof CHANNEL_SLOTS)[number];

/** Identifiant Discord par emplacement ('' = non défini). */
export type ChannelSlots = Record<ChannelSlot, string>;

export interface ChannelSlotMeta {
  key: ChannelSlot;
  label: string;
  emoji: string;
  hint: string;
  /** le bot peut fonctionner sans ce salon */
  optional: boolean;
}

export const CHANNEL_SLOT_META: Record<ChannelSlot, ChannelSlotMeta> = {
  logs: { key: 'logs', label: 'Journal du bot', emoji: '🧾', hint: 'Reçoit le journal des actions (miroir du panel).', optional: true },
  moderation: { key: 'moderation', label: 'Modération', emoji: '🛡️', hint: 'Avertissements, dossiers et alertes d’auto-modération.', optional: true },
  confessions: { key: 'confessions', label: 'Confessions (public)', emoji: '🤫', hint: 'Où sont publiées les confessions anonymes.', optional: true },
  confessionReview: { key: 'confessionReview', label: 'Confessions (file d’attente)', emoji: '🗂️', hint: 'Validation des confessions par l’équipe.', optional: true },
  announcements: { key: 'announcements', label: 'Annonces', emoji: '📣', hint: 'Cible par défaut des annonces.', optional: true },
  welcome: { key: 'welcome', label: 'Bienvenue', emoji: '👋', hint: 'Message d’arrivée et prime d’arrivée.', optional: true },
  economy: { key: 'economy', label: 'Économie', emoji: '💰', hint: 'Drops automatiques et annonces économiques.', optional: true },
  shop: { key: 'shop', label: 'Boutique', emoji: '🛒', hint: 'Vitrine de la boutique (/shop vitrine).', optional: true },
  blackjack: { key: 'blackjack', label: 'Blackjack', emoji: '🃏', hint: 'Salon conseillé pour les tables de jeu.', optional: true },
  rules: { key: 'rules', label: 'Règlement', emoji: '📜', hint: 'Cible de /regles.', optional: true },
  general: { key: 'general', label: 'Salon principal', emoji: '💬', hint: 'Repli pour les messages d’information.', optional: true },
};

// ------------------------------------------------------------
//  Accueil / rôle d'arrivée
// ------------------------------------------------------------

export interface WelcomeConfig {
  enabled: boolean;
  /** rôle existant attribué à l'arrivée (ID Discord) */
  roleId: string;
  /** salon où poster le message d'arrivée (ID Discord, vide = slot welcome) */
  channelId: string;
  message: string;
  mentionMember: boolean;
  directMessage: string;
  /** attribuer le rôle aux membres déjà présents (bouton du panel) */
  assignToExisting: boolean;
}

// ------------------------------------------------------------
//  Vocaux temporaires (join-to-create)
// ------------------------------------------------------------

export interface JoinToCreateConfig {
  enabled: boolean;
  /** salon vocal « rejoindre pour créer » (ID Discord) */
  hubChannelId: string;
  /** catégorie où créer les salons temporaires (ID Discord) */
  categoryId: string;
  defaultSize: number;
  autoDelete: boolean;
  moveOwner: boolean;
  onePerMember: boolean;
  allowRename: boolean;
  allowLock: boolean;
  nameTemplate: string;
}

export interface ConfessionsConfig {
  enabled: boolean;
  /** salon public (ID Discord) */
  targetChannelId: string;
  /** salon de modération (ID Discord) */
  reviewChannelId: string;
  requireApproval: boolean;
  reactions: string[];
  cooldownSeconds: number;
  maxLength: number;
  notifyReviewChannel: boolean;
}

export interface LogsConfig {
  enabled: boolean;
  /** salon Discord de miroir (ID Discord) */
  channelId: string;
  keepInPanel: boolean;
  maxEntries: number;
}

// ------------------------------------------------------------
//  Configuration globale
// ------------------------------------------------------------

export interface AppConfig {
  version: number;
  guildId: string | null;
  channels: ChannelSlots;
  welcome: WelcomeConfig;
  joinToCreate: JoinToCreateConfig;
  confessions: ConfessionsConfig;
  logs: LogsConfig;
  economy: EconomyConfig;
  blackjack: BlackjackConfig;
  /** casino : roulette, coinflip, dés, slots, mines, crash, plinko */
  games: GamesConfig;
  shop: ShopConfig;
  moderation: ModerationConfig;
  /** interface du bot : thème, menu central, cartes */
  ui: UiConfig;
}

// ------------------------------------------------------------
//  Confessions
// ------------------------------------------------------------

export type ConfessionStatus = 'pending' | 'published' | 'rejected';

export interface Confession {
  id: string;
  authorId: string;
  content: string;
  status: ConfessionStatus;
  createdAt: string;
  handledAt?: string;
  handledBy?: string;
  publishedMessageId?: string;
  publishedChannelId?: string;
  reviewMessageId?: string;
  reviewChannelId?: string;
  rejectionReason?: string;
}

// ------------------------------------------------------------
//  Annonces
// ------------------------------------------------------------

export interface Announcement {
  id: string;
  content: string;
  /** ID Discord du salon cible (vide = slot annonces) */
  channelId: string;
  scheduledFor?: string;
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
  createdBy: string;
  sentAt?: string;
  messageId?: string;
  error?: string;
  ping?: 'none' | 'everyone' | 'here';
}

// ------------------------------------------------------------
//  Giveaways (hébergés par l’équipe)
// ------------------------------------------------------------

export type GiveawayStatus = 'active' | 'ended' | 'cancelled';

export interface Giveaway {
  id: string;
  guildId: string;
  /** salon où le message du giveaway est publié */
  channelId: string;
  /** message Discord de l’annonce (bouton « Participer ») */
  messageId?: string;
  /** libellé du lot affiché publiquement */
  prize: string;
  /** complément d’information affiché sous le lot */
  description?: string;
  /** nombre de gagnants tirés à la fin */
  winnerCount: number;
  /** montant crédité à chaque gagnant (0 = lot non monétaire) */
  rewardAmount: number;
  /** date de fin (ISO) : le tirage a lieu à ce moment */
  endsAt: string;
  status: GiveawayStatus;
  createdBy: string;
  createdAt: string;
  endedAt?: string;
  /** identifiants des membres ayant participé (bouton) */
  participants: string[];
  /** identifiants des gagnants tirés */
  winners: string[];
}

// ------------------------------------------------------------
//  Journal
// ------------------------------------------------------------

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'moderation' | 'economy';

export interface LogEntry {
  id: string;
  at: string;
  level: LogLevel;
  source: string;
  action: string;
  detail?: string;
}

// ------------------------------------------------------------
//  Économie
// ------------------------------------------------------------

export type TransactionType =
  | 'start'
  | 'message'
  | 'voice'
  | 'reaction'
  | 'invite'
  | 'join'
  | 'daily'
  | 'work'
  | 'crime'
  | 'rob'
  | 'beg'
  | 'search'
  | 'pay-in'
  | 'pay-out'
  | 'drop'
  | 'bet-win'
  | 'bet-loss'
  | 'game'
  | 'income'
  | 'quest'
  | 'lottery'
  | 'jackpot'
  | 'stock'
  | 'spin'
  | 'crate'
  | 'prestige'
  | 'achievement'
  | 'levelup'
  | 'shop'
  | 'resell'
  | 'interest'
  | 'deposit'
  | 'withdraw'
  | 'admin'
  | 'giveaway'
  | 'reset';

export interface Transaction {
  id: string;
  at: string;
  type: TransactionType;
  /** montant signé (positif = gain) */
  amount: number;
  /** solde total après l'opération (poche + banque) */
  balanceAfter: number;
  label?: string;
}

export interface InventoryItem {
  itemId: string;
  name: string;
  quantity: number;
  boughtAt: string;
  /** fin de l'effet (absent = permanent) */
  expiresAt?: string;
  /** nature de l'effet appliqué tant que l'objet est en inventaire */
  effect?: ShopItemType;
  /** valeur de l'effet (pourcentage pour un booster, heures pour un bouclier) */
  effectValue?: number;
  /** prix payé, utilisé pour la revente */
  paid?: number;
}

export interface EconomyAccount {
  userId: string;
  cash: number;
  bank: number;
  createdAt: string;
  updatedAt: string;
  /** jour courant au format AAAA-MM-JJ, pour les plafonds quotidiens */
  dayStamp: string;
  totalEarned: number;
  totalSpent: number;
  totalWon: number;
  totalLost: number;
  gamesPlayed: number;
  gamesWon: number;
  bestBlackjackWin: number;
  dailyStreak: number;
  workStreak: number;
  winStreak: number;
  lossStreak: number;
  messageStreak: number;
  invitesRewarded: number;
  /** plafonds quotidiens */
  earnedFromMessagesToday: number;
  earnedFromVoiceToday: number;
  paidOutToday: number;
  lostToday: number;
  workToday: number;
  robToday: number;
  begToday: number;
  cooldowns: Partial<Record<string, string>>;
  jailUntil?: string;
  shieldUntil?: string;
  items: InventoryItem[];
  history: Transaction[];
  // ---------- progression (XP, niveaux, prestige) ----------
  xp: number;
  level: number;
  prestige: number;
  /** dernier montant d'XP gagné (pour l'affichage) */
  // ---------- revenus des rôles achetés ----------
  incomeTotal: number;
  lastIncomeClaimAt?: string;
  // ---------- quêtes du jour ----------
  questProgress: Record<string, number>;
  // ---------- loterie ----------
  lotteryTickets: number;
  jackpotWins: number;
  // ---------- bourse ----------
  stocks: Record<string, StockHolding>;
  marketProfit: number;
  // ---------- extras (roue, coffres) ----------
  crates: number;
  cratesOpened: number;
  spinsCount: number;
  lastFreeCrateAt?: string;
  // ---------- succès ----------
  achievements: string[];
}

export interface StockHolding {
  symbol: string;
  /** quantité détenue (peut être fractionnaire) */
  qty: number;
  /** montant total investi (pour le P&L) */
  invested: number;
}

// ------------------------------------------------------------
//  Quêtes quotidiennes
// ------------------------------------------------------------

export type QuestType =
  | 'play_games'
  | 'win_games'
  | 'gain_money'
  | 'spend_money'
  | 'work'
  | 'crime'
  | 'rob'
  | 'daily'
  | 'search'
  | 'income';

export interface QuestDef {
  id: string;
  type: QuestType;
  target: number;
  label: string;
  emoji: string;
  reward: number;
  xp: number;
}

export interface QuestDay {
  dayStamp: string;
  quests: QuestDef[];
}

// ------------------------------------------------------------
//  Loterie
// ------------------------------------------------------------

export interface LotteryDraw {
  id: string;
  at: string;
  winnerId: string | null;
  amount: number;
  tickets: number;
}

export interface LotteryState {
  /** cagnotte progressive : une part des mises alimente le jackpot */
  jackpot: number;
  tickets: Record<string, number>;
  lastDrawAt?: string;
  history: LotteryDraw[];
}

// ------------------------------------------------------------
//  Bourse (actions fictives)
// ------------------------------------------------------------

export interface MarketState {
  prices: Record<string, number>;
  /** historique borné des cours (50 derniers points par symbole) */
  history: Record<string, number[]>;
  lastTickAt?: string;
}

// ------------------------------------------------------------
//  Parties interactives en cours (mines, crash)
// ------------------------------------------------------------

export interface MinesSession {
  kind: 'mines';
  userId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  bet: number;
  mines: number;
  /** true = mine à cette position */
  grid: boolean[];
  revealed: number[];
  cashedOut: boolean;
  finished: boolean;
  createdAt: number;
  timeoutAt: number;
}

export interface CrashSession {
  kind: 'crash';
  userId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  bet: number;
  /** multiplicateur auquel la fusée explose (décidé à l'avance) */
  crashAt: number;
  startedAt: number;
  cashedOut: boolean;
  finished: boolean;
  timeoutAt: number;
}

export type GameSession = MinesSession | CrashSession;

// ------------------------------------------------------------
//  Boutique
// ------------------------------------------------------------

export const SHOP_ITEM_TYPES = ['role', 'income', 'shield', 'booster', 'collectible'] as const;

export type ShopItemType = (typeof SHOP_ITEM_TYPES)[number];

export const SHOP_ITEM_TYPE_LABELS: Record<ShopItemType, string> = {
  role: 'Rôle Discord',
  income: 'Rôle de revenu',
  shield: 'Bouclier anti-vol',
  booster: 'Booster de gains',
  collectible: 'Objet de collection',
};

export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price: number;
  type: ShopItemType;
  /** rôle donné si type = role */
  roleId: string;
  /** effet numérique pour les consommables / boosts */
  effectValue: number;
  /** durée d'effet en heures (0 = permanent) */
  durationHours: number;
  /** stock restant (-1 = illimité) */
  stock: number;
  /** stock initial pour le réassort automatique */
  initialStock: number;
  /** achats maximum par membre (0 = hérite de la config) */
  maxPerUser: number;
  category: string;
  enabled: boolean;
  position: number;
  createdAt: string;
}

export interface ShopPurchase {
  id: string;
  itemId: string;
  itemName: string;
  userId: string;
  price: number;
  tax: number;
  at: string;
}

// ------------------------------------------------------------
//  Blackjack
// ------------------------------------------------------------

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface BlackjackHand {
  cards: Card[];
  bet: number;
  sideBet: number;
  stood: boolean;
  doubled: boolean;
  busted: boolean;
  blackjack: boolean;
  surrendered: boolean;
  /** index de la main d'origine pour les splits d'as */
  fromSplit?: number;
}

export type BlackjackStatus = 'insurance' | 'playing' | 'finished' | 'abandoned';

export interface BlackjackGame {
  id: string;
  guildId: string;
  userId: string;
  channelId: string;
  messageId?: string;
  shoe: Card[];
  drawIndex: number;
  hands: BlackjackHand[];
  activeHand: number;
  splitsUsed: number;
  dealer: Card[];
  holeRevealed: boolean;
  insuranceBet: number;
  insuranceResolved: boolean;
  baseBet: number;
  sideBet: number;
  status: BlackjackStatus;
  createdAt: number;
  updatedAt: number;
  timeoutAt: number;
  firstAction: boolean;
  /** résultat consolidé une fois la partie terminée */
  result?: {
    outcome: 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | 'surrender';
    net: number;
    summary: string;
  };
}

export interface BlackjackStats {
  hands: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  wagered: number;
  returned: number;
  biggestWin: number;
  bestStreak: number;
}

// ------------------------------------------------------------
//  Modération
// ------------------------------------------------------------

export type ModCaseType =
  | 'warn'
  | 'timeout'
  | 'untimeout'
  | 'kick'
  | 'ban'
  | 'unban'
  | 'softban'
  | 'note'
  | 'automod';

export interface ModCase {
  id: string;
  number: number;
  type: ModCaseType;
  guildId: string;
  userId: string;
  userName: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
  /** false quand le dossier a été retiré */
  active: boolean;
  revokedAt?: string;
  revokedBy?: string;
  /** vrai si le MP de notification a bien été envoyé */
  directMessageSent?: boolean;
  /** sanction automatique déclenchée par ce dossier */
  autoAction?: string;
  channelId?: string;
}

// ------------------------------------------------------------
//  Salons vocaux temporaires
// ------------------------------------------------------------

export interface TempRoom {
  channelId: string;
  ownerId: string;
  createdAt: string;
  locked: boolean;
  allowed: string[];
  denied: string[];
}

// ------------------------------------------------------------
//  Embeds personnalisés
// ------------------------------------------------------------

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedTemplate {
  id: string;
  name: string;
  title?: string;
  description?: string;
  color: string;
  authorName?: string;
  authorUrl?: string;
  authorIconUrl?: string;
  footer?: string;
  footerIconUrl?: string;
  url?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  fields: EmbedField[];
  channelId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ------------------------------------------------------------
//  État persistant
// ------------------------------------------------------------

export interface StoreState {
  config: AppConfig;
  confessions: Confession[];
  announcements: Announcement[];
  /** giveaways hébergés par l’équipe */
  giveaways: Giveaway[];
  embeds: EmbedTemplate[];
  logs: LogEntry[];
  tempRooms: TempRoom[];
  /** comptes d'économie indexés par identifiant Discord */
  accounts: Record<string, EconomyAccount>;
  /** articles de la boutique */
  shopItems: ShopItem[];
  /** derniers achats (historique borné) */
  purchases: ShopPurchase[];
  /** dossiers de modération */
  cases: ModCase[];
  /** parties de blackjack en cours, indexées par membre */
  blackjack: Record<string, BlackjackGame>;
  /** statistiques blackjack par membre */
  blackjackStats: Record<string, BlackjackStats>;
  meta: {
    botTag?: string;
    nextCaseNumber?: number;
    lastInterestAt?: string;
    lastRestockAt?: string;
    lastRichestRoleId?: string;
    lastRichestRoleAt?: string;
    lastDropAt?: string;
    activeDrop?: { amount: number; channelId: string; messageId?: string; expiresAt: string; claimedBy?: string };
    installedAt?: string;
    /** sabot de blackjack partagé, indexé par serveur (pénétration réaliste) */
    shoes?: Record<string, { cards: Card[]; index: number }>;
    /** loterie : cagnotte progressive et tickets des membres */
    lottery?: LotteryState;
    /** bourse : cours courants et historique borné */
    market?: MarketState;
    /** quêtes du jour (mêmes pour tout le serveur) */
    quests?: QuestDay;
    /** parties interactives en cours (mines, crash), indexées par membre */
    gameSessions?: Record<string, GameSession>;
  };
}

// ------------------------------------------------------------
//  Retour des actions du panel
// ------------------------------------------------------------

export interface ActionState {
  ok: boolean;
  message: string;
}
