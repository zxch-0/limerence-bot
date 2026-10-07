import { randomUUID } from 'node:crypto';
import type { ModCase, ModCaseType, ModerationConfig, StoreState } from '../types';

// ============================================================
//  Dossiers de modération (warn, mute, kick, ban, note…)
//  Chaque sanction crée un dossier numéroté ; les avertissements
//  actifs déclenchent des sanctions automatiques paramétrables.
// ============================================================

export const CASE_TYPE_LABELS: Record<ModCaseType, string> = {
  warn: 'Avertissement',
  timeout: 'Mute temporaire',
  untimeout: 'Fin de mute',
  kick: 'Expulsion',
  ban: 'Bannissement',
  unban: 'Débannissement',
  softban: 'Softban',
  note: 'Note',
  automod: 'Auto-modération',
};

export const CASE_TYPE_EMOJI: Record<ModCaseType, string> = {
  warn: '⚠️',
  timeout: '🔇',
  untimeout: '🔊',
  kick: '👢',
  ban: '⛔',
  unban: '✅',
  softban: '🌀',
  note: '📝',
  automod: '🤖',
};

export interface CreateCaseInput {
  guildId: string;
  type: ModCaseType;
  userId: string;
  userName: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  expiresAt?: string;
  channelId?: string;
  directMessageSent?: boolean;
  autoAction?: string;
}

export function createCase(state: StoreState, input: CreateCaseInput): ModCase {
  const number = (state.meta.nextCaseNumber ?? 0) + 1;
  state.meta.nextCaseNumber = number;
  const modCase: ModCase = {
    id: randomUUID(),
    number,
    type: input.type,
    guildId: input.guildId,
    userId: input.userId,
    userName: input.userName,
    moderatorId: input.moderatorId,
    moderatorName: input.moderatorName,
    reason: input.reason.slice(0, 500),
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    active: true,
    directMessageSent: input.directMessageSent,
    autoAction: input.autoAction,
    channelId: input.channelId,
  };
  state.cases.unshift(modCase);
  if (state.cases.length > 2000) state.cases = state.cases.slice(0, 2000);
  return modCase;
}

export interface CaseLabelOptions {
  prefix?: string;
  numbered?: boolean;
}

export function caseLabel(modCase: ModCase, options: CaseLabelOptions = {}): string {
  const { prefix = 'CAS-', numbered = true } = options;
  return numbered ? `${prefix}${String(modCase.number).padStart(4, '0')}` : modCase.id.slice(0, 8);
}

export function caseLabelFromConfig(modCase: ModCase, config: ModerationConfig): string {
  return caseLabel(modCase, { prefix: config.caseNumberPrefix, numbered: config.caseNumberEnabled });
}

/** Avertissements encore actifs, en tenant compte de l'expiration automatique. */
export function activeWarns(
  state: StoreState,
  userId: string,
  config: ModerationConfig,
  now: Date = new Date(),
): ModCase[] {
  return state.cases.filter((modCase) => {
    if (modCase.userId !== userId) return false;
    if (modCase.type !== 'warn') return false;
    if (!modCase.active) return false;
    if (modCase.expiresAt && new Date(modCase.expiresAt).getTime() <= now.getTime()) return false;
    if (config.warnDecayEnabled && config.warnDecayDays > 0) {
      const age = now.getTime() - new Date(modCase.createdAt).getTime();
      if (age > config.warnDecayDays * 86_400_000) return false;
    }
    return true;
  });
}

export function casesOf(state: StoreState, userId: string): ModCase[] {
  return state.cases.filter((modCase) => modCase.userId === userId);
}

export function findCase(state: StoreState, idOrNumber: string): ModCase | null {
  const value = idOrNumber.trim();
  return (
    state.cases.find((modCase) => modCase.id === value) ??
    state.cases.find((modCase) => modCase.id.startsWith(value)) ??
    state.cases.find((modCase) => String(modCase.number) === value.replace(/\D/g, '')) ??
    null
  );
}

export function revokeCase(state: StoreState, id: string, by: string): ModCase | null {
  const modCase = state.cases.find((entry) => entry.id === id || entry.id.startsWith(id));
  if (!modCase) return null;
  modCase.active = false;
  modCase.revokedAt = new Date().toISOString();
  modCase.revokedBy = by;
  return modCase;
}

export function clearWarns(state: StoreState, userId: string, by: string): number {
  let count = 0;
  for (const modCase of state.cases) {
    if (modCase.userId !== userId || modCase.type !== 'warn' || !modCase.active) continue;
    modCase.active = false;
    modCase.revokedAt = new Date().toISOString();
    modCase.revokedBy = by;
    count += 1;
  }
  return count;
}

/** Supprime les dossiers trop anciens (caseKeepDays > 0). */
export function pruneCases(state: StoreState, config: ModerationConfig, now: Date = new Date()): number {
  if (config.caseKeepDays <= 0) return 0;
  const limit = now.getTime() - config.caseKeepDays * 86_400_000;
  const before = state.cases.length;
  state.cases = state.cases.filter((modCase) => new Date(modCase.createdAt).getTime() >= limit);
  return before - state.cases.length;
}

export type AutoAction = 'none' | 'timeout' | 'kick' | 'ban';

/** Sanction automatique déclenchée par le nombre d'avertissements actifs. */
export function nextAutoAction(config: ModerationConfig, warnCount: number): AutoAction {
  if (config.warnBanEnabled && warnCount >= config.warnBanThreshold) return 'ban';
  if (config.warnKickEnabled && warnCount >= config.warnKickThreshold) return 'kick';
  if (config.warnTimeoutEnabled && warnCount >= config.warnTimeoutThreshold) return 'timeout';
  return 'none';
}

/**
 * Contenu du message privé envoyé au membre sanctionné.
 * Construit ici (logique pure) pour rester testable et cohérent
 * entre Discord et le panel.
 */
export function buildDirectMessage(input: {
  guildName: string;
  type: ModCaseType;
  reason: string;
  moderatorName: string;
  warnCount: number;
  autoAction?: AutoAction;
  expiresAt?: string;
  timeoutMinutes?: number;
}): string {
  const label = CASE_TYPE_LABELS[input.type].toLowerCase();
  const lines: string[] = [
    `## ${CASE_TYPE_EMOJI[input.type]} Sanction sur ${input.guildName}`,
    '',
    `**Type :** ${label}`,
    `**Modérateur :** ${input.moderatorName}`,
    `**Raison :** ${input.reason}`,
  ];
  if (input.expiresAt) {
    lines.push(`**Jusqu’au :** <t:${Math.floor(new Date(input.expiresAt).getTime() / 1000)}:F>`);
  }
  if (input.type === 'warn') {
    lines.push(`**Avertissements actifs :** ${input.warnCount}`);
    if (input.autoAction && input.autoAction !== 'none') {
      const action =
        input.autoAction === 'timeout'
          ? `un mute${input.timeoutMinutes ? ` de ${input.timeoutMinutes} minute(s)` : ''}`
          : input.autoAction === 'kick'
            ? 'une expulsion'
            : 'un bannissement';
      lines.push(`⚠️ Ce palier déclenche automatiquement ${action}.`);
    }
  }
  lines.push('', 'Un désaccord ? Réponds à l’équipe de modération du serveur.');
  return lines.join('\n');
}
