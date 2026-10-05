import type { Guild } from 'discord.js';
import { getGuild, botStatus } from './discord/client';
import { getState } from './store';
import { channelOptionsFromGuild, demoChannelOptions, demoGuildInfo, guildInfoFromGuild, type ChannelOption, type GuildInfo } from './demo';
import type { AppConfig, StoreState } from './types';

// ============================================================
//  Contexte partagé par les pages du panel
// ============================================================

export interface PanelContext {
  state: StoreState;
  config: AppConfig;
  bot: ReturnType<typeof botStatus>;
  guild: Guild | null;
  info: GuildInfo;
  channels: ChannelOption[];
  /** true si aucune donnée réelle n'est disponible (bot hors ligne) */
  demo: boolean;
}

export async function getContext(): Promise<PanelContext> {
  const state = await getState();
  const bot = botStatus();
  let guild: Guild | null = null;
  try {
    guild = await getGuild(false);
  } catch {
    guild = null;
  }

  return {
    state,
    config: state.config,
    bot,
    guild,
    info: guild ? guildInfoFromGuild(guild) : demoGuildInfo(),
    channels: guild ? channelOptionsFromGuild(guild) : demoChannelOptions(),
    demo: !guild,
  };
}

/** URL d'invitation du bot (permission Administrateur pour tout construire). */
export function inviteUrl(): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: '8',
    scope: 'bot applications.commands',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
