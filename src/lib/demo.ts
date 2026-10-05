import { ChannelType, type Guild } from 'discord.js';

// ============================================================
//  Données de démonstration
//  Utilisées quand le bot n'est pas connecté (mode démo, premier
//  déploiement) pour que le panel reste lisible et navigable.
// ============================================================

const NAMES = [
  'luna', 'nox', 'ambre', 'kael', 'yuna', 'sacha', 'iris', 'ren',
  'milo', 'noée', 'eden', 'lyra', 'soren', 'maé', 'zoe', 'axel',
];

export interface DemoMember {
  id: string;
  tag: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  roles: number;
  isBot: boolean;
}

export function demoMembers(count = 12): DemoMember[] {
  return Array.from({ length: count }, (_, i) => {
    const name = NAMES[i % NAMES.length];
    return {
      id: String(100000000000000000n + BigInt(i)),
      tag: `${name}#${1000 + i}`,
      displayName: name,
      avatarUrl: null,
      joinedAt: new Date(Date.now() - (i + 1) * 86_400_000 * 3).toISOString(),
      roles: i % 3 === 0 ? 2 : 1,
      isBot: false,
    };
  });
}

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
    if (t === ChannelType.GuildText) return 'text';
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

export function demoChannelOptions(): ChannelOption[] {
  return [
    { id: '1', name: '💬 accueil', type: 'category' },
    { id: '2', name: '➥ chat 💬', type: 'text', parentName: '💬 accueil' },
    { id: '3', name: '➥ confessions 🤫', type: 'text', parentName: '💬 accueil' },
    { id: '4', name: '➥ photos 📸', type: 'text', parentName: '💬 accueil' },
    { id: '5', name: '🔊 Vocal général', type: 'voice', parentName: '🌍 public' },
  ];
}
