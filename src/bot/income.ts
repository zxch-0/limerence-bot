import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { replyFlags } from './guards';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { ensureAccount, formatMoney, shortMoney, totalBalance } from '../lib/economy/core';
import { pruneExpiredItems } from '../lib/economy/actions';
import { accruedIncome, claimIncome, formatIncomePerHour, incomeBreakdown, incomePerHour } from '../lib/economy/income';
import { effectivePrice, purchaseItem, sortedItems } from '../lib/shop/items';
import { trackQuest } from '../lib/economy/quests';
import { checkAchievements } from '../lib/economy/extras';
import { announceEconomyEvent } from './rewards';
import { progressLines } from './games';
import type { OutcomeInfo } from '../lib/games/table';
import { accentColor } from './ui';
import type { AppConfig, EconomyConfig, ShopItem, StoreState } from '../lib/types';

// ============================================================
//  Rôles de revenu — /jobs (menu interactif d’achat) et /income
//
//  Les articles « Rôle de revenu » de la boutique attribuent un
//  rôle Discord ET génèrent un revenu passif par heure, réclammable
//  à tout moment avec /income.
// ============================================================

function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

function memberRoles(member: GuildMember | null): string[] {
  return member ? member.roles.cache.map((role) => role.id) : [];
}

/** Articles « rôle de revenu » achetables. */
export function incomeItems(state: StoreState): ShopItem[] {
  return sortedItems(state).filter((item) => item.enabled && item.type === 'income');
}

// ------------------------------------------------------------
//  /jobs — menu interactif
// ------------------------------------------------------------

export function jobsEmbed(state: StoreState, config: AppConfig, userId: string): EmbedBuilder {
  const economy = config.economy;
  const items = incomeItems(state);
  const account = state.accounts[userId];
  const now = new Date();

  const lines: string[] = [];
  if (!items.length) {
    lines.push('Aucun rôle de revenu n’est en vente pour le moment.');
  }
  for (const item of items) {
    const { price, total, discounted } = effectivePrice(item, config.shop, now);
    const duration = item.durationHours > 0 ? ` · ${item.durationHours} h` : ' · permanent';
    const owned = account?.items.some((entry) => entry.itemId === item.id && (!entry.expiresAt || new Date(entry.expiresAt) > now)) ?? false;
    lines.push(
      `${item.emoji} **${item.name}** — ${discounted ? `~~${formatMoney(economy, item.price)}~~ ` : ''}**${formatMoney(economy, price)}** (+${formatMoney(economy, total)} de taxe)\n` +
        `　　💼 Revenu : **${formatIncomePerHour(economy, item.effectValue)}**${duration}${owned ? ' · ✅ déjà actif' : ''}`,
    );
  }

  const perHour = account ? incomePerHour(account, now) : 0;
  const pending = account ? accruedIncome(account, economy, now) : 0;

  return new EmbedBuilder()
    .setColor(accentColor(config.ui))
    .setAuthor({ name: `${config.ui.accentEmoji} ${config.ui.brandName} — Emplois` })
    .setTitle('💼 Rôles de revenu')
    .setDescription(
      [
        'Achète un rôle Discord qui te **paye toutes les heures** : le revenu s’accumule même hors ligne.',
        'Réclame ton salaire quand tu veux avec `/income`.',
        '',
        ...lines,
      ]
        .join('\n')
        .slice(0, 4000),
    )
    .addFields(
      {
        name: '💵 Ton solde',
        value: account ? shortMoney(economy, account.cash) : formatMoney(economy, economy.startBalance),
        inline: true,
      },
      { name: '💼 Revenu actif', value: formatIncomePerHour(economy, perHour), inline: true },
      { name: '⏳ À réclamer', value: formatMoney(economy, Math.round(pending)), inline: true },
    )
    .setFooter({ text: 'Les rôles de revenu se règlent dans le panel → Boutique (type « Rôle de revenu »).' });
}

export function jobsComponents(state: StoreState, config: AppConfig) {
  const items = incomeItems(state).slice(0, 25);
  if (!items.length || !config.shop.enabled) return [];
  const rows: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];

  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('jobs:select')
        .setPlaceholder('Acheter un rôle de revenu…')
        .addOptions(
          items.map((item) => {
            const { total } = effectivePrice(item, config.shop);
            return {
              label: `${item.name} — ${formatMoney(config.economy, total)}`.slice(0, 100),
              description: `${formatIncomePerHour(config.economy, item.effectValue)} · ${item.description || 'Rôle de revenu'}`.slice(0, 100),
              value: item.id,
              emoji: item.emoji,
            };
          }),
        ),
    ),
  );

  if (config.shop.allowButtons) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...items.slice(0, 5).map((item) => {
          const { total } = effectivePrice(item, config.shop);
          return new ButtonBuilder()
            .setCustomId(`jobs:buy:${item.id}`)
            .setLabel(`${item.name} · ${formatMoney(config.economy, total)}`.slice(0, 80))
            .setEmoji(item.emoji)
            .setStyle(ButtonStyle.Success);
        }),
      ),
    );
  }
  return rows;
}

/** Achat d’un rôle de revenu + attribution du rôle Discord. */
export async function buyIncomeRole(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ChatInputCommandInteraction,
  itemId: string,
): Promise<void> {
  const state = await getState();
  const config = state.config;
  if (!config.shop.enabled) {
    await interaction.reply({ content: 'La boutique est fermée.', ...ephemOf(interaction) });
    return;
  }
  const member = (interaction.member as GuildMember | null) ?? null;
  const userId = interaction.user.id;

  const result = await updateState((s) => {
    const account = ensureAccount(s, userId);
    pruneExpiredItems(account);
    return purchaseItem(s, {
      userId,
      itemId,
      shop: s.config.shop,
      economy: s.config.economy,
      roleIds: memberRoles(member),
    });
  });

  if (!result.ok || !result.item) {
    await interaction.reply({ content: `❌ ${result.error ?? 'Achat impossible.'}`, ...ephemOf(interaction) });
    return;
  }

  // attribution du rôle Discord (comme un article « rôle » classique)
  if (result.grantRoleId && interaction.inGuild() && member) {
    const role = interaction.guild?.roles.cache.get(result.grantRoleId);
    if (role) {
      await member.roles.add(role, `Rôle de revenu — ${result.item.name}`).catch(() => undefined);
      const hours = result.grantRoleHours ?? 0;
      if (hours > 0) {
        const roleId = role.id;
        const guildId = interaction.guild?.id;
        setTimeout(() => {
          void removeRoleLater(guildId, userId, roleId);
        }, hours * 3_600_000);
      }
    }
  }

  // quêtes + succès (dépense d’argent)
  const info = await updateState((s) => {
    const account = ensureAccount(s, userId);
    const quests = trackQuest(s, account, s.config.economy, 'spend_money', result.total ?? 0).completed;
    const unlocked = checkAchievements(s, account, s.config.economy).map((entry) => entry.def.id);
    return { quests, unlocked };
  });
  const extra: OutcomeInfo = { achievements: info.unlocked, questsCompleted: info.quests };

  await addLog({
    level: 'economy',
    source: `membre:${userId}`,
    action: 'Rôle de revenu acheté',
    detail: `${result.item.name} — ${formatMoney(config.economy, result.total ?? 0)}`,
  });
  if (interaction.guild) {
    await announceEconomyEvent(
      interaction.guild,
      `💼 <@${userId}> a acheté **${result.item.emoji} ${result.item.name}** et gagne désormais **${formatIncomePerHour(config.economy, result.item.effectValue)}** !`,
    );
  }

  const lines = [
    `✅ ${result.item.emoji} **${result.item.name}** acheté pour **${formatMoney(config.economy, result.total ?? 0)}**.`,
    `💼 Ce rôle te rapporte **${formatIncomePerHour(config.economy, result.item.effectValue)}**.`,
    'Réclame ton revenu à tout moment avec `/income`.',
    ...progressLines(extra, config.economy),
  ];
  await interaction.reply({ content: lines.join('\n').slice(0, 1900), ...ephemOf(interaction) });
}

export async function handleJobsCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const state = await getState();
  const config = state.config;
  if (!config.economy.enabled) {
    await interaction.reply({ content: '💤 L’économie est désactivée.', ...ephemOf(interaction) });
    return true;
  }
  if (!config.economy.incomeEnabled) {
    await interaction.reply({ content: 'Les revenus de rôles sont désactivés.', ...ephemOf(interaction) });
    return true;
  }
  await interaction.reply({
    embeds: [jobsEmbed(state, config, interaction.user.id)],
    components: jobsComponents(state, config),
    ...ephemOf(interaction),
  });
  return true;
}

export async function handleJobsButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('jobs:buy:')) return false;
  if (!interaction.inGuild()) return false;
  await buyIncomeRole(interaction, interaction.customId.slice('jobs:buy:'.length));
  return true;
}

export async function handleJobsSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== 'jobs:select') return false;
  if (!interaction.inGuild()) return false;
  await buyIncomeRole(interaction, interaction.values[0]);
  return true;
}

async function removeRoleLater(guildId?: string, userId?: string, roleId?: string): Promise<void> {
  if (!guildId || !userId || !roleId) return;
  const { getReadyClient } = await import('../lib/discord/client');
  const client = getReadyClient();
  if (!client) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.remove(roleId, 'Fin de validité du rôle de revenu').catch(() => undefined);
}

// ------------------------------------------------------------
//  /income — réclamer le revenu accumulé
// ------------------------------------------------------------

export function incomeEmbed(state: StoreState, config: AppConfig, userId: string): EmbedBuilder {
  const economy = config.economy;
  const account = state.accounts[userId];
  const now = new Date();
  const perHour = account ? incomePerHour(account, now) : 0;
  const pending = account ? accruedIncome(account, economy, now) : 0;
  const breakdown = account ? incomeBreakdown(account, now) : [];

  const embed = new EmbedBuilder()
    .setColor(0x9ff0dc)
    .setAuthor({ name: `${config.ui.accentEmoji} ${config.ui.brandName} — Revenu` })
    .setTitle('💰 Revenu des rôles')
    .addFields(
      { name: '💼 Revenu horaire', value: formatIncomePerHour(economy, perHour), inline: true },
      { name: '⏳ Accumulé', value: formatMoney(economy, Math.round(pending)), inline: true },
      { name: '🏦 Réclamé au total', value: formatMoney(economy, account?.incomeTotal ?? 0), inline: true },
    );

  if (breakdown.length) {
    embed.addFields({
      name: '📋 Détail des rôles actifs',
      value: breakdown
        .map((row) => `• **${row.name}** — ${formatIncomePerHour(economy, row.perHour)}${row.expiresAt ? ` (expire <t:${Math.floor(new Date(row.expiresAt).getTime() / 1000)}:R>)` : ''}`)
        .join('\n')
        .slice(0, 1024),
    });
  } else {
    embed.setDescription('Tu n’as aucun rôle de revenu actif. Achète-en un avec `/jobs` !');
  }
  if (account) {
    embed.setFooter({ text: `Poche : ${shortMoney(economy, account.cash)} · Total : ${shortMoney(economy, totalBalance(account))}` });
  }
  return embed;
}

/** Réclame le revenu (commande /income ou bouton du menu éco). */
export async function claimIncomeAction(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const before = await getState();
  const economy = before.config.economy;

  const result = await updateState((s) => {
    const account = ensureAccount(s, userId);
    pruneExpiredItems(account);
    return claimIncome(s, account, s.config.economy);
  });

  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.reason ?? 'Rien à réclamer.'}`, ...ephemOf(interaction) });
    return;
  }

  // quêtes + succès
  const info = await updateState((s) => {
    const account = ensureAccount(s, userId);
    const quests = trackQuest(s, account, s.config.economy, 'income', 1).completed;
    quests.push(...trackQuest(s, account, s.config.economy, 'gain_money', result.amount).completed);
    const unlocked = checkAchievements(s, account, s.config.economy).map((entry) => entry.def.id);
    return { quests, unlocked };
  });

  await addLog({
    level: 'economy',
    source: `membre:${userId}`,
    action: 'Revenu réclamé',
    detail: formatMoney(economy, result.amount),
  });

  const state = await getState();
  const embed = incomeEmbed(state, state.config, userId);
  embed.setDescription(
    [
      `✅ **${formatMoney(economy, result.amount)}** réclamés (revenu de tes rôles : ${formatIncomePerHour(economy, result.perHour)}).`,
      ...progressLines({ achievements: info.unlocked, questsCompleted: info.quests }, economy),
    ].join('\n'),
  );
  await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
}

export async function handleIncomeCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const state = await getState();
  if (!state.config.economy.enabled) {
    await interaction.reply({ content: '💤 L’économie est désactivée.', ...ephemOf(interaction) });
    return true;
  }
  await claimIncomeAction(interaction);
  return true;
}

export type { EconomyConfig };
