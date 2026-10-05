import type {
  AppConfig,
  BlueprintCategory,
  BlueprintChannel,
  StoreState,
} from './types';

// ============================================================
//  Blueprint Limerence — la structure du serveur
//  Règle : chaque salon TEXTE commence par ➥ et finit par un emoji
// ============================================================

export const DEFAULT_PREFIX = '➥';

/** Nom d'un salon dans Discord à partir d'un salon du blueprint. */
export function channelName(
  channel: BlueprintChannel,
  prefix: string = DEFAULT_PREFIX,
): string {
  if (channel.kind === 'voice') {
    const base = channel.label || channel.slug;
    return channel.emoji ? `${channel.emoji} ${base}` : base;
  }
  return `${prefix} ${channel.slug} ${channel.emoji}`.replace(/\s+/g, ' ').trim();
}

/** Nom "attendu" pour comparer avec l'existant sur le serveur. */
export function expectedName(
  channel: BlueprintChannel,
  config: AppConfig,
): string {
  return channelName(channel, config.prefix);
}

export const DEFAULT_CATEGORIES: BlueprintCategory[] = [
  {
    key: 'infos',
    slug: 'infos',
    emoji: '📋',
    channels: [
      {
        key: 'rules',
        kind: 'text',
        slug: 'règles',
        emoji: '📜',
        topic: 'Les règles du serveur — à lire avant de discuter.',
        readOnly: true,
      },
      {
        key: 'announcements',
        kind: 'text',
        slug: 'annonces',
        emoji: '📣',
        topic: 'Toutes les annonces importantes du serveur.',
        readOnly: true,
      },
      {
        key: 'presentation',
        kind: 'text',
        slug: 'présentation',
        emoji: '👋',
        topic: 'Présente-toi en quelques mots, on veut te connaître !',
      },
    ],
  },
  {
    key: 'accueil',
    slug: 'accueil',
    emoji: '🏠',
    channels: [
      {
        key: 'chat',
        kind: 'text',
        slug: 'chat',
        emoji: '💬',
        topic: 'On discute de tout et de rien ici ✨',
      },
      {
        key: 'confessions',
        kind: 'text',
        slug: 'confessions',
        emoji: '🤫',
        topic: 'Confessions anonymes publiées par le bot. Respect absolu.',
        readOnly: true,
      },
      {
        key: 'photos',
        kind: 'text',
        slug: 'photos',
        emoji: '📸',
        topic: 'Partage tes plus belles photos 🌸',
      },
    ],
  },
  {
    key: 'public',
    slug: 'public',
    emoji: '🌍',
    channels: [
      { key: 'general', kind: 'text', slug: 'general', emoji: '👥', topic: 'Le salon principal du serveur.' },
      { key: 'gaming', kind: 'text', slug: 'gaming', emoji: '🎮', topic: 'Jeux vidéo, teams et sessions.' },
      { key: 'musique', kind: 'text', slug: 'musique', emoji: '🎵', topic: 'Partage tes sons et tes playlists.' },
      { key: 'chill', kind: 'text', slug: 'chill', emoji: '🌙', topic: 'Discussion tranquille, sans prise de tête.' },
      { key: 'vocal-general', kind: 'voice', slug: 'vocal-general', label: 'Vocal général', emoji: '🔊', userLimit: 0 },
      { key: 'vocal-gaming', kind: 'voice', slug: 'vocal-gaming', label: 'Gaming', emoji: '🔊', userLimit: 0 },
      { key: 'vocal-musique', kind: 'voice', slug: 'vocal-musique', label: 'Musique', emoji: '🔊', userLimit: 0 },
      { key: 'vocal-chill', kind: 'voice', slug: 'vocal-chill', label: 'Chill', emoji: '🔊', userLimit: 0 },
    ],
  },
  {
    key: 'prives',
    slug: 'privés',
    emoji: '🔒',
    channels: [
      {
        key: 'hub',
        kind: 'voice',
        slug: 'créer-ton-salon',
        label: 'créer-ton-salon',
        emoji: '➕',
        userLimit: 0,
        isHub: true,
      },
      { key: 'solo', kind: 'voice', slug: 'solo', label: 'solo', emoji: '🔊', userLimit: 1 },
      { key: 'duo', kind: 'voice', slug: 'duo', label: 'duo', emoji: '🔊', userLimit: 2 },
      { key: 'trio', kind: 'voice', slug: 'trio', label: 'trio', emoji: '🔊', userLimit: 3 },
      { key: 'quatuor', kind: 'voice', slug: 'quatuor', label: 'quatuor', emoji: '🔊', userLimit: 4 },
      { key: 'sections', kind: 'voice', slug: 'sections', label: 'sections', emoji: '🔊', userLimit: 0 },
    ],
  },
  {
    key: 'admin',
    slug: 'admin',
    emoji: '🛡️',
    adminOnly: true,
    channels: [
      {
        key: 'logs',
        kind: 'text',
        slug: 'logs-moderation',
        emoji: '🧾',
        topic: 'Journal des actions du bot et du panel.',
        readOnly: true,
        adminOnly: true,
      },
      {
        key: 'review',
        kind: 'text',
        slug: 'confessions-en-attente',
        emoji: '🗂️',
        topic: 'File d’attente des confessions à valider.',
        adminOnly: true,
      },
      {
        key: 'panel',
        kind: 'text',
        slug: 'panel-admin',
        emoji: '🖥️',
        topic: 'Lien vers le panel d’administration du serveur.',
        readOnly: true,
        adminOnly: true,
      },
    ],
  },
];

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  guildId: process.env.DISCORD_GUILD_ID?.trim() || null,
  prefix: DEFAULT_PREFIX,
  role: {
    name: 'limerencien',
    color: '#FFFFFF',
    hoist: false,
    mentionable: false,
    autoAssign: true,
    assignToExisting: true,
  },
  categories: DEFAULT_CATEGORIES,
  adminCategoryKey: 'admin',
  joinToCreate: {
    enabled: true,
    hubChannelKey: 'hub',
    categoryKey: 'prives',
    defaultSize: 0,
    autoDelete: true,
    moveOwner: true,
    onePerMember: false,
    allowRename: true,
    allowLock: true,
  },
  confessions: {
    enabled: true,
    targetChannelKey: 'confessions',
    reviewChannelKey: 'review',
    requireApproval: true,
    reactions: ['❤️', '😮', '🥺'],
    cooldownSeconds: 120,
    maxLength: 900,
    notifyReviewChannel: true,
  },
  logs: {
    enabled: true,
    channelKey: 'logs',
    keepInPanel: true,
    maxEntries: 500,
  },
  autoSetupOnBoot: false,
};

// ------------------------------------------------------------
//  Utilitaires
// ------------------------------------------------------------

export function allChannels(config: AppConfig): Array<BlueprintChannel & { categoryKey: string }> {
  return config.categories.flatMap((c) =>
    c.channels.map((ch) => ({ ...ch, categoryKey: c.key })),
  );
}

export function findChannel(config: AppConfig, key: string): BlueprintChannel | undefined {
  return allChannels(config).find((c) => c.key === key);
}

export function findCategory(config: AppConfig, key: string): BlueprintCategory | undefined {
  return config.categories.find((c) => c.key === key);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fusion profonde : on garde les valeurs de `override` (config sauvegardée)
 * tout en récupérant les nouvelles clés de `base` (défauts après mise à jour).
 * Les tableaux (catégories, salons) sont repris tels quels depuis `override`
 * mais complétés par les salons manquants du blueprint par défaut.
 */
export function mergeConfig(base: AppConfig, override: Partial<AppConfig> | undefined): AppConfig {
  if (!override) return structuredClone(base);

  const merged: AppConfig = {
    ...structuredClone(base),
    ...override,
    role: { ...base.role, ...(override.role ?? {}) },
    joinToCreate: { ...base.joinToCreate, ...(override.joinToCreate ?? {}) },
    confessions: { ...base.confessions, ...(override.confessions ?? {}) },
    logs: { ...base.logs, ...(override.logs ?? {}) },
    categories: base.categories,
  };

  // catégories : on part de l'existant sauvegardé, on ajoute les catégories du
  // blueprint disparues, et on complète chaque catégorie avec les salons manquants
  const savedCats = Array.isArray(override.categories) && override.categories.length
    ? override.categories
    : [];

  if (savedCats.length) {
    const seen = new Set(savedCats.map((c) => c.key));
    const result: BlueprintCategory[] = savedCats.map((saved) => {
      const def = base.categories.find((c) => c.key === saved.key);
      if (!def) return saved;
      const savedChannels = Array.isArray(saved.channels) ? saved.channels : [];
      const missing = def.channels.filter((dc) => !savedChannels.some((sc) => sc.key === dc.key));
      return { ...def, ...saved, channels: [...savedChannels, ...missing] };
    });
    for (const def of base.categories) {
      if (!seen.has(def.key)) result.push(structuredClone(def));
    }
    merged.categories = result;
  }

  return merged;
}

export function emptyState(): StoreState {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    confessions: [],
    announcements: [],
    logs: [],
    tempRooms: [],
    meta: {},
  };
}
