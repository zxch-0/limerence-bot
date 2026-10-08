import type { EconomyAccount, EconomyConfig, StoreState } from '../types';
import { credit, formatMoney, type Rng } from './core';
import { awardXp } from './core';
import { pruneExpiredItems } from './actions';

// ============================================================
//  Revenus des rôles achetés en boutique
//
//  Un article de type « income » (rôle de revenu) génère un revenu
//  passif : tant que l'objet est dans l'inventaire (et non expiré),
//  un montant par heure s'accumule. Le membre le réclame avec
//  /income : le montant est alors crédité sur son compte.
// ============================================================

/** Revenu horaire total généré par les rôles de revenu actifs du compte. */
export function incomePerHour(account: EconomyAccount, now: Date = new Date()): number {
  let total = 0;
  for (const item of account.items) {
    if (item.effect !== 'income') continue;
    if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) continue;
    total += item.effectValue ?? 0;
  }
  return total;
}

/**
 * Revenu accumulé mais pas encore réclamé. Calculé à la volée à partir
 * du temps écoulé depuis le dernier claim (ou l'achat), plafonné par
 * `incomeMaxAccruedHours` pour ne pas récompenser l'inactivité infinie.
 */
export function accruedIncome(account: EconomyAccount, config: EconomyConfig, now: Date = new Date()): number {
  if (!config.incomeEnabled) return 0;
  const capHours = Math.max(1, config.incomeMaxAccruedHours);
  const since = account.lastIncomeClaimAt ? new Date(account.lastIncomeClaimAt).getTime() : null;
  let total = 0;
  for (const item of account.items) {
    if (item.effect !== 'income') continue;
    if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) continue;
    const perHour = item.effectValue ?? 0;
    if (perHour <= 0) continue;
    const start = Math.max(
      new Date(item.boughtAt).getTime(),
      since ?? 0,
    );
    let hours = (now.getTime() - start) / 3_600_000;
    if (item.expiresAt) {
      hours = Math.min(hours, (new Date(item.expiresAt).getTime() - start) / 3_600_000);
    }
    hours = Math.max(0, Math.min(hours, capHours));
    total += perHour * hours;
  }
  return total;
}

export interface IncomeClaim {
  ok: boolean;
  amount: number;
  perHour: number;
  reason?: string;
}

/**
 * Réclame le revenu accumulé : crédite le compte, réinitialise le compteur
 * et attribue l’XP correspondante. Le suivi des quêtes est assuré par
 * l’appelant (qui connaît le contexte « gain d’argent »).
 */
export function claimIncome(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  now: Date = new Date(),
  rng: Rng = Math.random,
): IncomeClaim {
  void state;
  void rng;
  if (!config.enabled) return { ok: false, amount: 0, perHour: 0, reason: 'L’économie est désactivée.' };
  if (!config.incomeEnabled) return { ok: false, amount: 0, perHour: 0, reason: 'Les revenus de rôles sont désactivés.' };
  pruneExpiredItems(account, now);
  const perHour = incomePerHour(account, now);
  const pending = accruedIncome(account, config, now);
  const amount = Math.round(pending);
  if (amount <= 0) {
    return {
      ok: false,
      amount: 0,
      perHour,
      reason:
        perHour > 0
          ? 'Aucun revenu accumulé pour le moment : reviens plus tard.'
          : 'Tu n’as aucun rôle de revenu : achète-en un avec /jobs !',
    };
  }
  const paid = credit(account, config, amount, 'income', 'Revenu des rôles', now);
  if (!paid.ok) return { ok: false, amount: 0, perHour, reason: paid.reason ?? 'Impossible de te payer.' };
  account.lastIncomeClaimAt = now.toISOString();
  account.incomeTotal += paid.amount;
  awardXp(account, config, paid.amount, now);
  return { ok: true, amount: paid.amount, perHour };
}

/** Détail lisible des rôles de revenu actifs d’un compte. */
export function incomeBreakdown(account: EconomyAccount, now: Date = new Date()): Array<{ name: string; perHour: number; expiresAt?: string }> {
  const rows: Array<{ name: string; perHour: number; expiresAt?: string }> = [];
  for (const item of account.items) {
    if (item.effect !== 'income') continue;
    if (item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime()) continue;
    rows.push({ name: item.name, perHour: item.effectValue ?? 0, expiresAt: item.expiresAt });
  }
  return rows;
}

/** Formate le revenu horaire (ex: « 120 🪙 Pièces / heure »). */
export function formatIncomePerHour(config: EconomyConfig, perHour: number): string {
  return `${formatMoney(config, perHour)} / heure`;
}
