import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type VoiceBasedChannel,
  type VoiceChannel,
  type VoiceState,
} from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { accentColor } from './ui';

import type { TempRoom } from '../lib/types';

// ============================================================
//  Vocaux temporaires (join-to-create)
//  Un membre rejoint le hub ➕ -> le bot crée son salon privé,
//  l'y déplace, lui donne le contrôle (renommer/verrouiller).
//  Le salon est supprimé dès qu'il se vide.
// ============================================================

const pendingDeletions = new Map<string, NodeJS.Timeout>();

function ownerName(member: GuildMember, template: string): string {
  const base = member.displayName || member.user.username;
  const name = (template || '🔊 {name}')
    .replaceAll('{name}', base)
    .replaceAll('{user}', member.user.username)
    .replaceAll('{display}', base);
  return name.slice(0, 100);
}

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  const state = await getState();
  const cfg = state.config.joinToCreate;

  if (!cfg.enabled) return;

  if (!/^\d{15,25}$/.test(cfg.hubChannelId)) return;
  const hub =
    guild.channels.cache.get(cfg.hubChannelId) ??
    (await guild.channels.fetch(cfg.hubChannelId).catch(() => null));
  if (!hub?.isVoiceBased()) return;

  const member = newState.member ?? oldState.member ?? null;

  // 1) arrivée dans le hub -> création d'un salon
  if (oldState.channelId !== hub.id && newState.channelId === hub.id && member && !member.user.bot) {
    await createTempRoom(guild, member, hub as VoiceChannel);
    return;
  }

  // 2) départ d'un salon temporaire -> suppression si vide
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const maybeTemp = state.tempRooms.find((r) => r.channelId === oldState.channelId);
    if (maybeTemp) scheduleDeletion(guild, maybeTemp.channelId);
  }
}

async function createTempRoom(
  guild: Guild,
  member: GuildMember,
  hubChannel: VoiceBasedChannel,
): Promise<void> {
  const state = await getState();
  const cfg = state.config.joinToCreate;

  if (!member.voice.channel) return;

  // un seul salon par membre ?
  if (cfg.onePerMember) {
    const existing = state.tempRooms.find((r) => r.ownerId === member.id);
    if (existing) {
      const room = guild.channels.cache.get(existing.channelId);
      if (room?.isVoiceBased()) {
        await member.voice.setChannel(room as VoiceChannel).catch(() => undefined);
        return;
      }
    }
  }

  const limited = Number(process.env.TEMP_ROOMS_PER_USER ?? '0');
  if (limited > 0) {
    const owned = state.tempRooms.filter((r) => r.ownerId === member.id).length;
    if (owned >= limited) {
      await addLog({
        level: 'warn',
        source: `membre:${member.id}`,
        action: 'Limite de salons temporaires atteinte',
        detail: `${owned}/${limited}`,
      });
      return;
    }
  }

  const parent = /^\d{15,25}$/.test(cfg.categoryId)
    ? guild.channels.cache.get(cfg.categoryId) ??
      (await guild.channels.fetch(cfg.categoryId).catch(() => null))
    : undefined;
  const parentId = parent?.type === ChannelType.GuildCategory ? parent.id : undefined;

  try {
    const channel = await guild.channels.create({
      name: ownerName(member, cfg.nameTemplate),
      type: ChannelType.GuildVoice,
      parent: parentId,
      userLimit: cfg.defaultSize > 0 ? cfg.defaultSize : undefined,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.MuteMembers,
          ],
        },
      ],
      reason: `Limerence Bot — salon temporaire de ${member.user.tag}`,
    });

    const tempRoom: TempRoom = {
      channelId: channel.id,
      ownerId: member.id,
      createdAt: new Date().toISOString(),
      locked: false,
      allowed: [],
      denied: [],
    };

    await updateState((s) => {
      s.tempRooms = [...s.tempRooms.filter((r) => r.channelId !== channel.id), tempRoom];
    });

    if (cfg.moveOwner) {
      await member.voice.setChannel(channel).catch(() => undefined);
    }

    await sendControlPanel(member, channel as VoiceChannel);
    await addLog({
      level: 'info',
      source: `membre:${member.id}`,
      action: 'Salon temporaire créé',
      detail: `#${channel.name} (${member.user.tag})`,
    });
  } catch (err) {
    await addLog({
      level: 'error',
      source: 'bot',
      action: 'Création du salon temporaire échouée',
      detail: `${hubChannel.name} — ${(err as Error).message}`,
    });
  }
}

/** Envoie au propriétaire un panneau de contrôle en MP (boutons). */
async function sendControlPanel(member: GuildMember, channel: VoiceChannel): Promise<void> {
  const state = await getState();
  const ui = state.config.ui;

  const embed = new EmbedBuilder()
    .setColor(accentColor(ui))
    .setAuthor({ name: `${ui.accentEmoji} Ton salon vocal est prêt` })
    .setDescription(
      [
        `Salon : **${channel.name}**`,
        '',
        'Gère-le **directement depuis ce message privé**, les boutons fonctionnent ici :',
        '• **Renommer** — change le nom du salon',
        '• **Verrouiller / ouvrir** — plus personne ne peut entrer',
        '• **Limite** — nombre de places',
        '• **Réclamer** — reprends le salon si le propriétaire est parti',
        '• **Supprimer** — ferme ton salon tout de suite',
        '',
        'Le reste se fait avec `/vocal`, utilisable ici aussi :',
        '`/vocal autoriser` · `/vocal expulser` · `/vocal transferer`',
      ].join('\n'),
    )
    .setFooter({ text: ui.showFooter ? ui.footerText : 'Le salon disparaît automatiquement quand il est vide.' });

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`temp:rename:${channel.id}`)
        .setLabel('Renommer')
        .setEmoji('✏️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`temp:togglelock:${channel.id}`)
        .setLabel('Verrouiller / ouvrir')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`temp:limit:${channel.id}`)
        .setLabel('Limite')
        .setEmoji('👥')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`temp:claim:${channel.id}`)
        .setLabel('Réclamer')
        .setEmoji('👑')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`temp:delete:${channel.id}`)
        .setLabel('Supprimer')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    ),
  ];

  try {
    const dm = await member.createDM();
    await dm.send({ embeds: [embed], components: rows });
  } catch {
    await addLog({
      level: 'warn',
      source: 'bot',
      action: 'Panneau vocal non envoyé (MP fermés)',
      detail: `${member.user.tag} — utilise /vocal dans le salon`,
    });
  }
}

function scheduleDeletion(guild: Guild, channelId: string) {
  if (pendingDeletions.has(channelId)) return;
  const timeout = setTimeout(async () => {
    pendingDeletions.delete(channelId);
    const state = await getState();
    if (!state.config.joinToCreate.autoDelete) return;
    const fresh = await guild.channels.fetch(channelId).catch(() => null);
    if (!fresh?.isVoiceBased()) {
      await forgetRoom(channelId);
      return;
    }
    if (fresh.members.size === 0) {
      try {
        await fresh.delete('Limerence Bot — salon temporaire vide');
        await forgetRoom(channelId);
        await addLog({
          level: 'info',
          source: 'bot',
          action: 'Salon temporaire supprimé',
          detail: `#${fresh.name}`,
        });
      } catch (error) {
        await addLog({
          level: 'error',
          source: 'bot',
          action: 'Suppression du salon temporaire échouée',
          detail: `${fresh.name} — ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }, 2_500);
  pendingDeletions.set(channelId, timeout);
}

export async function forgetRoom(channelId: string) {
  await updateState((s) => {
    s.tempRooms = s.tempRooms.filter((r) => r.channelId !== channelId);
  });
}

export async function getRoom(channelId: string): Promise<TempRoom | undefined> {
  const state = await getState();
  return state.tempRooms.find((r) => r.channelId === channelId);
}

export async function isRoomOwner(channelId: string, userId: string): Promise<boolean> {
  const room = await getRoom(channelId);
  return room?.ownerId === userId;
}

export async function renameRoom(channel: VoiceChannel, name: string) {
  const clean = name.trim().slice(0, 100);
  const withIcon = clean.startsWith('🔊') ? clean : `🔊 ${clean}`;
  await channel.setName(withIcon, 'Limerence Bot — renommage par le propriétaire');
}

export async function toggleLock(guild: Guild, channel: VoiceChannel): Promise<boolean> {
  const room = await getRoom(channel.id);
  const locked = !room?.locked;
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
    Connect: locked ? false : null,
  });
  await updateState((s) => {
    const r = s.tempRooms.find((x) => x.channelId === channel.id);
    if (r) r.locked = locked;
  });
  return locked;
}

export async function setRoomLimit(channel: VoiceChannel, limit: number) {
  await channel.setUserLimit(Math.max(0, Math.min(99, limit)));
}

export async function allowMember(guild: Guild, channel: VoiceChannel, userId: string) {
  await guild.members.fetch(userId);
  await channel.permissionOverwrites.edit(userId, { ViewChannel: true, Connect: true });
  await updateState((s) => {
    const r = s.tempRooms.find((x) => x.channelId === channel.id);
    if (r) {
      r.allowed = [...new Set([...r.allowed, userId])];
      r.denied = r.denied.filter((id) => id !== userId);
    }
  });
}

export async function denyMember(guild: Guild, channel: VoiceChannel, userId: string) {
  await channel.permissionOverwrites.edit(userId, { ViewChannel: false, Connect: false });
  await updateState((s) => {
    const r = s.tempRooms.find((x) => x.channelId === channel.id);
    if (r) {
      r.denied = [...new Set([...r.denied, userId])];
      r.allowed = r.allowed.filter((id) => id !== userId);
    }
  });
  void guild;
}

export async function kickFromRoom(channel: VoiceChannel, userId: string) {
  const member = channel.members.get(userId);
  await member?.voice.disconnect('Limerence Bot — expulsé du salon temporaire');
  await denyMember(channel.guild, channel, userId);
}

export async function transferOwnership(
  guild: Guild,
  channel: VoiceChannel,
  newOwnerId: string,
) {
  await guild.members.fetch(newOwnerId);
  const room = await getRoom(channel.id);
  const oldOwnerId = room?.ownerId;
  if (oldOwnerId && oldOwnerId !== newOwnerId) {
    await channel.permissionOverwrites.edit(oldOwnerId, {
      ViewChannel: null,
      Connect: null,
      ManageChannels: null,
      MoveMembers: null,
      ManageRoles: null,
      MuteMembers: null,
    });
  }
  await channel.permissionOverwrites.edit(newOwnerId, {
    ViewChannel: true,
    Connect: true,
    ManageChannels: true,
    MoveMembers: true,
    ManageRoles: true,
    MuteMembers: true,
  });
  await updateState((s) => {
    const r = s.tempRooms.find((x) => x.channelId === channel.id);
    if (r) {
      r.ownerId = newOwnerId;
      r.allowed = r.allowed.filter((id) => id !== oldOwnerId);
      r.denied = r.denied.filter((id) => id !== newOwnerId);
    }
  });
}

export async function deleteRoom(channel: VoiceChannel, reason = 'Limerence Bot') {
  await channel.delete(reason);
  await forgetRoom(channel.id);
}

/** Nettoyage au démarrage : on oublie les salons qui n'existent plus. */
export async function reconcileTempRooms(guild: Guild) {
  await guild.channels.fetch().catch(() => undefined);
  const state = await getState();
  const alive = state.tempRooms.filter((room) => {
    const channel = guild.channels.cache.get(room.channelId);
    return Boolean(channel?.isVoiceBased());
  });
  if (alive.length !== state.tempRooms.length) {
    await updateState((s) => {
      s.tempRooms = alive;
    });
  }
  if (state.config.joinToCreate.autoDelete) {
    for (const room of alive) {
      const channel = guild.channels.cache.get(room.channelId);
      if (channel?.isVoiceBased() && channel.members.size === 0) scheduleDeletion(guild, room.channelId);
    }
  }
}
