import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildTextBasedChannel,
} from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { resolveChannelById } from '../lib/channels';
import { credit, ensureAccount, formatMoney } from '../lib/economy/core';
import {
  drawWinners,
  dueGiveaways,
  findGiveaway,
  giveawayStatusMeta,
  isGiveawayOpen,
  summarizeGiveaway,
  toggleParticipant,
} from '../lib/giveaways';
import { parseSchedule } from './announcements';
import { isStaff, replyFlags } from './guards';
import { accentColor } from './ui';
import type { AppConfig, Giveaway } from '../lib/types';

// ============================================================
//  Giveaways hébergés par l’équipe
//  /giveaway (admin) · bouton « Participer » · tirage à la fin
// ============================================================

/** Nombre maximum de giveaways conservés dans l’état (historique borné). */
const MAX_GIVEAWAYS = 100;
/** Giveaways en cours de clôture (évite un double tirage scheduler + commande). */
const endingGiveaways = new Set<string>();

const MIN_DURATION_MS = 60_000; // 1 minute
const MAX_DURATION_MS = 30 * 86_400_000; // 30 jours

// ------------------------------------------------------------
//  Rendu Discord
// ------------------------------------------------------------

export function giveawayEmbed(config: AppConfig, giveaway: Giveaway): EmbedBuilder {
  const meta = giveawayStatusMeta(giveaway.status);
  const plural = giveaway.winnerCount > 1 ? 's' : '';
  const endTs = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setColor(accentColor(config.ui))
    .setAuthor({ name: `${meta.emoji} Giveaway — ${meta.label}` })
    .setTitle(giveaway.prize.slice(0, 256))
    .setFooter({ text: `ID ${giveaway.id.slice(0, 8)} · hébergé par ${giveaway.createdBy.replace(/^discord:/, '')}` })
    .setTimestamp(new Date(giveaway.endsAt));

  const lines: string[] = [];
  if (giveaway.description?.trim()) lines.push(giveaway.description.trim().slice(0, 1000), '');

  if (giveaway.status === 'active') {
    lines.push(`🏆 **${giveaway.winnerCount}** gagnant${plural}`);
    if (giveaway.rewardAmount > 0) {
      lines.push(`💰 **${formatMoney(config.economy, giveaway.rewardAmount)}** crédité${plural} à chaque gagnant`);
    }
    lines.push(`⏳ Tirage le <t:${endTs}:F> (<t:${endTs}:R>)`);
    lines.push(`👥 **${giveaway.participants.length}** participant${giveaway.participants.length > 1 ? 's' : ''}`);
    lines.push('', 'Clique sur **Participer** ci-dessous — reclique pour te désinscrire.');
  } else if (giveaway.status === 'ended') {
    const mentions = giveaway.winners.map((id) => `<@${id}>`).join(', ');
    lines.push(`🏆 **Gagnant${giveaway.winners.length > 1 ? 's' : ''}** : ${mentions || '—'}`);
    if (giveaway.winners.length === 0) lines.push('Personne n’a participé à ce giveaway 😢');
    lines.push(`👥 **${giveaway.participants.length}** participant${giveaway.participants.length > 1 ? 's' : ''}`);
  } else {
    lines.push('🚫 Ce giveaway a été annulé par l’équipe.');
    lines.push(`👥 **${giveaway.participants.length}** participant${giveaway.participants.length > 1 ? 's' : ''}`);
  }

  embed.setDescription(lines.join('\n').slice(0, 4000));
  return embed;
}

export function giveawayComponents(giveaway: Giveaway): ActionRowBuilder<ButtonBuilder>[] {
  if (giveaway.status !== 'active') return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`gway:join:${giveaway.id}`)
        .setLabel('Participer')
        .setEmoji('🎉')
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

// ------------------------------------------------------------
//  Création
// ------------------------------------------------------------

export interface CreateGiveawayInput {
  guildId: string;
  channelId: string;
  prize: string;
  description?: string;
  winnerCount: number;
  rewardAmount: number;
  endsAt: Date;
  createdBy: string;
}

export async function createGiveaway(input: CreateGiveawayInput): Promise<Giveaway> {
  const giveaway: Giveaway = {
    id: randomUUID(),
    guildId: input.guildId,
    channelId: input.channelId,
    prize: input.prize,
    description: input.description?.trim() || undefined,
    winnerCount: Math.max(1, Math.floor(input.winnerCount)),
    rewardAmount: Math.max(0, Math.floor(input.rewardAmount)),
    endsAt: input.endsAt.toISOString(),
    status: 'active',
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    participants: [],
    winners: [],
  };
  await updateState((state) => {
    state.giveaways.unshift(giveaway);
    if (state.giveaways.length > MAX_GIVEAWAYS) state.giveaways = state.giveaways.slice(0, MAX_GIVEAWAYS);
  });
  return giveaway;
}

// ------------------------------------------------------------
//  Clôture (fin normale ou re-tirage)
// ------------------------------------------------------------

export interface EndGiveawayResult {
  ok: boolean;
  message: string;
  giveaway?: Giveaway;
  winners: string[];
}

export async function endGiveaway(
  guild: Guild,
  ref: string,
  opts: { by: string; reroll?: boolean } = { by: 'bot' },
): Promise<EndGiveawayResult> {
  const state = await getState();
  const giveaway = findGiveaway(state, ref);
  if (!giveaway) return { ok: false, message: '❌ Giveaway introuvable.', winners: [] };
  if (opts.reroll) {
    if (giveaway.status !== 'ended') {
      return { ok: false, message: '❌ Le re-tirage n’est possible que sur un giveaway terminé.', winners: [] };
    }
  } else if (giveaway.status !== 'active') {
    const label = giveaway.status === 'ended' ? 'terminé' : 'annulé';
    return { ok: false, message: `❌ Ce giveaway est déjà ${label}.`, winners: [] };
  }
  if (endingGiveaways.has(giveaway.id)) {
    return { ok: false, message: '⏳ Un tirage est déjà en cours pour ce giveaway…', winners: [] };
  }
  endingGiveaways.add(giveaway.id);
  try {
    return await endGiveawayOnce(guild, giveaway.id, opts);
  } finally {
    endingGiveaways.delete(giveaway.id);
  }
}

async function endGiveawayOnce(
  guild: Guild,
  giveawayId: string,
  opts: { by: string; reroll?: boolean },
): Promise<EndGiveawayResult> {
  const reroll = Boolean(opts.reroll);

  const drawn = await updateState((state) => {
    const current = state.giveaways.find((entry) => entry.id === giveawayId);
    if (!current) return null;
    if (reroll) {
      if (current.status !== 'ended') return null;
    } else if (current.status !== 'active') {
      return null;
    }

    const winners = reroll
      ? drawWinners(current.participants, 1, current.winners)
      : drawWinners(current.participants, current.winnerCount);

    const credited: string[] = [];
    const failed: string[] = [];
    if (current.rewardAmount > 0) {
      for (const winnerId of winners) {
        const account = ensureAccount(state, winnerId);
        const paid = credit(
          account,
          state.config.economy,
          current.rewardAmount,
          'giveaway',
          `Giveaway : ${current.prize.slice(0, 60)}`,
        );
        if (paid.ok) credited.push(winnerId);
        else failed.push(winnerId);
      }
    }

    if (reroll) {
      current.winners.push(...winners);
    } else {
      current.status = 'ended';
      current.endedAt = new Date().toISOString();
      current.winners = winners;
    }
    return { giveaway: current, winners, credited, failed };
  });

  if (!drawn) {
    return { ok: false, message: '❌ Giveaway introuvable ou déjà clôturé.', winners: [] };
  }

  const { giveaway: updated, winners, failed } = drawn;
  const config = (await getState()).config;

  // message du giveaway : embed final, bouton retiré
  const channel = await resolveChannelById(guild, updated.channelId);
  if (channel && updated.messageId) {
    const message = await channel.messages.fetch(updated.messageId).catch(() => null);
    await message
      ?.edit({ embeds: [giveawayEmbed(config, updated)], components: [] })
      .catch(() => undefined);
  }

  // annonce publique dans le salon du giveaway
  const mentions = winners.map((id) => `<@${id}>`).join(', ');
  const rewardText =
    updated.rewardAmount > 0 ? ` (+${formatMoney(config.economy, updated.rewardAmount)} crédités)` : '';
  const announcement = reroll
    ? winners.length
      ? `🎲 **Re-tirage** du giveaway **${updated.prize}** — nouveau gagnant : ${mentions}${rewardText} !`
      : `🎲 **Re-tirage** du giveaway **${updated.prize}** — aucun participant disponible 😢`
    : winners.length
      ? `🎉 **Giveaway terminé** — bravo ${mentions} ! Vous remportez **${updated.prize}**${rewardText} 🥳`
      : `😢 **Giveaway terminé** — personne n’a participé au lot **${updated.prize}**…`;
  await channel
    ?.send({ content: announcement.slice(0, 1900), allowedMentions: { parse: ['users'] } })
    .catch(() => undefined);

  await addLog({
    level: winners.length ? 'success' : 'warn',
    source: opts.by,
    action: reroll ? 'Giveaway re-tiré' : 'Giveaway terminé',
    detail: `${updated.prize} — ${winners.length ? mentions : 'aucun gagnant'} (${updated.participants.length} participant(s))${failed.length ? ` · crédit impossible pour ${failed.map((id) => `<@${id}>`).join(', ')}` : ''}`,
  });

  const message = reroll
    ? winners.length
      ? `🎲 Nouveau gagnant tiré : ${mentions}`
      : '😢 Aucun participant disponible pour un re-tirage.'
    : winners.length
      ? `🎉 Giveaway terminé — ${winners.length} gagnant(s) : ${mentions}`
      : '😢 Giveaway terminé — personne n’a participé.';

  return { ok: true, message, giveaway: updated, winners };
}

/** Termine les giveaways dont l’heure est arrivée (appelé par le planificateur). */
export async function processDueGiveaways(guild: Guild): Promise<number> {
  const due = dueGiveaways(await getState());
  let ended = 0;
  for (const giveaway of due) {
    const result = await endGiveaway(guild, giveaway.id, { by: 'bot' });
    if (result.ok) ended += 1;
  }
  return ended;
}

// ------------------------------------------------------------
//  Annulation
// ------------------------------------------------------------

export async function cancelGiveaway(
  guild: Guild,
  ref: string,
  by: string,
): Promise<{ ok: boolean; message: string }> {
  const state = await getState();
  const giveaway = findGiveaway(state, ref);
  if (!giveaway) return { ok: false, message: '❌ Giveaway introuvable.' };
  if (giveaway.status !== 'active') {
    const label = giveaway.status === 'ended' ? 'terminé' : 'annulé';
    return { ok: false, message: `❌ Ce giveaway est déjà ${label}.` };
  }

  const updated = await updateState((state) => {
    const current = state.giveaways.find((entry) => entry.id === giveaway.id);
    if (!current || current.status !== 'active') return null;
    current.status = 'cancelled';
    current.endedAt = new Date().toISOString();
    return current;
  });
  if (!updated) return { ok: false, message: '❌ Ce giveaway n’est plus actif.' };

  const config = (await getState()).config;
  const channel = await resolveChannelById(guild, updated.channelId);
  if (channel && updated.messageId) {
    const message = await channel.messages.fetch(updated.messageId).catch(() => null);
    await message
      ?.edit({ embeds: [giveawayEmbed(config, updated)], components: [] })
      .catch(() => undefined);
  }
  await channel
    ?.send({
      content: `🚫 Le giveaway **${updated.prize}** vient d’être annulé par l’équipe.`,
      allowedMentions: { parse: [] },
    })
    .catch(() => undefined);
  await addLog({
    level: 'warn',
    source: by,
    action: 'Giveaway annulé',
    detail: `${updated.prize} (${updated.participants.length} participant(s))`,
  });
  return { ok: true, message: `🚫 Giveaway **${updated.prize}** annulé.` };
}

// ------------------------------------------------------------
//  Bouton « Participer »
// ------------------------------------------------------------

export async function handleGiveawayButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, id] = interaction.customId.split(':');
  const flags = replyFlags(interaction);
  if (action !== 'join' || !id) {
    await interaction.reply({ content: 'Action inconnue.', ...flags }).catch(() => undefined);
    return;
  }
  if (interaction.user.bot) {
    await interaction.reply({ content: 'Les bots ne peuvent pas participer 😄', ...flags }).catch(() => undefined);
    return;
  }

  const state = await getState();
  const giveaway = state.giveaways.find((entry) => entry.id === id);
  if (!giveaway) {
    await interaction.reply({ content: '❌ Ce giveaway n’existe plus.', ...flags }).catch(() => undefined);
    return;
  }
  if (!isGiveawayOpen(giveaway)) {
    await interaction
      .reply({ content: '⏰ Ce giveaway est terminé : les participations sont closes.', ...flags })
      .catch(() => undefined);
    return;
  }

  const joined = await updateState((state) => {
    const current = state.giveaways.find((entry) => entry.id === id);
    if (!current || !isGiveawayOpen(current)) return null;
    return toggleParticipant(current, interaction.user.id);
  });
  if (joined === null) {
    await interaction
      .reply({ content: '⏰ Ce giveaway est terminé : les participations sont closes.', ...flags })
      .catch(() => undefined);
    return;
  }

  const fresh = await getState();
  const updated = fresh.giveaways.find((entry) => entry.id === id);
  if (!updated) {
    await interaction.reply({ content: '❌ Ce giveaway n’existe plus.', ...flags }).catch(() => undefined);
    return;
  }

  await interaction.update({ embeds: [giveawayEmbed(fresh.config, updated)] }).catch(() => undefined);
  await interaction
    .followUp({
      content: joined
        ? `✅ Tu participes au giveaway **${updated.prize}** — bonne chance ! 🍀`
        : `❌ Tu ne participes plus au giveaway **${updated.prize}**.`,
      ...flags,
    })
    .catch(() => undefined);
}

// ------------------------------------------------------------
//  Commande /giveaway
// ------------------------------------------------------------

export async function handleGiveawayCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isStaff(interaction)) {
    await interaction.reply({ content: '🔒 Réservé aux administrateurs du serveur.', ...replyFlags(interaction) });
    return;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Cette commande s’utilise sur un serveur.', ...replyFlags(interaction) });
    return;
  }
  const sub = interaction.options.getSubcommand();
  const author = `discord:${interaction.user.tag ?? interaction.user.username}`;

  if (sub === 'creer') {
    await handleGiveawayCreate(interaction, guild, author);
    return;
  }

  if (sub === 'liste') {
    const state = await getState();
    const lines = state.giveaways.slice(0, 15).map((giveaway) => summarizeGiveaway(giveaway));
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(accentColor(state.config.ui))
          .setTitle('🎁 Giveaways')
          .setDescription((lines.join('\n') || 'Aucun giveaway pour le moment.').slice(0, 4000)),
      ],
      ...replyFlags(interaction),
    });
    return;
  }

  if (sub === 'info') {
    const ref = interaction.options.getString('id', true);
    const state = await getState();
    const giveaway = findGiveaway(state, ref);
    if (!giveaway) {
      await interaction.reply({ content: '❌ Giveaway introuvable.', ...replyFlags(interaction) });
      return;
    }
    const meta = giveawayStatusMeta(giveaway.status);
    const endTs = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
    const embed = new EmbedBuilder()
      .setColor(accentColor(state.config.ui))
      .setTitle(`${meta.emoji} ${giveaway.prize}`)
      .addFields(
        { name: 'Statut', value: meta.label, inline: true },
        { name: 'Gagnants prévus', value: String(giveaway.winnerCount), inline: true },
        {
          name: 'Récompense',
          value: giveaway.rewardAmount > 0 ? formatMoney(state.config.economy, giveaway.rewardAmount) : 'Lot symbolique',
          inline: true,
        },
        { name: 'Fin', value: `<t:${endTs}:F> (<t:${endTs}:R>)`, inline: true },
        { name: 'Participants', value: String(giveaway.participants.length), inline: true },
        { name: 'ID', value: `\`${giveaway.id.slice(0, 8)}\``, inline: true },
      )
      .setFooter({
        text: `Hébergé par ${giveaway.createdBy.replace(/^discord:/, '')} · créé le ${new Date(giveaway.createdAt).toLocaleString('fr-FR')}`,
      });
    if (giveaway.description?.trim()) embed.setDescription(giveaway.description.trim().slice(0, 1000));
    if (giveaway.status === 'ended' && giveaway.winners.length) {
      embed.addFields({
        name: 'Gagnants tirés',
        value: giveaway.winners.map((id) => `<@${id}>`).join(' ').slice(0, 1024),
      });
    }
    const mentions = giveaway.participants.map((id) => `<@${id}>`).join(' ');
    if (mentions) embed.addFields({ name: 'Participants', value: mentions.slice(0, 1024) });
    await interaction.reply({ embeds: [embed], ...replyFlags(interaction) });
    return;
  }

  if (sub === 'terminer' || sub === 'reroll' || sub === 'annuler') {
    const ref = interaction.options.getString('id', true);
    await interaction.deferReply(replyFlags(interaction));
    if (sub === 'annuler') {
      const result = await cancelGiveaway(guild, ref, author);
      await interaction.editReply({ content: result.message });
      return;
    }
    const result = await endGiveaway(guild, ref, { by: author, reroll: sub === 'reroll' });
    await interaction.editReply({ content: result.message });
    return;
  }

  await interaction.reply({ content: 'Sous-commande inconnue.', ...replyFlags(interaction) });
}

async function handleGiveawayCreate(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  author: string,
): Promise<void> {
  const flags = replyFlags(interaction);
  const prize = interaction.options.getString('lot', true).trim();
  const durationInput = interaction.options.getString('duree', true).trim();
  const winnerCount = interaction.options.getInteger('gagnants') ?? 1;
  const rewardAmount = interaction.options.getInteger('montant') ?? 0;
  const description = interaction.options.getString('message')?.trim() ?? '';
  const channelOption = interaction.options.getChannel('salon');

  const schedule = parseSchedule(durationInput);
  if (schedule.error) {
    await interaction.reply({ content: `❌ ${schedule.error}`, ...flags });
    return;
  }
  if (!schedule.date) {
    await interaction.reply({
      content: '❌ Indique une durée : `30m`, `2h`, `3j` ou une date (2026-10-06T20:00).',
      ...flags,
    });
    return;
  }
  const durationMs = schedule.date.getTime() - Date.now();
  if (durationMs < MIN_DURATION_MS) {
    await interaction.reply({ content: '❌ La durée doit être d’au moins 1 minute.', ...flags });
    return;
  }
  if (durationMs > MAX_DURATION_MS) {
    await interaction.reply({ content: '❌ La durée ne peut pas dépasser 30 jours.', ...flags });
    return;
  }

  // salon cible : option « salon » (textuel) ou salon courant
  let channel: GuildTextBasedChannel | null = null;
  if (channelOption) {
    const textual =
      channelOption.type === ChannelType.GuildText || channelOption.type === ChannelType.GuildAnnouncement;
    if (!textual) {
      await interaction.reply({ content: '❌ Le salon choisi doit être un salon textuel.', ...flags });
      return;
    }
    channel = channelOption as GuildTextBasedChannel;
  } else if (interaction.channel?.isTextBased() && !interaction.channel.isDMBased()) {
    channel = interaction.channel as GuildTextBasedChannel;
  }
  if (!channel) {
    await interaction.reply({
      content: '❌ Précise un salon textuel (`salon:#…`) ou lance la commande dans le salon visé.',
      ...flags,
    });
    return;
  }

  await interaction.deferReply(flags);

  const state = await getState();
  const config = state.config;

  const giveaway = await createGiveaway({
    guildId: guild.id,
    channelId: channel.id,
    prize,
    description: description || undefined,
    winnerCount,
    rewardAmount,
    endsAt: schedule.date,
    createdBy: author,
  });

  const message = await channel
    .send({ embeds: [giveawayEmbed(config, giveaway)], components: giveawayComponents(giveaway) })
    .catch(() => null);
  if (!message) {
    // impossible de poster : on annule le giveaway créé plutôt que de laisser un fantôme
    await updateState((s) => {
      const current = s.giveaways.find((entry) => entry.id === giveaway.id);
      if (current) {
        current.status = 'cancelled';
        current.endedAt = new Date().toISOString();
      }
    });
    await interaction.editReply({
      content: '❌ Impossible de poster le giveaway dans ce salon (permissions manquantes ?).',
    });
    return;
  }

  await updateState((s) => {
    const current = s.giveaways.find((entry) => entry.id === giveaway.id);
    if (current) current.messageId = message.id;
  });

  await addLog({
    level: 'info',
    source: author,
    action: 'Giveaway créé',
    detail: `**${prize}** — ${winnerCount} gagnant(s), tirage <t:${Math.floor(schedule.date.getTime() / 1000)}:R> dans <#${channel.id}>`,
  });

  const endTs = Math.floor(schedule.date.getTime() / 1000);
  await interaction.editReply({
    content:
      `✅ Giveaway **${prize}** lancé dans <#${channel.id}> !\n` +
      `🏆 ${winnerCount} gagnant(s)${rewardAmount > 0 ? ` · 💰 ${formatMoney(config.economy, rewardAmount)} par gagnant` : ''} · ⏳ tirage <t:${endTs}:R>\n` +
      `ID : \`${giveaway.id.slice(0, 8)}\` — à utiliser pour terminer, annuler ou re-tirer.`,
  });
}
