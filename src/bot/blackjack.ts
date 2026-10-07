import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type InteractionReplyOptions,
} from 'discord.js';
import { replyFlags } from './guards';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { formatMoney } from '../lib/economy/core';
import {
  abandonGame,
  finishGame,
  getGame,
  getStats,
  isRoundComplete,
  maxAllowedBet,
  newGame,
  playerAction,
  totalWagered,
  type BlackjackAction,
} from '../lib/blackjack/table';
import {
  canDouble,
  canSplit,
  canSurrender,
  canTakeInsurance,
  handValue,
  handGlyph,
  isBlackjack,
  maxInsurance,
} from '../lib/blackjack/engine';
import type { BlackjackConfig, BlackjackGame, EconomyConfig } from '../lib/types';

// ============================================================
//  Blackjack — couche Discord (affichage de la table, boutons)
// ============================================================

/** Éphémère sur un serveur, réponse normale en MP (Discord refuse l'éphémère en privé). */
function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

function colorOf(config: BlackjackConfig): number {
  const hex = config.tableColor.replace('#', '');
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : 0x1e7a4c;
}

function handLine(game: BlackjackGame, index: number): string {
  const hand = game.hands[index];
  if (!hand) return '';
  const { total } = handValue(hand.cards);
  const marker = hand.busted ? '💥' : hand.blackjack ? '🂡' : hand.stood ? '✋' : hand.doubled ? '×2' : '▶️';
  const prefix = game.activeHand === index && game.status === 'playing' ? '**' : '';
  return `${prefix}${marker} Main ${index + 1} : ${handGlyph(hand.cards)} — **${total}** (${formatMoneyShort(hand.bet)})${prefix}`;
}

function formatMoneyShort(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')}`;
}

export function tableEmbed(
  game: BlackjackGame,
  config: BlackjackConfig,
  economy: EconomyConfig,
  options: { title?: string; note?: string; finished?: boolean; net?: number } = {},
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(colorOf(config)).setTitle(options.title ?? '🃏 Table de blackjack');

  const dealerVisible = game.holeRevealed || game.status === 'finished' ? game.dealer : game.dealer.slice(0, 1);
  const dealerValue = handValue(dealerVisible);
  const dealerText =
    game.status === 'finished' || game.holeRevealed
      ? `${handGlyph(game.dealer)} — **${handValue(game.dealer).total}**`
      : `${handGlyph(dealerVisible)} + ${config.cardBack}`;

  const description: string[] = [
    `**Donneur** : ${dealerText}${game.status !== 'finished' && !game.holeRevealed ? ` (${dealerValue.total})` : ''}`,
    '',
    ...game.hands.map((_, index) => handLine(game, index)),
  ];

  if (game.insuranceBet > 0) description.push(`🛡️ Assurance : ${formatMoney(economy, game.insuranceBet)}`);
  if (game.sideBet > 0) description.push(`🎰 Pari annexe : ${formatMoney(economy, game.sideBet)}`);
  description.push('', `**Mise totale engagée :** ${formatMoney(economy, totalWagered(game))}`);

  if (options.note) description.push('', options.note);
  if (options.finished && typeof options.net === 'number') {
    description.push(
      '',
      options.net > 0
        ? `🎉 Tu gagnes **${formatMoney(economy, options.net)}**.`
        : options.net === 0
          ? '🤝 Égalité : ta mise t’est rendue.'
          : `😔 Tu perds **${formatMoney(economy, -options.net)}**.`,
    );
  }

  embed.setDescription(description.join('\n').slice(0, 4000));

  if (game.status === 'playing' && !isRoundComplete(game)) {
    const seconds = Math.max(0, Math.round((game.timeoutAt - Date.now()) / 1000));
    embed.setFooter({ text: `${config.footerText} • temps restant : ${seconds}s` });
  } else {
    embed.setFooter({ text: config.footerText });
  }
  return embed;
}

export function actionRows(
  game: BlackjackGame,
  config: BlackjackConfig,
): ActionRowBuilder<ButtonBuilder>[] {
  if (game.status === 'insurance' && canTakeInsurance(config, game)) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('bj:insurance')
          .setLabel(`Assurance (${maxInsurance(config, game.baseBet)})`)
          .setEmoji('🛡️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('bj:decline-insurance')
          .setLabel('Continuer sans assurance')
          .setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  if (game.status !== 'playing' || isRoundComplete(game)) return [];

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bj:hit').setLabel('Carte').setEmoji('🃏').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bj:stand').setLabel('Rester').setEmoji('✋').setStyle(ButtonStyle.Secondary),
  );
  if (canDouble(config, game)) {
    row.addComponents(
      new ButtonBuilder().setCustomId('bj:double').setLabel('Doubler').setEmoji('💰').setStyle(ButtonStyle.Success),
    );
  }
  if (canSplit(config, game)) {
    row.addComponents(
      new ButtonBuilder().setCustomId('bj:split').setLabel('Split').setEmoji('✂️').setStyle(ButtonStyle.Secondary),
    );
  }
  if (canSurrender(config, game)) {
    row.addComponents(
      new ButtonBuilder().setCustomId('bj:surrender').setLabel('Abandon').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
    );
  }
  return [row];
}

// ------------------------------------------------------------
//  Commande /blackjack
// ------------------------------------------------------------

export async function handleBlackjackCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Le blackjack se joue sur un serveur.', ...ephemOf(interaction) });
    return true;
  }
  const state = await getState();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  const sub = interaction.options.getSubcommand();

  if (sub === 'regles') {
    const embed = new EmbedBuilder()
      .setColor(colorOf(config))
      .setTitle('📜 Règles de la table')
      .setDescription(
        [
          `• Sabot : **${config.decks} jeu(x)** de 52 cartes, remélangé après ${config.shufflePenetrationPercent} %`,
          `• Donneur : ${config.dealerStandsOnSoft17 ? 'reste' : 'tire'} sur un 17 souple`,
          `• Blackjack payé **${config.blackjackPayout}**`,
          `• Double : ${config.allowDoubleDown ? (config.doubleOnAnyTwoCards ? 'sur toutes les mains' : 'sur 9, 10, 11') : 'désactivée'}${config.doubleAfterSplit ? ' (après split aussi)' : ''}`,
          `• Split : ${config.allowSplit ? `jusqu'à ${config.maxSplits} fois${config.splitAcesOneCard ? ', une carte par as' : ''}` : 'désactivé'}`,
          `• Assurance : ${config.allowInsurance ? `jusqu'à ${config.insuranceMaxPercent} % de la mise, payée ${config.insurancePayout}` : 'désactivée'}`,
          `• Abandon : ${config.allowSurrender ? `${config.surrenderRefundPercent} % de la mise remboursée` : 'désactivé'}`,
          `• 21+3 : ${config.sideBet21Plus3Enabled ? `payé ×${config.sideBet21Plus3Payout} (×4 en quinte flush)` : 'désactivé'}`,
          `• Paire parfaite : ${config.perfectPairsEnabled ? `payée ×${config.perfectPairsPayout}` : 'désactivée'}`,
          `• Mise : de ${formatMoney(economy, config.minBet)} à ${Number.isFinite(maxAllowedBet(config, economy, Number.MAX_SAFE_INTEGER)) ? formatMoney(economy, maxAllowedBet(config, economy, Number.MAX_SAFE_INTEGER)) : 'illimitée'}`,
          `• Taxe sur les gains : ${config.taxPercent} %`,
          `• Temps de réflexion : ${config.turnTimeoutSeconds} s`,
        ].join('\n'),
      );
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return true;
  }

  if (sub === 'stats') {
    const stats = getStats(state, interaction.user.id);
    const accuracy = stats.hands ? Math.round((stats.wins / stats.hands) * 100) : 0;
    const embed = new EmbedBuilder()
      .setColor(colorOf(config))
      .setTitle(`📊 Tes statistiques — ${interaction.user.displayName}`)
      .addFields(
        { name: 'Parties', value: String(stats.hands), inline: true },
        { name: 'Victoires', value: `${stats.wins} (${accuracy} %)`, inline: true },
        { name: 'Égalités', value: String(stats.pushes), inline: true },
        { name: 'Blackjacks', value: String(stats.blackjacks), inline: true },
        { name: 'Meilleure série', value: String(stats.bestStreak), inline: true },
        { name: 'Plus gros gain', value: formatMoney(economy, stats.biggestWin), inline: true },
        { name: 'Misé', value: formatMoney(economy, stats.wagered), inline: true },
        { name: 'Récupéré', value: formatMoney(economy, stats.returned), inline: true },
        { name: 'Bilan', value: formatMoney(economy, stats.returned - stats.wagered), inline: true },
      );
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return true;
  }

  if (sub === 'quitter') {
    const game = getGame(state, interaction.user.id);
    if (!game) {
      await interaction.reply({ content: 'Tu n’as aucune partie en cours.', ...ephemOf(interaction) });
      return true;
    }
    const refund = await updateState((s) => abandonGame(s, interaction.user.id, 0));
    await interaction.reply({
      content: `🏳️ Partie abandonnée.${refund > 0 ? ` ${formatMoney(economy, refund)} remboursés.` : ' Ta mise est perdue.'}`,
      ...ephemOf(interaction),
    });
    return true;
  }

  if (config.allowedChannels.length && !config.allowedChannels.includes(interaction.channelId)) {
    await interaction.reply({
      content: `🎰 Les tables sont réservées à ces salons : ${config.allowedChannels.map((id) => `<#${id}>`).join(' ')}`,
      ...ephemOf(interaction),
    });
    return true;
  }

  const existing = getGame(state, interaction.user.id);
  if (sub === 'jouer') {
    if (existing) {
      await interaction.reply({ content: 'Tu as déjà une partie en cours : utilise les boutons ou `/blackjack carte`.', ...ephemOf(interaction) });
      return true;
    }
    const bet = interaction.options.getInteger('mise', true);
    const sideBet = interaction.options.getInteger('annexe') ?? 0;
    await interaction.deferReply(replyFlags(interaction));
    const created = await updateState((s) =>
      newGame(s, {
        guildId: guild.id,
        userId: interaction.user.id,
        channelId: interaction.channelId,
        bet,
        sideBet,
        config: s.config.blackjack,
        economy: s.config.economy,
      }),
    );
    if (!created.ok || !created.game) {
      await interaction.editReply({ content: created.error ?? 'Impossible d’ouvrir une table.' });
      return true;
    }
    const game = created.game;

    // blackjack d'entrée : le donneur retourne sa carte immédiatement
    if (isBlackjack(game.hands[0].cards) && config.dealerPeeksForBlackjack) {
      await finishAndReply(interaction, interaction.user.id);
      return true;
    }

    await interaction.editReply({
      embeds: [tableEmbed(game, config, economy, { note: created.note })],
      components: actionRows(game, config),
    });
    return true;
  }

  // actions en cours de partie
  if (!existing) {
    await interaction.reply({ content: 'Tu n’as aucune partie en cours. Lance `/blackjack jouer`.', ...ephemOf(interaction) });
    return true;
  }

  const action: BlackjackAction =
    sub === 'carte'
      ? 'hit'
      : sub === 'rester'
        ? 'stand'
        : sub === 'doubler'
          ? 'double'
          : sub === 'split'
            ? 'split'
            : sub === 'assurance'
              ? 'insurance'
              : 'surrender';

  const amount = sub === 'assurance' ? (interaction.options.getInteger('montant') ?? undefined) : undefined;
  const result = await updateState((s) =>
    playerAction(s, interaction.user.id, {
      action,
      amount,
      config: s.config.blackjack,
      economy: s.config.economy,
    }),
  );
  if (!result.ok) {
    await interaction.reply({ content: result.error ?? 'Action impossible.', ...ephemOf(interaction) });
    return true;
  }
  if (!result.game) {
    await interaction.reply({ content: 'Partie introuvable.', ...ephemOf(interaction) });
    return true;
  }

  if (isRoundComplete(result.game)) {
    await finishAndReply(interaction, interaction.user.id);
    return true;
  }
  await interaction.reply({
    embeds: [tableEmbed(result.game, config, economy)],
    components: actionRows(result.game, config),
    ...ephemOf(interaction),
  });
  return true;
}

async function finishAndReply(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  userId: string,
): Promise<void> {
  const state = await getState();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  const result = await updateState((s) =>
    finishGame(s, userId, { config: s.config.blackjack, economy: s.config.economy }),
  );
  if (!result) {
    const payload = { content: 'Partie terminée.', ...ephemOf(interaction) };
    await safeReply(interaction, payload);
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(colorOf(config))
    .setTitle(
      result.net > 0 ? '🎉 Blackjack — tu gagnes' : result.net === 0 ? '🤝 Blackjack — égalité' : '💸 Blackjack — perdu',
    )
    .setDescription(
      [
        ...result.settlement.lines,
        '',
        `**Misé :** ${formatMoney(economy, result.settlement.wagered)}`,
        `**Récupéré :** ${formatMoney(economy, result.credited)}`,
        result.tax > 0 ? `**Taxe :** ${formatMoney(economy, result.tax)}` : '',
        result.streakBonus > 0 ? `**Bonus de série :** +${formatMoney(economy, result.streakBonus)}` : '',
        result.pity > 0 ? `**Remise de consolation :** +${formatMoney(economy, result.pity)}` : '',
        '',
        result.net > 0
          ? `🎉 Bilan : **+${formatMoney(economy, result.net)}**`
          : result.net === 0
            ? '🤝 Bilan : 0'
            : `😔 Bilan : **-${formatMoney(economy, -result.net)}**`,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000),
    )
    .setFooter({ text: `Donneur : ${result.settlement.dealerBust ? 'saute' : result.settlement.dealerTotal}` });
  await safeReply(interaction, { embeds: [embed], components: [], ...ephemOf(interaction) });
}

async function safeReply(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  payload: InteractionReplyOptions,
): Promise<void> {
  if (interaction.deferred) {
    await interaction
      .editReply({
        content: payload.content,
        embeds: payload.embeds as never,
        components: payload.components as never,
      })
      .catch(() => undefined);
    return;
  }
  if (interaction.replied) {
    await interaction.followUp(payload).catch(() => undefined);
    return;
  }
  await interaction.reply(payload).catch(() => undefined);
}

// ------------------------------------------------------------
//  Boutons de la table
// ------------------------------------------------------------

export async function handleBlackjackButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('bj:')) return false;
  if (!interaction.inGuild()) return false;
  const action = interaction.customId.slice(3);
  const userId = interaction.user.id;
  const state = await getState();
  const config = state.config.blackjack;
  const economy = state.config.economy;

  if (action === 'decline-insurance') {
    const game = getGame(state, userId);
    if (!game) {
      await interaction.reply({ content: 'Partie terminée.', ...ephemOf(interaction) });
      return true;
    }
    await updateState((s) => {
      const current = s.blackjack[userId];
      if (current && current.status === 'insurance') current.status = 'playing';
      return null;
    });
    const updated = (await getState()).blackjack[userId];
    if (!updated) {
      await interaction.reply({ content: 'Partie terminée.', ...ephemOf(interaction) });
      return true;
    }
    await interaction
      .update({ embeds: [tableEmbed(updated, config, economy)], components: actionRows(updated, config) })
      .catch(() => undefined);
    return true;
  }

  const mapped: BlackjackAction | null =
    action === 'hit'
      ? 'hit'
      : action === 'stand'
        ? 'stand'
        : action === 'double'
          ? 'double'
          : action === 'split'
            ? 'split'
            : action === 'surrender'
              ? 'surrender'
              : action === 'insurance'
                ? 'insurance'
                : null;
  if (!mapped) return false;

  const result = await updateState((s) =>
    playerAction(s, userId, { action: mapped, config: s.config.blackjack, economy: s.config.economy }),
  );
  if (!result.ok) {
    await interaction.reply({ content: result.error ?? 'Action impossible.', ...ephemOf(interaction) });
    return true;
  }
  if (result.game && isRoundComplete(result.game)) {
    await finishAndReply(interaction, userId);
    return true;
  }
  if (!result.game) {
    await interaction.reply({ content: 'Partie introuvable.', ...ephemOf(interaction) });
    return true;
  }
  await interaction
    .update({ embeds: [tableEmbed(result.game, config, economy)], components: actionRows(result.game, config) })
    .catch(() => undefined);
  return true;
}

// ------------------------------------------------------------
//  Parties abandonnées par le temps (appelé par le planificateur)
// ------------------------------------------------------------

export async function expireTimedOutGames(): Promise<number> {
  const state = await getState();
  const now = Date.now();
  const expired = Object.values(state.blackjack).filter((game) => game.timeoutAt <= now);
  let count = 0;
  for (const game of expired) {
    const action = state.config.blackjack.autoActionOnTimeout;
    if (action === 'forfeit') {
      await updateState((s) => {
        abandonGame(s, game.userId, 0);
        return null;
      });
    } else {
      await updateState((s) => {
        playerAction(s, game.userId, {
          action: action === 'hit' ? 'hit' : 'stand',
          config: s.config.blackjack,
          economy: s.config.economy,
        });
        finishGame(s, game.userId, { config: s.config.blackjack, economy: s.config.economy });
        return null;
      });
    }
    await notifyTimeout(game.userId, game.guildId).catch(() => undefined);
    count += 1;
  }
  if (count > 0) {
    await addLog({
      level: 'economy',
      source: 'bot',
      action: 'Parties de blackjack expirées',
      detail: `${count} partie(s) terminée(s) automatiquement`,
    });
  }
  return count;
}

async function notifyTimeout(userId: string, guildId: string): Promise<void> {
  const { getReadyClient } = await import('../lib/discord/client');
  const client = getReadyClient();
  if (!client) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const state = await getState();
  const account = state.accounts[userId];
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;
  const balance = account ? formatMoney(state.config.economy, account.cash) : 'inconnu';
  await user
    .send(
      `⏱️ Ta partie de blackjack sur **${guild.name}** a expiré. Action automatique : **${state.config.blackjack.autoActionOnTimeout}**. Solde : ${balance}.`,
    )
    .catch(() => undefined);
}
