import { randomUUID } from 'node:crypto';
import { EmbedBuilder, type Guild } from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { resolveChannelSafe } from './resolve';
import type { Announcement } from '../lib/types';

// ============================================================
//  Annonces — envoi immédiat ou programmé (planificateur)
// ============================================================

/**
 * Analyse une date / délai : "30m", "2h", "3j", "2026-10-06T20:00"
 * Renvoie null si l'entrée est vide (= envoi immédiat).
 */
export function parseSchedule(input?: string | null): { date: Date | null; error?: string } {
  const value = input?.trim();
  if (!value) return { date: null };

  const rel = /^(\d+)\s*(s|m|h|j|d)$/i.exec(value);
  if (rel) {
    const amount = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const factor = unit === 's' ? 1_000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return { date: new Date(Date.now() + amount * factor) };
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return { date: parsed };
  return { date: null, error: `Format de date invalide : « ${value} » (ex : 2h, 30m, 2026-10-06T20:00)` };
}

export interface CreateAnnouncementInput {
  content: string;
  channelKey: string;
  /** salon Discord précis (prioritaire sur channelKey) */
  channelId?: string | null;
  scheduledFor?: string | null;
  createdBy: string;
  ping?: Announcement['ping'];
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<{ ok: boolean; announcement?: Announcement; error?: string }> {
  const content = input.content?.trim();
  if (!content) return { ok: false, error: 'Le message est vide.' };

  const { date, error } = parseSchedule(input.scheduledFor);
  if (error) return { ok: false, error };

  const announcement: Announcement = {
    id: randomUUID(),
    content,
    channelKey: input.channelKey,
    channelId: input.channelId ?? undefined,
    scheduledFor: date ? date.toISOString() : undefined,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    ping: input.ping ?? 'none',
  };

  await updateState((s) => {
    s.announcements.unshift(announcement);
    if (s.announcements.length > 200) s.announcements = s.announcements.slice(0, 200);
  });

  await addLog({
    level: 'info',
    source: input.createdBy,
    action: date ? 'Annonce programmée' : 'Annonce créée',
    detail: date ? `Envoi prévu le ${date.toLocaleString('fr-FR')} dans ${input.channelKey}` : `Salon ${input.channelKey}`,
  });

  return { ok: true, announcement };
}

export async function sendAnnouncement(
  guild: Guild,
  announcement: Announcement,
): Promise<boolean> {
  const state = await getState();
  const explicit = announcement.channelId
    ? await guild.channels.fetch(announcement.channelId).catch(() => null)
    : null;
  const channel = explicit ?? (await resolveChannelSafe(guild, state.config, announcement.channelKey));
  if (!channel?.isTextBased()) {
    await updateState((s) => {
      const a = s.announcements.find((x) => x.id === announcement.id);
      if (a) {
        a.status = 'failed';
        a.error = 'Salon introuvable';
      }
    });
    return false;
  }

  const mention =
    announcement.ping === 'everyone'
      ? '@everyone'
      : announcement.ping === 'here'
        ? '@here'
        : null;

  try {
    const message = await channel.send({
      content: mention ?? undefined,
      embeds: [
        new EmbedBuilder()
          .setColor(0xffffff)
          .setAuthor({ name: '📣 Annonce' })
          .setDescription(announcement.content)
          .setFooter({ text: 'Limerence' })
          .setTimestamp(new Date()),
      ],
      allowedMentions: mention ? { parse: ['everyone'] } : { parse: [] },
    });

    await updateState((s) => {
      const a = s.announcements.find((x) => x.id === announcement.id);
      if (a) {
        a.status = 'sent';
        a.sentAt = new Date().toISOString();
        a.messageId = message.id;
        a.error = undefined;
      }
    });

    await addLog({
      level: 'success',
      source: announcement.createdBy,
      action: 'Annonce publiée',
      detail: `#${channel.name}`,
    });
    return true;
  } catch (err) {
    await updateState((s) => {
      const a = s.announcements.find((x) => x.id === announcement.id);
      if (a) {
        a.status = 'failed';
        a.error = (err as Error).message;
      }
    });
    return false;
  }
}

/** Envoie les annonces dont l'heure est arrivée (appelé par le planificateur). */
export async function processDueAnnouncements(guild: Guild): Promise<number> {
  const state = await getState();
  const now = Date.now();
  const due = state.announcements.filter(
    (a) => a.status === 'scheduled' && a.scheduledFor && new Date(a.scheduledFor).getTime() <= now,
  );
  let sent = 0;
  for (const announcement of due) {
    if (await sendAnnouncement(guild, announcement)) sent++;
  }
  return sent;
}

export async function cancelAnnouncement(id: string): Promise<void> {
  await updateState((s) => {
    const a = s.announcements.find((x) => x.id === id);
    if (a && a.status === 'scheduled') a.status = 'cancelled';
  });
  await addLog({ level: 'warn', source: 'panel', action: 'Annonce annulée', detail: id.slice(0, 8) });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await updateState((s) => {
    s.announcements = s.announcements.filter((a) => a.id !== id);
  });
}
