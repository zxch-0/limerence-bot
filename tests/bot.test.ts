import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCommands } from '../src/bot/commandDefs';

/**
 * Vérification « fumée » de la couche bot : chaque module s'importe,
 * ses fonctions sont bien exportées, et chaque commande slash se
 * sérialise dans le format attendu par l'API Discord.
 */

test('chaque commande se sérialise pour l’API Discord', () => {
  const commands = buildCommands();
  for (const command of commands) {
    const json = command.toJSON() as {
      name: string;
      description: string;
      options?: Array<{ name: string; type: number }>;
    };
    assert.equal(json.name, command.name);
    assert.ok(json.description.length > 0);
    for (const option of json.options ?? []) {
      assert.ok(typeof option.name === 'string' && option.name.length > 0);
      assert.ok(typeof option.type === 'number');
    }
  }
  assert.ok(commands.length >= 45);
});

test('les modules du bot exposent leurs points d’entrée', async () => {
  const events = await import('../src/bot/events');
  assert.equal(typeof events.registerEvents, 'function');

  const scheduler = await import('../src/bot/scheduler');
  assert.equal(typeof scheduler.startScheduler, 'function');
  assert.equal(typeof scheduler.stopScheduler, 'function');

  const commands = await import('../src/bot/commands');
  for (const name of ['registerCommands', 'handleChatInput', 'handleConfessionModal', 'handleEmbedModalSubmit']) {
    assert.equal(typeof (commands as Record<string, unknown>)[name], 'function', `${name} manquant`);
  }

  const rewards = await import('../src/bot/rewards');
  for (const name of [
    'handleMessageReward',
    'handleReactionReward',
    'processVoiceRewards',
    'trackVoiceJoin',
    'trackVoiceLeave',
    'processDrops',
    'claimDrop',
    'announceEconomyEvent',
  ]) {
    assert.equal(typeof (rewards as Record<string, unknown>)[name], 'function', `${name} manquant`);
  }

  const roles = await import('../src/bot/roles');
  for (const name of ['resolveWelcomeRole', 'giveWelcomeRole', 'giveWelcomeRoleToEveryone']) {
    assert.equal(typeof (roles as Record<string, unknown>)[name], 'function', `${name} manquant`);
  }

  const moderation = await import('../src/bot/moderation');
  for (const name of [
    'warnMember',
    'applyAutoAction',
    'timeoutMember',
    'untimeoutMember',
    'kickMember',
    'banMember',
    'unbanMember',
    'softbanMember',
    'purgeMessages',
    'lockChannel',
    'lockdownGuild',
    'setSlowmode',
    'nukeChannel',
    'setNickname',
    'manageRole',
  ]) {
    assert.equal(typeof (moderation as Record<string, unknown>)[name], 'function', `${name} manquant`);
  }

  // le contenu du MP de sanction vit dans la couche lib (logique pure)
  const cases = await import('../src/lib/moderation/cases');
  assert.equal(typeof cases.buildDirectMessage, 'function');

  const tempRooms = await import('../src/bot/tempRooms');
  assert.equal(typeof tempRooms.handleVoiceStateUpdate, 'function');
  assert.equal(typeof tempRooms.reconcileTempRooms, 'function');

  const blackjack = await import('../src/bot/blackjack');
  assert.equal(typeof blackjack.handleBlackjackCommand, 'function');

  const shop = await import('../src/bot/shop');
  assert.equal(typeof shop.handleShopCommand, 'function');

  const economy = await import('../src/bot/economy');
  assert.equal(typeof economy.handleEconomyAdminCommand, 'function');

  const moderationCommands = await import('../src/bot/moderationCommands');
  assert.equal(typeof moderationCommands.handleModerationCommand, 'function');
});

test('aucun module du bot n’importe Next.js', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'src/bot');
  const files = readdirSync(dir).filter((file) => file.endsWith('.ts'));
  assert.ok(files.length >= 10, 'la couche bot doit contenir ses modules');

  for (const file of files) {
    const source = readFileSync(path.join(dir, file), 'utf8');
    assert.equal(/from ['"]next\//.test(source), false, `${file} ne doit pas importer Next.js`);
    assert.equal(/\brequire\(/.test(source), false, `${file} ne doit pas utiliser require()`);
  }
});
