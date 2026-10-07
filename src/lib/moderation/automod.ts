import type { ModerationConfig } from '../types';

// ============================================================
//  Auto-modération — analyse d'un message
//  Logique pure : la suppression / sanction est appliquée par la
//  couche bot à partir du verdict renvoyé ici.
// ============================================================

export interface AutomodContext {
  content: string;
  channelId: string;
  memberRoleIds: string[];
  isBot: boolean;
  /** contenu du message précédent du même membre, pour la répétition */
  previousContent?: string;
  previousAt?: number;
  mentionCount?: number;
  emojiCount?: number;
  now?: number;
}

export interface AutomodVerdict {
  /** 'none' = message autorisé */
  action: 'none' | ModerationConfig['automodAction'];
  reason: string;
  /** identifiant de la règle déclenchée (journal) */
  rule?: string;
}

const ALLOWED: AutomodVerdict = { action: 'none', reason: '' };

const URL_PATTERN = /https?:\/\/[^\s<]+|www\.[^\s<]+/gi;
const INVITE_PATTERN = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[a-zA-Z0-9-]+/i;
const CUSTOM_EMOJI_PATTERN = /<a?:[a-zA-Z0-9_]{2,32}:\d{15,25}>/g;

function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isAllowedDomain(url: string, whitelist: readonly string[]): boolean {
  const domain = normalizeDomain(url);
  if (!domain) return false;
  return whitelist.some((entry) => {
    const allowed = entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    return domain === allowed || domain.endsWith(`.${allowed}`);
  });
}

export function countEmojis(content: string): number {
  return (content.match(CUSTOM_EMOJI_PATTERN) ?? []).length;
}

export function uppercaseRatio(content: string): number {
  const letters = content.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ]/g, '');
  if (!letters.length) return 0;
  const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length;
  return (upper / letters.length) * 100;
}

/** Analyse un message et renvoie le verdict d'auto-modération. */
export function inspectMessage(config: ModerationConfig, context: AutomodContext): AutomodVerdict {
  if (!config.automodEnabled) return ALLOWED;
  if (context.isBot) return ALLOWED;
  if (config.automodIgnoredChannels.includes(context.channelId)) return ALLOWED;
  if (config.automodIgnoredRoles.some((roleId) => context.memberRoleIds.includes(roleId))) return ALLOWED;

  const content = context.content ?? '';
  const verdict = (rule: string, reason: string): AutomodVerdict => ({
    action: config.automodAction,
    reason,
    rule,
  });

  if (config.automodBlockInvites && INVITE_PATTERN.test(content)) {
    return verdict('invite', 'Invitation Discord non autorisée');
  }

  if (config.automodBlockLinks) {
    const urls = content.match(URL_PATTERN) ?? [];
    // Une invitation Discord est un lien comme un autre : si la règle
    // « invitations » est coupée mais le blocage des liens actif,
    // elle doit quand même être rattrapée ici.
    const blocked = urls.filter((url) => !isAllowedDomain(url, config.automodLinkWhitelist));
    if (blocked.length) return verdict('link', `Lien non autorisé : ${blocked[0].slice(0, 60)}`);
  }

  if (config.automodBlockMassMentions) {
    const mentions = context.mentionCount ?? (content.match(/<@!?\d{15,25}>|@everyone|@here/g) ?? []).length;
    if (mentions > config.automodMaxMentions) {
      return verdict('mentions', `${mentions} mentions (maximum ${config.automodMaxMentions})`);
    }
  }

  if (config.automodMaxLength > 0 && content.length > config.automodMaxLength) {
    return verdict('length', `Message de ${content.length} caractères (maximum ${config.automodMaxLength})`);
  }

  if (config.automodMaxEmojis > 0) {
    const emojis = context.emojiCount ?? countEmojis(content);
    if (emojis > config.automodMaxEmojis) {
      return verdict('emojis', `${emojis} emojis (maximum ${config.automodMaxEmojis})`);
    }
  }

  if (config.automodBlockCaps && content.length >= config.automodCapsMinLength) {
    const ratio = uppercaseRatio(content);
    if (ratio >= config.automodCapsPercent) {
      return verdict('caps', `${Math.round(ratio)} % de majuscules (seuil ${config.automodCapsPercent} %)`);
    }
  }

  if (config.automodBlockDuplicates && context.previousContent) {
    const age = context.previousAt ? (context.now ?? Date.now()) - context.previousAt : Number.POSITIVE_INFINITY;
    if (age <= config.automodDuplicateWindowSeconds * 1000) {
      const a = context.previousContent.trim().toLowerCase();
      const b = content.trim().toLowerCase();
      if (a.length > 5 && a === b) return verdict('duplicate', 'Message répété');
    }
  }

  if (config.automodBannedWords.length) {
    const haystack = content.toLowerCase();
    for (const word of config.automodBannedWords) {
      const needle = word.trim().toLowerCase();
      if (needle && haystack.includes(needle)) {
        return verdict('word', `Mot interdit : ${needle}`);
      }
    }
  }

  return ALLOWED;
}
