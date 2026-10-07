import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import {
  createAccount,
  formatMoney,
  leaderboard,
  rankOf,
  totalBalance,
  cooldownRemaining,
  isJailed,
} from '../lib/economy/core';
import { effectivePrice, sortedItems } from '../lib/shop/items';
import { getStats } from '../lib/blackjack/table';
import { activeWarns } from '../lib/moderation/cases';
import {
  SHOP_ITEM_TYPE_LABELS,
  type AppConfig,
  type EconomyAccount,
  type StoreState,
  type UiConfig,
} from '../lib/types';

// ============================================================
//  Système d'interface du bot.
//
//  Un seul endroit définit l'apparence (couleur, emoji, pied de
//  page, séparateurs, barres de progression) et le menu central
//  qui regroupe toutes les fonctionnalités : économie, blackjack,
//  boutique, modération, communauté et serveur.
//
//  Les cartes sont d'abord produites sous forme de données pures
//  (UiCard) puis converties en embeds : la mise en page est donc
//  testable sans Discord.
// ============================================================

export type UiSectionId = 'hub' | 'economy' | 'blackjack' | 'shop' | 'moderation' | 'community' | 'info';

export interface UiSection {
  id: UiSectionId;
  label: string;
  emoji: string;
  /** couleur propre (utilisée si colorizeBySection) */
  color: number;
  description: string;
  shortcuts: string[];
  /** section réservée à l'équipe */
  staffOnly?: boolean;
  /** option de configuration qui active la section */
  flag: keyof UiConfig;
  /** la section dépend d'une fonctionnalité (masquée si elle est coupée) */
  requires?: 'economy' | 'blackjack' | 'shop' | 'moderation' | 'community';
}

export const UI_SECTIONS: UiSection[] = [
  {
    id: 'economy',
    label: 'Économie',
    emoji: '💰',
    color: 0xffe3b3,
    description: 'Solde, gains quotidiens, classement et cagnotte en cours.',
    shortcuts: ['/balance', '/daily', '/work', '/leaderboard'],
    flag: 'sectionEconomy',
    requires: 'economy',
  },
  {
    id: 'blackjack',
    label: 'Blackjack',
    emoji: '🃏',
    color: 0x9ff0dc,
    description: 'Tables, règles et statistiques de jeu.',
    shortcuts: ['/blackjack jouer', '/blackjack stats', '/blackjack regles'],
    flag: 'sectionBlackjack',
    requires: 'blackjack',
  },
  {
    id: 'shop',
    label: 'Boutique',
    emoji: '🛒',
    color: 0xc9b8ff,
    description: 'Articles disponibles, prix et stock.',
    shortcuts: ['/shop liste', '/shop vitrine', '/inventaire'],
    flag: 'sectionShop',
    requires: 'shop',
  },
  {
    id: 'moderation',
    label: 'Modération',
    emoji: '🛡️',
    color: 0xff9f9f,
    description: 'Avertissements, dossiers, auto-modération et anti-raid.',
    shortcuts: ['/warn ajouter', '/cas liste', '/purge messages', '/antiraid statut'],
    staffOnly: true,
    flag: 'sectionModeration',
    requires: 'moderation',
  },
  {
    id: 'community',
    label: 'Communauté',
    emoji: '🪄',
    color: 0xffc2d9,
    description: 'Confessions, annonces, embeds et vocaux temporaires.',
    shortcuts: ['/confession', '/annonce', '/embed creer'],
    flag: 'sectionCommunity',
    requires: 'community',
  },
  {
    id: 'info',
    label: 'Serveur',
    emoji: '📊',
    color: 0xb8c4ff,
    description: 'État du bot, du serveur et de la configuration.',
    shortcuts: ['/serverinfo', '/ping', '/aide'],
    flag: 'sectionInfo',
  },
];

export function sectionById(id: string): UiSection | undefined {
  return UI_SECTIONS.find((section) => section.id === id);
}

// ------------------------------------------------------------
//  Contexte de rendu
// ------------------------------------------------------------

export interface UiContext {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  isStaff: boolean;
  guildName: string;
  memberCount?: number;
  channelCount?: number;
  roleCount?: number;
  /** lien du panel web (si PUBLIC_URL est connu) */
  webUrl?: string | null;
}

// ------------------------------------------------------------
//  Primitives de mise en forme (pures)
// ------------------------------------------------------------

export function parseColor(value: string, fallback = 0xc9b8ff): number {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return Number.parseInt(hex, 16);
}

export function accentColor(config: UiConfig): number {
  return parseColor(config.accentColor);
}

export function sectionColor(config: UiConfig, section: UiSection): number {
  return config.colorizeBySection ? section.color : accentColor(config);
}

export function divider(config: UiConfig): string {
  if (!config.showDivider) return '';
  const unit = config.divider.trim() || '━';
  return unit.repeat(Math.max(1, Math.min(24, Math.ceil(12 / unit.length))));
}

/** Barre de progression textuelle (plafonds, stock, pénétration…). */
export function progressBar(config: UiConfig, value: number, max: number): string {
  if (!config.cardShowProgressBar) return '';
  const blocks = Math.max(5, Math.min(30, config.cardProgressBlocks));
  const filled = config.progressFilledChar.trim() || '▰';
  const empty = config.progressEmptyChar.trim() || '▱';
  if (!Number.isFinite(max) || max <= 0) return filled.repeat(blocks);
  const ratio = Math.max(0, Math.min(1, value / max));
  const count = Math.round(ratio * blocks);
  return `${filled.repeat(count)}${empty.repeat(blocks - count)} ${Math.round(ratio * 100)}%`;
}

/** Remplace les jetons `{cle}` d'un modèle (bienvenue, descriptions…). */
export function templateReplace(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

/** Formate une durée en secondes en texte court français. */
export function shortDuration(seconds: number): string {
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  if (value < 86_400) return `${Math.round(value / 3600)} h`;
  return `${Math.round(value / 86_400)} j`;
}

// ------------------------------------------------------------
//  Sections visibles
// ------------------------------------------------------------

export interface UiFeatureFlags {
  economy: boolean;
  blackjack: boolean;
  shop: boolean;
  moderation: boolean;
  community: boolean;
}

export function featureFlags(config: AppConfig): UiFeatureFlags {
  return {
    economy: config.economy.enabled,
    blackjack: config.economy.enabled && config.blackjack.enabled,
    shop: config.economy.enabled && config.shop.enabled,
    moderation: config.moderation.warnEnabled || config.moderation.automodEnabled || config.moderation.raidProtectionEnabled,
    community: config.confessions.enabled || config.welcome.enabled || config.joinToCreate.enabled,
  };
}

/**
 * Sections réellement affichables pour un membre donné : options
 * d'activation, fonctions coupées et droits d'accès.
 */
export function visibleSections(config: UiConfig, features: UiFeatureFlags, isStaff: boolean): UiSection[] {
  return UI_SECTIONS.filter((section) => {
    if (config[section.flag] !== true) return false;
    if (section.staffOnly && config.moderationStaffOnly && !isStaff) return false;
    if (section.requires && config.hideDisabledSections && !features[section.requires]) return false;
    return true;
  });
}

// ------------------------------------------------------------
//  Cartes (données pures)
// ------------------------------------------------------------

export interface UiField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface UiCard {
  section: UiSectionId;
  title: string;
  description: string;
  fields: UiField[];
  footer?: string;
  thumbnail?: string;
}

function money(config: AppConfig, amount: number): string {
  return formatMoney(config.economy, amount);
}

export function hubCard(state: StoreState, config: AppConfig, ctx: UiContext, sections: UiSection[]): UiCard {
  const ui = config.ui;
  const lines: string[] = [];
  if (ui.hubDescription.trim()) lines.push(ui.hubDescription.trim());

  const fields: UiField[] = [];

  if (ui.hubShowAccount) {
    const account = state.accounts[ctx.userId];
    const entries = leaderboard(state, config.economy);
    const rank = account ? rankOf(entries, ctx.userId) : 0;
    fields.push({
      name: `${config.economy.currencySymbol} Ton compte`,
      value: account
        ? [
            `**Poche :** ${money(config, account.cash)}`,
            `**Banque :** ${money(config, account.bank)}`,
            `**Total :** ${money(config, totalBalance(account))}`,
            rank ? `**Classement :** #${rank} / ${entries.length}` : '',
            isJailed(account) ? '🚓 Tu es en prison.' : '',
          ]
            .filter(Boolean)
            .join('\n')
        : 'Aucun compte pour le moment : envoie un message ou fais `/daily` pour en créer un.',
      inline: false,
    });
  }

  if (ui.hubShowStats) {
    const hands = Object.values(state.blackjackStats).reduce((total, stats) => total + stats.hands, 0);
    fields.push({
      name: '📊 Le serveur',
      value: [
        `**Membres suivis :** ${Object.keys(state.accounts).length}`,
        `**Articles en boutique :** ${state.shopItems.filter((item) => item.enabled).length}`,
        `**Parties de blackjack :** ${hands}`,
        `**Avertissements actifs :** ${state.cases.filter((entry) => entry.type === 'warn' && entry.active).length}`,
      ].join('\n'),
      inline: true,
    });

    if (ui.hubLeaderboardSize > 0) {
      const top = leaderboard(state, config.economy).slice(0, ui.hubLeaderboardSize);
      fields.push({
        name: '🏆 Classement',
        value: top.length
          ? top
              .map((entry, index) => `\`${index + 1}.\` <@${entry.userId}> — ${money(config, entry.total)}`)
              .join('\n')
          : 'Personne pour l’instant.',
        inline: true,
      });
    }
  }

  if (ui.hubShowShortcuts && sections.length) {
    lines.push('', divider(ui), '', '**Sections disponibles**');
    for (const section of sections) {
      lines.push(`${section.emoji} **${section.label}** — ${section.description}`);
    }
  }

  if (ui.hubShowWebLink && ctx.webUrl) {
    lines.push('', `🖥️ Panel d'administration : <${ctx.webUrl}>`);
  }

  return {
    section: 'hub',
    title: `${ui.hubTitle.trim() || 'Menu central'}`,
    description: lines.join('\n').slice(0, 4000),
    fields,
    footer: ui.showFooter ? ui.footerText : undefined,
    thumbnail: ui.useThumbnails ? (ctx.avatarUrl ?? undefined) : undefined,
  };
}

/**
 * Compte en **lecture seule** : afficher une carte ne doit jamais créer
 * ni modifier un compte (l'état renvoyé par getState() est partagé).
 */
function peekAccount(state: StoreState, config: AppConfig, userId: string): EconomyAccount {
  return state.accounts[userId] ?? createAccount(userId, config.economy);
}

export function economyCard(state: StoreState, config: AppConfig, ctx: UiContext): UiCard {
  const economy = config.economy;
  const account = peekAccount(state, config, ctx.userId);
  const entries = leaderboard(state, economy);
  const rank = rankOf(entries, ctx.userId);
  const drop = state.meta.activeDrop;

  const fields: UiField[] = [
    {
      name: '💼 Soldes',
      value: `**Poche :** ${money(config, account.cash)}\n**Banque :** ${money(config, account.bank)}\n**Total :** ${money(
        config,
        totalBalance(account),
      )}`,
      inline: true,
    },
    {
      name: '🏅 Position',
      value: rank ? `#${rank} sur ${entries.length}` : 'Non classé',
      inline: true,
    },
  ];

  if (config.ui.cardShowProgressBar) {
    const cap = economy.messageDailyCapEnabled ? economy.messageDailyCap : 0;
    fields.push({
      name: '💬 Gains « message » aujourd’hui',
      value: cap
        ? `${money(config, account.earnedFromMessagesToday)} / ${money(config, cap)}\n${progressBar(
            config.ui,
            account.earnedFromMessagesToday,
            cap,
          )}`
        : `${money(config, account.earnedFromMessagesToday)} (pas de plafond)`,
      inline: false,
    });
  }

  fields.push({
    name: '⏳ Prochaines actions',
    value: [
      economy.dailyEnabled ? `/daily dans ${shortDuration(cooldownRemaining(account, 'daily') / 1000)}` : '',
      economy.workEnabled ? `/work dans ${shortDuration(cooldownRemaining(account, 'work') / 1000)}` : '',
      economy.crimeEnabled ? `/crime dans ${shortDuration(cooldownRemaining(account, 'crime') / 1000)}` : '',
    ]
      .filter(Boolean)
      .join('\n') || 'Aucune commande activée.',
    inline: false,
  });

  if (drop) {
    fields.push({
      name: '🎁 Cagnotte en cours',
      value: `**${money(config, drop.amount)}** dans <#${drop.channelId}>${
        drop.claimedBy ? ` — déjà prise par <@${drop.claimedBy}>` : ''
      }`,
      inline: false,
    });
  }

  const description = [
    `Série quotidienne : **${account.dailyStreak}** jour(s) · série de victoires : **${account.winStreak}**`,
    economy.enabled ? '' : '⚠️ L’économie est désactivée sur ce serveur.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    section: 'economy',
    title: '💰 Économie',
    description,
    fields,
    footer: config.ui.showFooter ? config.ui.footerText : undefined,
  };
}

export function blackjackCard(state: StoreState, config: AppConfig, ctx: UiContext): UiCard {
  const table = config.blackjack;
  const stats = getStats(state, ctx.userId);
  const winRate = stats.hands ? Math.round((stats.wins / stats.hands) * 100) : 0;
  const game = state.blackjack[ctx.userId];

  const fields: UiField[] = [
    {
      name: '🎯 Tes statistiques',
      value: `**Mains :** ${stats.hands}\n**Victoires :** ${stats.wins} · **Défaites :** ${stats.losses}\n**Taux :** ${winRate}%`,
      inline: true,
    },
    {
      name: '💎 Records',
      value: `**Plus gros gain :** ${money(config, stats.biggestWin)}\n**Meilleure série :** ${stats.bestStreak}\n**Blackjacks :** ${stats.blackjacks}`,
      inline: true,
    },
    {
      name: '🃏 La table',
      value: [
        `**Mise :** ${money(config, table.minBet)} → ${money(config, table.maxBet)}`,
        `**Sabot :** ${table.decks} jeu(x), remélange à ${table.shufflePenetrationPercent}%`,
        `**Blackjack :** ${table.blackjackPayout} · assurance ${table.insurancePayout}`,
        `**Options :** ${[
          table.allowDoubleDown ? 'double' : '',
          table.allowSplit ? `split ×${table.maxSplits}` : '',
          table.allowSurrender ? 'abandon' : '',
          table.allowInsurance ? 'assurance' : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'aucune'}`,
      ].join('\n'),
      inline: false,
    },
  ];

  if (game) {
    fields.push({
      name: '🕹️ Ta partie en cours',
      value: `${game.hands.length} main(s) · mise ${money(config, game.baseBet)} · état **${game.status}**`,
      inline: false,
    });
  }

  return {
    section: 'blackjack',
    title: '🃏 Blackjack',
    description: table.enabled
      ? 'Lance une table avec `/blackjack jouer` puis joue avec les boutons.'
      : '⚠️ Le blackjack est désactivé sur ce serveur.',
    fields,
    footer: config.ui.showFooter ? (config.ui.footerText || table.footerText) : undefined,
  };
}

export function shopCard(state: StoreState, config: AppConfig): UiCard {
  const shop = config.shop;
  const items = sortedItems(state).filter((item) => item.enabled);
  const shown = items.slice(0, config.ui.compact ? 5 : 10);

  const fields: UiField[] = shown.map((item) => {
    const price = effectivePrice(item, shop);
    const stock = item.stock < 0 ? 'illimité' : `${item.stock} restant(s)`;
    return {
      name: `${item.emoji} ${item.name} — ${money(config, price.total)}`,
      value: [
        item.description || SHOP_ITEM_TYPE_LABELS[item.type],
        `${SHOP_ITEM_TYPE_LABELS[item.type]} · stock : ${stock}`,
        config.ui.cardShowProgressBar && item.stock > 0 && item.initialStock > 0
          ? progressBar(config.ui, item.stock, item.initialStock)
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      inline: false,
    };
  });

  return {
    section: 'shop',
    title: '🛒 Boutique',
    description: items.length
      ? `${items.length} article(s) disponible(s)${shop.saleEnabled ? ' · **promotion en cours**' : ''}. Achète avec \`/shop acheter\` ou la vitrine.`
      : 'Aucun article en vente pour le moment.',
    fields,
    footer: config.ui.showFooter ? config.ui.footerText : undefined,
  };
}

export function moderationCard(state: StoreState, config: AppConfig, ctx: UiContext): UiCard {
  const moderation = config.moderation;
  const active = state.cases.filter((entry) => entry.active);
  const warns = active.filter((entry) => entry.type === 'warn');
  const recent = state.cases.slice(0, 5);

  const fields: UiField[] = [
    {
      name: '📁 Dossiers',
      value: `**Actifs :** ${active.length}\n**Avertissements :** ${warns.length}\n**Total :** ${state.cases.length}`,
      inline: true,
    },
    {
      name: '🤖 Protections',
      value: [
        `**Auto-modération :** ${moderation.automodEnabled ? `✅ ${moderation.automodAction}` : '❌'}`,
        `**Anti-raid :** ${moderation.raidProtectionEnabled ? `✅ ${moderation.raidJoinThreshold}/${moderation.raidJoinWindowSeconds}s` : '❌'}`,
        `**Rôles protégés :** ${moderation.protectRoleIds.length}`,
      ].join('\n'),
      inline: true,
    },
    {
      name: '⚖️ Barème automatique',
      value: [
        moderation.warnTimeoutEnabled ? `🔇 mute dès ${moderation.warnTimeoutThreshold}` : '',
        moderation.warnKickEnabled ? `👢 kick dès ${moderation.warnKickThreshold}` : '',
        moderation.warnBanEnabled ? `⛔ ban dès ${moderation.warnBanThreshold}` : '',
      ]
        .filter(Boolean)
        .join('\n') || 'Aucune sanction automatique.',
      inline: false,
    },
  ];

  if (recent.length) {
    fields.push({
      name: '🕒 Derniers dossiers',
      value: recent
        .map((entry) => `\`#${entry.number}\` ${entry.type} — <@${entry.userId}> · ${entry.reason.slice(0, 40)}`)
        .join('\n'),
      inline: false,
    });
  }

  return {
    section: 'moderation',
    title: '🛡️ Modération',
    description: ctx.isStaff
      ? 'Avertissements, sanctions et protections du serveur.'
      : 'Section réservée à l’équipe de modération.',
    fields,
    footer: config.ui.showFooter ? config.ui.footerText : undefined,
  };
}

export function communityCard(state: StoreState, config: AppConfig): UiCard {
  const pending = state.confessions.filter((entry) => entry.status === 'pending').length;
  const scheduled = state.announcements.filter((entry) => entry.status === 'scheduled').length;

  const fields: UiField[] = [
    {
      name: '🪄 Communauté',
      value: [
        `**Confessions :** ${config.confessions.enabled ? `${pending} en attente · ${state.confessions.length} au total` : 'désactivées'}`,
        `**Annonces :** ${scheduled} programmée(s) · ${state.announcements.length} au total`,
        `**Embeds :** ${state.embeds.length} modèle(s)`,
        `**Vocaux temporaires :** ${config.joinToCreate.enabled ? `${state.tempRooms.length} actif(s)` : 'désactivés'}`,
      ].join('\n'),
      inline: false,
    },
  ];

  return {
    section: 'community',
    title: '🪄 Communauté',
    description: 'Confessions anonymes, annonces programmées, embeds et salons vocaux temporaires.',
    fields,
    footer: config.ui.showFooter ? config.ui.footerText : undefined,
  };
}

export function infoCard(state: StoreState, config: AppConfig, ctx: UiContext): UiCard {
  const missing = Object.values(state.config.channels).filter((id) => !id).length;
  const fields: UiField[] = [
    {
      name: '🖥️ Serveur',
      value: [
        `**Nom :** ${ctx.guildName}`,
        ctx.memberCount !== undefined ? `**Membres :** ${ctx.memberCount}` : '',
        ctx.channelCount !== undefined ? `**Salons :** ${ctx.channelCount}` : '',
        ctx.roleCount !== undefined ? `**Rôles :** ${ctx.roleCount}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      inline: true,
    },
    {
      name: '✦ Bot',
      value: [
        `**Uptime :** ${shortDuration(process.uptime())}`,
        `**Commandes :** 48`,
        `**Salons non associés :** ${missing}`,
        `**Journal :** ${state.logs.length} entrée(s)`,
      ].join('\n'),
      inline: true,
    },
    {
      name: '⚙️ Modules',
      value: [
        `${config.economy.enabled ? '✅' : '❌'} économie`,
        `${config.blackjack.enabled ? '✅' : '❌'} blackjack`,
        `${config.shop.enabled ? '✅' : '❌'} boutique`,
        `${config.moderation.warnEnabled ? '✅' : '❌'} avertissements`,
        `${config.moderation.automodEnabled ? '✅' : '❌'} auto-modération`,
        `${config.confessions.enabled ? '✅' : '❌'} confessions`,
      ].join('\n'),
      inline: false,
    },
  ];

  return {
    section: 'info',
    title: '📊 Serveur & bot',
    description: ctx.webUrl ? `Panel d'administration : <${ctx.webUrl}>` : 'État du bot et de la configuration.',
    fields,
    footer: config.ui.showFooter ? config.ui.footerText : undefined,
  };
}

/** Carte d'une section, ou celle du menu central. */
export function cardFor(
  id: UiSectionId,
  state: StoreState,
  config: AppConfig,
  ctx: UiContext,
  sections: UiSection[],
): UiCard {
  switch (id) {
    case 'economy':
      return economyCard(state, config, ctx);
    case 'blackjack':
      return blackjackCard(state, config, ctx);
    case 'shop':
      return shopCard(state, config);
    case 'moderation':
      return moderationCard(state, config, ctx);
    case 'community':
      return communityCard(state, config);
    case 'info':
      return infoCard(state, config, ctx);
    default:
      return hubCard(state, config, ctx, sections);
  }
}

// ------------------------------------------------------------
//  Rendu Discord
// ------------------------------------------------------------

export function cardEmbed(config: UiConfig, card: UiCard): EmbedBuilder {
  const section = sectionById(card.section);
  const embed = new EmbedBuilder()
    .setColor(section ? sectionColor(config, section) : accentColor(config))
    .setAuthor({ name: `${config.accentEmoji} ${config.brandName}` })
    .setTitle(card.title)
    .setDescription(card.description.slice(0, 4000));

  for (const field of card.fields.slice(0, 25)) {
    embed.addFields({
      name: field.name.slice(0, 256),
      value: field.value.slice(0, 1024) || '—',
      inline: field.inline ?? false,
    });
  }

  if (card.thumbnail) embed.setThumbnail(card.thumbnail);
  if (config.showFooter && card.footer) embed.setFooter({ text: card.footer.slice(0, 2048) });
  if (config.showTimestamp) embed.setTimestamp();
  return embed;
}

export interface UiComponents {
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
}

/** Boutons de navigation (une ligne, limitée par cardMaxButtons). */
export function navButtons(
  config: UiConfig,
  sections: UiSection[],
  active: UiSectionId,
  mode: 'nav' | 'go' = 'nav',
): ActionRowBuilder<ButtonBuilder>[] {
  if (!config.hubUseButtons) return [];
  const perRow = Math.max(1, Math.min(5, config.cardMaxButtons));
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const buttons = sections.map(
    (section) =>
      new ButtonBuilder()
        .setCustomId(`ui:${mode}:${section.id}`)
        .setLabel(section.label.slice(0, 80))
        .setEmoji(section.emoji)
        .setStyle(section.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  if (active !== 'hub') {
    buttons.unshift(
      new ButtonBuilder().setCustomId('ui:nav:hub').setLabel('Menu').setEmoji('🏠').setStyle(ButtonStyle.Primary),
    );
  }

  for (let index = 0; index < buttons.length; index += perRow) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(index, index + perRow)));
  }
  return rows.slice(0, 5);
}

/** Menu déroulant de navigation. */
export function navSelect(
  config: UiConfig,
  sections: UiSection[],
  active: UiSectionId,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  if (!config.hubUseSelectMenu || sections.length === 0) return [];
  const select = new StringSelectMenuBuilder()
    .setCustomId('ui:select')
    .setPlaceholder('Aller à une section…')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Menu central')
        .setValue('hub')
        .setEmoji('🏠')
        .setDefault(active === 'hub'),
      ...sections.map((section) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(section.label.slice(0, 100))
          .setDescription(section.description.slice(0, 100))
          .setValue(section.id)
          .setEmoji(section.emoji)
          .setDefault(section.id === active),
      ),
    );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
}

export interface UiView {
  embeds: EmbedBuilder[];
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
}

/** Vue complète (embed + navigation) d'une section ou du menu central. */
export function uiView(
  id: UiSectionId,
  state: StoreState,
  config: AppConfig,
  ctx: UiContext,
): UiView {
  const features = featureFlags(config);
  const sections = visibleSections(config.ui, features, ctx.isStaff);
  const resolved = sectionById(id) ? id : 'hub';
  const card = cardFor(resolved, state, config, ctx, sections);

  return {
    embeds: [cardEmbed(config.ui, card)],
    components: [...navSelect(config.ui, sections, resolved), ...navButtons(config.ui, sections, resolved)],
  };
}

/** Raccourcis de commandes d'une section (ligne de texte). */
export function shortcutsLine(config: UiConfig, section: UiSection): string {
  if (!config.cardShowHints || !section.shortcuts.length) return '';
  return section.shortcuts.map((shortcut) => `\`${shortcut}\``).join(' · ');
}
