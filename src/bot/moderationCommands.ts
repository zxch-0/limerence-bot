import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type BaseGuildTextChannel,
  type ChatInputCommandInteraction,
  type Interaction,
  type Role,
  type TextChannel,
} from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import {
  activeWarns,
  caseLabelFromConfig,
  createCase,
  casesOf,
  CASE_TYPE_EMOJI,
  CASE_TYPE_LABELS,
  clearWarns,
  findCase,
  revokeCase,
} from '../lib/moderation/cases';
import {
  banMember,
  kickMember,
  lockChannel,
  lockdownGuild,
  manageRole,
  moderationChannel,
  nukeChannel,
  purgeMessages,
  setNickname,
  setSlowmode,
  softbanMember,
  timeoutMember,
  unbanMember,
  untimeoutMember,
  warnMember,
} from './moderation';
import { actorCanActOn, botCanActOn, fetchMember, hasPermission, isModerator, isStaff, memberIsProtected, replyFlags } from './guards';

// ============================================================
//  Commandes de modération — couche Discord
// ============================================================

/** Éphémère sur un serveur, réponse normale en MP (Discord refuse l'éphémère en privé). */
function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

async function deny(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ content: message }).catch(() => undefined);
    return;
  }
  if (interaction.replied) {
    await interaction.followUp({ content: message, ...ephemOf(interaction) }).catch(() => undefined);
    return;
  }
  await interaction.reply({ content: message, ...ephemOf(interaction) }).catch(() => undefined);
}

async function success(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ content: message.slice(0, 1900) }).catch(() => undefined);
    return;
  }
  if (interaction.replied) {
    await interaction.followUp({ content: message.slice(0, 1900), ...ephemOf(interaction) }).catch(() => undefined);
    return;
  }
  await interaction.reply({ content: message.slice(0, 1900), ...ephemOf(interaction) }).catch(() => undefined);
}

function moderatorOf(interaction: ChatInputCommandInteraction) {
  return { id: interaction.user.id, name: interaction.user.tag ?? interaction.user.username };
}

function currentTextChannel(interaction: ChatInputCommandInteraction): TextChannel | null {
  const channel = interaction.channel;
  if (!channel) return null;
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return null;
  return channel as TextChannel;
}

// ------------------------------------------------------------
//  /warn
// ------------------------------------------------------------

async function handleWarn(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return deny(interaction, 'Commande réservée à un serveur.');
  const state = await getState();
  const config = state.config.moderation;
  if (!isModerator(interaction)) return deny(interaction, 'Tu n’as pas la permission de modérer.');
  const sub = interaction.options.getSubcommand();

  if (sub === 'ajouter') {
    const target = interaction.options.getUser('membre', true);
    const reason = interaction.options.getString('raison', true).trim();
    const evidence = interaction.options.getString('preuve') ?? undefined;

    if (config.warnReasonRequired && reason.length < config.warnReasonMinLength) {
      return deny(interaction, `La raison doit faire au moins ${config.warnReasonMinLength} caractères.`);
    }
    if (reason.length > config.warnReasonMaxLength) {
      return deny(interaction, `La raison est limitée à ${config.warnReasonMaxLength} caractères.`);
    }
    const member = await fetchMember(guild, target.id);
    if (!member) return deny(interaction, 'Ce membre n’est pas sur le serveur.');
    if (member.user.bot && !config.allowModeratingBots) return deny(interaction, 'Les bots ne peuvent pas être avertis.');
    if (memberIsProtected(guild, member, config.protectRoleIds)) return deny(interaction, 'Ce membre est protégé par la configuration.');

    const actor = actorCanActOn(guild, interaction.user.id, member, config.warnHierarchyCheck);
    if (!actor.ok) return deny(interaction, actor.reason ?? 'Action refusée.');
    const bot = botCanActOn(guild, member);
    if (!bot.ok) return deny(interaction, bot.reason ?? 'Action refusée.');

    await interaction.deferReply(replyFlags(interaction));
    const result = await warnMember({
      guild,
      target: member,
      reason: evidence ? `${reason}\n> Preuve : ${evidence}` : reason,
      moderator: moderatorOf(interaction),
      evidence,
    });
    return success(interaction, result.message);
  }

  if (sub === 'liste') {
    const target = interaction.options.getUser('membre', true);
    const warns = await updateState((s) => activeWarns(s, target.id, s.config.moderation));
    if (!warns.length) return success(interaction, `✅ <@${target.id}> n’a aucun avertissement actif.`);
    const lines = warns.map((entry) =>
      `• \`${caseLabelFromConfig(entry, config)}\` — ${entry.reason.split('\n')[0]} — par ${entry.moderatorName} — <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`,
    );
    return success(interaction, `⚠️ **${warns.length}** avertissement(s) actif(s) pour <@${target.id}> :\n${lines.join('\n')}`);
  }

  if (sub === 'retirer') {
    const needle = interaction.options.getString('dossier', true);
    const removed = await updateState((s) => revokeCase(s, needle, interaction.user.tag ?? interaction.user.username));
    if (!removed) return deny(interaction, 'Dossier introuvable.');
    return success(interaction, `🧹 Dossier \`${caseLabelFromConfig(removed, config)}\` retiré.`);
  }

  if (sub === 'effacer') {
    const target = interaction.options.getUser('membre', true);
    const count = await updateState((s) => clearWarns(s, target.id, interaction.user.tag ?? interaction.user.username));
    return success(interaction, count ? `🧹 ${count} avertissement(s) effacé(s) pour <@${target.id}>.` : 'Aucun avertissement à effacer.');
  }

  // modifier
  const needle = interaction.options.getString('dossier', true);
  const reason = interaction.options.getString('raison', true);
  const updated = await updateState((s) => {
    const found = findCase(s, needle);
    if (!found) return null;
    found.reason = reason.slice(0, 500);
    return found;
  });
  if (!updated) return deny(interaction, 'Dossier introuvable.');
  return success(interaction, `✏️ Dossier \`${caseLabelFromConfig(updated, config)}\` mis à jour.`);
}

// ------------------------------------------------------------
//  /cas
// ------------------------------------------------------------

async function handleCases(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) return deny(interaction, 'Commande réservée à un serveur.');
  const state = await getState();
  const config = state.config.moderation;
  const sub = interaction.options.getSubcommand();

  if (sub === 'voir') {
    const needle = interaction.options.getString('dossier', true);
    const modCase = findCase(state, needle);
    if (!modCase) return deny(interaction, 'Dossier introuvable.');
    const embed = new EmbedBuilder()
      .setColor(0xc9b8ff)
      .setTitle(`${CASE_TYPE_EMOJI[modCase.type]} ${caseLabelFromConfig(modCase, config)} — ${CASE_TYPE_LABELS[modCase.type]}`)
      .setDescription(modCase.reason)
      .addFields(
        { name: 'Membre', value: `<@${modCase.userId}>`, inline: true },
        { name: 'Modérateur', value: modCase.moderatorName, inline: true },
        { name: 'Actif', value: modCase.active ? '✅ oui' : '❌ retiré', inline: true },
        { name: 'Date', value: `<t:${Math.floor(new Date(modCase.createdAt).getTime() / 1000)}:F>`, inline: true },
        { name: 'MP envoyé', value: modCase.directMessageSent ? '✅' : '—', inline: true },
        { name: 'Sanction auto', value: modCase.autoAction ?? '—', inline: true },
      );
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return;
  }

  if (sub === 'membre') {
    const target = interaction.options.getUser('membre', true);
    const entries = casesOf(state, target.id);
    if (!entries.length) return success(interaction, `Aucun dossier pour <@${target.id}>.`);
    const lines = entries
      .slice(0, 15)
      .map(
        (entry) =>
          `${CASE_TYPE_EMOJI[entry.type]} \`${caseLabelFromConfig(entry, config)}\` ${entry.active ? '' : '~~retiré~~'} — ${entry.reason.split('\n')[0].slice(0, 60)} — <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`,
      );
    const embed = new EmbedBuilder()
      .setColor(0xc9b8ff)
      .setTitle(`📁 Dossier de ${target.displayName ?? target.username}`)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: `${entries.length} dossier(s) au total` });
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return;
  }

  const type = interaction.options.getString('type');
  const entries = state.cases
    .filter((entry) => (type ? entry.type === type : true))
    .slice(0, 15)
    .map(
      (entry) =>
        `${CASE_TYPE_EMOJI[entry.type]} \`${caseLabelFromConfig(entry, config)}\` <@${entry.userId}> — ${entry.reason.split('\n')[0].slice(0, 50)} — ${entry.moderatorName}`,
    );
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xc9b8ff)
        .setTitle('📁 Derniers dossiers')
        .setDescription((entries.join('\n') || 'Aucun dossier.').slice(0, 4000)),
    ],
    ...ephemOf(interaction),
  });
}

// ------------------------------------------------------------
//  Sanctions directes
// ------------------------------------------------------------

async function handleSanction(interaction: ChatInputCommandInteraction, command: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return deny(interaction, 'Commande réservée à un serveur.');
  const state = await getState();
  const config = state.config.moderation;
  const moderator = moderatorOf(interaction);
  await interaction.deferReply(replyFlags(interaction));

  if (command === 'unban') {
    const id = interaction.options.getString('id', true).replace(/\D/g, '');
    if (!/^\d{15,25}$/.test(id)) return success(interaction, '❌ Identifiant Discord invalide.');
    const result = await unbanMember(guild, id, interaction.options.getString('raison') ?? 'Aucune raison', moderator);
    return success(interaction, result.message);
  }

  if (command === 'banlist') {
    const bans = await guild.bans.fetch({ limit: 50 }).catch(() => null);
    const lines = bans?.map((ban) => `• ${ban.user.tag ?? ban.user.id} — ${ban.reason ?? 'aucune raison'}`) ?? [];
    const embed = new EmbedBuilder()
      .setColor(0xff8f8f)
      .setTitle('⛔ Membres bannis')
      .setDescription((lines.join('\n') || 'Aucun bannissement.').slice(0, 4000));
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const target = interaction.options.getUser('membre', true);
  const member = await fetchMember(guild, target.id);
  if (!member) return success(interaction, '❌ Membre introuvable sur le serveur.');
  if (member.user.bot && !config.allowModeratingBots) return success(interaction, '❌ La modération des bots est désactivée.');
  if (memberIsProtected(guild, member, config.protectRoleIds)) return success(interaction, '❌ Ce membre est protégé.');
  const actor = actorCanActOn(guild, interaction.user.id, member, config.warnHierarchyCheck);
  if (!actor.ok) return success(interaction, `❌ ${actor.reason}`);
  const bot = botCanActOn(guild, member);
  if (!bot.ok) return success(interaction, `❌ ${bot.reason}`);

  const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';
  if (config.requireReasonForBan && (command === 'ban' || command === 'kick') && reason === 'Aucune raison fournie') {
    return success(interaction, '❌ Une raison est obligatoire pour cette sanction.');
  }

  if (command === 'kick') {
    const result = await kickMember(guild, member, reason, moderator);
    return success(interaction, result.message);
  }
  if (command === 'ban') {
    const days = interaction.options.getInteger('jours') ?? config.banDeleteMessageDays;
    const result = await banMember(guild, target.id, reason, moderator, days);
    return success(interaction, result.message);
  }
  if (command === 'softban') {
    const result = await softbanMember(guild, member, reason, moderator);
    return success(interaction, result.message);
  }
  if (command === 'mute') {
    const minutes = interaction.options.getInteger('minutes') ?? config.defaultTimeoutMinutes;
    const result = await timeoutMember(guild, member, minutes, reason, moderator);
    return success(interaction, result.message);
  }
  if (command === 'unmute') {
    const result = await untimeoutMember(guild, member, reason, moderator);
    return success(interaction, result.message);
  }
  if (command === 'nick') {
    const nickname = interaction.options.getString('pseudo')?.trim() || null;
    try {
      await setNickname(member, nickname ?? null, interaction.user.tag ?? interaction.user.username);
      return success(interaction, nickname ? `✏️ Pseudo de ${member.displayName} : **${nickname}**` : `✏️ Pseudo de <@${member.id}> réinitialisé.`);
    } catch (err) {
      return success(interaction, `❌ Impossible de changer le pseudo : ${(err as Error).message}`);
    }
  }
  return success(interaction, 'Commande inconnue.');
}

// ------------------------------------------------------------
//  Messages & salons
// ------------------------------------------------------------

async function handlePurge(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return deny(interaction, 'Commande réservée à un serveur.');
  if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages) && !isStaff(interaction)) {
    return deny(interaction, 'Permission « Gérer les messages » requise.');
  }
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply(replyFlags(interaction));

  if (sub === 'tout') {
    const option = interaction.options.getChannel('salon');
    const channel = (option ?? currentTextChannel(interaction)) as TextChannel | null;
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      return success(interaction, '❌ Choisis un salon textuel.');
    }
    const clone = await nukeChannel(channel as BaseGuildTextChannel, interaction.user.tag ?? interaction.user.username);
    return success(interaction, `🌀 Salon recréé : <#${clone?.id ?? channel.id}>.`);
  }

  const channel = currentTextChannel(interaction);
  if (!channel) return success(interaction, '❌ Cette commande s’utilise dans un salon textuel.');
  const count = interaction.options.getInteger('nombre') ?? 25;

  const filter: Parameters<typeof purgeMessages>[2] = {};
  if (sub === 'utilisateur') filter.userId = interaction.options.getUser('membre', true).id;
  if (sub === 'contient') filter.contains = interaction.options.getString('texte', true);
  if (sub === 'bots') filter.bots = true;
  if (sub === 'liens') filter.links = true;
  if (sub === 'pieces-jointes') filter.attachments = true;
  if (sub === 'embeds') filter.embeds = true;
  if (sub === 'mentions') filter.mentions = true;

  try {
    const deleted = await purgeMessages(channel as BaseGuildTextChannel, count, filter, interaction.user.tag ?? interaction.user.username);
    return success(interaction, `🧹 ${deleted} message(s) supprimé(s) dans <#${channel.id}>.`);
  } catch (err) {
    return success(interaction, `❌ Purge impossible : ${(err as Error).message}`);
  }
}

async function handleChannelCommand(interaction: ChatInputCommandInteraction, command: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return deny(interaction, 'Commande réservée à un serveur.');
  const source = interaction.user.tag ?? interaction.user.username;
  await interaction.deferReply(replyFlags(interaction));

  if (command === 'lockdown' || command === 'unlockdown') {
    const locked = command === 'lockdown';
    const count = await lockdownGuild(guild, locked, source);
    return success(interaction, locked ? `🔒 ${count} salon(s) verrouillé(s).` : `🔓 ${count} salon(s) rouverts.`);
  }

  const option = interaction.options.getChannel('salon');
  const channel = (option ?? currentTextChannel(interaction)) as TextChannel | null;
  if (!channel) return success(interaction, '❌ Salon introuvable.');

  if (command === 'lock' || command === 'unlock') {
    const locked = command === 'lock';
    try {
      await lockChannel(
        channel.isVoiceBased() ? (channel as import('discord.js').VoiceChannel) : (channel as BaseGuildTextChannel),
        source,
        locked,
      );
      return success(interaction, locked ? `🔒 <#${channel.id}> verrouillé.` : `🔓 <#${channel.id}> déverrouillé.`);
    } catch (err) {
      return success(interaction, `❌ Impossible : ${(err as Error).message}`);
    }
  }

  if (command === 'slowmode') {
    const seconds = interaction.options.getInteger('secondes', true);
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      return success(interaction, '❌ Le slowmode ne s’applique qu’aux salons textuels.');
    }
    const value = await setSlowmode(channel as BaseGuildTextChannel, seconds, source);
    return success(interaction, value ? `🐢 Slowmode : ${value}s dans <#${channel.id}>.` : `🐢 Slowmode désactivé dans <#${channel.id}>.`);
  }

  if (command === 'nuke') {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      return success(interaction, '❌ Le nuke ne s’applique qu’aux salons textuels.');
    }
    const clone = await nukeChannel(channel as BaseGuildTextChannel, source);
    return success(interaction, `🌀 Salon recréé : <#${clone?.id ?? channel.id}>.`);
  }

  return success(interaction, 'Commande inconnue.');
}

async function handleRoleCommand(interaction: ChatInputCommandInteraction, add: boolean): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return deny(interaction, 'Commande réservée à un serveur.');
  const target = interaction.options.getUser('membre', true);
  const role = interaction.options.getRole('role', true) as Role;
  const member = await fetchMember(guild, target.id);
  if (!member) return deny(interaction, 'Membre introuvable.');
  const result = await manageRole(member, role.id, add, interaction.user.tag ?? interaction.user.username);
  await success(interaction, result.message);
}

// ------------------------------------------------------------
//  Informations
// ------------------------------------------------------------

async function handleInfo(interaction: ChatInputCommandInteraction, command: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return deny(interaction, 'Commande réservée à un serveur.');
  const state = await getState();

  if (command === 'userinfo') {
    const target = interaction.options.getUser('membre') ?? interaction.user;
    const member = await fetchMember(guild, target.id);
    const warns = await updateState((s) => activeWarns(s, target.id, s.config.moderation));
    const account = state.accounts[target.id];
    const embed = new EmbedBuilder()
      .setColor(0xc9b8ff)
      .setAuthor({ name: target.displayName ?? target.username, iconURL: target.displayAvatarURL({ size: 128 }) })
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Identifiant', value: `\`${target.id}\``, inline: true },
        { name: 'Compte créé', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Arrivé', value: member ? `<t:${Math.floor(member.joinedTimestamp ?? Date.now() / 1000)}:R>` : '—', inline: true },
        { name: 'Rôles', value: String(member?.roles.cache.size ?? 0), inline: true },
        { name: 'Bot', value: target.bot ? 'oui' : 'non', inline: true },
        { name: 'Mute', value: member?.isCommunicationDisabled() ? '🔇 oui' : 'non', inline: true },
      );
    if (state.config.moderation.caseShowInUserInfo) {
      embed.addFields({ name: '⚠️ Avertissements actifs', value: String(warns.length), inline: true });
    }
    if (account) {
      embed.addFields({
        name: '💰 Économie',
        value: `${account.cash + account.bank} ${state.config.economy.currencySymbol}`,
        inline: true,
      });
    }
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return;
  }

  if (command === 'serverinfo') {
    const embed = new EmbedBuilder()
      .setColor(0xc9b8ff)
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) ?? undefined })
      .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: 'Membres', value: String(guild.memberCount), inline: true },
        { name: 'Salons', value: String(guild.channels.cache.size), inline: true },
        { name: 'Rôles', value: String(guild.roles.cache.size), inline: true },
        { name: 'Créé', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Boosts', value: `niveau ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0})`, inline: true },
        { name: 'Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
      );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (command === 'roleinfo') {
    const role = interaction.options.getRole('role', true) as Role;
    const embed = new EmbedBuilder()
      .setColor(role.color || 0xc9b8ff)
      .setTitle(`🎭 ${role.name}`)
      .addFields(
        { name: 'Identifiant', value: `\`${role.id}\``, inline: true },
        { name: 'Membres', value: String(role.members.size), inline: true },
        { name: 'Position', value: String(role.position), inline: true },
        { name: 'Couleur', value: role.hexColor, inline: true },
        { name: 'Affiché séparément', value: role.hoist ? 'oui' : 'non', inline: true },
        { name: 'Mentionnable', value: role.mentionable ? 'oui' : 'non', inline: true },
        { name: 'Créé', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
      );
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return;
  }

  // antiraid
  const sub = interaction.options.getSubcommand();
  const enabled = sub === 'activer' ? true : sub === 'desactiver' ? false : null;
  const updated = await updateState((s) => {
    if (enabled !== null) s.config.moderation.raidProtectionEnabled = enabled;
    return {
      enabled: s.config.moderation.raidProtectionEnabled,
      threshold: s.config.moderation.raidJoinThreshold,
      window: s.config.moderation.raidJoinWindowSeconds,
      lockdown: s.config.moderation.raidLockdown,
      minAge: s.config.moderation.raidMinAccountAgeDays,
    };
  });
  const embed = new EmbedBuilder()
    .setColor(updated.enabled ? 0x9ff0dc : 0xff8f8f)
    .setTitle('🚨 Protection anti-raid')
    .setDescription(updated.enabled ? '✅ Activée' : '❌ Désactivée')
    .addFields(
      { name: 'Seuil', value: `${updated.threshold} arrivées / ${updated.window}s`, inline: true },
      { name: 'Lockdown auto', value: updated.lockdown ? 'oui' : 'non', inline: true },
      { name: 'Âge minimum', value: updated.minAge ? `${updated.minAge} jour(s)` : 'aucun', inline: true },
    );
  await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
}

// ------------------------------------------------------------
//  /aide
// ------------------------------------------------------------

export function helpEmbed(): EmbedBuilder {
  const sections: Array<[string, string]> = [
    ['💰 Économie', '`/balance` `/profil` `/daily` `/work` `/crime` `/rob` `/beg` `/search` `/pay` `/bank` `/leaderboard` `/inventaire` `/revendre`'],
    ['🃏 Blackjack', '`/blackjack jouer|carte|rester|doubler|split|assurance|abandonner|quitter|stats|regles`'],
    ['🛒 Boutique', '`/shop liste` `/shop acheter` `/shop vitrine`'],
    ['🛡️ Modération', '`/warn` `/cas` `/kick` `/ban` `/unban` `/softban` `/mute` `/unmute` `/nick` `/purge` `/lock` `/unlock` `/lockdown` `/unlockdown` `/slowmode` `/nuke` `/addrole` `/removerole` `/banlist` `/antiraid`'],
    ['🔎 Informations', '`/userinfo` `/serverinfo` `/roleinfo` `/aide` `/ping`'],
    ['⚙️ Configuration', '`/config voir` `/config salon` `/config supprimer`'],
    ['✨ Animation', '`/confession` `/annonce` `/annonces` `/embed` `/regles` `/vocal` `/panel`'],
  ];
  return new EmbedBuilder()
    .setColor(0xc9b8ff)
    .setTitle('✦ Limerence — commandes')
    .setDescription(sections.map(([title, list]) => `### ${title}\n${list}`).join('\n\n').slice(0, 4000))
    .setFooter({ text: 'Toute la configuration se règle depuis le panel web.' });
}

// ------------------------------------------------------------
//  Point d'entrée
// ------------------------------------------------------------

export async function handleModerationCommand(
  interaction: ChatInputCommandInteraction,
  commandName: string,
): Promise<boolean> {
  switch (commandName) {
    case 'warn':
      await handleWarn(interaction);
      return true;
    case 'cas':
      await handleCases(interaction);
      return true;
    case 'kick':
    case 'ban':
    case 'unban':
    case 'softban':
    case 'mute':
    case 'unmute':
    case 'nick':
    case 'banlist':
      await handleSanction(interaction, commandName);
      return true;
    case 'purge':
      await handlePurge(interaction);
      return true;
    case 'lock':
    case 'unlock':
    case 'lockdown':
    case 'unlockdown':
    case 'slowmode':
    case 'nuke':
      await handleChannelCommand(interaction, commandName);
      return true;
    case 'addrole':
      await handleRoleCommand(interaction, true);
      return true;
    case 'removerole':
      await handleRoleCommand(interaction, false);
      return true;
    case 'userinfo':
    case 'serverinfo':
    case 'roleinfo':
    case 'antiraid':
      await handleInfo(interaction, commandName);
      return true;
    case 'aide':
      await interaction.reply({ embeds: [helpEmbed()], ...ephemOf(interaction) });
      return true;
    default:
      return false;
  }
}

export async function postModerationNote(
  guildId: string,
  userId: string,
  moderator: { id: string; name: string },
  reason: string,
): Promise<void> {
  const { getReadyClient } = await import('../lib/discord/client');
  const client = getReadyClient();
  if (!client) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const channel = await moderationChannel(guild);
  await updateState((s) => {
    createCase(s, {
      guildId,
      type: 'note',
      userId,
      userName: userId,
      moderatorId: moderator.id,
      moderatorName: moderator.name,
      reason,
    });
    return null;
  });
  await channel?.send(`📝 Note sur <@${userId}> par ${moderator.name} : ${reason}`).catch(() => undefined);
  await addLog({ level: 'moderation', source: `modérateur:${moderator.name}`, action: 'Note', detail: `${userId} — ${reason}` });
}
