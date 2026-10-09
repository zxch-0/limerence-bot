import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PermissionFlagsBits } from 'discord.js';

// Le magasin lit DATA_DIR au chargement : le définir avant tout import du store.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'limerence-giveaways-'));
process.env.LIMERENCE_NO_MIRROR = '1';

import { emptyState } from '../src/lib/config';
import {
  drawWinners,
  dueGiveaways,
  findGiveaway,
  giveawayProgress,
  isGiveawayOpen,
  isParticipant,
  summarizeGiveaway,
  toggleParticipant,
} from '../src/lib/giveaways';
import { giveawayCommands } from '../src/bot/commandDefs';
import type { Giveaway, StoreState } from '../src/lib/types';

function makeGiveaway(overrides: Partial<Giveaway> = {}): Giveaway {
  const now = Date.now();
  return {
    id: 'giveaway-1234-test',
    guildId: 'guild-1',
    channelId: 'channel-1',
    prize: '5 000 💵',
    winnerCount: 2,
    rewardAmount: 5000,
    endsAt: new Date(now + 3_600_000).toISOString(),
    status: 'active',
    createdBy: 'discord:admin',
    createdAt: new Date(now - 1000).toISOString(),
    participants: [],
    winners: [],
    ...overrides,
  };
}

function stateWith(...giveaways: Giveaway[]): StoreState {
  const state = emptyState();
  state.giveaways = giveaways;
  return state;
}

// ------------------------------------------------------------
//  Tirage au sort
// ------------------------------------------------------------

test('drawWinners tire des gagnants distincts dans la limite demandée', () => {
  const participants = ['a', 'b', 'c', 'd', 'e', 'f'];
  const winners = drawWinners(participants, 3, [], () => 0.42);
  assert.equal(winners.length, 3);
  assert.equal(new Set(winners).size, 3, 'pas de doublon');
  for (const winner of winners) assert.ok(participants.includes(winner));
});

test('drawWinners respecte le bassin disponible et déduplique les participants', () => {
  assert.equal(drawWinners(['a', 'b'], 5).length, 2, 'count supérieur au bassin = tout le bassin');
  assert.equal(drawWinners(['a', 'a', 'b'], 10).length, 2, 'participants dédupliqués');
  assert.deepEqual(drawWinners([], 3), [], 'aucun participant = aucun gagnant');
  assert.deepEqual(drawWinners(['a', 'b'], 0), [], 'count nul = aucun gagnant');
});

test('drawWinners exclut les gagnants précédents (re-tirage)', () => {
  const participants = ['a', 'b', 'c'];
  const first = drawWinners(participants, 2, [], () => 0.99);
  const second = drawWinners(participants, 1, first, () => 0.01);
  assert.equal(second.length, 1);
  assert.ok(!first.includes(second[0]), 'le re-tirage ne retombe pas sur un ancien gagnant');
});

// ------------------------------------------------------------
//  Participation
// ------------------------------------------------------------

test('toggleParticipant ajoute puis retire le membre', () => {
  const giveaway = makeGiveaway();
  assert.equal(toggleParticipant(giveaway, 'user-1'), true, 'premier clic = participation');
  assert.equal(toggleParticipant(giveaway, 'user-2'), true);
  assert.deepEqual(giveaway.participants, ['user-1', 'user-2']);
  assert.equal(isParticipant(giveaway, 'user-1'), true);
  assert.equal(toggleParticipant(giveaway, 'user-1'), false, 'second clic = désinscription');
  assert.deepEqual(giveaway.participants, ['user-2']);
  assert.equal(isParticipant(giveaway, 'user-1'), false);
});

// ------------------------------------------------------------
//  Recherche et état
// ------------------------------------------------------------

test('findGiveaway retrouve par id complet, préfixe ou libellé du lot', () => {
  const giveaway = makeGiveaway();
  const state = stateWith(giveaway);
  assert.equal(findGiveaway(state, giveaway.id)?.id, giveaway.id);
  assert.equal(findGiveaway(state, giveaway.id.slice(0, 8))?.id, giveaway.id, 'préfixe de 8 caractères');
  assert.equal(findGiveaway(state, '5 000 💵')?.id, giveaway.id, 'libellé exact du lot');
  assert.equal(findGiveaway(state, 'inconnu'), undefined);
  assert.equal(findGiveaway(state, '   '), undefined);
});

test('isGiveawayOpen et dueGiveaways suivent la date de fin', () => {
  const now = Date.now();
  const open = makeGiveaway({ endsAt: new Date(now + 60_000).toISOString() });
  const expired = makeGiveaway({ id: 'g2', endsAt: new Date(now - 1000).toISOString() });
  const ended = makeGiveaway({ id: 'g3', status: 'ended', endsAt: new Date(now - 1000).toISOString() });
  const state = stateWith(open, expired, ended);

  assert.equal(isGiveawayOpen(open), true);
  assert.equal(isGiveawayOpen(expired), false, 'fin passée = fermé');
  assert.equal(isGiveawayOpen(ended), false, 'terminé = fermé');

  const due = dueGiveaways(state, now);
  assert.deepEqual(due.map((g) => g.id), ['g2'], 'seul le giveaway actif et échu est dû');
});

test('giveawayProgress est borné entre 0 et 100', () => {
  const now = Date.now();
  const giveaway = makeGiveaway({
    createdAt: new Date(now - 10_000).toISOString(),
    endsAt: new Date(now + 10_000).toISOString(),
  });
  assert.equal(giveawayProgress(giveaway, now), 50);
  assert.equal(giveawayProgress(giveaway, now - 60_000), 0, 'avant le début = 0 %');
  assert.equal(giveawayProgress(giveaway, now + 60_000), 100, 'après la fin = 100 %');
});

test('summarizeGiveaway affiche l’id court, le lot et les compteurs', () => {
  const giveaway = makeGiveaway({ participants: ['a', 'b'] });
  const line = summarizeGiveaway(giveaway);
  assert.ok(line.includes('`giveaway`'), 'id tronqué à 8 caractères');
  assert.ok(line.includes('5 000 💵'));
  assert.ok(line.includes('2 participant(s)'));
});

// ------------------------------------------------------------
//  Persistance
// ------------------------------------------------------------

test('l’état vide contient une liste de giveaways et le magasin les persiste', async () => {
  assert.deepEqual(emptyState().giveaways, []);

  const store = await import('../src/lib/store');
  await store.updateState((state) => {
    state.giveaways.unshift(makeGiveaway({ id: 'persist-test-1' }));
  });

  // relecture depuis le disque (on vide le cache en mémoire)
  (globalThis as unknown as { __limerenceStore?: { loaded: boolean; cache: unknown } }).__limerenceStore = {
    loaded: false,
    cache: null,
  } as never;
  const reloaded = await store.getState();
  assert.equal(reloaded.giveaways.length, 1);
  assert.equal(reloaded.giveaways[0]?.id, 'persist-test-1');
  assert.equal(reloaded.giveaways[0]?.participants.length, 0);
});

// ------------------------------------------------------------
//  Définition de la commande slash
// ------------------------------------------------------------

test('/giveaway est réservée à l’équipe et expose les 6 sous-commandes', () => {
  type SubOption = { name: string; required?: boolean; options?: Array<{ name: string; required?: boolean }> };
  const command = giveawayCommands()[0];
  assert.equal(command?.name, 'giveaway');
  const json = command!.toJSON();
  assert.equal(json.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.equal(json.dm_permission, false, 'pas de giveaway en MP');

  const subs = ((json.options ?? []) as SubOption[]).map((option) => option.name);
  assert.deepEqual(subs, ['creer', 'liste', 'info', 'terminer', 'annuler', 'reroll']);

  const creer = ((json.options ?? []) as SubOption[]).find((option) => option.name === 'creer');
  const optionNames = (creer?.options ?? []).map((option) => option.name);
  assert.deepEqual(optionNames, ['lot', 'duree', 'gagnants', 'montant', 'salon', 'message']);
  assert.equal((creer?.options ?? []).find((option) => option.name === 'lot')?.required, true);
  assert.equal((creer?.options ?? []).find((option) => option.name === 'duree')?.required, true);
  assert.notEqual((creer?.options ?? []).find((option) => option.name === 'gagnants')?.required, true, 'gagnants est facultatif');
  for (const sub of ['info', 'terminer', 'annuler', 'reroll']) {
    const target = ((json.options ?? []) as SubOption[]).find((option) => option.name === sub);
    assert.equal((target?.options ?? []).find((option) => option.name === 'id')?.required, true, `/giveaway ${sub} exige id`);
  }
});
