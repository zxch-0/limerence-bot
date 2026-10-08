import { randomUUID } from 'node:crypto';
import type { EconomyAccount, EconomyConfig, LotteryDraw, LotteryState, StoreState } from '../types';
import { awardXp, credit, debit, formatMoney, type Rng } from './core';

// ============================================================
//  Loterie
//
//  Les membres achètent des tickets ; une part configurable des mises
//  alimente une cagnotte progressive (jackpot) tirée automatiquement
//  toutes les X heures par le planificateur. Sans ticket vendu, le
//  jackpot est reporté au tirage suivant.
// ============================================================

export function ensureLottery(state: StoreState): LotteryState {
  if (!state.meta.lottery) {
    state.meta.lottery = { jackpot: 0, tickets: {}, history: [] };
  }
  return state.meta.lottery;
}

export function totalTickets(lottery: LotteryState): number {
  return Object.values(lottery.tickets).reduce((sum, count) => sum + count, 0);
}

export interface TicketPurchase {
  ok: boolean;
  tickets: number;
  jackpot: number;
  reason?: string;
}

/** Achète `count` tickets : débite le membre et alimente le jackpot. */
export function buyTickets(
  state: StoreState,
  account: EconomyAccount,
  count: number,
  config: EconomyConfig,
  now: Date = new Date(),
): TicketPurchase {
  if (!config.enabled || !config.lotteryEnabled) {
    return { ok: false, tickets: 0, jackpot: 0, reason: 'La loterie est désactivée.' };
  }
  const qty = Math.floor(count);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, tickets: 0, jackpot: 0, reason: 'Nombre de tickets invalide.' };
  }
  const price = qty * Math.max(1, config.lotteryTicketPrice);
  const paid = debit(account, config, price, 'lottery', `Achat de ${qty} ticket(s) de loterie`, now);
  if (!paid.ok) return { ok: false, tickets: 0, jackpot: 0, reason: paid.reason ?? 'Solde insuffisant.' };

  const lottery = ensureLottery(state);
  lottery.tickets[account.userId] = (lottery.tickets[account.userId] ?? 0) + qty;
  account.lotteryTickets += qty;
  const share = Math.round((price * Math.min(100, Math.max(1, config.lotteryJackpotPercent))) / 100);
  lottery.jackpot += share;
  account.updatedAt = now.toISOString();
  return { ok: true, tickets: qty, jackpot: lottery.jackpot };
}

export interface LotteryInfo {
  jackpot: number;
  tickets: number;
  myTickets: number;
  lastDrawAt?: string;
  nextDrawAt?: string;
  history: LotteryDraw[];
}

export function lotteryInfo(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
): LotteryInfo {
  const lottery = state.meta.lottery ?? ensureLottery(state);
  const hours = Math.max(1, config.lotteryDrawEveryHours);
  const last = lottery.lastDrawAt ? new Date(lottery.lastDrawAt).getTime() : 0;
  return {
    jackpot: lottery.jackpot,
    tickets: totalTickets(lottery),
    myTickets: lottery.tickets[account.userId] ?? 0,
    lastDrawAt: lottery.lastDrawAt,
    nextDrawAt: last ? new Date(last + hours * 3_600_000).toISOString() : undefined,
    history: lottery.history,
  };
}

export interface LotteryDrawResult {
  drawn: boolean;
  winnerId: string | null;
  amount: number;
  tickets: number;
  reason?: string;
}

/**
 * Tirage au sort pondéré par le nombre de tickets. Le gagnant remporte
 * la totalité du jackpot ; les tickets sont remis à zéro. Appelé par le
 * planificateur.
 */
export function drawLottery(
  state: StoreState,
  config: EconomyConfig,
  now: Date = new Date(),
  rng: Rng = Math.random,
): LotteryDrawResult {
  const lottery = ensureLottery(state);
  lottery.lastDrawAt = now.toISOString();
  const total = totalTickets(lottery);
  if (total <= 0 || lottery.jackpot <= 0) {
    return { drawn: false, winnerId: null, amount: 0, tickets: total, reason: 'Aucun ticket vendu : le jackpot est reporté.' };
  }

  let roll = rng() * total;
  let winnerId: string | null = null;
  for (const [userId, count] of Object.entries(lottery.tickets)) {
    roll -= count;
    if (roll < 0) {
      winnerId = userId;
      break;
    }
  }
  if (!winnerId) {
    const entries = Object.entries(lottery.tickets);
    winnerId = entries.length ? entries[entries.length - 1][0] : null;
  }
  if (!winnerId) {
    return { drawn: false, winnerId: null, amount: 0, tickets: total, reason: 'Aucun gagnant.' };
  }

  const amount = lottery.jackpot;
  const draw: LotteryDraw = {
    id: randomUUID(),
    at: now.toISOString(),
    winnerId,
    amount,
    tickets: total,
  };
  lottery.history.unshift(draw);
  lottery.history = lottery.history.slice(0, 20);
  lottery.jackpot = 0;
  lottery.tickets = {};
  for (const holder of Object.values(state.accounts)) holder.lotteryTickets = 0;

  const account = state.accounts[winnerId];
  if (account) {
    credit(account, config, amount, 'jackpot', 'Jackpot de la loterie', now);
    account.jackpotWins += 1;
    account.updatedAt = now.toISOString();
    awardXp(account, config, amount, now);
  }
  return { drawn: true, winnerId, amount, tickets: total };
}

/** Formate le jackpot pour l’affichage. */
export function formatJackpot(config: EconomyConfig, amount: number): string {
  return formatMoney(config, amount);
}
