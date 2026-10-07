import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  REST,
  Routes,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Interaction,
  type Client,
  type ModalSubmitInteraction,
  type VoiceChannel,
} from 'discord.js';
import { buildCommands } from './commandDefs';
import { getState } from '../lib/store';
import { getPublicUrl } from '../lib/auth';
import { isStaff, isStaffIn, replyFlags, resolveInteractionGuild } from './guards';
import { createAnnouncement, cancelAnnouncement, sendAnnouncement, parseSchedule } from './announcements';
import { submitConfession } from './confessions';
import {
  createEmbedTemplate,
  findEmbedTemplate,
  publishEmbed,
  removeEmbedTemplate,
  updateEmbedTemplate,
} from './embeds';
import { handleEconomyCommand, handleEconomyAdminCommand } from './economy';
import { handleBlackjackCommand } from './blackjack';
import { accentColor, uiView } from './ui';
import { handleShopCommand } from './shop';
import { handleModerationCommand } from './moderationCommands';
import { handleConfigCommand } from './config';
import {
  allowMember,
  deleteRoom,
  getRoom,
  kickFromRoom,
  renameRoom,
  setRoomLimit,
  toggleLock,
  transferOwnership,
} from './tempRooms';
import type { AppConfig } from '../lib/types';

// ============================================================
//  Enregistrement des commandes slash + dispatch
// ============================================================

/**
 * Réponse éphémère sur un serveur, réponse normale en MP : le drapeau
 * `Ephemeral` n'a pas de sens dans un salon privé et Discord refuse ces
 * réponses. Toutes les commandes passent par ici.
 */
function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

export async function registerCommands(client: Client): Promise<void> {
  const commands = buildCommands().map((command) => command.toJSON());
  const guildId = (await getState()).config.guildId?.trim() || process.env.DISCORD_GUILD_ID?.trim();
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN ?? '');

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: commands });
      console.log(`[bot] ${commands.length} commandes enregistrées sur le serveur ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
      console.log(`[bot] ${commands.length} commandes enregistrées globalement`);
    }
  } catch (err) {
    console.error('[bot] enregistrement des commandes impossible :', (err as Error).message);
  }
}

export async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
): Promise<void> {
  const name = interaction.commandName;

  if (name === 'config') {
    await handleConfigCommand(interaction);
    return;
  }

  // ---- économie / jeux / boutique ----
  if (
    [
      'balance',
      'profil',
      'daily',
      'work',
      'crime',
      'rob',
      'beg',
      'search',
      'pay',
      'bank',
      'leaderboard',
      'inventaire',
      'revendre',
    ].includes(name)
  ) {
    const economy = config.economy;
    if (economy.economyChannelOnly && economy.economyAllowedChannels.length) {
      if (!economy.economyAllowedChannels.includes(interaction.channelId)) {
        await interaction.reply({
          content: `💰 Ces commandes sont réservées à : ${economy.economyAllowedChannels.map((id) => `<#${id}>`).join(' ')}`,
          ...ephemOf(interaction),
        });
        return;
      }
    }
    await handleEconomyCommand(interaction, name);
    return;
  }

  if (name === 'blackjack') {
    await handleBlackjackCommand(interaction);
    return;
  }
  if (name === 'shop') {
    await handleShopCommand(interaction);
    return;
  }
  if (name === 'economie') {
    if (!isStaff(interaction)) {
      await interaction.reply({ content: 'Réservé aux administrateurs.', ...ephemOf(interaction) });
      return;
    }
    await handleEconomyAdminCommand(interaction);
    return;
  }

  // ---- modération ----
  const moderationCommands = [
    'warn',
    'cas',
    'kick',
    'ban',
    'unban',
    'softban',
    'mute',
    'unmute',
    'nick',
    'purge',
    'lock',
    'unlock',
    'lockdown',
    'unlockdown',
    'slowmode',
    'nuke',
    'addrole',
    'removerole',
    'userinfo',
    'serverinfo',
    'roleinfo',
    'banlist',
    'antiraid',
    'aide',
  ];
  if (moderationCommands.includes(name)) {
    await handleModerationCommand(interaction, name);
    return;
  }

  // ---- animation & utilitaires ----
  switch (name) {
    case 'confession':
      await handleConfession(interaction, config);
      return;
    case 'annonce':
    case 'annonces':
      await handleAnnouncement(interaction, name);
      return;
    case 'embed':
    case 'regles':
      await handleEmbedCommand(interaction, name);
      return;
    case 'vocal':
      await handleVoiceCommand(interaction);
      return;
    case 'panel': {
      const url = await getPublicUrl();

      // Le menu central regroupe toute l'interface du bot.
      if (config.ui.hubEnabled) {
        const state = await getState();
        const view = uiView('hub', state, config, {
          userId: interaction.user.id,
          userName: interaction.user.tag ?? interaction.user.username,
          avatarUrl: interaction.user.displayAvatarURL({ size: 128 }),
          isStaff: isStaff(interaction),
          guildName: interaction.guild?.name ?? 'Serveur',
          memberCount: interaction.guild?.memberCount ?? 0,
          channelCount: interaction.guild?.channels.cache.size ?? 0,
          roleCount: interaction.guild?.roles.cache.size ?? 0,
          webUrl: url,
        });
        await interaction.reply({ embeds: view.embeds, components: view.components, ...ephemOf(interaction) });
        return;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(accentColor(config.ui))
            .setAuthor({ name: '🖥️ Panel d’administration Limerence' })
            .setDescription(
              `**${url}**\n\nConnexion avec ton compte Discord (permission « Gérer le serveur » requise).\nTu y configures l’économie (${Object.keys(config.economy).length} options), le blackjack, la boutique, la modération et l’interface.`,
            ),
        ],
        ...ephemOf(interaction),
      });
      return;
    }
    case 'ping': {
      await interaction.reply({
        content: `🏓 Pong ! WebSocket : **${Math.round(interaction.client.ws.ping)} ms** · API : **${Date.now() - interaction.createdTimestamp} ms**`,
        ...ephemOf(interaction),
      });
      return;
    }
    default:
      await interaction.reply({ content: 'Commande inconnue.', ...ephemOf(interaction) });
  }
}

// ------------------------------------------------------------
//  Confessions
// ------------------------------------------------------------

async function handleConfession(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
): Promise<void> {
  if (!config.confessions.enabled) {
    await interaction.reply({ content: 'Les confessions sont désactivées.', ...ephemOf(interaction) });
    return;
  }
  const message = interaction.options.getString('message');
  if (!message) {
    const modal = new ModalBuilder().setCustomId('confession:submit').setTitle('🤫 Confession anonyme');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Ta confession (100 % anonyme)')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(3)
          .setMaxLength(Math.min(2000, config.confessions.maxLength))
          .setRequired(true),
      ),
    );
    await interaction.showModal(modal);
    return;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Les confessions s’envoient depuis un serveur.', ...ephemOf(interaction) });
    return;
  }
  await interaction.deferReply(replyFlags(interaction));
  const result = await submitConfession(guild, interaction.user.id, message);
  await interaction.editReply({ content: result.message });
}

export async function handleConfessionModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== 'confession:submit') return false;
  const content = interaction.fields.getTextInputValue('content');
  await interaction.deferReply(replyFlags(interaction));
  if (!interaction.guild) {
    await interaction.editReply({ content: 'Les confessions s’envoient depuis un serveur.' });
    return true;
  }
  const result = await submitConfession(interaction.guild, interaction.user.id, content);
  await interaction.editReply({ content: result.message });
  return true;
}

// ------------------------------------------------------------
//  Annonces
// ------------------------------------------------------------

async function handleAnnouncement(interaction: ChatInputCommandInteraction, name: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Réservé à un serveur.', ...ephemOf(interaction) });
    return;
  }
  const author = interaction.user.tag ?? interaction.user.username;

  if (name === 'annonces') {
    const sub = interaction.options.getSubcommand();
    const state = await getState();
    if (sub === 'annuler') {
      const id = interaction.options.getString('id', true);
      await cancelAnnouncement(state.announcements.find((a) => a.id.startsWith(id))?.id ?? id);
      await interaction.reply({ content: '🗑️ Annonce annulée.', ...ephemOf(interaction) });
      return;
    }
    const items = state.announcements.slice(0, 15);
    const lines = items.map(
      (announcement) =>
        `• \`${announcement.id.slice(0, 8)}\` ${announcement.status === 'scheduled' ? '⏰' : announcement.status === 'sent' ? '✅' : '❌'} ${announcement.content.slice(0, 60).replace(/\n/g, ' ')}${announcement.scheduledFor ? ` — <t:${Math.floor(new Date(announcement.scheduledFor).getTime() / 1000)}:R>` : ''}`,
    );
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffc2d9)
          .setTitle('📣 Annonces')
          .setDescription((lines.join('\n') || 'Aucune annonce.').slice(0, 4000)),
      ],
      ...ephemOf(interaction),
    });
    return;
  }

  const content = interaction.options.getString('message', true);
  const channel = interaction.options.getChannel('salon');
  const when = interaction.options.getString('quand');
  const ping = (interaction.options.getString('mention') ?? 'none') as 'none' | 'here' | 'everyone';

  const schedule = parseSchedule(when);
  if (schedule.error) {
    await interaction.reply({ content: `❌ ${schedule.error}`, ...ephemOf(interaction) });
    return;
  }

  await interaction.deferReply(replyFlags(interaction));
  const created = await createAnnouncement({
    content,
    channelId: channel?.id ?? '',
    scheduledFor: when,
    createdBy: `discord:${author}`,
    ping,
  });
  if (!created.ok || !created.announcement) {
    await interaction.editReply({ content: `❌ ${created.error ?? 'Création impossible.'}` });
    return;
  }
  if (schedule.date) {
    await interaction.editReply({
      content: `⏰ Annonce programmée pour le ${schedule.date.toLocaleString('fr-FR')} (<t:${Math.floor(schedule.date.getTime() / 1000)}:R>).`,
    });
    return;
  }
  const sent = await sendAnnouncement(guild, created.announcement);
  await interaction.editReply({
    content: sent ? '✅ Annonce publiée.' : '❌ Envoi impossible : configure le salon annonces dans le panel.',
  });
}

// ------------------------------------------------------------
//  Embeds personnalisés & règlement
// ------------------------------------------------------------

function embedModal(mode: 'create' | 'edit' | 'rules', targetId = 'none', name = ''): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(mode === 'rules' ? 'rules:create' : `embed:${mode}:${targetId}`)
    .setTitle(mode === 'rules' ? '📜 Règlement du serveur' : mode === 'create' ? '🪄 Nouvel embed' : '🪄 Modifier l’embed');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Titre')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(256)
        .setValue(name)
        .setRequired(true),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description (Markdown accepté)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(4000)
        .setRequired(true),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('color')
        .setLabel('Couleur (#RRGGBB)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(7)
        .setValue('#C9B8FF')
        .setRequired(true),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('footer')
        .setLabel('Pied de page (facultatif)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(200)
        .setRequired(false),
    ),
  );
  if (mode === 'create') {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Nom du modèle')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(64)
          .setRequired(true),
      ),
    );
  }
  return modal;
}

async function handleEmbedCommand(interaction: ChatInputCommandInteraction, name: string): Promise<void> {
  if (name === 'regles') {
    const state = await getState();
    const existing = state.embeds.find((template) => template.name.toLowerCase() === 'règlement');
    await interaction.showModal(embedModal('rules', 'none', existing?.title ?? ''));
    return;
  }

  const sub = interaction.options.getSubcommand();
  const author = interaction.user.tag ?? interaction.user.username;

  if (sub === 'creer') {
    const channel = interaction.options.getChannel('salon');
    await interaction.showModal(embedModal('create', channel?.id ?? 'none'));
    return;
  }

  if (sub === 'liste') {
    const state = await getState();
    const lines = state.embeds.map(
      (template) => `• \`${template.id.slice(0, 8)}\` **${template.name}**${template.channelId ? ` → <#${template.channelId}>` : ''}`,
    );
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xc9b8ff)
          .setTitle('🪄 Modèles d’embed')
          .setDescription((lines.join('\n') || 'Aucun modèle enregistré.').slice(0, 4000)),
      ],
      ...ephemOf(interaction),
    });
    return;
  }

  const reference = interaction.options.getString('id', true);
  const template = await findEmbedTemplate(reference);
  if (!template) {
    await interaction.reply({ content: '❌ Modèle introuvable.', ...ephemOf(interaction) });
    return;
  }

  if (sub === 'publier') {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Réservé à un serveur.', ...ephemOf(interaction) });
      return;
    }
    const channel = interaction.options.getChannel('salon') ?? null;
    const channelId =
      channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
        ? channel.id
        : template.channelId;
    if (!channelId) {
      await interaction.reply({ content: '❌ Choisis un salon de destination.', ...ephemOf(interaction) });
      return;
    }
    const result = await publishEmbed(guild, template, channelId, `discord:${author}`);
    await interaction.reply({ content: result.message ?? 'Embed publié.', ...ephemOf(interaction) });
    return;
  }

  if (sub === 'modifier') {
    await interaction.showModal(embedModal('edit', template.id, template.title ?? template.name));
    return;
  }

  if (sub === 'supprimer') {
    const removed = await removeEmbedTemplate(template.id, `discord:${author}`);
    await interaction.reply({ content: removed ? `🗑️ Modèle **${template.name}** supprimé.` : '❌ Suppression impossible.', ...ephemOf(interaction) });
  }
}

export async function handleEmbedModalSubmit(
  interaction: ModalSubmitInteraction,
  config: AppConfig,
): Promise<boolean> {
  const isRules = interaction.customId === 'rules:create';
  const [scope, action, targetId] = interaction.customId.split(':');
  if (!isRules && scope !== 'embed') return false;
  const guild = interaction.guild;
  if (!guild || !isStaff(interaction)) {
    await interaction.reply({ content: 'Réservé aux administrateurs du serveur.', ...replyFlags(interaction) });
    return true;
  }

  await interaction.deferReply(replyFlags(interaction));
  const author = interaction.user.tag ?? interaction.user.username;
  const title = interaction.fields.getTextInputValue('title').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const color = interaction.fields.getTextInputValue('color').trim();
  const footer = interaction.fields.getTextInputValue('footer').trim();

  if (isRules) {
    const state = await getState();
    const existing = state.embeds.find((template) => template.name.toLowerCase() === 'règlement');
    const channelId = config.channels.rules || '';
    const input = { name: 'Règlement', title, description, color, footer, channelId };
    const saved = existing
      ? await updateEmbedTemplate(existing.id, input, `discord:${author}`)
      : await createEmbedTemplate(input, `discord:${author}`);
    if (!saved.ok || !saved.template) {
      await interaction.editReply({ content: `❌ ${saved.message ?? 'Enregistrement impossible.'}` });
      return true;
    }
    if (!channelId) {
      await interaction.editReply({
        content: '✅ Règlement enregistré en brouillon. Configure le salon « Règlement » dans le panel pour le publier.',
      });
      return true;
    }
    const published = await publishEmbed(guild, saved.template, channelId, `discord:${author}`);
    await interaction.editReply({ content: published.message ?? 'Règlement enregistré.' });
    return true;
  }

  if (action === 'create') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const channelId = targetId && targetId !== 'none' ? targetId : undefined;
    const saved = await createEmbedTemplate(
      { name, title, description, color, footer, ...(channelId ? { channelId } : {}) },
      `discord:${author}`,
    );
    if (!saved.ok || !saved.template) {
      await interaction.editReply({ content: `❌ ${saved.message ?? 'Enregistrement impossible.'}` });
      return true;
    }
    if (!channelId) {
      await interaction.editReply({
        content: `✅ Modèle **${saved.template.name}** enregistré. Publie-le avec /embed publier.`,
      });
      return true;
    }
    const published = await publishEmbed(guild, saved.template, channelId, `discord:${author}`);
    await interaction.editReply({ content: published.message ?? 'Modèle enregistré.' });
    return true;
  }

  if (action === 'edit') {
    const state = await getState();
    const existing = state.embeds.find((template) => template.id === targetId);
    if (!existing) {
      await interaction.editReply({ content: '❌ Modèle introuvable.' });
      return true;
    }
    const updated = await updateEmbedTemplate(
      targetId,
      { name: existing.name, title, description, color, footer, fields: existing.fields },
      `discord:${author}`,
    );
    await interaction.editReply({
      content: updated.ok
        ? `✅ Modèle **${updated.template?.name}** modifié.`
        : `❌ ${updated.message ?? 'Modification impossible.'}`,
    });
    return true;
  }

  await interaction.editReply({ content: 'Sous-commande embed inconnue.' });
  return true;
}

// ------------------------------------------------------------
//  Vocaux temporaires
// ------------------------------------------------------------

async function handleVoiceCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Utilisable en MP : le panneau de contrôle est envoyé en message privé,
  // la commande doit donc retrouver le serveur géré par le bot.
  const guild = await resolveInteractionGuild(interaction);
  if (!guild) {
    await interaction.reply({
      content: 'Je ne retrouve pas le serveur : précise le serveur dans le panel (Réglages) ou utilise la commande dessus.',
      ...replyFlags(interaction),
    });
    return;
  }
  const staff = await isStaffIn(interaction, guild);
  const flags = replyFlags(interaction);
  const sub = interaction.options.getSubcommand();

  if (sub === 'reclamer') {
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const channel = member?.voice?.channel as VoiceChannel | null | undefined;
    if (!channel) {
      await interaction.reply({
        content: interaction.guildId
          ? 'Rejoins d’abord un salon vocal temporaire.'
          : `Rejoins d’abord un salon vocal temporaire sur **${guild.name}**.`,
        ...flags,
      });
      return;
    }
    const room = await getRoom(channel.id);
    if (!room) {
      await interaction.reply({ content: 'Ce salon n’est pas un salon temporaire.', ...flags });
      return;
    }
    const previousOwnerPresent = channel.members.has(room.ownerId);
    if (room.ownerId !== interaction.user.id && previousOwnerPresent && !staff) {
      await interaction.reply({ content: 'Le propriétaire est encore là : seul un admin peut reprendre le salon.', ...flags });
      return;
    }
    await transferOwnership(guild, channel, interaction.user.id);
    await interaction.reply({ content: `👑 Tu es maintenant propriétaire de **${channel.name}**.`, ...flags });
    return;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const channel = member?.voice?.channel as VoiceChannel | null | undefined;
  if (!channel) {
    await interaction.reply({
      content: interaction.guildId
        ? 'Rejoins d’abord ton salon vocal.'
        : `Rejoins d’abord ton salon vocal sur **${guild.name}**.`,
      ...flags,
    });
    return;
  }
  const room = await getRoom(channel.id);
  if (!room || (room.ownerId !== interaction.user.id && !staff)) {
    await interaction.reply({ content: 'Ce salon ne t’appartient pas.', ...flags });
    return;
  }

  await interaction.deferReply(flags);
  switch (sub) {
    case 'renommer': {
      const name = interaction.options.getString('nom', true);
      await renameRoom(channel, name);
      await interaction.editReply({ content: `✏️ Salon renommé : **${channel.name}**` });
      return;
    }
    case 'limite': {
      await setRoomLimit(channel, interaction.options.getInteger('places', true));
      await interaction.editReply({ content: '👥 Limite mise à jour.' });
      return;
    }
    case 'verrouiller': {
      const locked = await toggleLock(guild, channel);
      await interaction.editReply({ content: locked ? '🔒 Salon verrouillé.' : '🔓 Salon ouvert.' });
      return;
    }
    case 'autoriser': {
      const user = interaction.options.getUser('membre', true);
      await allowMember(guild, channel, user.id);
      await interaction.editReply({ content: `✅ <@${user.id}> peut rejoindre ton salon.` });
      return;
    }
    case 'expulser': {
      const user = interaction.options.getUser('membre', true);
      await kickFromRoom(channel, user.id);
      await interaction.editReply({ content: `👋 <@${user.id}> a été expulsé.` });
      return;
    }
    case 'transferer': {
      const user = interaction.options.getUser('membre', true);
      await transferOwnership(guild, channel, user.id);
      await interaction.editReply({ content: `👑 <@${user.id}> est le nouveau propriétaire.` });
      return;
    }
    case 'supprimer': {
      await deleteRoom(channel, `Limerence Bot — supprimé par ${interaction.user.tag ?? interaction.user.username}`);
      await interaction.editReply({ content: '🗑️ Salon supprimé.' });
      return;
    }
    default:
      await interaction.editReply({ content: 'Sous-commande inconnue.' });
  }
}

export { parseSchedule };
