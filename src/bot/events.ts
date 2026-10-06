import {
  ActionRowBuilder,
  ActivityType,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type VoiceChannel,
} from 'discord.js';
import { applyBlueprint, giveMemberRole } from '../lib/blueprint';
import { markReady } from '../lib/discord/client';
import { getState } from '../lib/store';
import { addLog } from '../lib/logs';
import { isOwner } from '../lib/auth';
import type { AppConfig } from '../lib/types';
import { handleChatInput, handleEmbedModalSubmit, registerCommands } from './commands';
import {
  markReviewMessageHandled,
  publishConfession,
  rejectConfession,
  submitConfession,
} from './confessions';
import {
  deleteRoom,
  forgetRoom,
  getRoom,
  handleVoiceStateUpdate,
  reconcileTempRooms,
  renameRoom,
  setRoomLimit,
  toggleLock,
  transferOwnership,
} from './tempRooms';
import { startScheduler } from './scheduler';
import { resolveFromCache } from './resolve';

// ============================================================
//  Branchement des événements Discord
// ============================================================

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, (ready) => {
    void onReady(ready);
  });

  client.on(Events.GuildMemberAdd, (member) => {
    void onMemberAdd(member);
  });

  client.on(Events.GuildMemberRemove, (member) => {
    void addLog({
      level: 'info',
      source: 'bot',
      action: 'Départ d’un membre',
      detail: member.user.tag,
    });
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void handleVoiceStateUpdate(oldState, newState).catch((err) =>
      console.error('[bot] voiceStateUpdate :', (err as Error).message),
    );
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void onInteraction(interaction);
  });
}

async function onReady(client: Client): Promise<void> {
  markReady();
  console.log(`[bot] connecté en tant que ${client.user?.tag}`);

  client.user?.setPresence({
    status: 'online',
    activities: [{ name: '/setup • Limerence', type: ActivityType.Watching }],
  });

  await registerCommands(client);

  const state = await getState();
  const guildId = state.config.guildId?.trim() || process.env.DISCORD_GUILD_ID?.trim();
  const guild =
    (guildId ? client.guilds.cache.get(guildId) : undefined) ?? client.guilds.cache.first() ?? null;

  if (guild) {
    if (!state.config.guildId) {
      const { updateState } = await import('../lib/store');
      await updateState((s) => {
        s.config.guildId = guild.id;
        s.meta.botTag = client.user?.tag;
      });
    }
    await reconcileTempRooms(guild).catch(() => undefined);
    await addLog({
      level: 'success',
      source: 'bot',
      action: 'Bot connecté',
      detail: `${client.user?.tag} — serveur « ${guild.name} »`,
    });

    if (state.config.autoSetupOnBoot) {
      await applyBlueprint(guild, { source: 'bot:démarrage' }).catch(() => undefined);
    }
  } else {
    await addLog({
      level: 'warn',
      source: 'bot',
      action: 'Aucun serveur détecté',
      detail: 'Invite le bot puis lance /setup, ou renseigne DISCORD_GUILD_ID.',
    });
  }

  startScheduler(client);
}

async function onMemberAdd(member: GuildMember): Promise<void> {
  try {
    const state = await getState();
    const gotRole = await giveMemberRole(member);
    if (gotRole) {
      await addLog({
        level: 'success',
        source: 'bot',
        action: `Rôle « ${state.config.role.name} » attribué`,
        detail: member.user.tag,
      });
    }

    // message de bienvenue dans le salon de présentation (sinon le chat)
    const guild = member.guild;
    const channel =
      resolveFromCache(guild, state.config, 'presentation') ??
      resolveFromCache(guild, state.config, 'chat');
    if (channel?.isTextBased()) {
      await channel.send({
        content: `<@${member.id}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xffffff)
            .setAuthor({ name: 'Bienvenue ✨', iconURL: member.user.displayAvatarURL() })
            .setDescription(
              [
                `Salut **${member.displayName}**, bienvenue sur **${guild.name}** !`,
                '',
                `Tu as reçu le rôle **${state.config.role.name}** — présente-toi ici et installe-toi bien 🌙`,
                'Une confession en tête ? Utilise `/confession`, c’est 100 % anonyme 🤫',
              ].join('\n'),
            )
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setTimestamp(),
        ],
        allowedMentions: { parse: ['users'] },
      });
    }
  } catch (err) {
    console.error('[bot] guildMemberAdd :', (err as Error).message);
  }
}

// ------------------------------------------------------------
//  Interactions : commandes, boutons, modales
// ------------------------------------------------------------

function memberIsAdmin(interaction: Interaction): boolean {
  if (!interaction.inGuild()) return false;
  if (isOwner(interaction.user.id)) return true;
  const allow = (process.env.ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.includes(interaction.user.id)) return true;
  const perms = interaction.memberPermissions;
  return Boolean(
    perms?.has(PermissionFlagsBits.ManageGuild) || perms?.has(PermissionFlagsBits.Administrator),
  );
}

async function onInteraction(interaction: Interaction): Promise<void> {
  try {
    const state = await getState();
    const config = state.config;

    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction, config);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction, config);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (await handleEmbedModalSubmit(interaction, config)) return;
      await handleModal(interaction, config);
      return;
    }
  } catch (err) {
    console.error('[bot] interaction :', (err as Error).message);
    const message = '❌ Une erreur est survenue. Réessaie ou vérifie le panel.';
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
  }
}

async function handleButton(interaction: ButtonInteraction, config: AppConfig): Promise<void> {
  const [scope, action, id] = interaction.customId.split(':');

  // ---------- validation des confessions ----------
  if (scope === 'conf') {
    if (!memberIsAdmin(interaction)) {
      await interaction.reply({ content: 'Réservé à l’équipe.', flags: MessageFlags.Ephemeral });
      return;
    }
    const guild = interaction.guild;
    if (!guild) return;
    const state = await getState();
    const confession = state.confessions.find((c) => c.id === id);
    if (!confession) {
      await interaction.reply({ content: 'Confession introuvable (déjà traitée ?).', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (action === 'approve') {
      const ok = await publishConfession(guild, confession);
      await markReviewMessageHandled(guild, confession.id, interaction.user.id);
      await interaction.editReply({
        content: ok ? '✅ Confession publiée anonymement.' : '❌ Publication impossible (salon confessions introuvable ?).',
      });
      return;
    }
    await rejectConfession(guild, confession.id, interaction.user.tag);
    await interaction.editReply({ content: '🗑️ Confession refusée.' });
    return;
  }

  // ---------- salons vocaux temporaires ----------
  if (scope === 'temp') {
    const guild = interaction.guild;
    if (!guild) return;
    const room = await getRoom(id);
    if (!room) {
      await interaction.reply({
        content: 'Ce salon temporaire n’existe plus.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const isController = room.ownerId === interaction.user.id || memberIsAdmin(interaction);
    if (!isController) {
      await interaction.reply({
        content: 'Seul le propriétaire du salon (ou un admin) peut faire ça.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = guild.channels.cache.get(id);
    if (!channel?.isVoiceBased()) {
      await interaction.reply({ content: 'Salon introuvable.', flags: MessageFlags.Ephemeral });
      return;
    }
    const voice = channel as VoiceChannel;

    switch (action) {
      case 'rename': {
        const modal = new ModalBuilder().setCustomId(`tempm:rename:${id}`).setTitle('Renommer ton salon');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Nouveau nom du salon')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(90)
              .setValue(voice.name.replace(/^🔊\s*/, ''))
              .setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        return;
      }
      case 'limit': {
        const modal = new ModalBuilder().setCustomId(`tempm:limit:${id}`).setTitle('Limite de places');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('limit')
              .setLabel('Places (0 = illimité, max 99)')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(2)
              .setValue(String(voice.userLimit ?? 0))
              .setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        return;
      }
      case 'togglelock': {
        const locked = await toggleLock(guild, voice);
        await interaction.reply({
          content: locked ? `🔒 **${voice.name}** est verrouillé.` : `🔓 **${voice.name}** est ouvert.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      case 'claim': {
        await transferOwnership(guild, voice, interaction.user.id);
        await interaction.reply({
          content: `👑 Tu es maintenant propriétaire de **${voice.name}**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      case 'delete': {
        await deleteRoom(voice, `Limerence Bot — supprimé par ${interaction.user.tag}`);
        await interaction.reply({ content: '🗑️ Salon supprimé.', flags: MessageFlags.Ephemeral });
        return;
      }
      default:
        await interaction.reply({ content: 'Action inconnue.', flags: MessageFlags.Ephemeral });
        return;
    }
    void config;
  }
}

async function handleModal(interaction: ModalSubmitInteraction, config: AppConfig): Promise<void> {
  const [scope, action, id] = interaction.customId.split(':');
  const guild = interaction.guild;

  if (interaction.customId === 'conf:modal') {
    if (!guild) return;
    const content = interaction.fields.getTextInputValue('content');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await submitConfession(guild, interaction.user.id, content);
    await interaction.editReply({ content: result.message });
    return;
  }

  if (scope !== 'tempm' || !guild) return;
  const room = await getRoom(id);
  const isController = room && (room.ownerId === interaction.user.id || memberIsAdmin(interaction));
  if (!isController) {
    await interaction.reply({ content: 'Action non autorisée.', flags: MessageFlags.Ephemeral });
    return;
  }
  const channel = guild.channels.cache.get(id);
  if (!channel?.isVoiceBased()) {
    await forgetRoom(id);
    await interaction.reply({ content: 'Salon introuvable.', flags: MessageFlags.Ephemeral });
    return;
  }
  const voice = channel as VoiceChannel;

  if (action === 'rename') {
    const name = interaction.fields.getTextInputValue('name');
    await renameRoom(voice, name);
    await interaction.reply({ content: `✏️ Salon renommé : **${voice.name}**`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === 'limit') {
    const raw = interaction.fields.getTextInputValue('limit').replace(/\D/g, '');
    const limit = Number(raw || '0');
    await setRoomLimit(voice, limit);
    await interaction.reply({
      content: limit > 0 ? `👥 Limite : **${limit} place(s)**` : '👥 Limite retirée (illimité).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  void config;
}
