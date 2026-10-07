// ============================================================
//  Moteur de configuration générique
//
//  Toutes les configurations « à plus de 100 options » (économie,
//  blackjack, boutique, modération) sont décrites UNE SEULE fois
//  sous forme de liste de champs. Cette description sert à :
//    • générer le type TypeScript (via les types mappés)
//    • générer l'interface du panel (rendu + recherche + sections)
//    • lire et valider les formulaires (bornes, types, listes)
//    • compter précisément le nombre d'options disponibles
//
//  Aucune logique n'est dupliquée : une option ajoutée ici apparaît
//  automatiquement dans le panel et est validée à l'enregistrement.
// ============================================================

export type FieldKind =
  | 'boolean'
  | 'integer'
  | 'number'
  | 'percent'
  | 'minutes'
  | 'hours'
  | 'string'
  | 'multiline'
  | 'list'
  | 'channel'
  | 'role'
  | 'channelOne'
  | 'roleOne'
  | 'select'
  | 'color';

export interface FieldChoice {
  value: string;
  label: string;
}

export interface FieldDef {
  /** clé dans l'objet de configuration (plat) */
  key: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  /** identifiant de section (voir SectionDef.id) */
  section: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  choices?: FieldChoice[];
  maxLength?: number;
  maxItems?: number;
  /** l'option n'a d'effet que si ce booléen est activé */
  dependsOn?: string;
}

export interface SectionDef {
  id: string;
  label: string;
  emoji: string;
  description?: string;
}

/** Valeur possible d'une option. */
export type ConfigValue = boolean | number | string | string[];

/** Objet de configuration plat. */
export type ConfigValues = Record<string, ConfigValue>;

/** Type d'une option en fonction de son `kind`. */
export type FieldValue<K extends FieldKind> = K extends 'boolean'
  ? boolean
  : K extends 'list' | 'channel' | 'role'
    ? string[]
    : K extends 'integer' | 'number' | 'percent' | 'minutes' | 'hours'
      ? number
      : string;
// 'string' | 'multiline' | 'select' | 'color' | 'channelOne' | 'roleOne' -> string

/** Construit le type d'une configuration à partir de sa liste de champs. */
export type ConfigOf<F extends readonly FieldDef[]> = {
  [K in F[number] as K['key']]: FieldValue<K['kind']>;
};

// ------------------------------------------------------------
//  Lecture d'un FormData
// ------------------------------------------------------------

function splitList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isSnowflake(value: string): boolean {
  return /^\d{15,25}$/.test(value);
}

/**
 * Lit un FormData en appliquant le type de chaque champ.
 * Toute valeur absente ou illisible retombe sur la valeur par défaut :
 * un formulaire incomplet ne peut jamais produire une configuration cassée.
 * Seule exception : les booléens absents valent `false`, car c'est ce
 * qu'un formulaire HTML envoie pour une case décochée.
 */
export function readFormData(
  fields: readonly FieldDef[],
  formData: FormData,
  defaults: ConfigValues,
): ConfigValues {
  const raw: ConfigValues = {};
  for (const field of fields) {
    const fallback = defaults[field.key];
    const entry = formData.get(field.key);

    if (field.kind === 'boolean') {
      // Un formulaire HTML n'envoie rien pour une case décochée :
      // « absent » signifie donc bien « faux », jamais la valeur par défaut.
      const rawValue = entry === null ? null : String(entry);
      raw[field.key] = rawValue !== null && (rawValue === 'on' || rawValue === 'true' || rawValue === '1');
      continue;
    }

    const text = entry === null ? '' : String(entry).trim();

    if (text === '') {
      raw[field.key] = fallback;
      continue;
    }

    switch (field.kind) {
      case 'integer':
      case 'number':
      case 'percent':
      case 'minutes':
      case 'hours': {
        const parsed = Number(text.replace(',', '.').replace(/\s/g, ''));
        raw[field.key] = Number.isFinite(parsed) ? parsed : fallback;
        break;
      }
      case 'list': {
        raw[field.key] = splitList(text).slice(0, field.maxItems ?? 50);
        break;
      }
      case 'channel':
      case 'role': {
        // Seuls les identifiants Discord valides sont conservés :
        // un <#id>, <@&id> ou un nombre brut sont acceptés, le reste est ignoré.
        const ids = splitList(text)
          .map((entry) => entry.replace(/\D/g, ''))
          .filter((entry) => isSnowflake(entry));
        raw[field.key] = Array.from(new Set(ids)).slice(0, field.maxItems ?? 50);
        break;
      }
      case 'channelOne':
      case 'roleOne': {
        const digits = text.replace(/\D/g, '');
        raw[field.key] = isSnowflake(digits) ? digits : '';
        break;
      }
      default:
        raw[field.key] = text.slice(0, field.maxLength ?? 500);
    }
  }
  return raw;
}

// ------------------------------------------------------------
//  Validation / normalisation
// ------------------------------------------------------------

export interface NormalizeIssue {
  key: string;
  label: string;
  message: string;
}

export interface NormalizeResult {
  value: ConfigValues;
  issues: NormalizeIssue[];
}

function clampNumber(value: number, field: FieldDef): number {
  let result = value;
  if (field.kind === 'integer' || field.kind === 'minutes' || field.kind === 'hours') {
    result = Math.round(result);
  }
  if (typeof field.min === 'number' && result < field.min) result = field.min;
  if (typeof field.max === 'number' && result > field.max) result = field.max;
  return result;
}

/**
 * Normalise une configuration brute : types forcés, bornes appliquées,
 * listes nettoyées, sélections vérifiées. Renvoie aussi la liste des
 * valeurs corrigées pour que le panel puisse les afficher.
 */
export function normalizeConfig(
  fields: readonly FieldDef[],
  raw: Partial<ConfigValues> | undefined,
  defaults: ConfigValues,
): NormalizeResult {
  const issues: NormalizeIssue[] = [];
  const value: ConfigValues = {};

  for (const field of fields) {
    const fallback = defaults[field.key];
    const incoming = raw?.[field.key];
    const label = field.label;

    if (incoming === undefined || incoming === null) {
      value[field.key] = fallback;
      continue;
    }

    switch (field.kind) {
      case 'boolean': {
        value[field.key] = typeof incoming === 'boolean' ? incoming : Boolean(incoming);
        break;
      }
      case 'integer':
      case 'number':
      case 'percent':
      case 'minutes':
      case 'hours': {
        const parsed = typeof incoming === 'number' ? incoming : Number(String(incoming));
        if (!Number.isFinite(parsed)) {
          issues.push({ key: field.key, label, message: `valeur ignorée (« ${String(incoming)} »)` });
          value[field.key] = fallback;
          break;
        }
        const clamped = clampNumber(parsed, field);
        if (clamped !== parsed) {
          issues.push({
            key: field.key,
            label,
            message: `${parsed} ramené dans l'intervalle ${field.min ?? '-∞'} → ${field.max ?? '+∞'}`,
          });
        }
        value[field.key] = clamped;
        break;
      }
      case 'list': {
        const items = (Array.isArray(incoming) ? incoming : splitList(String(incoming)))
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, field.maxItems ?? 50);
        const seen = new Set<string>();
        const unique = items.filter((item) => (seen.has(item) ? false : (seen.add(item), true)));
        if (unique.length !== items.length) {
          issues.push({ key: field.key, label, message: 'doublons retirés' });
        }
        value[field.key] = unique;
        break;
      }
      case 'channel':
      case 'role': {
        const items = (Array.isArray(incoming) ? incoming : splitList(String(incoming)))
          .map((item) => String(item).replace(/\D/g, ''))
          .filter((item) => isSnowflake(item))
          .slice(0, field.maxItems ?? 25);
        value[field.key] = Array.from(new Set(items));
        break;
      }
      case 'channelOne':
      case 'roleOne': {
        const digits = String(incoming).replace(/\D/g, '');
        if (!digits) {
          value[field.key] = '';
          break;
        }
        if (!isSnowflake(digits)) {
          issues.push({ key: field.key, label, message: 'identifiant Discord invalide' });
          value[field.key] = fallback;
          break;
        }
        value[field.key] = digits;
        break;
      }
      case 'select': {
        const text = String(incoming).trim();
        const allowed = field.choices ?? [];
        if (!allowed.some((choice) => choice.value === text)) {
          issues.push({ key: field.key, label, message: `choix « ${text} » inconnu` });
          value[field.key] = fallback;
          break;
        }
        value[field.key] = text;
        break;
      }
      case 'color': {
        const text = String(incoming).trim().toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(text)) {
          issues.push({ key: field.key, label, message: 'couleur invalide, format #RRGGBB attendu' });
          value[field.key] = fallback;
          break;
        }
        value[field.key] = text;
        break;
      }
      default: {
        const text = String(incoming).trim().slice(0, field.maxLength ?? 500);
        if (!text && fallback !== '') {
          issues.push({ key: field.key, label, message: 'valeur vide ignorée' });
          value[field.key] = fallback;
          break;
        }
        value[field.key] = text;
      }
    }
  }

  return { value, issues };
}

// ------------------------------------------------------------
//  Helpers divers
// ------------------------------------------------------------

export function countOptions(fields: readonly FieldDef[]): number {
  return new Set(fields.map((field) => field.key)).size;
}

export function fieldsBySection(
  fields: readonly FieldDef[],
  sections: readonly SectionDef[],
): Array<{ section: SectionDef; fields: FieldDef[] }> {
  return sections
    .map((section) => ({
      section,
      fields: fields.filter((field) => field.section === section.id),
    }))
    .filter((group) => group.fields.length > 0);
}

export function missingSections(
  fields: readonly FieldDef[],
  sections: readonly SectionDef[],
): string[] {
  const known = new Set(sections.map((section) => section.id));
  return fields.filter((field) => !known.has(field.section)).map((field) => field.section);
}

export function duplicateKeys(fields: readonly FieldDef[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.key)) duplicates.add(field.key);
    seen.add(field.key);
  }
  return Array.from(duplicates);
}

/** Vérifie qu'un objet de valeurs couvre exactement la liste de champs. */
export function diffKeys(
  fields: readonly FieldDef[],
  values: ConfigValues,
): { missing: string[]; extra: string[] } {
  const keys = new Set(fields.map((field) => field.key));
  const valueKeys = Object.keys(values);
  return {
    missing: fields.map((field) => field.key).filter((key) => !(key in values)),
    extra: valueKeys.filter((key) => !keys.has(key)),
  };
}

/**
 * Fusion à un niveau : garde `override`, complète avec `base`.
 * Les clés inconnues (anciennes versions, données corrompues) sont ignorées :
 * la configuration ne peut jamais se remplir d'options fantômes.
 */
export function mergeValues<T extends ConfigValues>(base: T, override?: Partial<T> | null): T {
  if (!override || typeof override !== 'object') return structuredClone(base);
  const result = structuredClone(base) as ConfigValues;
  for (const [key, value] of Object.entries(override)) {
    if (!(key in result)) continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) result[key] = Array.isArray(result[key]) ? [...value] : value;
    else result[key] = value;
  }
  return result as T;
}
