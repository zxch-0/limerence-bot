import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import { addLog } from '../lib/logs';

// ============================================================
//  Modération — utilisée par les commandes slash ET le panel
// ============================================================

export async function purgeMessages(
  channel: TextChannel,
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
  channel: TextChannel,
  source = 'bot',
  locked = true,
): Promise<void> {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
    SendMessages: locked ? false : null,
  });
  await addLog({
    level: 'moderation',
    source,
    action: locked ? 'Salon verrouillé' : 'Salon déverrouillé',
    detail: `#${channel.name}`,
  });
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
