import type { EconomyAccount, EconomyConfig, MarketState, StockHolding, StoreState } from '../types';
import { awardXp, credit, debit, formatMoney, type Rng } from './core';

// ============================================================
//  Bourse (actions fictives)
//
//  Les symboles sont définis dans la configuration (SYMBOLE:prix de
//  départ). Le planificateur fait fluctuer les cours (random walk
//  borné) ; les membres achètent et revendent avec /bourse.
// ============================================================

export interface MarketSymbol {
  symbol: string;
  name: string;
  startPrice: number;
}

/** Parse la liste configurée (« SYMBOLE:prix », ex. « LMC:100 »). */
export function parseMarketSymbols(raw: readonly string[]): MarketSymbol[] {
  const symbols: MarketSymbol[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const [symbolRaw, priceRaw] = String(entry).split(':');
    const symbol = symbolRaw.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(symbol) || seen.has(symbol)) continue;
    const startPrice = Math.round(Number(priceRaw));
    if (!Number.isFinite(startPrice) || startPrice <= 0) continue;
    seen.add(symbol);
    symbols.push({ symbol, name: symbol, startPrice });
  }
  return symbols;
}

export const FALLBACK_SYMBOLS: MarketSymbol[] = [
  { symbol: 'LMC', name: 'LimerCoin', startPrice: 100 },
  { symbol: 'DSO', name: 'Discordium', startPrice: 250 },
  { symbol: 'CRY', name: 'Cryptal', startPrice: 80 },
  { symbol: 'GLD', name: 'Goldmium', startPrice: 500 },
];

export function marketSymbols(config: EconomyConfig): MarketSymbol[] {
  const parsed = parseMarketSymbols(config.marketSymbols);
  return parsed.length ? parsed : FALLBACK_SYMBOLS;
}

/** Initialise (ou migre) l’état boursier depuis la configuration. */
export function ensureMarket(state: StoreState, config: EconomyConfig): MarketState {
  if (!state.meta.market) {
    state.meta.market = { prices: {}, history: {} };
  }
  const market = state.meta.market;
  const symbols = marketSymbols(config);
  for (const { symbol, startPrice } of symbols) {
    if (!Number.isFinite(market.prices[symbol]) || market.prices[symbol] <= 0) {
      market.prices[symbol] = startPrice;
    }
    if (!Array.isArray(market.history[symbol])) market.history[symbol] = [];
  }
  // symboles retirés de la configuration : cours conservé mais plus suivi
  return market;
}

export function priceOf(market: MarketState, symbol: string): number | null {
  const price = market.prices[symbol];
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Fait fluctuer les cours (random walk borné entre 10 % et 1000 % du
 * prix de départ). Appelé par le planificateur. Renvoie les variations.
 */
export function tickMarket(
  state: StoreState,
  config: EconomyConfig,
  now: Date = new Date(),
  rng: Rng = Math.random,
): Array<{ symbol: string; price: number; changePercent: number }> {
  const market = ensureMarket(state, config);
  market.lastTickAt = now.toISOString();
  const volatility = Math.min(100, Math.max(0, config.marketVolatilityPercent)) / 100;
  const moves: Array<{ symbol: string; price: number; changePercent: number }> = [];
  for (const { symbol, startPrice } of marketSymbols(config)) {
    const current = market.prices[symbol];
    if (!Number.isFinite(current) || current <= 0) continue;
    const delta = (rng() * 2 - 1) * volatility;
    let next = current * (1 + delta);
    next = Math.max(startPrice * 0.1, Math.min(startPrice * 10, next));
    next = Math.round(next * 100) / 100;
    const changePercent = current > 0 ? ((next - current) / current) * 100 : 0;
    market.prices[symbol] = next;
    const history = market.history[symbol] ?? [];
    history.push(next);
    market.history[symbol] = history.slice(-50);
    moves.push({ symbol, price: next, changePercent });
  }
  return moves;
}

/** Variation entre le dernier cours et le précédent (pour l’affichage ▲▼). */
export function changeSinceLastTick(market: MarketState, symbol: string): number | null {
  const history = market.history[symbol];
  if (!history || history.length < 2) return null;
  const last = history[history.length - 1];
  const previous = history[history.length - 2];
  return previous > 0 ? ((last - previous) / previous) * 100 : null;
}

/** Valeur totale du portefeuille au cours actuel. */
export function portfolioValue(account: EconomyAccount, market: MarketState): number {
  let total = 0;
  for (const holding of Object.values(account.stocks)) {
    const price = priceOf(market, holding.symbol);
    if (price !== null) total += holding.qty * price;
  }
  return total;
}

/** Investi total dans le portefeuille (pour le P&L). */
export function portfolioInvested(account: EconomyAccount): number {
  return Object.values(account.stocks).reduce((sum, holding) => sum + holding.invested, 0);
}

export interface StockTrade {
  ok: boolean;
  symbol?: string;
  qty?: number;
  total?: number;
  price?: number;
  reason?: string;
}

/** Achète pour `amount` pièces d’actions `symbol` (frais inclus). */
export function buyStock(
  state: StoreState,
  account: EconomyAccount,
  symbolRaw: string,
  amount: number,
  config: EconomyConfig,
  now: Date = new Date(),
): StockTrade {
  if (!config.enabled || !config.marketEnabled) return { ok: false, reason: 'La bourse est désactivée.' };
  const market = ensureMarket(state, config);
  const symbol = symbolRaw.trim().toUpperCase();
  const price = priceOf(market, symbol);
  if (price === null) return { ok: false, reason: `Symbole inconnu : ${symbol || '?'}.` };

  const value = Math.round(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'Montant invalide.' };
  const fee = Math.round((value * Math.min(20, Math.max(0, config.marketFeePercent))) / 100);
  const total = value + fee;
  const paid = debit(account, config, total, 'stock', `Achat ${symbol} (${value} + ${fee} de frais)`, now);
  if (!paid.ok) return { ok: false, reason: paid.reason ?? 'Solde insuffisant.' };

  const qty = value / price;
  const holding: StockHolding = account.stocks[symbol] ?? { symbol, qty: 0, invested: 0 };
  holding.qty += qty;
  holding.invested += value;
  account.stocks[symbol] = holding;
  account.updatedAt = now.toISOString();
  void state;
  return { ok: true, symbol, qty, total, price };
}

/** Vend `qty` actions (ou toutes si `all`) et crédite le produit moins les frais. */
export function sellStock(
  state: StoreState,
  account: EconomyAccount,
  symbolRaw: string,
  amount: number,
  config: EconomyConfig,
  all = false,
  now: Date = new Date(),
): StockTrade {
  if (!config.enabled || !config.marketEnabled) return { ok: false, reason: 'La bourse est désactivée.' };
  const market = ensureMarket(state, config);
  const symbol = symbolRaw.trim().toUpperCase();
  const holding = account.stocks[symbol];
  const price = priceOf(market, symbol);
  if (!holding || holding.qty <= 0 || price === null) {
    return { ok: false, reason: `Tu ne détiens aucune action ${symbol}.` };
  }

  const qty = all ? holding.qty : Math.min(holding.qty, Math.max(0, amount / price));
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'Quantité invalide.' };

  const gross = qty * price;
  const fee = Math.round((gross * Math.min(20, Math.max(0, config.marketFeePercent))) / 100);
  const net = Math.max(0, Math.round(gross - fee));
  const investedShare = holding.invested * (qty / holding.qty);

  holding.qty -= qty;
  holding.invested = Math.max(0, holding.invested - investedShare);
  if (holding.qty <= 0.000_001) delete account.stocks[symbol];

  const paid = credit(account, config, net, 'stock', `Vente ${symbol} (${qty.toFixed(4)} × ${price})`, now);
  if (!paid.ok) return { ok: false, reason: paid.reason ?? 'Vente impossible.' };

  const pnl = Math.round(net - investedShare);
  account.marketProfit += pnl;
  account.updatedAt = now.toISOString();
  if (net > investedShare) awardXp(account, config, net - investedShare, now);
  void state;
  return { ok: true, symbol, qty, total: net, price };
}

/** Ligne de portefeuille d’un membre (une par symbole détenu). */
export interface PortfolioRow {
  symbol: string;
  qty: number;
  invested: number;
  price: number;
  value: number;
  pnl: number;
}

export function portfolioOf(account: EconomyAccount, market: MarketState): PortfolioRow[] {
  return Object.values(account.stocks)
    .filter((holding) => holding.qty > 0)
    .map((holding) => {
      const price = priceOf(market, holding.symbol) ?? 0;
      const value = holding.qty * price;
      return {
        symbol: holding.symbol,
        qty: holding.qty,
        invested: Math.round(holding.invested),
        price,
        value: Math.round(value),
        pnl: Math.round(value - holding.invested),
      };
    })
    .sort((a, b) => b.value - a.value);
}

/** Formate un prix de manière compacte. */
export function formatPrice(config: EconomyConfig, price: number): string {
  const rounded = Math.round(price * 100) / 100;
  return formatMoney(config, rounded);
}
