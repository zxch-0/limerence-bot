import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type TextChannel,
} from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import { resolveChannelById, resolveSlotChannel } from '../lib/channels';
import type { Confession } from '../lib/types';

// ============================================================
//  Confessions anonymes
//  Flux : /confession (modal) -> file d'attente -> validation
//  par un admin (boutons) -> publication anonyme + réactions.
// ============================================================

const cooldowns = new Map<string, number>();

export interface SubmitResult {
  ok: boolean;
  message: string;
  confession?: Confession;
}

export async function submitConfession(
  guild: Guild,
  authorId: string,
  content: string,
): Promise<SubmitResult> {
  const state = await getState();
  const cfg = state.config.confessions;

  if (!cfg.enabled) return { ok: false, message: "Les confessions sont désactivées par l'administration." };

  const text = content.trim();
  if (!text) return { ok: false, message: 'Ta confession est vide.' };
  if (text.length > cfg.maxLength) {
    return { ok: false, message: `Trop long : ${text.length}/${cfg.maxLength} caractères maximum.` };
  }

  const last = cooldowns.get(authorId) ?? 0;
  const wait = cfg.cooldownSeconds * 1000 - (Date.now() - last);
  if (wait > 0) {
    return {
      ok: false,
      message: `Doucement 🌙 attends encore ${Math.ceil(wait / 1000)} seconde(s) avant une nouvelle confession.`,
    };
  }
  cooldowns.set(authorId, Date.now());

  const confession: Confession = {
    id: randomUUID(),
    authorId,
    content: text,
    status: cfg.requireApproval ? 'pending' : 'published',
    createdAt: new Date().toISOString(),
  };

  await updateState((s) => {
    s.confessions.unshift(confession);
    if (s.confessions.length > 300) s.confessions = s.confessions.slice(0, 300);
  });

  if (cfg.requireApproval) {
    await postReviewCard(guild, confession);
    await addLog({
      level: 'info',
      source: `membre:${authorId}`,
      action: 'Nouvelle confession en attente',
      detail: `Confession ${confession.id.slice(0, 8)}`,
    });
    return { ok: true, message: 'Ta confession a été envoyée anonymement à l’équipe ✨', confession };
  }

  const published = await publishConfession(guild, confession);
  return {
    ok: published,
    message: published
      ? 'Ta confession est publiée anonymement ✨'
      : 'Confession enregistrée, mais la publication a échoué (salon introuvable ?).',
    confession,
  };
}

function confessionEmbed(confession: Confession, index: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffffff)
    .setAuthor({ name: `🤫 Confession anonyme #${index}` })
    .setDescription(confession.content)
    .setFooter({ text: 'Limerence • 100 % anonyme' })
    .setTimestamp(new Date(confession.createdAt));
}

async function postReviewCard(guild: Guild, confession: Confession): Promise<void> {
  const state = await getState();
  const cfg = state.config.confessions;
  if (!cfg.notifyReviewChannel) return;

  const channel =
    (await resolveChannelById(guild, cfg.reviewChannelId)) ??
    (await resolveSlotChannel(guild, state.config, 'confessionReview'));
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xffc0cb)
    .setAuthor({ name: '🗂️ Confession à valider' })
    .setDescription(confession.content)
    .addFields({
      name: 'Auteur (confidentiel)',
      value: `<@${confession.authorId}> • \`${confession.authorId}\``,
      inline: false,
    })
    .setFooter({ text: `ID ${confession.id.slice(0, 8)}` })
    .setTimestamp(new Date(confession.createdAt));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`conf:approve:${confession.id}`)
      .setLabel('Publier')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`conf:reject:${confession.id}`)
      .setLabel('Refuser')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );

  const message = await channel.send({
    content: '🔔 Une nouvelle confession attend ta décision.',
    embeds: [embed],
    components: [row],
  });

  await updateState((s) => {
    const c = s.confessions.find((x) => x.id === confession.id);
    if (c) {
      c.reviewMessageId = message.id;
      c.reviewChannelId = channel.id;
    }
  });
}

/** Publie la confession dans le salon public + réactions. */
export async function publishConfession(guild: Guild, confession: Confession): Promise<boolean> {
  const state = await getState();
  const current = state.confessions.find((item) => item.id === confession.id);
  if (current?.status === 'published' && current.publishedMessageId) return true;
  if (current?.status === 'rejected') return false;
  const cfg = state.config.confessions;
  const channel =
    (await resolveChannelById(guild, cfg.targetChannelId)) ??
    (await resolveSlotChannel(guild, state.config, 'confessions'));
  if (!channel) return false;

  const target = channel as TextChannel;
  const index =
    state.confessions.filter((c) => c.status === 'published').length || 1;

  const message = await target.send({ embeds: [confessionEmbed(confession, index)] });
  for (const emoji of cfg.reactions) {
    await message.react(emoji).catch(() => undefined);
  }

  await updateState((s) => {
    const c = s.confessions.find((x) => x.id === confession.id);
    if (c) {
      c.status = 'published';
      c.handledAt = new Date().toISOString();
      c.publishedMessageId = message.id;
      c.publishedChannelId = target.id;
    }
  });

  await addLog({
    level: 'success',
    source: 'bot',
    action: 'Confession publiée',
    detail: `Confession ${confession.id.slice(0, 8)} dans #${target.name}`,
  });
  return true;
}

export async function rejectConfession(guild: Guild, confessionId: string, by: string) {
  const state = await getState();
  const confession = state.confessions.find((c) => c.id === confessionId);
  if (!confession) return;

  await updateState((s) => {
    const c = s.confessions.find((x) => x.id === confessionId);
    if (c) {
      c.status = 'rejected';
      c.handledAt = new Date().toISOString();
      c.handledBy = by;
    }
  });

  await addLog({
    level: 'warn',
    source: `admin:${by}`,
    action: 'Confession refusée',
    detail: `Confession ${confessionId.slice(0, 8)}`,
  });

  // on masque la carte de validation
  if (confession.reviewMessageId && confession.reviewChannelId) {
    const channel = await guild.channels
      .fetch(confession.reviewChannelId)
      .catch(() => null);
    if (channel?.isTextBased()) {
      const msg = await channel.messages.fetch(confession.reviewMessageId).catch(() => null);
      if (msg) {
        await msg
          .edit({
            content: '🗑️ Confession refusée par un administrateur.',
            embeds: [],
            components: [],
          })
          .catch(() => undefined);
      }
    }
  }
}

export async function markReviewMessageHandled(
  guild: Guild,
  confessionId: string,
  who: string,
) {
  const state = await getState();
  const confession = state.confessions.find((c) => c.id === confessionId);
  if (!confession?.reviewMessageId || !confession.reviewChannelId) return;
  const channel = await guild.channels.fetch(confession.reviewChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const msg = await channel.messages.fetch(confession.reviewMessageId).catch(() => null);
  if (!msg) return;
  await msg
    .edit({
      content: `✅ Confession publiée par <@${who}>.`,
      components: [],
    })
    .catch(() => undefined);
}

export async function listConfessions(status?: string, limit = 100): Promise<Confession[]> {
  const state = await getState();
  return state.confessions
    .filter((c) => (status ? c.status === status : true))
    .slice(0, limit);
}
