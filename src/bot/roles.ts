import type { Guild, GuildMember } from 'discord.js';
import { getState } from '../lib/store';
import { addLog } from '../lib/logs';

// ============================================================
//  Rôle d'accueil
//  Le bot n'attribue qu'un rôle EXISTANT, choisi dans le panel :
//  il ne crée plus rien sur le serveur.
// ============================================================

export async function resolveWelcomeRole(guild: Guild): Promise<import('discord.js').Role | null> {
  const state = await getState();
  const roleId = state.config.welcome.roleId;
  if (!/^\d{15,25}$/.test(roleId)) return null;
  return guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
}

export async function giveWelcomeRole(member: GuildMember): Promise<boolean> {
  const state = await getState();
  if (!state.config.welcome.enabled) return false;
  const role = await resolveWelcomeRole(member.guild);
  if (!role) return false;
  if (member.roles.cache.has(role.id)) return false;
  const me = member.guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    await addLog({
      level: 'warn',
      source: 'bot',
      action: 'Rôle d’accueil non attribuable',
      detail: `Le rôle ${role.name} est au-dessus du mien.`,
    });
    return false;
  }
  try {
    await member.roles.add(role, `Limerence Bot — rôle d’accueil`);
    return true;
  } catch {
    return false;
  }
}

/** Attribue le rôle d'accueil à tous les membres existants (bouton du panel). */
export async function giveWelcomeRoleToEveryone(guild: Guild): Promise<number> {
  const role = await resolveWelcomeRole(guild);
  if (!role) return 0;
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return 0;
  let count = 0;
  for (const member of members.values()) {
    if (member.user.bot || member.roles.cache.has(role.id)) continue;
    const added = await member.roles.add(role, 'Limerence Bot — attribution en masse').then(() => true).catch(() => false);
    if (added) count += 1;
  }
  await addLog({
    level: 'info',
    source: 'panel',
    action: 'Rôle d’accueil attribué aux membres existants',
    detail: `${count} membre(s)`,
  });
  return count;
}
