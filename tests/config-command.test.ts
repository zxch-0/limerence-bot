import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  ChannelType,
  Collection,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import { emptyState } from '../src/lib/config';
import { CHANNEL_SLOTS, type ChannelSlot } from '../src/lib/types';

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'limerence-config-'));
process.env.DATA_DIR = DATA_DIR;
process.env.LIMERENCE_NO_MIRROR = '1';
delete process.env.DATABASE_URL;
delete process.env.DISCORD_GUILD_ID;
delete process.env.OWNER_DISCORD_ID;
delete process.env.ADMIN_DISCORD_IDS;

const GUILD_ID = '111111111111111111';
const CHANNEL_ID = '222222222222222222';
const OLD_CHANNEL_ID = '333333333333333333';

type Payload = { content?: string; flags?: MessageFlags; embeds?: Array<{ toJSON(): { description?: string } }> };

function interaction(options: {
  sub?: string;
  category?: string;
  type?: ChannelType;
  staff?: boolean;
  dm?: boolean;
  guildId?: string;
  channelGuildId?: string;
  missingChannel?: boolean;
  missingPermission?: bigint;
} = {}) {
  const replies: Payload[] = [];
  const deferrals: Payload[] = [];
  const edits: Payload[] = [];
  const sent: Payload[] = [];
  const guildId = options.guildId ?? GUILD_ID;
  const channel = {
    id: CHANNEL_ID,
    name: 'notifications',
    type: options.type ?? ChannelType.GuildText,
    guild: { id: options.channelGuildId ?? guildId },
    permissionsFor: () => ({
      has: (bits: bigint[]) => !bits.includes(options.missingPermission ?? 0n),
    }),
    send: async (payload: Payload) => { sent.push(payload); return { id: 'message' }; },
  };
  const cache = new Collection<string, GuildBasedChannel>();
  if (!options.missingChannel) cache.set(channel.id, channel as unknown as GuildBasedChannel);
  const guild = {
    id: guildId,
    members: { me: { id: 'bot' } },
    channels: {
      cache,
      fetch: async (id?: string) => id ? (cache.get(id) ?? null) : cache,
    },
  } as unknown as Guild;
  const value = {
    commandName: 'config',
    guild: options.dm ? null : guild,
    guildId: options.dm ? null : guildId,
    inGuild: () => !options.dm,
    user: { id: '444444444444444444' },
    memberPermissions: { has: () => options.staff !== false },
    options: {
      getSubcommand: () => options.sub ?? 'salon',
      getString: () => options.category ?? 'economy',
      getChannel: () => ({ id: CHANNEL_ID }),
    },
    reply: async (payload: Payload) => { replies.push(payload); },
    deferReply: async (payload: Payload) => { deferrals.push(payload); },
    editReply: async (payload: Payload) => { edits.push(payload); },
  } as unknown as ChatInputCommandInteraction;
  return { value, guild, replies, deferrals, edits, sent };
}

async function setup() {
  const store = await import('../src/lib/store');
  await store.updateState((state) => {
    Object.assign(state, emptyState());
    state.config.guildId = GUILD_ID;
  });
  const { handleConfigCommand } = await import('../src/bot/config');
  return { ...store, handleConfigCommand };
}

test('/config refuse les MP et les membres sans permission, sans modifier l’état', async () => {
  const { handleConfigCommand, getState } = await setup();
  const before = structuredClone(await getState());
  for (const options of [{ dm: true }, { staff: false }]) {
    const mock = interaction(options);
    await handleConfigCommand(mock.value);
    assert.equal(mock.replies.length, 1);
    assert.equal(mock.deferrals.length, 0);
    assert.equal(mock.edits.length, 0);
    assert.equal(mock.replies[0].flags, options.dm ? undefined : MessageFlags.Ephemeral);
    assert.deepEqual(await getState(), before);
  }
});

test('/config refuse un autre serveur car la configuration est globale', async () => {
  const { handleConfigCommand, getState } = await setup();
  const before = structuredClone(await getState());
  const mock = interaction({ guildId: '999999999999999999' });
  await handleConfigCommand(mock.value);
  assert.match(mock.edits[0].content!, /serveur cible/);
  assert.deepEqual(await getState(), before);
});

test('/config refuse une catégorie invalide et les salons non publiables ou inaccessibles', async () => {
  const { handleConfigCommand, getState } = await setup();
  const before = structuredClone(await getState());
  for (const options of [
    { category: '__proto__' },
    { type: ChannelType.GuildVoice },
    { type: ChannelType.GuildForum },
    { missingChannel: true },
    { channelGuildId: '999999999999999999' },
    { missingPermission: PermissionFlagsBits.ViewChannel },
    { missingPermission: PermissionFlagsBits.SendMessages },
    { missingPermission: PermissionFlagsBits.EmbedLinks },
  ]) {
    const mock = interaction(options);
    await handleConfigCommand(mock.value);
    assert.match(mock.edits[0].content!, /❌/);
    assert.deepEqual(await getState(), before);
  }
});

test('/config salon est dispatché, persiste et route les notifications économiques', async () => {
  const { getState, updateState } = await setup();
  await updateState((state) => {
    state.config.economy.startBalance = 321;
    state.config.economy.economyChannelOnly = true;
    state.config.economy.economyAllowedChannels = [OLD_CHANNEL_ID];
    state.config.channels.general = OLD_CHANNEL_ID;
  });
  const before = structuredClone(await getState());
  const { handleChatInput } = await import('../src/bot/commands');
  const mock = interaction();
  await handleChatInput(mock.value, before.config);
  assert.deepEqual(mock.deferrals, [{ flags: MessageFlags.Ephemeral }]);
  assert.match(mock.edits[0].content!, new RegExp(CHANNEL_ID));
  const state = await getState();
  assert.equal(state.config.channels.economy, CHANNEL_ID);
  assert.deepEqual(state.config.economy, before.config.economy, 'les restrictions et activations sont préservées');
  assert.equal(state.config.channels.general, OLD_CHANNEL_ID);
  assert.equal(state.logs[0].source, 'discord:444444444444444444');

  const stored = JSON.parse(readFileSync(path.join(DATA_DIR, 'state.json'), 'utf8'));
  assert.equal(stored.config.channels.economy, CHANNEL_ID);
  const globals = (globalThis as unknown as {
    __limerenceStore: { loaded: boolean; cache: unknown };
  }).__limerenceStore;
  globals.loaded = false;
  globals.cache = null;
  assert.equal((await getState()).config.channels.economy, CHANNEL_ID, 'survit au rechargement');

  const { announceEconomyEvent } = await import('../src/bot/rewards');
  await announceEconomyEvent(mock.guild, 'Nouvelle notification économique');
  assert.equal(mock.sent[0].content, 'Nouvelle notification économique');
});

test('/config salon et supprimer synchronisent toutes les destinations historiques', async () => {
  const { handleConfigCommand, getState, updateState } = await setup();
  const { effectiveSlotChannelId, resolveSlotFromCache } = await import('../src/lib/channels');
  const legacy: Partial<Record<ChannelSlot, (config: ReturnType<typeof emptyState>['config']) => string>> = {
    welcome: (config) => config.welcome.channelId,
    confessions: (config) => config.confessions.targetChannelId,
    confessionReview: (config) => config.confessions.reviewChannelId,
    logs: (config) => config.logs.channelId,
  };
  await updateState((state) => {
    state.config.welcome.channelId = OLD_CHANNEL_ID;
    state.config.confessions.targetChannelId = OLD_CHANNEL_ID;
    state.config.confessions.reviewChannelId = OLD_CHANNEL_ID;
    state.config.logs.channelId = OLD_CHANNEL_ID;
  });
  for (const slot of CHANNEL_SLOTS) {
    const mock = interaction({ category: slot, type: ChannelType.GuildAnnouncement });
    await handleConfigCommand(mock.value);
    const config = (await getState()).config;
    assert.equal(config.channels[slot], CHANNEL_ID);
    assert.equal(effectiveSlotChannelId(config, slot), CHANNEL_ID);
    assert.equal(resolveSlotFromCache(mock.guild, config, slot)?.id, CHANNEL_ID);
    if (legacy[slot]) assert.equal(legacy[slot]!(config), CHANNEL_ID);

    const removal = interaction({ sub: 'supprimer', category: slot });
    await handleConfigCommand(removal.value);
    assert.equal(config.channels[slot], '');
    if (legacy[slot]) assert.equal(legacy[slot]!(config), '');
    assert.match(removal.edits[0].content!, /replis existants restent actifs/);
  }
});

test('/config voir affiche les destinations explicites sans modifier la configuration', async () => {
  const { handleConfigCommand, getState, updateState } = await setup();
  await updateState((state) => {
    state.config.welcome.channelId = OLD_CHANNEL_ID;
    state.config.channels.welcome = CHANNEL_ID;
  });
  const before = structuredClone(await getState());
  const mock = interaction({ sub: 'voir' });
  await handleConfigCommand(mock.value);
  const description = mock.edits[0].embeds![0].toJSON().description!;
  assert.match(description, new RegExp(`Bienvenue.*<#${OLD_CHANNEL_ID}>`));
  assert.match(description, /Économie.*Non défini/);
  assert.ok(description.length <= 4096);
  assert.deepEqual(await getState(), before);
});

test('/config peut associer le premier serveur si aucun serveur cible n’est défini', async () => {
  const { handleConfigCommand, getState, updateState } = await setup();
  await updateState((state) => { state.config.guildId = null; });
  await handleConfigCommand(interaction().value);
  assert.equal((await getState()).config.guildId, GUILD_ID);
});
