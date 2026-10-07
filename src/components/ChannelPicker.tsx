import type { ChannelOption } from '@/lib/demo';

// ============================================================
//  Sélecteur de salon Discord (composant serveur).
//  Les salons sont groupés par catégorie quand l'information
//  est disponible.
// ============================================================

export function ChannelPicker({
  name,
  value,
  options,
  types = ['text'],
  allowEmpty = true,
  emptyLabel = '— aucun —',
  className = 'field',
  required,
}: {
  name: string;
  value: string;
  options: ChannelOption[];
  types?: ChannelOption['type'][];
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  required?: boolean;
}) {
  const filtered = options.filter((option) => types.includes(option.type));
  const groups = new Map<string, ChannelOption[]>();
  for (const option of filtered) {
    const key = option.parentName ?? 'Sans catégorie';
    groups.set(key, [...(groups.get(key) ?? []), option]);
  }

  // L'identifiant enregistré n'est peut-être plus dans la liste
  // (salon supprimé ou bot hors ligne) : on l'affiche quand même.
  const missing = value && !filtered.some((option) => option.id === value);

  return (
    <select name={name} className={className} required={required} defaultValue={value}>
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {missing ? <option value={value}>{`⚠️ salon introuvable (${value})`}</option> : null}
      {[...groups.entries()].map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map((option) => (
            <option key={option.id} value={option.id}>
              {option.type === 'category' ? '📁 ' : option.type === 'voice' ? '🔊 ' : '# '}
              {option.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Sélecteur de catégorie (pour les vocaux temporaires). */
export function CategoryPicker({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: ChannelOption[];
}) {
  return (
    <ChannelPicker name={name} value={value} options={options} types={['category']} emptyLabel="— aucune catégorie —" />
  );
}

/** Sélecteur de salon vocal. */
export function VoicePicker({ name, value, options }: { name: string; value: string; options: ChannelOption[] }) {
  return <ChannelPicker name={name} value={value} options={options} types={['voice']} />;
}
