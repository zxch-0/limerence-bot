import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type Guild,
  type GuildMember,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { replyFlags } from './guards';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { accentColor } from './ui';
import { formatMoney } from '../lib/economy/core';
import { effectivePrice, findItem, purchaseItem, sortedItems } from '../lib/shop/items';
import { SHOP_ITEM_TYPE_LABELS, type ShopItem } from '../lib/types';
import { resolveSlotChannel } from '../lib/channels';

// ============================================================
//  Boutique — vitrine, achat par bouton / menu, reçu en MP
// ============================================================

/** Éphémère sur un serveur, réponse normale en MP (Discord refuse l'éphémère en privé). */
function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

function itemLine(item: ShopItem, price: number, discounted: boolean): string {
  const stock = item.stock < 0 ? 'illimité' : item.stock === 0 ? 'épuisé' : `${item.stock} restant(s)`;
  const original = discounted ? ` ~~${item.price}~~` : '';
  return `${item.emoji} **${item.name}** — ${price}${original} · ${SHOP_ITEM_TYPE_LABELS[item.type]} · ${stock}`;
}

export function shopEmbed(state: import('../lib/types').StoreState): EmbedBuilder {
  const config = state.config.shop;
  const items = sortedItems(state).filter((item) => item.enabled && !(config.removeSoldOutItems && item.stock === 0));
  const now = new Date();

  const categories = new Map<string, ShopItem[]>();
  for (const item of items) {
    const list = categories.get(item.category) ?? [];
    list.push(item);
    categories.set(item.category, list);
  }

  const lines: string[] = [];
  for (const [category, list] of categories) {
    lines.push(`### ${category}`);
    for (const item of list) {
      const { price, discounted } = effectivePrice(item, config, now);
      lines.push(itemLine(item, price, discounted));
    }
    lines.push('');
  }

  if (!lines.length) lines.push('La boutique est vide pour le moment.');

  const embed = new EmbedBuilder()
    .setColor(state.config.ui.shopUseTheme ? accentColor(state.config.ui) : 0xffc2d9)
    .setTitle(`${state.config.ui.shopUseTheme ? state.config.ui.accentEmoji : '🛒'} Boutique du serveur`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({
      text: `Taxe ${config.purchaseTaxPercent} % • ${items.length} article(s)${config.saleEnabled ? ` • -${config.salePercent} % en cours` : ''}`,
    });
  return embed;
}

export function shopComponents(state: import('../lib/types').StoreState) {
  const config = state.config.shop;
  const items = sortedItems(state)
    .filter((item) => item.enabled && !(config.removeSoldOutItems && item.stock === 0))
    .slice(0, 25);
  if (!items.length || !config.allowButtons) return [];

  const select = new StringSelectMenuBuilder()
    .setCustomId('shop:select')
    .setPlaceholder('Choisir un article à acheter…')
    .addOptions(
      items.map((item) => {
        const { price } = effectivePrice(item, config);
        return {
          label: `${item.name} — ${price}`.slice(0, 100),
          description: `${SHOP_ITEM_TYPE_LABELS[item.type]} · ${item.description || 'Aucune description'}`.slice(0, 100),
          value: item.id,
          emoji: item.emoji,
        };
      }),
    );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...items.slice(0, 5).map(
        (item) =>
          new ButtonBuilder()
            .setCustomId(`shop:buy:${item.id}`)
            .setLabel(item.name.slice(0, 60))
            .setEmoji(item.emoji)
            .setStyle(item.stock === 0 ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(item.stock === 0),
      ),
    ),
  ];
}

export async function handleShopCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const state = await getState();
  const config = state.config.shop;
  const economy = state.config.economy;
  const sub = interaction.options.getSubcommand();

  if (sub === 'vitrine') {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Réservé à un serveur.', ...ephemOf(interaction) });
      return true;
    }
    const channel = await resolveSlotChannel(guild, state.config, 'shop', { fallback: true });
    if (!channel) {
      await interaction.reply({ content: 'Aucun salon boutique configuré (et aucun repli disponible).', ...ephemOf(interaction) });
      return true;
    }
    await channel.send({ embeds: [shopEmbed(state)], components: shopComponents(state) });
    await interaction.reply({ content: `🛒 Vitrine publiée dans <#${channel.id}>.`, ...ephemOf(interaction) });
    return true;
  }

  if (!config.enabled) {
    await interaction.reply({ content: 'La boutique est fermée.', ...ephemOf(interaction) });
    return true;
  }

  if (sub === 'liste') {
    const category = interaction.options.getString('categorie');
    const embed = shopEmbed(state);
    if (category) {
      const filtered = sortedItems(state).filter(
        (item) => item.enabled && item.category.toLowerCase() === category.trim().toLowerCase(),
      );
      const lines = filtered.map((item) => {
        const { price, discounted } = effectivePrice(item, config);
        return itemLine(item, price, discounted);
      });
      embed.setTitle(`🛒 Boutique — ${category}`).setDescription((lines.join('\n') || 'Aucun article dans cette catégorie.').slice(0, 4000));
    }
    await interaction.reply({ embeds: [embed], ...ephemOf(interaction) });
    return true;
  }

  // achat
  const needle = interaction.options.getString('article', true);
  const item = findItem(state, needle);
  if (!item) {
    await interaction.reply({ content: 'Article introuvable.', ...ephemOf(interaction) });
    return true;
  }
  const member = (interaction.member as GuildMember | null) ?? null;
  const result = await updateState((s) =>
    purchaseItem(s, {
      userId: interaction.user.id,
      itemId: item.id,
      shop: s.config.shop,
      economy: s.config.economy,
      roleIds: member ? member.roles.cache.map((role) => role.id) : [],
    }),
  );
  if (!result.ok || !result.item) {
    await interaction.reply({ content: result.error ?? 'Achat impossible.', ...ephemOf(interaction) });
    return true;
  }

  if (result.grantRoleId && interaction.inGuild() && member) {
    const role = interaction.guild?.roles.cache.get(result.grantRoleId);
    if (role) {
      await member.roles.add(role, `Achat boutique — ${result.item.name}`).catch(() => undefined);
      const hours = result.grantRoleHours ?? 0;
      if (hours > 0) {
        const roleId = role.id;
        const userId = interaction.user.id;
        const guildId = interaction.guild?.id;
        setTimeout(() => {
          void removeRoleLater(guildId, userId, roleId);
        }, hours * 3_600_000);
      }
    }
  }

  if (config.logPurchases) {
    await addLog({
      level: 'economy',
      source: `membre:${interaction.user.id}`,
      action: 'Achat boutique',
      detail: `${result.item.name} — ${formatMoney(economy, result.total ?? 0)}`,
    });
  }
  const shopGuild = interaction.guild;
  if (config.notifyOnPurchase && shopGuild) {
    const channel = await resolveSlotChannel(shopGuild, state.config, 'shop', { fallback: true });
    await channel
      ?.send({
        content: `🛒 <@${interaction.user.id}> vient d’acheter **${result.item.emoji} ${result.item.name}** !`,
        allowedMentions: { parse: [] },
      })
      .catch(() => undefined);
  }
  if (config.sendReceiptInDM) {
    await interaction.user
      .send(`🧾 Reçu : **${result.item.name}** pour ${formatMoney(economy, result.total ?? 0)} sur **${interaction.guild?.name ?? 'Discord'}**.`)
      .catch(() => undefined);
  }

  await interaction.reply({
    content: result.message ?? `${result.item.name} acheté !`,
    ...ephemOf(interaction),
  });
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
  await member.roles.remove(roleId, 'Fin de validité du rôle acheté').catch(() => undefined);
}

export async function handleShopButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('shop:buy:')) return false;
  const itemId = interaction.customId.slice('shop:buy:'.length);
  const member = (interaction.member as GuildMember | null) ?? null;
  const result = await updateState((s) =>
    purchaseItem(s, {
      userId: interaction.user.id,
      itemId,
      shop: s.config.shop,
      economy: s.config.economy,
      roleIds: member ? member.roles.cache.map((role) => role.id) : [],
    }),
  );
  await interaction.reply({
    content: result.ok ? (result.message ?? 'Achat effectué.') : (result.error ?? 'Achat impossible.'),
    ...ephemOf(interaction),
  });
  if (result.ok && result.grantRoleId && interaction.guild) {
    const role = interaction.guild.roles.cache.get(result.grantRoleId);
    if (role && member) {
      await member.roles.add(role, `Achat boutique — ${result.item?.name ?? itemId}`).catch(() => undefined);
    }
  }
  return true;
}

export async function handleShopSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== 'shop:select') return false;
  const itemId = interaction.values[0];
  const member = (interaction.member as GuildMember | null) ?? null;
  const result = await updateState((s) =>
    purchaseItem(s, {
      userId: interaction.user.id,
      itemId,
      shop: s.config.shop,
      economy: s.config.economy,
      roleIds: member ? member.roles.cache.map((role) => role.id) : [],
    }),
  );
  await interaction.reply({
    content: result.ok ? (result.message ?? 'Achat effectué.') : (result.error ?? 'Achat impossible.'),
    ...ephemOf(interaction),
  });
  if (result.ok && result.grantRoleId && interaction.guild) {
    const role = interaction.guild.roles.cache.get(result.grantRoleId);
    if (role && member) {
      await member.roles.add(role, `Achat boutique — ${result.item?.name ?? itemId}`).catch(() => undefined);
    }
  }
  return true;
}

/** Publie la vitrine dans le salon boutique (utilisé au démarrage). */
export async function publishShowcase(guild: Guild): Promise<boolean> {
  const state = await getState();
  if (!state.config.shop.enabled) return false;
  const channel = await resolveSlotChannel(guild, state.config, 'shop');
  if (!channel) return false;
  await channel
    .send({ embeds: [shopEmbed(state)], components: shopComponents(state) })
    .catch(() => undefined);
  return true;
}
