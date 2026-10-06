import { randomUUID } from 'node:crypto';
import { ChannelType, EmbedBuilder, type Guild } from 'discord.js';
import { getState, updateState } from '../lib/store';
import { addLog } from '../lib/logs';
import type { EmbedField, EmbedTemplate } from '../lib/types';

export interface EmbedTemplateInput {
  name: string;
  title?: string;
  description?: string;
  color?: string;
  authorName?: string;
  authorUrl?: string;
  authorIconUrl?: string;
  footer?: string;
  footerIconUrl?: string;
  url?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  fields?: EmbedField[];
  channelId?: string;
}

export interface EmbedOperationResult {
  ok: boolean;
  template?: EmbedTemplate;
  message?: string;
}

function cleanOptional(value: unknown, maxLength: number): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : undefined;
}

function validHttpUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeFields(fields: EmbedField[] | undefined): EmbedField[] {
  return (Array.isArray(fields) ? fields : [])
    .map((value) => {
      const field = value && typeof value === 'object' ? value : ({} as EmbedField);
      return {
        name: String(field.name ?? '').trim().slice(0, 256),
        value: String(field.value ?? '').trim().slice(0, 1024),
        inline: Boolean(field.inline),
      };
    })
    .filter((field) => field.name && field.value)
    .slice(0, 25);
}

function normalizeInput(input: EmbedTemplateInput):
  | { ok: true; value: Omit<EmbedTemplate, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> }
  | { ok: false; message: string } {
  const name = String(input.name ?? '').trim().slice(0, 64);
  const title = cleanOptional(input.title, 256);
  const description = cleanOptional(input.description, 4096);
  const color = String(input.color ?? '#FFFFFF').trim().toUpperCase();
  const authorName = cleanOptional(input.authorName, 256);
  const authorUrl = cleanOptional(input.authorUrl, 2048);
  const authorIconUrl = cleanOptional(input.authorIconUrl, 2048);
  const footer = cleanOptional(input.footer, 2048);
  const footerIconUrl = cleanOptional(input.footerIconUrl, 2048);
  const url = cleanOptional(input.url, 2048);
  const imageUrl = cleanOptional(input.imageUrl, 2048);
  const thumbnailUrl = cleanOptional(input.thumbnailUrl, 2048);
  const fields = normalizeFields(input.fields);

  if (!name) return { ok: false, message: 'Donne un nom au modèle.' };
  if (!/^#[0-9A-F]{6}$/.test(color)) return { ok: false, message: 'Couleur invalide : utilise le format #RRGGBB.' };
  if (!title && !description && fields.length === 0) {
    return { ok: false, message: 'Ajoute un titre, une description ou au moins un champ.' };
  }
  if ((input.fields?.length ?? 0) > 25) return { ok: false, message: 'Un embed accepte au maximum 25 champs.' };
  if ((input.fields ?? []).some((field) => !String(field?.name ?? '').trim() || !String(field?.value ?? '').trim())) {
    return { ok: false, message: 'Chaque champ doit avoir un nom et une valeur.' };
  }
  const urls = [authorUrl, authorIconUrl, footerIconUrl, url, imageUrl, thumbnailUrl];
  if (urls.some((candidate) => !validHttpUrl(candidate))) {
    return { ok: false, message: 'Les liens d’image et de profil doivent commencer par http:// ou https://.' };
  }
  const totalTextLength =
    (title?.length ?? 0) +
    (description?.length ?? 0) +
    (authorName?.length ?? 0) +
    (footer?.length ?? 0) +
    fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
  if (totalTextLength > 6000) return { ok: false, message: 'La taille totale du texte de l’embed dépasse 6 000 caractères.' };

  return {
    ok: true,
    value: {
      name,
      title,
      description,
      color,
      authorName,
      authorUrl,
      authorIconUrl,
      footer,
      footerIconUrl,
      url,
      imageUrl,
      thumbnailUrl,
      fields,
      channelId: input.channelId || undefined,
    },
  };
}

export function buildEmbed(template: EmbedTemplate): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(Number.parseInt(template.color.slice(1), 16));
  if (template.title) embed.setTitle(template.title);
  if (template.description) embed.setDescription(template.description);
  if (template.authorName) {
    embed.setAuthor({
      name: template.authorName,
      ...(template.authorUrl ? { url: template.authorUrl } : {}),
      ...(template.authorIconUrl ? { iconURL: template.authorIconUrl } : {}),
    });
  }
  if (template.footer) {
    embed.setFooter({
      text: template.footer,
      ...(template.footerIconUrl ? { iconURL: template.footerIconUrl } : {}),
    });
  }
  if (template.url) embed.setURL(template.url);
  if (template.imageUrl) embed.setImage(template.imageUrl);
  if (template.thumbnailUrl) embed.setThumbnail(template.thumbnailUrl);
  if (template.fields.length) embed.addFields(template.fields);
  return embed;
}

export async function createEmbedTemplate(
  input: EmbedTemplateInput,
  createdBy: string,
): Promise<EmbedOperationResult> {
  const normalized = normalizeInput(input);
  if (!normalized.ok) return { ok: false, message: normalized.message };
  const now = new Date().toISOString();
  const template: EmbedTemplate = {
    ...normalized.value,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
  let duplicateName = false;
  await updateState((state) => {
    duplicateName = state.embeds.some((item) => item.name.toLocaleLowerCase() === template.name.toLocaleLowerCase());
    if (duplicateName) return;
    state.embeds.unshift(template);
    state.embeds = state.embeds.slice(0, 100);
  });
  if (duplicateName) return { ok: false, message: 'Un modèle porte déjà ce nom : choisis un nom unique ou modifie-le.' };
  await addLog({ level: 'info', source: createdBy, action: 'Modèle embed créé', detail: template.name });
  return { ok: true, template };
}

export async function updateEmbedTemplate(
  id: string,
  input: EmbedTemplateInput,
  updatedBy: string,
): Promise<EmbedOperationResult> {
  const normalized = normalizeInput(input);
  if (!normalized.ok) return { ok: false, message: normalized.message };
  let updated: EmbedTemplate | undefined;
  let duplicateName = false;
  await updateState((state) => {
    const current = state.embeds.find((item) => item.id === id);
    if (!current) return;
    duplicateName = state.embeds.some((item) => item.id !== id && item.name.toLocaleLowerCase() === normalized.value.name.toLocaleLowerCase());
    if (duplicateName) return;
    updated = {
      ...current,
      ...normalized.value,
      // Discord's modal has fewer inputs than the web editor; preserve optional
      // advanced properties (fields/images/links) that the modal does not edit.
      fields: input.fields === undefined ? current.fields : normalized.value.fields,
      authorName: input.authorName === undefined ? current.authorName : normalized.value.authorName,
      authorUrl: input.authorUrl === undefined ? current.authorUrl : normalized.value.authorUrl,
      authorIconUrl: input.authorIconUrl === undefined ? current.authorIconUrl : normalized.value.authorIconUrl,
      footerIconUrl: input.footerIconUrl === undefined ? current.footerIconUrl : normalized.value.footerIconUrl,
      url: input.url === undefined ? current.url : normalized.value.url,
      imageUrl: input.imageUrl === undefined ? current.imageUrl : normalized.value.imageUrl,
      thumbnailUrl: input.thumbnailUrl === undefined ? current.thumbnailUrl : normalized.value.thumbnailUrl,
      channelId: input.channelId === undefined ? current.channelId : normalized.value.channelId,
      updatedAt: new Date().toISOString(),
    };
    state.embeds = state.embeds.map((item) => item.id === id ? updated! : item);
  });
  if (duplicateName) return { ok: false, message: 'Un autre modèle porte déjà ce nom : choisis un nom unique.' };
  if (!updated) return { ok: false, message: 'Modèle introuvable.' };
  await addLog({ level: 'info', source: updatedBy, action: 'Modèle embed modifié', detail: updated.name });
  return { ok: true, template: updated };
}

export async function removeEmbedTemplate(id: string, removedBy: string): Promise<boolean> {
  let removed: EmbedTemplate | undefined;
  await updateState((state) => {
    removed = state.embeds.find((item) => item.id === id);
    state.embeds = state.embeds.filter((item) => item.id !== id);
  });
  if (!removed) return false;
  await addLog({ level: 'warn', source: removedBy, action: 'Modèle embed supprimé', detail: removed.name });
  return true;
}

export async function findEmbedTemplate(reference: string): Promise<EmbedTemplate | undefined> {
  const value = reference.trim().toLowerCase();
  const templates = (await getState()).embeds;
  const byId = templates.filter((item) => item.id.toLowerCase().startsWith(value));
  if (byId.length === 1) return byId[0];
  if (byId.length > 1) return undefined;
  return templates.find((item) => item.name.toLowerCase() === value);
}

export async function publishEmbed(
  guild: Guild,
  template: EmbedTemplate,
  channelId?: string | null,
  source = 'bot',
): Promise<EmbedOperationResult> {
  const targetId = channelId || template.channelId;
  if (!targetId) return { ok: false, message: 'Choisis un salon lors de la création ou de la publication.' };
  const channel = await guild.channels.fetch(targetId).catch(() => null);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) ||
    !channel.isTextBased()
  ) {
    return { ok: false, message: 'Salon textuel introuvable ou invalide.' };
  }
  try {
    const message = await channel.send({
      embeds: [buildEmbed(template)],
      allowedMentions: { parse: [] },
    });
    await addLog({
      level: 'success',
      source,
      action: 'Embed publié',
      detail: `« ${template.name} » dans #${channel.name} (message ${message.id})`,
    });
    return { ok: true, template, message: `Embed « ${template.name} » publié dans #${channel.name}.` };
  } catch (error) {
    return { ok: false, message: `Publication impossible : ${error instanceof Error ? error.message : String(error)}` };
  }
}
