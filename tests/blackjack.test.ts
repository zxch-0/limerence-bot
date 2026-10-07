import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState } from '../src/lib/config';
import {
  blackjackRatio,
  canDouble,
  canSplit,
  dealerMustHit,
  handValue,
  insuranceRatio,
  isBlackjack,
  needsReshuffle,
  settleGame,
  sideBet21Plus3Multiplier,
} from '../src/lib/blackjack/engine';
import { abandonGame, finishGame, maxAllowedBet, newGame, playerAction } from '../src/lib/blackjack/table';
import { ensureAccount } from '../src/lib/economy/core';
import type { BlackjackGame, Card, Rank, StoreState, Suit } from '../src/lib/types';

function card(rank: Rank, suit: Suit = 'S'): Card {
  return { rank, suit };
}

function makeGame(player: Card[], dealer: Card[], bet = 100, extra: Partial<BlackjackGame> = {}): BlackjackGame {
  const now = Date.now();
  return {
    id: 'test',
    guildId: 'guild',
    userId: 'user',
    channelId: 'channel',
    shoe: [],
    drawIndex: 0,
    hands: [
      {
        cards: player,
        bet,
        sideBet: 0,
        stood: true,
        doubled: false,
        busted: false,
        blackjack: isBlackjack(player),
        surrendered: false,
      },
    ],
    activeHand: 0,
    splitsUsed: 0,
    dealer,
    holeRevealed: false,
    insuranceBet: 0,
    insuranceResolved: false,
    baseBet: bet,
    sideBet: 0,
    status: 'playing',
    createdAt: now,
    updatedAt: now,
    timeoutAt: now + 60_000,
    firstAction: true,
    ...extra,
  };
}

function setup(): StoreState {
  const state = emptyState();
  state.config.blackjack.taxPercent = 0;
  state.config.blackjack.loseStreakPityPercent = 0;
  state.config.blackjack.winStreakBonusEnabled = false;
  const account = ensureAccount(state, 'player');
  account.cash = 10_000;
  return state;
}

test('la valeur d’une main gère les as souples', () => {
  assert.equal(handValue([card('A'), card('6')]).total, 17);
  assert.equal(handValue([card('A'), card('6')]).soft, true);
  assert.equal(handValue([card('A'), card('6'), card('10')]).total, 17, 'l’as retombe à 1 plutôt que sauter');
  assert.equal(handValue([card('A'), card('A'), card('9')]).total, 21);
  assert.equal(handValue([card('K'), card('Q'), card('5')]).total, 25);
  assert.equal(isBlackjack([card('A'), card('K')]), true);
  assert.equal(isBlackjack([card('A'), card('K'), card('2')]), false, 'un 21 en trois cartes n’est pas un blackjack');
});

test('le donneur tire jusqu’à 17 et s’arrête selon la règle du 17 souple', () => {
  assert.equal(dealerMustHit([card('10'), card('6')], true), true, '16 : il tire');
  assert.equal(dealerMustHit([card('A'), card('6')], true), false, 'il reste sur un 17 souple');
  assert.equal(dealerMustHit([card('A'), card('6')], false), true, 'il tire sur un 17 souple');
  assert.equal(dealerMustHit([card('10'), card('7')], false), false);
});

test('les ratios de payout sont lus depuis la configuration', () => {
  const { config } = { config: emptyState().config.blackjack };
  config.blackjackPayout = '3:2';
  assert.equal(blackjackRatio(config), 1.5);
  config.blackjackPayout = '6:5';
  assert.equal(blackjackRatio(config), 1.2);
  config.insurancePayout = '2:1';
  assert.equal(insuranceRatio(config), 2);
});

test('un blackjack naturel paie 3:2', () => {
  const state = setup();
  const game = makeGame([card('A'), card('K')], [card('9'), card('8')]);
  const settlement = settleGame(game, state.config.blackjack);
  assert.equal(settlement.outcome, 'blackjack');
  assert.equal(settlement.hands[0].multiplier, 2.5);
  assert.equal(settlement.hands[0].returned, 250);
  assert.equal(settlement.net, 150);
});

test('deux blackjacks font égalité', () => {
  const state = setup();
  const game = makeGame([card('A', 'H'), card('K', 'H')], [card('A', 'S'), card('Q', 'S')]);
  const settlement = settleGame(game, state.config.blackjack);
  assert.equal(settlement.hands[0].multiplier, 1);
  assert.equal(settlement.net, 0);
});

test('une victoire simple double la mise, une défaite la perd', () => {
  const state = setup();

  const win = settleGame(makeGame([card('10'), card('9')], [card('8'), card('7')]), state.config.blackjack);
  assert.equal(win.hands[0].multiplier, 2);
  assert.equal(win.net, 100);

  const lose = settleGame(makeGame([card('10'), card('7')], [card('9'), card('10')]), state.config.blackjack);
  assert.equal(lose.hands[0].multiplier, 0);
  assert.equal(lose.net, -100);
  assert.equal(lose.outcome, 'lose');
});

test('le donneur qui saute fait gagner toutes les mains non sautées', () => {
  const state = setup();
  const game = makeGame([card('9'), card('8')], [card('10'), card('9')]);
  game.dealer = [card('10'), card('9'), card('5')];
  const settlement = settleGame(game, state.config.blackjack);
  assert.equal(settlement.dealerBust, true);
  assert.equal(settlement.hands[0].multiplier, 2);
});

test('l’égalité rend la mise si la table le prévoit', () => {
  const state = setup();
  state.config.blackjack.pushReturnsBet = true;
  const push = settleGame(makeGame([card('10'), card('9')], [card('9'), card('10')]), state.config.blackjack);
  assert.equal(push.hands[0].multiplier, 1);
  assert.equal(push.net, 0);

  state.config.blackjack.pushReturnsBet = false;
  const strict = settleGame(makeGame([card('10'), card('9')], [card('9'), card('10')]), state.config.blackjack);
  assert.equal(strict.hands[0].multiplier, 0);
  assert.equal(strict.net, -100);
});

test('un saut perd la mise même si le donneur saute aussi', () => {
  const state = setup();
  const game = makeGame([card('10'), card('9'), card('5')], [card('10'), card('9'), card('5')]);
  const settlement = settleGame(game, state.config.blackjack);
  assert.equal(settlement.outcome, 'bust');
  assert.equal(settlement.hands[0].multiplier, 0);
});

test('l’abandon rend le pourcentage configuré', () => {
  const state = setup();
  state.config.blackjack.surrenderRefundPercent = 50;
  const game = makeGame([card('9'), card('7')], [card('10'), card('A')]);
  game.hands[0].surrendered = true;
  const settlement = settleGame(game, state.config.blackjack);
  assert.equal(settlement.hands[0].multiplier, 0.5);
  assert.equal(settlement.net, -50);
  assert.equal(settlement.outcome, 'surrender');
});

test('l’assurance paie quand le donneur a un blackjack', () => {
  const state = setup();
  const win = makeGame([card('9'), card('9')], [card('A'), card('K')]);
  win.insuranceBet = 50;
  const settlement = settleGame(win, state.config.blackjack);
  assert.equal(settlement.insuranceProfit, 100, '2:1 sur 50 misés');
  assert.equal(settlement.hands[0].multiplier, 0, 'la main perd face au blackjack du donneur');

  const lose = makeGame([card('9'), card('9')], [card('A'), card('9')]);
  lose.insuranceBet = 50;
  const lost = settleGame(lose, state.config.blackjack);
  assert.equal(lost.insuranceProfit, -50);
});

test('le pari annexe 21+3 est évalué sur les trois premières cartes', () => {
  const state = setup();
  state.config.blackjack.perfectPairsEnabled = true;
  const flush = sideBet21Plus3Multiplier(
    state.config.blackjack,
    [card('5', 'H'), card('7', 'H')],
    card('9', 'H'),
  );
  assert.ok(flush > 0, 'une couleur est payée');
  const nothing = sideBet21Plus3Multiplier(state.config.blackjack, [card('2', 'H'), card('9', 'S')], card('K', 'D'));
  assert.equal(nothing, 0);
});

test('une partie refuse une mise hors bornes et débite la mise acceptée', () => {
  const state = setup();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  config.minBet = 50;
  economy.betMin = 10;

  const tooSmall = newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 10, config, economy }, { rng: () => 0.5 });
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.error ?? '', /minimum/i);

  const account = ensureAccount(state, 'player');
  const before = account.cash;
  const game = newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  assert.equal(game.ok, true);
  assert.equal(account.cash, before - 100, 'la mise est débitée à l’ouverture');
  assert.equal(game.game?.hands[0].cards.length, 2);
  assert.equal(game.game?.dealer.length, 2);
  assert.equal(state.blackjack.player.hands[0].bet, 100);

  // une seconde partie simultanée est refusée
  const twice = newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  assert.equal(twice.ok, config.oneGamePerUser ? false : true);
});

test('la mise est plafonnée par le solde et la configuration', () => {
  const state = setup();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  config.maxBet = 500;
  config.maxBetPercentOfBalance = 50;
  economy.betMaxPercentOfBalance = 0;

  assert.equal(maxAllowedBet(config, economy, 600), 300, '50 % du solde');
  assert.equal(maxAllowedBet(config, economy, 5000), 500, 'le plafond absolu l’emporte');

  config.maxBetPercentOfBalance = 0;
  assert.equal(maxAllowedBet(config, economy, 1000), 500);
});

test('le plafond de perte quotidienne bloque l’ouverture', () => {
  const state = setup();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  economy.dailyLossLimitEnabled = true;
  economy.dailyLossLimit = 50;
  const account = ensureAccount(state, 'player');
  account.cash = 1000;
  account.lostToday = 60;

  const result = newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /perte quotidienne/);
});

test('tirer, rester puis encaisser crédite les gains taxés', () => {
  const state = setup();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  config.taxPercent = 10;
  config.allowDoubleDown = true;

  const account = ensureAccount(state, 'player');
  account.cash = 1000;
  const opened = newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  assert.equal(opened.ok, true);

  const game = state.blackjack.player;
  // on force une main gagnante pour tester le règlement
  game.hands[0].cards = [card('10'), card('9')];
  game.dealer = [card('9'), card('8')];

  const stood = playerAction(state, 'player', { action: 'stand', config, economy });
  assert.equal(stood.ok, true);

  const result = finishGame(state, 'player', { config, economy });
  assert.ok(result);
  assert.equal(result.settlement.hands[0].returned, 200);
  assert.equal(result.tax, 10, '10 % de taxe sur 100 de gain net');
  assert.equal(result.net, 90);
  assert.equal(account.cash, 1000 - 100 + 200 - 10, 'mise débitée puis gains taxés crédités');
  assert.equal(state.blackjackStats.player.hands, 1);
  assert.equal(state.blackjackStats.player.wins, 1);
  assert.equal(account.winStreak, 1);
  assert.equal(state.blackjack.player, undefined, 'la partie est retirée après règlement');
});

test('le bonus de série et la compensation de série perdante s’appliquent', () => {
  const state = setup();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  config.winStreakBonusEnabled = true;
  config.winStreakBonusPercent = 10;
  config.winStreakMaxSteps = 3;

  const account = ensureAccount(state, 'player');
  account.cash = 5000;
  account.winStreak = 2;
  newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  const game = state.blackjack.player;
  game.hands[0].cards = [card('10'), card('9')];
  game.dealer = [card('9'), card('8')];
  playerAction(state, 'player', { action: 'stand', config, economy });

  const result = finishGame(state, 'player', { config, economy });
  assert.ok(result);
  assert.equal(result.streakBonus, 20, '10 % × 2 paliers sur 100 de gain');
  assert.equal(result.net, 120);

  // compensation après 3 pertes de suite
  config.winStreakBonusEnabled = false;
  config.loseStreakPityPercent = 20;
  account.lossStreak = 2;
  newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  const losing = state.blackjack.player;
  losing.hands[0].cards = [card('10'), card('7')];
  losing.dealer = [card('10'), card('9')];
  playerAction(state, 'player', { action: 'stand', config, economy });
  const lost = finishGame(state, 'player', { config, economy });
  assert.ok(lost);
  assert.equal(lost.pity, 20, '20 % de la mise rendue après la 3e défaite');
  assert.equal(lost.net, -80);
});

test('le partage crée deux mains et double la mise engagée', () => {
  const state = setup();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  config.allowSplit = true;
  config.maxSplits = 1;

  const account = ensureAccount(state, 'player');
  account.cash = 1000;
  newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  const game = state.blackjack.player;
  game.hands[0].cards = [card('8', 'H'), card('8', 'S')];
  game.dealer = [card('6'), card('9')];
  assert.equal(canSplit(config, game), true);

  const split = playerAction(state, 'player', { action: 'split', config, economy });
  assert.equal(split.ok, true);
  assert.equal(game.hands.length, 2);
  assert.equal(game.hands[1].bet, 100, 'la seconde main est misée au même montant');
  assert.equal(account.cash, 800, '1000 − 100 de mise − 100 de partage');
  assert.equal(canDouble(config, game), config.doubleOnAnyTwoCards);
});

test('l’abandon rembourse selon le pourcentage demandé', () => {
  const state = setup();
  const config = state.config.blackjack;
  const economy = state.config.economy;
  const account = ensureAccount(state, 'player');
  account.cash = 1000;
  newGame(state, { guildId: 'g', userId: 'player', channelId: 'c', bet: 100, config, economy }, { rng: () => 0.5 });
  assert.equal(account.cash, 900);

  const refunded = abandonGame(state, 'player', 50);
  assert.equal(refunded, 50);
  assert.equal(account.cash, 950);
  assert.equal(state.blackjack.player, undefined);
});

test('le sabot est remélangé selon la pénétration configurée', () => {
  const state = setup();
  const config = state.config.blackjack;
  config.decks = 1;
  config.shufflePenetrationPercent = 50;

  const game = makeGame([card('2')], [card('3')]);
  game.shoe = Array.from({ length: 52 }, () => card('2'));
  game.drawIndex = 10;
  assert.equal(needsReshuffle(game, config), false, '10 cartes sur 52 : sous la pénétration');

  game.drawIndex = 30;
  assert.equal(needsReshuffle(game, config), true, '30 cartes sur 52 : au-delà de 50 %');
});
