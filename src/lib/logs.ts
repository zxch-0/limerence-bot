import { randomUUID } from 'node:crypto';
import { getState, updateState } from './store';
import { findChannel } from './config';
import type { LogEntry, LogLevel } from './types';

// ============================================================
//  Journal des actions (panel + bot)
//  Conservé dans le panel et recopié dans le salon Discord de logs.
// ============================================================

interface AddLogInput {
  level: LogLevel;
  source: string;
  action: string;
  detail?: string;
}

export async function addLog(input: AddLogInput): Promise<LogEntry> {
  const entry: LogEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    level: input.level,
    source: input.source,
    action: input.action,
    detail: input.detail,
  };

  const keep = await updateState((state) => {
    if (!state.config.logs.keepInPanel) {
      state.logs.unshift(entry);
      state.logs = state.logs.slice(0, 50);
      return false;
    }
    state.logs.unshift(entry);
    const max = Math.max(50, state.config.logs.maxEntries || 500);
    state.logs = state.logs.slice(0, max);
    return true;
  });
  void keep;

  // miroir Discord (best effort, jamais bloquant)
  if (process.env.LIMERENCE_NO_MIRROR !== '1') {
    void mirrorToDiscord(entry).catch(() => undefined);
  }
  return entry;
}

async function mirrorToDiscord(entry: LogEntry): Promise<void> {
  const state = await getState();
  if (!state.config.logs.enabled) return;
  const channel = findChannel(state.config, state.config.logs.channelKey);
  if (!channel) return;

  const { getReadyClient } = await import('./discord/client');
  const client = getReadyClient();
  if (!client) return;

  const guildId = state.config.guildId ?? client.guilds.cache.first()?.id;
  if (!guildId) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const { resolveChannel } = await import('./blueprint');
  const discordChannel = await resolveChannel(guild, state.config, channel.key);
  if (!discordChannel?.isTextBased()) return;

  const icons: Record<LogLevel, string> = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '⛔',
    moderation: '🔨',
  };

  await discordChannel.send({
    content: `${icons[entry.level]} **${entry.action}**${entry.detail ? `\n> ${entry.detail.replace(/\n/g, '\n> ')}` : ''}\n\`${entry.source}\` · <t:${Math.floor(Date.now() / 1000)}:R>`,
    allowedMentions: { parse: [] },
  });
}

export async function getLogs(limit = 100): Promise<LogEntry[]> {
  const state = await getState();
  return state.logs.slice(0, limit);
}
