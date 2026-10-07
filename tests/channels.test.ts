import assert from 'node:assert/strict';
import { ChannelType, type Guild, type GuildBasedChannel } from 'discord.js';
import { test } from 'node:test';
import { emptyState } from '../src/lib/config';
import { missingSlots, resolveSlotFromCache, slotChannelId, slotConfigured } from '../src/lib/channels';
import { CHANNEL_SLOTS } from '../src/lib/types';
import type { AppConfig } from '../src/lib/types';

function fakeGuild(channels: Array<{ id: string; type: ChannelType; name?: string }>): Guild {
  const cache = new Map<string, GuildBasedChannel>();
  for (const channel of channels) {
    cache.set(channel.id, {
      id: channel.id,
      type: channel.type,
      name: channel.name ?? `salon-${channel.id}`,
    } as unknown as GuildBasedChannel);
  }
  return { channels: { cache } } as unknown as Guild;
}

const TEXT = { id: '111111111111111111', type: ChannelType.GuildText } as const;
const NEWS = { id: '222222222222222222', type: ChannelType.GuildAnnouncement } as const;
const VOICE = { id: '333333333333333333', type: ChannelType.GuildVoice } as const;

test('les identifiants de salon sont validés', () => {
  const config = emptyState().config as AppConfig;
  assert.equal(slotChannelId(config, 'logs'), '');
  assert.equal(slotConfigured(config, 'logs'), false);

  config.channels.logs = TEXT.id;
  assert.equal(slotChannelId(config, 'logs'), TEXT.id);
  assert.equal(slotConfigured(config, 'logs'), true);

  config.channels.logs = '#général';
  assert.equal(slotChannelId(config, 'logs'), '', 'un nom de salon n’est pas un identifiant');

  config.channels.logs = '123';
  assert.equal(slotChannelId(config, 'logs'), '', 'un identifiant trop court est ignoré');
});

test('les emplacements manquants sont listés pour le panel', () => {
  const config = emptyState().config as AppConfig;
  assert.equal(missingSlots(config).length, CHANNEL_SLOTS.length, 'aucun salon configuré au départ');

  config.channels.logs = TEXT.id;
  config.channels.welcome = NEWS.id;
  const missing = missingSlots(config);
  assert.equal(missing.length, CHANNEL_SLOTS.length - 2);
  assert.equal(missing.includes('logs'), false);
  assert.equal(missing.includes('welcome'), false);
});

test('la résolution depuis le cache n’accepte que les salons textuels', () => {
  const config = emptyState().config as AppConfig;
  const guild = fakeGuild([TEXT, NEWS, VOICE]);

  config.channels.economy = TEXT.id;
  assert.equal(resolveSlotFromCache(guild, config, 'economy')?.id, TEXT.id);

  config.channels.announcements = NEWS.id;
  assert.equal(resolveSlotFromCache(guild, config, 'announcements')?.id, NEWS.id, 'un salon annonces est publiable');

  config.channels.blackjack = VOICE.id;
  assert.equal(resolveSlotFromCache(guild, config, 'blackjack'), null, 'un salon vocal ne reçoit pas de message');

  config.channels.shop = '999999999999999999';
  assert.equal(resolveSlotFromCache(guild, config, 'shop'), null, 'un salon disparu renvoie null');

  assert.equal(resolveSlotFromCache(guild, config, 'rules'), null, 'un emplacement vide renvoie null');
});
