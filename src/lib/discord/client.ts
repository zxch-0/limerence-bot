import {
  Client,
  GatewayIntentBits,
  Partials,
  type Guild,
} from 'discord.js';
import { isDemoMode } from '../auth';

// ============================================================
//  Instance unique du bot Discord
//  Le panel Next.js et le bot tournent dans le même process :
//  le client est donc partagé via globalThis (survit au HMR).
// ============================================================

interface ClientGlobals {
  client: Client | null;
  loginPromise: Promise<Client | null> | null;
  ready: boolean;
  lastError: string | null;
}

const g: ClientGlobals = ((globalThis as typeof globalThis & { __limerenceClient?: ClientGlobals })
  .__limerenceClient ??= {
  client: null,
  loginPromise: null,
  ready: false,
  lastError: null,
});

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // intent privilégié : rôle auto + liste des membres
      GatewayIntentBits.GuildVoiceStates, // join-to-create
    ],
    partials: [Partials.GuildMember],
    allowedMentions: { parse: ['users', 'roles'] },
  });
  return client;
}

export function getClient(): Client | null {
  return g.client;
}

/** Client utilisable pour agir sur le serveur (null si le bot n'est pas prêt). */
export function getReadyClient(): Client | null {
  if (g.client && g.ready) return g.client;
  return null;
}

export function botStatus(): {
  configured: boolean;
  connected: boolean;
  demo: boolean;
  error: string | null;
  tag: string | null;
  ping: number | null;
} {
  return {
    configured: Boolean(process.env.DISCORD_TOKEN?.trim()) && !isDemoMode(),
    connected: g.ready && Boolean(g.client?.isReady()),
    demo: isDemoMode(),
    error: g.lastError,
    tag: g.client?.user?.tag ?? null,
    ping: g.client?.ws?.ping ?? null,
  };
}

/** Retrouve le serveur géré (DISCORD_GUILD_ID, sinon le premier serveur du bot). */
export async function getGuild(required = true): Promise<Guild | null> {
  const client = getReadyClient();
  if (!client) {
    if (required) throw new Error("Le bot n'est pas connecté. Vérifie DISCORD_TOKEN et les intents.");
    return null;
  }
  const { getState } = await import('../store');
  const state = await getState();
  const id = state.config.guildId?.trim() || process.env.DISCORD_GUILD_ID?.trim();
  if (id) {
    const guild = await client.guilds.fetch(id).catch(() => null);
    if (guild) return guild;
    if (required) throw new Error(`Le bot n'est pas présent sur le serveur ${id}.`);
    return null;
  }
  const first = client.guilds.cache.first();
  if (first) return first;
  if (required) throw new Error('Aucun serveur trouvé : invite le bot sur ton serveur.');
  return null;
}

/**
 * Démarre le bot (idempotent). Appelé au boot du serveur Next
 * via instrumentation.ts, et par /api/health en secours.
 */
export async function startBot(): Promise<Client | null> {
  if (isDemoMode()) {
    console.log('[bot] mode démo — aucune connexion Discord.');
    return null;
  }
  if (g.ready && g.client) return g.client;
  if (g.loginPromise) return g.loginPromise;

  g.loginPromise = (async () => {
    try {
      const token = process.env.DISCORD_TOKEN?.trim();
      if (!token) throw new Error('DISCORD_TOKEN manquant');

      const client = g.client ?? createClient();
      g.client = client;

      const { registerEvents } = await import('@/bot/events');
      registerEvents(client);

      client.on('error', (err) => {
        g.lastError = err.message;
        console.error('[bot] erreur client :', err.message);
      });
      client.on('shardDisconnect', () => {
        g.ready = false;
        console.warn('[bot] déconnecté de la gateway.');
      });
      client.on('shardResume', () => {
        g.ready = true;
      });

      await client.login(token);
      g.lastError = null;
      return client;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      g.lastError = message;
      console.error('[bot] connexion impossible :', message);
      if (message.includes('disallowed intents')) {
        console.error(
          '[bot] 👉 Active "SERVER MEMBERS INTENT" sur https://discord.com/developers/applications',
        );
      }
      g.loginPromise = null;
      return null;
    }
  })();

  return g.loginPromise;
}

export function markReady() {
  g.ready = true;
}

/** Réinitialise l'état interne après une déconnexion volontaire (panel). */
export function resetClientState() {
  g.client = null;
  g.loginPromise = null;
  g.ready = false;
}
