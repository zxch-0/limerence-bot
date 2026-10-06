import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

// ============================================================
//  Authentification du panel — OAuth2 Discord + session signée
//  Accès réservé aux membres ayant "Gérer le serveur" (ou à
//  l'OWNER_DISCORD_ID / aux admins ajoutés dans le panel).
// ============================================================

export const SESSION_COOKIE = 'limerence_session';
const SESSION_DAYS = 7;

export interface SessionUser {
  id: string;
  username: string;
  globalName?: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  demo?: boolean;
}

export interface SessionPayload extends SessionUser {
  iat?: number;
  exp?: number;
}

const DEMO_SESSION: SessionUser = {
  id: '000000000000000000',
  username: 'admin-demo',
  globalName: 'Admin (démo)',
  avatarUrl: null,
  isAdmin: true,
  demo: true,
};

// ------------------------------------------------------------
//  Mode démo
// ------------------------------------------------------------

/**
 * Mode démo : le panel s'ouvre avec des données fictives, sans connexion.
 *
 * Règle de sécurité : dès que l'OAuth2 Discord est configuré
 * (CLIENT_ID + CLIENT_SECRET), la session anonyme est TOUJOURS refusée —
 * il faut se connecter avec un compte Discord administrateur.
 * La démo ne s'active donc que tant que le panel n'est pas branché à Discord.
 */
export function isDemoMode(): boolean {
  const oauthConfigured = Boolean(
    process.env.DISCORD_CLIENT_ID?.trim() && process.env.DISCORD_CLIENT_SECRET?.trim(),
  );
  // Ne jamais autoriser la session anonyme lorsque Discord OAuth est configuré,
  // même si DEMO_MODE=true a été laissé par erreur en production.
  if (oauthConfigured) return false;
  if (process.env.DEMO_MODE === 'false') return false;
  if (process.env.DEMO_MODE === 'true') return true;
  return !process.env.DISCORD_TOKEN?.trim();
}

// ------------------------------------------------------------
//  URL publique (pour le redirect_uri OAuth et les liens du panel)
// ------------------------------------------------------------

export async function getPublicUrl(): Promise<string> {
  const env = process.env.PUBLIC_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    if (host) return `${proto}://${host}`;
  } catch {
    /* hors requête */
  }
  return 'http://localhost:3000';
}

export async function getRedirectUri(): Promise<string> {
  return `${await getPublicUrl()}/api/auth/callback`;
}

// ------------------------------------------------------------
//  Session JWT
// ------------------------------------------------------------

function secret(): Uint8Array {
  const configured = process.env.SESSION_SECRET?.trim();
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('SESSION_SECRET manquant ou trop court : utilise un secret aléatoire d’au moins 32 caractères.');
  }
  const value = configured || 'limerence-dev-secret-a-changer-en-production-0123456789';
  return new TextEncoder().encode(value);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionUser | null> {
  if (isDemoMode()) return DEMO_SESSION;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const p = payload as unknown as SessionPayload;
    if (!p.id) return null;
    return {
      id: p.id,
      username: p.username,
      globalName: p.globalName,
      avatarUrl: p.avatarUrl ?? null,
      isAdmin: Boolean(p.isAdmin),
    };
  } catch {
    return null;
  }
}

/** Session obligatoire : renvoie null si l'utilisateur n'est pas connecté. */
export async function requireUser(): Promise<SessionUser | null> {
  return readSession();
}

/** Session admin obligatoire : renvoie null si non connecté ou non autorisé. */
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await readSession();
  if (!user) return null;
  if (user.isAdmin) return user;
  const allow = (process.env.ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(user.id) ? { ...user, isAdmin: true } : null;
}

// ------------------------------------------------------------
//  OAuth2 Discord
// ------------------------------------------------------------

export const OAUTH_SCOPES = ['identify', 'guilds'];

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    state,
    prompt: 'none',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function isDiscordAdmin(permissions?: string | number | null): boolean {
  if (permissions === undefined || permissions === null) return false;
  const perms = BigInt(permissions);
  const ADMINISTRATOR = 0x8n;
  const MANAGE_GUILD = 0x20n;
  return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
}

export interface DiscordOAuthUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export function avatarUrl(user: DiscordOAuthUser): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
}

export async function exchangeCode(code: string): Promise<{ access_token: string }> {
  const redirectUri = await getRedirectUri();
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? '',
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Échange du code OAuth échoué (${res.status}) : ${await res.text()}`);
  }
  return res.json() as Promise<{ access_token: string }>;
}

export async function fetchOAuthUser(accessToken: string): Promise<DiscordOAuthUser> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Récupération du profil échouée (${res.status})`);
  return res.json() as Promise<DiscordOAuthUser>;
}

export interface OAuthGuild {
  id: string;
  name: string;
  owner: boolean;
  permissions: string;
}

export async function fetchOAuthGuilds(accessToken: string): Promise<OAuthGuild[]> {
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json() as Promise<OAuthGuild[]>;
}

/** Vérifie que l'utilisateur a le droit d'administrer le serveur ciblé. */
export async function userCanAdminGuild(
  accessToken: string,
  guildId?: string | null,
  userId?: string | null,
): Promise<boolean> {
  if (userId && isOwner(userId)) return true;
  if (userId) {
    const allow = (process.env.ADMIN_DISCORD_IDS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    if (allow.includes(userId)) return true;
  }
  const guilds = await fetchOAuthGuilds(accessToken);
  if (!guilds.length) return false;
  const target = guildId?.trim();
  // Sans serveur cible, autoriser un admin de n'importe lequel de ses serveurs
  // donnerait accès au panel du serveur géré par le bot.
  if (!target) return false;
  const candidate = guilds.find((guild) => guild.id === target);
  return Boolean(candidate && (candidate.owner || isDiscordAdmin(candidate.permissions)));
}

export function isOwner(userId: string): boolean {
  const owner = process.env.OWNER_DISCORD_ID?.trim();
  return Boolean(owner && owner === userId);
}
