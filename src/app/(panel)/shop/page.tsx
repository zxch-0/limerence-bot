import Link from 'next/link';
import { ConfigEditor } from '@/components/ConfigEditor';
import { ActionForm, InlineAction } from '@/components/ActionForm';
import { RolePicker } from '@/components/RolePicker';
import { Card, EmptyState, PageHeader, Pill, shortDate } from '@/components/ui';
import { SHOP_FIELDS, SHOP_OPTIONS_COUNT, SHOP_SECTIONS } from '@/lib/shop/config';
import { effectivePrice, sortedItems } from '@/lib/shop/items';
import { formatMoney } from '@/lib/economy/core';
import { getContext } from '@/lib/panel';
import { sectionViews, valuesOf } from '@/lib/panelViews';
import { SHOP_ITEM_TYPE_LABELS, SHOP_ITEM_TYPES, type ShopItemType } from '@/lib/types';
import {
  deleteShopItemAction,
  moveShopItemAction,
  restockNowAction,
  saveShopItemAction,
  toggleShopItemAction,
} from '../actions/shop';
import { resetSectionAction, saveShopConfigAction } from '../actions/config';

export const dynamic = 'force-dynamic';

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const { state, roles } = await getContext();
  const config = state.config.shop;
  const economy = state.config.economy;
  const views = sectionViews(SHOP_FIELDS, SHOP_SECTIONS);
  const items = sortedItems(state);
  const editing = edit ? items.find((item) => item.id === edit) : undefined;

  return (
    <>
      <PageHeader
        title="Boutique"
        description={`${SHOP_OPTIONS_COUNT} options de boutique et un catalogue d’articles entièrement personnalisable.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ActionForm action={restockNowAction} submitLabel="♻️ Réapprovisionner" className="contents" />
            <InlineAction
              action={resetSectionAction}
              fields={{ section: 'shop' }}
              className="btn btn-danger"
              confirm="Remettre les options de boutique aux valeurs par défaut ?"
            >
              Valeurs par défaut
            </InlineAction>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card
          title="Catalogue"
          subtitle="Ordre d’affichage de la vitrine (/shop liste)"
          action={editing ? <Link className="btn btn-ghost btn-xs" href="/shop">Nouvel article</Link> : undefined}
        >
          {items.length === 0 ? (
            <EmptyState>Aucun article : crée le premier avec le formulaire de droite.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Type</th>
                    <th>Prix</th>
                    <th>Stock</th>
                    <th>État</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <p className="text-sm text-white/85">
                          {item.emoji} {item.name}
                        </p>
                        {item.description ? (
                          <p className="text-xs text-white/40">{item.description}</p>
                        ) : null}
                        <p className="text-[11px] text-white/25">{item.category}</p>
                      </td>
                      <td className="text-xs">{SHOP_ITEM_TYPE_LABELS[item.type]}</td>
                      <td className="text-xs">
                        {formatMoney(economy, effectivePrice(item, config).total)}
                        {effectivePrice(item, config).discounted ? (
                          <span className="ml-1 text-white/35 line-through">{formatMoney(economy, item.price)}</span>
                        ) : null}
                      </td>
                      <td className="text-xs">{item.stock < 0 ? 'illimité' : item.stock}</td>
                      <td>
                        {item.enabled ? <Pill tone="ok">en vente</Pill> : <Pill tone="muted">masqué</Pill>}
                        {item.type === 'role' && !item.roleId ? <Pill tone="warn">rôle manquant</Pill> : null}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <Link className="btn btn-ghost btn-xs" href={`/shop?edit=${item.id}`}>
                            Modifier
                          </Link>
                          <InlineAction
                            action={moveShopItemAction}
                            fields={{ itemId: item.id, direction: 'up' }}
                            className="btn btn-ghost btn-xs"
                          >
                            ↑
                          </InlineAction>
                          <InlineAction
                            action={moveShopItemAction}
                            fields={{ itemId: item.id, direction: 'down' }}
                            className="btn btn-ghost btn-xs"
                          >
                            ↓
                          </InlineAction>
                          <InlineAction
                            action={toggleShopItemAction}
                            fields={{ itemId: item.id }}
                            className="btn btn-ghost btn-xs"
                          >
                            {item.enabled ? 'Masquer' : 'Afficher'}
                          </InlineAction>
                          <InlineAction
                            action={deleteShopItemAction}
                            fields={{ itemId: item.id }}
                            className="btn btn-danger btn-xs"
                            confirm={`Supprimer « ${item.name} » de la boutique ?`}
                          >
                            ✕
                          </InlineAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={editing ? `Modifier « ${editing.name} »` : 'Nouvel article'}
          subtitle="Rôle, bouclier, booster de gains ou objet de collection"
        >
          <ActionForm action={saveShopItemAction} submitLabel={editing ? 'Enregistrer' : 'Ajouter'} className="space-y-3">
            {editing ? <input type="hidden" name="itemId" value={editing.id} /> : null}
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <div>
                <label className="label">Emoji</label>
                <input name="emoji" className="field" defaultValue={editing?.emoji ?? '🛍️'} maxLength={8} />
              </div>
              <div>
                <label className="label">Nom</label>
                <input name="name" className="field" defaultValue={editing?.name ?? ''} required maxLength={60} />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea name="description" className="field min-h-20" rows={2} maxLength={200} defaultValue={editing?.description ?? ''} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Prix</label>
                <input name="price" type="number" min={1} className="field" defaultValue={editing?.price ?? 1000} required />
              </div>
              <div>
                <label className="label">Type</label>
                <select name="type" className="field" defaultValue={editing?.type ?? 'collectible'}>
                  {SHOP_ITEM_TYPES.map((type: ShopItemType) => (
                    <option key={type} value={type}>
                      {SHOP_ITEM_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Rôle Discord (type « rôle »)</label>
              <RolePicker name="roleId" value={editing?.roleId ?? ''} roles={roles} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Valeur d’effet (%)</label>
                <input name="effectValue" type="number" min={0} className="field" defaultValue={editing?.effectValue ?? 0} />
              </div>
              <div>
                <label className="label">Durée (heures)</label>
                <input name="durationHours" type="number" min={0} className="field" defaultValue={editing?.durationHours ?? 0} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Stock (-1 = illimité)</label>
                <input name="stock" type="number" min={-1} className="field" defaultValue={editing?.stock ?? -1} />
              </div>
              <div>
                <label className="label">Max par membre (0 = config)</label>
                <input name="maxPerUser" type="number" min={0} className="field" defaultValue={editing?.maxPerUser ?? 0} />
              </div>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <input name="category" className="field" defaultValue={editing?.category ?? 'Général'} maxLength={40} />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={editing ? editing.enabled : true}
                className="h-4 w-4 accent-[#c9b8ff]"
              />
              Visible dans la boutique
            </label>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt-5" title="Derniers achats" subtitle={`${state.purchases.length} achat(s) enregistré(s)`}>
        {state.purchases.length === 0 ? (
          <EmptyState>Aucun achat pour le moment.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>Article</th>
                  <th>Prix</th>
                  <th>Taxe</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {state.purchases.slice(0, 30).map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="mono text-xs">{purchase.userId}</td>
                    <td className="text-sm">{purchase.itemName}</td>
                    <td>{formatMoney(economy, purchase.price)}</td>
                    <td className="text-white/50">{formatMoney(economy, purchase.tax)}</td>
                    <td className="text-xs text-white/45">{shortDate(purchase.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <ConfigEditor
          sections={views}
          values={valuesOf(config)}
          action={saveShopConfigAction}
          submitLabel="Enregistrer la boutique"
        />
      </div>
    </>
  );
}
