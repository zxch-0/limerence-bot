import { randomUUID } from 'node:crypto';
import type { EconomyAccount, EconomyConfig, QuestDef, QuestDay, QuestType, StoreState } from '../types';
import { awardXp, credit, formatMoney, randomInt, todayStamp, type Rng } from './core';

// ============================================================
//  Quêtes quotidiennes
//
//  Chaque jour, le serveur propose les mêmes quêtes à tout le
//  monde (génération déterministe à partir de la date). La progression
//  est suivie dans le compte de chaque membre et la récompense est
//  créditée automatiquement à la complétion.
// ============================================================

interface QuestTemplate {
  type: QuestType;
  emoji: string;
  label: (target: number) => string;
  targetMin: number;
  targetMax: number;
}

const QUEST_TEMPLATES: QuestTemplate[] = [
  { type: 'play_games', emoji: '🎮', label: (t) => `Jouer ${t} partie(s) au casino`, targetMin: 3, targetMax: 10 },
  { type: 'win_games', emoji: '🏆', label: (t) => `Gagner ${t} partie(s) au casino`, targetMin: 1, targetMax: 5 },
  { type: 'gain_money', emoji: '💰', label: (t) => `Gagner ${t} pièces au total`, targetMin: 500, targetMax: 3_000 },
  { type: 'spend_money', emoji: '🛍️', label: (t) => `Dépenser ${t} pièces (boutique, mises…)`, targetMin: 300, targetMax: 2_000 },
  { type: 'work', emoji: '🛠️', label: (t) => `Travailler ${t} fois`, targetMin: 1, targetMax: 4 },
  { type: 'crime', emoji: '🕵️', label: (t) => `Tenter ${t} coup(s)`, targetMin: 1, targetMax: 3 },
  { type: 'rob', emoji: '🥷', label: (t) => `Tenter ${t} vol(s)`, targetMin: 1, targetMax: 3 },
  { type: 'daily', emoji: '📅', label: (t) => `Récupérer ${t} récompense(s) quotidienne(s)`, targetMin: 1, targetMax: 1 },
  { type: 'search', emoji: '🔎', label: (t) => `Fouiller ${t} fois`, targetMin: 2, targetMax: 6 },
  { type: 'income', emoji: '💼', label: (t) => `Réclamer ${t} revenu(x) de rôle`, targetMin: 1, targetMax: 2 },
];

/** Générateur déterministe (LCG) : mêmes quêtes pour tout le serveur un jour donné. */
function seededRng(seed: string): Rng {
  let state = 0;
  for (let index = 0; index < seed.length; index += 1) {
    state = (state * 31 + seed.charCodeAt(index)) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Génère les quêtes du jour (déterministe pour un `dayStamp` donné). */
export function rollQuests(config: EconomyConfig, dayStamp: string): QuestDef[] {
  const rng = seededRng(dayStamp);
  const count = Math.max(1, Math.min(QUEST_TEMPLATES.length, config.questsPerDay));
  const pool = [...QUEST_TEMPLATES];
  const quests: QuestDef[] = [];
  while (quests.length < count && pool.length) {
    const index = Math.floor(rng() * pool.length) % pool.length;
    const template = pool.splice(index, 1)[0];
    const target = randomInt(template.targetMin, template.targetMax, rng);
    quests.push({
      id: randomUUID(),
      type: template.type,
      target,
      label: template.label(target),
      emoji: template.emoji,
      reward: randomInt(config.questRewardMin, config.questRewardMax, rng),
      xp: config.questXpReward,
    });
  }
  return quests;
}

/** Quêtes du jour : générées une fois puis réutilisées pour tout le serveur. */
export function ensureQuests(state: StoreState, config: EconomyConfig, now: Date = new Date()): QuestDef[] {
  if (!config.questsEnabled) return [];
  const stamp = todayStamp(now);
  const existing = state.meta.quests;
  if (existing && existing.dayStamp === stamp && existing.quests.length) return existing.quests;
  const quests = rollQuests(config, stamp);
  const day: QuestDay = { dayStamp: stamp, quests };
  state.meta.quests = day;
  return quests;
}

export interface QuestProgress {
  quest: QuestDef;
  current: number;
  target: number;
  completed: boolean;
}

/** Progression d’un membre sur les quêtes du jour. */
export function questProgressFor(account: EconomyAccount, quests: QuestDef[]): QuestProgress[] {
  return quests.map((quest) => ({
    quest,
    current: Math.min(quest.target, account.questProgress[quest.id] ?? 0),
    target: quest.target,
    completed: (account.questProgress[quest.id] ?? 0) >= quest.target,
  }));
}

export interface QuestUpdate {
  completed: QuestDef[];
  progress: QuestProgress[];
}

/**
 * Incrémente la progression des quêtes du jour correspondant à `type`.
 * Une quête complétée est récompensée immédiatement (crédits + XP).
 */
export function trackQuest(
  state: StoreState,
  account: EconomyAccount,
  config: EconomyConfig,
  type: QuestType,
  amount = 1,
  now: Date = new Date(),
): QuestUpdate {
  const quests = ensureQuests(state, config, now);
  const completed: QuestDef[] = [];
  if (!quests.length || amount <= 0) {
    return { completed, progress: questProgressFor(account, quests) };
  }
  for (const quest of quests) {
    if (quest.type !== type) continue;
    const before = account.questProgress[quest.id] ?? 0;
    if (before >= quest.target) continue;
    const after = Math.min(quest.target, before + amount);
    account.questProgress[quest.id] = after;
    if (after >= quest.target) {
      completed.push(quest);
      if (quest.reward > 0) {
        credit(account, config, quest.reward, 'quest', `Quête : ${quest.label}`, now);
      }
      if (quest.xp > 0) awardXp(account, config, quest.xp * Math.max(1, config.xpPerAmount), now);
      account.updatedAt = now.toISOString();
    }
  }
  return { completed, progress: questProgressFor(account, quests) };
}

/** Formate la progression d’une quête (barre + pourcentage). */
export function formatQuestProgress(current: number, target: number, blocks = 8): string {
  const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  const filled = Math.round(ratio * blocks);
  return `${'▰'.repeat(filled)}${'▱'.repeat(blocks - filled)} ${Math.round(ratio * 100)}%`;
}

/** Formate la récompense d’une quête. */
export function formatQuestReward(config: EconomyConfig, quest: QuestDef): string {
  return formatMoney(config, quest.reward);
}
