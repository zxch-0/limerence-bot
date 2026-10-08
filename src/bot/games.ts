import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  type Message,
  type StringSelectMenuInteraction,
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
import { ACHIEVEMENTS } from '../lib/economy/extras';
import {
  MINES_GRID_SIZE,
  dropPlinko,
  flipCoin,
  rollDice,
  spinRoulette,
  spinSlots,
  type DiceBet,
  type PlinkoRisk,
  type RouletteBet,
} from '../lib/games/engine';
import {
  cashoutCrash,
  cashoutMines,
  crashCrashed,
  crashExplode,
  crashMultiplierNow,
  enabledGames,
  getSession,
  playInstantGame,
  playMinesTile,
  startCrash,
  startMines,
  type OutcomeInfo,
} from '../lib/games/table';
import { announceEconomyEvent } from './rewards';
import { accentColor, progressBar } from './ui';
import type {
  AppConfig,
  CrashSession,
  EconomyAccount,
  EconomyConfig,
  GamesConfig,
  MinesSession,
  QuestDef,
} from '../lib/types';

// ============================================================
//  Casino — couche Discord
//
//  Jeux instantanés (roulette, pile ou face, dés, slots, plinko)
//  avec une courte animation, et jeux interactifs par boutons
//  (mines : grille de tuiles, crash : fusée qui grimpe).
// ============================================================

const CASINO_COLOR = 0xffd166;
const CASINO_COLOR_LOSE = 0xff8fa3;
const CASINO_COLOR_WIN = 0x9ff0dc;

/** Éphémère sur un serveur, réponse normale en MP. */
function ephemOf(interaction: Interaction) {
  return replyFlags(interaction);
}

// ------------------------------------------------------------
//  Progression (niveau, succès, quêtes) : lignes + annonces
// ------------------------------------------------------------

export function progressLines(info: OutcomeInfo | undefined, economy: EconomyConfig): string[] {
  if (!info) return [];
  const lines: string[] = [];
  if (info.levelUp) {
    lines.push(`📈 Niveau supérieur ! **${info.levelUp.from} → ${info.levelUp.to}**`);
  }
  for (const id of info.achievements ?? []) {
    const def = ACHIEVEMENTS.find((entry) => entry.id === id);
    lines.push(`🏅 Succès débloqué : **${def?.emoji ?? '🏅'} ${def?.label ?? id}**`);
  }
  for (const quest of info.questsCompleted ?? []) {
    lines.push(`🎯 Quête terminée : **${quest.emoji} ${quest.label}** (+${formatMoney(economy, quest.reward)})`);
  }
  return lines;
}

/** Annonce les montées de niveau et les très gros gains dans le salon économie. */
export async function announceProgression(
  guildId: string,
  userId: string,
  info: OutcomeInfo | undefined,
  economy: EconomyConfig,
  extra?: { gameLabel?: string; net?: number; bet?: number },
): Promise<void> {
  const guild = await guildFromId(guildId);
  if (!guild) return;
  if (info?.levelUp && economy.levelUpAnnounce) {
    await announceEconomyEvent(
      guild,
      `📈 <@${userId}> passe niveau **${info.levelUp.to}** ! (bonus de gains : +${Math.min(economy.levelBonusMaxPercent, (info.levelUp.to - 1) * economy.levelBonusPercent)} %)`,
    );
  }
  if (extra?.gameLabel && extra.net && extra.bet && extra.net >= extra.bet * 10) {
    await announceEconomyEvent(
      guild,
      `🎰 <@${userId}> vient de remporter **${formatMoney(economy, extra.net)}** au ${extra.gameLabel} !`,
    );
  }
}

async function guildFromId(guildId: string) {
  const { getReadyClient } = await import('../lib/discord/client');
  const client = getReadyClient();
  if (!client) return null;
  return client.guilds.fetch(guildId).catch(() => null);
}

// ------------------------------------------------------------
//  Embeds de résultat
// ------------------------------------------------------------

function resultEmbed(
  user: User,
  title: string,
  description: string,
  economy: EconomyConfig,
  account: EconomyAccount,
  options: { color?: number; fields?: { name: string; value: string; inline?: boolean }[]; info?: OutcomeInfo } = {},
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(options.color ?? CASINO_COLOR)
    .setAuthor({ name: `${user.displayName ?? user.username} — casino`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(title)
    .setDescription(description.slice(0, 4000))
    .addFields(
      { name: '💵 Poche', value: shortMoney(economy, account.cash), inline: true },
      { name: '🏦 Banque', value: shortMoney(economy, account.bank), inline: true },
      { name: '💎 Total', value: shortMoney(economy, totalBalance(account)), inline: true },
      ...(options.fields ?? []),
    )
    .setFooter({ text: `Niveau ${account.level} · ${account.xp} XP` })
    .setTimestamp();
  const lines = progressLines(options.info, economy);
  if (lines.length) embed.addFields({ name: '✨ Progression', value: lines.join('\n').slice(0, 1024), inline: false });
  return embed;
}

// ------------------------------------------------------------
//  Jeux instantanés
// ------------------------------------------------------------

const SPIN_DELAY_MS = 1100;

async function playInstant(
  interaction: ChatInputCommandInteraction,
  input: { bet: number; gameLabel: string; games: GamesConfig; economy: EconomyConfig; pending: string },
  resolve: () => { multiplier: number; label: string },
): Promise<void> {
  await interaction.deferReply(ephemOf(interaction));
  await interaction.editReply({ content: input.pending });

  const userId = interaction.user.id;
  const guildId = interaction.guildId ?? '';

  await new Promise((resolvePromise) => setTimeout(resolvePromise, SPIN_DELAY_MS));

  const result = await updateState((s) => {
    const account = ensureAccount(s, userId);
    pruneExpiredItems(account);
    return playInstantGame(s, account, {
      userId,
      bet: input.bet,
      games: input.games,
      economy: input.economy,
      gameLabel: input.gameLabel,
    }, resolve);
  });

  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error ?? 'Partie impossible.'}` });
    return;
  }

  const won = result.net > 0;
  const push = result.net === 0;
  const title = won ? `🎉 ${input.gameLabel} — tu gagnes !` : push ? `🤝 ${input.gameLabel} — égalité` : `💸 ${input.gameLabel} — perdu`;
  const description = [
    result.resultLabel,
    '',
    `**Mise :** ${formatMoney(input.economy, input.bet)}`,
    `**Multiplicateur :** ×${result.multiplier}`,
    won
      ? `🎉 **Tu gagnes ${formatMoney(input.economy, result.net)}**${result.tax > 0 ? ` (taxe ${formatMoney(input.economy, result.tax)})` : ''}`
      : push
        ? '🤝 Ta mise t’est rendue.'
        : `😔 **Tu perds ${formatMoney(input.economy, -result.net)}**`,
  ].join('\n');

  const fresh = await getState();
  const account = fresh.accounts[userId] ?? ensureAccount(fresh, userId);
  await interaction.editReply({
    content: '',
    embeds: [
      resultEmbed(interaction.user, title, description, input.economy, account, {
        color: won ? CASINO_COLOR_WIN : push ? CASINO_COLOR : CASINO_COLOR_LOSE,
        info: result.info,
      }),
    ],
  });

  await announceProgression(guildId, userId, result.info, input.economy, {
    gameLabel: input.gameLabel,
    net: result.net,
    bet: input.bet,
  });
  await addLog({
    level: 'economy',
    source: `membre:${userId}`,
    action: `${input.gameLabel}`,
    detail: `mise ${input.bet} → net ${result.net}`,
  });
}

// ------------------------------------------------------------
//  Commande /casino — menu des jeux
// ------------------------------------------------------------

export function casinoEmbed(config: AppConfig): EmbedBuilder {
  const games = config.games;
  const economy = config.economy;
  const list = enabledGames(games);
  const lines = list.map((game) => `${game.emoji} **${game.label}** — paiements ${game.minPayout}`);
  if (!lines.length) lines.push('Aucun jeu n’est activé pour le moment.');

  const embed = new EmbedBuilder()
    .setColor(games.enabled ? CASINO_COLOR : 0x6b7280)
    .setAuthor({ name: `${config.ui.accentEmoji} ${config.ui.brandName} — Casino` })
    .setTitle('🎰 Casino Limerence')
    .setDescription(
      [
        ...lines,
        '',
        `Mise minimum : **${formatMoney(economy, Math.max(1, economy.betMin))}**${economy.betMax > 0 ? ` · maximum : **${formatMoney(economy, economy.betMax)}**` : ''}`,
        `Taxe sur les gains : **${economy.gamblingTaxPercent} %**`,
        'Lance un jeu avec sa commande : `/roulette`, `/coinflip`, `/dice`, `/slots`, `/mines`, `/crash`, `/plinko`.',
        'Le blackjack reste disponible avec `/blackjack jouer`.',
      ].join('\n').slice(0, 4000),
    )
    .setFooter({ text: 'Joue responsable — les mises sont débitées avant le résultat.' });
  return embed;
}

export function casinoComponents(config: AppConfig) {
  const list = enabledGames(config.games);
  if (!list.length) return [];
  const select = new StringSelectMenuBuilder()
    .setCustomId('casino:select')
    .setPlaceholder('Voir les règles d’un jeu…')
    .addOptions(
      list.map((game) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(game.label)
          .setValue(game.id)
          .setEmoji(game.emoji)
          .setDescription('Afficher les règles et la commande'.slice(0, 100)),
      ),
    );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
}

export async function handleCasinoCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const state = await getState();
  const config = state.config;
  if (!config.games.enabled || !config.economy.gamblingEnabled) {
    await interaction.reply({ content: '🎰 Le casino est désactivé sur ce serveur.', ...ephemOf(interaction) });
    return true;
  }
  await interaction.reply({
    embeds: [casinoEmbed(config)],
    components: casinoComponents(config),
    ...ephemOf(interaction),
  });
  return true;
}

function gameRules(id: string, games: GamesConfig, economy: EconomyConfig): string {
  const min = formatMoney(economy, Math.max(1, economy.betMin));
  switch (id) {
    case 'roulette':
      return [
        '🎡 **Roulette européenne** (0-36)',
        `• Numéro plein (0-36) : ×${games.rouletteStraightPayout}`,
        `• Rouge / Noir / Vert : ×${games.rouletteColorPayout}`,
        `• Pair / Impair : ×${games.rouletteEvenPayout}`,
        `• Douzaine (1-12, 13-24, 25-36) : ×${games.rouletteDozenPayout}`,
        `Commande : \`/roulette mise:${Math.max(1, economy.betMin)} pari:rouge\` ou \`pari:7\` avec \`numero:7\``,
      ].join('\n');
    case 'coinflip':
      return [
        '🪙 **Pile ou face**',
        `• Deviner pile ou face : ×${games.coinflipPayout}`,
        'Commande : `/coinflip mise:100 cote:pile`',
      ].join('\n');
    case 'dice':
      return [
        '🎲 **Dés**',
        `• Numéro exact (1-6) : ×${games.diceExactPayout}`,
        `• Pair / Impair / 1-3 / 4-6 : ×${games.diceRangePayout}`,
        'Commande : `/dice mise:100 pari:exact numero:4` ou `/dice mise:100 pari:pair`',
      ].join('\n');
    case 'slots':
      return [
        '🎰 **Machine à sous**',
        `• 2 symboles identiques : ×${games.slotsTwoMultiplier}`,
        `• 3 symboles identiques : ×${games.slotsThreeMultiplier}`,
        `• 3 × ${games.slotsJackpotSymbol} (jackpot) : ×${games.slotsJackpotMultiplier}`,
        'Commande : `/slots mise:100`',
      ].join('\n');
    case 'mines':
      return [
        '💣 **Mines (démineur)**',
        `• Grille de ${MINES_GRID_SIZE} tuiles, ${games.minesMaxMines} mines maximum`,
        '• Chaque tuile sûre révélée augmente le multiplicateur',
        `• Encaisse à tout moment avec le bouton 💰 (avantage maison : ${games.minesHouseEdgePercent} %)`,
        `• Toucher une mine = mise perdue · temps de réflexion : ${games.minesTimeoutSeconds} s`,
        `Commande : \`/mines mise:${Math.max(1, economy.betMin)} bombes:3\``,
      ].join('\n');
    case 'crash':
      return [
        '🚀 **Crash**',
        '• Une fusée décolle : le multiplicateur grimpe sans s’arrêter',
        '• Encaisse avant l’explosion avec le bouton 💰',
        `• Multiplicateur maximum : ×${games.crashMaxMultiplier}`,
        `Commande : \`/crash mise:${Math.max(1, economy.betMin)}\``,
      ].join('\n');
    case 'plinko':
      return [
        '🪂 **Plinko**',
        '• Lâche une bille à travers 12 rangées de piquets',
        '• Risque faible : ×0.3 → ×6 · moyen : ×0.2 → ×27 · élevé : ×0 → ×200 (retour moyen ≈ 97 %)',
        `Commande : \`/plinko mise:${Math.max(1, economy.betMin)} risque:moyen\``,
      ].join('\n');
    default:
      return `Règles indisponibles (mise min : ${min}).`;
  }
}

export async function handleCasinoSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (interaction.customId !== 'casino:select') return false;
  const state = await getState();
  const game = enabledGames(state.config.games).find((entry) => entry.id === interaction.values[0]);
  if (!game) {
    await interaction.reply({ content: 'Jeu inconnu.', ...ephemOf(interaction) });
    return true;
  }
  await interaction.reply({
    content: gameRules(game.id, state.config.games, state.config.economy).slice(0, 1900),
    ...ephemOf(interaction),
  });
  return true;
}

// ------------------------------------------------------------
//  /roulette · /coinflip · /dice · /slots · /plinko
// ------------------------------------------------------------

export async function handleGamesCommand(
  interaction: ChatInputCommandInteraction,
  commandName: string,
): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'Le casino se joue sur un serveur.', ...ephemOf(interaction) });
    return true;
  }
  const state = await getState();
  const config = state.config;
  const games = config.games;
  const economy = config.economy;

  if (games.allowedChannels.length && !games.allowedChannels.includes(interaction.channelId)) {
    await interaction.reply({
      content: `🎰 Les jeux sont réservés à ces salons : ${games.allowedChannels.map((id) => `<#${id}>`).join(' ')}`,
      ...ephemOf(interaction),
    });
    return true;
  }

  const bet = interaction.options.getInteger('mise', true);
  const member = (interaction.member as GuildMember | null) ?? null;
  void member;

  switch (commandName) {
    case 'roulette': {
      if (!games.rouletteEnabled) return replyDisabled(interaction, 'La roulette');
      const pari = interaction.options.getString('pari');
      const numero = interaction.options.getInteger('numero');
      let betObj: RouletteBet;
      if (numero !== null) {
        if (numero < 0 || numero > 36) {
          await interaction.reply({ content: 'Numéro entre 0 et 36.', ...ephemOf(interaction) });
          return true;
        }
        betObj = { kind: 'straight', number: numero };
      } else if (pari) {
        const map: Record<string, RouletteBet> = {
          rouge: { kind: 'color', color: 'rouge' },
          noir: { kind: 'color', color: 'noir' },
          vert: { kind: 'color', color: 'vert' },
          pair: { kind: 'parity', parity: 'pair' },
          impair: { kind: 'parity', parity: 'impair' },
          '1-12': { kind: 'dozen', dozen: 1 },
          '13-24': { kind: 'dozen', dozen: 2 },
          '25-36': { kind: 'dozen', dozen: 3 },
        };
        const resolved = map[pari];
        if (!resolved) {
          await interaction.reply({ content: 'Pari invalide.', ...ephemOf(interaction) });
          return true;
        }
        betObj = resolved;
      } else {
        await interaction.reply({ content: 'Indique un `pari` ou un `numero`.', ...ephemOf(interaction) });
        return true;
      }
      await playInstant(
        interaction,
        { bet, gameLabel: 'roulette', games, economy, pending: '🎡 La roue tourne…' },
        () => {
          const result = spinRoulette(betObj, games);
          return { multiplier: result.multiplier, label: `${result.label}${result.win ? ` — ×${result.multiplier}` : ''}` };
        },
      );
      return true;
    }

    case 'coinflip': {
      if (!games.coinflipEnabled) return replyDisabled(interaction, 'Le pile ou face');
      const cote = interaction.options.getString('cote', true) as 'pile' | 'face';
      await playInstant(
        interaction,
        { bet, gameLabel: 'pile ou face', games, economy, pending: '🪙 La pièce tourne…' },
        () => {
          const result = flipCoin(cote, games);
          return {
            multiplier: result.multiplier,
            label: `🪙 La pièce retombe sur **${result.side}**${result.win ? ` — ×${result.multiplier}` : ' — perdu'}`,
          };
        },
      );
      return true;
    }

    case 'dice': {
      if (!games.diceEnabled) return replyDisabled(interaction, 'Les dés');
      const pari = interaction.options.getString('pari', true);
      const numero = interaction.options.getInteger('numero');
      let betObj: DiceBet;
      if (pari === 'exact') {
        if (numero === null || numero < 1 || numero > 6) {
          await interaction.reply({ content: 'Numéro entre 1 et 6 pour un pari exact.', ...ephemOf(interaction) });
          return true;
        }
        betObj = { kind: 'exact', number: numero };
      } else if (pari === 'pair' || pari === 'impair') {
        betObj = { kind: 'parity', parity: pari };
      } else if (pari === 'bas' || pari === 'haut') {
        betObj = { kind: 'range', range: pari };
      } else {
        await interaction.reply({ content: 'Pari invalide.', ...ephemOf(interaction) });
        return true;
      }
      await playInstant(
        interaction,
        { bet, gameLabel: 'dés', games, economy, pending: '🎲 Le dé roule…' },
        () => {
          const result = rollDice(betObj, games);
          return { multiplier: result.multiplier, label: `${result.label}${result.win ? ` — ×${result.multiplier}` : ''}` };
        },
      );
      return true;
    }

    case 'slots': {
      if (!games.slotsEnabled) return replyDisabled(interaction, 'La machine à sous');
      await playInstant(
        interaction,
        { bet, gameLabel: 'machine à sous', games, economy, pending: '🎰 Les rouleaux tournent…' },
        () => {
          const result = spinSlots(games);
          return { multiplier: result.multiplier, label: result.label };
        },
      );
      return true;
    }

    case 'plinko': {
      if (!games.plinkoEnabled) return replyDisabled(interaction, 'Le plinko');
      const risque = (interaction.options.getString('risque', true) ?? 'moyen') as PlinkoRisk;
      await playInstant(
        interaction,
        { bet, gameLabel: 'plinko', games, economy, pending: '🪂 La bille tombe…' },
        () => {
          const result = dropPlinko(risque, Math.random);
          return { multiplier: result.multiplier, label: `${result.label}${result.win ? '' : ' — perdu'}` };
        },
      );
      return true;
    }

    default:
      return false;
  }
}

async function replyDisabled(interaction: ChatInputCommandInteraction, label: string): Promise<boolean> {
  await interaction.reply({ content: `❌ ${label} est désactivé sur ce serveur.`, ...ephemOf(interaction) });
  return true;
}

// ------------------------------------------------------------
//  /mines — grille de tuiles interactive
// ------------------------------------------------------------

function minesGridText(session: MinesSession): string {
  const rows: string[] = [];
  for (let row = 0; row < 5; row += 1) {
    const cells: string[] = [];
    for (let col = 0; col < 5; col += 1) {
      const index = row * 5 + col;
      if (index >= MINES_GRID_SIZE) {
        if (row === 4 && col === 4) cells.push('💰');
        continue;
      }
      if (session.revealed.includes(index)) {
        cells.push(session.grid[index] ? '💥' : '🟢');
      } else if (session.finished) {
        cells.push(session.grid[index] ? '💥' : '⬜');
      } else {
        cells.push('⬛');
      }
    }
    rows.push(cells.join(''));
  }
  return rows.join('\n');
}

export function minesEmbed(
  session: MinesSession,
  games: GamesConfig,
  economy: EconomyConfig,
  user: User,
  options: { note?: string; info?: OutcomeInfo } = {},
): EmbedBuilder {
  const revealedSafe = session.revealed.filter((index) => !session.grid[index]).length;
  const multiplier =
    revealedSafe > 0
      ? Math.round(
          (() => {
            let m = 1;
            for (let i = 0; i < revealedSafe; i += 1) {
              m *= (MINES_GRID_SIZE - session.mines - i) / (MINES_GRID_SIZE - i);
            }
            return m * (1 - Math.min(0.5, Math.max(0, games.minesHouseEdgePercent) / 100));
          })() * 100,
        ) / 100
      : 1;
  const potential = Math.round(session.bet * multiplier);

  const description = [
    minesGridText(session),
    '',
    `💣 **${session.mines}** mine(s) cachée(s) dans ${MINES_GRID_SIZE} tuiles`,
    `✨ Multiplicateur actuel : **×${multiplier}** → gain potentiel **${formatMoney(economy, potential)}**`,
    session.finished
      ? session.cashedOut
        ? `💰 Encaissé : **${formatMoney(economy, potential)}**`
        : '💥 Explosion ! La mise est perdue.'
      : 'Révèle une tuile sûre ou encaisse avec 💰. Une mine = tout perdu.',
    options.note ? `\n${options.note}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(session.finished ? (session.cashedOut ? CASINO_COLOR_WIN : CASINO_COLOR_LOSE) : CASINO_COLOR)
    .setAuthor({ name: `${user.displayName ?? user.username} — mines`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(`💣 Mines — mise ${formatMoney(economy, session.bet)}`)
    .setDescription(description.slice(0, 4000))
    .setFooter({ text: `Temps restant : ${Math.max(0, Math.round((session.timeoutAt - Date.now()) / 1000))} s` });
  const lines = progressLines(options.info, economy);
  if (lines.length) embed.addFields({ name: '✨ Progression', value: lines.join('\n').slice(0, 1024) });
  return embed;
}

export function minesComponents(session: MinesSession, games: GamesConfig): ActionRowBuilder<ButtonBuilder>[] {
  if (session.finished) return [];
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let row = 0; row < 5; row += 1) {
    const builder = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < 5; col += 1) {
      const index = row * 5 + col;
      if (index >= MINES_GRID_SIZE) {
        if (row === 4 && col === 4) {
          const revealedSafe = session.revealed.filter((i) => !session.grid[i]).length;
          builder.addComponents(
            new ButtonBuilder()
              .setCustomId('game:mines:cashout')
              .setLabel(revealedSafe > 0 ? 'Encaisser' : 'Bloqué')
              .setEmoji('💰')
              .setStyle(ButtonStyle.Success)
              .setDisabled(revealedSafe === 0),
          );
        }
        continue;
      }
      const revealed = session.revealed.includes(index);
      builder.addComponents(
        new ButtonBuilder()
          .setCustomId(`game:mines:${index}`)
          .setEmoji(revealed ? (session.grid[index] ? '💥' : '💎') : '⬛')
          .setStyle(revealed ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(revealed),
      );
    }
    rows.push(builder);
  }
  void games;
  return rows;
}

// ------------------------------------------------------------
//  /crash — fusée interactive
// ------------------------------------------------------------

const crashTimers = new Map<string, NodeJS.Timeout>();

export function crashEmbed(
  session: CrashSession,
  games: GamesConfig,
  economy: EconomyConfig,
  user: User,
  options: { crashed?: boolean; info?: OutcomeInfo; multiplier?: number } = {},
): EmbedBuilder {
  const multiplier = options.multiplier ?? crashMultiplierNow(session, games);
  const crashed = options.crashed ?? crashCrashed(session, games);
  const potential = Math.round(session.bet * multiplier);
  const embed = new EmbedBuilder()
    .setColor(crashed ? CASINO_COLOR_LOSE : CASINO_COLOR)
    .setAuthor({ name: `${user.displayName ?? user.username} — crash`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setTitle(crashed ? '💥 Crash — la fusée explose !' : '🚀 Crash — la fusée décolle !')
    .setDescription(
      [
        crashed ? `💥 **×${session.crashAt}** — la fusée explose, la mise est perdue.` : `🚀 **×${multiplier}** et ça grimpe…`,
        '',
        `**Mise :** ${formatMoney(economy, session.bet)}`,
        crashed ? '' : `💰 Encaisse maintenant : **${formatMoney(economy, potential)}**`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setFooter({ text: crashed ? 'Relance avec /crash' : 'Clique sur 💰 pour encaisser avant le crash !' });
  const lines = progressLines(options.info, economy);
  if (lines.length) embed.addFields({ name: '✨ Progression', value: lines.join('\n').slice(0, 1024) });
  return embed;
}

export function crashComponents(session: CrashSession, games: GamesConfig): ActionRowBuilder<ButtonBuilder>[] {
  if (session.finished) return [];
  const multiplier = crashMultiplierNow(session, games);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('game:crash:cashout')
        .setLabel(`Encaisser ×${multiplier}`)
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

/** Met à jour le message de crash toutes les `crashTickMs` jusqu’à l’explosion. */
function startCrashTicker(
  interaction: ChatInputCommandInteraction,
  message: Message,
  userId: string,
  tickMs: number,
): void {
  stopCrashTicker(userId);
  const timer = setInterval(() => {
    void (async () => {
      const state = await getState();
      const session = getSession(state, userId);
      if (!session || session.kind !== 'crash' || session.finished) {
        stopCrashTicker(userId);
        return;
      }
      const games = state.config.games;
      if (crashCrashed(session, games)) {
        stopCrashTicker(userId);
        const result = await updateState((s) => {
          const account = ensureAccount(s, userId);
          return crashExplode(s, account, userId, s.config.games, s.config.economy);
        });
        await message
          .edit({
            embeds: [
              crashEmbed(session, games, state.config.economy, interaction.user, {
                crashed: true,
                multiplier: session.crashAt,
                info: result.ok ? result.info : undefined,
              }),
            ],
            components: [],
          })
          .catch(() => undefined);
        await announceProgression(interaction.guildId ?? '', userId, result.ok ? result.info : undefined, state.config.economy, {
          gameLabel: 'crash',
          net: result.ok ? result.net : 0,
          bet: session.bet,
        });
        return;
      }
      const multiplier = crashMultiplierNow(session, games);
      await message
        .edit({ embeds: [crashEmbed(session, games, state.config.economy, interaction.user, { multiplier })], components: crashComponents(session, games) })
        .catch(() => undefined);
    })().catch(() => undefined);
  }, Math.max(300, tickMs));
  crashTimers.set(userId, timer);
}

function stopCrashTicker(userId: string): void {
  const timer = crashTimers.get(userId);
  if (timer) {
    clearInterval(timer);
    crashTimers.delete(userId);
  }
}

export function stopAllCrashTickers(): void {
  for (const userId of Array.from(crashTimers.keys())) stopCrashTicker(userId);
}

// ------------------------------------------------------------
//  Entrées /mines et /crash
// ------------------------------------------------------------

async function handleMinesStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const games = (await getState()).config.games;
  if (!games.minesEnabled) {
    await interaction.reply({ content: '❌ Le démineur est désactivé.', ...ephemOf(interaction) });
    return;
  }
  const bet = interaction.options.getInteger('mise', true);
  const bombes = interaction.options.getInteger('bombes', true);
  if (bombes < 1 || bombes > games.minesMaxMines) {
    await interaction.reply({ content: `Le nombre de mines doit être entre 1 et ${games.minesMaxMines}.`, ...ephemOf(interaction) });
    return;
  }
  const userId = interaction.user.id;
  const started = await updateState((s) => {
    const account = ensureAccount(s, userId);
    pruneExpiredItems(account);
    return startMines(s, account, {
      userId,
      guildId: interaction.guildId ?? '',
      channelId: interaction.channelId,
      bet,
      mines: bombes,
      games: s.config.games,
      economy: s.config.economy,
    });
  });
  if (!started.ok || !started.session) {
    await interaction.reply({ content: `❌ ${started.error ?? 'Partie impossible.'}`, ...ephemOf(interaction) });
    return;
  }
  await interaction.reply({
    embeds: [minesEmbed(started.session, games, (await getState()).config.economy, interaction.user)],
    components: minesComponents(started.session, games),
    ...ephemOf(interaction),
  });
}

async function handleCrashStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const state = await getState();
  const games = state.config.games;
  if (!games.crashEnabled) {
    await interaction.reply({ content: '❌ Le crash est désactivé.', ...ephemOf(interaction) });
    return;
  }
  const bet = interaction.options.getInteger('mise', true);
  const userId = interaction.user.id;
  const started = await updateState((s) => {
    const account = ensureAccount(s, userId);
    pruneExpiredItems(account);
    return startCrash(s, account, {
      userId,
      guildId: interaction.guildId ?? '',
      channelId: interaction.channelId,
      bet,
      games: s.config.games,
      economy: s.config.economy,
    });
  });
  if (!started.ok || !started.session) {
    await interaction.reply({ content: `❌ ${started.error ?? 'Partie impossible.'}`, ...ephemOf(interaction) });
    return;
  }
  await interaction.reply({
    embeds: [crashEmbed(started.session, games, state.config.economy, interaction.user)],
    components: crashComponents(started.session, games),
    ...ephemOf(interaction),
  });
  const message = await interaction.fetchReply().catch(() => null);
  if (message) startCrashTicker(interaction, message, userId, games.crashTickMs);
}

// ------------------------------------------------------------
//  Boutons (mines + crash)
// ------------------------------------------------------------

export async function handleGameButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('game:')) return false;
  if (!interaction.inGuild()) return false;
  const [, kind, action] = interaction.customId.split(':');
  const userId = interaction.user.id;
  const state = await getState();
  const economy = state.config.economy;
  const games = state.config.games;

  if (kind === 'mines') {
    const session = getSession(state, userId);
    if (!session || session.kind !== 'mines') {
      await interaction.reply({ content: 'Tu n’as aucune partie de mines en cours. Lance `/mines`.', ...ephemOf(interaction) });
      return true;
    }
    if (session.finished) {
      await interaction.reply({ content: 'Cette partie est terminée.', ...ephemOf(interaction) });
      return true;
    }

    if (action === 'cashout') {
      const result = await updateState((s) => {
        const account = ensureAccount(s, userId);
        return cashoutMines(s, account, userId, s.config.games, s.config.economy);
      });
      if (!result.ok) {
        await interaction.reply({ content: `❌ ${result.error ?? 'Encaissement impossible.'}`, ...ephemOf(interaction) });
        return true;
      }
      await interaction.update({
        embeds: [
          minesEmbed(
            { ...session, finished: true, cashedOut: true },
            games,
            economy,
            interaction.user,
            {
              note: `💰 Tu encaisses **${formatMoney(economy, result.payout)}** (×${result.multiplier}) — gain net **${formatMoney(economy, result.net)}**.`,
              info: result.info,
            },
          ),
        ],
        components: [],
      });
      await announceProgression(interaction.guildId ?? '', userId, result.info, economy, {
        gameLabel: 'mines',
        net: result.net,
        bet: session.bet,
      });
      return true;
    }

    const index = Number(action);
    if (!Number.isInteger(index) || index < 0 || index >= MINES_GRID_SIZE) return false;
    const result = await updateState((s) => {
      const account = ensureAccount(s, userId);
      return playMinesTile(s, account, userId, index, s.config.games, s.config.economy);
    });
    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.error ?? 'Action impossible.'}`, ...ephemOf(interaction) });
      return true;
    }
    const updated = getSession(await getState(), userId) as MinesSession | null;
    if (result.busted) {
      await interaction.update({
        embeds: [
          minesEmbed({ ...session, revealed: [...session.revealed, index], finished: true }, games, economy, interaction.user, {
            info: result.info,
          }),
        ],
        components: [],
      });
      await announceProgression(interaction.guildId ?? '', userId, result.info, economy, {
        gameLabel: 'mines',
        net: result.net,
        bet: session.bet,
      });
      return true;
    }
    if (result.won || !updated) {
      await interaction.update({
        embeds: [
          minesEmbed({ ...session, revealed: [...session.revealed, index], finished: true, cashedOut: true }, games, economy, interaction.user, {
            info: result.info,
            note: `🎉 Toutes les tuiles sûres ! Tu encaisses **${formatMoney(economy, result.payout)}**.`,
          }),
        ],
        components: [],
      });
      await announceProgression(interaction.guildId ?? '', userId, result.info, economy, {
        gameLabel: 'mines',
        net: result.net,
        bet: session.bet,
      });
      return true;
    }
    await interaction.update({
      embeds: [minesEmbed(updated, games, economy, interaction.user)],
      components: minesComponents(updated, games),
    });
    return true;
  }

  if (kind === 'crash' && action === 'cashout') {
    stopCrashTicker(userId);
    const session = getSession(state, userId);
    if (!session || session.kind !== 'crash') {
      await interaction.reply({ content: 'Tu n’as aucune partie de crash en cours.', ...ephemOf(interaction) });
      return true;
    }
    const result = await updateState((s) => {
      const account = ensureAccount(s, userId);
      return cashoutCrash(s, account, userId, s.config.games, s.config.economy);
    });
    if (!result.ok) {
      await interaction.reply({ content: `❌ ${result.error ?? 'Encaissement impossible.'}`, ...ephemOf(interaction) });
      return true;
    }
    await interaction.update({
      embeds: [
        crashEmbed(session, games, economy, interaction.user, {
          info: result.info,
          multiplier: result.multiplier,
        }),
      ],
      components: [],
    });
    const embed = new EmbedBuilder()
      .setColor(CASINO_COLOR_WIN)
      .setTitle('🚀 Crash — encaissé !')
      .setDescription(
        result.crashed
          ? `💥 Trop tard : la fusée a explosé à **×${result.multiplier}** — mise perdue.`
          : `💰 Tu encaisses **×${result.multiplier}** → **${formatMoney(economy, result.payout)}** (net ${formatMoney(economy, result.net)}).`,
      );
    await interaction.followUp({ embeds: [embed], ...ephemOf(interaction) }).catch(() => undefined);
    await announceProgression(interaction.guildId ?? '', userId, result.info, economy, {
      gameLabel: 'crash',
      net: result.net,
      bet: session.bet,
    });
    return true;
  }

  return false;
}

// ------------------------------------------------------------
//  Entrées mines / crash (appelées par le dispatcher)
// ------------------------------------------------------------

export async function handleMinesCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Le casino se joue sur un serveur.', ...ephemOf(interaction) });
    return true;
  }
  const games = (await getState()).config.games;
  if (games.allowedChannels.length && !games.allowedChannels.includes(interaction.channelId)) {
    await interaction.reply({
      content: `🎰 Les jeux sont réservés à ces salons : ${games.allowedChannels.map((id) => `<#${id}>`).join(' ')}`,
      ...ephemOf(interaction),
    });
    return true;
  }
  await handleMinesStart(interaction);
  return true;
}

export async function handleCrashCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Le casino se joue sur un serveur.', ...ephemOf(interaction) });
    return true;
  }
  const games = (await getState()).config.games;
  if (games.allowedChannels.length && !games.allowedChannels.includes(interaction.channelId)) {
    await interaction.reply({
      content: `🎰 Les jeux sont réservés à ces salons : ${games.allowedChannels.map((id) => `<#${id}>`).join(' ')}`,
      ...ephemOf(interaction),
    });
    return true;
  }
  await handleCrashStart(interaction);
  return true;
}

// ------------------------------------------------------------
//  Utilitaires d’affichage partagés (menu éco)
// ------------------------------------------------------------

/** Barre d’XP du membre (pour le menu éco et le profil). */
export function xpBar(config: AppConfig, account: EconomyAccount): string {
  const ui = config.ui;
  const resolved = levelFromXp(account.xp);
  const toNext = xpToNext(resolved.level);
  const bar = progressBar(ui, resolved.intoLevel, toNext);
  return `Niveau **${resolved.level}** · ${resolved.intoLevel}/${toNext} XP${ui.cardShowProgressBar ? `\n${bar}` : ''}`;
}

export { accentColor, humanDuration };
export type { QuestDef };
