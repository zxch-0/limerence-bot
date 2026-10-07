import type { RoleOption } from '@/lib/demo';

// ============================================================
//  Sélecteur de rôle Discord (composant serveur).
// ============================================================

export function RolePicker({
  name,
  value,
  roles,
  allowEmpty = true,
  emptyLabel = '— aucun rôle —',
  className = 'field',
}: {
  name: string;
  value: string;
  roles: RoleOption[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const missing = value && !roles.some((role) => role.id === value);
  return (
    <select name={name} className={className} defaultValue={value}>
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {missing ? <option value={value}>{`⚠️ rôle introuvable (${value})`}</option> : null}
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          @{role.name}
        </option>
      ))}
    </select>
  );
}
