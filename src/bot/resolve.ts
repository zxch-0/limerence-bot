import { ChannelType, type Guild, type GuildBasedChannel } from 'discord.js';
import { channelName, findChannel } from '../lib/config';
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
  return (
    guild.channels.cache.find(
      (c) =>
        c.type !== ChannelType.GuildCategory &&
        c.name.toLowerCase().includes(cfg.kind === 'voice' ? (cfg.label ?? cfg.slug).toLowerCase() : `${config.prefix} ${cfg.slug.toLowerCase()}`),
    ) ?? null
  );
}

/** Retrouve un salon du blueprint avec rafraîchissement du cache. */
export async function resolveChannelSafe(
  guild: Guild,
  config: AppConfig,
  key: string,
): Promise<GuildBasedChannel | null> {
  let found = resolveFromCache(guild, config, key);
  if (found) return found;
  await guild.channels.fetch().catch(() => undefined);
  return resolveFromCache(guild, config, key);
}
