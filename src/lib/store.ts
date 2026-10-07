import { promises as fs } from 'node:fs';
import path from 'node:path';
import { emptyState, mergeConfig } from './config';
import type { StoreState } from './types';

// ============================================================
//  Persistance
//  - DATABASE_URL défini  -> Postgres (jsonb, persistant)
//  - sinon                -> fichier JSON local (data/state.json)
//
//  L'état contient la configuration, l'économie, la boutique,
//  les dossiers de modération et les historiques.
// ============================================================

const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'state.json');
const TABLE = 'limerence_state';
const ROW_ID = 'main';

type PgPool = import('pg').Pool;

interface StoreGlobals {
  cache: StoreState | null;
  loaded: boolean;
  writing: Promise<void>;
  pool: PgPool | null;
  pgReady: boolean;
  pgBroken: boolean;
}

const g: StoreGlobals = ((globalThis as typeof globalThis & { __limerenceStore?: StoreGlobals })
  .__limerenceStore ??= {
  cache: null,
  loaded: false,
  writing: Promise.resolve(),
  pool: null,
  pgReady: false,
  pgBroken: false,
});

export function storageKind(): 'postgres' | 'fichier json' {
  return process.env.DATABASE_URL?.trim() ? 'postgres' : 'fichier json';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalize(raw: unknown): StoreState {
  const base = emptyState();
  if (!isRecord(raw)) return base;
  const partial = raw as Partial<StoreState>;
  return {
    config: mergeConfig(base.config, partial.config),
    confessions: Array.isArray(partial.confessions) ? partial.confessions : [],
    announcements: Array.isArray(partial.announcements) ? partial.announcements : [],
    embeds: Array.isArray(partial.embeds) ? partial.embeds : [],
    logs: Array.isArray(partial.logs) ? partial.logs : [],
    tempRooms: Array.isArray(partial.tempRooms) ? partial.tempRooms : [],
    accounts: isRecord(partial.accounts) ? (partial.accounts as StoreState['accounts']) : {},
    shopItems: Array.isArray(partial.shopItems) ? partial.shopItems : [],
    purchases: Array.isArray(partial.purchases) ? partial.purchases : [],
    cases: Array.isArray(partial.cases) ? partial.cases : [],
    blackjack: isRecord(partial.blackjack) ? (partial.blackjack as StoreState['blackjack']) : {},
    blackjackStats: isRecord(partial.blackjackStats)
      ? (partial.blackjackStats as StoreState['blackjackStats'])
      : {},
    meta: isRecord(partial.meta) ? partial.meta : {},
  };
}

async function getPool(): Promise<PgPool | null> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || g.pgBroken) return null;
  if (g.pool) return g.pool;
  try {
    const { Pool } = await import('pg');
    g.pool = new Pool({
      connectionString: url,
      ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 3,
    });
    g.pool.on('error', (err: Error) => {
      console.error('[store] erreur Postgres, bascule sur le fichier JSON :', err.message);
      g.pgBroken = true;
    });
    return g.pool;
  } catch (err) {
    console.error('[store] impossible de charger pg :', (err as Error).message);
    g.pgBroken = true;
    return null;
  }
}

async function pgEnsureTable(pool: PgPool) {
  if (g.pgReady) return;
  await pool.query(
    `create table if not exists ${TABLE} (id text primary key, data jsonb not null, updated_at timestamptz not null default now())`,
  );
  g.pgReady = true;
}

async function readFromDisk(): Promise<StoreState> {
  try {
    const txt = await fs.readFile(FILE, 'utf8');
    return normalize(JSON.parse(txt));
  } catch {
    return emptyState();
  }
}

async function readAll(): Promise<StoreState> {
  const pool = await getPool();
  if (pool) {
    try {
      await pgEnsureTable(pool);
      const res = await pool.query(`select data from ${TABLE} where id = $1`, [ROW_ID]);
      if (res.rows.length) return normalize(res.rows[0].data);
      const state = await readFromDisk();
      await writeAll(state, pool);
      return state;
    } catch (err) {
      console.error('[store] lecture Postgres échouée :', (err as Error).message);
      g.pgBroken = true;
    }
  }
  return readFromDisk();
}

async function writeAll(state: StoreState, pool?: PgPool | null) {
  const p = pool ?? (await getPool());
  if (p) {
    try {
      await pgEnsureTable(p);
      await p.query(
        `insert into ${TABLE} (id, data, updated_at) values ($1, $2, now())
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        [ROW_ID, JSON.stringify(state)],
      );
      return;
    } catch (err) {
      console.error('[store] écriture Postgres échouée :', (err as Error).message);
      g.pgBroken = true;
    }
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, FILE);
}

/** Lit l'état (cache mémoire + chargement unique au démarrage). */
export async function getState(): Promise<StoreState> {
  if (g.loaded && g.cache) return g.cache;
  g.cache = await readAll();
  g.loaded = true;
  return g.cache;
}

/** Lecture synchrone du cache — utilisable par le bot après un premier getState(). */
export function getCachedState(): StoreState {
  return g.cache ?? emptyState();
}

/**
 * Modifie l'état puis persiste.
 * Les écritures sont sérialisées : deux commandes simultanées ne peuvent
 * pas s'écraser l'une l'autre sur le disque.
 */
export async function updateState<T>(mutator: (state: StoreState) => T | Promise<T>): Promise<T> {
  const state = await getState();
  const result = await mutator(state);
  g.cache = state;
  g.writing = g.writing.then(() => writeAll(state)).catch((err) => {
    console.error('[store] persistance échouée :', err);
  });
  await g.writing;
  return result;
}

/** Remet la configuration aux valeurs par défaut (aucune donnée membre n'est touchée). */
export async function resetConfig(): Promise<void> {
  await updateState((state) => {
    const fresh = emptyState();
    state.config = fresh.config;
    state.meta = { ...state.meta };
  });
}

/** Réinitialise uniquement une partie de la configuration. */
export async function resetConfigSection(
  section: 'economy' | 'blackjack' | 'shop' | 'moderation' | 'ui',
): Promise<void> {
  await updateState((state) => {
    const fresh = emptyState();
    switch (section) {
      case 'economy':
        state.config.economy = fresh.config.economy;
        break;
      case 'blackjack':
        state.config.blackjack = fresh.config.blackjack;
        break;
      case 'shop':
        state.config.shop = fresh.config.shop;
        break;
      case 'moderation':
        state.config.moderation = fresh.config.moderation;
        break;
      case 'ui':
        state.config.ui = fresh.config.ui;
        break;
    }
  });
}
