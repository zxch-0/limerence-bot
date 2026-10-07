import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

/**
 * Le magasin doit persister l'état et le relire à l'identique :
 * c'est ce qui garantit que la configuration enregistrée depuis le
 * panel survit à un redémarrage.
 */

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'limerence-store-'));
process.env.DATA_DIR = DATA_DIR;
process.env.LIMERENCE_NO_MIRROR = '1';

test('l’état est persisté puis relu, et les sections peuvent être réinitialisées', async () => {
  const store = await import('../src/lib/store');
  assert.equal(store.storageKind(), 'fichier json');

  const initial = await store.getState();
  const startBalance = initial.config.economy.startBalance;

  await store.updateState((state) => {
    state.config.economy.startBalance = 4321;
    state.config.economy.dailyMin = 77;
    state.config.blackjack.minBet = 12;
    state.shopItems.push({
      id: 'item-1',
      name: 'Test',
      emoji: '🧪',
      description: '',
      price: 10,
      type: 'collectible',
      roleId: '',
      effectValue: 0,
      durationHours: 0,
      stock: -1,
      initialStock: -1,
      maxPerUser: 0,
      category: 'Général',
      enabled: true,
      position: 0,
      createdAt: new Date().toISOString(),
    });
  });

  const file = path.join(DATA_DIR, 'state.json');
  assert.ok(existsSync(file), 'le fichier d’état est écrit');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { config: { economy: { startBalance: number } } };
  assert.equal(raw.config.economy.startBalance, 4321, 'la valeur est bien écrite sur disque');

  // relecture depuis le disque (on vide le cache en mémoire)
  (globalThis as unknown as { __limerenceStore?: { loaded: boolean; cache: unknown } }).__limerenceStore = {
    loaded: false,
    cache: null,
  } as never;
  const reloaded = await store.getState();
  assert.equal(reloaded.config.economy.startBalance, 4321);
  assert.equal(reloaded.config.economy.dailyMin, 77);
  assert.equal(reloaded.config.blackjack.minBet, 12);
  assert.equal(reloaded.shopItems.length, 1);

  // réinitialisation d'une seule section
  await store.resetConfigSection('economy');
  const after = await store.getState();
  assert.equal(after.config.economy.startBalance, startBalance, 'l’économie revient aux valeurs par défaut');
  assert.equal(after.config.blackjack.minBet, 12, 'les autres sections sont préservées');
  assert.equal(after.shopItems.length, 1, 'les données des membres ne sont pas touchées');

  // réinitialisation globale
  await store.resetConfig();
  const reset = await store.getState();
  assert.equal(reset.config.economy.startBalance, startBalance);
  assert.equal(reset.config.blackjack.minBet, initial.config.blackjack.minBet);
});

test('une configuration partielle ou corrompue est réparée au chargement', async () => {
  const { mergeConfig, emptyState } = await import('../src/lib/config');
  const base = emptyState();

  const partial = mergeConfig(base.config, {
    economy: { startBalance: 999, ghostOption: 'x' } as never,
    channels: { logs: '111111111111111111' } as never,
  });
  assert.equal(partial.economy.startBalance, 999);
  assert.equal('ghostOption' in partial.economy, false, 'les options inconnues sont écartées');
  assert.equal(partial.economy.dailyMin, base.config.economy.dailyMin, 'les options manquantes retrouvent leur défaut');
  assert.equal(partial.channels.logs, '111111111111111111');
  assert.equal(partial.channels.shop, base.config.channels.shop);
});
