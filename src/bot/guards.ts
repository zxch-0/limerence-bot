import {
  MessageFlags,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Interaction,
  type PermissionResolvable,
} from 'discord.js';
import { isEnvAdmin } from '../lib/owner';
import { getGuild } from '../lib/discord/client';

// ============================================================
//  Vérifications de permissions partagées par toutes les commandes
// ============================================================

export function interactionGuild(interaction: Interaction): Guild | null {
  return interaction.inGuild() ? interaction.guild : null;
}

/** Membre de l'équipe : administrateur Discord, owner ou ID autorisé par l'env. */
export function isStaff(interaction: Interaction): boolean {
  // L'owner / les IDs de l'env restent reconnus en MP : la liste ne dépend
  // pas du serveur d'où vient l'interaction.
  if (isEnvAdmin(interaction.user.id)) return true;
  if (!interaction.inGuild()) return false;
  const perms = interaction.memberPermissions;
  return Boolean(
    perms?.has(PermissionFlagsBits.Administrator) || perms?.has(PermissionFlagsBits.ManageGuild),
  );
}

// ------------------------------------------------------------
//  Interactions reçues en MP
// ------------------------------------------------------------

/**
 * Serveur concerné par l'interaction.
 * En MP, `interaction.guild` vaut null : on retombe sur le serveur géré
 * par le bot (`config.guildId`, puis `DISCORD_GUILD_ID`, puis le premier
 * serveur connu). Le contrôle d'un salon vocal temporaire est envoyé en MP
 * au propriétaire : ces interactions doivent donc retrouver leur serveur.
 */
export async function resolveInteractionGuild(
  interaction: Interaction,
  channelId?: string,
): Promise<Guild | null> {
  if (interaction.inGuild() && interaction.guild) return interaction.guild;

  // Un salon précis est connu (boutons du panneau vocal) : on cherche le
  // serveur qui le contient plutôt que de deviner. Utile si le bot est
  // présent sur plusieurs serveurs.
  if (channelId) {
    const { getReadyClient } = await import('../lib/discord/client');
    const client = getReadyClient();
    if (client) {
      for (const guild of client.guilds.cache.values()) {
        if (guild.channels.cache.has(channelId)) return guild;
        const found = await guild.channels.fetch(channelId).catch(() => null);
        if (found) return guild;
      }
    }
  }

  return getGuild(false);
}

/**
 * Version asynchrone de `isStaff` qui fonctionne aussi en MP : les
 * permissions sont alors relues sur le membre du serveur concerné.
 */
export async function isStaffIn(interaction: Interaction, guild: Guild | null): Promise<boolean> {
  if (isStaff(interaction)) return true;
  if (!guild) return false;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

/**
 * Drapeaux de réponse : éphémère sur un serveur, réponse normale en MP.
 * Le drapeau `Ephemeral` n'a pas de sens dans un salon privé (il n'y a
 * personne d'autre à qui le masquer) et Discord refuse ces réponses.
 */
export function replyFlags(interaction: Interaction): { flags: MessageFlags.Ephemeral } | Record<string, never> {
  return interaction.guildId ? ({ flags: MessageFlags.Ephemeral } as const) : {};
}

export function hasPermission(interaction: Interaction, permission: PermissionResolvable): boolean {
  if (isEnvAdmin(interaction.user.id)) return true;
  return Boolean(interaction.memberPermissions?.has(permission));
}

export function isModerator(interaction: Interaction): boolean {
  return (
    isStaff(interaction) ||
    hasPermission(interaction, PermissionFlagsBits.ModerateMembers) ||
    hasPermission(interaction, PermissionFlagsBits.KickMembers) ||
    hasPermission(interaction, PermissionFlagsBits.ManageMessages)
  );
}

/** Le bot peut-il sanctionner ce membre ? (hiérarchie des rôles) */
export function botCanActOn(guild: Guild, member: GuildMember): { ok: boolean; reason?: string } {
  const me = guild.members.me;
  if (!me) return { ok: false, reason: 'Je ne trouve pas mon propre membre sur ce serveur.' };
  if (member.id === guild.ownerId) return { ok: false, reason: 'Impossible de sanctionner le propriétaire du serveur.' };
  if (member.roles.highest.position >= me.roles.highest.position) {
    return { ok: false, reason: 'Mon rôle le plus haut est en dessous du sien : remonte-moi dans la liste des rôles.' };
  }
  return { ok: true };
}

/** L'auteur de la commande a-t-il le droit de sanctionner cette cible ? */
export function actorCanActOn(
  guild: Guild,
  actorId: string,
  member: GuildMember,
  enforceHierarchy: boolean,
): { ok: boolean; reason?: string } {
  if (isEnvAdmin(actorId)) return { ok: true };
  if (member.id === guild.ownerId) return { ok: false, reason: 'Impossible de sanctionner le propriétaire du serveur.' };
  if (member.id === actorId) return { ok: false, reason: 'Tu ne peux pas te sanctionner toi-même.' };
  if (!enforceHierarchy) return { ok: true };
  const actor = guild.members.cache.get(actorId);
  if (!actor) return { ok: false, reason: 'Impossible de vérifier tes permissions.' };
  if (member.roles.highest.position >= actor.roles.highest.position) {
    return { ok: false, reason: 'Ce membre a un rôle égal ou supérieur au tien.' };
  }
  return { ok: true };
}

export function memberIsProtected(guild: Guild, member: GuildMember, protectedRoleIds: string[]): boolean {
  if (member.id === guild.ownerId) return true;
  if (member.user.bot) return false;
  return protectedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

export async function fetchMember(guild: Guild, userId: string): Promise<GuildMember | null> {
  return guild.members.fetch(userId).catch(() => null);
}
