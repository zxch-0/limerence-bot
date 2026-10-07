import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState } from '../src/lib/config';
import {
  activeWarns,
  buildDirectMessage,
  caseLabel,
  caseLabelFromConfig,
  clearWarns,
  createCase,
  findCase,
  nextAutoAction,
  pruneCases,
  revokeCase,
} from '../src/lib/moderation/cases';
import { countEmojis, inspectMessage, isAllowedDomain, uppercaseRatio } from '../src/lib/moderation/automod';
import type { StoreState } from '../src/lib/types';

const USER = '123456789012345678';
const MOD = { moderatorId: '111', moderatorName: 'Modératrice' };

function setup(): StoreState {
  const state = emptyState();
  state.config.moderation.automodEnabled = true;
  return state;
}

function context(content: string, extra: Record<string, unknown> = {}) {
  return { content, channelId: 'chan', memberRoleIds: [], isBot: false, ...extra };
}

function warn(state: StoreState, overrides: Record<string, unknown> = {}) {
  return createCase(state, {
    guildId: 'guild',
    type: 'warn',
    userId: USER,
    userName: 'membre',
    reason: 'Rappel du règlement',
    ...MOD,
    ...overrides,
  });
}

test('les dossiers sont numérotés dans l’ordre et bornés', () => {
  const state = setup();
  const first = warn(state);
  const second = createCase(state, {
    guildId: 'guild',
    type: 'kick',
    userId: USER,
    userName: 'membre',
    reason: 'Comportement',
    ...MOD,
  });

  assert.equal(first.number, 1);
  assert.equal(second.number, 2);
  assert.equal(state.cases.length, 2);
  assert.equal(state.cases[0].number, 2, 'le plus récent est en tête');
  assert.equal(caseLabel(first), 'CAS-0001');
  assert.equal(caseLabelFromConfig(first, state.config.moderation).startsWith(state.config.moderation.caseNumberPrefix), true);
  assert.equal(findCase(state, '2')?.type, 'kick');

  // Recherche par préfixe et par numéro, avec des identifiants contrôlés :
  // aucun aléa (randomUUID) dans l'assertion.
  const withIds = emptyState();
  withIds.cases.push({ ...second, id: 'bbbb2222-0000-4000-8000-000000000002', number: 2 });
  withIds.cases.push({ ...first, id: 'aaaa1111-0000-4000-8000-000000000001', number: 1 });
  assert.equal(findCase(withIds, 'aaaa1111')?.number, 1, 'préfixe du dossier le plus ancien');
  assert.equal(findCase(withIds, 'bbbb2222')?.number, 2, 'préfixe du dossier le plus récent');
  assert.equal(findCase(withIds, 'aaaa1111-0000-4000-8000-000000000001')?.number, 1, 'identifiant complet');
  assert.equal(findCase(withIds, '1')?.number, 1, 'recherche par numéro');
  assert.equal(findCase(withIds, 'inconnu'), null);
});

test('les avertissements expirent selon la durée configurée', () => {
  const state = setup();
  const config = state.config.moderation;
  config.warnDecayEnabled = true;
  config.warnDecayDays = 7;

  const recent = warn(state);
  const old = warn(state);
  old.createdAt = new Date(Date.now() - 10 * 86_400_000).toISOString();

  const active = activeWarns(state, USER, config);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, recent.id);
  assert.ok(state.cases.includes(old), 'le dossier ancien reste dans l’historique');

  // expiration explicite via expiresAt
  const dated = warn(state, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(activeWarns(state, USER, config).length, 1);
  assert.equal(dated.active, true, 'un dossier expiré n’est pas marqué retiré automatiquement');
});

test('retrait et effacement des avertissements', () => {
  const state = setup();
  const a = warn(state);
  const b = warn(state);

  const revoked = revokeCase(state, a.id, 'panel');
  assert.equal(revoked?.active, false);
  assert.equal(revoked?.revokedBy, 'panel');
  assert.equal(activeWarns(state, USER, state.config.moderation).length, 1);

  const cleared = clearWarns(state, USER, 'panel');
  assert.equal(cleared, 1, 'seul l’avertissement encore actif est effacé');
  assert.equal(activeWarns(state, USER, state.config.moderation).length, 0);
  assert.equal(b.active, false);
});

test('la purge supprime uniquement les dossiers trop anciens', () => {
  const state = setup();
  const config = state.config.moderation;
  config.caseKeepDays = 30;
  warn(state);
  const old = warn(state);
  old.createdAt = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const removed = pruneCases(state, config);
  assert.equal(removed, 1);
  assert.equal(state.cases.length, 1);

  config.caseKeepDays = 0;
  assert.equal(pruneCases(state, config), 0, '0 jour = conservation illimitée');
});

test('le barème de sanction automatique suit les paliers', () => {
  const config = setup().config.moderation;
  config.warnTimeoutEnabled = true;
  config.warnTimeoutThreshold = 2;
  config.warnKickEnabled = true;
  config.warnKickThreshold = 3;
  config.warnBanEnabled = true;
  config.warnBanThreshold = 5;

  assert.equal(nextAutoAction(config, 1), 'none');
  assert.equal(nextAutoAction(config, 2), 'timeout');
  assert.equal(nextAutoAction(config, 3), 'kick');
  assert.equal(nextAutoAction(config, 5), 'ban');
  assert.equal(nextAutoAction(config, 99), 'ban');

  config.warnBanEnabled = false;
  assert.equal(nextAutoAction(config, 99), 'kick', 'un palier désactivé est ignoré');
});

test('le MP de sanction contient les informations essentielles', () => {
  const message = buildDirectMessage({
    guildName: 'Serveur Test',
    type: 'warn',
    reason: 'Spam en salon général',
    moderatorName: 'Modératrice',
    warnCount: 3,
    autoAction: 'kick',
    expiresAt: new Date('2026-06-01T00:00:00Z').toISOString(),
  });

  assert.match(message, /Serveur Test/);
  assert.match(message, /Spam en salon général/);
  assert.match(message, /Modératrice/);
  assert.match(message, /3/, 'le nombre d’avertissements actifs est affiché');
  assert.match(message, /expulsion/, 'la sanction automatique est annoncée');
  assert.match(message, /<t:\d+:F>/, 'la date d’expiration est au format Discord');
  assert.ok(message.length < 1900, 'le message tient dans la limite Discord');
});

test('auto-modération : invitations et liens', () => {
  const state = setup();
  const config = state.config.moderation;
  config.automodBlockInvites = true;
  config.automodBlockLinks = true;

  const invite = inspectMessage(config, context('Rejoins https://discord.gg/abcdef'));
  assert.equal(invite.rule, 'invite');
  assert.equal(invite.action, config.automodAction);

  const link = inspectMessage(config, context('Regarde https://exemple.fr/promo'));
  assert.equal(link.rule, 'link');

  config.automodLinkWhitelist = ['exemple.fr'];
  assert.equal(inspectMessage(config, context('Regarde https://exemple.fr/promo')).action, 'none');
  assert.equal(inspectMessage(config, context('Regarde https://sous.exemple.fr/x')).action, 'none', 'les sous-domaines suivent');
  assert.equal(inspectMessage(config, context('Regarde https://autre.fr/x')).rule, 'link');

  // les invitations restent des liens même si la règle « invitations » est coupée
  config.automodBlockInvites = false;
  assert.equal(inspectMessage(config, context('https://discord.gg/abcdef')).rule, 'link');

  assert.equal(isAllowedDomain('https://www.exemple.fr/page', ['exemple.fr']), true);
  assert.equal(isAllowedDomain('pasuneurl', ['exemple.fr']), false);
});

test('auto-modération : mentions, longueur, emojis, majuscules, doublons, mots interdits', () => {
  const state = setup();
  const config = state.config.moderation;
  config.automodBlockMassMentions = true;
  config.automodMaxMentions = 3;
  config.automodMaxLength = 50;
  config.automodMaxEmojis = 2;
  config.automodBlockCaps = true;
  config.automodCapsPercent = 80;
  config.automodCapsMinLength = 10;
  config.automodBlockDuplicates = true;
  config.automodDuplicateWindowSeconds = 30;
  config.automodBannedWords = ['mot interdit'];

  assert.equal(inspectMessage(config, context('salut', { mentionCount: 5 })).rule, 'mentions');
  assert.equal(inspectMessage(config, context('salut', { mentionCount: 3 })).action, 'none');
  assert.equal(inspectMessage(config, context('a'.repeat(80))).rule, 'length');
  assert.equal(inspectMessage(config, context('coucou', { emojiCount: 3 })).rule, 'emojis');
  assert.equal(inspectMessage(config, context('CECI EST HURLÉ EN MAJUSCULES')).rule, 'caps');
  assert.equal(inspectMessage(config, context('Court')).action, 'none', 'trop court pour la règle des majuscules');
  assert.equal(inspectMessage(config, context('un mot interdit ici')).rule, 'word');

  const now = Date.now();
  const repeat = inspectMessage(config, context('message répété ici', { previousContent: 'Message répété ici', previousAt: now - 5000, now }));
  assert.equal(repeat.rule, 'duplicate');
  const late = inspectMessage(config, context('message répété ici', { previousContent: 'Message répété ici', previousAt: now - 60_000, now }));
  assert.notEqual(late.rule, 'duplicate', 'hors de la fenêtre, le doublon passe');
});

test('auto-modération : exemptions et désactivation', () => {
  const state = setup();
  const config = state.config.moderation;
  config.automodBlockLinks = true;
  config.automodAction = 'timeout';
  config.automodTimeoutMinutes = 10;

  assert.equal(inspectMessage(config, context('https://x.fr')).action, 'timeout');

  assert.equal(inspectMessage(config, context('https://x.fr', { isBot: true })).action, 'none', 'les bots passent');

  config.automodIgnoredChannels = ['chan'];
  assert.equal(inspectMessage(config, context('https://x.fr')).action, 'none', 'salon ignoré');
  config.automodIgnoredChannels = [];

  config.automodIgnoredRoles = ['role-1'];
  assert.equal(inspectMessage(config, context('https://x.fr', { memberRoleIds: ['role-1'] })).action, 'none', 'rôle ignoré');

  config.automodEnabled = false;
  assert.equal(inspectMessage(config, context('https://x.fr')).action, 'none', 'auto-modération coupée');
});

test('comptage des emojis et ratio de majuscules', () => {
  assert.equal(countEmojis('salut <a:wave:123456789012345678> et <:smile:123456789012345679>'), 2);
  assert.equal(countEmojis('aucun emoji'), 0);
  assert.equal(uppercaseRatio('ABCD'), 100);
  assert.equal(uppercaseRatio('abcd'), 0);
  assert.equal(uppercaseRatio('ABcd'), 50);
  assert.equal(uppercaseRatio('1234'), 0, 'sans lettre, pas de ratio');
});
