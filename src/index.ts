// ============================================================
//  Limerence Bot — entrée du paquet
//  Le runtime réel est Next.js : le bot Discord et le panel
//  partagent le même process (src/instrumentation.ts démarre
//  la connexion Discord au boot du serveur).
// ============================================================

export { startBot, getClient, getGuild, botStatus } from './lib/discord/client';
export { applyBlueprint, auditBlueprint } from './lib/blueprint';
export { DEFAULT_CONFIG, DEFAULT_CATEGORIES, channelName } from './lib/config';
export { getState, updateState } from './lib/store';
