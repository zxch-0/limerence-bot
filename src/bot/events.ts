import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type BaseGuildTextChannel,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type Interaction,
  type Message,
  type ModalSubmitInteraction,
  type MessageReaction,
  type PartialGuildMember,
  type PartialMessageReaction,
  type PartialUser,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { markReady } from '../lib/discord/client';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { isEnvAdmin } from '../lib/owner';
import { resolveChannelById, resolveSlotChannel } from '../lib/channels';
import { renderWelcome, welcomeChannelId } from '../lib/welcome';
import { credit, ensureAccount, formatMoney } from '../lib/economy/core';
import { accountAgeDays } from '../lib/economy/actions';
import { inspectMessage } from '../lib/moderation/automod';
import { createCase } from '../lib/moderation/cases';
import { giveWelcomeRole } from './roles';
import { isStaffIn, replyFlags, resolveInteractionGuild } from './guards';
import { cardEmbed, featureFlags, sectionById, uiView, visibleSections, type UiContext, type UiSectionId } from './ui';
import {
  findInviter,
  handleMessageReward,
  handleReactionReward,
  penalizeInviter,
  previousMessage,
  processVoiceRewards,
  rewardInviter,
  snapshotInvites,
  trackVoiceJoin,
  trackVoiceLeave,
  claimDrop,
} from './rewards';
import { handleChatInput, handleConfessionModal, handleEmbedModalSubmit } from './commands';
import { markReviewMessageHandled, publishConfession, rejectConfession } from './confessions';
import { handleBlackjackButton } from './blackjack';
import { handleShopButton, handleShopSelect } from './shop';
import { moderationChannel } from './moderation';
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

// ============================================================
//  Branchement des événements Discord
// ============================================================

const joinTimestamps: number[] = [];

/** Ne garde que les salons textuels valides d'une collection Discord. */
function textChannelsOf(values: Iterable<GuildBasedChannel | null | undefined>): GuildBasedChannel[] {
  return [...values].filter(
    (channel): channel is GuildBasedChannel =>
      channel !== null &&
      channel !== undefined &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement),
  );
}

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, (ready) => {
    void onReady(ready);
  });
  client.on(Events.GuildMemberAdd, (member) => {
    void onMemberAdd(member).catch((err) => console.error('[bot] guildMemberAdd :', (err as Error).message));
  });
  client.on(Events.GuildMemberRemove, (member) => {
    void onMemberRemove(member).catch((err) => console.error('[bot] guildMemberRemove :', (err as Error).message));
  });
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void handleVoiceStateUpdate(oldState, newState).catch((err) =>
      console.error('[bot] voiceStateUpdate :', (err as Error).message),
    );
    const guild = newState.guild ?? oldState.guild;
    const member = newState.member ?? oldState.member;
    if (guild && member) {
      if (newState.channelId) trackVoiceJoin(guild.id, member.id);
      else trackVoiceLeave(guild.id, member.id);
    }
  });
  client.on(Events.MessageCreate, (message) => {
    void onMessage(message).catch((err) => console.error('[bot] messageCreate :', (err as Error).message));
  });
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    void onReaction(reaction, user).catch(() => undefined);
  });
  client.on(Events.InteractionCreate, (interaction) => {
    void onInteraction(interaction);
  });
}

async function onReady(client: Client): Promise<void> {
  markReady();
  console.log(`[bot] connecté en tant que ${client.user?.tag}`);

  const state = await getState();
  client.user?.setPresence({
    status: 'online',
    activities: [
      {
        name: `${Object.keys(state.config.economy).length} options éco • /aide`,
        type: ActivityType.Watching,
      },
    ],
  });

  const { registerCommands } = await import('./commands');
  await registerCommands(client);

  const guildId = state.config.guildId?.trim() || process.env.DISCORD_GUILD_ID?.trim();
  const guild =
    (guildId ? await client.guilds.fetch(guildId).catch(() => null) : null) ??
    client.guilds.cache.first() ??
    null;

  if (guild) {
    if (!state.config.guildId) {
      await updateState((s) => {
        s.config.guildId = guild.id;
        s.meta.botTag = client.user?.tag;
        s.meta.installedAt ??= new Date().toISOString();
      });
    }
    await guild.channels.fetch().catch(() => undefined);
    await reconcileTempRooms(guild).catch(() => undefined);
    await snapshotInvites(guild).catch(() => undefined);
    await addLog({
      level: 'success',
      source: 'bot',
      action: 'Bot connecté',
      detail: `${client.user?.tag} — serveur « ${guild.name} »`,
    });
  } else {
    await addLog({
      level: 'warn',
      source: 'bot',
      action: 'Aucun serveur détecté',
      detail: 'Invite le bot sur ton serveur ou renseigne DISCORD_GUILD_ID.',
    });
  }

  startScheduler(client);
}

// ------------------------------------------------------------
//  Arrivées & départs
// ------------------------------------------------------------

async function onMemberAdd(member: GuildMember): Promise<void> {
  const guild = member.guild;
  const state = await getState();
  const moderation = state.config.moderation;
  const now = Date.now();

  // ---- anti-raid ----
  if (moderation.raidProtectionEnabled) {
    joinTimestamps.push(now);
    while (joinTimestamps.length && now - joinTimestamps[0] > moderation.raidJoinWindowSeconds * 1000) {
      joinTimestamps.shift();
    }
    if (joinTimestamps.length >= moderation.raidJoinThreshold) {
      joinTimestamps.length = 0;
      await triggerRaidProtection(guild, moderation.raidLockdownMinutes);
    }
    if (moderation.raidMinAccountAgeDays > 0) {
      const age = accountAgeDays(member.id);
      if (age < moderation.raidMinAccountAgeDays) {
        await member
          .kick(`Compte trop récent (${Math.floor(age)} jour(s))`)
          .catch(() => undefined);
        await addLog({
          level: 'moderation',
          source: 'bot',
          action: 'Arrivée refusée (compte récent)',
          detail: `${member.user.tag ?? member.id} — ${Math.floor(age)} jour(s)`,
        });
        return;
      }
    }
  }

  // ---- rôle d'accueil ----
  const gotRole = await giveWelcomeRole(member);
  if (gotRole) {
    await addLog({
      level: 'success',
      source: 'bot',
      action: 'Rôle d’accueil attribué',
      detail: member.user.tag ?? member.id,
    });
  }

  // ---- économie : prime d'arrivée ----
  const economy = state.config.economy;
  if (economy.enabled && economy.joinBonusEnabled && !member.user.bot) {
    const age = accountAgeDays(member.id);
    if (age >= economy.joinBonusMinAccountAgeDays) {
      const amount = await updateState((s) => {
        const account = ensureAccount(s, member.id);
        const paid = credit(account, s.config.economy, s.config.economy.joinBonusAmount, 'join', 'Prime d’arrivée');
        return paid.amount;
      });
      if (economy.joinBonusDirectMessage) {
        await member.user
          .send(`🎁 Bienvenue sur **${guild.name}** : tu démarres avec ${formatMoney(economy, amount)}.`)
          .catch(() => undefined);
      }
    }
  }

  // ---- invitation ----
  if (!member.user.bot) {
    const inviterId = await findInviter(guild, member).catch(() => null);
    if (inviterId) {
      await rewardInviter(guild, inviterId, member.id);
      void updateState((s) => {
        createCase(s, {
          guildId: guild.id,
          type: 'note',
          userId: member.id,
          userName: member.user.tag ?? member.id,
          moderatorId: 'bot',
          moderatorName: 'Invitation',
          reason: `Invité par ${inviterId}`,
        });
        return null;
      });
    }
  }

  // ---- message de bienvenue ----
  if (!state.config.welcome.enabled) return;

  // Salon choisi dans le panel > emplacement « Bienvenue » > « Salon principal »
  const channelId = welcomeChannelId(state.config);
  const channel = channelId
    ? await resolveChannelById(guild, channelId)
    : await resolveSlotChannel(guild, state.config, 'general', { fallback: true });
  if (!channel) {
    await addLog({
      level: 'warn',
      source: 'bot',
      action: 'Message de bienvenue ignoré',
      detail: 'Aucun salon d’accueil associé (panel → Accueil & salons).',
    });
    return;
  }

  const account = state.accounts[member.id];
  const vars = {
    userId: member.id,
    displayName: member.displayName,
    username: member.user.username,
    guildName: guild.name,
    memberCount: guild.memberCount,
    balance: formatMoney(economy, account ? account.cash : economy.startBalance),
    invites: account?.invitesRewarded ?? 0,
  };
  const text = renderWelcome(state.config.welcome.message, vars);

  const ui = state.config.ui;
  const embed = cardEmbed(ui, {
    section: 'community',
    title: `${ui.accentEmoji} Bienvenue sur ${guild.name}`,
    description: text,
    fields: [],
    footer: ui.showFooter ? ui.footerText : undefined,
    thumbnail: ui.useThumbnails ? member.user.displayAvatarURL({ size: 256 }) : undefined,
  });
  embed.setAuthor({ name: 'Bienvenue ✨', iconURL: member.user.displayAvatarURL() });

  // boutons d'accès rapide vers le menu central du bot
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (ui.welcomeQuickActions && ui.hubEnabled) {
    const sections = visibleSections(ui, featureFlags(state.config), false).slice(0, Math.max(1, ui.cardMaxButtons - 1));
    const buttons = sections.map(
      (section) =>
        new ButtonBuilder()
          .setCustomId(`ui:go:${section.id}`)
          .setLabel(section.label.slice(0, 80))
          .setEmoji(section.emoji)
          .setStyle(ButtonStyle.Secondary),
    );
    buttons.unshift(
      new ButtonBuilder().setCustomId('ui:go:hub').setLabel('Menu du bot').setEmoji('🧭').setStyle(ButtonStyle.Primary),
    );
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5)));
  }

  await channel
    .send({
      content: state.config.welcome.mentionMember ? `<@${member.id}>` : undefined,
      embeds: [embed],
      components,
      allowedMentions: { parse: ['users'] },
    })
    .catch(() => undefined);

  if (state.config.welcome.directMessage) {
    await member.user.send(renderWelcome(state.config.welcome.directMessage, vars)).catch(() => undefined);
  }
}

async function triggerRaidProtection(guild: Guild, lockdownMinutes: number): Promise<void> {
  const state = await getState();
  await addLog({
    level: 'error',
    source: 'bot',
    action: '🚨 Anti-raid déclenché',
    detail: `Arrivées en masse détectées sur ${guild.name}`,
  });
  const channel = await moderationChannel(guild);
  await channel
    ?.send({
      content: `🚨 **Arrivées en masse détectées** — protection anti-raid déclenchée${state.config.moderation.raidLockdown ? ` (verrouillage ${lockdownMinutes} min)` : ''}.`,
    })
    .catch(() => undefined);

  if (!state.config.moderation.raidLockdown) return;
  const channels = await guild.channels.fetch().catch(() => null);
  await Promise.all(
    textChannelsOf(channels?.values() ?? []).map((entry) =>
      (entry as BaseGuildTextChannel).permissionOverwrites
        .edit(guild.roles.everyone.id, { SendMessages: false })
        .catch(() => undefined),
    ),
  );

  setTimeout(() => {
    void unlockAfterRaid(guild);
  }, Math.max(1, lockdownMinutes) * 60_000);
}

async function unlockAfterRaid(guild: Guild): Promise<void> {
  const fresh = await guild.client.guilds.fetch(guild.id).catch(() => null);
  if (!fresh) return;
  const channels = await fresh.channels.fetch().catch(() => null);
  await Promise.all(
    textChannelsOf(channels?.values() ?? []).map((entry) =>
      (entry as BaseGuildTextChannel).permissionOverwrites
        .edit(fresh.roles.everyone.id, { SendMessages: null })
        .catch(() => undefined),
    ),
  );
  await addLog({ level: 'success', source: 'bot', action: 'Fin du lockdown anti-raid', detail: fresh.name });
}

async function onMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
  const state = await getState();
  await addLog({
    level: 'info',
    source: 'bot',
    action: 'Départ d’un membre',
    detail: member.user?.tag ?? member.id,
  });
  await penalizeInviter(member.guild, member.id).catch(() => undefined);
  if (state.config.economy.resetOnLeave) {
    await updateState((s) => {
      delete s.accounts[member.id];
      return null;
    });
  }
}

// ------------------------------------------------------------
//  Messages : auto-modération + récompense
// ------------------------------------------------------------

async function onMessage(message: Message): Promise<void> {
  if (!message.guild) return;
  const state = await getState();
  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

  const verdict = inspectMessage(state.config.moderation, {
    content: message.content ?? '',
    channelId: message.channelId,
    memberRoleIds: member ? member.roles.cache.map((role) => role.id) : [],
    isBot: message.author.bot,
    previousContent: previousMessage(message.author.id)?.content,
    previousAt: previousMessage(message.author.id)?.at,
    mentionCount: message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0),
    now: Date.now(),
  });

  if (verdict.action !== 'none') {
    await applyAutomod(message, member, verdict.reason, verdict.action, verdict.rule ?? 'automod');
    return;
  }

  await handleMessageReward(message);
}

async function applyAutomod(
  message: Message,
  member: GuildMember | null,
  reason: string,
  action: string,
  rule: string,
): Promise<void> {
  const guild = message.guild;
  if (!guild) return;
  await message.delete().catch(() => undefined);

  const channel = await moderationChannel(guild);
  await channel
    ?.send({
      content: `🤖 **Auto-modération** (${rule}) — message de <@${message.author.id}> supprimé : ${reason}`,
      allowedMentions: { parse: ['users'] },
    })
    .catch(() => undefined);

  const moderator = { id: 'automod', name: 'Auto-modération' };
  await updateState((s) => {
    createCase(s, {
      guildId: guild.id,
      type: 'automod',
      userId: message.author.id,
      userName: message.author.tag ?? message.author.username,
      moderatorId: moderator.id,
      moderatorName: moderator.name,
      reason: `${rule} — ${reason}`,
      channelId: message.channelId,
    });
    return null;
  });

  await addLog({
    level: 'moderation',
    source: 'automod',
    action: `Auto-modération (${rule})`,
    detail: `${message.author.tag ?? message.author.id} — ${reason}`,
  });

  if (!member || member.user.bot) return;
  const state = await getState();
  const config = state.config.moderation;

  try {
    if (action === 'warn') {
      const { warnMember } = await import('./moderation');
      await warnMember({
        guild,
        target: member,
        reason: `Auto-modération (${rule}) : ${reason}`,
        moderator,
        notifyChannel: false,
      });
    } else if (action === 'timeout') {
      await member.timeout(Math.min(40_320, config.automodTimeoutMinutes) * 60_000, `Auto-modération : ${reason}`);
    } else if (action === 'kick') {
      await member.kick(`Auto-modération : ${reason}`);
    } else if (action === 'ban') {
      await guild.members.ban(member.id, {
        reason: `Auto-modération : ${reason}`,
        deleteMessageSeconds: config.banDeleteMessageDays * 86_400,
      });
    }
  } catch (err) {
    await addLog({
      level: 'error',
      source: 'automod',
      action: 'Sanction automatique impossible',
      detail: (err as Error).message,
    });
  }
}

async function onReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  const fullReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  if (!fullReaction) return;
  const fullUser = (user.partial ? await user.fetch().catch(() => null) : user) as User | null;
  if (!fullUser) return;
  await handleReactionReward(fullReaction, fullUser);
}

// ------------------------------------------------------------
//  Interactions
// ------------------------------------------------------------

function memberIsAdmin(interaction: Interaction): boolean {
  if (!interaction.inGuild()) return false;
  if (isEnvAdmin(interaction.user.id)) return true;
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
      await handleButton(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (await handleUiSelect(interaction)) return;
      if (await handleShopSelect(interaction)) return;
      return;
    }
    if (interaction.isModalSubmit()) {
      if (await handleConfessionModal(interaction)) return;
      if (await handleEmbedModalSubmit(interaction, config)) return;
      await handleTempRoomModal(interaction);
      return;
    }
  } catch (err) {
    console.error('[bot] interaction :', (err as Error).message);
    const message = '❌ Une erreur est survenue. Réessaie ou vérifie le panel.';
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ...replyFlags(interaction) }).catch(() => undefined);
      } else {
        await interaction.reply({ content: message, ...replyFlags(interaction) }).catch(() => undefined);
      }
    }
  }
}

// ------------------------------------------------------------
//  Menu central : navigation entre les sections du bot
// ------------------------------------------------------------

async function uiContextOf(interaction: Interaction): Promise<UiContext | null> {
  const guild = interaction.guild;
  if (!guild) return null;
  const { getPublicUrl } = await import('../lib/auth');
  return {
    userId: interaction.user.id,
    userName: interaction.user.tag ?? interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL({ size: 128 }),
    isStaff: memberIsAdmin(interaction),
    guildName: guild.name,
    memberCount: guild.memberCount,
    channelCount: guild.channels.cache.size,
    roleCount: guild.roles.cache.size,
    webUrl: await getPublicUrl().catch(() => null),
  };
}

/**
 * Affiche une section du menu central.
 * `mode = 'nav'` met à jour le message courant (navigation dans le menu),
 * `mode = 'go'` répond en privé (boutons posés dans un autre message,
 * par exemple celui de bienvenue).
 */
async function showUiSection(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  section: UiSectionId,
  mode: 'nav' | 'go',
): Promise<void> {
  const state = await getState();
  const config = state.config;
  const ui = config.ui;

  if (!ui.hubEnabled) {
    await interaction.reply({ content: 'Le menu central est désactivé dans le panel.', ...replyFlags(interaction) });
    return;
  }

  const staff = memberIsAdmin(interaction);
  if (ui.hubStaffOnly && !staff) {
    await interaction.reply({ content: 'Le menu central est réservé à l’équipe.', ...replyFlags(interaction) });
    return;
  }
  if (section === 'moderation' && ui.moderationStaffOnly && !staff) {
    await interaction.reply({ content: 'Cette section est réservée à l’équipe.', ...replyFlags(interaction) });
    return;
  }

  const ctx = await uiContextOf(interaction);
  if (!ctx) {
    await interaction.reply({ content: 'Cette commande s’utilise sur un serveur.', ...replyFlags(interaction) });
    return;
  }

  const view = uiView(section, state, config, ctx);

  if (mode === 'go') {
    await interaction.reply({
      embeds: view.embeds,
      components: view.components,
      ...replyFlags(interaction),
    });
    return;
  }

  await interaction.update({ embeds: view.embeds, components: view.components }).catch(async () => {
    await interaction.reply({
      embeds: view.embeds,
      components: view.components,
      ...replyFlags(interaction),
    });
  });
}

async function handleUiButton(interaction: ButtonInteraction): Promise<void> {
  const [, mode, target] = interaction.customId.split(':');
  const section = sectionById(target ?? '');
  if (!section && target !== 'hub') return;
  await showUiSection(interaction, (target ?? 'hub') as UiSectionId, mode === 'go' ? 'go' : 'nav');
}

async function handleUiSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== 'ui:select') return false;
  const target = interaction.values[0] ?? 'hub';
  await showUiSection(interaction, target as UiSectionId, 'nav');
  return true;
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const [scope, action, id] = interaction.customId.split(':');

  // menu central du bot
  if (interaction.customId.startsWith('ui:')) {
    await handleUiButton(interaction);
    return;
  }

  // blackjack
  if (interaction.customId.startsWith('bj:')) {
    await handleBlackjackButton(interaction);
    return;
  }
  // boutique
  if (interaction.customId.startsWith('shop:buy:')) {
    await handleShopButton(interaction);
    return;
  }
  // cagnotte
  if (interaction.customId === 'drop:claim' && interaction.guild) {
    const result = await claimDrop(interaction.guild, interaction.user.id);
    if (result.ok) {
      await interaction.update({
        content: result.message,
        embeds: [],
        components: [],
      }).catch(() => undefined);
      return;
    }
    await interaction.reply({ content: result.message, ...replyFlags(interaction) });
    return;
  }

  // confessions
  if (scope === 'conf') {
    if (!memberIsAdmin(interaction)) {
      await interaction.reply({ content: 'Réservé à l’équipe.', ...replyFlags(interaction) });
      return;
    }
    const guild = interaction.guild;
    if (!guild) return;
    const state = await getState();
    const confession = state.confessions.find((entry) => entry.id === id);
    if (!confession) {
      await interaction.reply({ content: 'Confession introuvable (déjà traitée ?).', ...replyFlags(interaction) });
      return;
    }
    await interaction.deferReply(replyFlags(interaction));
    if (action === 'approve') {
      const ok = await publishConfession(guild, confession);
      await markReviewMessageHandled(guild, confession.id, interaction.user.id);
      await interaction.editReply({
        content: ok ? '✅ Confession publiée anonymement.' : '❌ Publication impossible (salon confessions non configuré).',
      });
      return;
    }
    await rejectConfession(guild, confession.id, interaction.user.tag ?? interaction.user.username);
    await interaction.editReply({ content: '🗑️ Confession refusée.' });
    return;
  }

  // salons vocaux temporaires
  // Le panneau de contrôle est envoyé en MP au propriétaire : le serveur
  // doit donc être retrouvé même quand interaction.guild vaut null.
  if (scope === 'temp') {
    const flags = replyFlags(interaction);
    const guild = await resolveInteractionGuild(interaction, id);
    if (!guild) {
      await interaction.reply({ content: 'Je ne retrouve pas le serveur de ce salon.', ...flags });
      return;
    }
    const room = await getRoom(id);
    if (!room) {
      await interaction.reply({ content: 'Ce salon temporaire n’existe plus.', ...flags });
      return;
    }
    if (room.ownerId !== interaction.user.id && !(await isStaffIn(interaction, guild))) {
      await interaction.reply({
        content: 'Seul le propriétaire du salon (ou un admin) peut faire ça.',
        ...flags,
      });
      return;
    }
    const channel =
      guild.channels.cache.get(id) ??
      ((await guild.channels.fetch(id).catch(() => null)) as GuildBasedChannel | null);
    if (!channel?.isVoiceBased()) {
      await interaction.reply({ content: 'Salon introuvable.', ...flags });
      return;
    }
    const voice = channel as import('discord.js').VoiceChannel;

    if (action === 'togglelock') {
      const locked = await toggleLock(guild, voice);
      await interaction.reply({ content: locked ? '🔒 Salon verrouillé.' : '🔓 Salon ouvert.', ...flags });
      return;
    }
    if (action === 'claim') {
      await transferOwnership(guild, voice, interaction.user.id);
      await interaction.reply({ content: '👑 Tu es le nouveau propriétaire.', ...flags });
      return;
    }
    if (action === 'delete') {
      await deleteRoom(voice, `Supprimé par ${interaction.user.tag ?? interaction.user.username}`);
      await interaction.reply({ content: '🗑️ Salon supprimé.', ...flags });
      return;
    }
    if (action === 'rename' || action === 'limit') {
      const modal = new ModalBuilder()
        .setCustomId(`tempm:${action}:${id}`)
        .setTitle(action === 'rename' ? 'Renommer ton salon' : 'Limite de places');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(action === 'rename' ? 'name' : 'limit')
            .setLabel(action === 'rename' ? 'Nouveau nom du salon' : 'Places (0 = illimité)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(action === 'rename' ? 90 : 2)
            .setValue(action === 'rename' ? voice.name.replace(/^🔊\s*/, '') : String(voice.userLimit ?? 0))
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal);
      return;
    }
    await interaction.reply({ content: 'Action inconnue.', ...flags });
    return;
  }

  await interaction.reply({ content: 'Bouton inconnu ou expiré.', ...replyFlags(interaction) }).catch(() => undefined);
}

async function handleTempRoomModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [scope, action, id] = interaction.customId.split(':');
  if (scope !== 'tempm') return;
  const flags = replyFlags(interaction);

  const guild = await resolveInteractionGuild(interaction, id);
  if (!guild) {
    await interaction.reply({ content: 'Je ne retrouve pas le serveur de ce salon.', ...flags });
    return;
  }
  const room = await getRoom(id);
  if (!room) {
    await interaction.reply({ content: 'Ce salon temporaire n’existe plus.', ...flags });
    return;
  }
  if (room.ownerId !== interaction.user.id && !(await isStaffIn(interaction, guild))) {
    await interaction.reply({ content: 'Seul le propriétaire du salon (ou un admin) peut faire ça.', ...flags });
    return;
  }
  const channel =
    guild.channels.cache.get(id) ??
    ((await guild.channels.fetch(id).catch(() => null)) as GuildBasedChannel | null);
  if (!channel?.isVoiceBased()) {
    await interaction.reply({ content: 'Salon introuvable.', ...flags });
    return;
  }
  const voice = channel as import('discord.js').VoiceChannel;
  if (action === 'rename') {
    const name = interaction.fields.getTextInputValue('name');
    await renameRoom(voice, name);
    await interaction.reply({ content: `✏️ Salon renommé : **${voice.name}**`, ...flags });
    return;
  }
  if (action === 'limit') {
    const raw = interaction.fields.getTextInputValue('limit').replace(/\D/g, '');
    const limit = Number(raw || '0');
    await setRoomLimit(voice, limit);
    await interaction.reply({
      content: limit > 0 ? `👥 Limite : **${limit} place(s)**` : '👥 Limite retirée (illimité).',
      ...flags,
    });
    return;
  }
  await forgetRoom(id);
  await interaction.reply({ content: 'Salon oublié de la liste.', ...flags });
}

export { processVoiceRewards };
