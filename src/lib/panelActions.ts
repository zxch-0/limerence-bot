import { revalidatePath } from 'next/cache';
import type { Guild } from 'discord.js';
import { requireAdmin } from './auth';
import { getGuild } from './discord/client';
import type { ActionState } from './types';

// ============================================================
//  Aides partagées par les server actions du panel.
//  Ce module n'est PAS une « server action » : il n'exporte que
//  des helpers synchrones ou utilitaires, importés par les
//  fichiers d'actions qui, eux, portent 'use server'.
// ============================================================

export const NOT_AUTHORIZED: ActionState = { ok: false, message: 'Session administrateur requise.' };

export function fail(message: string): ActionState {
  return { ok: false, message };
}

export function ok(message: string): ActionState {
  return { ok: true, message };
}

/** Rafraîchit l'ensemble du panel après une modification d'état. */
export function refreshPanel(): void {
  revalidatePath('/', 'layout');
}

export function bool(fd: FormData, key: string): boolean {
  const value = fd.get(key);
  return value === 'on' || value === 'true' || value === '1';
}

export function str(fd: FormData, key: string, fallback = ''): string {
  const value = fd.get(key);
  const text = value === null ? '' : String(value).trim();
  return text === '' ? fallback : text;
}

/** Entier tolérant (virgule, espaces). Renvoie `fallback` si illisible. */
export function int(fd: FormData, key: string, fallback: number): number {
  const value = fd.get(key);
  if (value === null || String(value).trim() === '') return fallback;
  const parsed = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

/** Nombre décimal tolérant (pourcentages, ratios). */
export function num(fd: FormData, key: string, fallback: number): number {
  const value = fd.get(key);
  if (value === null || String(value).trim() === '') return fallback;
  const parsed = Number(String(value).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Liste d'identifiants Discord : n'importe quel texte d'entrée est nettoyé. */
export function snowflakeList(fd: FormData, key: string): string[] {
  const value = fd.get(key);
  if (value === null) return [];
  return String(value)
    .split(/[\s,;\n]+/)
    .map((item) => item.replace(/\D/g, ''))
    .filter((item) => item.length >= 17 && item.length <= 20)
    .slice(0, 50);
}

/** Identifiant Discord unique ('' si absent). */
export function snowflake(fd: FormData, key: string): string {
  const digits = String(fd.get(key) ?? '').replace(/\D/g, '');
  return digits.length >= 17 && digits.length <= 20 ? digits : '';
}

/** Vérifie la session admin. Renvoie l'admin connecté ou null. */
export async function currentAdmin() {
  return requireAdmin();
}

/**
 * Récupère le serveur Discord géré par le bot.
 * En mode démo (bot non configuré) renvoie une erreur explicite plutôt
 * que de faire échouer silencieusement l'action.
 */
export async function requireGuild(): Promise<{ guild: Guild } | { error: string }> {
  try {
    const guild = await getGuild(false);
    if (!guild) {
      return {
        error:
          'Bot non connecté : cette action agit sur Discord en direct. Ajoute DISCORD_TOKEN et invite le bot sur ton serveur.',
      };
    }
    return { guild };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Extrait l'identifiant Discord d'une mention, d'un identifiant brut ou d'un tag. */
export function parseUserTarget(input: string): string | null {
  const text = input.trim();
  const mention = text.match(/^<@!?(\d{17,20})>$/);
  if (mention) return mention[1];
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 17 && digits.length <= 20) return digits;
  return null;
}
