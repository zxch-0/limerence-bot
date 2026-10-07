import { randomUUID } from 'node:crypto';
import { getState, updateState } from './store';
import { resolveSlotChannel } from './channels';
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

  await updateState((state) => {
    state.logs.unshift(entry);
    const max = Math.max(50, state.config.logs.maxEntries || 500);
    state.logs = state.logs.slice(0, max);
  });

  // miroir Discord (best effort, jamais bloquant)
  if (process.env.LIMERENCE_NO_MIRROR !== '1') {
    void mirrorToDiscord(entry).catch(() => undefined);
  }
  return entry;
}

const ICONS: Record<LogLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '⛔',
  moderation: '🔨',
  economy: '💰',
};

async function mirrorToDiscord(entry: LogEntry): Promise<void> {
  const state = await getState();
  if (!state.config.logs.enabled) return;
  if (!state.config.logs.channelId) return;

  const { getReadyClient } = await import('./discord/client');
  const client = getReadyClient();
  if (!client) return;

  const guildId = state.config.guildId ?? client.guilds.cache.first()?.id;
  if (!guildId) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const channel = await resolveSlotChannel(guild, state.config, 'logs');
  if (!channel) return;

  await channel.send({
    content: `${ICONS[entry.level]} **${entry.action}**${entry.detail ? `\n> ${entry.detail.replace(/\n/g, '\n> ')}` : ''}\n\`${entry.source}\` · <t:${Math.floor(Date.now() / 1000)}:R>`,
    allowedMentions: { parse: [] },
  });
}

export async function getLogs(limit = 100): Promise<LogEntry[]> {
  const state = await getState();
  return state.logs.slice(0, limit);
}
