'use server';

import { createAccount, ensureAccount, pushTransaction, totalBalance } from '@/lib/economy/core';
import { addLog } from '@/lib/logs';
import { getState, updateState } from '@/lib/store';
import type { ActionState } from '@/lib/types';
import {
  currentAdmin,
  fail,
  int,
  NOT_AUTHORIZED,
  ok,
  parseUserTarget,
  refreshPanel,
  str,
} from '@/lib/panelActions';

// ============================================================
//  Actions d'économie du panel : ajuster, réinitialiser et
//  nettoyer les comptes des membres.
// ============================================================

function targetId(formData: FormData): string | null {
  const raw = str(formData, 'userId');
  if (!raw) return null;
  return parseUserTarget(raw);
}

/** Donne, retire ou fixe le solde d'un membre (poche, banque ou les deux). */
export async function adjustAccountAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const userId = targetId(formData);
  if (!userId) return fail('Identifiant Discord invalide (mention, identifiant numérique).');

  const mode = str(formData, 'mode', 'give');
  const pocket = str(formData, 'pocket', 'cash');
  const amount = Math.abs(int(formData, 'amount', 0));
  const reason = str(formData, 'reason', 'Ajustement depuis le panel');

  if (mode !== 'set' && amount <= 0) return fail('Le montant doit être supérieur à zéro.');

  const state = await getState();
  const config = state.config.economy;
  let summary = '';

  await updateState((next) => {
    const account = ensureAccount(next, userId);
    const before = totalBalance(account);

    const apply = (target: 'cash' | 'bank') => {
      if (mode === 'set') account[target] = amount;
      else if (mode === 'give') account[target] += amount;
      else account[target] = Math.max(0, account[target] - amount);
    };

    if (pocket === 'both') {
      apply('cash');
      apply('bank');
    } else {
      apply(pocket === 'bank' ? 'bank' : 'cash');
    }

    const after = totalBalance(account);
    account.updatedAt = new Date().toISOString();
    pushTransaction(account, config, { type: 'admin', amount: after - before, label: reason });
    summary = `Solde ${before} → ${after} ${config.currencyPlural.toLowerCase()}`;
  });

  await addLog({ level: 'economy', source: 'panel', action: summary, detail: `${userId} — ${reason} (${admin.username})` });
  refreshPanel();
  return ok(summary);
}

/** Remet un compte à son état initial (argent de départ). */
export async function resetAccountAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const userId = targetId(formData);
  if (!userId) return fail('Identifiant Discord invalide.');

  await updateState((state) => {
    const fresh = createAccount(userId, state.config.economy);
    pushTransaction(fresh, state.config.economy, { type: 'reset', amount: 0, label: 'Compte réinitialisé depuis le panel' });
    state.accounts[userId] = fresh;
  });

  await addLog({ level: 'warn', source: 'panel', action: 'Compte d’économie réinitialisé', detail: `${userId} par ${admin.username}` });
  refreshPanel();
  return ok(`Compte ${userId} remis à zéro.`);
}

/** Variante « bouton de liste » : réinitialise un compte sans retour visuel. */
export async function resetAccountQuickAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const userId = targetId(formData);
  if (!userId) return;
  await updateState((state) => {
    const fresh = createAccount(userId, state.config.economy);
    pushTransaction(fresh, state.config.economy, { type: 'reset', amount: 0, label: 'Compte réinitialisé depuis le panel' });
    state.accounts[userId] = fresh;
  });
  await addLog({ level: 'warn', source: 'panel', action: 'Compte d’économie réinitialisé', detail: `${userId} par ${admin.username}` });
  refreshPanel();
}

/** Supprime entièrement le compte (argent, historique, inventaire). */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const userId = targetId(formData);
  if (!userId) return;
  await updateState((state) => {
    delete state.accounts[userId];
  });
  await addLog({ level: 'warn', source: 'panel', action: 'Compte d’économie supprimé', detail: `${userId} par ${admin.username}` });
  refreshPanel();
}

/** Libère un membre de prison et efface ses temps de recharge. */
export async function clearRestrictionsAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const userId = targetId(formData);
  if (!userId) return;
  await updateState((state) => {
    const account = state.accounts[userId];
    if (!account) return;
    account.jailUntil = undefined;
    account.shieldUntil = undefined;
    account.cooldowns = {};
    account.lossStreak = 0;
  });
  await addLog({ level: 'info', source: 'panel', action: 'Restrictions levées', detail: `${userId} par ${admin.username}` });
  refreshPanel();
}

/** Retire un objet de l'inventaire d'un membre (remboursement optionnel). */
export async function removeItemAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const userId = targetId(formData);
  const itemId = str(formData, 'itemId');
  if (!userId || !itemId) return;
  const refund = formData.get('refund') === 'on';

  await updateState((state) => {
    const account = state.accounts[userId];
    if (!account) return;
    const index = account.items.findIndex((item) => item.itemId === itemId);
    if (index < 0) return;
    const [removed] = account.items.splice(index, 1);
    if (refund && removed.paid) {
      account.bank += removed.paid;
      pushTransaction(account, state.config.economy, {
        type: 'resell',
        amount: removed.paid,
        label: `Retrait de ${removed.name} depuis le panel`,
      });
    }
  });
  await addLog({
    level: 'economy',
    source: 'panel',
    action: 'Objet retiré de l’inventaire',
    detail: `${userId} — ${itemId}${refund ? ' (remboursé)' : ''}`,
  });
  refreshPanel();
}

/** Efface tous les comptes (l'économie repart de zéro). */
export async function wipeEconomyAction(): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const state = await getState();
  const count = Object.keys(state.accounts).length;
  await updateState((next) => {
    next.accounts = {};
    next.meta.lastInterestAt = undefined;
    next.meta.lastDropAt = undefined;
    next.meta.activeDrop = undefined;
  });
  await addLog({
    level: 'warn',
    source: 'panel',
    action: 'Économie remise à zéro',
    detail: `${count} compte(s) supprimé(s) par ${admin.username}`,
  });
  refreshPanel();
  return ok(`${count} compte(s) supprimé(s).`);
}
