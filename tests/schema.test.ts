import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLACKJACK_FIELDS, BLACKJACK_SECTIONS } from '../src/lib/blackjack/config';
import { ECONOMY_FIELDS, ECONOMY_SECTIONS } from '../src/lib/economy/config';
import { MODERATION_FIELDS, MODERATION_SECTIONS } from '../src/lib/moderation/config';
import { SHOP_FIELDS, SHOP_SECTIONS } from '../src/lib/shop/config';
import { UI_FIELDS, UI_SECTIONS } from '../src/lib/ui/config';
import { emptyState } from '../src/lib/config';
import {
  countOptions,
  diffKeys,
  duplicateKeys,
  fieldsBySection,
  mergeValues,
  missingSections,
  normalizeConfig,
  readFormData,
  type ConfigValues,
  type FieldDef,
} from '../src/lib/schema-fields';

const SUITES = [
  { name: 'économie', fields: ECONOMY_FIELDS, sections: ECONOMY_SECTIONS },
  { name: 'blackjack', fields: BLACKJACK_FIELDS, sections: BLACKJACK_SECTIONS },
  { name: 'boutique', fields: SHOP_FIELDS, sections: SHOP_SECTIONS },
  { name: 'modération', fields: MODERATION_FIELDS, sections: MODERATION_SECTIONS },
  { name: 'interface', fields: UI_FIELDS, sections: UI_SECTIONS },
] as const;

function form(entries: Record<string, string | null>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== null) data.set(key, value);
  }
  return data;
}

test('chaque configuration décrit toutes ses options', () => {
  const state = emptyState();
  const configs = {
    économie: state.config.economy,
    blackjack: state.config.blackjack,
    boutique: state.config.shop,
    modération: state.config.moderation,
    interface: state.config.ui,
  } as Record<string, ConfigValues>;

  for (const suite of SUITES) {
    assert.equal(duplicateKeys(suite.fields).length, 0, `${suite.name} : clés dupliquées`);
    assert.equal(missingSections(suite.fields, suite.sections).length, 0, `${suite.name} : section inconnue`);
    assert.equal(countOptions(suite.fields), suite.fields.length, `${suite.name} : options dupliquées`);

    const diff = diffKeys(suite.fields, configs[suite.name]);
    assert.deepEqual(diff.missing, [], `${suite.name} : options sans valeur par défaut`);
    assert.deepEqual(diff.extra, [], `${suite.name} : valeurs par défaut orphelines`);
  }
});

test('le total des options configurables dépasse 250', () => {
  const total = SUITES.reduce((sum, suite) => sum + countOptions(suite.fields), 0);
  assert.ok(total > 250, `total attendu > 250, obtenu ${total}`);
  // l'économie seule doit rester au-delà de 100 options
  assert.ok(countOptions(ECONOMY_FIELDS) > 100, 'l’économie doit dépasser 100 options');
});

test('toutes les sections sont ordonnées et référencées', () => {
  for (const suite of SUITES) {
    const grouped = fieldsBySection(suite.fields, suite.sections);
    const covered = grouped.reduce((sum, group) => sum + group.fields.length, 0);
    assert.equal(covered, suite.fields.length, `${suite.name} : champ non rattaché à une section`);
    for (const group of grouped) {
      assert.ok(group.section.emoji, `${suite.name} : section ${group.section.id} sans emoji`);
    }
  }
});

test('readFormData applique le type de chaque champ', () => {
  const fields: FieldDef[] = [
    { key: 'flag', label: 'Flag', kind: 'boolean', section: 's' },
    { key: 'count', label: 'Nombre', kind: 'integer', section: 's' },
    { key: 'ratio', label: 'Ratio', kind: 'percent', section: 's' },
    { key: 'text', label: 'Texte', kind: 'string', section: 's' },
    { key: 'list', label: 'Liste', kind: 'list', section: 's' },
    { key: 'role', label: 'Rôle', kind: 'roleOne', section: 's' },
    { key: 'roles', label: 'Rôles', kind: 'role', section: 's' },
  ];
  const defaults: ConfigValues = {
    flag: true,
    count: 5,
    ratio: 1,
    text: 'défaut',
    list: ['a'],
    role: '',
    roles: [],
  };

  const read = readFormData(
    fields,
    form({
      flag: 'on',
      count: ' 42 ',
      ratio: '2,5',
      text: 'bonjour',
      list: 'x, y\nz',
      role: '<@&123456789012345678>',
      roles: '123456789012345678, 876543210987654321, pas-un-id',
    }),
    defaults,
  );

  assert.equal(read.flag, true);
  assert.equal(read.count, 42);
  assert.equal(read.ratio, 2.5);
  assert.equal(read.text, 'bonjour');
  assert.deepEqual(read.list, ['x', 'y', 'z']);
  assert.equal(read.role, '123456789012345678');
  assert.deepEqual(read.roles, ['123456789012345678', '876543210987654321']);

  // un champ absent retombe sur la valeur par défaut, sauf les booléens
  const empty = readFormData(fields, form({}), defaults);
  assert.equal(empty.flag, false, 'une case absente vaut false');
  assert.equal(empty.count, 5);
  assert.equal(empty.text, 'défaut');
});

test('normalizeConfig borne, valide et signale les corrections', () => {
  const fields: FieldDef[] = [
    { key: 'percent', label: 'Pourcentage', kind: 'percent', section: 's', min: 0, max: 100 },
    { key: 'minutes', label: 'Minutes', kind: 'minutes', section: 's', min: 1, max: 60 },
    { key: 'choice', label: 'Choix', kind: 'select', section: 's', choices: [{ value: 'a', label: 'A' }] },
    { key: 'role', label: 'Rôle', kind: 'roleOne', section: 's' },
  ];
  const defaults: ConfigValues = { percent: 10, minutes: 5, choice: 'a', role: '' };

  const { value, issues } = normalizeConfig(
    fields,
    { percent: 480, minutes: 0.4, choice: 'z', role: 'abc' },
    defaults,
  );

  assert.equal(value.percent, 100, 'le pourcentage est ramené au maximum');
  assert.equal(value.minutes, 1, 'les minutes sont bornées au minimum');
  assert.equal(value.choice, 'a', 'une sélection inconnue retombe sur le défaut');
  assert.equal(value.role, '', 'un identifiant invalide est effacé');
  assert.equal(issues.length, 3, `3 corrections attendues, ${issues.length} obtenues`);

  const clean = normalizeConfig(fields, { percent: 25, minutes: 12, choice: 'a', role: '123456789012345678' }, defaults);
  assert.equal(clean.issues.length, 0);
  assert.equal(clean.value.role, '123456789012345678');
});

test('mergeValues ignore les clés inconnues et clone les listes', () => {
  const base: ConfigValues = { a: 1, list: ['x'] };
  const merged = mergeValues(base, { a: 2, list: ['y', 'z'], ghost: 'non' } as Partial<ConfigValues>);
  assert.equal(merged.a, 2);
  assert.deepEqual(merged.list, ['y', 'z']);
  assert.equal('ghost' in merged, false, 'les clés inconnues ne doivent pas entrer');

  (merged.list as string[]).push('w');
  assert.deepEqual(base.list, ['x'], 'la base ne doit pas être mutée');
  assert.deepEqual(mergeValues(base, null), base);
});
