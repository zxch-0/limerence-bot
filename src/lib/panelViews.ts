import type { ConfigSectionView } from '@/components/ConfigEditor';
import type { ConfigValues, FieldDef, SectionDef } from './schema-fields';

// ============================================================
//  Adapte les métadonnées de configuration (champs + sections)
//  au format attendu par l'éditeur du panel.
// ============================================================

export function sectionViews(
  fields: readonly FieldDef[],
  sections: readonly SectionDef[],
): ConfigSectionView[] {
  return sections.map((section) => ({
    id: section.id,
    label: section.label,
    emoji: section.emoji,
    description: section.description,
    fields: fields.filter((field) => field.section === section.id),
  }));
}

/** Copie plate d'une configuration, prête pour l'éditeur. */
export function valuesOf(config: Record<string, boolean | number | string | string[]>): ConfigValues {
  const values: ConfigValues = {};
  for (const [key, value] of Object.entries(config)) {
    values[key] = Array.isArray(value) ? [...value] : value;
  }
  return values;
}
