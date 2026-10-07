'use server';

import { ChannelType, type BaseGuildTextChannel, type Guild, type GuildMember } from 'discord.js';
import {
  banMember,
  kickMember,
  lockChannel,
  manageRole,
  nukeChannel,
  purgeMessages,
  setNickname,
  setSlowmode,
  softbanMember,
  timeoutMember,
  unbanMember,
  untimeoutMember,
  warnMember,
} from '@/bot/moderation';
import { addLog } from '@/lib/logs';
import { getState, updateState } from '@/lib/store';
import { clearWarns, pruneCases, revokeCase } from '@/lib/moderation/cases';
import { resolveChannelById } from '@/lib/channels';
import type { ActionState } from '@/lib/types';
import {
  currentAdmin,
  fail,
  int,
  NOT_AUTHORIZED,
  ok,
  parseUserTarget,
  refreshPanel,
  requireGuild,
  snowflake,
  str,
} from '@/lib/panelActions';

// ============================================================
//  Modération depuis le panel : chaque action passe par les
//  mêmes primitives que les commandes slash (dossier + MP +
//  journal), donc le bot et le panel restent cohérents.
// ============================================================

async function moderatorOf() {
  const admin = await currentAdmin();
  if (!admin) return null;
  return { id: admin.id, name: `panel:${admin.username}` };
}

async function memberOf(guild: Guild, formData: FormData): Promise<GuildMember | { error: string }> {
  const userId = parseUserTarget(str(formData, 'userId'));
  if (!userId) return { error: 'Identifiant Discord invalide (mention ou identifiant numérique).' };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { error: 'Membre introuvable sur le serveur.' };
  return member;
}

function reasonOf(formData: FormData): string {
  return str(formData, 'reason', 'Aucune raison précisée');
}

/** Avertissement depuis le panel : dossier + MP + sanction automatique. */
export async function warnMemberAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const memberResult = await memberOf(guildResult.guild, formData);
  if ('error' in memberResult) return fail(memberResult.error);

  const result = await warnMember({
    guild: guildResult.guild,
    target: memberResult,
    reason: reasonOf(formData),
    moderator,
    notifyChannel: formData.get('notifyChannel') !== 'off',
  });

  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function timeoutMemberAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const memberResult = await memberOf(guildResult.guild, formData);
  if ('error' in memberResult) return fail(memberResult.error);

  const minutes = Math.min(40_320, Math.max(1, int(formData, 'minutes', 10)));
  const result = await timeoutMember(guildResult.guild, memberResult, minutes, reasonOf(formData), moderator);
  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function untimeoutMemberAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const memberResult = await memberOf(guildResult.guild, formData);
  if ('error' in memberResult) return fail(memberResult.error);

  const result = await untimeoutMember(guildResult.guild, memberResult, reasonOf(formData), moderator);
  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function kickMemberAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const memberResult = await memberOf(guildResult.guild, formData);
  if ('error' in memberResult) return fail(memberResult.error);

  const result = await kickMember(guildResult.guild, memberResult, reasonOf(formData), moderator);
  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function banMemberAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const userId = parseUserTarget(str(formData, 'userId'));
  if (!userId) return fail('Identifiant Discord invalide.');

  const days = Math.min(7, Math.max(0, int(formData, 'days', 1)));
  const result = await banMember(guildResult.guild, userId, reasonOf(formData), moderator, days);
  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function unbanMemberAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const userId = parseUserTarget(str(formData, 'userId'));
  if (!userId) return fail('Identifiant Discord invalide.');

  const result = await unbanMember(guildResult.guild, userId, reasonOf(formData), moderator);
  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function softbanMemberAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const memberResult = await memberOf(guildResult.guild, formData);
  if ('error' in memberResult) return fail(memberResult.error);

  const result = await softbanMember(guildResult.guild, memberResult, reasonOf(formData), moderator);
  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function manageRoleAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const memberResult = await memberOf(guildResult.guild, formData);
  if ('error' in memberResult) return fail(memberResult.error);

  const roleId = snowflake(formData, 'roleId');
  if (!roleId) return fail('Rôle Discord manquant.');
  const result = await manageRole(memberResult, roleId, formData.get('remove') !== 'on', moderator.name);
  refreshPanel();
  return result.ok ? ok(result.message) : fail(result.message);
}

export async function nicknameAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const memberResult = await memberOf(guildResult.guild, formData);
  if ('error' in memberResult) return fail(memberResult.error);

  const nickname = str(formData, 'nickname');
  await setNickname(memberResult, nickname || null, moderator.name);
  refreshPanel();
  return ok(nickname ? `Pseudonyme défini : ${nickname}.` : 'Pseudonyme réinitialisé.');
}

// ------------------------------------------------------------
//  Salons
// ------------------------------------------------------------

async function channelOf(
  guild: Guild,
  formData: FormData,
): Promise<BaseGuildTextChannel | { error: string }> {
  const channelId = snowflake(formData, 'channelId');
  const channel = await resolveChannelById(guild, channelId);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    return { error: 'Salon textuel introuvable.' };
  }
  return channel as BaseGuildTextChannel;
}

export async function purgeAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const channelResult = await channelOf(guildResult.guild, formData);
  if ('error' in channelResult) return fail(channelResult.error);

  const count = Math.min(100, Math.max(1, int(formData, 'count', 25)));
  const deleted = await purgeMessages(
    channelResult,
    count,
    {
      userId: parseUserTarget(str(formData, 'userId')) ?? undefined,
      contains: str(formData, 'contains') || undefined,
      links: formData.get('links') === 'on',
      attachments: formData.get('attachments') === 'on',
      embeds: formData.get('embeds') === 'on',
      mentions: formData.get('mentions') === 'on',
      bots: formData.get('bots') === 'on',
    },
    moderator.name,
  );
  refreshPanel();
  return ok(`${deleted} message(s) supprimé(s).`);
}

export async function lockChannelAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const channelResult = await channelOf(guildResult.guild, formData);
  if ('error' in channelResult) return fail(channelResult.error);

  const locked = formData.get('unlock') !== 'on';
  await lockChannel(channelResult, moderator.name, locked);
  refreshPanel();
  return ok(locked ? `#${channelResult.name} verrouillé.` : `#${channelResult.name} déverrouillé.`);
}

export async function slowmodeAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const channelResult = await channelOf(guildResult.guild, formData);
  if ('error' in channelResult) return fail(channelResult.error);

  const seconds = await setSlowmode(channelResult, int(formData, 'seconds', 0), moderator.name);
  refreshPanel();
  return ok(`Slowmode de #${channelResult.name} : ${seconds}s.`);
}

export async function nukeChannelAction(_prev: ActionState | null, formData: FormData) {
  const moderator = await moderatorOf();
  if (!moderator) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);
  const channelResult = await channelOf(guildResult.guild, formData);
  if ('error' in channelResult) return fail(channelResult.error);

  await nukeChannel(channelResult, moderator.name);
  refreshPanel();
  return ok(`#${channelResult.name} recréé à l’identique.`);
}

// ------------------------------------------------------------
//  Dossiers de modération
// ------------------------------------------------------------

/** Retire un dossier (avertissement, sanction…) du passif du membre. */
export async function revokeCaseAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const caseId = str(formData, 'caseId');
  if (!caseId) return;
  await updateState((state) => {
    revokeCase(state, caseId, admin.username);
  });
  await addLog({ level: 'info', source: 'panel', action: 'Dossier retiré', detail: `${caseId} par ${admin.username}` });
  refreshPanel();
}

/** Efface tous les avertissements actifs d'un membre. */
export async function clearWarnsAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const userId = parseUserTarget(str(formData, 'userId'));
  if (!userId) return;
  let count = 0;
  await updateState((state) => {
    count = clearWarns(state, userId, admin.username);
  });
  await addLog({
    level: 'info',
    source: 'panel',
    action: 'Avertissements effacés',
    detail: `${count} dossier(s) — ${userId}`,
  });
  refreshPanel();
}

/** Efface tous les dossiers expirés/inactifs. */
export async function pruneCasesAction(): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  let removed = 0;
  await updateState((next) => {
    removed = pruneCases(next, next.config.moderation);
  });
  await addLog({ level: 'info', source: 'panel', action: 'Dossiers expirés purgés', detail: `${removed} — ${admin.username}` });
  refreshPanel();
  return ok(`${removed} dossier(s) expiré(s) supprimé(s).`);
}
