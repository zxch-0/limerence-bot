import {
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Interaction,
  type GuildMember,
  type User,
} from 'discord.js';
import { replyFlags } from './guards';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import {
  credit,
  debit,
  ensureAccount,
  formatMoney,
  humanDuration,
  isJailed,
  leaderboard,
  moveBetweenPockets,
  rankOf,
  shortMoney,
  totalBalance,
} from '../lib/economy/core';
import {
  pruneExpiredItems,
  runBeg,
  runCrime,
  runDaily,
  runPay,
  runRob,
  runSearch,
  runWork,
} from '../lib/economy/actions';
import { resellItem } from '../lib/shop/items';
import { createAccount } from '../lib/economy/core';
import type { EconomyAccount } from '../lib/types';

// ============================================================
//  Commandes économiques — couche Discord
//  La logique métier vit dans src/lib/economy : ce module ne fait
//  que récupérer le contexte Discord, appeler la logique et
//  mettre en forme la réponse.
// ============================================================

/** Éphémère sur un serveur, réponse normale en MP (Discord refuse l'éphémère en privé). */
function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

function memberRoles(member: GuildMember | null): string[] {
  return member ? member.roles.cache.map((role) => role.id) : [];
}

async function replyResult(interaction: ChatInputCommandInteraction, result: { ok: boolean; message: string }) {
  const payload = { content: result.message.slice(0, 1900), ...ephemOf(interaction) };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => undefined);
  } else {
    await interaction.reply(payload);
  }
}

function balanceEmbed(account: EconomyAccount, config: import('../lib/types').EconomyConfig, user: User): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xc9b8ff)
    .setAuthor({ name: `Solde de ${user.displayName ?? user.username}`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .addFields(
      { name: '💵 Poche', value: shortMoney(config, account.cash), inline: true },
      { name: '🏦 Banque', value: shortMoney(config, account.bank), inline: true },
      { name: '💎 Total', value: shortMoney(config, totalBalance(account)), inline: true },
    )
    .setFooter({ text: `${config.currencyPlural} • Limerence` });
}

export async function handleEconomyCommand(
  interaction: ChatInputCommandInteraction,
  commandName: string,
): Promise<boolean> {
  const state = await getState();
  const config = state.config.economy;

  if (!config.enabled && commandName !== 'balance' && commandName !== 'profil') {
    await interaction.reply({ content: '💤 L’économie est désactivée sur ce serveur.', ...ephemOf(interaction) });
    return true;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Ces commandes s’utilisent sur un serveur.', ...ephemOf(interaction) });
    return true;
  }
  const member = (interaction.member as GuildMember | null) ?? null;
  const userId = interaction.user.id;

  switch (commandName) {
    case 'balance': {
      const target = interaction.options.getUser('membre') ?? interaction.user;
      if (target.bot) {
        await interaction.reply({ content: 'Les bots n’ont pas de portefeuille.', ...ephemOf(interaction) });
        return true;
      }
      const account = await updateState((s) => ensureAccount(s, target.id));
      if (target.id !== userId && config.hideBalances) {
        await interaction.reply({ content: 'Le solde des autres membres est masqué sur ce serveur.', ...ephemOf(interaction) });
        return true;
      }
      await interaction.reply({ embeds: [balanceEmbed(account, config, target)], ...ephemOf(interaction) });
      return true;
    }

    case 'profil': {
      const target = interaction.options.getUser('membre') ?? interaction.user;
      const account = await updateState((s) => {
        const entry = ensureAccount(s, target.id);
        pruneExpiredItems(entry);
        return entry;
      });
      const entries = leaderboard(state, config, {
        guildMemberIds: new Set((await guild.members.fetch().catch(() => null))?.map((m) => m.id) ?? []),
      });
      const rank = rankOf(entries, target.id);
      const embed = new EmbedBuilder()
        .setColor(0xc9b8ff)
        .setAuthor({ name: `Profil de ${target.displayName ?? target.username}`, iconURL: target.displayAvatarURL({ size: 64 }) })
        .addFields(
          { name: '💵 Poche', value: shortMoney(config, account.cash), inline: true },
          { name: '🏦 Banque', value: shortMoney(config, account.bank), inline: true },
          { name: '💎 Total', value: shortMoney(config, totalBalance(account)), inline: true },
          { name: '📈 Gagné', value: shortMoney(config, account.totalEarned), inline: true },
          { name: '📉 Dépensé', value: shortMoney(config, account.totalSpent), inline: true },
          { name: '🏆 Rang', value: config.showRankInProfile && rank ? `#${rank}` : '—', inline: true },
          { name: '🃏 Parties', value: `${account.gamesPlayed} (${account.gamesWon} gagnées)`, inline: true },
          { name: '🔥 Séries', value: `daily ${account.dailyStreak} · win ${account.winStreak}`, inline: true },
          { name: '🎒 Objets', value: String(account.items.length), inline: true },
        )
        .setTimestamp();
      if (isJailed(account)) {
        embed.setDescription('🚓 Ce membre est actuellement en prison.');
      }
      await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
      return true;
    }

    case 'daily':
    case 'work':
    case 'crime':
    case 'beg':
    case 'search': {
      const context = { roleIds: memberRoles(member), displayName: interaction.user.displayName };
      const result = await updateState((s) => {
        const account = ensureAccount(s, userId);
        pruneExpiredItems(account);
        if (commandName === 'daily') return runDaily(s, account, s.config.economy, context);
        if (commandName === 'work') return runWork(s, account, s.config.economy, context);
        if (commandName === 'crime') return runCrime(s, account, s.config.economy, context);
        if (commandName === 'beg') return runBeg(s, account, s.config.economy, context);
        return runSearch(s, account, s.config.economy, context);
      });
      await replyResult(interaction, result);
      return true;
    }

    case 'rob': {
      const victim = interaction.options.getUser('membre', true);
      if (victim.bot) {
        await interaction.reply({ content: 'On ne vole pas un bot.', ...ephemOf(interaction) });
        return true;
      }
      const result = await updateState((s) => {
        const account = ensureAccount(s, userId);
        ensureAccount(s, victim.id);
        return runRob(s, account, victim.id, s.config.economy, { roleIds: memberRoles(member) });
      });
      await replyResult(interaction, {
        ...result,
        message: result.message.includes('<@') ? result.message : `${result.message}\n> Victime : <@${victim.id}>`,
      });
      return true;
    }

    case 'pay': {
      const target = interaction.options.getUser('membre', true);
      const amount = interaction.options.getInteger('montant', true);
      if (target.bot) {
        await interaction.reply({ content: 'Un bot n’a pas de portefeuille.', ...ephemOf(interaction) });
        return true;
      }
      const result = await updateState((s) => {
        const account = ensureAccount(s, userId);
        return runPay(s, account, target.id, amount, s.config.economy);
      });
      await replyResult(interaction, {
        ...result,
        message: result.ok ? `${result.message}\n> Destinataire : <@${target.id}>` : result.message,
      });
      return true;
    }

    case 'bank': {
      if (!config.bankEnabled) {
        await interaction.reply({ content: '🏦 La banque est désactivée sur ce serveur.', ...ephemOf(interaction) });
        return true;
      }
      const sub = interaction.options.getSubcommand();
      const account = await updateState((s) => ensureAccount(s, userId));
      if (sub === 'solde') {
        await interaction.reply({
          content: `🏦 Banque : **${formatMoney(config, account.bank)}** · Poche : **${formatMoney(config, account.cash)}**`,
          ...ephemOf(interaction),
        });
        return true;
      }
      const raw = interaction.options.getInteger('montant', true);
      const amount = raw === 0 ? (sub === 'depot' ? account.cash : account.bank) : raw;
      const result = await updateState((s) => {
        const entry = ensureAccount(s, userId);
        return moveBetweenPockets(entry, s.config.economy, amount, sub === 'depot' ? 'deposit' : 'withdraw');
      });
      await replyResult(interaction, {
        ok: result.ok,
        message: result.ok
          ? `${sub === 'depot' ? '🏦 Dépôt' : '💵 Retrait'} de **${formatMoney(config, result.amount)}** effectué.`
          : (result.reason ?? 'Opération impossible.'),
      });
      return true;
    }

    case 'leaderboard': {
      if (!config.leaderboardEnabled) {
        await interaction.reply({ content: 'Le classement est désactivé.', ...ephemOf(interaction) });
        return true;
      }
      const members = await guild.members.fetch().catch(() => null);
      const ids = new Set<string>();
      const bots = new Set<string>();
      members?.forEach((entry) => {
        ids.add(entry.id);
        if (entry.user.bot) bots.add(entry.id);
      });
      const entries = leaderboard(state, config, { guildMemberIds: ids, knownBotIds: bots }).slice(0, config.leaderboardSize);
      if (!entries.length) {
        await interaction.reply({ content: 'Aucun compte pour le moment.', ...ephemOf(interaction) });
        return true;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = entries.map(
        (entry, index) =>
          `${medals[index] ?? `**${entry.rank}.**`} <@${entry.userId}> — ${shortMoney(config, entry.total)}`,
      );
      const mine = rankOf(leaderboard(state, config, { guildMemberIds: ids, knownBotIds: bots }), userId);
      const embed = new EmbedBuilder()
        .setColor(0x9ff0dc)
        .setTitle(`🏆 Classement — ${config.currencyPlural}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: mine ? `Ta position : #${mine}` : 'Tu n’es pas encore classé.' });
      await interaction.reply({ embeds: [embed] });
      return true;
    }

    case 'inventaire': {
      const account = await updateState((s) => {
        const entry = ensureAccount(s, userId);
        pruneExpiredItems(entry);
        return entry;
      });
      if (!account.items.length) {
        await interaction.reply({ content: '🎒 Ton inventaire est vide. Fais un tour au `/shop liste` !', ...ephemOf(interaction) });
        return true;
      }
      const lines = account.items.map((item) => {
        const until = item.expiresAt ? ` — expire <t:${Math.floor(new Date(item.expiresAt).getTime() / 1000)}:R>` : '';
        return `• **${item.name}**${until}`;
      });
      await interaction.reply({
        embeds: [
          new EmbedBuilder().setColor(0xffc2d9).setTitle('🎒 Inventaire').setDescription(lines.join('\n').slice(0, 4000)),
        ],
        ...ephemOf(interaction),
      });
      return true;
    }

    case 'revendre': {
      const itemId = interaction.options.getString('objet', true);
      const result = await updateState((s) => {
        ensureAccount(s, userId);
        return resellItem(s, userId, itemId, s.config.shop, s.config.economy);
      });
      await replyResult(interaction, { ok: result.ok, message: result.ok ? (result.message ?? 'Vendu.') : (result.error ?? 'Revente impossible.') });
      return true;
    }

    default:
      return false;
  }
}

// ------------------------------------------------------------
//  Administration de l'économie
// ------------------------------------------------------------

export async function handleEconomyAdminCommand(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const sub = interaction.options.getSubcommand();
  const config = (await getState()).config.economy;

  if (sub === 'etat') {
    const state = await getState();
    let cash = 0;
    let bank = 0;
    let best: { name: string; total: number } | null = null;
    for (const account of Object.values(state.accounts)) {
      cash += account.cash;
      bank += account.bank;
      const total = totalBalance(account);
      if (!best || total > best.total) best = { name: `<@${account.userId}>`, total };
    }
    const embed = new EmbedBuilder()
      .setColor(0xc9b8ff)
      .setTitle('💰 État de l’économie')
      .addFields(
        { name: 'Comptes', value: String(Object.keys(state.accounts).length), inline: true },
        { name: 'En poche', value: shortMoney(config, cash), inline: true },
        { name: 'En banque', value: shortMoney(config, bank), inline: true },
        { name: 'Masse totale', value: shortMoney(config, cash + bank), inline: true },
        { name: 'Articles en boutique', value: String(state.shopItems.length), inline: true },
        { name: 'Plus riche', value: best ? `${best.name} (${shortMoney(config, best.total)})` : '—', inline: true },
      );
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return true;
  }

  const target = interaction.options.getUser('membre', true);
  const amount = interaction.options.getInteger('montant', false) ?? 0;
  const moderator = interaction.user;

  const result = await updateState((s) => {
    const account = ensureAccount(s, target.id);
    if (sub === 'donner') {
      const paid = credit(account, s.config.economy, amount, 'admin', `Don de ${moderator.tag ?? moderator.username}`);
      return { ok: paid.ok, message: paid.ok ? `✅ ${formatMoney(s.config.economy, paid.amount)} donnés à <@${target.id}>.` : (paid.reason ?? 'Impossible.') };
    }
    if (sub === 'retirer') {
      const taken = debit(account, s.config.economy, amount, 'admin', `Retrait par ${moderator.tag ?? moderator.username}`);
      return { ok: taken.ok, message: taken.ok ? `✅ ${formatMoney(s.config.economy, taken.amount)} retirés à <@${target.id}>.` : (taken.reason ?? 'Impossible.') };
    }
    if (sub === 'definir') {
      const diff = amount - account.cash;
      if (diff > 0) credit(account, s.config.economy, diff, 'admin', 'Solde défini');
      if (diff < 0) debit(account, s.config.economy, -diff, 'admin', 'Solde défini');
      account.cash = Math.max(0, amount);
      return { ok: true, message: `✅ Solde de <@${target.id}> fixé à ${formatMoney(s.config.economy, account.cash)}.` };
    }
    s.accounts[target.id] = createAccount(target.id, s.config.economy);
    return { ok: true, message: `♻️ Compte de <@${target.id}> réinitialisé à ${formatMoney(s.config.economy, s.config.economy.startBalance)}.` };
  });

  await addLog({
    level: 'economy',
    source: `admin:${moderator.tag ?? moderator.username}`,
    action: `Économie : ${sub}`,
    detail: `${target.tag ?? target.id} — ${amount}`,
  });
  await interaction.reply({ content: result.message, ...ephemOf(interaction) });
  return true;
}

/** Libellé du cooldown restant pour une action (utilisé par les messages d'aide). */
export function remainingCooldownLabel(account: EconomyAccount, key: string): string | null {
  const until = account.cooldowns[key];
  const ms = until ? new Date(until).getTime() - Date.now() : 0;
  return ms > 0 ? humanDuration(ms) : null;
}
