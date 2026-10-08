import { DEFAULT_ECONOMY_CONFIG } from './economy/config';
import { DEFAULT_BLACKJACK_CONFIG } from './blackjack/config';
import { DEFAULT_GAMES_CONFIG } from './games/config';
import { DEFAULT_SHOP_CONFIG } from './shop/config';
import { DEFAULT_MODERATION_CONFIG } from './moderation/config';
import { DEFAULT_UI_CONFIG } from './ui/config';
import { mergeValues } from './schema-fields';
import { CHANNEL_SLOTS, type AppConfig, type ChannelSlots, type StoreState } from './types';

// ============================================================
//  Configuration par défaut + fusion avec l'état sauvegardé
//
//  Règle : la configuration sauvegardée gagne toujours, mais toute
//  nouvelle option introduite par une mise à jour est ajoutée avec
//  sa valeur par défaut. Un état écrit par une ancienne version du
//  bot reste donc utilisable sans migration manuelle.
// ============================================================

export function emptyChannels(): ChannelSlots {
  return CHANNEL_SLOTS.reduce((acc, key) => {
    acc[key] = '';
    return acc;
  }, {} as ChannelSlots);
}

export const DEFAULT_CONFIG: AppConfig = {
  version: 2,
  guildId: process.env.DISCORD_GUILD_ID?.trim() || null,
  channels: emptyChannels(),
  welcome: {
    enabled: true,
    roleId: '',
    channelId: '',
    message:
      'Bienvenue {mention} sur **{server}** ! Tu démarres avec {balance}.\nFais `/daily`, `/work` et `/shop` pour remplir tes poches ✨',
    mentionMember: true,
    directMessage: '',
    assignToExisting: false,
  },
  joinToCreate: {
    enabled: false,
    hubChannelId: '',
    categoryId: '',
    defaultSize: 0,
    autoDelete: true,
    moveOwner: true,
    onePerMember: false,
    allowRename: true,
    allowLock: true,
    nameTemplate: '🔊 {name}',
  },
  confessions: {
    enabled: true,
    targetChannelId: '',
    reviewChannelId: '',
    requireApproval: true,
    reactions: ['❤️', '😮', '🥺'],
    cooldownSeconds: 120,
    maxLength: 900,
    notifyReviewChannel: true,
  },
  logs: {
    enabled: true,
    channelId: '',
    keepInPanel: true,
    maxEntries: 500,
  },
  economy: structuredClone(DEFAULT_ECONOMY_CONFIG),
  blackjack: structuredClone(DEFAULT_BLACKJACK_CONFIG),
  games: structuredClone(DEFAULT_GAMES_CONFIG),
  shop: structuredClone(DEFAULT_SHOP_CONFIG),
  moderation: structuredClone(DEFAULT_MODERATION_CONFIG),
  ui: structuredClone(DEFAULT_UI_CONFIG),
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeObject<T extends object>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return structuredClone(base);
  const result = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeObject(result[key] as object, value);
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = [...value];
      continue;
    }
    result[key] = value;
  }
  return result as T;
}

/**
 * Fusionne une configuration sauvegardée (potentiellement ancienne ou
 * partielle) avec les valeurs par défaut courantes.
 */
export function mergeConfig(base: AppConfig, override: Partial<AppConfig> | undefined): AppConfig {
  if (!override || typeof override !== 'object') return structuredClone(base);

  const merged = mergeObject(base, override);

  // les quatre grandes configurations passent par le moteur de champs :
  // toute option manquante est complétée, toute valeur hors bornes est corrigée
  merged.economy = mergeValues(DEFAULT_ECONOMY_CONFIG, override.economy as never);
  merged.blackjack = mergeValues(DEFAULT_BLACKJACK_CONFIG, override.blackjack as never);
  merged.games = mergeValues(DEFAULT_GAMES_CONFIG, override.games as never);
  merged.shop = mergeValues(DEFAULT_SHOP_CONFIG, override.shop as never);
  merged.moderation = mergeValues(DEFAULT_MODERATION_CONFIG, override.moderation as never);
  merged.ui = mergeValues(DEFAULT_UI_CONFIG, override.ui as never);

  // salon manquant -> emplacement vide
  for (const slot of CHANNEL_SLOTS) {
    if (typeof merged.channels[slot] !== 'string') merged.channels[slot] = '';
  }

  if (!Array.isArray(merged.confessions.reactions)) {
    merged.confessions.reactions = [...DEFAULT_CONFIG.confessions.reactions];
  }
  if (typeof merged.guildId !== 'string') merged.guildId = null;

  return merged;
}

export function emptyState(): StoreState {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    confessions: [],
    announcements: [],
    embeds: [],
    logs: [],
    tempRooms: [],
    accounts: {},
    shopItems: [],
    purchases: [],
    cases: [],
    blackjack: {},
    blackjackStats: {},
    meta: {},
  };
}
