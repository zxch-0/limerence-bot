import type { ConfigOf, ConfigValues, FieldDef, SectionDef } from '../schema-fields';

// ============================================================
//  Modération — configuration complète (48 options)
//  Avertissements (avec MP), sanctions automatiques, automod
//  et protection anti-raid.
// ============================================================

export const MODERATION_SECTIONS = [
  { id: 'warn', label: 'Avertissements', emoji: '⚠️', description: 'Règles des warns, message privé envoyé au membre, sanctions automatiques.' },
  { id: 'cases', label: 'Dossiers & journal', emoji: '📁', description: 'Numérotation des cas, salon de modération, conservation.' },
  { id: 'sanctions', label: 'Sanctions', emoji: '🔨', description: 'Durées par défaut, MP systématique, limites.' },
  { id: 'automod', label: 'Auto-modération', emoji: '🤖', description: 'Filtres automatiques appliqués à chaque message.' },
  { id: 'raid', label: 'Anti-raid', emoji: '🚨', description: 'Détection des arrivées en masse et des comptes récents.' },
] as const satisfies readonly SectionDef[];

export const MODERATION_FIELDS = [
  // ---------- Avertissements ----------
  { key: 'warnEnabled', label: 'Activer le système d’avertissements', kind: 'boolean', section: 'warn' },
  { key: 'warnDirectMessage', label: 'Prévenir le membre en MP', kind: 'boolean', section: 'warn', hint: 'Le MP contient le serveur, le modérateur, la raison et le nombre total d’avertissements.' },
  { key: 'warnDirectMessageOnFail', label: 'Signaler dans le salon de modération si le MP échoue', kind: 'boolean', section: 'warn', dependsOn: 'warnDirectMessage' },
  { key: 'warnReasonRequired', label: 'Raison obligatoire', kind: 'boolean', section: 'warn' },
  { key: 'warnReasonMinLength', label: 'Longueur minimale de la raison', kind: 'integer', section: 'warn', min: 0, max: 200 },
  { key: 'warnReasonMaxLength', label: 'Longueur maximale de la raison', kind: 'integer', section: 'warn', min: 5, max: 500 },
  { key: 'warnNotifyChannel', label: 'Annoncer chaque warn dans le salon de modération', kind: 'boolean', section: 'warn' },
  { key: 'warnConfirmBefore', label: 'Demander une confirmation avant de warn', kind: 'boolean', section: 'warn' },
  { key: 'warnDecayEnabled', label: 'Expiration automatique des warns', kind: 'boolean', section: 'warn' },
  { key: 'warnDecayDays', label: 'Un warn expire après X jours', kind: 'integer', section: 'warn', min: 1, max: 3650, dependsOn: 'warnDecayEnabled' },
  { key: 'warnTimeoutEnabled', label: 'Mute automatique selon le nombre de warns', kind: 'boolean', section: 'warn' },
  { key: 'warnTimeoutThreshold', label: 'Nombre de warns avant mute', kind: 'integer', section: 'warn', min: 1, max: 20, dependsOn: 'warnTimeoutEnabled' },
  { key: 'warnTimeoutMinutes', label: 'Durée du mute (minutes)', kind: 'minutes', section: 'warn', min: 1, max: 40_320, dependsOn: 'warnTimeoutEnabled' },
  { key: 'warnKickEnabled', label: 'Expulsion automatique', kind: 'boolean', section: 'warn' },
  { key: 'warnKickThreshold', label: 'Nombre de warns avant expulsion', kind: 'integer', section: 'warn', min: 1, max: 20, dependsOn: 'warnKickEnabled' },
  { key: 'warnBanEnabled', label: 'Bannissement automatique', kind: 'boolean', section: 'warn' },
  { key: 'warnBanThreshold', label: 'Nombre de warns avant bannissement', kind: 'integer', section: 'warn', min: 1, max: 25, dependsOn: 'warnBanEnabled' },
  { key: 'warnDeleteMessage', label: 'Supprimer le message sanctionné', kind: 'boolean', section: 'warn' },
  { key: 'warnMaxPerUser', label: 'Nombre maximum de warns conservés (0 = illimité)', kind: 'integer', section: 'warn', min: 0, max: 200 },
  { key: 'warnHierarchyCheck', label: 'Refuser de warn au-dessus de son grade', kind: 'boolean', section: 'warn' },

  // ---------- Dossiers ----------
  { key: 'caseNumberEnabled', label: 'Numéroter les dossiers', kind: 'boolean', section: 'cases' },
  { key: 'caseNumberPrefix', label: 'Préfixe des numéros de dossier', kind: 'string', section: 'cases', maxLength: 8 },
  { key: 'caseLogToChannel', label: 'Créer un embed de dossier dans le salon de modération', kind: 'boolean', section: 'cases' },
  { key: 'caseKeepDays', label: 'Conserver les dossiers X jours (0 = toujours)', kind: 'integer', section: 'cases', min: 0, max: 3650 },
  { key: 'caseShowInUserInfo', label: 'Afficher le dossier dans /userinfo', kind: 'boolean', section: 'cases' },
  { key: 'casePingRoleId', label: 'Rôle alerté pour les cas graves (vide = aucun)', kind: 'roleOne', section: 'cases' },

  // ---------- Sanctions ----------
  { key: 'directMessageOnSanction', label: 'Prévenir le membre en MP pour chaque sanction', kind: 'boolean', section: 'sanctions' },
  { key: 'defaultTimeoutMinutes', label: 'Durée de mute par défaut (minutes)', kind: 'minutes', section: 'sanctions', min: 1, max: 40_320 },
  { key: 'maxTimeoutHours', label: 'Durée de mute maximale (heures)', kind: 'hours', section: 'sanctions', min: 1, max: 672 },
  { key: 'banDeleteMessageDays', label: 'Jours de messages supprimés au ban', kind: 'integer', section: 'sanctions', min: 0, max: 7 },
  { key: 'softbanDeleteDays', label: 'Jours de messages supprimés au softban', kind: 'integer', section: 'sanctions', min: 0, max: 7 },
  { key: 'purgeMaxMessages', label: 'Limite de /purge en une commande', kind: 'integer', section: 'sanctions', min: 1, max: 1000 },
  { key: 'requireReasonForBan', label: 'Raison obligatoire pour ban/kick', kind: 'boolean', section: 'sanctions' },
  { key: 'allowModeratingBots', label: 'Autoriser la modération des bots', kind: 'boolean', section: 'sanctions' },
  { key: 'protectRoleIds', label: 'Rôles protégés (jamais sanctionnables)', kind: 'role', section: 'sanctions', maxItems: 10 },

  // ---------- Auto-modération ----------
  { key: 'automodEnabled', label: 'Activer l’auto-modération', kind: 'boolean', section: 'automod' },
  { key: 'automodAction', label: 'Action appliquée', kind: 'select', section: 'automod', choices: [{ value: 'delete', label: 'Supprimer le message' }, { value: 'warn', label: 'Supprimer + avertir' }, { value: 'timeout', label: 'Supprimer + mute' }, { value: 'kick', label: 'Supprimer + expulser' }, { value: 'ban', label: 'Supprimer + bannir' }] },
  { key: 'automodTimeoutMinutes', label: 'Durée du mute automatique (minutes)', kind: 'minutes', section: 'automod', min: 1, max: 40_320 },
  { key: 'automodBlockLinks', label: 'Bloquer les liens', kind: 'boolean', section: 'automod' },
  { key: 'automodLinkWhitelist', label: 'Domaines autorisés', kind: 'list', section: 'automod', maxItems: 40, dependsOn: 'automodBlockLinks' },
  { key: 'automodBlockInvites', label: 'Bloquer les invitations Discord', kind: 'boolean', section: 'automod' },
  { key: 'automodBlockMassMentions', label: 'Bloquer le spam de mentions', kind: 'boolean', section: 'automod' },
  { key: 'automodMaxMentions', label: 'Nombre de mentions maximum', kind: 'integer', section: 'automod', min: 1, max: 50, dependsOn: 'automodBlockMassMentions' },
  { key: 'automodBlockCaps', label: 'Bloquer les messages en majuscules', kind: 'boolean', section: 'automod' },
  { key: 'automodCapsPercent', label: 'Seuil de majuscules (%)', kind: 'percent', section: 'automod', min: 30, max: 100, dependsOn: 'automodBlockCaps' },
  { key: 'automodCapsMinLength', label: 'Longueur minimale pour vérifier les majuscules', kind: 'integer', section: 'automod', min: 5, max: 500, dependsOn: 'automodBlockCaps' },
  { key: 'automodBlockDuplicates', label: 'Bloquer les messages répétés', kind: 'boolean', section: 'automod' },
  { key: 'automodDuplicateWindowSeconds', label: 'Fenêtre de détection (secondes)', kind: 'integer', section: 'automod', min: 5, max: 600, dependsOn: 'automodBlockDuplicates' },
  { key: 'automodMaxLength', label: 'Longueur maximale d’un message (0 = illimité)', kind: 'integer', section: 'automod', min: 0, max: 4000 },
  { key: 'automodMaxEmojis', label: 'Nombre maximum d’emojis (0 = illimité)', kind: 'integer', section: 'automod', min: 0, max: 100 },
  { key: 'automodBannedWords', label: 'Mots interdits', kind: 'list', section: 'automod', maxItems: 200 },
  { key: 'automodIgnoredRoles', label: 'Rôles exemptés', kind: 'role', section: 'automod', maxItems: 15 },
  { key: 'automodIgnoredChannels', label: 'Salons exemptés', kind: 'channel', section: 'automod', maxItems: 25 },

  // ---------- Anti-raid ----------
  { key: 'raidProtectionEnabled', label: 'Activer la protection anti-raid', kind: 'boolean', section: 'raid' },
  { key: 'raidJoinThreshold', label: 'Arrivées déclenchant l’alerte', kind: 'integer', section: 'raid', min: 2, max: 100, dependsOn: 'raidProtectionEnabled' },
  { key: 'raidJoinWindowSeconds', label: 'Fenêtre de comptage (secondes)', kind: 'integer', section: 'raid', min: 5, max: 600, dependsOn: 'raidProtectionEnabled' },
  { key: 'raidLockdown', label: 'Verrouiller automatiquement les salons', kind: 'boolean', section: 'raid', dependsOn: 'raidProtectionEnabled' },
  { key: 'raidLockdownMinutes', label: 'Durée du verrouillage (minutes)', kind: 'minutes', section: 'raid', min: 1, max: 1440, dependsOn: 'raidLockdown' },
  { key: 'raidMinAccountAgeDays', label: 'Expulser les comptes de moins de X jours (0 = jamais)', kind: 'integer', section: 'raid', min: 0, max: 365, dependsOn: 'raidProtectionEnabled' },
] as const satisfies readonly FieldDef[];

export type ModerationConfig = ConfigOf<typeof MODERATION_FIELDS>;

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  warnEnabled: true,
  warnDirectMessage: true,
  warnDirectMessageOnFail: true,
  warnReasonRequired: true,
  warnReasonMinLength: 3,
  warnReasonMaxLength: 300,
  warnNotifyChannel: true,
  warnConfirmBefore: false,
  warnDecayEnabled: true,
  warnDecayDays: 90,
  warnTimeoutEnabled: true,
  warnTimeoutThreshold: 3,
  warnTimeoutMinutes: 60,
  warnKickEnabled: true,
  warnKickThreshold: 5,
  warnBanEnabled: true,
  warnBanThreshold: 7,
  warnDeleteMessage: false,
  warnMaxPerUser: 0,
  warnHierarchyCheck: true,

  caseNumberEnabled: true,
  caseNumberPrefix: 'CAS-',
  caseLogToChannel: true,
  caseKeepDays: 0,
  caseShowInUserInfo: true,
  casePingRoleId: '',

  directMessageOnSanction: true,
  defaultTimeoutMinutes: 10,
  maxTimeoutHours: 168,
  banDeleteMessageDays: 1,
  softbanDeleteDays: 7,
  purgeMaxMessages: 200,
  requireReasonForBan: true,
  allowModeratingBots: false,
  protectRoleIds: [],

  automodEnabled: true,
  automodAction: 'warn',
  automodTimeoutMinutes: 10,
  automodBlockLinks: false,
  automodLinkWhitelist: ['youtube.com', 'discord.com', 'tenor.com', 'giphy.com'],
  automodBlockInvites: true,
  automodBlockMassMentions: true,
  automodMaxMentions: 5,
  automodBlockCaps: true,
  automodCapsPercent: 70,
  automodCapsMinLength: 20,
  automodBlockDuplicates: true,
  automodDuplicateWindowSeconds: 60,
  automodMaxLength: 0,
  automodMaxEmojis: 0,
  automodBannedWords: [],
  automodIgnoredRoles: [],
  automodIgnoredChannels: [],

  raidProtectionEnabled: true,
  raidJoinThreshold: 8,
  raidJoinWindowSeconds: 20,
  raidLockdown: true,
  raidLockdownMinutes: 30,
  raidMinAccountAgeDays: 0,
};

export const MODERATION_OPTIONS_COUNT = MODERATION_FIELDS.length;

export const MODERATION_DEFAULT_VALUES: ConfigValues = { ...DEFAULT_MODERATION_CONFIG };
