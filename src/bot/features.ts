import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type User,
} from 'discord.js';
import { replyFlags } from './guards';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import {
  ensureAccount,
  formatMoney,
  humanDuration,
  levelFromXp,
  shortMoney,
  totalBalance,
  xpToNext,
} from '../lib/economy/core';
import { pruneExpiredItems } from '../lib/economy/actions';
import { ensureQuests, formatQuestProgress, questProgressFor } from '../lib/economy/quests';
import { buyTickets, drawLottery, ensureLottery, lotteryInfo } from '../lib/economy/lottery';
import {
  buyStock,
  changeSinceLastTick,
  ensureMarket,
  formatPrice,
  marketSymbols,
  portfolioInvested,
  portfolioOf,
  portfolioValue,
  sellStock,
  tickMarket,
} from '../lib/economy/market';
import {
  achievementProgress,
  checkAchievements,
  grantCrates,
  openCrate,
  runPrestige,
  runSpin,
} from '../lib/economy/extras';
import { progressLines } from './games';
import { announceEconomyEvent } from './rewards';
import { progressBar } from './ui';
import type { AppConfig, EconomyAccount, QuestDef, StoreState } from '../lib/types';

// ============================================================
//  Fonctionnalités économiques — couche Discord
//
//  /quetes · /loterie · /bourse · /spin · /coffre · /prestige · /succes
//  Chaque commande délègue la logique à src/lib (pure) et met
//  en forme la réponse.
// ============================================================

function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

function memberAccount(state: StoreState, userId: string): EconomyAccount {
  return ensureAccount(state, userId);
}

// ------------------------------------------------------------
//  /quetes
// ------------------------------------------------------------

export function questsEmbed(state: StoreState, config: AppConfig, userId: string): EmbedBuilder {
  const economy = config.economy;
  const account = memberAccount(state, userId);
  const quests = ensureQuests(state, config.economy);
  const progress = questProgressFor(account, quests);

  const lines = progress.map((entry) => {
    const done = entry.completed ? '✅' : '⏳';
    return `${done} ${entry.quest.emoji} **${entry.quest.label}**\n   ${formatQuestProgress(entry.current, entry.target)} · +${formatMoney(economy, entry.quest.reward)} · +${entry.quest.xp} XP`;
  });

  return new EmbedBuilder()
    .setColor(0xc9b8ff)
    .setAuthor({ name: `${config.ui.accentEmoji} ${config.ui.brandName} — Quêtes du jour` })
    .setTitle('🎯 Quêtes quotidiennes')
    .setDescription((lines.length ? lines.join('\n\n') : 'Les quêtes sont désactivées.').slice(0, 4000))
    .setFooter({ text: 'Les quêtes sont les mêmes pour tout le serveur et repartent à minuit.' });
}

// ------------------------------------------------------------
//  /loterie
// ------------------------------------------------------------

export function lotteryEmbed(state: StoreState, config: AppConfig, userId: string): EmbedBuilder {
  const economy = config.economy;
  const account = memberAccount(state, userId);
  const info = lotteryInfo(state, account, economy);
  const next = info.nextDrawAt ? `<t:${Math.floor(new Date(info.nextDrawAt).getTime() / 1000)}:R>` : '—';

  const history = info.history.slice(0, 5).map(
    (draw) =>
      `• ${draw.winnerId ? `<@${draw.winnerId}> remporte **${formatMoney(economy, draw.amount)}**` : 'personne'} — <t:${Math.floor(new Date(draw.at).getTime() / 1000)}:R>`,
  );

  return new EmbedBuilder()
    .setColor(0xffe3b3)
    .setAuthor({ name: `${config.ui.accentEmoji} ${config.ui.brandName} — Loterie` })
    .setTitle('🎟️ Loterie du serveur')
    .addFields(
      { name: '🎰 Jackpot', value: `**${formatMoney(economy, info.jackpot)}**`, inline: true },
      { name: '🎫 Tickets en jeu', value: String(info.tickets), inline: true },
      { name: '🎫 Tes tickets', value: String(info.myTickets), inline: true },
      { name: '⏰ Prochain tirage', value: next, inline: true },
      { name: '💵 Prix du ticket', value: formatMoney(economy, economy.lotteryTicketPrice), inline: true },
      {
        name: '🎯 Tes chances',
        value: info.tickets > 0 ? `${Math.round((info.myTickets / info.tickets) * 10000) / 100} %` : 'Achète un ticket !',
        inline: true,
      },
      {
        name: '🏆 Derniers tirages',
        value: (history.join('\n') || 'Aucun tirage pour le moment.').slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({
      text: `Achete des tickets : /loterie acheter nombre · ${economy.lotteryJackpotPercent} % des mises alimentent le jackpot`,
    });
}

// ------------------------------------------------------------
//  /bourse
// ------------------------------------------------------------

export function marketEmbed(state: StoreState, config: AppConfig, userId: string): EmbedBuilder {
  const economy = config.economy;
  const market = ensureMarket(state, economy);
  const account = memberAccount(state, userId);
  const symbols = marketSymbols(economy);

  const rows = symbols.map((entry) => {
    const price = market.prices[entry.symbol] ?? entry.startPrice;
    const change = changeSinceLastTick(market, entry.symbol);
    const arrow = change === null ? '•' : change > 0 ? '▲' : change < 0 ? '▼' : '•';
    const changeText = change === null ? '' : ` ${arrow} ${Math.abs(Math.round(change * 100) / 100)} %`;
    return `**${entry.symbol}** — ${formatPrice(economy, price)}${changeText}`;
  });

  const value = portfolioValue(account, market);
  const invested = portfolioInvested(account);

  return new EmbedBuilder()
    .setColor(0xb8c4ff)
    .setAuthor({ name: `${config.ui.accentEmoji} ${config.ui.brandName} — Bourse` })
    .setTitle('📊 Bourse Limerence')
    .setDescription(rows.join('\n').slice(0, 2000) || 'Aucune action disponible.')
    .addFields({
      name: '💼 Ton portefeuille',
      value: [
        `Valeur : **${formatMoney(economy, Math.round(value))}**`,
        `Investi : **${formatMoney(economy, Math.round(invested))}**`,
        `P&L : **${formatMoney(economy, Math.round(value - invested))}**`,
        `Poche : **${shortMoney(economy, account.cash)}**`,
      ].join('\n'),
      inline: false,
    })
    .setFooter({
      text: `Fluctuation toutes les ${economy.marketTickMinutes} min · frais ${economy.marketFeePercent} % · /bourse acheter LMC 1000 · /bourse vendre LMC tout`,
    });
}

export function portfolioEmbed(state: StoreState, config: AppConfig, userId: string): EmbedBuilder {
  const economy = config.economy;
  const market = ensureMarket(state, economy);
  const account = memberAccount(state, userId);
  const rows = portfolioOf(account, market);

  const embed = new EmbedBuilder()
    .setColor(0xb8c4ff)
    .setTitle('📈 Mon portefeuille')
    .setDescription(
      rows.length
        ? rows
            .map((row) => {
              const sign = row.pnl >= 0 ? '+' : '';
              return `**${row.symbol}** — ${row.qty.toFixed(4)} action(s)\n   Valeur ${formatMoney(economy, row.value)} · P&L ${sign}${formatMoney(economy, row.pnl)}`;
            })
            .join('\n\n')
            .slice(0, 4000)
        : 'Tu ne détiens aucune action. Achète-en avec `/bourse acheter SYMBOLE montant`.',
    );
  embed.addFields({
    name: 'Total',
    value: `**${formatMoney(economy, Math.round(portfolioValue(account, market)))}** (investi : ${formatMoney(economy, Math.round(portfolioInvested(account)))})`,
  });
  return embed;
}

// ------------------------------------------------------------
//  /succes
// ------------------------------------------------------------

export function achievementsEmbed(state: StoreState, config: AppConfig, userId: string, user: User): EmbedBuilder {
  const economy = config.economy;
  const account = memberAccount(state, userId);
  const progress = achievementProgress(account);
  const unlockedCount = progress.filter((entry) => entry.unlocked).length;

  const lines = progress.map((entry) => {
    const mark = entry.unlocked ? '🔓' : '🔒';
    return `${mark} ${entry.def.emoji} **${entry.def.label}**\n   ${entry.def.description}`;
  });

  return new EmbedBuilder()
    .setColor(0xffd166)
    .setAuthor({ name: `Succès de ${user.displayName ?? user.username}`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle('🏅 Succès')
    .setDescription(lines.join('\n\n').slice(0, 4000))
    .setFooter({
      text: `${unlockedCount}/${progress.length} succès débloqués · +${formatMoney(economy, economy.achievementReward)} et +${economy.achievementXp} XP par succès`,
    });
}

// ------------------------------------------------------------
//  Dispatch des commandes
// ------------------------------------------------------------

export async function handleFeaturesCommand(
  interaction: ChatInputCommandInteraction,
  commandName: string,
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Ces commandes s’utilisent sur un serveur.', ...ephemOf(interaction) });
    return true;
  }
  const state = await getState();
  const config = state.config;
  const economy = config.economy;
  const userId = interaction.user.id;

  if (!economy.enabled) {
    await interaction.reply({ content: '💤 L’économie est désactivée sur ce serveur.', ...ephemOf(interaction) });
    return true;
  }

  switch (commandName) {
    case 'quetes': {
      if (!economy.questsEnabled) {
        await interaction.reply({ content: 'Les quêtes sont désactivées.', ...ephemOf(interaction) });
        return true;
      }
      await updateState((s) => {
        const account = ensureAccount(s, userId);
        pruneExpiredItems(account);
        ensureQuests(s, s.config.economy);
        return null;
      });
      const fresh = await getState();
      await interaction.reply({ embeds: [questsEmbed(fresh, fresh.config, userId)], ...ephemOf(interaction) });
      return true;
    }

    case 'loterie': {
      if (!economy.lotteryEnabled) {
        await interaction.reply({ content: 'La loterie est désactivée.', ...ephemOf(interaction) });
        return true;
      }
      const sub = interaction.options.getSubcommand();
      if (sub === 'acheter') {
        const count = interaction.options.getInteger('nombre', true);
        if (count < 1 || count > 100) {
          await interaction.reply({ content: 'Entre 1 et 100 tickets.', ...ephemOf(interaction) });
          return true;
        }
        const result = await updateState((s) => {
          const account = ensureAccount(s, userId);
          return buyTickets(s, account, count, s.config.economy);
        });
        if (!result.ok) {
          await interaction.reply({ content: `❌ ${result.reason ?? 'Achat impossible.'}`, ...ephemOf(interaction) });
          return true;
        }
        const fresh = await getState();
        const embed = lotteryEmbed(fresh, fresh.config, userId);
        embed.setDescription(
          `✅ **${result.tickets}** ticket(s) acheté(s) ! Jackpot actuel : **${formatMoney(economy, result.jackpot)}**.`,
        );
        await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
        return true;
      }
      // infos
      await updateState((s) => {
        ensureAccount(s, userId);
        ensureLottery(s);
        return null;
      });
      const fresh = await getState();
      await interaction.reply({ embeds: [lotteryEmbed(fresh, fresh.config, userId)], ...ephemOf(interaction) });
      return true;
    }

    case 'bourse': {
      if (!economy.marketEnabled) {
        await interaction.reply({ content: 'La bourse est désactivée.', ...ephemOf(interaction) });
        return true;
      }
      const sub = interaction.options.getSubcommand();

      // initialise le compte + le marché (persistant)
      await updateState((s) => {
        const account = ensureAccount(s, userId);
        pruneExpiredItems(account);
        ensureMarket(s, s.config.economy);
        return null;
      });
      const fresh = await getState();

      if (sub === 'cours') {
        await interaction.reply({ embeds: [marketEmbed(fresh, fresh.config, userId)], ...ephemOf(interaction) });
        return true;
      }
      if (sub === 'portefeuille') {
        await interaction.reply({ embeds: [portfolioEmbed(fresh, fresh.config, userId)], ...ephemOf(interaction) });
        return true;
      }

      const symbol = interaction.options.getString('symbole', true);
      // « montant » est obligatoire pour acheter, facultatif pour vendre (vide = tout vendre)
      const montant = interaction.options.getInteger('montant', sub === 'acheter');

      if (sub === 'acheter') {
        const { result, unlocked } = await updateState((s) => {
          const account = ensureAccount(s, userId);
          const trade = buyStock(s, account, symbol, montant ?? 0, s.config.economy);
          const achievements = trade.ok ? checkAchievements(s, account, s.config.economy).map((entry) => entry.def.id) : [];
          return { result: trade, unlocked: achievements };
        });
        if (!result.ok) {
          await interaction.reply({ content: `❌ ${result.reason ?? 'Achat impossible.'}`, ...ephemOf(interaction) });
          return true;
        }
        const account = memberAccount(await getState(), userId);
        const market = ensureMarket(await getState(), economy);
        await interaction.reply({
          content: [
            `✅ Achat effectué : **${result.qty?.toFixed(4)} ${result.symbol}** pour ${formatMoney(economy, result.total ?? 0)} (cours ${formatPrice(economy, result.price ?? 0)}).`,
            `Portefeuille : ${formatMoney(economy, Math.round(portfolioValue(account, market)))} · Poche : ${shortMoney(economy, account.cash)}`,
            ...progressLines(unlocked.length ? { achievements: unlocked, questsCompleted: [] } : undefined, economy),
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 1900),
          ...ephemOf(interaction),
        });
        return true;
      }

      // vendre
      const tout = montant === null;
      const { result, unlocked } = await updateState((s) => {
        const account = ensureAccount(s, userId);
        const trade = sellStock(s, account, symbol, montant ?? 0, s.config.economy, tout);
        const achievements = trade.ok ? checkAchievements(s, account, s.config.economy).map((entry) => entry.def.id) : [];
        return { result: trade, unlocked: achievements };
      });
      if (!result.ok) {
        await interaction.reply({ content: `❌ ${result.reason ?? 'Vente impossible.'}`, ...ephemOf(interaction) });
        return true;
      }
      const account = memberAccount(await getState(), userId);
      await interaction.reply({
        content: [
          `✅ Vente effectuée : **${result.qty?.toFixed(4)} ${result.symbol}** pour **${formatMoney(economy, result.total ?? 0)}** (cours ${formatPrice(economy, result.price ?? 0)}).`,
          `Nouveau solde en poche : **${shortMoney(economy, account.cash)}**`,
          ...progressLines(unlocked.length ? { achievements: unlocked, questsCompleted: [] } : undefined, economy),
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1900),
        ...ephemOf(interaction),
      });
      return true;
    }

    case 'spin': {
      await handleSpin(interaction);
      return true;
    }

    case 'coffre': {
      await handleCrate(interaction);
      return true;
    }

    case 'prestige': {
      await handlePrestige(interaction);
      return true;
    }

    case 'succes': {
      if (!economy.achievementsEnabled) {
        await interaction.reply({ content: 'Les succès sont désactivés.', ...ephemOf(interaction) });
        return true;
      }
      await updateState((s) => {
        const account = ensureAccount(s, userId);
        checkAchievements(s, account, s.config.economy);
        return null;
      });
      const state2 = await getState();
      await interaction.reply({
        embeds: [achievementsEmbed(state2, state2.config, userId, interaction.user)],
        ...ephemOf(interaction),
      });
      return true;
    }

    default:
      return false;
  }
}

// ------------------------------------------------------------
//  /spin — roue de la fortune (avec animation)
// ------------------------------------------------------------

export async function handleSpin(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const state = await getState();
  const economy = state.config.economy;
  if (!economy.spinEnabled) {
    await interaction.reply({ content: 'La roue de la fortune est désactivée.', ...ephemOf(interaction) });
    return;
  }
  const userId = interaction.user.id;

  await interaction.deferReply(ephemOf(interaction));
  await interaction.editReply({ content: '🎡 La roue tourne…' });
  await new Promise((resolve) => setTimeout(resolve, 1400));

  const { result, unlocked } = await updateState((s) => {
    const account = ensureAccount(s, userId);
    pruneExpiredItems(account);
    const spin = runSpin(s, account, s.config.economy);
    const achievements = spin.ok ? checkAchievements(s, account, s.config.economy).map((entry) => entry.def.id) : [];
    return { result: spin, unlocked: achievements };
  });

  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.reason ?? 'Spin impossible.'}` });
    return;
  }

  const account = memberAccount(await getState(), userId);
  const embed = new EmbedBuilder()
    .setColor(result.jackpot ? 0xffd700 : result.amount > 0 ? 0x9ff0dc : 0xff8fa3)
    .setAuthor({
      name: `${interaction.user.displayName ?? interaction.user.username} — roue de la fortune`,
      iconURL: interaction.user.displayAvatarURL({ size: 64 }),
    })
    .setTitle(result.jackpot ? '🎡 JACKPOT !' : '🎡 La roue s’arrête…')
    .setDescription(
      result.jackpot
        ? `👑 **JACKPOT : ${formatMoney(economy, result.amount)}** !`
        : result.amount > 0
          ? `✨ Tu remportes **${formatMoney(economy, result.amount)}** !`
          : (result.reason ?? 'La roue n’a rien donné cette fois…'),
    )
    .addFields(
      { name: '💵 Poche', value: shortMoney(economy, account.cash), inline: true },
      { name: '🎡 Prochain tour', value: `dans ${economy.spinCooldownHours} h`, inline: true },
      { name: '💎 Total', value: shortMoney(economy, totalBalance(account)), inline: true },
    )
    .setTimestamp();

  const lines = progressLines(
    unlocked.length ? { achievements: unlocked, questsCompleted: [] } : undefined,
    economy,
  );
  if (lines.length) embed.addFields({ name: '✨ Progression', value: lines.join('\n').slice(0, 1024) });

  await interaction.editReply({ content: '', embeds: [embed] });
  if (result.jackpot && interaction.guild) {
    await announceEconomyEvent(
      interaction.guild,
      `🎡 <@${userId}> vient de remporter le **JACKPOT** de la roue : ${formatMoney(economy, result.amount)} !`,
    );
  }
  await addLog({
    level: 'economy',
    source: `membre:${userId}`,
    action: 'Roue de la fortune',
    detail: `${result.amount}${result.jackpot ? ' (jackpot)' : ''}`,
  });
}

// ------------------------------------------------------------
//  /coffre — ouvrir un coffre
// ------------------------------------------------------------

export async function handleCrate(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const state = await getState();
  const economy = state.config.economy;
  if (!economy.cratesEnabled) {
    await interaction.reply({ content: 'Les coffres sont désactivés.', ...ephemOf(interaction) });
    return;
  }
  const userId = interaction.user.id;

  await interaction.deferReply(ephemOf(interaction));
  await interaction.editReply({ content: '📦 Le coffre s’ouvre…' });
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const { result, unlocked } = await updateState((s) => {
    const account = ensureAccount(s, userId);
    pruneExpiredItems(account);
    const crate = openCrate(s, account, s.config.economy);
    const achievements = crate.ok ? checkAchievements(s, account, s.config.economy).map((entry) => entry.def.id) : [];
    return { result: crate, unlocked: achievements };
  });

  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.reason ?? 'Aucun coffre à ouvrir.'}` });
    return;
  }

  const account = memberAccount(await getState(), userId);
  const lines = [
    result.freeClaimed ? '🎁 Ton **coffre gratuit quotidien** est arrivé !' : '',
    result.jackpot
      ? `👑 **JACKPOT : ${formatMoney(economy, result.amount)}** !`
      : result.amount > 0
        ? `✨ Tu trouves **${formatMoney(economy, result.amount)}** dans le coffre !`
        : 'Le coffre était vide cette fois…',
    result.xp > 0 ? `📈 +${result.xp} XP` : '',
    `📦 Coffres restants : **${result.cratesLeft}**`,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(result.jackpot ? 0xffd700 : 0xffc2d9)
    .setAuthor({
      name: `${interaction.user.displayName ?? interaction.user.username} — coffre`,
      iconURL: interaction.user.displayAvatarURL({ size: 64 }),
    })
    .setTitle('📦 Coffre ouvert')
    .setDescription(lines.join('\n'))
    .addFields(
      { name: '💵 Poche', value: shortMoney(economy, account.cash), inline: true },
      { name: '💎 Total', value: shortMoney(economy, totalBalance(account)), inline: true },
    )
    .setTimestamp();
  const extraLines = progressLines(unlocked.length ? { achievements: unlocked, questsCompleted: [] } : undefined, economy);
  if (extraLines.length) embed.addFields({ name: '✨ Progression', value: extraLines.join('\n').slice(0, 1024) });
  await interaction.editReply({ content: '', embeds: [embed] });

  if (result.jackpot && interaction.guild) {
    await announceEconomyEvent(
      interaction.guild,
      `📦 <@${userId}> a ouvert un coffre et remporté le **JACKPOT** : ${formatMoney(economy, result.amount)} !`,
    );
  }
}

// ------------------------------------------------------------
//  /prestige
// ------------------------------------------------------------

export async function handlePrestige(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const state = await getState();
  const economy = state.config.economy;
  const userId = interaction.user.id;

  const result = await updateState((s) => {
    const account = ensureAccount(s, userId);
    return runPrestige(s, account, s.config.economy);
  });

  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.reason ?? 'Prestige impossible.'}`, ...ephemOf(interaction) });
    return;
  }

  await addLog({
    level: 'economy',
    source: `membre:${userId}`,
    action: 'Prestige',
    detail: `prestige #${result.prestige}`,
  });
  if (interaction.guild) {
    await announceEconomyEvent(
      interaction.guild,
      `🌟 <@${userId}> a prestigé ! Niveau de prestige **${result.prestige}** → bonus de gains **+${economy.prestigeBonusPercent * result.prestige} %** permanents.`,
    );
  }
  await interaction.reply({
    content: [
      `🌟 **Prestige #${result.prestige}** !`,
      `Ton compte économique repart à zéro (sauf tes succès et tes rôles), mais tu gagnes désormais un bonus permanent de **+${economy.prestigeBonusPercent} %** de gains par niveau de prestige (soit **+${economy.prestigeBonusPercent * result.prestige} %**).`,
      'Les niveaux et le prestige se cumulent : plus tu recommences, plus tu gagnes vite !',
    ].join('\n'),
    ...ephemOf(interaction),
  });
}

/** Boutons de confirmation du prestige (depuis le menu éco). */
export async function handlePrestigeButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId === 'eco:prestige') {
    const state = await getState();
    const economy = state.config.economy;
    const account = memberAccount(state, interaction.user.id);
    if (!economy.prestigeEnabled) {
      await interaction.reply({ content: 'Le prestige est désactivé.', ...ephemOf(interaction) });
      return true;
    }
    await interaction.reply({
      content: [
        `🌟 **Prestigier ?** Tu as **${formatMoney(economy, totalBalance(account))}** (seuil : ${formatMoney(economy, economy.prestigeMinTotal)}).`,
        'Ton compte repart à zéro (sauf les succès et les rôles) contre un bonus permanent de gains.',
      ].join('\n'),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('eco:prestige:confirm')
            .setLabel('Confirmer le prestige')
            .setEmoji('🌟')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('eco:prestige:cancel').setLabel('Annuler').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
        ),
      ],
      ...ephemOf(interaction),
    });
    return true;
  }
  if (interaction.customId === 'eco:prestige:confirm') {
    await handlePrestige(interaction);
    return true;
  }
  if (interaction.customId === 'eco:prestige:cancel') {
    await interaction.update({ content: 'Prestige annulé.', components: [] }).catch(() => undefined);
    return true;
  }
  return false;
}

// ------------------------------------------------------------
//  Tâches planifiées (appelées par le scheduler)
// ------------------------------------------------------------

/** Tirage de la loterie + annonce. Renvoie le résultat du tirage. */
export async function scheduledLotteryDraw(): Promise<{ drawn: boolean; winnerId: string | null; amount: number }> {
  const state = await getState();
  const economy = state.config.economy;
  if (!economy.enabled || !economy.lotteryEnabled) return { drawn: false, winnerId: null, amount: 0 };

  const result = await updateState((s) => drawLottery(s, s.config.economy));
  if (!result.drawn) return { drawn: false, winnerId: null, amount: 0 };

  const { getReadyClient } = await import('../lib/discord/client');
  const client = getReadyClient();
  const guildId = state.config.guildId?.trim() || process.env.DISCORD_GUILD_ID?.trim();
  const guild = client && guildId ? await client.guilds.fetch(guildId).catch(() => null) : null;
  if (guild && economy.lotteryAnnounce) {
    await announceEconomyEvent(
      guild,
      `🎟️ **Tirage de la loterie !** <@${result.winnerId}> remporte le jackpot de **${formatMoney(economy, result.amount)}** ! (${result.tickets} tickets en jeu) 🎉`,
    );
  }
  await addLog({
    level: 'economy',
    source: 'bot',
    action: 'Tirage de la loterie',
    detail: `gagnant ${result.winnerId ?? '—'} · ${formatMoney(economy, result.amount)}`,
  });
  return { drawn: true, winnerId: result.winnerId, amount: result.amount };
}

/** Fait fluctuer les cours de la bourse. */
export async function scheduledMarketTick(): Promise<number> {
  const state = await getState();
  const economy = state.config.economy;
  if (!economy.enabled || !economy.marketEnabled) return 0;
  const moves = await updateState((s) => tickMarket(s, s.config.economy));
  return moves.length;
}

export { grantCrates, humanDuration, levelFromXp, xpToNext, progressBar };
export type { QuestDef };
