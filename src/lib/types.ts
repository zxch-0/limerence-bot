// ============================================================
//  Types partagés — bot Discord, panel admin et blueprint
// ============================================================

export type ChannelKind = 'text' | 'voice';

/** Un salon défini dans le blueprint (la "recette" du serveur). */
export interface BlueprintChannel {
  /** identifiant stable utilisé partout (config, panel, bot) */
  key: string;
  kind: ChannelKind;
  /** nom de base : "chat" -> ➥ chat 💬 */
  slug: string;
  /** emoji final (salons texte) ou initial (salons vocaux) */
  emoji: string;
  /** nom affiché pour les vocaux ("Vocal général"). Par défaut : slug */
  label?: string;
  topic?: string;
  /** limite de places (vocaux) — 0 = illimité */
  userLimit?: number;
  /** @everyone ne peut pas écrire */
  readOnly?: boolean;
  /** visible uniquement par les administrateurs */
  adminOnly?: boolean;
  /** salon de création automatique de vocaux (join-to-create) */
  isHub?: boolean;
}

/** Une catégorie du blueprint. */
export interface BlueprintCategory {
  key: string;
  slug: string;
  emoji: string;
  adminOnly?: boolean;
  channels: BlueprintChannel[];
}

export interface RoleConfig {
  name: string;
  /** couleur hexadécimale, blanc par défaut */
  color: string;
  hoist: boolean;
  mentionable: boolean;
  /** attribuer automatiquement à l'arrivée d'un membre */
  autoAssign: boolean;
  /** donner aussi le rôle aux membres déjà présents lors du setup */
  assignToExisting: boolean;
}

export interface JoinToCreateConfig {
  enabled: boolean;
  /** clé du salon hub dans le blueprint */
  hubChannelKey: string;
  /** catégorie où créer les salons temporaires */
  categoryKey: string;
  /** taille par défaut des salons créés (0 = illimité) */
  defaultSize: number;
  /** supprimer le salon quand il est vide */
  autoDelete: boolean;
  /** déplacer automatiquement l'auteur dans son salon */
  moveOwner: boolean;
  /** un salon temporaire par membre maximum */
  onePerMember: boolean;
  /** le propriétaire peut renommer son salon */
  allowRename: boolean;
  /** le propriétaire peut verrouiller son salon */
  allowLock: boolean;
}

export interface ConfessionsConfig {
  enabled: boolean;
  /** salon public où sont publiées les confessions */
  targetChannelKey: string;
  /** salon privé de modération (file d'attente) */
  reviewChannelKey: string;
  /** validation par un admin avant publication */
  requireApproval: boolean;
  /** réactions activées sous les confessions publiées */
  reactions: string[];
  /** délai anti-spam entre deux confessions d'un même membre (secondes) */
  cooldownSeconds: number;
  /** longueur maximale d'une confession */
  maxLength: number;
  /** poster aussi une carte de validation dans le salon de review */
  notifyReviewChannel: boolean;
}

export interface LogsConfig {
  enabled: boolean;
  /** salon Discord qui reçoit les logs de modération */
  channelKey: string;
  /** conserver les logs dans le panel */
  keepInPanel: boolean;
  /** nombre maximum de logs conservés */
  maxEntries: number;
}

export interface AppConfig {
  version: number;
  guildId: string | null;
  /** symbole de préfixe des salons texte : ➥ */
  prefix: string;
  role: RoleConfig;
  categories: BlueprintCategory[];
  /** clé de la catégorie réservée aux admins */
  adminCategoryKey: string;
  joinToCreate: JoinToCreateConfig;
  confessions: ConfessionsConfig;
  logs: LogsConfig;
  /** exécuter le blueprint automatiquement au démarrage du bot si le serveur est vide */
  autoSetupOnBoot: boolean;
}

// ------------------------------------------------------------
//  Confessions
// ------------------------------------------------------------

export type ConfessionStatus = 'pending' | 'published' | 'rejected';

export interface Confession {
  id: string;
  /** id de l'auteur — jamais affiché publiquement */
  authorId: string;
  content: string;
  status: ConfessionStatus;
  createdAt: string;
  handledAt?: string;
  handledBy?: string;
  /** id du message publié dans le salon confessions */
  publishedMessageId?: string;
  publishedChannelId?: string;
  reviewMessageId?: string;
  /** ID du salon de review, distinct du salon public après publication. */
  reviewChannelId?: string;
  rejectionReason?: string;
}

// ------------------------------------------------------------
//  Annonces
// ------------------------------------------------------------

export interface Announcement {
  id: string;
  content: string;
  channelKey: string;
  /** id Discord exact du salon (prioritaire sur channelKey s'il est défini) */
  channelId?: string;
  /** ISO date, vide = envoi immédiat */
  scheduledFor?: string;
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
  createdBy: string;
  sentAt?: string;
  messageId?: string;
  error?: string;
  /** mention @everyone / @here */
  ping?: 'none' | 'everyone' | 'here';
}

// ------------------------------------------------------------
//  Logs
// ------------------------------------------------------------

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'moderation';

export interface LogEntry {
  id: string;
  at: string;
  level: LogLevel;
  /** qui a déclenché l'action ("panel:username", "bot", "commande:/purge") */
  source: string;
  action: string;
  detail?: string;
}

// ------------------------------------------------------------
//  Rapport d'exécution du blueprint
// ------------------------------------------------------------

export type BlueprintStepLevel = 'created' | 'updated' | 'ok' | 'skipped' | 'error';

export interface BlueprintStep {
  level: BlueprintStepLevel;
  target: string;
  message: string;
}

export interface BlueprintReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  steps: BlueprintStep[];
  totals: { created: number; updated: number; ok: number; skipped: number; error: number };
}

// ------------------------------------------------------------
//  Salons vocaux temporaires (join-to-create)
// ------------------------------------------------------------

export interface TempRoom {
  channelId: string;
  ownerId: string;
  createdAt: string;
  /** salon verrouillé par son propriétaire */
  locked: boolean;
  /** membres explicitement autorisés */
  allowed: string[];
  /** membres explicitement exclus */
  denied: string[];
}

// ------------------------------------------------------------
//  État persistant
// ------------------------------------------------------------

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/** Embed enregistrée comme modèle dans le panel ou via Discord. */
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
  /** Salon par défaut pour la publication, si choisi. */
  channelId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface BlueprintResourceIds {
  roleId?: string;
  categoryIds: Record<string, string>;
  channelIds: Record<string, string>;
  /** Clés dont les permission overwrites ont été posées par le blueprint. */
  managedCategoryOverwrites: string[];
  managedChannelOverwrites: string[];
}

export interface StoreState {
  config: AppConfig;
  confessions: Confession[];
  announcements: Announcement[];
  embeds: EmbedTemplate[];
  logs: LogEntry[];
  tempRooms: TempRoom[];
  meta: {
    lastSetupAt?: string;
    lastSetupBy?: string;
    blueprintReport?: BlueprintReport;
    botTag?: string;
    /** IDs des ressources gérées, indexés par serveur puis clé de blueprint. */
    blueprintResources?: Record<string, BlueprintResourceIds>;
  };
}

// ------------------------------------------------------------
//  Retour des actions du panel (server actions)
// ------------------------------------------------------------

export interface ActionState {
  ok: boolean;
  message: string;
}
