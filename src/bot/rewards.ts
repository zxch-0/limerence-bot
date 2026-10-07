import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type Message,
  type MessageReaction,
  type User,
} from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { credit, debit, ensureAccount, formatMoney, randomInt } from '../lib/economy/core';
import { runMessageReward, runReactionReward, runVoiceReward } from '../lib/economy/actions';
import { resolveEconomyChannel } from '../lib/channels';
import { accentColor } from './ui';

// ============================================================
//  Récompenses passives : messages, réactions, vocal, invitations
//  et cagnottes automatiques (drops).
// ============================================================

const voiceSessions = new Map<string, number>();
const lastMessages = new Map<string, { content: string; at: number }>();
const inviteSnapshot = new Map<string, number>();
const notifiedCap = new Set<string>();

function roleIds(member: GuildMember | null): string[] {
  return member ? member.roles.cache.map((role) => role.id) : [];
}

// ------------------------------------------------------------
//  Messages
// ------------------------------------------------------------

export async function handleMessageReward(message: Message): Promise<void> {
  if (!message.guild) return;
  const state = await getState();
  const config = state.config.economy;
  if (!config.enabled || !config.messageRewardEnabled) return;
  if (config.messageIgnoreBots && message.author.bot) return;
  if (config.ignoreBotsEverywhere && message.author.bot) return;
  if ((message.content ?? '').trim().length < config.messageMinLength) return;
  if (config.messageIgnoredChannels.includes(message.channelId)) return;
  if (config.messageAllowedChannels.length && !config.messageAllowedChannels.includes(message.channelId)) return;

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  const reward = await updateState((s) => {
    const account = ensureAccount(s, message.author.id);
    return runMessageReward(s, account, s.config.economy, { roleIds: roleIds(member) });
  });

  if (reward.capped && config.messageNotifyOnCap && !notifiedCap.has(message.author.id)) {
    notifiedCap.add(message.author.id);
    setTimeout(() => notifiedCap.delete(message.author.id), 3_600_000);
    await message.author
      .send(`🪙 Tu as atteint le plafond quotidien de gains par message sur **${message.guild.name}**.`)
      .catch(() => undefined);
  }
  void reward.amount;

  lastMessages.set(message.author.id, { content: message.content ?? '', at: Date.now() });
}

export function previousMessage(userId: string): { content: string; at: number } | undefined {
  return lastMessages.get(userId);
}

// ------------------------------------------------------------
//  Réactions
// ------------------------------------------------------------

export async function handleReactionReward(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot || !reaction.message.guild) return;
  const state = await getState();
  const config = state.config.economy;
  if (!config.enabled || !config.reactionRewardEnabled) return;

  await updateState((s) => {
    const account = ensureAccount(s, user.id);
    return runReactionReward(s, account, s.config.economy);
  });
  void reaction;
}

// ------------------------------------------------------------
//  Vocal
// ------------------------------------------------------------

/** Crédite les membres présents en vocal (appelé par le planificateur). */
export async function processVoiceRewards(guild: Guild): Promise<number> {
  const state = await getState();
  const config = state.config.economy;
  if (!config.enabled || !config.voiceRewardEnabled) return 0;

  const now = Date.now();
  const seen = new Set<string>();
  let credited = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isVoiceBased()) continue;
    if (config.voiceIgnoredChannels.includes(channel.id)) continue;
    if (config.voiceAllowedCategories.length) {
      const parent = channel.parentId;
      if (!parent || !config.voiceAllowedCategories.includes(parent)) continue;
    }
    for (const member of channel.members.values()) {
      if (member.user.bot) continue;
      if (config.voiceIgnoreMuted && (member.voice.selfDeaf || member.voice.serverDeaf)) continue;
      seen.add(member.id);

      const startedAt = voiceSessions.get(`${guild.id}:${member.id}`) ?? now;
      const minutes = (now - startedAt) / 60_000;
      if (minutes < Math.max(1, config.voiceTickMinutes)) continue;
      if (minutes < config.voiceMinMinutes) continue;

      const result = await updateState((s) => {
        const account = ensureAccount(s, member.id);
        return runVoiceReward(s, account, s.config.economy, minutes, { roleIds: roleIds(member) });
      });
      if (result.ok) credited += 1;
      voiceSessions.set(`${guild.id}:${member.id}`, now);
    }
  }

  for (const key of Array.from(voiceSessions.keys())) {
    const memberId = key.split(':')[1];
    if (memberId && !seen.has(memberId)) voiceSessions.delete(key);
  }
  return credited;
}

export function trackVoiceJoin(guildId: string, userId: string): void {
  const key = `${guildId}:${userId}`;
  if (!voiceSessions.has(key)) voiceSessions.set(key, Date.now());
}

export function trackVoiceLeave(guildId: string, userId: string): void {
  voiceSessions.delete(`${guildId}:${userId}`);
}

// ------------------------------------------------------------
//  Invitations
// ------------------------------------------------------------

export async function snapshotInvites(guild: Guild): Promise<void> {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;
  inviteSnapshot.clear();
  for (const invite of invites.values()) inviteSnapshot.set(invite.code, invite.uses ?? 0);
}

/** Trouve l'inviteur d'un nouveau membre en comparant les compteurs d'invitations. */
export async function findInviter(guild: Guild, member: GuildMember): Promise<string | null> {
  const state = await getState();
  const config = state.config.economy;
  if (!config.enabled || !config.inviteRewardEnabled) return null;

  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;
  for (const invite of invites.values()) {
    const before = inviteSnapshot.get(invite.code) ?? 0;
    inviteSnapshot.set(invite.code, invite.uses ?? 0);
    if ((invite.uses ?? 0) > before && invite.inviter) {
      if (invite.inviter.id === member.id) continue;
      return invite.inviter.id;
    }
  }
  return null;
}

export async function rewardInviter(guild: Guild, inviterId: string, invitedId: string): Promise<void> {
  const state = await getState();
  const config = state.config.economy;
  if (!config.enabled || !config.inviteRewardEnabled) return;
  if (config.invitePerUserCap > 0) {
    const account = state.accounts[inviterId];
    if (account && account.invitesRewarded >= config.invitePerUserCap) return;
  }
  await updateState((s) => {
    const account = ensureAccount(s, inviterId);
    account.invitesRewarded += 1;
    credit(account, s.config.economy, config.inviteRewardAmount, 'invite', `Invitation de ${invitedId}`);
    return null;
  });
  await guild.client.users
    .fetch(inviterId)
    .then((user) =>
      user
        .send(
          `📨 Tu as invité **${invitedId}** sur **${guild.name}** : +${formatMoney(config, config.inviteRewardAmount)}.`,
        )
        .catch(() => undefined),
    )
    .catch(() => undefined);
}

export async function penalizeInviter(guild: Guild, invitedId: string): Promise<void> {
  const state = await getState();
  const config = state.config.economy;
  if (!config.enabled || !config.inviteRewardEnabled || !config.inviteLeavePenalty) return;
  await updateState((s) => {
    for (const account of Object.values(s.accounts)) {
      const invited = account.history.find(
        (entry) => entry.type === 'invite' && entry.label?.includes(invitedId),
      );
      if (!invited) continue;
      debit(account, s.config.economy, config.inviteRewardAmount, 'invite', `Invité parti : ${invitedId}`);
      account.invitesRewarded = Math.max(0, account.invitesRewarded - 1);
      break;
    }
    return null;
  });
  void guild;
}

// ------------------------------------------------------------
//  Cagnottes (drops)
// ------------------------------------------------------------

export async function processDrops(guild: Guild): Promise<void> {
  const state = await getState();
  const config = state.config.economy;
  if (!config.enabled || !config.dropEnabled) return;

  const now = Date.now();
  const active = state.meta.activeDrop;
  if (active && new Date(active.expiresAt).getTime() > now) return;
  if (active && new Date(active.expiresAt).getTime() <= now) {
    await updateState((s) => {
      s.meta.activeDrop = undefined;
      return null;
    });
  }

  const last = state.meta.lastDropAt ? new Date(state.meta.lastDropAt).getTime() : 0;
  if (now - last < config.dropCooldownMinutes * 60_000) return;

  const channel = await resolveEconomyChannel(guild, state.config);
  if (!channel) return;

  const amount = randomInt(config.dropMin, config.dropMax);
  const message = await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(state.config.ui.dropUseTheme ? accentColor(state.config.ui) : 0xffe3b3)
          .setTitle(`${state.config.ui.dropUseTheme ? state.config.ui.accentEmoji : '🎁'} Une cagnotte est tombée !`)
          .setDescription(
            `**${formatMoney(config, amount)}** sont à récupérer.\nPremier arrivé, premier servi !`,
          ),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('drop:claim')
            .setLabel('Récupérer')
            .setEmoji('💰')
            .setStyle(ButtonStyle.Success),
        ),
      ],
    })
    .catch(() => null);
  if (!message) return;

  await updateState((s) => {
    s.meta.lastDropAt = new Date().toISOString();
    s.meta.activeDrop = {
      amount,
      channelId: channel.id,
      messageId: message.id,
      expiresAt: new Date(Date.now() + config.dropLifetimeSeconds * 1000).toISOString(),
    };
    return null;
  });
  const messageId = message.id;

  if (messageId) {
    setTimeout(() => {
      void expireDrop(guild.id, messageId);
    }, config.dropLifetimeSeconds * 1000);
  }
}

export async function expireDrop(guildId: string, messageId: string): Promise<void> {
  const state = await getState();
  if (state.meta.activeDrop?.messageId !== messageId) return;
  const { getReadyClient } = await import('../lib/discord/client');
  const client = getReadyClient();
  const guild = client ? await client.guilds.fetch(guildId).catch(() => null) : null;
  const channel = guild?.channels.cache.get(state.meta.activeDrop.channelId);
  if (channel?.isTextBased()) {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    await message?.edit({ components: [] }).catch(() => undefined);
  }
  await updateState((s) => {
    if (s.meta.activeDrop?.messageId === messageId) s.meta.activeDrop = undefined;
    return null;
  });
}

export async function claimDrop(
  guild: Guild,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const state = await getState();
  const drop = state.meta.activeDrop;
  const config = state.config.economy;
  if (!drop) return { ok: false, message: 'Aucune cagnotte active.' };
  if (new Date(drop.expiresAt).getTime() <= Date.now()) return { ok: false, message: 'Cette cagnotte a expiré.' };

  const result = await updateState((s) => {
    const current = s.meta.activeDrop;
    if (!current) return { ok: false, message: 'Cagnotte déjà récupérée.' };
    if (s.config.economy.dropFirstClaimOnly && current.claimedBy) {
      return { ok: false, message: `Déjà récupérée par <@${current.claimedBy}>.` };
    }
    const account = ensureAccount(s, userId);
    const paid = credit(account, s.config.economy, current.amount, 'drop', 'Cagnotte');
    current.claimedBy = userId;
    return {
      ok: paid.ok,
      message: paid.ok ? `🎁 <@${userId}> récupère **${formatMoney(s.config.economy, paid.amount)}** !` : (paid.reason ?? 'Impossible.'),
    };
  });

  await addLog({
    level: 'economy',
    source: `membre:${userId}`,
    action: 'Cagnotte récupérée',
    detail: `${drop.amount} ${config.currencySymbol} dans ${guild.name}`,
  });
  return result;
}

export async function announceEconomyEvent(guild: Guild, text: string): Promise<void> {
  const channel = await resolveEconomyChannel(guild, (await getState()).config);
  await channel?.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => undefined);
}
