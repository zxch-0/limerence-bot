import { randomUUID } from 'node:crypto';
import type { ShopConfig, ShopItem, ShopItemType, StoreState } from '../types';
import type { EconomyConfig } from '../types';
import { credit, debit, ensureAccount, formatMoney, pushTransaction } from '../economy/core';
import { accountAgeDays } from '../economy/actions';
import { trackQuest } from '../economy/quests';

// ============================================================
//  Boutique — articles, achats, inventaire
//  La logique est pure : l'attribution du rôle Discord est faite
//  par la couche bot à partir du résultat retourné ici.
// ============================================================

export interface ShopItemInput {
  name: string;
  emoji?: string;
  description?: string;
  price: number;
  type: ShopItemType;
  roleId?: string;
  effectValue?: number;
  durationHours?: number;
  stock?: number;
  maxPerUser?: number;
  category?: string;
  enabled?: boolean;
}

export function sanitizeItemInput(input: ShopItemInput): ShopItem | { error: string } {
  const name = String(input.name ?? '').trim().slice(0, 60);
  if (!name) return { error: 'L’article doit avoir un nom.' };
  const price = Math.round(Number(input.price));
  if (!Number.isFinite(price) || price < 1) return { error: 'Le prix doit être un entier supérieur à 0.' };
  const type = input.type;
  if ((type === 'role' || type === 'income') && !/^\d{15,25}$/.test(String(input.roleId ?? ''))) {
    return {
      error:
        type === 'income'
          ? 'Un article « rôle de revenu » doit être associé à un rôle Discord existant.'
          : 'Un article « rôle » doit être associé à un rôle Discord existant.',
    };
  }
  const stock = Number.isFinite(Number(input.stock)) ? Math.round(Number(input.stock)) : -1;
  return {
    id: randomUUID(),
    name,
    emoji: String(input.emoji ?? '🛍️').slice(0, 8) || '🛍️',
    description: String(input.description ?? '').trim().slice(0, 200),
    price,
    type,
    roleId: type === 'role' || type === 'income' ? String(input.roleId) : '',
    effectValue: Math.max(0, Math.min(500, Math.round(Number(input.effectValue ?? 0) || 0))),
    durationHours: Math.max(0, Math.min(8760, Math.round(Number(input.durationHours ?? 0) || 0))),
    stock: stock < -1 ? -1 : stock,
    initialStock: stock < -1 ? -1 : stock,
    maxPerUser: Math.max(0, Math.min(1000, Math.round(Number(input.maxPerUser ?? 0) || 0))),
    category: String(input.category ?? 'Général').trim().slice(0, 40) || 'Général',
    enabled: input.enabled !== false,
    position: 0,
    createdAt: new Date().toISOString(),
  };
}

export function sortedItems(state: StoreState): ShopItem[] {
  return [...state.shopItems].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'),
  );
}

export function findItem(state: StoreState, idOrName: string): ShopItem | null {
  const needle = idOrName.trim().toLowerCase();
  return (
    sortedItems(state).find((item) => item.id === idOrName) ??
    sortedItems(state).find((item) => item.id.startsWith(idOrName.trim())) ??
    sortedItems(state).find((item) => item.name.toLowerCase() === needle) ??
    sortedItems(state).find((item) => item.name.toLowerCase().includes(needle)) ??
    null
  );
}

/** Prix réellement payé (promotion globale + taxe). */
export function effectivePrice(
  item: ShopItem,
  config: ShopConfig,
  now: Date = new Date(),
): { price: number; tax: number; total: number; discounted: boolean } {
  const saleActive =
    config.saleEnabled &&
    (!config.saleEndsAt || new Date(config.saleEndsAt).getTime() > now.getTime());
  const price = saleActive ? Math.round(item.price * (1 - config.salePercent / 100)) : item.price;
  const tax = Math.round((price * config.purchaseTaxPercent) / 100);
  return { price, tax, total: price + tax, discounted: saleActive };
}

export interface PurchaseOptions {
  userId: string;
  itemId: string;
  shop: ShopConfig;
  economy: EconomyConfig;
  /** rôles Discord du membre */
  roleIds?: string[];
  now?: Date;
}

export interface PurchaseResult {
  ok: boolean;
  error?: string;
  item?: ShopItem;
  total?: number;
  /** rôle Discord à attribuer (couche bot) */
  grantRoleId?: string;
  /** durée du rôle en heures (0 = permanent) */
  grantRoleHours?: number;
  message?: string;
}

export function purchaseItem(state: StoreState, input: PurchaseOptions): PurchaseResult {
  const { shop, economy } = input;
  const now = input.now ?? new Date();

  if (!shop.enabled) return { ok: false, error: 'La boutique est fermée.' };
  if (!economy.enabled) return { ok: false, error: 'L’économie est désactivée.' };

  const item = findItem(state, input.itemId);
  if (!item) return { ok: false, error: 'Article introuvable.' };
  if (!item.enabled) return { ok: false, error: 'Cet article n’est plus disponible.' };
  if (item.stock === 0) return { ok: false, error: 'Cet article est épuisé.' };

  const roleIds = input.roleIds ?? [];
  if (shop.requireRoleIds.length && !shop.requireRoleIds.some((roleId) => roleIds.includes(roleId))) {
    return { ok: false, error: 'Tu n’as pas le rôle requis pour acheter ici.' };
  }
  if (shop.minAccountAgeDays > 0 && accountAgeDays(input.userId, now) < shop.minAccountAgeDays) {
    return { ok: false, error: `Ton compte doit avoir au moins ${shop.minAccountAgeDays} jour(s).` };
  }

  const account = ensureAccount(state, input.userId);
  const owned = account.items.filter((entry) => entry.itemId === item.id).length;
  const limit = item.maxPerUser > 0 ? item.maxPerUser : shop.defaultMaxPerUser;
  if (limit > 0 && owned >= limit) {
    return { ok: false, error: `Tu possèdes déjà le maximum autorisé (${limit}).` };
  }

  const lastPurchase = account.cooldowns.shop;
  if (shop.cooldownSeconds > 0 && lastPurchase) {
    const wait = new Date(lastPurchase).getTime() + shop.cooldownSeconds * 1000 - now.getTime();
    if (wait > 0) return { ok: false, error: `Patience : prochain achat dans ${Math.ceil(wait / 1000)} s.` };
  }

  const { price, tax, total } = effectivePrice(item, shop, now);
  const paid = debit(account, economy, total, 'shop', `Achat : ${item.name}`, now);
  if (!paid.ok) return { ok: false, error: paid.reason ?? 'Solde insuffisant.' };

  // quêtes : dépenser de l’argent fait avancer les quêtes « spend_money »
  trackQuest(state, account, economy, 'spend_money', total, now);

  if (item.stock > 0) item.stock = Math.max(0, item.stock - 1);
  account.cooldowns.shop = now.toISOString();

  const expiresAt = item.durationHours > 0
    ? new Date(now.getTime() + item.durationHours * 3_600_000).toISOString()
    : undefined;
  account.items.push({
    itemId: item.id,
    name: item.name,
    quantity: 1,
    boughtAt: now.toISOString(),
    expiresAt,
    effect: item.type,
    effectValue: item.effectValue,
    paid: total,
  });

  // effets immédiats
  if (item.type === 'shield' && item.durationHours > 0) {
    const until = new Date(now.getTime() + item.durationHours * 3_600_000).toISOString();
    if (!account.shieldUntil || new Date(account.shieldUntil).getTime() < new Date(until).getTime()) {
      account.shieldUntil = until;
    }
  }

  state.purchases.unshift({
    id: randomUUID(),
    itemId: item.id,
    itemName: item.name,
    userId: input.userId,
    price,
    tax,
    at: now.toISOString(),
  });
  if (state.purchases.length > 300) state.purchases = state.purchases.slice(0, 300);

  return {
    ok: true,
    item,
    total,
    grantRoleId: item.type === 'role' || item.type === 'income' ? item.roleId : undefined,
    grantRoleHours:
      item.type === 'role' || item.type === 'income'
        ? (item.durationHours > 0 ? item.durationHours : shop.roleDurationDays * 24)
        : undefined,
    message: `${item.emoji} **${item.name}** acheté pour ${formatMoney(economy, total)}.`,
  };
}

export interface ResellResult {
  ok: boolean;
  error?: string;
  amount?: number;
  item?: ShopItem;
  message?: string;
}

export function resellItem(
  state: StoreState,
  userId: string,
  itemId: string,
  config: ShopConfig,
  economy: EconomyConfig,
  now: Date = new Date(),
): ResellResult {
  if (!config.allowResell) return { ok: false, error: 'La revente est désactivée.' };
  const account = ensureAccount(state, userId);
  const index = account.items.findIndex((entry) => entry.itemId === itemId || entry.name.toLowerCase() === itemId.toLowerCase());
  if (index === -1) return { ok: false, error: 'Tu ne possèdes pas cet article.' };
  const entry = account.items[index];
  if (entry.effect === 'role' || entry.effect === 'income') {
    return { ok: false, error: 'Un rôle acheté ne se revend pas.' };
  }

  const source = state.shopItems.find((item) => item.id === entry.itemId);
  const base = entry.paid ?? source?.price ?? 0;
  const amount = Math.round((base * config.resellPercent) / 100);
  account.items.splice(index, 1);
  if (amount > 0) {
    credit(account, economy, amount, 'resell', `Revente : ${entry.name}`, now);
  } else {
    pushTransaction(account, economy, { type: 'resell', amount: 0, label: `Revente : ${entry.name}` }, now);
  }
  return { ok: true, amount, message: `${entry.name} revendu pour ${formatMoney(economy, amount)}.` };
}

/** Réassort automatique (appelé par le planificateur). */
export function restock(state: StoreState, config: ShopConfig): number {
  if (!config.restockEnabled) return 0;
  let restocked = 0;
  for (const item of state.shopItems) {
    if (item.initialStock <= 0) continue;
    const target = Math.round((item.initialStock * config.restockPercent) / 100);
    if (item.stock < target) {
      item.stock = target;
      restocked += 1;
    }
  }
  return restocked;
}
