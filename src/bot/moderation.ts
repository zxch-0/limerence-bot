import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type BaseGuildTextChannel,
  type VoiceChannel,
} from 'discord.js';
import { addLog } from '../lib/logs';

// ============================================================
//  Modération — utilisée par les commandes slash ET le panel
// ============================================================

export async function purgeMessages(
  channel: BaseGuildTextChannel,
  count: number,
  userId?: string | null,
  source = 'bot',
): Promise<number> {
  const limit = Math.max(1, Math.min(100, count));
  const fetched = await channel.messages.fetch({ limit: userId ? 100 : limit });
  const toDelete = (userId ? fetched.filter((m) => m.author.id === userId) : fetched).first(
    userId ? limit : limit,
  );
  const deleted = await channel.bulkDelete(toDelete, true);
  await addLog({
    level: 'moderation',
    source,
    action: 'Purge de messages',
    detail: `${deleted.size} message(s) supprimé(s) dans #${channel.name}${userId ? ` (auteur ${userId})` : ''}`,
  });
  return deleted.size;
}

export async function lockChannel(
  channel: BaseGuildTextChannel | VoiceChannel,
  source = 'bot',
  locked = true,
): Promise<void> {
  const permission = channel.isVoiceBased()
    ? { Connect: locked ? false : null }
    : { SendMessages: locked ? false : null };
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, permission);
  await addLog({
    level: 'moderation',
    source,
    action: locked ? 'Salon verrouillé' : 'Salon déverrouillé',
    detail: `#${channel.name}`,
  });
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

export async function kickMember(
  member: GuildMember,
  reason: string,
  source = 'bot',
): Promise<void> {
  await member.kick(reason);
  await addLog({
    level: 'moderation',
    source,
    action: 'Membre expulsé',
    detail: `${member.user.tag} — ${reason}`,
  });
}

export async function banMember(
  guild: Guild,
  userId: string,
  reason: string,
  source = 'bot',
): Promise<void> {
  await guild.members.ban(userId, { reason });
  await addLog({
    level: 'moderation',
    source,
    action: 'Membre banni',
    detail: `${userId} — ${reason}`,
  });
}

export function botCanModerate(guild: Guild, member: GuildMember): boolean {
  const me = guild.members.me;
  if (!me) return false;
  if (member.id === guild.ownerId) return false;
  return me.permissions.has(PermissionFlagsBits.ModerateMembers) && me.roles.highest.position > member.roles.highest.position;
}
