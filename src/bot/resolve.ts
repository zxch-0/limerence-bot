import { ChannelType, type Guild, type GuildBasedChannel } from 'discord.js';
import { channelName, findChannel } from '../lib/config';
import { getState } from '../lib/store';
import type { AppConfig } from '../lib/types';

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Retrouve un salon du blueprint dans le cache du serveur (sans appel réseau). */
export function resolveFromCache(
  guild: Guild,
  config: AppConfig,
  key: string,
): GuildBasedChannel | null {
  const cfg = findChannel(config, key);
  if (!cfg) return null;
  const wanted = channelName(cfg, config.prefix);
  const found = guild.channels.cache.find((c) => sameName(c.name, wanted));
  if (found) return found;
  // repli : même préfixe + slug, emoji différent
  const expectedType = cfg.kind === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
  const slug = cfg.kind === 'voice' ? cfg.label ?? cfg.slug : cfg.slug;
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return (
    guild.channels.cache.find(
      (channel) => channel.type === expectedType && normalize(channel.name).includes(normalize(slug)),
    ) ?? null
  );
}

/** Retrouve un salon du blueprint avec rafraîchissement du cache. */
export async function resolveChannelSafe(
  guild: Guild,
  config: AppConfig,
  key: string,
): Promise<GuildBasedChannel | null> {
  const cfg = findChannel(config, key);
  const mappedId = (await getState()).meta.blueprintResources?.[guild.id]?.channelIds[key];
  if (mappedId) {
    const mapped = await guild.channels.fetch(mappedId).catch(() => null);
    if (mapped && cfg && (cfg.kind === 'voice' ? mapped.isVoiceBased() : mapped.type === ChannelType.GuildText)) {
      return mapped;
    }
  }
  let found = resolveFromCache(guild, config, key);
  if (found) return found;
  await guild.channels.fetch().catch(() => undefined);
  return resolveFromCache(guild, config, key);
}
