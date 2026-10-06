'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ChannelType, type Guild, type BaseGuildTextChannel, type VoiceChannel } from 'discord.js';
import { requireAdmin, destroySession } from '@/lib/auth';
import { getGuild, startBot, getClient } from '@/lib/discord/client';
import { applyBlueprint, auditBlueprint } from '@/lib/blueprint';
import { getState, resetConfig, updateState } from '@/lib/store';
import { allChannels } from '@/lib/config';
import { addLog } from '@/lib/logs';
import { parseSchedule, sendAnnouncement } from '@/bot/announcements';
import { publishConfession, rejectConfession } from '@/bot/confessions';
import { banMember, kickMember, lockChannel, purgeMessages, setSlowmode } from '@/bot/moderation';
import { deleteRoom, reconcileTempRooms } from '@/bot/tempRooms';
import { registerCommands } from '@/bot/commands';
import { createEmbedTemplate, publishEmbed } from '@/bot/embeds';
import { channelDeletionPhrase, deleteAllGuildChannels } from '@/lib/maintenance';
import { resolveChannelSafe } from '@/bot/resolve';
import type { ActionState, BlueprintCategory, BlueprintChannel } from '@/lib/types';

// ============================================================
//  Actions du panel d'administration
//  Chaque action vérifie la session admin avant d'agir.
// ============================================================

const NOT_AUTHORIZED: ActionState = { ok: false, message: 'Session admin requise.' };

function fail(message: string): ActionState {
  return { ok: false, message };
}

function refreshAll() {
  revalidatePath('/', 'layout');
}

async function needGuild(): Promise<{ guild: Guild | null; error?: string }> {
  try {
    const guild = await getGuild(false);
    if (!guild) {
      return {
        guild: null,
        error:
          'Le bot n’est pas connecté (mode démo). Ajoute DISCORD_TOKEN et invite le bot sur ton serveur pour agir en direct.',
      };
    }
    return { guild };
  } catch (err) {
    return { guild: null, error: (err as Error).message };
  }
}

const bool = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return v === 'on' || v === 'true' || v === '1';
};

// ------------------------------------------------------------
//  Blueprint / structure
// ------------------------------------------------------------

export async function runBlueprintAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const dryRun = bool(formData, 'apercu');
  const assignRole = bool(formData, 'role_existants');

  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? 'Serveur introuvable.');

  const report = await applyBlueprint(guild, {
    dryRun,
    assignRole,
    source: `panel:${user.username}`,
  });
  refreshAll();

  const summary = `${report.totals.created} créé(s), ${report.totals.updated} à aligner/mis à jour, ${report.totals.ok} conforme(s), ${report.totals.skipped} ignoré(s)${report.totals.error ? `, ${report.totals.error} erreur(s)` : ''}.`;
  return {
    ok: report.totals.error === 0,
    message: report.totals.error
      ? `${summary} Ouvre l’onglet Structure ou lance /setup à nouveau : l’opération est sans doublon.`
      : `${dryRun ? 'Simulation : ' : ''}${summary}${dryRun ? ' Relance sans « simulation » pour appliquer.' : ''}`,
  };
}

export async function deleteAllChannelsAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? 'Serveur introuvable.');

  const expected = channelDeletionPhrase(guild.id);
  if (String(formData.get('confirmation') ?? '').trim() !== expected) {
    return fail(`Confirmation incorrecte. Saisis exactement : ${expected}`);
  }

  try {
    const report = await deleteAllGuildChannels(guild, `panel:${user.username}`);
    refreshAll();
    return {
      ok: report.failed.length === 0,
      message: `${report.deleted}/${report.initialCount} salon(s) supprimé(s).${report.failed.length ? ` ${report.failed.length} échec(s) : vérifie les permissions du bot.` : ' Tu peux maintenant relancer le blueprint.'}`,
    };
  } catch (error) {
    return fail(`La suppression n’a pas pu démarrer : ${(error as Error).message}`);
  }
}

export async function auditAction(): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? '');

  const state = await getState();
  const items = await auditBlueprint(guild, state.config);
  const missing = items.filter((i) => i.status === 'missing').length;
  const outdated = items.filter((i) => i.status === 'outdated').length;
  refreshAll();
  return {
    ok: missing === 0 && outdated === 0,
    message:
      missing === 0 && outdated === 0
        ? `Structure parfaite : ${items.length} éléments vérifiés.`
        : `${missing} manquant(s), ${outdated} à mettre à jour (sur ${items.length} éléments). Lance le déploiement.`,
  };
}

// ------------------------------------------------------------
//  Configuration
// ------------------------------------------------------------

export async function saveChannelsAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const raw = String(formData.get('payload') ?? '');
  let parsed: BlueprintCategory[];
  try {
    parsed = JSON.parse(raw) as BlueprintCategory[];
  } catch {
    return fail('Données invalides.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return fail('Aucune catégorie à enregistrer.');
  if (parsed.length > 50) return fail('Discord autorise au maximum 50 catégories.');
  if (parsed.some((cat) => !cat || typeof cat.key !== 'string' || !cat.key.trim() || typeof cat.slug !== 'string' || !cat.slug.trim() || !Array.isArray(cat.channels))) {
    return fail('Chaque catégorie doit avoir une clé, un nom et une liste de salons valides.');
  }
  if (parsed.some((cat) => cat.channels.length > 50)) return fail('Une catégorie ne peut pas contenir plus de 50 salons.');
  if (parsed.some((cat) => cat.channels.some((channel) => !channel || typeof channel.slug !== 'string' || !channel.slug.trim()))) {
    return fail('Chaque salon doit avoir un nom non vide.');
  }
  const categoryKeys = parsed.map((cat) => cat.key.trim());
  const channelKeys = parsed.flatMap((cat) => cat.channels.map((channel) => String(channel?.key ?? '').trim()));
  if (new Set(categoryKeys).size !== categoryKeys.length || new Set(channelKeys).size !== channelKeys.length) {
    return fail('Les clés de catégories et de salons doivent être uniques.');
  }
  if (categoryKeys.some((key) => !/^[a-z0-9_-]{1,64}$/i.test(key))) {
    return fail('Chaque catégorie doit avoir une clé stable (lettres, chiffres, tirets ou tirets bas).');
  }
  if (channelKeys.some((key) => !/^[a-z0-9_-]{1,64}$/i.test(key))) {
    return fail('Chaque salon doit avoir une clé stable (lettres, chiffres, tirets ou tirets bas).');
  }
  if (parsed.flatMap((cat) => cat.channels).filter((channel) => channel.isHub).length > 1) {
    return fail('Un seul salon peut être configuré comme hub de création vocale.');
  }
  if (parsed.length + parsed.reduce((total, category) => total + category.channels.length, 0) > 500) {
    return fail('Discord autorise au maximum 500 salons et catégories sur un serveur.');
  }

  const cleaned: BlueprintCategory[] = parsed.map((cat, ci) => ({
    key: String(cat.key ?? `cat-${ci}`).trim(),
    slug: String(cat.slug ?? 'categorie').trim().slice(0, 60),
    emoji: String(cat.emoji ?? '📁').slice(0, 8),
    adminOnly: Boolean(cat.adminOnly),
    channels: (Array.isArray(cat.channels) ? cat.channels : []).map((ch, i) => {
      const kind: BlueprintChannel['kind'] = ch.kind === 'voice' ? 'voice' : 'text';
      return {
        key: String(ch.key ?? `${cat.key}-${i}`).trim(),
        kind,
        slug: String(ch.slug ?? 'salon').trim().slice(0, 60),
        emoji: String(ch.emoji ?? '').slice(0, 8),
        label: ch.label ? String(ch.label).slice(0, 60) : undefined,
        topic: ch.topic ? String(ch.topic).slice(0, 200) : undefined,
        userLimit: typeof ch.userLimit === 'number' ? Math.max(0, Math.min(99, ch.userLimit)) : undefined,
        readOnly: Boolean(ch.readOnly),
        adminOnly: Boolean(ch.adminOnly),
        isHub: Boolean(ch.isHub),
      };
    }),
  }));

  await updateState((s) => {
    s.config.categories = cleaned;
  });
  await addLog({
    level: 'info',
    source: `panel:${user.username}`,
    action: 'Structure des salons modifiée',
    detail: `${cleaned.length} catégorie(s), ${cleaned.reduce((n, c) => n + c.channels.length, 0)} salon(s)`,
  });
  refreshAll();
  return { ok: true, message: 'Structure enregistrée. Lance le déploiement pour l’appliquer au serveur.' };
}

export async function saveRoleAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const name = String(formData.get('name') ?? '').trim();
  const color = String(formData.get('color') ?? '#FFFFFF').trim();
  if (!name) return fail('Le nom du rôle est obligatoire.');
  if (name.length > 100) return fail('Le nom du rôle est limité à 100 caractères.');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return fail('Couleur invalide (format #RRGGBB).');

  await updateState((s) => {
    s.config.role = {
      name,
      color: color.toUpperCase(),
      hoist: bool(formData, 'hoist'),
      mentionable: bool(formData, 'mentionable'),
      autoAssign: bool(formData, 'autoAssign'),
      assignToExisting: bool(formData, 'assignToExisting'),
    };
  });
  await addLog({
    level: 'info',
    source: `panel:${user.username}`,
    action: 'Rôle configuré',
    detail: `${name} — ${color.toUpperCase()}`,
  });
  refreshAll();
  return { ok: true, message: `Rôle « ${name} » enregistré. Déploie pour l’appliquer.` };
}

export async function saveGeneralAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const prefix = String(formData.get('prefix') ?? '➥').trim() || '➥';
  const guildId = String(formData.get('guildId') ?? '').trim();
  if (prefix.length > 4) return fail('Le préfixe ne peut pas dépasser 4 caractères.');
  if (guildId && !/^\d{17,20}$/.test(guildId)) return fail('L’identifiant du serveur Discord est invalide.');

  await updateState((s) => {
    s.config.prefix = prefix;
    s.config.guildId = guildId || null;
    s.config.autoSetupOnBoot = bool(formData, 'autoSetupOnBoot');
  });
  refreshAll();
  return { ok: true, message: 'Réglages généraux enregistrés.' };
}

export async function saveVoiceAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const hubChannelKey = String(formData.get('hubChannelKey') ?? 'hub').trim();
  const categoryKey = String(formData.get('categoryKey') ?? 'prives').trim();
  const defaultSize = Math.max(0, Math.min(99, Number(formData.get('defaultSize') ?? 0) || 0));
  const config = (await getState()).config;
  const hub = allChannels(config).find((channel) => channel.key === hubChannelKey);
  if (bool(formData, 'enabled') && (!hub || hub.kind !== 'voice' || !hub.isHub)) return fail('Choisis un salon vocal marqué « rejoindre pour créer » comme hub.');
  if (bool(formData, 'enabled') && !config.categories.some((category) => category.key === categoryKey)) {
    return fail('Choisis une catégorie existante pour les salons temporaires.');
  }

  await updateState((s) => {
    s.config.joinToCreate = {
      enabled: bool(formData, 'enabled'),
      hubChannelKey,
      categoryKey,
      defaultSize,
      autoDelete: bool(formData, 'autoDelete'),
      moveOwner: bool(formData, 'moveOwner'),
      onePerMember: bool(formData, 'onePerMember'),
      allowRename: bool(formData, 'allowRename'),
      allowLock: bool(formData, 'allowLock'),
    };
  });
  refreshAll();
  return { ok: true, message: 'Réglages des vocaux enregistrés.' };
}

export async function saveConfessionsAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const cooldownSeconds = Math.max(0, Number(formData.get('cooldownSeconds') ?? 120) || 0);
  const maxLength = Math.max(50, Math.min(2000, Number(formData.get('maxLength') ?? 900) || 900));
  const reactions = String(formData.get('reactions') ?? '❤️,😮,🥺')
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 6);
  const config = (await getState()).config;
  const textKeys = new Set(allChannels(config).filter((channel) => channel.kind === 'text').map((channel) => channel.key));
  const targetChannelKey = String(formData.get('targetChannelKey') ?? 'confessions').trim();
  const reviewChannelKey = String(formData.get('reviewChannelKey') ?? 'review').trim();
  const logsChannelKey = String(formData.get('logsChannelKey') ?? config.logs.channelKey).trim();
  if (!textKeys.has(targetChannelKey) || !textKeys.has(reviewChannelKey) || !textKeys.has(logsChannelKey)) {
    return fail('Les salons de confessions, de review et de logs doivent exister dans le blueprint et être textuels.');
  }

  await updateState((s) => {
    s.config.confessions = {
      enabled: bool(formData, 'enabled'),
      requireApproval: bool(formData, 'requireApproval'),
      notifyReviewChannel: bool(formData, 'notifyReviewChannel'),
      targetChannelKey: String(formData.get('targetChannelKey') ?? 'confessions').trim(),
      reviewChannelKey: String(formData.get('reviewChannelKey') ?? 'review').trim(),
      cooldownSeconds,
      maxLength,
      reactions,
    };
    s.config.logs = {
      ...s.config.logs,
      enabled: bool(formData, 'logsEnabled'),
      keepInPanel: bool(formData, 'keepInPanel'),
      channelKey: String(formData.get('logsChannelKey') ?? s.config.logs.channelKey).trim(),
      maxEntries: Math.max(50, Math.min(5000, Number(formData.get('maxEntries') ?? 500) || 500)),
    };
  });
  refreshAll();
  return { ok: true, message: 'Confessions et logs enregistrés.' };
}

export async function resetConfigAction(
  _prev: ActionState | null,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  await resetConfig();
  await addLog({
    level: 'warn',
    source: `panel:${user.username}`,
    action: 'Configuration réinitialisée',
    detail: 'Retour au blueprint par défaut',
  });
  refreshAll();
  return { ok: true, message: 'Configuration réinitialisée aux valeurs du blueprint.' };
}

// ------------------------------------------------------------
//  Embeds personnalisés
// ------------------------------------------------------------

export async function createEmbedAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  let fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  const rawFields = String(formData.get('fieldsJson') ?? '[]');
  try {
    const parsed: unknown = JSON.parse(rawFields);
    if (!Array.isArray(parsed)) return fail('Les champs de l’embed sont invalides.');
    fields = parsed as Array<{ name: string; value: string; inline?: boolean }>;
  } catch {
    return fail('Les champs de l’embed sont invalides.');
  }

  const channelId = String(formData.get('channelId') ?? '').trim();
  if (channelId) {
    const { guild, error } = await needGuild();
    if (!guild) return fail(error ?? 'Le bot doit être connecté pour associer un salon.');
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) ||
      !channel.isTextBased()
    ) {
      return fail('Choisis un salon textuel du serveur.');
    }
  }

  const result = await createEmbedTemplate(
    {
      name: String(formData.get('name') ?? ''),
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? ''),
      color: String(formData.get('color') ?? '#FFFFFF'),
      authorName: String(formData.get('authorName') ?? ''),
      authorUrl: String(formData.get('authorUrl') ?? ''),
      authorIconUrl: String(formData.get('authorIconUrl') ?? ''),
      footer: String(formData.get('footer') ?? ''),
      footerIconUrl: String(formData.get('footerIconUrl') ?? ''),
      url: String(formData.get('url') ?? ''),
      imageUrl: String(formData.get('imageUrl') ?? ''),
      thumbnailUrl: String(formData.get('thumbnailUrl') ?? ''),
      fields,
      channelId: channelId || undefined,
    },
    `panel:${user.username}`,
  );
  if (!result.ok || !result.template) return fail(result.message ?? 'Impossible de créer le modèle.');
  refreshAll();
  return { ok: true, message: `Modèle « ${result.template.name} » enregistré. Tu peux le publier ici ou avec /embed publier.` };
}

export async function updateEmbedAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const id = String(formData.get('id') ?? '');
  const template = (await getState()).embeds.find((item) => item.id === id);
  if (!template) return fail('Modèle d’embed introuvable.');
  const channelId = String(formData.get('channelId') ?? '').trim();
  if (channelId) {
    const { guild, error } = await needGuild();
    if (!guild) return fail(error ?? 'Le bot doit être connecté pour associer un salon.');
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      return fail('Choisis un salon textuel du serveur.');
    }
  }
  const result = await (await import('@/bot/embeds')).updateEmbedTemplate(
    id,
    {
      name: String(formData.get('name') ?? ''),
      channelId,
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? ''),
      color: String(formData.get('color') ?? '#FFFFFF'),
      footer: String(formData.get('footer') ?? ''),
      fields: template.fields,
    },
    `panel:${user.username}`,
  );
  if (!result.ok) return fail(result.message ?? 'Modification impossible.');
  refreshAll();
  return { ok: true, message: `Modèle « ${result.template?.name} » modifié.` };
}

export async function publishEmbedAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const id = String(formData.get('id') ?? '');
  const template = (await getState()).embeds.find((item) => item.id === id);
  if (!template) return fail('Modèle d’embed introuvable.');
  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? 'Le bot doit être connecté pour publier.');
  const channelId = String(formData.get('channelId') ?? '').trim() || undefined;
  const result = await publishEmbed(guild, template, channelId, `panel:${user.username}`);
  refreshAll();
  return result.ok ? { ok: true, message: result.message ?? 'Embed publié.' } : fail(result.message ?? 'Publication impossible.');
}

export async function deleteEmbedAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const { removeEmbedTemplate } = await import('@/bot/embeds');
  await removeEmbedTemplate(id, `panel:${user.username}`);
  refreshAll();
}

// ------------------------------------------------------------
//  Annonces
// ------------------------------------------------------------

export async function createAnnouncementAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const content = String(formData.get('content') ?? '').trim();
  if (!content) return fail('Le message est vide.');
  const channelKey = String(formData.get('channelKey') ?? 'announcements');
  const when = String(formData.get('when') ?? '').trim();
  const ping = (String(formData.get('ping') ?? 'none') as 'none' | 'here' | 'everyone') ?? 'none';

  const schedule = parseSchedule(when);
  if (schedule.error) return fail(schedule.error);

  const { createAnnouncement } = await import('@/bot/announcements');
  const created = await createAnnouncement({
    content,
    channelKey,
    scheduledFor: when,
    createdBy: `panel:${user.username}`,
    ping,
  });
  if (!created.ok || !created.announcement) return fail(created.error ?? 'Erreur inconnue.');

  const { guild, error } = await needGuild();
  refreshAll();

  if (schedule.date) {
    return {
      ok: true,
      message: `⏰ Annonce programmée pour le ${schedule.date.toLocaleString('fr-FR')}.`,
    };
  }
  if (!guild) return { ok: true, message: `${error ?? ''} Annonce enregistrée (envoi impossible hors connexion).` };

  const sent = await sendAnnouncement(guild, created.announcement);
  refreshAll();
  return sent
    ? { ok: true, message: '✅ Annonce publiée sur Discord.' }
    : fail('Envoi impossible : vérifie que le salon existe et que le bot y a accès.');
}

export async function sendAnnouncementNowAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const state = await getState();
  const announcement = state.announcements.find((a) => a.id === id);
  if (!announcement) return;
  const { guild } = await needGuild();
  if (guild) await sendAnnouncement(guild, announcement);
  refreshAll();
}

export async function cancelAnnouncementAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const { cancelAnnouncement } = await import('@/bot/announcements');
  await cancelAnnouncement(id);
  refreshAll();
}

export async function deleteAnnouncementAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const { deleteAnnouncement } = await import('@/bot/announcements');
  await deleteAnnouncement(id);
  refreshAll();
}

// ------------------------------------------------------------
//  Confessions
// ------------------------------------------------------------

export async function approveConfessionAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const state = await getState();
  const confession = state.confessions.find((c) => c.id === id);
  const { guild } = await needGuild();
  if (confession && guild) {
    await publishConfession(guild, confession);
    const { markReviewMessageHandled } = await import('@/bot/confessions');
    await markReviewMessageHandled(guild, id, user.id);
  }
  refreshAll();
}

export async function rejectConfessionAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const { guild } = await needGuild();
  if (guild) await rejectConfession(guild, id, user.username);
  refreshAll();
}

export async function deleteConfessionAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  await updateState((s) => {
    s.confessions = s.confessions.filter((c) => c.id !== id);
  });
  await addLog({
    level: 'warn',
    source: `panel:${user.username}`,
    action: 'Confession supprimée du panel',
    detail: id.slice(0, 8),
  });
  refreshAll();
}

// ------------------------------------------------------------
//  Modération
// ------------------------------------------------------------

export async function purgeAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;

  const channelId = String(formData.get('channelId') ?? '');
  const count = Math.max(1, Math.min(100, Number(formData.get('count') ?? 10) || 10));
  const userId = String(formData.get('userId') ?? '').replace(/\D/g, '') || null;

  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? '');
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return fail('Salon introuvable.');

  const deleted = await purgeMessages(
    channel as BaseGuildTextChannel,
    count,
    userId,
    `panel:${user.username}`,
  );
  refreshAll();
  return { ok: true, message: `${deleted} message(s) supprimé(s) de #${channel.name}.` };
}

export async function lockAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const channelId = String(formData.get('channelId') ?? '');
  const mode = String(formData.get('mode') ?? 'lock') === 'unlock' ? false : true;

  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? '');
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement && channel.type !== ChannelType.GuildVoice)) {
    return fail('Salon textuel ou vocal introuvable.');
  }

  await lockChannel(
    channel.type === ChannelType.GuildVoice ? channel as VoiceChannel : channel as BaseGuildTextChannel,
    `panel:${user.username}`,
    mode,
  );
  refreshAll();
  return {
    ok: true,
    message: mode ? `🔒 #${channel.name} verrouillé.` : `🔓 #${channel.name} déverrouillé.`,
  };
}

export async function slowmodeAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const channelId = String(formData.get('channelId') ?? '');
  const seconds = Number(formData.get('seconds') ?? 0);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21_600) {
    return fail('Le délai doit être un nombre entier entre 0 et 21 600 secondes.');
  }

  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? '');
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) return fail('Salon textuel introuvable.');
  try {
    const value = await setSlowmode(channel as BaseGuildTextChannel, seconds, `panel:${user.username}`);
    refreshAll();
    return { ok: true, message: value ? `Slowmode réglé à ${value}s dans #${channel.name}.` : `Slowmode désactivé dans #${channel.name}.` };
  } catch (error) {
    return fail(`Impossible de modifier le slowmode : ${(error as Error).message}`);
  }
}

export async function kickAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const userId = String(formData.get('userId') ?? '').replace(/\D/g, '');
  const reason = String(formData.get('reason') ?? 'Aucune raison fournie');
  if (!userId) return fail('Identifiant du membre manquant.');

  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? '');
  try {
    const member = await guild.members.fetch(userId);
    await kickMember(member, reason, `panel:${user.username}`);
    refreshAll();
    return { ok: true, message: `👋 ${member.user.tag} expulsé.` };
  } catch (err) {
    return fail(`Impossible d’expulser : ${(err as Error).message}`);
  }
}

export async function banAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const userId = String(formData.get('userId') ?? '').replace(/\D/g, '');
  const reason = String(formData.get('reason') ?? 'Aucune raison fournie');
  if (!userId) return fail('Identifiant du membre manquant.');

  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? '');
  try {
    await banMember(guild, userId, reason, `panel:${user.username}`);
    refreshAll();
    return { ok: true, message: `⛔ ${userId} banni.` };
  } catch (err) {
    return fail(`Impossible de bannir : ${(err as Error).message}`);
  }
}

export async function giveRoleAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const userId = String(formData.get('userId') ?? '').replace(/\D/g, '');
  const { guild } = await needGuild();
  if (!guild || !userId) return;
  const state = await getState();
  const member = await guild.members.fetch(userId).catch(() => null);
  const role = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === state.config.role.name.toLowerCase(),
  );
  if (member && role) {
    await member.roles.add(role, `Panel — ${user.username}`).catch(() => undefined);
    await addLog({
      level: 'info',
      source: `panel:${user.username}`,
      action: `Rôle ${role.name} attribué`,
      detail: member.user.tag,
    });
  }
  refreshAll();
}

// ------------------------------------------------------------
//  Vocaux temporaires & bot
// ------------------------------------------------------------

export async function deleteTempRoomAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const channelId = String(formData.get('channelId') ?? '');
  const { guild } = await needGuild();
  if (!guild) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isVoiceBased()) {
    await deleteRoom(channel as VoiceChannel, `Panel — ${user.username}`);
  } else {
    const { forgetRoom } = await import('@/bot/tempRooms');
    await forgetRoom(channelId);
  }
  refreshAll();
}

export async function reconcileRoomsAction(): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const { guild, error } = await needGuild();
  if (!guild) return fail(error ?? '');
  await reconcileTempRooms(guild);
  refreshAll();
  return { ok: true, message: 'Liste des salons temporaires nettoyée.' };
}

export async function restartBotAction(): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return NOT_AUTHORIZED;
  const client = getClient();
  try {
    if (client) {
      await client.destroy();
      const { resetClientState } = await import('@/lib/discord/client');
      resetClientState();
    }
  } catch {
    /* on force le redémarrage dans tous les cas */
  }
  const started = await startBot();
  if (started?.isReady()) {
    await registerCommands(started);
    refreshAll();
    return { ok: true, message: 'Bot reconnecté et commandes réenregistrées.' };
  }
  refreshAll();
  return fail('Reconnexion impossible : vérifie DISCORD_TOKEN et les intents du Dev Portal.');
}

export async function clearLogsAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  if (!user) return;
  const onlyLevel = String(formData.get('level') ?? '');
  await updateState((s) => {
    s.logs = onlyLevel ? s.logs.filter((l) => l.level !== onlyLevel) : [];
  });
  await addLog({
    level: 'warn',
    source: `panel:${user.username}`,
    action: 'Journal purgé',
    detail: onlyLevel ? `niveau ${onlyLevel}` : 'tout le journal',
  });
  refreshAll();
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}


