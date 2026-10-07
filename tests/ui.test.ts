import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState } from '../src/lib/config';
import { UI_FIELDS, UI_SECTIONS, UI_OPTIONS_COUNT, DEFAULT_UI_CONFIG } from '../src/lib/ui/config';
import {
  accentColor,
  cardFor,
  divider,
  featureFlags,
  hubCard,
  parseColor,
  progressBar,
  sectionById,
  shortDuration,
  templateReplace,
  visibleSections,
  UI_SECTIONS as BOT_SECTIONS,
  type UiContext,
} from '../src/bot/ui';
import { hasExplicitWelcomeChannel, renderWelcome, welcomeChannelId } from '../src/lib/welcome';
import type { AppConfig, StoreState } from '../src/lib/types';

// ============================================================
//  Système d'interface du bot + message de bienvenue.
// ============================================================

const CTX: UiContext = {
  userId: '111111111111111111',
  userName: 'Test#0001',
  isStaff: true,
  guildName: 'Serveur de test',
  memberCount: 42,
  channelCount: 8,
  roleCount: 5,
  webUrl: 'https://panel.test',
};

function state(): StoreState {
  return emptyState();
}

function config(): AppConfig {
  return emptyState().config;
}

// ------------------------------------------------------------
//  Message de bienvenue
// ------------------------------------------------------------

test('renderWelcome remplace les jetons français et les anciens jetons anglais', () => {
  const vars = {
    userId: '111111111111111111',
    displayName: 'Léa',
    username: 'lea_pseudo',
    guildName: 'Limerence',
    memberCount: 128,
    balance: '500 pièces',
    invites: 3,
  };

  assert.equal(
    renderWelcome('Salut {membre} ({pseudo}) sur {serveur} : {membres} membres, solde {compte}, {invites} invites', vars),
    'Salut <@111111111111111111> (Léa) sur Limerence : 128 membres, solde 500 pièces, 3 invites',
  );

  // anciens jetons conservés pour ne casser aucune configuration existante
  assert.equal(
    renderWelcome('{user} rejoint {server} ({members}) — {balance} / {name}', vars),
    'lea_pseudo rejoint Limerence (128) — 500 pièces / Léa',
  );
});

test('renderWelcome laisse intacts les jetons inconnus', () => {
  const text = renderWelcome('{membre} {inconnu}', {
    userId: '1',
    displayName: 'x',
    username: 'x',
    guildName: 'g',
    memberCount: 1,
    balance: '0',
  });
  assert.equal(text, '<@1> {inconnu}');
});

test('welcomeChannelId privilégie le salon choisi, puis les emplacements', () => {
  const chosen = '123456789012345678';
  const slot = '234567890123456789';
  const general = '345678901234567890';

  const full = config();
  full.welcome.channelId = chosen;
  full.channels.welcome = slot;
  full.channels.general = general;
  assert.equal(welcomeChannelId(full), chosen, 'le salon choisi gagne');
  assert.equal(hasExplicitWelcomeChannel(full), true);

  const slotOnly = config();
  slotOnly.welcome.channelId = '';
  slotOnly.channels.welcome = slot;
  slotOnly.channels.general = general;
  assert.equal(welcomeChannelId(slotOnly), slot, 'à défaut, l’emplacement « Bienvenue »');
  assert.equal(hasExplicitWelcomeChannel(slotOnly), false);

  const generalOnly = config();
  generalOnly.welcome.channelId = '';
  generalOnly.channels.general = general;
  assert.equal(welcomeChannelId(generalOnly), general, 'puis l’emplacement « Salon principal »');

  const none = config();
  assert.equal(welcomeChannelId(none), '', 'rien de configuré → aucun salon');

  const garbage = config();
  garbage.welcome.channelId = 'pas-un-id';
  assert.equal(welcomeChannelId(garbage), '', 'un identifiant invalide est ignoré');
});

// ------------------------------------------------------------
//  Thème
// ------------------------------------------------------------

test('parseColor accepte le hex, le dièse et retombe sur la couleur par défaut', () => {
  assert.equal(parseColor('#c9b8ff'), 0xc9b8ff);
  assert.equal(parseColor('c9b8ff'), 0xc9b8ff);
  assert.equal(parseColor('#zzzzzz', 0x123456), 0x123456);
  assert.equal(parseColor('', 0x123456), 0x123456);
  assert.equal(accentColor({ ...DEFAULT_UI_CONFIG, accentColor: '#ff0000' }), 0xff0000);
});

test('divider et progressBar suivent le thème', () => {
  const ui = { ...DEFAULT_UI_CONFIG, showDivider: true, divider: '━' };
  assert.equal(divider(ui).length, 12);
  assert.equal(divider({ ...ui, showDivider: false }), '', 'séparateur coupé');

  const bar = progressBar({ ...DEFAULT_UI_CONFIG, cardShowProgressBar: true, cardProgressBlocks: 10 }, 25, 100);
  assert.equal(bar, '▰▰▰▱▱▱▱▱▱▱ 25%', '25 % de 10 blocs → 3 blocs pleins (arrondi)');
  assert.equal(progressBar({ ...DEFAULT_UI_CONFIG, cardShowProgressBar: false }, 1, 2), '', 'barre coupée');
  assert.equal(
    progressBar({ ...DEFAULT_UI_CONFIG, cardShowProgressBar: true, cardProgressBlocks: 10 }, 10, 0),
    '▰'.repeat(10),
    'un plafond de 0 signifie « complet »',
  );
});

test('templateReplace et shortDuration', () => {
  assert.equal(templateReplace('{a} et {b}', { a: 'un', b: 'deux' }), 'un et deux');
  assert.equal(templateReplace('{a} {c}', { a: 'un' }), 'un {c}');
  assert.equal(shortDuration(45), '45s');
  assert.equal(shortDuration(600), '10 min');
  assert.equal(shortDuration(7200), '2 h');
  assert.equal(shortDuration(172_800), '2 j');
});

// ------------------------------------------------------------
//  Sections
// ------------------------------------------------------------

test('visibleSections applique les options, les fonctions coupées et les droits', () => {
  const app = config();
  const features = featureFlags(app);
  assert.equal(features.economy, app.economy.enabled);
  assert.equal(features.blackjack, app.economy.enabled && app.blackjack.enabled);
  assert.equal(features.shop, app.economy.enabled && app.shop.enabled);

  const all = visibleSections(DEFAULT_UI_CONFIG, features, true);
  assert.equal(all.length, BOT_SECTIONS.length, 'tout est visible pour un administrateur');

  const member = visibleSections({ ...DEFAULT_UI_CONFIG, moderationStaffOnly: true }, features, false);
  assert.equal(member.some((section) => section.id === 'moderation'), false, 'la modération est masquée');
  assert.ok(member.length < all.length);

  const hidden = visibleSections({ ...DEFAULT_UI_CONFIG, hideDisabledSections: true }, {
    economy: false,
    blackjack: false,
    shop: false,
    moderation: true,
    community: true,
  }, true);
  const ids = hidden.map((section) => section.id);
  assert.ok(!ids.includes('economy'), 'économie coupée → section masquée');
  assert.ok(!ids.includes('blackjack'));
  assert.ok(!ids.includes('shop'));
  assert.ok(ids.includes('info'), 'la section serveur ne dépend d’aucune fonction');

  const off = visibleSections({ ...DEFAULT_UI_CONFIG, sectionShop: false }, features, true);
  assert.equal(off.some((section) => section.id === 'shop'), false, 'option de section coupée');

  assert.equal(sectionById('economy')?.label, 'Économie');
  assert.equal(sectionById('inconnu'), undefined);
});

// ------------------------------------------------------------
//  Cartes
// ------------------------------------------------------------

test('hubCard suit les options d’affichage', () => {
  const data = state();
  const app = config();

  const full = hubCard(data, app, CTX, visibleSections(DEFAULT_UI_CONFIG, featureFlags(app), true));
  assert.equal(full.section, 'hub');
  assert.ok(full.fields.some((field) => field.name.includes('Ton compte')), 'compte affiché');
  assert.ok(full.description.includes('Panel'), 'lien du panel affiché');

  const bare = hubCard(
    data,
    { ...app, ui: { ...app.ui, hubShowAccount: false, hubShowStats: false, hubShowWebLink: false } },
    CTX,
    [],
  );
  assert.equal(bare.fields.length, 0, 'rien à afficher si tout est coupé');
});

test('cardFor ne crée aucun compte : le rendu reste sans effet de bord', () => {
  const data = state();
  const app = config();
  const before = Object.keys(data.accounts).length;

  for (const id of ['hub', 'economy', 'blackjack', 'shop', 'moderation', 'community', 'info'] as const) {
    const card = cardFor(id, data, app, CTX, visibleSections(DEFAULT_UI_CONFIG, featureFlags(app), true));
    assert.equal(card.section, id, `${id} : section de la carte`);
    assert.ok(card.title.length > 0, `${id} : titre`);
    assert.ok(card.description.length <= 4000, `${id} : description trop longue`);
  }

  assert.equal(Object.keys(data.accounts).length, before, 'aucun compte fantôme ne doit être créé');
});

test('l’interface expose toutes ses options et sections', () => {
  // 39 options réparties dans les 4 sections de configuration
  assert.equal(UI_OPTIONS_COUNT, UI_FIELDS.length);
  assert.equal(UI_OPTIONS_COUNT, Object.keys(DEFAULT_UI_CONFIG).length);
  assert.equal(UI_SECTIONS.length, 4, 'thème / menu central / sections / cartes');
  for (const field of UI_FIELDS) {
    assert.ok(
      UI_SECTIONS.some((section) => section.id === field.section),
      `champ ${field.key} rattaché à une section inconnue`,
    );
  }

  // le registre des sections affichées dans Discord
  assert.equal(BOT_SECTIONS.length, 6, 'économie, blackjack, boutique, modération, communauté, serveur');
  for (const section of BOT_SECTIONS) {
    assert.ok(section.flag in DEFAULT_UI_CONFIG, `option d’activation manquante pour ${section.id}`);
    assert.ok(section.shortcuts.length > 0, `aucun raccourci pour ${section.id}`);
  }
});
