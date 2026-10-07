import type { AppConfig } from './types';

// ============================================================
//  Message de bienvenue — logique pure.
//  Le choix du salon et le rendu du texte sont décidés ici pour
//  rester testables ; l'envoi est fait par la couche bot.
// ============================================================

/** Jetons acceptés dans le message et le MP d'accueil. */
export const WELCOME_TOKENS = [
  '{mention}',
  '{pseudo}',
  '{user}',
  '{serveur}',
  '{membres}',
  '{compte}',
  '{invites}',
  '{id}',
] as const;

export type WelcomeToken = (typeof WELCOME_TOKENS)[number];

export interface WelcomeVars {
  /** identifiant Discord du membre */
  userId: string;
  /** nom d'affichage sur le serveur */
  displayName: string;
  /** nom d'utilisateur Discord */
  username: string;
  /** nom du serveur */
  guildName: string;
  /** nombre de membres du serveur */
  memberCount: number;
  /** solde de départ ou solde actuel, déjà formaté */
  balance: string;
  /** nombre d'invitations valides (0 si non suivi) */
  invites?: number;
}

/**
 * Remplace les jetons du message d'accueil. Les anciens jetons anglais
 * (`{user}`, `{server}`, `{members}`, `{balance}`, `{name}`) restent
 * acceptés pour ne casser aucune configuration existante.
 */
export function renderWelcome(template: string, vars: WelcomeVars): string {
  const values: Record<string, string> = {
    mention: `<@${vars.userId}>`,
    membre: `<@${vars.userId}>`,
    pseudo: vars.displayName,
    name: vars.displayName,
    user: vars.username,
    serveur: vars.guildName,
    server: vars.guildName,
    membres: String(vars.memberCount),
    members: String(vars.memberCount),
    compte: vars.balance,
    balance: vars.balance,
    solde: vars.balance,
    invites: String(vars.invites ?? 0),
    id: vars.userId,
  };
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

/**
 * Ordre de résolution du salon d'accueil :
 *  1. le salon choisi dans le panel (`welcome.channelId`) ;
 *  2. l'emplacement « Bienvenue » ;
 *  3. l'emplacement « Salon principal ».
 * Renvoie '' si rien n'est configuré : le bot ne poste alors nulle part.
 */
export function welcomeChannelId(config: AppConfig): string {
  const explicit = config.welcome.channelId.trim();
  if (/^\d{15,25}$/.test(explicit)) return explicit;
  if (/^\d{15,25}$/.test(config.channels.welcome)) return config.channels.welcome;
  if (/^\d{15,25}$/.test(config.channels.general)) return config.channels.general;
  return '';
}

/** Le salon d'accueil a-t-il été choisi explicitement (hors emplacement) ? */
export function hasExplicitWelcomeChannel(config: AppConfig): boolean {
  return /^\d{15,25}$/.test(config.welcome.channelId.trim());
}
