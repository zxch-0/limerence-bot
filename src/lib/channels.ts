import { ChannelType, type Guild, type GuildBasedChannel, type GuildTextBasedChannel } from 'discord.js';
import { getState } from './store';
import { CHANNEL_SLOT_META, type AppConfig, type ChannelSlot } from './types';

// ============================================================
//  Résolution des salons
//  Le bot ne crée rien : il utilise les identifiants Discord
//  choisis dans le panel, avec un repli maîtrisé.
// ============================================================

function isSendable(channel: GuildBasedChannel | null | undefined): channel is GuildTextBasedChannel {
  if (!channel) return false;
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

/** Identifiant configuré pour un emplacement ('' si absent). */
export function slotChannelId(config: AppConfig, slot: ChannelSlot): string {
  const value = config.channels[slot];
  return typeof value === 'string' && /^\d{15,25}$/.test(value) ? value : '';
}

/** Destination explicite d'une fonctionnalité, sinon son emplacement partagé. */
export function effectiveSlotChannelId(config: AppConfig, slot: ChannelSlot): string {
  let explicit = '';
  switch (slot) {
    case 'welcome': explicit = config.welcome.channelId; break;
    case 'confessions': explicit = config.confessions.targetChannelId; break;
    case 'confessionReview': explicit = config.confessions.reviewChannelId; break;
    case 'logs': explicit = config.logs.channelId; break;
  }
  const id = explicit.trim();
  return /^\d{15,25}$/.test(id) ? id : slotChannelId(config, slot);
}

/**
 * Change un emplacement et synchronise les destinations explicites historiques.
 * Ne change ni l'activation des fonctions ni les restrictions de commandes.
 */
export function setSlotChannel(config: AppConfig, slot: ChannelSlot, channelId: string): void {
  if (channelId !== '' && !/^\d{15,25}$/.test(channelId)) {
    throw new Error('Identifiant de salon invalide.');
  }
  config.channels[slot] = channelId;
  switch (slot) {
    case 'welcome': config.welcome.channelId = channelId; break;
    case 'confessions': config.confessions.targetChannelId = channelId; break;
    case 'confessionReview': config.confessions.reviewChannelId = channelId; break;
    case 'logs': config.logs.channelId = channelId; break;
  }
}

export function slotConfigured(config: AppConfig, slot: ChannelSlot): boolean {
  return slotChannelId(config, slot) !== '';
}

/** Liste des emplacements non configurés (affichée dans le panel). */
export function missingSlots(config: AppConfig): ChannelSlot[] {
  return (Object.keys(CHANNEL_SLOT_META) as ChannelSlot[]).filter((slot) => !slotConfigured(config, slot));
}

function fromCache(guild: Guild, channelId: string): GuildBasedChannel | null {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) ?? null;
}

/**
 * Retrouve le salon d'un emplacement dans le cache, sans appel réseau.
 * Renvoie null si l'emplacement n'est pas configuré ou si le salon a disparu.
 */
export function resolveSlotFromCache(
  guild: Guild,
  config: AppConfig,
  slot: ChannelSlot,
): GuildTextBasedChannel | null {
  const channel = fromCache(guild, effectiveSlotChannelId(config, slot));
  return isSendable(channel) ? channel : null;
}

export interface ResolveSlotOptions {
  /** repli sur le salon principal puis sur le premier salon texte lisible */
  fallback?: boolean;
  /** rafraîchir le cache des salons avant de chercher */
  refresh?: boolean;
  /** salon utilisé si le bot n'a pas encore reçu le cache */
  voice?: boolean;
}

/**
 * Retrouve le salon d'un emplacement, avec rafraîchissement du cache si besoin.
 * `fallback` autorise le repli sur le salon principal (annonces automatiques,
 * drops d'économie…) ; sans cette option on renvoie null pour ne jamais poster
 * au mauvais endroit.
 */
export async function resolveSlotChannel(
  guild: Guild,
  config: AppConfig,
  slot: ChannelSlot,
  options: ResolveSlotOptions = {},
): Promise<GuildTextBasedChannel | null> {
  const id = effectiveSlotChannelId(config, slot);
  if (id) {
    const cached = fromCache(guild, id);
    if (isSendable(cached)) return cached;
    const fetched = await guild.channels.fetch(id).catch(() => null);
    if (isSendable(fetched)) return fetched;
  }

  if (!options.fallback) return null;

  if (options.refresh) await guild.channels.fetch().catch(() => undefined);

  const fallbackSlots: ChannelSlot[] = ['general', 'announcements', 'economy'];
  for (const candidate of fallbackSlots) {
    if (candidate === slot) continue;
    const channel = resolveSlotFromCache(guild, config, candidate);
    if (channel) return channel;
  }

  const firstText = guild.channels.cache.find((channel) => isSendable(channel));
  return firstText && isSendable(firstText) ? firstText : null;
}

/** Salon configuré pour l'économie (drops, annonces boutique). */
export async function resolveEconomyChannel(
  guild: Guild,
  config: AppConfig,
): Promise<GuildTextBasedChannel | null> {
  return resolveSlotChannel(guild, config, 'economy', { fallback: true, refresh: true });
}

/** Retrouve un salon textuel à partir de son identifiant Discord. */
export async function resolveChannelById(
  guild: Guild,
  channelId: string,
): Promise<GuildTextBasedChannel | null> {
  if (!/^\d{15,25}$/.test(channelId ?? '')) return null;
  const cached = fromCache(guild, channelId);
  if (isSendable(cached)) return cached;
  const fetched = await guild.channels.fetch(channelId).catch(() => null);
  return isSendable(fetched) ? fetched : null;
}

/** Vérifie qu'un identifiant correspond bien à un salon texte du serveur. */
export async function validateTextChannel(guild: Guild, channelId: string): Promise<boolean> {
  if (!/^\d{15,25}$/.test(channelId)) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return isSendable(channel);
}

/** Vérifie qu'un identifiant correspond bien à un salon vocal. */
export async function validateVoiceChannel(guild: Guild, channelId: string): Promise<boolean> {
  if (!/^\d{15,25}$/.test(channelId)) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return Boolean(channel?.isVoiceBased());
}

/** Vérifie qu'un identifiant correspond bien à une catégorie. */
export async function validateCategory(guild: Guild, channelId: string): Promise<boolean> {
  if (!/^\d{15,25}$/.test(channelId)) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return channel?.type === ChannelType.GuildCategory;
}

/** Salon courant d'une configuration, utile pour les replis d'annonces. */
export async function resolveAnyTextChannel(guild: Guild): Promise<GuildTextBasedChannel | null> {
  const state = await getState();
  return resolveSlotChannel(guild, state.config, 'general', { fallback: true, refresh: true });
}
