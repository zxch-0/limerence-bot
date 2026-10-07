'use server';

import { ChannelType, type VoiceChannel } from 'discord.js';
import { deleteRoom, reconcileTempRooms } from '@/bot/tempRooms';
import { countEmojis, inspectMessage, uppercaseRatio } from '@/lib/moderation/automod';
import { addLog } from '@/lib/logs';
import { getState, updateState } from '@/lib/store';
import type { ActionState } from '@/lib/types';
import {
  currentAdmin,
  fail,
  int,
  NOT_AUTHORIZED,
  ok,
  refreshPanel,
  requireGuild,
  snowflake,
  str,
} from '@/lib/panelActions';

// ============================================================
//  Vocaux temporaires, journal et testeur d'auto-modération.
// ============================================================

export async function deleteTempRoomAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;

  const channelId = snowflake(formData, 'channelId');
  if (!channelId) return;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return;
  const channel = await guildResult.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) return;

  await deleteRoom(channel as VoiceChannel, `Supprimé depuis le panel par ${admin.username}`);
  await addLog({ level: 'warn', source: 'panel', action: 'Salon vocal temporaire supprimé', detail: `#${channel.name}` });
  refreshPanel();
}

export async function reconcileRoomsAction(): Promise<ActionState> {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const guildResult = await requireGuild();
  if ('error' in guildResult) return fail(guildResult.error);

  await reconcileTempRooms(guildResult.guild);
  await addLog({ level: 'info', source: 'panel', action: 'Salons vocaux temporaires réconciliés', detail: admin.username });
  refreshPanel();
  return ok('Liste des salons temporaires resynchronisée avec Discord.');
}

/** Vide le journal du panel (tout ou un niveau précis). */
export async function clearLogsAction(formData: FormData): Promise<void> {
  const admin = await currentAdmin();
  if (!admin) return;

  const level = str(formData, 'level');
  await updateState((state) => {
    state.logs = level ? state.logs.filter((entry) => entry.level !== level) : [];
  });
  await addLog({
    level: 'warn',
    source: 'panel',
    action: level ? `Journal filtré (${level})` : 'Journal vidé',
    detail: admin.username,
  });
  refreshPanel();
}

/**
 * Testeur d'auto-modération : analyse un texte avec la configuration
 * actuelle sans rien supprimer. Utile pour régler les seuils.
 */
export async function testAutomodAction(_prev: ActionState | null, formData: FormData) {
  const admin = await currentAdmin();
  if (!admin) return NOT_AUTHORIZED;

  const content = str(formData, 'content');
  if (!content) return fail('Écris un message à tester.');

  const state = await getState();
  const config = state.config.moderation;
  const roleIds = snowflakeListSafe(formData, 'roleIds');

  const verdict = inspectMessage(config, {
    content,
    channelId: snowflake(formData, 'channelId') || '0',
    memberRoleIds: roleIds,
    isBot: formData.get('isBot') === 'on',
    mentionCount: Math.max(0, int(formData, 'mentions', 0)),
    emojiCount: Math.max(0, int(formData, 'emojis', countEmojis(content))),
  });

  const details = [
    `Caractères : ${content.length}`,
    `Majuscules : ${uppercaseRatio(content).toFixed(0)} %`,
    `Liens : ${content.match(/https?:\/\/|www\./gi)?.length ?? 0}`,
    `Emojis : ${countEmojis(content)}`,
  ].join(' · ');

  if (verdict.action === 'none') {
    return ok(`Message autorisé. ${details}`);
  }
  return ok(`⚠️ Action « ${verdict.action} » — ${verdict.reason}${verdict.rule ? ` (règle ${verdict.rule})` : ''}. ${details}`);
}

/** Liste d'identifiants de rôles fournie par le testeur. */
function snowflakeListSafe(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? '')
    .split(/[\s,;\n]+/)
    .map((item) => item.replace(/\D/g, ''))
    .filter((item) => item.length >= 17 && item.length <= 20);
}
