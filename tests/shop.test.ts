import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState } from '../src/lib/config';
import {
  effectivePrice,
  findItem,
  purchaseItem,
  resellItem,
  restock,
  sanitizeItemInput,
  sortedItems,
  type ShopItemInput,
} from '../src/lib/shop/items';
import { ensureAccount } from '../src/lib/economy/core';
import type { StoreState } from '../src/lib/types';

function snowflakeAt(date: Date): string {
  return ((BigInt(date.getTime()) - 1420070400000n) << 22n).toString();
}

const OLD = snowflakeAt(new Date('2020-01-01T00:00:00Z'));

function input(overrides: Partial<ShopItemInput> = {}): ShopItemInput {
  return {
    name: 'Rôle VIP',
    emoji: '👑',
    description: 'Accès aux salons VIP',
    price: 1000,
    type: 'role',
    roleId: '123456789012345678',
    stock: 10,
    ...overrides,
  };
}

function setup(overrides: Partial<ShopItemInput> = {}): { state: StoreState; itemId: string } {
  const state = emptyState();
  const item = sanitizeItemInput(input(overrides));
  if ('error' in item) throw new Error(item.error);
  state.shopItems.push(item);
  // les tests achètent plusieurs fois de suite : pas de délai anti-spam
  // ni de limite globale par membre (testées séparément)
  state.config.shop.cooldownSeconds = 0;
  state.config.shop.defaultMaxPerUser = 0;
  ensureAccount(state, OLD).cash = 5000;
  return { state, itemId: item.id };
}

function buy(state: StoreState, itemId: string, extra: Record<string, unknown> = {}) {
  return purchaseItem(state, {
    userId: OLD,
    itemId,
    shop: state.config.shop,
    economy: state.config.economy,
    ...extra,
  });
}

test('un article est validé avant enregistrement', () => {
  const valid = sanitizeItemInput(input());
  assert.equal('error' in valid, false);
  if ('error' in valid) return;
  assert.equal(valid.name, 'Rôle VIP');
  assert.equal(valid.stock, 10);
  assert.equal(valid.initialStock, 10);
  assert.equal(valid.type, 'role');

  assert.equal('error' in sanitizeItemInput(input({ name: '   ' })), true, 'un nom vide est refusé');
  assert.equal('error' in sanitizeItemInput(input({ price: 0 })), true, 'un prix nul est refusé');
  assert.equal('error' in sanitizeItemInput(input({ type: 'role', roleId: 'abc' })), true, 'un rôle invalide est refusé');

  const unlimited = sanitizeItemInput(input({ type: 'collectible', stock: -5 }));
  assert.equal('error' in unlimited, false);
  if ('error' in unlimited) return;
  assert.equal(unlimited.stock, -1, 'un stock négatif devient illimité');
  assert.equal(unlimited.roleId, '', 'un article qui n’est pas un rôle ne porte pas de rôle');
});

test('un achat débite le prix taxé, décrmente le stock et donne le rôle', () => {
  const { state, itemId } = setup();
  const config = state.config.shop;
  config.purchaseTaxPercent = 10;
  const account = ensureAccount(state, OLD);
  const before = account.cash;

  const result = buy(state, itemId);
  assert.equal(result.ok, true);
  assert.equal(result.total, 1100, '1000 + 10 % de taxe');
  assert.equal(account.cash, before - 1100);
  assert.equal(state.shopItems[0].stock, 9);
  assert.equal(result.grantRoleId, '123456789012345678', 'le rôle est transmis à la couche bot');
  assert.equal(account.items.length, 1);
  assert.equal(state.purchases.length, 1, 'l’achat est historisé');
  assert.equal(state.purchases[0].tax, 100);
});

test('un achat est refusé sans fonds, sans rôle requis ou une fois épuisé', () => {
  const { state, itemId } = setup({ price: 9000 });
  assert.equal(buy(state, itemId).ok, false, 'solde insuffisant');

  const cheap = setup({ price: 100, type: 'collectible' });
  cheap.state.config.shop.requireRoleIds = ['role-vip'];
  assert.equal(buy(cheap.state, cheap.itemId).ok, false, 'rôle requis manquant');
  assert.equal(buy(cheap.state, cheap.itemId, { roleIds: ['role-vip'] }).ok, true);

  const single = setup({ price: 100, type: 'collectible', stock: 1 });
  assert.equal(buy(single.state, single.itemId).ok, true);
  assert.equal(buy(single.state, single.itemId).ok, false, 'stock épuisé');
});

test('la limite par membre est appliquée', () => {
  const { state, itemId } = setup({ price: 100, type: 'collectible', stock: -1, maxPerUser: 2 });
  assert.equal(buy(state, itemId).ok, true);
  assert.equal(buy(state, itemId).ok, true);
  const third = buy(state, itemId);
  assert.equal(third.ok, false);
  assert.match(third.error ?? '', /limite|déjà/i);
});

test('un délai entre deux achats est appliqué', () => {
  const { state, itemId } = setup({ price: 100, type: 'collectible' });
  state.config.shop.cooldownSeconds = 30;

  assert.equal(buy(state, itemId).ok, true);
  const refused = buy(state, itemId);
  assert.equal(refused.ok, false);
  assert.match(refused.error ?? '', /Patience/);
});

test('un compte trop jeune ne peut pas acheter si la boutique l’exige', () => {
  const { state, itemId } = setup({ price: 100, type: 'collectible' });
  state.config.shop.minAccountAgeDays = 3650;
  const fresh = snowflakeAt(new Date());
  ensureAccount(state, fresh).cash = 5000;

  const result = purchaseItem(state, {
    userId: fresh,
    itemId,
    shop: state.config.shop,
    economy: state.config.economy,
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /jour/);
});

test('une promotion réduit le prix affiché et payé', () => {
  const { state, itemId } = setup({ price: 1000, type: 'collectible' });
  const config = state.config.shop;
  config.purchaseTaxPercent = 0;
  config.saleEnabled = true;
  config.salePercent = 25;

  const price = effectivePrice(state.shopItems[0], config);
  assert.equal(price.price, 750);
  assert.equal(price.discounted, true);
  assert.equal(price.total, 750);

  const result = buy(state, itemId);
  assert.equal(result.total, 750);

  config.saleEndsAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(effectivePrice(state.shopItems[0], config).price, 1000, 'une promotion expirée ne s’applique plus');
});

test('la revente rend un pourcentage du prix payé', () => {
  const { state, itemId } = setup({ price: 1000, type: 'collectible' });
  state.config.shop.purchaseTaxPercent = 0;
  state.config.shop.allowResell = true;
  state.config.shop.resellPercent = 50;
  const account = ensureAccount(state, OLD);

  assert.equal(buy(state, itemId).ok, true);
  const before = account.cash;
  const resell = resellItem(state, OLD, itemId, state.config.shop, state.config.economy);
  assert.equal(resell.ok, true);
  assert.equal(resell.amount, 500);
  assert.equal(account.cash, before + 500);
  assert.equal(account.items.length, 0);

  state.config.shop.allowResell = false;
  assert.equal(resellItem(state, OLD, itemId, state.config.shop, state.config.economy).ok, false);
});

test('un rôle acheté ne se revend pas', () => {
  const { state, itemId } = setup({ type: 'role', price: 500 });
  state.config.shop.purchaseTaxPercent = 0;
  state.config.shop.allowResell = true;
  assert.equal(buy(state, itemId).ok, true);
  const result = resellItem(state, OLD, itemId, state.config.shop, state.config.economy);
  assert.equal(result.ok, false);
});

test('le réassort restaure le stock initial des articles limités', () => {
  const { state, itemId } = setup({ price: 100, type: 'collectible', stock: 5 });
  const config = state.config.shop;
  config.restockEnabled = true;
  config.restockPercent = 100;

  buy(state, itemId);
  buy(state, itemId);
  assert.equal(state.shopItems[0].stock, 3);

  const filled = restock(state, config);
  assert.equal(filled, 1, 'un article réapprovisionné');
  assert.equal(state.shopItems[0].stock, 5);

  config.restockEnabled = false;
  assert.equal(restock(state, config), 0);
});

test('les articles sont triés par position puis par nom', () => {
  const state = emptyState();
  for (const [name, position] of [
    ['Zeta', 1],
    ['Alpha', 2],
    ['Beta', 0],
  ] as Array<[string, number]>) {
    const item = sanitizeItemInput(input({ name, price: 10, type: 'collectible' }));
    if ('error' in item) continue;
    item.position = position;
    state.shopItems.push(item);
  }
  assert.deepEqual(
    sortedItems(state).map((item) => item.name),
    ['Beta', 'Zeta', 'Alpha'],
  );
  assert.equal(findItem(state, 'beta')?.name, 'Beta', 'la recherche par nom est insensible à la casse');
});

test('une boutique fermée ne vend rien', () => {
  const { state, itemId } = setup({ price: 100, type: 'collectible' });
  state.config.shop.enabled = false;
  const closed = buy(state, itemId);
  assert.equal(closed.ok, false);
  assert.match(closed.error ?? '', /fermée/);

  state.config.shop.enabled = true;
  state.config.economy.enabled = false;
  assert.equal(buy(state, itemId).ok, false);
});
