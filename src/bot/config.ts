import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { effectiveSlotChannelId, setSlotChannel } from '../lib/channels';
import { addLog } from '../lib/logs';
import { getState, updateState } from '../lib/store';
import { CHANNEL_SLOTS, CHANNEL_SLOT_META, type ChannelSlot } from '../lib/types';
import { isStaff, replyFlags } from './guards';

/** Configuration des destinations, partagée avec le panel web. */
export async function handleConfigCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const flags = replyFlags(interaction);
  const guild = interaction.guild;
  if (!guild || !interaction.inGuild()) {
    await interaction.reply({ content: 'Utilise /config sur le serveur à configurer.', ...flags });
    return;
  }
  if (!isStaff(interaction)) {
    await interaction.reply({ content: 'Réservé à l’équipe ayant la permission « Gérer le serveur ».', ...flags });
    return;
  }

  await interaction.deferReply(flags);
  const { config } = await getState();
  // Le magasin est global : un admin d'un autre serveur ne doit pas le modifier.
  const targetGuildId = config.guildId?.trim() || process.env.DISCORD_GUILD_ID?.trim();
  if (targetGuildId && targetGuildId !== guild.id) {
    await interaction.editReply({ content: '❌ Ce serveur n’est pas le serveur cible du bot. Utilise /config sur le serveur configuré dans le panel.' });
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === 'voir') {
    const lines = CHANNEL_SLOTS.map((slot) => {
      const meta = CHANNEL_SLOT_META[slot];
      const id = effectiveSlotChannelId(config, slot);
      return `${meta.emoji} **${meta.label}** : ${id ? `<#${id}>` : 'Non défini'}\n${meta.hint}`;
    });
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xc9b8ff)
        .setTitle('⚙️ Salons du bot')
        .setDescription(lines.join('\n\n'))
        .addFields({
          name: 'Modifier la configuration',
          value: '`/config salon categorie:… salon:#…` pour choisir une destination.\n'
            + '`/config supprimer categorie:…` pour retirer une association.\n'
            + 'Les replis existants restent actifs (salon principal, puis autres salons textuels selon la fonction). '
            + 'Retirer une association ne désactive pas la fonction. Les salons boutique et blackjack ne restreignent pas les commandes.',
        })],
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (sub !== 'salon' && sub !== 'supprimer') {
    await interaction.editReply({ content: 'Sous-commande de configuration inconnue.' });
    return;
  }
  const category = interaction.options.getString('categorie', true);
  if (!CHANNEL_SLOTS.includes(category as ChannelSlot)) {
    await interaction.editReply({ content: '❌ Catégorie de salon inconnue.' });
    return;
  }
  const slot = category as ChannelSlot;
  let channelId = '';
  if (sub === 'salon') {
    const selected = interaction.options.getChannel('salon', true);
    const channel = await guild.channels.fetch(selected.id).catch(() => null);
    if (!channel || channel.guild.id !== guild.id
      || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      await interaction.editReply({ content: '❌ Choisis un salon textuel ou d’annonces existant sur ce serveur.' });
      return;
    }
    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])) {
      await interaction.editReply({ content: '❌ Dans ce salon, le bot doit pouvoir voir le salon, envoyer des messages et intégrer des liens (embeds).' });
      return;
    }
    channelId = channel.id;
  }

  await updateState((state) => {
    state.config.guildId ||= guild.id;
    setSlotChannel(state.config, slot, channelId);
  });
  const meta = CHANNEL_SLOT_META[slot];
  await addLog({
    level: 'info',
    source: `discord:${interaction.user.id}`,
    action: channelId ? 'Salon du bot configuré' : 'Association de salon retirée',
    detail: `${meta.label} → ${channelId || 'non défini'} · serveur ${guild.id}`,
  });
  await interaction.editReply({
    content: channelId
      ? `✅ ${meta.emoji} **${meta.label}** : les publications utiliseront <#${channelId}>. Configuration enregistrée, sans redémarrage.\nLes activations et restrictions de commandes restent inchangées.`
      : `✅ Association **${meta.label}** retirée. Les replis existants restent actifs ; la fonction n’est pas désactivée.`,
    allowedMentions: { parse: [] },
  });
}
