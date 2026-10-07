'use server';

import { sanitizeItemInput, sortedItems, restock } from '@/lib/shop/items';
import { addLog } from '@/lib/logs';
import { getState, updateState } from '@/lib/store';
import { SHOP_ITEM_TYPES, type ActionState, type ShopItemType } from '@/lib/types';
import {
  currentAdmin,
  fail,
  int,
  NOT_AUTHORIZED,
  ok,
  refreshPanel,
  snowflake,
  str,
} from '@/lib/panelActions';

// ============================================================
//  Boutique — articles éditables depuis le panel.
// ============================================================

export async function saveShopItemAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const itemId = str(formData, 'itemId');
  const type = str(formData, 'type', 'collectible') as ShopItemType;
  if (!SHOP_ITEM_TYPES.includes(type)) return fail('Type d’article inconnu.');

  const input = {
    name: str(formData, 'name'),
    emoji: str(formData, 'emoji', '🛍️'),
    description: str(formData, 'description'),
    price: int(formData, 'price', 0),
    type,
    roleId: snowflake(formData, 'roleId'),
    effectValue: int(formData, 'effectValue', 0),
    durationHours: int(formData, 'durationHours', 0),
    stock: formData.get('stock') === null ? -1 : int(formData, 'stock', -1),
    maxPerUser: int(formData, 'maxPerUser', 0),
    category: str(formData, 'category', 'Général'),
    enabled: formData.get('enabled') !== 'off',
  };

  const item = sanitizeItemInput(input);
  if ('error' in item) return fail(item.error);

  await updateState((state) => {
    const existing = itemId ? state.shopItems.find((entry) => entry.id === itemId) : undefined;
    if (existing) {
      state.shopItems = state.shopItems.map((entry) =>
        entry.id === existing.id
          ? {
              ...item,
              id: existing.id,
              createdAt: existing.createdAt,
              position: existing.position,
              stock: item.stock,
              initialStock: item.stock,
            }
          : entry,
      );
      return;
    }
    item.position = state.shopItems.length;
    state.shopItems.push(item);
  });

  await addLog({
    level: 'info',
    source: 'panel',
    action: itemId ? 'Article de boutique modifié' : 'Article de boutique créé',
    detail: `${item.emoji} ${item.name} — ${item.price} (${admin.username})`,
  });
  refreshPanel();
  return ok(itemId ? `« ${item.name} » mis à jour.` : `« ${item.name} » ajouté à la boutique.`);
}

export async function deleteShopItemAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const itemId = str(formData, 'itemId');
  if (!itemId) return;
  let name = itemId;
  await updateState((state) => {
    const found = state.shopItems.find((entry) => entry.id === itemId);
    if (!found) return;
    name = found.name;
    state.shopItems = state.shopItems.filter((entry) => entry.id !== itemId);
  });
  await addLog({ level: 'warn', source: 'panel', action: 'Article de boutique supprimé', detail: `${name} par ${admin.username}` });
  refreshPanel();
}

export async function toggleShopItemAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const itemId = str(formData, 'itemId');
  if (!itemId) return;
  await updateState((state) => {
    const found = state.shopItems.find((entry) => entry.id === itemId);
    if (found) found.enabled = !found.enabled;
  });
  refreshPanel();
}

/** Réassort immédiat (même logique que le planificateur). */
export async function restockNowAction(): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const state = await getState();
  let filled = 0;
  await updateState((next) => {
    filled = restock(next, next.config.shop);
    next.meta.lastRestockAt = new Date().toISOString();
  });
  await addLog({ level: 'info', source: 'panel', action: 'Réassort manuel de la boutique', detail: `${filled} article(s) — ${admin.username}` });
  refreshPanel();
  return ok(filled ? `${filled} article(s) réapprovisionné(s).` : 'Aucun stock à réapprovisionner.');
}

/** Déplace un article dans la vitrine. */
export async function moveShopItemAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const itemId = str(formData, 'itemId');
  const direction = str(formData, 'direction');
  if (!itemId || !direction) return;

  await updateState((state) => {
    const items = sortedItems(state);
    const index = items.findIndex((entry) => entry.id === itemId);
    if (index < 0) return;
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= items.length) return;
    const a = items[index];
    const b = items[swapWith];
    const position = a.position;
    a.position = b.position;
    b.position = position;
  });
  refreshPanel();
}

/** Vide l'historique des achats. */
export async function clearPurchasesAction(): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  await updateState((state) => {
    state.purchases = [];
  });
  await addLog({ level: 'warn', source: 'panel', action: 'Historique des achats vidé', detail: admin.username });
  refreshPanel();
}
