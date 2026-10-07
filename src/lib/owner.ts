// ============================================================
//  Identifiants d'administration
//  Module volontairement sans dépendance à Next.js : il est
//  utilisable par le bot comme par le panel (et par les tests).
// ============================================================

export function isOwner(userId: string): boolean {
  const owner = process.env.OWNER_DISCORD_ID?.trim();
  return Boolean(owner && owner === userId);
}

export function adminIdsFromEnv(): string[] {
  return (process.env.ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isEnvAdmin(userId: string): boolean {
  return isOwner(userId) || adminIdsFromEnv().includes(userId);
}
