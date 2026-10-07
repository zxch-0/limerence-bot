import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type BaseGuildTextChannel,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type GuildTextBasedChannel,
  type User,
  type VoiceChannel,
} from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { accentColor } from './ui';
import { resolveSlotChannel } from '../lib/channels';
import {
  activeWarns,
  buildDirectMessage,
  caseLabel,
  caseLabelFromConfig,
  CASE_TYPE_EMOJI,
  CASE_TYPE_LABELS,
  createCase,
  nextAutoAction,
  type AutoAction,
} from '../lib/moderation/cases';
import type { ModCase, ModCaseType } from '../lib/types';

// ============================================================
//  Modération — primitives utilisées par les commandes slash,
//  les boutons et le panel. Chaque sanction crée un dossier,
//  prévient le membre en MP et peut déclencher une sanction
//  automatique selon le nombre d'avertissements actifs.
// ============================================================

export interface Moderator {
  id: string;
  name: string;
}

export async function sendDirectMessage(user: User, content: string): Promise<boolean> {
  try {
    await user.send({ content: content.slice(0, 1900), allowedMentions: { parse: [] } });
    return true;
  } catch {
    try {
      const dm = await user.createDM();
      await dm.send({ content: content.slice(0, 1900), allowedMentions: { parse: [] } });
      return true;
    } catch {
      return false;
    }
  }
}

export async function moderationChannel(guild: Guild): Promise<GuildTextBasedChannel | null> {
  const state = await getState();
  return (
    (await resolveSlotChannel(guild, state.config, 'moderation')) ??
    (await resolveSlotChannel(guild, state.config, 'logs', { fallback: true }))
  );
}

function caseEmbed(
  modCase: ModCase,
  extra: Record<string, string> = {},
  ui?: import('../lib/types').UiConfig,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(
      ui?.caseUseTheme
        ? accentColor(ui)
        : modCase.type === 'ban'
          ? 0xff5c5c
          : modCase.type === 'warn'
            ? 0xffc94d
            : 0x9ff0dc,
    )
    .setAuthor({ name: `${CASE_TYPE_EMOJI[modCase.type]} ${CASE_TYPE_LABELS[modCase.type]}` })
    .setDescription(modCase.reason)
    .addFields(
      { name: 'Membre', value: `<@${modCase.userId}> \`${modCase.userId}\``, inline: true },
      { name: 'Modérateur', value: modCase.moderatorName, inline: true },
      { name: 'Dossier', value: `\`${caseLabel(modCase)}\``, inline: true },
    )
    .setTimestamp(new Date(modCase.createdAt));
  for (const [name, value] of Object.entries(extra)) {
    embed.addFields({ name, value, inline: true });
  }
  if (modCase.expiresAt) {
    embed.addFields({
      name: 'Expiration',
      value: `<t:${Math.floor(new Date(modCase.expiresAt).getTime() / 1000)}:F>`,
      inline: true,
    });
  }
  return embed;
}

export async function postCaseToChannel(
  guild: Guild,
  modCase: ModCase,
  options: { directMessageSent?: boolean; autoAction?: AutoAction; warnCount?: number } = {},
): Promise<void> {
  const state = await getState();
  if (!state.config.moderation.caseLogToChannel) return;
  const channel = await moderationChannel(guild);
  if (!channel) return;

  const extra: Record<string, string> = {};
  if (typeof options.directMessageSent === 'boolean') {
    extra['MP envoyé'] = options.directMessageSent ? '✅ oui' : '❌ non (MP fermés ?)';
  }
  if (typeof options.warnCount === 'number') extra['Avertissements'] = String(options.warnCount);
  if (options.autoAction && options.autoAction !== 'none') {
    extra['Sanction auto'] =
      options.autoAction === 'timeout' ? '🔇 mute' : options.autoAction === 'kick' ? '👢 expulsion' : '⛔ ban';
  }

  const content = state.config.moderation.casePingRoleId
    ? `<@&${state.config.moderation.casePingRoleId}>`
    : undefined;

  await channel
    .send({
      content,
      embeds: [caseEmbed(modCase, extra, state.config.ui)],
      allowedMentions: { roles: state.config.moderation.casePingRoleId ? [state.config.moderation.casePingRoleId] : [] },
    })
    .catch(() => undefined);
}

// ------------------------------------------------------------
//  Avertissements
// ------------------------------------------------------------

export interface WarnInput {
  guild: Guild;
  target: GuildMember;
  reason: string;
  moderator: Moderator;
  evidence?: string;
  notifyChannel?: boolean;
}

export interface WarnResult {
  ok: boolean;
  message: string;
  modCase?: ModCase;
  warnCount?: number;
  autoAction?: AutoAction;
  directMessageSent?: boolean;
}

export async function warnMember(input: WarnInput): Promise<WarnResult> {
  const { guild, target, reason, moderator } = input;
  const state = await getState();
  const config = state.config.moderation;
  if (!config.warnEnabled) return { ok: false, message: 'Le système d’avertissements est désactivé.' };

  const now = new Date();
  const expiresAt =
    config.warnDecayEnabled && config.warnDecayDays > 0
      ? new Date(now.getTime() + config.warnDecayDays * 86_400_000).toISOString()
      : undefined;

  // 1) dossier
  const modCase = await updateState((s) =>
    createCase(s, {
      guildId: guild.id,
      type: 'warn',
      userId: target.id,
      userName: target.user.tag ?? target.displayName,
      moderatorId: moderator.id,
      moderatorName: moderator.name,
      reason,
      expiresAt,
      channelId: input.evidence,
    }),
  );

  const warns = await updateState((s) => activeWarns(s, target.id, s.config.moderation, now).length);
  const autoAction = nextAutoAction(config, warns);

  // 2) message privé
  let directMessageSent: boolean | undefined;
  if (config.warnDirectMessage) {
    const content = buildDirectMessage({
      guildName: guild.name,
      type: 'warn',
      reason,
      moderatorName: moderator.name,
      warnCount: warns,
      autoAction,
      expiresAt,
      timeoutMinutes: config.warnTimeoutMinutes,
    });
    directMessageSent = await sendDirectMessage(target.user, content);
    if (directMessageSent === false && config.warnDirectMessageOnFail) {
      const channel = await moderationChannel(guild);
      await channel
        ?.send({
          content: `⚠️ Impossible d’envoyer le MP à <@${target.id}> (messages privés fermés). Avertissement ${caseLabelFromConfig(modCase, config)} enregistré quand même.`,
          allowedMentions: { parse: ['users'] },
        })
        .catch(() => undefined);
    }
  }

  // 3) sanction automatique
  if (autoAction !== 'none') {
    await applyAutoAction(guild, target, autoAction, moderator, `Sanction automatique (${warns} avertissements)`);
  }

  // 4) traces
  if (config.warnNotifyChannel || input.notifyChannel) {
    await postCaseToChannel(guild, modCase, { directMessageSent, autoAction, warnCount: warns });
  }
  await addLog({
    level: 'moderation',
    source: `modérateur:${moderator.name}`,
    action: 'Avertissement',
    detail: `${target.user.tag ?? target.displayName} — ${reason} (${warns} actif(s))`,
  });

  const parts = [`⚠️ **${target.displayName}** a reçu un avertissement (${warns} actif(s)).`];
  if (directMessageSent) parts.push('📩 Le membre a été prévenu en MP.');
  else if (directMessageSent === false) parts.push('📩 MP non remis (messages privés fermés).');
  if (autoAction !== 'none') {
    parts.push(
      `🤖 Sanction automatique appliquée : ${autoAction === 'timeout' ? 'mute' : autoAction === 'kick' ? 'expulsion' : 'bannissement'}.`,
    );
  }
  return { ok: true, message: parts.join('\n'), modCase, warnCount: warns, autoAction, directMessageSent };
}

export async function applyAutoAction(
  guild: Guild,
  target: GuildMember,
  action: AutoAction,
  moderator: Moderator,
  reason: string,
): Promise<string | null> {
  const state = await getState();
  const config = state.config.moderation;
  try {
    if (action === 'timeout') {
      const minutes = Math.max(1, config.warnTimeoutMinutes);
      await target.timeout(Math.min(minutes, 40_320) * 60_000, reason);
      await updateState((s) =>
        createCase(s, {
          guildId: guild.id,
          type: 'timeout',
          userId: target.id,
          userName: target.user.tag ?? target.displayName,
          moderatorId: 'auto',
          moderatorName: 'Automatique',
          reason,
          expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          autoAction: 'timeout',
        }),
      );
      if (config.directMessageOnSanction) {
        await sendDirectMessage(
          target.user,
          buildDirectMessage({
            guildName: guild.name,
            type: 'timeout',
            reason,
            moderatorName: 'Automatique',
            warnCount: 0,
            expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
          }),
        );
      }
      return `🔇 Mute de ${minutes} minute(s).`;
    }
    if (action === 'kick') {
      await target.kick(reason);
      await updateState((s) =>
        createCase(s, {
          guildId: guild.id,
          type: 'kick',
          userId: target.id,
          userName: target.user.tag ?? target.displayName,
          moderatorId: 'auto',
          moderatorName: 'Automatique',
          reason,
        }),
      );
      return '👢 Membre expulsé.';
    }
    if (action === 'ban') {
      await guild.members.ban(target.id, {
        reason,
        deleteMessageSeconds: config.banDeleteMessageDays * 86_400,
      });
      await updateState((s) =>
        createCase(s, {
          guildId: guild.id,
          type: 'ban',
          userId: target.id,
          userName: target.user.tag ?? target.displayName,
          moderatorId: 'auto',
          moderatorName: 'Automatique',
          reason,
        }),
      );
      return '⛔ Membre banni.';
    }
  } catch (err) {
    await addLog({
      level: 'error',
      source: 'bot',
      action: 'Sanction automatique échouée',
      detail: `${target.user.tag ?? target.id} — ${(err as Error).message}`,
    });
    return `❌ Sanction automatique impossible : ${(err as Error).message}`;
  }
  return null;
}

// ------------------------------------------------------------
//  Sanctions directes
// ------------------------------------------------------------

async function record(
  guild: Guild,
  type: ModCaseType,
  userId: string,
  userName: string,
  moderator: Moderator,
  reason: string,
  expiresAt?: string,
): Promise<ModCase> {
  return updateState((s) =>
    createCase(s, {
      guildId: guild.id,
      type,
      userId,
      userName,
      moderatorId: moderator.id,
      moderatorName: moderator.name,
      reason,
      expiresAt,
    }),
  );
}

async function notifySanction(guild: Guild, user: User, type: ModCaseType, reason: string, moderator: Moderator, expiresAt?: string) {
  const state = await getState();
  if (!state.config.moderation.directMessageOnSanction) return false;
  return sendDirectMessage(
    user,
    buildDirectMessage({
      guildName: guild.name,
      type,
      reason,
      moderatorName: moderator.name,
      warnCount: 0,
      expiresAt,
    }),
  );
}

export async function timeoutMember(
  guild: Guild,
  member: GuildMember,
  minutes: number,
  reason: string,
  moderator: Moderator,
): Promise<{ ok: boolean; message: string }> {
  const state = await getState();
  const config = state.config.moderation;
  const duration = Math.max(1, Math.min(config.maxTimeoutHours * 60, minutes));
  const expiresAt = new Date(Date.now() + duration * 60_000).toISOString();
  try {
    await member.timeout(duration * 60_000, reason);
  } catch (err) {
    return { ok: false, message: `Impossible de mute : ${(err as Error).message}` };
  }
  const modCase = await record(guild, 'timeout', member.id, member.user.tag ?? member.displayName, moderator, reason, expiresAt);
  const sent = await notifySanction(guild, member.user, 'timeout', reason, moderator, expiresAt);
  await postCaseToChannel(guild, modCase, { directMessageSent: sent });
  await addLog({
    level: 'moderation',
    source: `modérateur:${moderator.name}`,
    action: 'Mute temporaire',
    detail: `${member.user.tag ?? member.displayName} — ${duration} min — ${reason}`,
  });
  return {
    ok: true,
    message: `🔇 ${member.displayName} est mute pour **${duration} minute(s)**.${sent ? ' MP envoyé.' : ''}`,
  };
}

export async function untimeoutMember(
  guild: Guild,
  member: GuildMember,
  reason: string,
  moderator: Moderator,
): Promise<{ ok: boolean; message: string }> {
  try {
    await member.timeout(null, reason);
  } catch (err) {
    return { ok: false, message: `Impossible de lever le mute : ${(err as Error).message}` };
  }
  const modCase = await record(guild, 'untimeout', member.id, member.user.tag ?? member.displayName, moderator, reason);
  await postCaseToChannel(guild, modCase);
  await addLog({
    level: 'moderation',
    source: `modérateur:${moderator.name}`,
    action: 'Mute levé',
    detail: member.user.tag ?? member.displayName,
  });
  return { ok: true, message: `🔊 ${member.displayName} peut de nouveau parler.` };
}

export async function kickMember(
  guild: Guild,
  member: GuildMember,
  reason: string,
  moderator: Moderator,
): Promise<{ ok: boolean; message: string }> {
  const sent = await notifySanction(guild, member.user, 'kick', reason, moderator);
  try {
    await member.kick(reason);
  } catch (err) {
    return { ok: false, message: `Expulsion impossible : ${(err as Error).message}` };
  }
  const modCase = await record(guild, 'kick', member.id, member.user.tag ?? member.displayName, moderator, reason);
  await postCaseToChannel(guild, modCase, { directMessageSent: sent });
  await addLog({
    level: 'moderation',
    source: `modérateur:${moderator.name}`,
    action: 'Membre expulsé',
    detail: `${member.user.tag ?? member.displayName} — ${reason}`,
  });
  return { ok: true, message: `👢 ${member.displayName} a été expulsé.${sent ? ' MP envoyé.' : ''}` };
}

export async function banMember(
  guild: Guild,
  userId: string,
  reason: string,
  moderator: Moderator,
  days = 1,
): Promise<{ ok: boolean; message: string }> {
  const state = await getState();
  const config = state.config.moderation;
  const deleteMessageSeconds = Math.max(0, Math.min(7, days)) * 86_400 || config.banDeleteMessageDays * 86_400;
  const user = await guild.client.users.fetch(userId).catch(() => null);
  const sent = user ? await notifySanction(guild, user, 'ban', reason, moderator) : false;
  try {
    await guild.members.ban(userId, { reason, deleteMessageSeconds });
  } catch (err) {
    return { ok: false, message: `Bannissement impossible : ${(err as Error).message}` };
  }
  const modCase = await record(guild, 'ban', userId, user?.tag ?? userId, moderator, reason);
  await postCaseToChannel(guild, modCase, { directMessageSent: sent });
  await addLog({
    level: 'moderation',
    source: `modérateur:${moderator.name}`,
    action: 'Membre banni',
    detail: `${user?.tag ?? userId} — ${reason}`,
  });
  return { ok: true, message: `⛔ ${user?.tag ?? userId} a été banni.${sent ? ' MP envoyé.' : ''}` };
}

export async function unbanMember(
  guild: Guild,
  userId: string,
  reason: string,
  moderator: Moderator,
): Promise<{ ok: boolean; message: string }> {
  try {
    await guild.members.unban(userId, reason);
  } catch (err) {
    return { ok: false, message: `Débannissement impossible : ${(err as Error).message}` };
  }
  const modCase = await record(guild, 'unban', userId, userId, moderator, reason);
  await postCaseToChannel(guild, modCase);
  await addLog({
    level: 'moderation',
    source: `modérateur:${moderator.name}`,
    action: 'Bannissement levé',
    detail: `${userId} — ${reason}`,
  });
  return { ok: true, message: `✅ ${userId} n’est plus banni.` };
}

export async function softbanMember(
  guild: Guild,
  member: GuildMember,
  reason: string,
  moderator: Moderator,
): Promise<{ ok: boolean; message: string }> {
  const state = await getState();
  const days = state.config.moderation.softbanDeleteDays;
  const sent = await notifySanction(guild, member.user, 'softban', reason, moderator);
  try {
    await guild.members.ban(member.id, { reason, deleteMessageSeconds: days * 86_400 });
    await guild.members.unban(member.id, `Softban terminé — ${reason}`);
  } catch (err) {
    return { ok: false, message: `Softban impossible : ${(err as Error).message}` };
  }
  const modCase = await record(guild, 'softban', member.id, member.user.tag ?? member.displayName, moderator, reason);
  await postCaseToChannel(guild, modCase, { directMessageSent: sent });
  await addLog({
    level: 'moderation',
    source: `modérateur:${moderator.name}`,
    action: 'Softban',
    detail: `${member.user.tag ?? member.displayName} — ${reason}`,
  });
  return { ok: true, message: `🌀 Softban effectué : ${days} jour(s) de messages supprimés.` };
}

// ------------------------------------------------------------
//  Messages & salons
// ------------------------------------------------------------

/** Nombre total de mentions d'un message (membres, rôles, everyone/here). */
function mentionCount(message: { mentions: { users: { size: number }; roles: { size: number }; everyone: boolean } }): number {
  return message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
}

export interface PurgeFilter {
  userId?: string;
  contains?: string;
  links?: boolean;
  attachments?: boolean;
  embeds?: boolean;
  mentions?: boolean;
  bots?: boolean;
}

export async function purgeMessages(
  channel: BaseGuildTextChannel,
  count: number,
  filter: PurgeFilter = {},
  source = 'bot',
): Promise<number> {
  const limit = Math.max(1, Math.min(100, Math.floor(count)));
  const fetched = await channel.messages.fetch({ limit: 100 });
  const hasFilter = Boolean(
    filter.userId || filter.contains || filter.links || filter.attachments || filter.embeds || filter.mentions || filter.bots,
  );

  const selected = (hasFilter
    ? fetched.filter((message) => {
        if (filter.userId && message.author.id !== filter.userId) return false;
        if (filter.bots && !message.author.bot) return false;
        if (filter.contains && !message.content.toLowerCase().includes(filter.contains.toLowerCase())) return false;
        if (filter.links && !/https?:\/\/|www\./i.test(message.content)) return false;
        if (filter.attachments && message.attachments.size === 0 && !message.content.includes('https://')) return false;
        if (filter.embeds && message.embeds.length === 0) return false;
        if (filter.mentions && mentionCount(message) < 3) return false;
        return true;
      })
    : fetched
  ).first(limit);

  const recent = selected.filter((message) => Date.now() - message.createdTimestamp < 13.9 * 24 * 3_600_000);
  const tooOld = selected.filter((message) => !recent.includes(message));
  let deleted = 0;
  if (recent.length > 1) {
    const bulk = await channel.bulkDelete(recent, true).catch(() => null);
    deleted += bulk?.size ?? 0;
  } else if (recent.length === 1) {
    const removed = await recent[0].delete().catch(() => null);
    if (removed) deleted += 1;
  }
  for (const message of tooOld) {
    const removed = await message.delete().catch(() => null);
    if (removed) deleted += 1;
  }

  await addLog({
    level: 'moderation',
    source,
    action: 'Purge de messages',
    detail: `${deleted} message(s) supprimé(s) dans #${channel.name}`,
  });
  return deleted;
}

export async function lockChannel(
  channel: BaseGuildTextChannel | VoiceChannel,
  source = 'bot',
  locked = true,
): Promise<void> {
  const permission = channel.isVoiceBased()
    ? { Connect: locked ? false : null }
    : { SendMessages: locked ? false : null, AddReactions: locked ? false : null };
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, permission);
  await addLog({
    level: 'moderation',
    source,
    action: locked ? 'Salon verrouillé' : 'Salon déverrouillé',
    detail: `#${channel.name}`,
  });
}

export async function lockdownGuild(guild: Guild, locked: boolean, source = 'bot'): Promise<number> {
  await guild.channels.fetch().catch(() => undefined);
  let count = 0;
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) continue;
    await channel.permissionOverwrites
      .edit(guild.roles.everyone.id, { SendMessages: locked ? false : null })
      .then(() => {
        count += 1;
      })
      .catch(() => undefined);
  }
  await addLog({
    level: 'moderation',
    source,
    action: locked ? 'Lockdown du serveur' : 'Fin du lockdown',
    detail: `${count} salon(s)`,
  });
  return count;
}

export async function setSlowmode(
  channel: BaseGuildTextChannel,
  seconds: number,
  source = 'bot',
): Promise<number> {
  const value = Math.max(0, Math.min(21_600, Math.floor(seconds)));
  await channel.setRateLimitPerUser(value, `Limerence Bot — slowmode par ${source}`);
  await addLog({
    level: 'moderation',
    source,
    action: 'Slowmode modifié',
    detail: `${value}s dans #${channel.name}`,
  });
  return value;
}

/** Recrée un salon à l'identique (purge totale sans laisser de trace). */
export async function nukeChannel(
  channel: BaseGuildTextChannel,
  source = 'bot',
): Promise<GuildBasedChannel | null> {
  const clone = await channel.clone({ reason: `Limerence Bot — nuke par ${source}` });
  await channel.delete(`Limerence Bot — nuke par ${source}`).catch(() => undefined);
  await addLog({
    level: 'moderation',
    source,
    action: 'Salon recréé (nuke)',
    detail: `#${channel.name}`,
  });
  return clone as GuildBasedChannel;
}

export async function setNickname(
  member: GuildMember,
  nickname: string | null,
  source = 'bot',
): Promise<void> {
  await member.setNickname(nickname, `Limerence Bot — ${source}`);
  await addLog({
    level: 'moderation',
    source,
    action: 'Pseudonyme modifié',
    detail: `${member.user.tag ?? member.id} → ${nickname ?? '(réinitialisé)'}`,
  });
}

export async function manageRole(
  member: GuildMember,
  roleId: string,
  add: boolean,
  source = 'bot',
): Promise<{ ok: boolean; message: string }> {
  const role = member.guild.roles.cache.get(roleId);
  if (!role) return { ok: false, message: 'Rôle introuvable.' };
  const me = member.guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    return { ok: false, message: 'Ce rôle est au-dessus du mien : remonte-moi dans la hiérarchie.' };
  }
  try {
    if (add) await member.roles.add(role, `Limerence Bot — ${source}`);
    else await member.roles.remove(role, `Limerence Bot — ${source}`);
  } catch (err) {
    return { ok: false, message: `Impossible : ${(err as Error).message}` };
  }
  await addLog({
    level: 'moderation',
    source,
    action: add ? 'Rôle ajouté' : 'Rôle retiré',
    detail: `${member.user.tag ?? member.id} — ${role.name}`,
  });
  return { ok: true, message: `${add ? '✅' : '🗑️'} Rôle **${role.name}** ${add ? 'ajouté à' : 'retiré de'} ${member.displayName}.` };
}

export { caseLabel, caseLabelFromConfig, CASE_TYPE_LABELS, CASE_TYPE_EMOJI, activeWarns };
export type { ModCase };
