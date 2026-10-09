import { defaultRng, type Rng } from './economy/core';
import type { Giveaway, GiveawayStatus, StoreState } from './types';

// ============================================================
//  Giveaways — logique pure (sans Discord)
//
//  Un giveaway est hébergé par l’équipe : créé avec /giveaway,
//  les membres participent via un bouton, le planificateur tire
//  les gagnants à l’heure dite. Ce module ne touche ni au client
//  Discord ni au magasin : il est testé directement avec node --test.
// ============================================================

/** Retrouve un giveaway par id complet, par préfixe (8 caractères) ou par libellé exact du lot. */
export function findGiveaway(state: StoreState, ref: string): Giveaway | undefined {
  const needle = ref.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    state.giveaways.find((giveaway) => giveaway.id.toLowerCase() === needle) ??
    state.giveaways.find((giveaway) => giveaway.id.toLowerCase().startsWith(needle)) ??
    state.giveaways.find((giveaway) => giveaway.prize.trim().toLowerCase() === needle)
  );
}

/**
 * Mélange la liste (Fisher-Yates) et tire `count` gagnants distincts.
 * Les identifiants de `exclude` (gagnants d’un tirage précédent, pour un
 * re-tirage) sont retirés du bassin. Le hasard est injecté (rng).
 */
export function drawWinners(
  participants: readonly string[],
  count: number,
  exclude: readonly string[] = [],
  rng: Rng = defaultRng,
): string[] {
  const banned = new Set(exclude);
  const pool = [...new Set(participants)].filter((id) => id && !banned.has(id));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const wanted = Math.max(0, Math.floor(count));
  return pool.slice(0, Math.min(wanted, pool.length));
}

/**
 * Ajoute ou retire un participant (toggle du bouton « Participer »).
 * Renvoie true si le membre rejoint, false s’il se désinscrit.
 */
export function toggleParticipant(giveaway: Giveaway, userId: string): boolean {
  const index = giveaway.participants.indexOf(userId);
  if (index >= 0) {
    giveaway.participants.splice(index, 1);
    return false;
  }
  giveaway.participants.push(userId);
  return true;
}

export function isParticipant(giveaway: Giveaway, userId: string): boolean {
  return giveaway.participants.includes(userId);
}

/** Un giveaway est-il encore ouvert aux participations ? */
export function isGiveawayOpen(giveaway: Giveaway, now: number = Date.now()): boolean {
  return giveaway.status === 'active' && new Date(giveaway.endsAt).getTime() > now;
}

/** Giveaways actifs dont l’heure de fin est atteinte (appelé par le planificateur). */
export function dueGiveaways(state: StoreState, now: number = Date.now()): Giveaway[] {
  return state.giveaways.filter(
    (giveaway) => giveaway.status === 'active' && new Date(giveaway.endsAt).getTime() <= now,
  );
}

export function activeGiveaways(state: StoreState): Giveaway[] {
  return state.giveaways.filter((giveaway) => giveaway.status === 'active');
}

/** Progression entre la création et la fin, bornée entre 0 et 100. */
export function giveawayProgress(giveaway: Giveaway, now: number = Date.now()): number {
  const start = new Date(giveaway.createdAt).getTime();
  const end = new Date(giveaway.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

const STATUS_META: Record<GiveawayStatus, { emoji: string; label: string }> = {
  active: { emoji: '🎉', label: 'En cours' },
  ended: { emoji: '🏆', label: 'Terminé' },
  cancelled: { emoji: '🚫', label: 'Annulé' },
};

export function giveawayStatusMeta(status: GiveawayStatus): { emoji: string; label: string } {
  return STATUS_META[status] ?? STATUS_META.active;
}

/** Ligne de synthèse pour /giveaway liste (id court, lot, fin relative, participants). */
export function summarizeGiveaway(giveaway: Giveaway, now: number = Date.now()): string {
  const meta = giveawayStatusMeta(giveaway.status);
  const endTs = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const end = giveaway.status === 'active' ? `<t:${endTs}:R>` : `terminé <t:${endTs}:R>`;
  const winners =
    giveaway.status === 'ended' ? ` · 🏆 ${giveaway.winners.length} gagnant(s)` : '';
  return `• \`${giveaway.id.slice(0, 8)}\` ${meta.emoji} **${giveaway.prize}** — ${end} · 👥 ${giveaway.participants.length} participant(s)${winners}`;
}
