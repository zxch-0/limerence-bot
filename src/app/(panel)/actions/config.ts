'use server';

import { BLACKJACK_DEFAULT_VALUES, BLACKJACK_FIELDS } from '@/lib/blackjack/config';
import { ECONOMY_DEFAULT_VALUES, ECONOMY_FIELDS } from '@/lib/economy/config';
import { MODERATION_DEFAULT_VALUES, MODERATION_FIELDS } from '@/lib/moderation/config';
import { SHOP_DEFAULT_VALUES, SHOP_FIELDS } from '@/lib/shop/config';
import { UI_DEFAULT_VALUES, UI_FIELDS } from '@/lib/ui/config';
import {
  CHANNEL_SLOTS,
  type ActionState,
  type BlackjackConfig,
  type ChannelSlot,
  type EconomyConfig,
  type ModerationConfig,
  type ShopConfig,
  type UiConfig,
} from '@/lib/types';
import {
  normalizeConfig,
  readFormData,
  type ConfigValues,
  type FieldDef,
} from '@/lib/schema-fields';
import { addLog } from '@/lib/logs';
import { getState, resetConfig, resetConfigSection, updateState } from '@/lib/store';
import { startBot } from '@/lib/discord/client';
import { registerCommands } from '@/bot/commands';
import { destroySession } from '@/lib/auth';
import {
  currentAdmin,
  fail,
  int,
  NOT_AUTHORIZED,
  ok,
  refreshPanel,
  snowflake,
  snowflakeList,
  str,
} from '@/lib/panelActions';
import { redirect } from 'next/navigation';

// ============================================================
//  Actions de configuration du panel.
//
//  Les cinq grandes configurations (économie, blackjack,
//  boutique, modération, interface) sont décrites par des listes de champs :
//  le même code lit le formulaire, valide, borne et enregistre.
// ============================================================

type SectionId = 'economy' | 'blackjack' | 'shop' | 'moderation' | 'ui';

const SECTIONS: Record<
  SectionId,
  { label: string; fields: readonly FieldDef[]; defaults: ConfigValues }
> = {
  economy: { label: 'économie', fields: ECONOMY_FIELDS, defaults: ECONOMY_DEFAULT_VALUES },
  blackjack: { label: 'blackjack', fields: BLACKJACK_FIELDS, defaults: BLACKJACK_DEFAULT_VALUES },
  shop: { label: 'boutique', fields: SHOP_FIELDS, defaults: SHOP_DEFAULT_VALUES },
  moderation: { label: 'modération', fields: MODERATION_FIELDS, defaults: MODERATION_DEFAULT_VALUES },
  ui: { label: 'interface', fields: UI_FIELDS, defaults: UI_DEFAULT_VALUES },
};

/** Lit + valide un formulaire de section, puis l'enregistre. */
async function saveSection(section: SectionId, formData: FormData): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const { label, fields, defaults } = SECTIONS[section];
  const read = readFormData(fields, formData, defaults);

  // Une page peut n'afficher qu'une partie des options (ex. auto-modération) :
  // les clés absentes du formulaire conservent leur valeur enregistrée.
  const edited = new Set(
    String(formData.get('__keys') ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean),
  );

  const current = await readCurrentValues(section);
  const raw: ConfigValues = {};
  for (const field of fields) {
    if (edited.size === 0 || edited.has(field.key)) raw[field.key] = read[field.key];
    else raw[field.key] = current[field.key] ?? defaults[field.key];
  }

  const { value, issues } = normalizeConfig(fields, raw, defaults);

  await updateState((state) => {
    switch (section) {
      case 'economy':
        state.config.economy = value as EconomyConfig;
        break;
      case 'blackjack':
        state.config.blackjack = value as BlackjackConfig;
        break;
      case 'shop':
        state.config.shop = value as ShopConfig;
        break;
      case 'moderation':
        state.config.moderation = value as ModerationConfig;
        break;
      case 'ui':
        state.config.ui = value as UiConfig;
        break;
    }
  });

  const detail = issues.length
    ? `${issues.length} valeur(s) corrigée(s) : ${issues
        .slice(0, 3)
        .map((issue) => `${issue.label} (${issue.message})`)
        .join(', ')}`
    : undefined;

  await addLog({
    level: 'info',
    source: 'panel',
    action: `Configuration ${label} enregistrée`,
    detail: detail ?? `${admin.username}`,
  });

  refreshPanel();
  if (!issues.length) return ok(`Configuration ${label} enregistrée.`);
  return ok(`Configuration ${label} enregistrée — ${detail}`);
}

/** Valeurs actuellement enregistrées d'une section. */
async function readCurrentValues(section: SectionId): Promise<ConfigValues> {
  const state = await getState();
  switch (section) {
    case 'economy':
      return { ...state.config.economy };
    case 'blackjack':
      return { ...state.config.blackjack };
    case 'shop':
      return { ...state.config.shop };
    case 'moderation':
      return { ...state.config.moderation };
    default:
      return { ...state.config.ui };
  }
}

export async function saveEconomyConfigAction(_prev: ActionState | null, formData: FormData) {
  return saveSection('economy', formData);
}

export async function saveBlackjackConfigAction(_prev: ActionState | null, formData: FormData) {
  return saveSection('blackjack', formData);
}

export async function saveShopConfigAction(_prev: ActionState | null, formData: FormData) {
  return saveSection('shop', formData);
}

export async function saveModerationConfigAction(_prev: ActionState | null, formData: FormData) {
  return saveSection('moderation', formData);
}

export async function saveUiConfigAction(_prev: ActionState | null, formData: FormData) {
  return saveSection('ui', formData);
}

/** Remet une section sur ses valeurs d'usine. */
export async function resetSectionAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;
  const section = String(formData.get('section') ?? '') as SectionId;
  if (!(section in SECTIONS)) return;
  await resetConfigSection(section);
  await addLog({
    level: 'warn',
    source: 'panel',
    action: `Configuration ${SECTIONS[section].label} réinitialisée`,
    detail: admin.username,
  });
  refreshPanel();
}

/** Remet toute la configuration à zéro (données des membres conservées). */
export async function resetConfigAction(): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;
  await resetConfig();
  await addLog({ level: 'warn', source: 'panel', action: 'Configuration globale réinitialisée', detail: admin.username });
  refreshPanel();
  return ok('Configuration remise aux valeurs d’usine.');
}

// ------------------------------------------------------------
//  Salons utilisés par le bot
// ------------------------------------------------------------

export async function saveChannelsAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const state = await getState();
  const channels = { ...state.config.channels };
  let filled = 0;
  for (const slot of CHANNEL_SLOTS) {
    const id = snowflake(formData, `slot:${slot}`);
    channels[slot as ChannelSlot] = id;
    if (id) filled += 1;
  }

  await updateState((next) => {
    next.config.channels = channels;
  });
  await addLog({
    level: 'info',
    source: 'panel',
    action: 'Salons du bot enregistrés',
    detail: `${filled}/${CHANNEL_SLOTS.length} emplacements renseignés`,
  });
  refreshPanel();
  return ok(`${filled} salon(s) associé(s) sur ${CHANNEL_SLOTS.length}.`);
}

// ------------------------------------------------------------
//  Bienvenue / vocaux / confessions / journal
// ------------------------------------------------------------

export async function saveWelcomeAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  await updateState((state) => {
    state.config.welcome = {
      enabled: formData.get('enabled') === 'on',
      roleId: snowflake(formData, 'roleId'),
      channelId: snowflake(formData, 'channelId'),
      message: str(formData, 'message', state.config.welcome.message),
      mentionMember: formData.get('mentionMember') === 'on',
      directMessage: str(formData, 'directMessage'),
      assignToExisting: formData.get('assignToExisting') === 'on',
    };
  });
  await addLog({ level: 'info', source: 'panel', action: 'Accueil des membres enregistré', detail: admin.username });
  refreshPanel();
  return ok('Message d’arrivée enregistré.');
}

export async function saveJoinToCreateAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const defaultSize = int(formData, 'defaultSize', 0);
  await updateState((state) => {
    state.config.joinToCreate = {
      enabled: formData.get('enabled') === 'on',
      hubChannelId: snowflake(formData, 'hubChannelId'),
      categoryId: snowflake(formData, 'categoryId'),
      defaultSize: Math.min(99, Math.max(0, defaultSize)),
      autoDelete: formData.get('autoDelete') === 'on',
      moveOwner: formData.get('moveOwner') === 'on',
      onePerMember: formData.get('onePerMember') === 'on',
      allowRename: formData.get('allowRename') === 'on',
      allowLock: formData.get('allowLock') === 'on',
      nameTemplate: str(formData, 'nameTemplate', state.config.joinToCreate.nameTemplate),
    };
  });
  await addLog({ level: 'info', source: 'panel', action: 'Vocaux temporaires enregistrés', detail: admin.username });
  refreshPanel();
  return ok('Vocaux temporaires enregistrés.');
}

export async function saveConfessionsAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const reactions = snowflakeList(formData, 'reactions');
  await updateState((state) => {
    state.config.confessions = {
      enabled: formData.get('enabled') === 'on',
      targetChannelId: snowflake(formData, 'targetChannelId'),
      reviewChannelId: snowflake(formData, 'reviewChannelId'),
      requireApproval: formData.get('requireApproval') === 'on',
      reactions: reactions.length ? reactions : state.config.confessions.reactions,
      cooldownSeconds: Math.max(0, int(formData, 'cooldownSeconds', 0)),
      maxLength: Math.min(4000, Math.max(20, int(formData, 'maxLength', 1000))),
      notifyReviewChannel: formData.get('notifyReviewChannel') === 'on',
    };
  });
  await addLog({ level: 'info', source: 'panel', action: 'Confessions enregistrées', detail: admin.username });
  refreshPanel();
  return ok('Confessions enregistrées.');
}

export async function saveLogsAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  await updateState((state) => {
    state.config.logs = {
      enabled: formData.get('enabled') === 'on',
      channelId: snowflake(formData, 'channelId'),
      keepInPanel: formData.get('keepInPanel') === 'on',
      maxEntries: Math.min(5000, Math.max(50, int(formData, 'maxEntries', 500))),
    };
  });
  await addLog({ level: 'info', source: 'panel', action: 'Journal enregistré', detail: admin.username });
  refreshPanel();
  return ok('Journal enregistré.');
}

/** Associe le serveur cible (utile si le bot rejoint plusieurs serveurs). */
export async function saveGuildAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;
  const guildId = snowflake(formData, 'guildId');
  await updateState((state) => {
    state.config.guildId = guildId || null;
  });
  await addLog({ level: 'info', source: 'panel', action: 'Serveur cible enregistré', detail: guildId || '—' });
  refreshPanel();
  return ok(guildId ? 'Serveur cible enregistré.' : 'Serveur cible effacé (auto-détection).');
}

// ------------------------------------------------------------
//  Bot
// ------------------------------------------------------------

export async function restartBotAction(): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  try {
    const client = await startBot();
    if (!client) return fail('Impossible de démarrer le bot : vérifie DISCORD_TOKEN dans les variables d’environnement.');
    const registered = await registerCommands(client);
    await addLog({ level: 'success', source: 'panel', action: 'Bot redémarré depuis le panel', detail: client.user?.tag ?? '' });
    refreshPanel();
    return ok(`Bot en ligne (${client.user?.tag ?? 'connecté'}) — ${registered} commande(s) synchronisée(s).`);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
