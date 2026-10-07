'use server';

import { ChannelType, type Guild, type GuildBasedChannel } from 'discord.js';
import {
  cancelAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  parseSchedule,
  sendAnnouncement,
} from '@/bot/announcements';
import { markReviewMessageHandled, publishConfession, rejectConfession } from '@/bot/confessions';
import { createEmbedTemplate, publishEmbed, removeEmbedTemplate, updateEmbedTemplate } from '@/bot/embeds';
import { addLog } from '@/lib/logs';
import { getState, updateState } from '@/lib/store';
import { resolveChannelById } from '@/lib/channels';
import type { ActionState, EmbedField } from '@/lib/types';
import {
  currentAdmin,
  fail,
  NOT_AUTHORIZED,
  ok,
  refreshPanel,
  requireGuild,
  snowflake,
  str,
} from '@/lib/panelActions';

// ============================================================
//  Contenu : confessions, annonces et embeds personnalisés.
// ============================================================

type ChannelCheck =
  | { ok: true; guild: Guild; channel: GuildBasedChannel }
  | { ok: false; error: string };

async function requireTextChannel(channelId: string): Promise<ChannelCheck> {
  const guildResult = await requireGuild();
  if ('error' in guildResult) return { ok: false, error: guildResult.error };
  const channel = await resolveChannelById(guildResult.guild, channelId);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    return { ok: false, error: 'Salon textuel introuvable.' };
  }
  return { ok: true, guild: guildResult.guild, channel };
}

function parseFields(formData: FormData): EmbedField[] | { error: string } {
  const raw = str(formData, 'fieldsJson', '[]');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { error: 'Les champs de l’embed sont invalides.' };
    return (parsed as EmbedField[]).slice(0, 25);
  } catch {
    return { error: 'Les champs de l’embed sont invalides.' };
  }
}

// ------------------------------------------------------------
//  Embeds personnalisés
// ------------------------------------------------------------

export async function saveEmbedAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const id = str(formData, 'id');
  const channelId = snowflake(formData, 'channelId');
  if (channelId) {
    const check = await requireTextChannel(channelId);
    if (!check.ok) return fail(check.error);
  }

  const payload = {
    name: str(formData, 'name'),
    title: str(formData, 'title'),
    description: str(formData, 'description'),
    color: str(formData, 'color', '#FFFFFF'),
    authorName: str(formData, 'authorName'),
    authorUrl: str(formData, 'authorUrl'),
    authorIconUrl: str(formData, 'authorIconUrl'),
    footer: str(formData, 'footer'),
    footerIconUrl: str(formData, 'footerIconUrl'),
    url: str(formData, 'url'),
    imageUrl: str(formData, 'imageUrl'),
    thumbnailUrl: str(formData, 'thumbnailUrl'),
    channelId: channelId || undefined,
  };

  if (!id) {
    const fields = parseFields(formData);
    if ('error' in fields) return fail(fields.error);
    const result = await createEmbedTemplate({ ...payload, fields }, `panel:${admin.username}`);
    refreshPanel();
    return result.ok && result.template
      ? ok(`Modèle « ${result.template.name} » enregistré.`)
      : fail(result.message ?? 'Création impossible.');
  }

  const existing = (await getState()).embeds.find((item) => item.id === id);
  if (!existing) return fail('Modèle d’embed introuvable.');
  const result = await updateEmbedTemplate(
    id,
    { ...payload, fields: existing.fields },
    `panel:${admin.username}`,
  );
  refreshPanel();
  return result.ok ? ok(`Modèle « ${result.template?.name ?? payload.name} » modifié.`) : fail(result.message ?? 'Modification impossible.');
}

export async function publishEmbedAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const id = str(formData, 'id');
  const template = (await getState()).embeds.find((item) => item.id === id);
  if (!template) return fail('Modèle d’embed introuvable.');

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);

  const channelId = snowflake(formData, 'channelId') || undefined;
  const result = await publishEmbed(guildResult.guild, template, channelId, `panel:${admin.username}`);
  refreshPanel();
  return result.ok ? ok(result.message ?? 'Embed publié.') : fail(result.message ?? 'Publication impossible.');
}

export async function deleteEmbedAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  await removeEmbedTemplate(str(formData, 'id'), `panel:${admin.username}`);
  refreshPanel();
}

// ------------------------------------------------------------
//  Annonces
// ------------------------------------------------------------

export async function createAnnouncementAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const content = str(formData, 'content');
  if (!content) return fail('Le message est vide.');

  const when = str(formData, 'when');
  const schedule = parseSchedule(when);
  if (schedule.error) return fail(schedule.error);

  const pingRaw = str(formData, 'ping', 'none');
  const ping = pingRaw === 'everyone' || pingRaw === 'here' ? pingRaw : 'none';

  const created = await createAnnouncement({
    content,
    channelId: snowflake(formData, 'channelId'),
    scheduledFor: when,
    createdBy: `panel:${admin.username}`,
    ping,
  });
  if (!created.ok || !created.announcement) return fail(created.error ?? 'Erreur inconnue.');

  refreshPanel();
  if (schedule.date) return ok(`Annonce programmée pour le ${schedule.date.toLocaleString('fr-FR')}.`);

  const guildResult = await requireGuild();
  if ('error' in guildResult) return ok(`Annonce enregistrée (${guildResult.error}).`);

  const sent = await sendAnnouncement(guildResult.guild, created.announcement);
  refreshPanel();
  return sent ? ok('Annonce publiée sur Discord.') : fail('Envoi impossible : vérifie le salon cible et les permissions du bot.');
}

export async function sendAnnouncementNowAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const announcement = (await getState()).announcements.find((item) => item.id === str(formData, 'id'));
  if (!announcement) return;
  const guildResult = await requireGuild();
  if ('error' in guildResult) return;
  await sendAnnouncement(guildResult.guild, announcement);
  refreshPanel();
}

export async function cancelAnnouncementAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  await cancelAnnouncement(str(formData, 'id'));
  refreshPanel();
}

export async function deleteAnnouncementAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  await deleteAnnouncement(str(formData, 'id'));
  refreshPanel();
}

// ------------------------------------------------------------
//  Confessions
// ------------------------------------------------------------

export async function approveConfessionAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const id = str(formData, 'id');
  const confession = (await getState()).confessions.find((item) => item.id === id);
  const guildResult = await requireGuild();
  if (!confession || 'error' in guildResult) return;
  await publishConfession(guildResult.guild, confession);
  await markReviewMessageHandled(guildResult.guild, id, admin.id);
  refreshPanel();
}

export async function rejectConfessionAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const id = str(formData, 'id');
  const guildResult = await requireGuild();
  if ('error' in guildResult) return;
  await rejectConfession(guildResult.guild, id, admin.username);
  refreshPanel();
}

export async function deleteConfessionAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const id = str(formData, 'id');
  await updateState((state) => {
    state.confessions = state.confessions.filter((item) => item.id !== id);
  });
  await addLog({
    level: 'warn',
    source: `panel:${admin.username}`,
    action: 'Confession supprimée du panel',
    detail: id.slice(0, 8),
  });
  refreshPanel();
}
