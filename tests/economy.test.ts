import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState } from '../src/lib/config';
import {
  applyBoost,
  cooldownRemaining,
  createAccount,
  credit,
  debit,
  ensureAccount,
  formatMoney,
  hasShield,
  isJailed,
  leaderboard,
  moneySupply,
  moveBetweenPockets,
  pushTransaction,
  setCooldown,
  todayStamp,
  totalBalance,
} from '../src/lib/economy/core';
import {
  applyBankInterest,
  boosterBonusPercent,
  runDaily,
  runMessageReward,
  runPay,
  runVoiceReward,
  runWork,
} from '../src/lib/economy/actions';
import type { EconomyAccount, StoreState } from '../src/lib/types';

/** Identifiant Discord synthétique dont l'horodatage est maîtrisé. */
function snowflakeAt(date: Date): string {
  return ((BigInt(date.getTime()) - 1420070400000n) << 22n).toString();
}

const OLD = snowflakeAt(new Date('2020-01-01T00:00:00Z'));
const OLD_2 = snowflakeAt(new Date('2020-02-01T00:00:00Z'));
const FRESH = snowflakeAt(new Date());

function setup(mutate?: (state: StoreState) => void): { state: StoreState; config: StoreState['config']['economy'] } {
  const state = emptyState();
  mutate?.(state);
  return { state, config: state.config.economy };
}

test('createAccount applique le solde de départ et le compteur quotidien', () => {
  const { state, config } = setup();
  const now = new Date('2026-05-10T12:00:00Z');
  const account = createAccount(OLD, config, now);
  assert.equal(account.cash, config.startBalance);
  assert.equal(account.bank, 0);
  assert.equal(account.dayStamp, todayStamp(now));
  assert.equal(account.history.length, 0, 'la création seule ne journalise rien');

  // ensureAccount, lui, journalise le solde de départ
  const ensured = ensureAccount(state, OLD_2);
  assert.equal(ensured.history.length, 1);
  assert.equal(ensured.history[0].type, 'start');
  assert.equal(ensured.history[0].amount, config.startBalance);
});

test('credit respecte le plafond de poche et le journal', () => {
  const { state, config } = setup();
  config.maxBalance = 1000;
  const account = ensureAccount(state, OLD);
  account.cash = 900;

  const first = credit(account, config, 200, 'admin');
  assert.equal(first.ok, true);
  assert.equal(first.amount, 100, 'seulement la place disponible est créditée');
  assert.equal(account.cash, 1000);

  const second = credit(account, config, 50, 'admin');
  assert.equal(second.ok, false, 'poche pleine');
  assert.equal(second.amount, 0);

  config.maxBalance = 0;
  account.cash = 0;
  const unlimited = credit(account, config, 1234.7, 'admin');
  assert.equal(unlimited.amount, 1235, 'roundAmounts arrondit le gain');
  assert.equal(account.history[0].type, 'admin');
});

test('debit refuse de passer sous le plancher de solde', () => {
  const { state, config } = setup();
  const account = ensureAccount(state, OLD);
  account.cash = 100;

  const refused = debit(account, config, 500, 'admin');
  assert.equal(refused.ok, false);
  assert.equal(account.cash, 100, 'aucun débit appliqué');

  config.allowNegative = true;
  config.balanceFloor = -200;
  const allowed = debit(account, config, 250, 'admin');
  assert.equal(allowed.ok, true);
  assert.equal(account.cash, -150);

  const floor = debit(account, config, 100, 'admin');
  assert.equal(floor.ok, false, 'le plancher est respecté');
});

test('applyBoost ne bonusse que les porteurs du rôle', () => {
  const { config } = setup();
  config.boostRoleId = '111';
  config.boostMultiplierPercent = 50;
  assert.equal(applyBoost(config, ['111'], 100), 150);
  assert.equal(applyBoost(config, ['222'], 100), 100, 'un autre rôle ne change rien');

  config.boostRoleId = '';
  assert.equal(applyBoost(config, ['111'], 100), 100, 'sans rôle configuré, aucun bonus');
});

test('boosterBonusPercent cumule les boosters non expirés', () => {
  const { state, config } = setup();
  const now = new Date('2026-05-10T12:00:00Z');
  const account: EconomyAccount = {
    ...createAccount(OLD, config, now),
    items: [
      {
        itemId: 'a',
        name: 'Boost',
        quantity: 1,
        boughtAt: now.toISOString(),
        effect: 'booster',
        effectValue: 25,
        expiresAt: new Date('2026-05-11T00:00:00Z').toISOString(),
      },
      {
        itemId: 'b',
        name: 'Boost expiré',
        quantity: 1,
        boughtAt: now.toISOString(),
        effect: 'booster',
        effectValue: 40,
        expiresAt: new Date('2026-05-09T00:00:00Z').toISOString(),
      },
      { itemId: 'c', name: 'Objet', quantity: 2, boughtAt: now.toISOString(), effect: 'collectible', effectValue: 0 },
    ],
  };
  state.accounts[OLD] = account;
  assert.equal(boosterBonusPercent(account, now), 25, 'seul le booster non expiré compte');
});

test('/daily applique la série quotidienne et le bonus hebdomadaire', () => {
  const { state, config } = setup();
  config.dailyMin = 100;
  config.dailyMax = 100;
  config.dailyStreakBonus = 10;
  config.dailyStreakMaxBonus = 100;
  config.dailyWeeklyBonus = 50;
  const now = new Date('2026-05-10T12:00:00Z');
  const account = ensureAccount(state, OLD);
  account.cash = 0;

  const first = runDaily(state, account, config, { now, rng: () => 0 });
  assert.equal(first.ok, true);
  assert.equal(first.amount, 100, 'premier jour : aucun bonus de série');
  assert.equal(account.dailyStreak, 1);

  // seconde tentative le même jour : bloquée par le temps de recharge
  const again = runDaily(state, account, config, { now, rng: () => 0 });
  assert.equal(again.ok, false);

  // le lendemain : la série augmente et le bonus avec
  const nextDay = new Date(now.getTime() + 24 * 3_600_000);
  const second = runDaily(state, account, config, { now: nextDay, rng: () => 0 });
  assert.equal(second.ok, true);
  assert.equal(account.dailyStreak, 2);
  assert.equal(second.amount, 110, '100 + 1 jour de série × 10');

  // au 7e jour consécutif, le bonus hebdomadaire s'ajoute
  let day = nextDay;
  for (let index = 3; index <= 7; index += 1) {
    day = new Date(day.getTime() + 24 * 3_600_000);
    runDaily(state, account, config, { now: day, rng: () => 0 });
  }
  assert.equal(account.dailyStreak, 7);
  assert.equal(account.history[0].amount, 100 + 60 + 50, 'base + bonus de série + bonus du 7e jour');
});

test('/work respecte le cooldown et le nombre de sessions par jour', () => {
  const { state, config } = setup();
  config.workMin = 50;
  config.workMax = 50;
  config.workFailChancePercent = 0;
  config.workDailyCap = 2;
  const now = new Date('2026-05-10T12:00:00Z');
  const account = ensureAccount(state, OLD);
  account.cash = 0;

  const first = runWork(state, account, config, { now, rng: () => 0 });
  assert.equal(first.ok, true);
  assert.equal(first.amount, 50);

  const tooSoon = runWork(state, account, config, { now: new Date(now.getTime() + 10 * 60_000), rng: () => 0 });
  assert.equal(tooSoon.ok, false, 'cooldown actif');

  const later = new Date(now.getTime() + (config.workCooldownMinutes + 1) * 60_000);
  const second = runWork(state, account, config, { now: later, rng: () => 0 });
  assert.equal(second.ok, true);

  const third = runWork(state, account, config, { now: new Date(later.getTime() + 61 * 60_000), rng: () => 0 });
  assert.equal(third.ok, false, 'le nombre de sessions quotidiennes est atteint');
  assert.match(third.message, /déjà travaillé/);

  // un échec au travail retire une partie du salaire
  config.workFailChancePercent = 100;
  config.workDailyCap = 0;
  config.workFailPenaltyPercent = 50;
  const failed = runWork(state, account, config, { now: new Date(later.getTime() + 122 * 60_000), rng: () => 0 });
  assert.equal(failed.ok, false);
  assert.equal(failed.amount, -25);
});

test('/pay prélève la taxe et respecte le montant minimum', () => {
  const { state, config } = setup();
  config.payMinAmount = 50;
  config.payTaxPercent = 10;
  config.payMaxAmount = 0;
  const now = new Date('2026-05-10T12:00:00Z');
  const sender = ensureAccount(state, OLD);
  sender.cash = 1000;
  const receiver = ensureAccount(state, OLD_2);
  receiver.cash = 0;

  const tooSmall = runPay(state, sender, OLD_2, 10, config, { now });
  assert.equal(tooSmall.ok, false, 'sous le montant minimum');

  const sent = runPay(state, sender, OLD_2, 100, config, { now });
  assert.equal(sent.ok, true);
  assert.equal(sent.amount, 90, 'le montant annoncé est celui réellement reçu');
  assert.equal(sender.cash, 900, 'le payeur perd 100');
  assert.equal(receiver.cash, 90, 'la taxe de 10 % est prélevée sur le transfert');

  const self = runPay(state, sender, sender.userId, 100, config, { now });
  assert.equal(self.ok, false, 'impossible de se payer soi-même');
});

test('les récompenses passives appliquent cooldown et plafond quotidien', () => {
  const { state, config } = setup();
  config.messageMin = 10;
  config.messageMax = 10;
  config.messageCooldownSeconds = 60;
  config.messageDailyCapEnabled = true;
  config.messageDailyCap = 15;
  const now = new Date('2026-05-10T12:00:00Z');
  const account = ensureAccount(state, OLD);
  account.cash = 0;

  const first = runMessageReward(state, account, config, { now, rng: () => 0 });
  assert.equal(first.ok, true);
  assert.equal(first.amount, 10);

  const tooSoon = runMessageReward(state, account, config, { now: new Date(now.getTime() + 10_000), rng: () => 0 });
  assert.equal(tooSoon.ok, false, 'cooldown actif');

  const later = runMessageReward(state, account, config, { now: new Date(now.getTime() + 61_000), rng: () => 0 });
  assert.equal(later.ok, true);
  assert.equal(later.amount, 5, 'le plafond quotidien limite à 15 au total');

  const capped = runMessageReward(state, account, config, { now: new Date(now.getTime() + 200_000), rng: () => 0 });
  assert.equal(capped.ok, false);
  assert.equal(capped.capped, true);
});

test('les récompenses vocales sont bornées par le plafond quotidien', () => {
  const { state, config } = setup();
  config.voiceMinPerHour = 60;
  config.voiceMaxPerHour = 60;
  config.voiceDailyCapEnabled = true;
  config.voiceDailyCap = 30;
  const now = new Date('2026-05-10T12:00:00Z');
  const account = ensureAccount(state, OLD);
  account.cash = 0;

  const reward = runVoiceReward(state, account, config, 120, { now, rng: () => 0 });
  assert.equal(reward.ok, true);
  assert.equal(reward.amount, 30, '2 heures à 60/h = 120, réduit au plafond de 30');
});

test('intérêts bancaires : seuil, plafond et capacité de la banque', () => {
  const { state, config } = setup();
  config.bankEnabled = true;
  config.interestEnabled = true;
  config.interestRatePercent = 10;
  config.interestMax = 50;
  config.interestMinBank = 100;
  config.maxBank = 1000;

  const poor = ensureAccount(state, OLD);
  poor.bank = 50;
  const rich = ensureAccount(state, OLD_2);
  rich.bank = 980;

  const report = applyBankInterest(state, config, new Date('2026-05-10T12:00:00Z'));
  assert.equal(report.members, 1, 'seul le compte au-dessus du seuil est servi');
  assert.equal(poor.bank, 50);
  assert.equal(rich.bank, 1000, 'le plafond de capacité de la banque est respecté');
  assert.equal(report.total, 20);
});

test('dépôt et retrait entre poche et banque', () => {
  const { state, config } = setup();
  config.bankEnabled = true;
  config.maxBank = 500;
  config.bankDepositMin = 10;
  config.bankWithdrawMin = 10;
  const account = ensureAccount(state, OLD);
  account.cash = 1000;

  const deposited = moveBetweenPockets(account, config, 400, 'deposit');
  assert.equal(deposited.ok, true);
  assert.equal(account.bank, 400);
  assert.equal(account.cash, 600);

  const tooBig = moveBetweenPockets(account, config, 500, 'deposit');
  assert.equal(tooBig.ok, false, 'au-delà de la capacité de la banque');

  const withdrawn = moveBetweenPockets(account, config, 100, 'withdraw');
  assert.equal(withdrawn.ok, true);
  assert.equal(account.bank, 300);
  assert.equal(account.cash, 700);

  const small = moveBetweenPockets(account, config, 5, 'withdraw');
  assert.equal(small.ok, false, 'sous le retrait minimum');
});

test('temps de recharge, prison et bouclier', () => {
  const { state, config } = setup();
  const now = new Date('2026-05-10T12:00:00Z');
  const account = ensureAccount(state, OLD);

  setCooldown(account, 'work', 60, now);
  assert.equal(cooldownRemaining(account, 'work', now), 60_000);
  assert.equal(cooldownRemaining(account, 'work', new Date(now.getTime() + 61_000)), 0);
  assert.equal(cooldownRemaining(account, 'daily', now), 0, 'une clé inconnue ne bloque pas');

  assert.equal(isJailed(account, now), false);
  account.jailUntil = new Date(now.getTime() + 60_000).toISOString();
  assert.equal(isJailed(account, now), true);
  assert.equal(isJailed(account, new Date(now.getTime() + 120_000)), false);

  assert.equal(hasShield(account, now), false);
  account.shieldUntil = new Date(now.getTime() + 60_000).toISOString();
  assert.equal(hasShield(account, now), true);
});

test('classement et masse monétaire', () => {
  const { state, config } = setup();
  const a = ensureAccount(state, OLD);
  a.cash = 100;
  a.bank = 400;
  const b = ensureAccount(state, OLD_2);
  b.cash = 1000;

  const entries = leaderboard(state, config);
  assert.equal(entries[0].userId, OLD_2);
  assert.equal(entries[0].rank, 1);
  assert.equal(entries[1].userId, OLD);
  assert.equal(entries[1].total, 500);

  const bots = leaderboard(state, config, { knownBotIds: new Set([OLD_2]) });
  assert.equal(bots.length, 1, 'les bots sont masqués du classement');

  const supply = moneySupply(state);
  assert.equal(supply.cash, 1100);
  assert.equal(supply.bank, 400);
  assert.equal(supply.total, 1500);
  assert.equal(supply.accounts, 2);
  assert.equal(totalBalance(a), 500);
});

test('l’historique des transactions est borné et horodaté', () => {
  const { state, config } = setup();
  config.historySize = 3;
  const account = ensureAccount(state, OLD);
  for (let index = 0; index < 5; index += 1) {
    pushTransaction(account, config, { type: 'work', amount: index + 1 });
  }
  assert.equal(account.history.length, 3, 'seules les dernières transactions sont conservées');
  assert.equal(account.history[0].amount, 5, 'la plus récente est en tête');

  config.logTransactions = false;
  const silent = pushTransaction(account, config, { type: 'work', amount: 9 });
  assert.equal(silent, null);
});

test('formatMoney utilise la devise configurée', () => {
  const { config } = setup();
  config.currencyName = 'cœur';
  config.currencyPlural = 'cœurs';
  config.currencySymbol = '💗';
  assert.equal(formatMoney(config, 1200), '1 200 💗 cœurs', 'les milliers sont groupés à la française');
  assert.equal(formatMoney(config, 1), '1 💗 cœur', 'le singulier utilise le nom au singulier');
  assert.equal(formatMoney(config, -30), '-30 💗 cœurs');
});

test('un compte trop récent est refusé quand l’anti-alt est actif', () => {
  const { state, config } = setup();
  config.antiAltEnabled = true;
  config.antiAltAccountAgeDays = 7;
  config.payBlockNewAccountHours = 0;
  const fresh = ensureAccount(state, FRESH);
  fresh.cash = 10_000;
  const target = ensureAccount(state, OLD_2);

  const result = runPay(state, fresh, target.userId, 100, config, { now: new Date() });
  assert.equal(result.ok, false);
  assert.match(result.message, /récent/);
});
