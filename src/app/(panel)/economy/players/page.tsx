import Link from 'next/link';
import { ActionForm, InlineAction } from '@/components/ActionForm';
import { Card, EmptyState, PageHeader, Pill, shortDate } from '@/components/ui';
import { formatMoney, hasShield, isJailed, moneySupply, totalBalance } from '@/lib/economy/core';
import { getContext } from '@/lib/panel';
import {
  adjustAccountAction,
  clearRestrictionsAction,
  deleteAccountAction,
  removeItemAction,
  resetAccountAction,
  resetAccountQuickAction,
  wipeEconomyAction,
} from '../../actions/economy';

export const dynamic = 'force-dynamic';

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { state } = await getContext();
  const config = state.config.economy;
  const query = (q ?? '').trim();

  const accounts = Object.values(state.accounts)
    .filter((account) => !query || account.userId.includes(query))
    .sort((a, b) => totalBalance(b) - totalBalance(a));

  const supply = moneySupply(state);

  return (
    <>
      <PageHeader
        title="Comptes des membres"
        description="Consulte, ajuste ou réinitialise l'argent, la banque et l'inventaire d'un membre."
        action={
          <Link className="btn btn-ghost" href="/economy">
            ← Configuration
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Mini label="Comptes" value={String(accounts.length)} />
        <Mini label="En poche" value={formatMoney(config, supply.cash)} />
        <Mini label="En banque" value={formatMoney(config, supply.bank)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card title="Membres" subtitle="Triés par solde total (poche + banque)">
          <form className="mb-3" method="get">
            <div className="flex gap-2">
              <input
                type="search"
                name="q"
                className="field"
                placeholder="Rechercher un identifiant Discord"
                defaultValue={query}
              />
              <button className="btn btn-ghost" type="submit">
                Filtrer
              </button>
            </div>
          </form>

          {accounts.length === 0 ? (
            <EmptyState>
              Aucun compte {query ? `pour « ${query} »` : ''} — les comptes sont créés dès qu’un membre gagne ou dépense.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th>Poche</th>
                    <th>Banque</th>
                    <th>Total</th>
                    <th>État</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.slice(0, 100).map((account) => (
                    <tr key={account.userId}>
                      <td className="mono text-xs">{account.userId}</td>
                      <td>{formatMoney(config, account.cash)}</td>
                      <td>{formatMoney(config, account.bank)}</td>
                      <td className="text-mint">{formatMoney(config, totalBalance(account))}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {isJailed(account) ? <Pill tone="error">en prison</Pill> : null}
                          {hasShield(account) ? <Pill tone="ok">bouclier</Pill> : null}
                          {account.items.length ? <Pill tone="info">{account.items.length} objet(s)</Pill> : null}
                          {account.gamesPlayed ? <Pill tone="muted">{account.gamesPlayed} partie(s)</Pill> : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <InlineAction
                            action={clearRestrictionsAction}
                            fields={{ userId: account.userId }}
                            className="btn btn-ghost btn-xs"
                          >
                            Libérer
                          </InlineAction>
                          <InlineAction
                            action={resetAccountQuickAction}
                            fields={{ userId: account.userId }}
                            className="btn btn-ghost btn-xs"
                            confirm="Réinitialiser ce compte (argent de départ, historique effacé) ?"
                          >
                            Réinitialiser
                          </InlineAction>
                          <InlineAction
                            action={deleteAccountAction}
                            fields={{ userId: account.userId }}
                            className="btn btn-danger btn-xs"
                            confirm="Supprimer définitivement ce compte ?"
                          >
                            Supprimer
                          </InlineAction>
                        </div>
                        {account.items.length ? (
                          <div className="mt-1 space-y-1">
                            {account.items.map((item) => (
                              <div key={`${account.userId}-${item.itemId}-${item.boughtAt}`} className="flex items-center gap-1">
                                <span className="text-xs text-white/50">
                                  {item.name} ×{item.quantity}
                                </span>
                                <InlineAction
                                  action={removeItemAction}
                                  fields={{ userId: account.userId, itemId: item.itemId }}
                                  className="btn btn-ghost btn-xs"
                                  confirm={`Retirer ${item.name} de l’inventaire ?`}
                                >
                                  ✕
                                </InlineAction>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {accounts.length > 100 ? (
            <p className="mt-3 text-xs text-white/35">
              {accounts.length - 100} compte(s) supplémentaire(s) non affiché(s) — utilise la recherche.
            </p>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card title="Ajuster un compte" subtitle="Donner, retirer ou fixer un solde">
            <ActionForm action={adjustAccountAction} submitLabel="Appliquer" className="space-y-3">
              <div>
                <label className="label">Membre (mention ou identifiant)</label>
                <input name="userId" className="field mono" placeholder="123456789012345678" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Opération</label>
                  <select name="mode" className="field" defaultValue="give">
                    <option value="give">Donner</option>
                    <option value="remove">Retirer</option>
                    <option value="set">Fixer à</option>
                  </select>
                </div>
                <div>
                  <label className="label">Destination</label>
                  <select name="pocket" className="field" defaultValue="cash">
                    <option value="cash">Poche</option>
                    <option value="bank">Banque</option>
                    <option value="both">Les deux</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Montant</label>
                <input name="amount" type="number" min={0} className="field" defaultValue={1000} />
              </div>
              <div>
                <label className="label">Motif (journal)</label>
                <input name="reason" className="field" defaultValue="Ajustement depuis le panel" />
              </div>
            </ActionForm>
          </Card>

          <Card title="Réinitialiser un compte" subtitle="Par identifiant">
            <ActionForm action={resetAccountAction} submitLabel="Réinitialiser" className="space-y-3">
              <input name="userId" className="field mono" placeholder="identifiant Discord" required />
            </ActionForm>
          </Card>

          <Card title="Zone sensible" subtitle="Actions irréversibles">
            <ActionForm action={wipeEconomyAction} submitLabel="Remettre l’économie à zéro" className="space-y-2">
              <p className="text-xs text-white/45">
                Supprime tous les comptes, l’historique des transactions et les inventaires.
                La configuration est conservée.
              </p>
            </ActionForm>
          </Card>
        </div>
      </div>

      <p className="mt-6 text-xs text-white/35">
        Dernière activité : {accounts[0] ? shortDate(accounts[0].updatedAt) : '—'} · journal conservé sur{' '}
        {config.historySize} transaction(s) par membre.
      </p>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl border border-line p-4">
      <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
