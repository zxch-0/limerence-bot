import { ChannelType, type Guild } from 'discord.js';

// ============================================================
//  Données de démonstration
//  Utilisées quand le bot n'est pas connecté (mode démo, premier
//  déploiement) pour que le panel reste lisible et navigable.
// ============================================================

export interface DemoGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  onlineCount: number;
  channelCount: number;
  roleCount: number;
  boostLevel: number;
  createdAt: string;
  ownerId: string;
}

export function demoGuild(): DemoGuild {
  return {
    id: '000000000000000000',
    name: 'Limerence (démo)',
    iconUrl: null,
    memberCount: 128,
    onlineCount: 34,
    channelCount: 23,
    roleCount: 6,
    boostLevel: 1,
    createdAt: new Date(Date.now() - 240 * 86_400_000).toISOString(),
    ownerId: '000000000000000000',
  };
}

export interface GuildInfo {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  onlineCount: number;
  channelCount: number;
  roleCount: number;
  boostLevel: number;
  createdAt: string;
  ownerId: string;
  demo: boolean;
}

export function guildInfoFromGuild(guild: Guild): GuildInfo {
  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL({ size: 128 }),
    memberCount: guild.memberCount,
    onlineCount: guild.presences?.cache.size ?? Math.round(guild.memberCount * 0.25),
    channelCount: guild.channels.cache.size,
    roleCount: guild.roles.cache.size,
    boostLevel: guild.premiumTier,
    createdAt: guild.createdAt.toISOString(),
    ownerId: guild.ownerId,
    demo: false,
  };
}

export function demoGuildInfo(): GuildInfo {
  return { ...demoGuild(), demo: true };
}

/** Liste des salons réels du serveur, utilisée par les pages de modération. */
export interface ChannelOption {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'category' | 'other';
  parentName?: string;
}

export function channelOptionsFromGuild(guild: Guild): ChannelOption[] {
  const typeName = (t: ChannelType): ChannelOption['type'] => {
    if (t === ChannelType.GuildText || t === ChannelType.GuildAnnouncement) return 'text';
    if (t === ChannelType.GuildVoice) return 'voice';
    if (t === ChannelType.GuildCategory) return 'category';
    return 'other';
  };
  return guild.channels.cache
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: typeName(c.type),
      parentName: c.parent?.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Rôles du serveur, utilisés par les sélecteurs du panel. */
export interface RoleOption {
  id: string;
  name: string;
  position: number;
}

export function roleOptionsFromGuild(guild: Guild): RoleOption[] {
  return guild.roles.cache
    .filter((role) => role.id !== guild.id)
    .map((role) => ({ id: role.id, name: role.name, position: role.position }))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name, 'fr'));
}

export function demoRoleOptions(): RoleOption[] {
  return [
    { id: '10', name: 'Administrateur', position: 9 },
    { id: '11', name: 'Modérateur', position: 8 },
    { id: '12', name: 'Membre', position: 1 },
  ];
}

export function demoChannelOptions(): ChannelOption[] {
  return [
    { id: '1', name: 'général', type: 'category' },
    { id: '2', name: 'accueil', type: 'text', parentName: 'général' },
    { id: '3', name: 'discussion', type: 'text', parentName: 'général' },
    { id: '4', name: 'annonces', type: 'text', parentName: 'général' },
    { id: '5', name: 'règlement', type: 'text', parentName: 'général' },
    { id: '6', name: 'vocal général', type: 'voice', parentName: 'général' },
  ];
}
