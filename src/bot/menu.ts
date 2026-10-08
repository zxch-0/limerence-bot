import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { replyFlags } from './guards';
import { getState, updateState } from '../lib/store';
import { ensureAccount, formatMoney, shortMoney, totalBalance } from '../lib/economy/core';
import { pruneExpiredItems } from '../lib/economy/actions';
import { accruedIncome, incomePerHour } from '../lib/economy/income';
import { ensureQuests, questProgressFor } from '../lib/economy/quests';
import { ensureLottery, lotteryInfo } from '../lib/economy/lottery';
import { ensureMarket, marketSymbols, portfolioValue } from '../lib/economy/market';
import { casinoEmbed, casinoComponents, xpBar } from './games';
import { progressBar } from './ui';
import { incomeItems, jobsEmbed, jobsComponents, claimIncomeAction } from './income';
import {
  achievementsEmbed,
  handleCrate,
  handlePrestigeButton,
  handleSpin,
  lotteryEmbed,
  marketEmbed,
  questsEmbed,
} from './features';
import type { AppConfig, StoreState } from '../lib/types';

// ============================================================
//  /eco — menu interactif de l’économie
//
//  Un seul panneau pour les membres : solde, niveau, quêtes du
//  jour, jackpot, bourse… avec des boutons d’action rapide et un
//  menu déroulant pour acheter directement un rôle de revenu.
// ============================================================

function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

/** Carte principale du menu éco (données pures → embed). */
export function ecoEmbed(state: StoreState, config: AppConfig, user: User): EmbedBuilder {
  const economy = config.economy;
  const account = ensureAccount(state, user.id);
  const now = new Date();

  const quests = ensureQuests(state, economy);
  const questLines = questProgressFor(account, quests).map((entry) => {
    const mark = entry.completed ? '✅' : '⏳';
    return `${mark} ${entry.quest.emoji} ${entry.quest.label} — ${entry.current}/${entry.target}`;
  });

  const lottery = ensureLottery(state);
  const lotInfo = lotteryInfo(state, account, economy);

  const market = ensureMarket(state, economy);
  const topSymbols = marketSymbols(economy).slice(0, 3);
  const marketLines = topSymbols.map((entry) => {
    const price = market.prices[entry.symbol] ?? entry.startPrice;
    return `**${entry.symbol}** ${formatMoney(economy, Math.round(price * 100) / 100)}`;
  });

  const perHour = incomePerHour(account, now);
  const pending = accruedIncome(account, economy, now);

  const embed = new EmbedBuilder()
    .setColor(0xc9b8ff)
    .setAuthor({ name: `${config.ui.accentEmoji} ${config.ui.brandName} — Économie`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(`💼 Menu économique — ${user.displayName ?? user.username}`)
    .addFields(
      {
        name: '💰 Ton compte',
        value: [
          `**Poche :** ${shortMoney(economy, account.cash)}`,
          `**Banque :** ${shortMoney(economy, account.bank)}`,
          `**Total :** ${shortMoney(economy, totalBalance(account))}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '📈 Progression',
        value: [
          xpBar(config, account),
          `**Prestige :** ${account.prestige}${economy.prestigeEnabled ? ` (+${economy.prestigeBonusPercent * account.prestige} % de gains)` : ''}`,
          `**Série quotidienne :** ${account.dailyStreak} jour(s)`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '💼 Revenus',
        value: [
          `**Actif :** ${formatMoney(economy, perHour)} / heure`,
          `**À réclamer :** ${formatMoney(economy, Math.round(pending))} (/income)`,
          `**Coffres :** ${account.crates} · **Tickets :** ${account.lotteryTickets}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🎯 Quêtes du jour',
        value: (questLines.join('\n') || 'Quêtes désactivées.').slice(0, 1024),
        inline: false,
      },
      {
        name: '🎟️ Loterie',
        value: [
          `**Jackpot :** ${formatMoney(economy, lotInfo.jackpot)}`,
          `**Tickets en jeu :** ${lotInfo.tickets} · **les tiens :** ${lotInfo.myTickets}`,
          lotInfo.nextDrawAt ? `**Tirage :** <t:${Math.floor(new Date(lotInfo.nextDrawAt).getTime() / 1000)}:R>` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        inline: true,
      },
      {
        name: '📊 Bourse',
        value: [
          ...marketLines,
          `**Portefeuille :** ${formatMoney(economy, Math.round(portfolioValue(account, market)))}`,
        ].join('\n'),
        inline: true,
      },
    )
    .setFooter({ text: 'Boutons ci-dessous : joue, achète, réclame. Commandes : /casino · /jobs · /income · /quetes · /loterie · /bourse · /spin · /coffre · /prestige · /succes' })
    .setTimestamp();
  void lottery;
  void progressBar;
  return embed;
}

/** Boutons + menu déroulant du menu éco. */
export function ecoComponents(state: StoreState, config: AppConfig): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const rows: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];

  // menu déroulant : achat direct d’un rôle de revenu
  const income = incomeItems(state).slice(0, 25);
  if (income.length && config.shop.enabled && config.economy.incomeEnabled) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('eco:buy')
          .setPlaceholder('💼 Acheter un rôle de revenu…')
          .addOptions(
            income.map((item) => ({
              label: `${item.name} — ${formatMoney(config.economy, item.price)}`.slice(0, 100),
              description: `${item.effectValue} ${config.economy.currencySymbol} / heure · ${item.description || 'Rôle de revenu'}`.slice(0, 100),
              value: item.id,
              emoji: item.emoji,
            })),
          ),
      ),
    );
  }

  const buttons = [
    new ButtonBuilder().setCustomId('eco:casino').setLabel('Casino').setEmoji('🎰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('eco:jobs').setLabel('Jobs').setEmoji('💼').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eco:quetes').setLabel('Quêtes').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eco:loterie').setLabel('Loterie').setEmoji('🎟️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eco:bourse').setLabel('Bourse').setEmoji('📈').setStyle(ButtonStyle.Secondary),
  ];
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));

  const buttons2 = [
    new ButtonBuilder().setCustomId('eco:spin').setLabel('Roue').setEmoji('🎡').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('eco:coffre').setLabel('Coffre').setEmoji('📦').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('eco:income').setLabel('Revenu').setEmoji('💰').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('eco:succes').setLabel('Succès').setEmoji('🏅').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('eco:prestige').setLabel('Prestige').setEmoji('🌟').setStyle(ButtonStyle.Secondary),
  ];
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons2));

  return rows;
}

export async function handleEcoCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const state = await getState();
  const config = state.config;
  if (!config.economy.enabled) {
    await interaction.reply({ content: '💤 L’économie est désactivée sur ce serveur.', ...ephemOf(interaction) });
    return true;
  }
  await interaction.reply({
    embeds: [ecoEmbed(state, config, interaction.user)],
    components: ecoComponents(state, config),
    ...ephemOf(interaction),
  });
  return true;
}

/** Navigation entre les panneaux du menu éco. */
export async function handleEcoButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('eco:')) return false;
  if (!interaction.inGuild()) return false;
  const target = interaction.customId.split(':')[1];
  const state = await getState();
  const config = state.config;
  const userId = interaction.user.id;

  switch (target) {
    case 'casino':
      await interaction.update({
        embeds: [casinoEmbed(config)],
        components: casinoComponents(config),
      });
      return true;
    case 'jobs':
      await interaction.update({
        embeds: [jobsEmbed(state, config, userId)],
        components: jobsComponents(state, config),
      });
      return true;
    case 'quetes':
      await updateState((s) => {
        const account = ensureAccount(s, userId);
        pruneExpiredItems(account);
        ensureQuests(s, s.config.economy);
        return null;
      });
      await interaction.update({ embeds: [questsEmbed(await getState(), (await getState()).config, userId)], components: backRow() });
      return true;
    case 'loterie':
      await updateState((s) => {
        ensureAccount(s, userId);
        ensureLottery(s);
        return null;
      });
      await interaction.update({ embeds: [lotteryEmbed(await getState(), (await getState()).config, userId)], components: backRow() });
      return true;
    case 'bourse':
      await updateState((s) => {
        ensureAccount(s, userId);
        pruneExpiredItems(s.accounts[userId]);
        ensureMarket(s, s.config.economy);
        return null;
      });
      await interaction.update({ embeds: [marketEmbed(await getState(), (await getState()).config, userId)], components: backRow() });
      return true;
    case 'spin':
      await handleSpin(interaction);
      return true;
    case 'coffre':
      await handleCrate(interaction);
      return true;
    case 'income':
      await claimIncomeAction(interaction);
      return true;
    case 'succes':
      await updateState((s) => {
        ensureAccount(s, userId);
        return null;
      });
      await interaction.update({
        embeds: [achievementsEmbed(await getState(), (await getState()).config, userId, interaction.user)],
        components: backRow(),
      });
      return true;
    case 'prestige':
      return handlePrestigeButton(interaction);
    default:
      return false;
  }
}

/** Achat direct d’un rôle de revenu depuis le menu déroulant. */
export async function handleEcoSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== 'eco:buy') return false;
  if (!interaction.inGuild()) return false;
  // réutilise le flux d’achat de /jobs (attribution du rôle comprise)
  const { buyIncomeRole } = await import('./income');
  await buyIncomeRole(interaction, interaction.values[0]);
  return true;
}

/** Rangée « retour au menu » pour les sous-panneaux. */
function backRow(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eco:menu').setLabel('Retour au menu').setEmoji('🏠').setStyle(ButtonStyle.Primary),
    ),
  ];
}

/** Bouton « retour au menu » (sous-panneaux). */
export async function handleEcoMenuButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId !== 'eco:menu') return false;
  if (!interaction.inGuild()) return false;
  const state = await getState();
  await interaction.update({
    embeds: [ecoEmbed(state, state.config, interaction.user)],
    components: ecoComponents(state, state.config),
  });
  return true;
}

