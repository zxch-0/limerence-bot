import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { CHANNEL_SLOTS } from '../src/lib/types';
import {
  buildCommands,
  COMMAND_COUNT,
  economyCommands,
  moderationCommands,
  utilityCommands,
  type CommandDefinition,
} from '../src/bot/commandDefs';

type AnyOption = { name: string; description?: string; options?: AnyOption[] };

const NAME_PATTERN = /^[\p{Ll}\p{N}_-]{1,32}$/u;

function subcommands(command: CommandDefinition): AnyOption[] {
  return ((command as unknown as { options?: AnyOption[] }).options ?? []).filter(
    (option) => 'name' in option,
  );
}

const ALL: Array<{ group: string; commands: CommandDefinition[] }> = [
  { group: 'économie', commands: economyCommands() },
  { group: 'modération', commands: moderationCommands() },
  { group: 'communauté', commands: utilityCommands() },
];

test('toutes les commandes ont un nom et une description valides', () => {
  for (const { group, commands } of ALL) {
    for (const command of commands) {
      assert.match(command.name, NAME_PATTERN, `${group} : nom invalide « ${command.name} »`);
      assert.ok(command.description.length > 0, `${group} : ${command.name} sans description`);
      assert.ok(command.description.length <= 100, `${group} : ${command.name} description trop longue`);

      const subs = subcommands(command);
      const names = new Set<string>();
      for (const sub of subs) {
        assert.match(sub.name, NAME_PATTERN, `${group} : /${command.name} ${sub.name} invalide`);
        assert.ok(!names.has(sub.name), `${group} : sous-commande dupliquée /${command.name} ${sub.name}`);
        names.add(sub.name);
        assert.ok((sub.description ?? '').length > 0, `${group} : /${command.name} ${sub.name} sans description`);
      }
    }
  }
});

test('les noms de commandes sont uniques', () => {
  const seen = new Map<string, string>();
  for (const { group, commands } of ALL) {
    for (const command of commands) {
      assert.ok(!seen.has(command.name), `« ${command.name} » défini dans ${group} et dans ${seen.get(command.name)}`);
      seen.set(command.name, group);
    }
  }
  assert.equal(seen.size, buildCommands().length);
});

test('la surface de commandes couvre l’économie, le blackjack, la boutique et la modération', () => {
  const names = buildCommands().map((command) => command.name);
  for (const expected of [
    'balance',
    'daily',
    'work',
    'crime',
    'rob',
    'beg',
    'search',
    'pay',
    'bank',
    'leaderboard',
    'inventaire',
    'revendre',
    'blackjack',
    'shop',
    'warn',
    'cas',
    'kick',
    'ban',
    'unban',
    'softban',
    'mute',
    'unmute',
    'nick',
    'purge',
    'lock',
    'unlock',
    'lockdown',
    'unlockdown',
    'slowmode',
    'nuke',
    'addrole',
    'removerole',
    'userinfo',
    'serverinfo',
    'roleinfo',
    'banlist',
    'antiraid',
    'economie',
    'aide',
    'confession',
    'annonce',
    'embed',
    'regles',
    'vocal',
    'ping',
    'config',
  ]) {
    assert.ok(names.includes(expected), `commande manquante : /${expected}`);
  }
  assert.ok(names.length >= 45, `au moins 45 commandes attendues, ${names.length} obtenues`);
  assert.equal(COMMAND_COUNT, names.length);
});

test('le blackjack expose toutes les actions de table', () => {
  const blackjack = buildCommands().find((command) => command.name === 'blackjack');
  assert.ok(blackjack);
  const subs = subcommands(blackjack).map((sub) => sub.name);
  for (const expected of ['jouer', 'carte', 'rester', 'doubler', 'split', 'assurance', 'abandonner', 'quitter', 'stats', 'regles']) {
    assert.ok(subs.includes(expected), `sous-commande manquante : /blackjack ${expected}`);
  }
});

test('la modération expose le système d’avertissements complet', () => {
  const warn = buildCommands().find((command) => command.name === 'warn');
  assert.ok(warn);
  const subs = subcommands(warn).map((sub) => sub.name);
  assert.deepEqual(subs.sort(), ['ajouter', 'effacer', 'liste', 'modifier', 'retirer'].sort());
});

test('le module de commandes n’importe pas Next.js', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/bot/commandDefs.ts'), 'utf8');
  assert.equal(/from ['"]next/.test(source), false, 'commandDefs.ts doit rester indépendant de Next.js');
  assert.equal(/from ['"]@\/app/.test(source), false, 'aucune dépendance au panel');
});

 test('/config expose tous les salons, exige Gérer le serveur et refuse les MP', () => {
  const config = buildCommands().find((command) => command.name === 'config')!.toJSON();
  assert.equal(config.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.equal(config.dm_permission, false);
  const subs = config.options as Array<{ name: string; options?: Array<{ name: string; required?: boolean; choices?: Array<{ value: string }>; channel_types?: number[] }> }>;
  assert.deepEqual(subs.map((sub) => sub.name), ['voir', 'salon', 'supprimer']);
  for (const sub of subs.slice(1)) {
    const category = sub.options!.find((option) => option.name === 'categorie')!;
    assert.equal(category.required, true);
    assert.deepEqual(category.choices!.map((choice) => choice.value), [...CHANNEL_SLOTS]);
  }
  const channel = subs[1].options!.find((option) => option.name === 'salon')!;
  assert.equal(channel.required, true);
  assert.deepEqual(channel.channel_types, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
});
