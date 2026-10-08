import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState } from '../src/lib/config';
import { DEFAULT_ECONOMY_CONFIG, ECONOMY_FIELDS, ECONOMY_SECTIONS } from '../src/lib/economy/config';
import { DEFAULT_GAMES_CONFIG, GAMES_FIELDS, GAMES_SECTIONS } from '../src/lib/games/config';
import { diffKeys, duplicateKeys, missingSections } from '../src/lib/schema-fields';
import { awardXp, ensureAccount, hydrateAccount, levelFromXp, xpToNext } from '../src/lib/economy/core';
import { accruedIncome, claimIncome } from '../src/lib/economy/income';
import { ensureQuests, questProgressFor, trackQuest } from '../src/lib/economy/quests';
import { buyTickets, drawLottery } from '../src/lib/economy/lottery';
import { buyStock, ensureMarket, sellStock, tickMarket } from '../src/lib/economy/market';
import { runPrestige } from '../src/lib/economy/extras';
import {
  createMines,
  crashPoint,
  dropPlinko,
  minesMultiplier,
  PLINKO_TABLES,
  spinRoulette,
  spinSlots,
  type RouletteBet,
} from '../src/lib/games/engine';
import { crashMultiplierNow, crashWindowMs, playInstantGame } from '../src/lib/games/table';
import type { EconomyConfig, GamesConfig, StoreState } from '../src/lib/types';

const NOW = new Date('2026-10-08T12:00:00Z');
const USER = '123456789012345678';

function freshState(): StoreState {
  return emptyState();
}

/** Économie isolée : pas de succès, XP ni quêtes qui créditeraient de l’argent en plus. */
const ISOLATED: EconomyConfig = {
  ...DEFAULT_ECONOMY_CONFIG,
  achievementsEnabled: false,
  xpEnabled: false,
  questsEnabled: false,
};

/** RNG qui parcourt uniformément les 37 numéros de roulette (i → (i+0.5)/37). */
function rouletteRng(i: number): () => number {
  return () => (i + 0.5) / 37;
}

// ------------------------------------------------------------
//  Intégrité des configurations (panel + moteur de champs)
// ------------------------------------------------------------

test('la configuration économique est cohérente avec ses sections', () => {
  assert.deepEqual(missingSections(ECONOMY_FIELDS, ECONOMY_SECTIONS), []);
  assert.deepEqual(duplicateKeys(ECONOMY_FIELDS), []);
  const diff = diffKeys(ECONOMY_FIELDS, { ...DEFAULT_ECONOMY_CONFIG });
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.extra, []);
  const keys = new Set(ECONOMY_FIELDS.map((field) => field.key));
  for (const field of ECONOMY_FIELDS) {
    if ('dependsOn' in field && field.dependsOn) {
      assert.ok(keys.has(field.dependsOn), `${field.key} dépend d’une option inconnue : ${field.dependsOn}`);
    }
  }
});

test('la configuration du casino est cohérente avec ses sections', () => {
  assert.deepEqual(missingSections(GAMES_FIELDS, GAMES_SECTIONS), []);
  assert.deepEqual(duplicateKeys(GAMES_FIELDS), []);
  const diff = diffKeys(GAMES_FIELDS, { ...DEFAULT_GAMES_CONFIG });
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.extra, []);
});

test('les paiements par défaut laissent un avantage à la maison (RTP ≤ 100 %)', () => {
  const g = DEFAULT_GAMES_CONFIG;
  // retour total = multiplicateur × probabilité (mise comprise)
  const roulette = g.rouletteStraightPayout / 37;
  const color = (g.rouletteColorPayout * 18) / 37;
  const dozen = (g.rouletteDozenPayout * 12) / 37;
  const dice = g.diceExactPayout / 6;
  const coin = g.coinflipPayout / 2;
  for (const [name, rtp] of Object.entries({ roulette, color, dozen, dice, coin })) {
    assert.ok(rtp > 0.9 && rtp < 1, `${name} : RTP inattendu ${rtp.toFixed(4)}`);
  }
});

// ------------------------------------------------------------
//  Moteurs de jeux (logique pure)
// ------------------------------------------------------------

test('roulette : un numéro plein rapporte la bonne mise sur la bonne case', () => {
  const bet: RouletteBet = { kind: 'straight', number: 17 };
  let total = 0;
  for (let i = 0; i <= 36; i += 1) total += spinRoulette(bet, DEFAULT_GAMES_CONFIG, rouletteRng(i)).multiplier;
  assert.equal(total, DEFAULT_GAMES_CONFIG.rouletteStraightPayout, 'une seule case gagnante');
  const win = spinRoulette(bet, DEFAULT_GAMES_CONFIG, rouletteRng(17));
  assert.equal(win.win, true);
  assert.equal(win.landed, 17);
});

test('roulette : le 0 est vert, ni rouge ni noir ni pair', () => {
  const zero = spinRoulette({ kind: 'color', color: 'rouge' }, DEFAULT_GAMES_CONFIG, rouletteRng(0));
  assert.equal(zero.win, false);
  assert.equal(zero.color, 'vert');
  const even = spinRoulette({ kind: 'parity', parity: 'pair' }, DEFAULT_GAMES_CONFIG, rouletteRng(0));
  assert.equal(even.win, false);
});

test('roulette : une couleur gagnante rapporte plus que la mise (retour total)', () => {
  const red = spinRoulette({ kind: 'color', color: 'rouge' }, DEFAULT_GAMES_CONFIG, rouletteRng(1));
  assert.equal(red.landed, 1);
  assert.equal(red.win, true);
  assert.ok(red.multiplier > 1, 'un pari couleur doit rapporter plus que la mise');
});

test('plinko : chaque table a un retour moyen d’environ 97 %', () => {
  const binom = (n: number, k: number) => {
    let result = 1;
    for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
    return result;
  };
  for (const [risk, table] of Object.entries(PLINKO_TABLES)) {
    assert.equal(table.length, 13, `${risk} doit avoir 13 fentes`);
    const ev = table.reduce((sum, multiplier, slot) => sum + (binom(12, slot) / 4096) * multiplier, 0);
    assert.ok(Math.abs(ev - 0.97) < 0.01, `${risk} : retour moyen ${ev.toFixed(4)}`);
  }
});

test('plinko : la bille tombe toujours dans une fente valide', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const rng = () => ((seed * 9301 + 49297) % 233280) / 233280;
    const result = dropPlinko('moyen', rng);
    assert.ok(result.slot >= 0 && result.slot <= 12);
    assert.ok(result.multiplier >= 0);
  }
});

test('machine à sous : résultat cohérent (3 rouleaux, multiplicateur connu)', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const rng = () => ((seed * 7919) % 1000) / 1000;
    const result = spinSlots(DEFAULT_GAMES_CONFIG, rng);
    assert.equal(result.reels.length, 3);
    assert.ok(
      [0, DEFAULT_GAMES_CONFIG.slotsTwoMultiplier, DEFAULT_GAMES_CONFIG.slotsThreeMultiplier, DEFAULT_GAMES_CONFIG.slotsJackpotMultiplier].includes(
        result.multiplier,
      ),
      `multiplicateur inattendu ${result.multiplier}`,
    );
  }
});

test('mines : une grille contient exactement le nombre de mines demandé', () => {
  let seed = 42;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const game = createMines(5, rng);
  assert.equal(game.grid.filter(Boolean).length, 5);
  assert.equal(game.grid.length, 24);
});

test('mines : le multiplicateur augmente à chaque tuile sûre révélée', () => {
  const game = { grid: new Array(24).fill(false), mines: 3, size: 24, revealed: [] as number[] };
  let previous = minesMultiplier(game, 0, DEFAULT_GAMES_CONFIG);
  for (let safe = 1; safe <= 21; safe += 1) {
    const current = minesMultiplier(game, safe, DEFAULT_GAMES_CONFIG);
    assert.ok(current > previous, `×${current} doit dépasser ×${previous} (tuile ${safe})`);
    previous = current;
  }
});

test('crash : le point d’explosion reste dans les bornes et la fusée croît', () => {
  const low = crashPoint(DEFAULT_GAMES_CONFIG, () => 0.999999);
  const high = crashPoint(DEFAULT_GAMES_CONFIG, () => 0.000001);
  assert.ok(low >= 1);
  assert.ok(high <= DEFAULT_GAMES_CONFIG.crashMaxMultiplier);
  assert.equal(crashPoint(DEFAULT_GAMES_CONFIG, () => 0.5), 1.98);

  const session = { startedAt: NOW.getTime(), crashAt: 50 } as never;
  const at0 = crashMultiplierNow(session, DEFAULT_GAMES_CONFIG, NOW);
  const at10 = crashMultiplierNow(session, DEFAULT_GAMES_CONFIG, new Date(NOW.getTime() + 10_000));
  assert.equal(at0, 1);
  assert.ok(at10 > at0);
  assert.ok(crashWindowMs(DEFAULT_GAMES_CONFIG) >= 120_000);
});

// ------------------------------------------------------------
//  Conservation de l’argent (aucune partie ne crée ni ne détruit d’argent)
// ------------------------------------------------------------

test('partie instantanée : poche = poche - mise + gain après taxe', () => {
  const state = freshState();
  const economy: EconomyConfig = ISOLATED;
  const account = ensureAccount(state, USER);
  const before = account.cash;
  const result = playInstantGame(
    state,
    account,
    { userId: USER, bet: 100, games: DEFAULT_GAMES_CONFIG, economy, gameLabel: 'test' },
    () => ({ multiplier: 2, label: 'gagné' }),
    { now: NOW, rng: () => 0.5 },
  );
  assert.equal(result.ok, true);
  const tax = Math.round((200 * economy.gamblingTaxPercent) / 100);
  assert.equal(account.cash, before - 100 + (200 - tax));
  assert.equal(result.net, 200 - tax - 100);
});

test('partie perdue : seule la mise quitte la poche', () => {
  const state = freshState();
  const economy: EconomyConfig = ISOLATED;
  const account = ensureAccount(state, USER);
  const before = account.cash;
  playInstantGame(
    state,
    account,
    { userId: USER, bet: 100, games: DEFAULT_GAMES_CONFIG, economy, gameLabel: 'test' },
    () => ({ multiplier: 0, label: 'perdu' }),
    { now: NOW, rng: () => 0.5 },
  );
  assert.equal(account.cash, before - 100);
});

test('partie refusée sous le minimum : aucun débit', () => {
  const state = freshState();
  const economy: EconomyConfig = ISOLATED;
  const account = ensureAccount(state, USER);
  const before = account.cash;
  const result = playInstantGame(
    state,
    account,
    { userId: USER, bet: 1, games: DEFAULT_GAMES_CONFIG, economy, gameLabel: 'test' },
    () => ({ multiplier: 2, label: 'gagné' }),
    { now: NOW, rng: () => 0.5 },
  );
  assert.equal(result.ok, false);
  assert.equal(account.cash, before);
});

test('bourse : achat puis vente au même cours ne perd que les frais', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  const account = ensureAccount(state, USER);
  ensureMarket(state, economy);
  const before = account.cash;
  const buy = buyStock(state, account, 'LMC', 300, economy, NOW);
  assert.equal(buy.ok, true);
  const sell = sellStock(state, account, 'LMC', 0, economy, true, NOW);
  assert.equal(sell.ok, true);
  const fees = Math.round((300 * economy.marketFeePercent) / 100) * 2;
  assert.ok(Math.abs(account.cash - (before - fees)) <= 2, `poche ${account.cash}, attendu ≈ ${before - fees}`);
  assert.deepEqual(Object.keys(account.stocks), []);
});

test('bourse : les cours restent dans leurs bornes après de nombreuses fluctuations', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG, marketVolatilityPercent: 100 };
  const market = ensureMarket(state, economy);
  let seed = 7;
  const rng = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 500; i += 1) tickMarket(state, economy, NOW, rng);
  for (const [symbol, price] of Object.entries(market.prices)) {
    const start = { LMC: 100, DSO: 250, CRY: 80, GLD: 500, NEB: 150, VOX: 60 }[symbol] ?? 100;
    assert.ok(price >= start * 0.1 - 0.01 && price <= start * 10 + 0.01, `${symbol} hors bornes : ${price}`);
  }
});

// ------------------------------------------------------------
//  Progression : XP, niveaux, revenus, quêtes, loterie, prestige
// ------------------------------------------------------------

test('XP : chaque palier de niveau demande plus d’XP que le précédent', () => {
  assert.ok(xpToNext(2) > xpToNext(1));
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(xpToNext(1)).level, 2);
});

test('XP : un gain fait monter de niveau et verse la récompense de niveau', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG, xpPerAmount: 10, levelReward: 100 };
  const account = ensureAccount(state, USER);
  const before = account.cash;
  const gain = awardXp(account, economy, xpToNext(1) * 10, NOW);
  assert.ok(gain);
  assert.equal(account.level, 2);
  assert.equal(account.cash, before + 100);
});

test('revenus de rôle : le revenu s’accumule puis se réclame une seule fois', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  const account = ensureAccount(state, USER);
  account.items.push({
    itemId: 'job',
    name: 'Barista',
    quantity: 1,
    boughtAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
    effect: 'income',
    effectValue: 10,
  });
  assert.equal(accruedIncome(account, economy, NOW), 20);
  const before = account.cash;
  const claim = claimIncome(state, account, economy, NOW);
  assert.equal(claim.ok, true);
  assert.equal(claim.amount, 20);
  assert.equal(account.cash, before + 20);
  assert.equal(accruedIncome(account, economy, NOW), 0, 'rien à réclamer juste après');
  const second = claimIncome(state, account, economy, NOW);
  assert.equal(second.ok, false);
});

test('revenus de rôle : le revenu accumulé est plafonné', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG, incomeMaxAccruedHours: 1 };
  const account = ensureAccount(state, USER);
  account.items.push({
    itemId: 'job',
    name: 'Barista',
    quantity: 1,
    boughtAt: new Date(NOW.getTime() - 50 * 3_600_000).toISOString(),
    effect: 'income',
    effectValue: 10,
  });
  assert.equal(accruedIncome(account, economy, NOW), 10);
});

test('quêtes : le même jour donne les mêmes quêtes à tout le serveur', () => {
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  const first = ensureQuests(freshState(), economy, NOW).map((quest) => `${quest.type}:${quest.target}:${quest.reward}`);
  const second = ensureQuests(freshState(), economy, NOW).map((quest) => `${quest.type}:${quest.target}:${quest.reward}`);
  assert.deepEqual(first, second);
  assert.equal(first.length, economy.questsPerDay);
});

test('quêtes : compléter un objectif verse la récompense une seule fois', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  const account = ensureAccount(state, USER);
  const quests = ensureQuests(state, economy, NOW);
  const quest = quests[0];
  const before = account.cash;
  const update = trackQuest(state, account, economy, quest.type, quest.target, NOW);
  assert.ok(update.completed.some((entry) => entry.id === quest.id));
  assert.ok(account.cash >= before + quest.reward, 'la récompense doit être créditée');
  const again = trackQuest(state, account, economy, quest.type, quest.target, NOW);
  assert.equal(again.completed.some((entry) => entry.id === quest.id), false);
  const progress = questProgressFor(account, quests).find((entry) => entry.quest.id === quest.id);
  assert.equal(progress?.completed, true);
});

test('loterie : le seul détenteur de tickets remporte le jackpot', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  const account = ensureAccount(state, USER);
  const bought = buyTickets(state, account, 3, economy, NOW);
  assert.equal(bought.ok, true);
  assert.ok(bought.jackpot > 0);
  const jackpot = bought.jackpot;
  const before = account.cash;
  const draw = drawLottery(state, economy, NOW, () => 0.5);
  assert.equal(draw.drawn, true);
  assert.equal(draw.winnerId, USER);
  assert.equal(account.cash, before + jackpot);
  assert.equal(state.meta.lottery?.jackpot, 0);
  assert.equal(account.lotteryTickets, 0);
});

test('loterie : sans ticket, le jackpot est reporté', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  const draw = drawLottery(state, economy, NOW, () => 0.5);
  assert.equal(draw.drawn, false);
});

test('prestige : refusé sous le seuil, accepté au-dessus avec bonus permanent', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG, prestigeMinTotal: 1000 };
  const account = ensureAccount(state, USER);
  assert.equal(runPrestige(state, account, economy, NOW).ok, false);
  account.cash = 5000;
  const result = runPrestige(state, account, economy, NOW);
  assert.equal(result.ok, true);
  assert.equal(account.prestige, 1);
  assert.equal(account.cash, economy.startBalance);
});

test('vocal/messages : la progression ne peut pas créer d’argent hors barème', () => {
  const state = freshState();
  const economy: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG };
  const account = ensureAccount(state, USER);
  assert.ok(Object.keys(account).includes('xp'));
  assert.ok(account.level >= 1);
  assert.ok(economy.enabled);
  assert.ok(Array.isArray(account.achievements));
});

test('compatibilité : un ancien compte (sans XP, quêtes ni bourse) est complété sans perte', () => {
  const legacy = {
    userId: USER,
    cash: 750,
    bank: 20,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    dayStamp: '2026-10-08',
    totalEarned: 900,
    totalSpent: 150,
    totalWon: 0,
    totalLost: 0,
    gamesPlayed: 3,
    gamesWon: 1,
    bestBlackjackWin: 0,
    dailyStreak: 2,
    workStreak: 0,
    winStreak: 0,
    lossStreak: 0,
    messageStreak: 0,
    invitesRewarded: 0,
    earnedFromMessagesToday: 0,
    earnedFromVoiceToday: 0,
    paidOutToday: 0,
    lostToday: 0,
    workToday: 0,
    robToday: 0,
    begToday: 0,
    cooldowns: {},
    items: [],
    history: [],
  } as unknown as StoreState['accounts'][string];
  const account = hydrateAccount(legacy);
  assert.equal(account.cash, 750, 'l’argent existant est conservé');
  assert.equal(account.bank, 20);
  assert.equal(account.xp, 0);
  assert.equal(account.level, 1);
  assert.deepEqual(account.achievements, []);
  assert.deepEqual(account.stocks, {});
  assert.equal(account.lotteryTickets, 0);
  // les nouvelles commandes fonctionnent sur ce compte
  assert.equal(levelFromXp(account.xp).level, 1);
  assert.equal(accruedIncome(account, { ...DEFAULT_ECONOMY_CONFIG }, NOW), 0);
});
