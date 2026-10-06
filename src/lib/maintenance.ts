import { ChannelType, type Guild } from 'discord.js';
import { updateState } from './store';
import { addLog } from './logs';

export interface ChannelDeletionResult {
  initialCount: number;
  deleted: number;
  failed: Array<{ id: string; name: string; reason: string }>;
}

export function channelDeletionPhrase(guildId: string): string {
  return `SUPPRIMER-${guildId.slice(-6).toUpperCase()}`;
}

/**
 * Supprime tous les salons d'un serveur en deux passes : salons puis catégories.
 * L'appelant doit vérifier une confirmation explicite avant d'appeler cette fonction.
 */
export async function deleteAllGuildChannels(
  guild: Guild,
  source: string,
): Promise<ChannelDeletionResult> {
  await guild.channels.fetch();
  const snapshot = [...guild.channels.cache.values()];
  const ordered = [
    ...snapshot.filter((channel) => channel.type !== ChannelType.GuildCategory),
    ...snapshot.filter((channel) => channel.type === ChannelType.GuildCategory),
  ];
  const result: ChannelDeletionResult = {
    initialCount: ordered.length,
    deleted: 0,
    failed: [],
  };
  const deletedIds = new Set<string>();

  for (const channel of ordered) {
    try {
      await channel.delete(`Limerence Bot — suppression d’urgence demandée par ${source}`);
      result.deleted++;
      deletedIds.add(channel.id);
    } catch (error) {
      result.failed.push({
        id: channel.id,
        name: channel.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await updateState((state) => {
    state.tempRooms = state.tempRooms.filter((room) => !deletedIds.has(room.channelId));
    const resources = state.meta.blueprintResources?.[guild.id];
    if (resources) {
      for (const [key, id] of Object.entries(resources.channelIds)) {
        if (deletedIds.has(id)) delete resources.channelIds[key];
      }
      for (const [key, id] of Object.entries(resources.categoryIds)) {
        if (deletedIds.has(id)) delete resources.categoryIds[key];
      }
      resources.managedChannelOverwrites = (resources.managedChannelOverwrites ?? []).filter((key) => key in resources.channelIds);
      resources.managedCategoryOverwrites = (resources.managedCategoryOverwrites ?? []).filter((key) => key in resources.categoryIds);
    }
  });

  await addLog({
    level: result.failed.length ? 'error' : 'warn',
    source,
    action: 'Suppression d’urgence des salons',
    detail: `${result.deleted}/${result.initialCount} supprimé(s)${result.failed.length ? ` · ${result.failed.length} échec(s)` : ''}`,
  });
  return result;
}
