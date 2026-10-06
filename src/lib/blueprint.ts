import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type OverwriteResolvable,
  type Role,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';
import { channelName, findChannel } from './config';
import { getState, updateState } from './store';
import { addLog } from './logs';
import type {
  AppConfig,
  BlueprintCategory,
  BlueprintChannel,
  BlueprintReport,
  BlueprintResourceIds,
  BlueprintStep,
} from './types';

// ============================================================
//  Moteur de blueprint : crée/répare la structure sans doublons
// ============================================================

const REASON = 'Limerence Bot — déploiement du blueprint';
const applyLocks = new Map<string, Promise<void>>();

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

function categoryName(cat: BlueprintCategory): string {
  return `${cat.emoji} ${cat.slug}`.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function categoryHasSlug(name: string, category: BlueprintCategory): boolean {
  const current = normalizeForMatch(name);
  const wanted = normalizeForMatch(category.slug);
  return current === wanted || current.startsWith(`${wanted}-`) || current.endsWith(`-${wanted}`);
}

function categoryMap(): BlueprintResourceIds {
  return {
    categoryIds: {},
    channelIds: {},
    managedCategoryOverwrites: [],
    managedChannelOverwrites: [],
  };
}

function addStep(
  report: BlueprintReport,
  level: BlueprintStep['level'],
  target: string,
  message: string,
): void {
  report.steps.push({ level, target, message });
  report.totals[level]++;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Overwrites pour une catégorie ou un salon réservé aux admins. */
function adminOverwrites(guild: Guild): OverwriteResolvable[] {
  const overwrites: OverwriteResolvable[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.roles.everyone.id || role.managed) continue;
    const isAdminRole =
      role.permissions.has(PermissionFlagsBits.Administrator) ||
      role.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!isAdminRole) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.Connect,
      ],
    });
  }
  return overwrites;
}

function channelOverwrites(
  guild: Guild,
  channel: BlueprintChannel,
  category: BlueprintCategory,
): OverwriteResolvable[] | undefined {
  if (category.adminOnly || channel.adminOnly) return adminOverwrites(guild);
  if (channel.readOnly) {
    return [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.SendMessages],
      },
    ];
  }
  if (channel.isHub) {
    return [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        deny: [PermissionFlagsBits.Speak],
      },
    ];
  }
  return undefined;
}

function expectedOverwriteBits(overwrite: OverwriteResolvable, type: 'allow' | 'deny'): bigint {
  const permissions = (overwrite as { allow?: unknown; deny?: unknown })[type];
  return new PermissionsBitField((permissions ?? []) as never).bitfield;
}

function overwriteSetMatches(
  channel: GuildBasedChannel,
  expected: OverwriteResolvable[] | undefined,
): boolean {
  if (!expected) return true;
  const current = (channel as CategoryChannel | TextChannel | VoiceChannel).permissionOverwrites.cache;
  if (current.size !== expected.length) return false;
  return expected.every((entry) => {
    const expectedId = String((entry as { id: unknown }).id);
    const actual = current.get(expectedId);
    return Boolean(
      actual &&
        actual.allow.bitfield === expectedOverwriteBits(entry, 'allow') &&
        actual.deny.bitfield === expectedOverwriteBits(entry, 'deny'),
    );
  });
}

function channelType(kind: BlueprintChannel['kind']): ChannelType.GuildText | ChannelType.GuildVoice {
  return kind === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function channelHasLegacySlug(channel: GuildBasedChannel, cfg: BlueprintChannel): boolean {
  const wanted = normalizeForMatch(cfg.kind === 'voice' ? cfg.label ?? cfg.slug : cfg.slug);
  const current = normalizeForMatch(channel.name);
  return (
    current === wanted ||
    current.startsWith(`${wanted}-`) ||
    current.endsWith(`-${wanted}`) ||
    current.includes(`-${wanted}-`)
  );
}

function findExistingChannel(
  guild: Guild,
  cfg: BlueprintChannel,
  wanted: string,
  parentId?: string,
  excludedIds: ReadonlySet<string> = new Set(),
): GuildBasedChannel | undefined {
  const type = channelType(cfg.kind);
  const eligible = [...guild.channels.cache.values()].filter(
    (channel) => channel.type === type && !excludedIds.has(channel.id),
  );
  const inParent = (channel: GuildBasedChannel) => Boolean(parentId && channel.parentId === parentId);
  return (
    eligible.find((channel) => inParent(channel) && sameName(channel.name, wanted)) ??
    eligible.find((channel) => sameName(channel.name, wanted)) ??
    eligible.find((channel) => inParent(channel) && channelHasLegacySlug(channel, cfg)) ??
    eligible.find((channel) => channelHasLegacySlug(channel, cfg))
  );
}

// ------------------------------------------------------------
//  Rôle automatique
// ------------------------------------------------------------

export async function ensureRole(
  guild: Guild,
  config: AppConfig,
  report: BlueprintReport,
  dryRun: boolean,
  resources: BlueprintResourceIds = categoryMap(),
): Promise<Role | null> {
  const cfg = config.role;
  const mappedRole = resources.roleId ? guild.roles.cache.get(resources.roleId) : undefined;
  let role =
    mappedRole ??
    guild.roles.cache.find((candidate) => sameName(candidate.name, cfg.name)) ??
    null;

  if (!role) {
    if (dryRun) {
      addStep(report, 'created', 'role', `Rôle « ${cfg.name} » créé (couleur ${cfg.color})`);
      return null;
    }
    role = await guild.roles.create({
      name: cfg.name,
      color: cfg.color as `#${string}`,
      hoist: cfg.hoist,
      mentionable: cfg.mentionable,
      reason: REASON,
    });
    resources.roleId = role.id;
    addStep(report, 'created', 'role', `Rôle « ${cfg.name} » créé (couleur ${cfg.color})`);
    return role;
  }

  resources.roleId = role.id;
  const fixes: string[] = [];
  if (role.name !== cfg.name) fixes.push('nom');
  if (role.hexColor.toLowerCase() !== cfg.color.toLowerCase()) fixes.push('couleur');
  if (role.hoist !== cfg.hoist) fixes.push('affichage');
  if (role.mentionable !== cfg.mentionable) fixes.push('mention');

  if (fixes.length) {
    if (!dryRun) {
      await role.edit(
        {
          name: cfg.name,
          color: cfg.color as `#${string}`,
          hoist: cfg.hoist,
          mentionable: cfg.mentionable,
          reason: REASON,
        },
      );
    }
    addStep(report, 'updated', 'role', `Rôle « ${cfg.name} » ${dryRun ? 'à mettre à jour' : 'mis à jour'} (${fixes.join(', ')})`);
  } else {
    addStep(report, 'ok', 'role', `Rôle « ${cfg.name} » conforme`);
  }
  return role;
}

async function assignRoleToExistingMembers(
  guild: Guild,
  role: Role,
  report: BlueprintReport,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  try {
    await guild.members.fetch();
  } catch {
    // Intent privilégié absent : on continue avec les membres déjà en cache.
  }
  let added = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user.bot || member.roles.cache.has(role.id)) continue;
    try {
      await member.roles.add(role, 'Limerence Bot — attribution du rôle aux membres');
      added++;
    } catch {
      // Hiérarchie des rôles ou permissions insuffisantes pour ce membre.
    }
  }
  if (added > 0) {
    addStep(report, 'updated', 'role', `Rôle attribué à ${added} membre(s) déjà présent(s)`);
  }
}

// ------------------------------------------------------------
//  Catégories & salons
// ------------------------------------------------------------

async function ensureCategory(
  guild: Guild,
  cat: BlueprintCategory,
  report: BlueprintReport,
  dryRun: boolean,
  resources: BlueprintResourceIds,
): Promise<CategoryChannel | null> {
  const wanted = categoryName(cat);
  const expectedOverwrites = cat.adminOnly ? adminOverwrites(guild) : undefined;
  const shouldClearOverwrites = !expectedOverwrites && resources.managedCategoryOverwrites.includes(cat.key);
  const overwriteTarget = expectedOverwrites ?? (shouldClearOverwrites ? [] : undefined);
  const reservedCategoryIds = new Set(
    Object.entries(resources.categoryIds)
      .filter(([key]) => key !== cat.key)
      .map(([, id]) => id),
  );
  const mappedId = resources.categoryIds[cat.key];
  const mapped = mappedId && !reservedCategoryIds.has(mappedId) ? guild.channels.cache.get(mappedId) : undefined;
  const availableCategories = [...guild.channels.cache.values()].filter(
    (channel): channel is CategoryChannel =>
      channel.type === ChannelType.GuildCategory && !reservedCategoryIds.has(channel.id),
  );
  let category =
    (mapped?.type === ChannelType.GuildCategory ? mapped : undefined) ??
    availableCategories.find((channel) => sameName(channel.name, wanted)) ??
    availableCategories.find((channel) => categoryHasSlug(channel.name, cat));

  if (!category) {
    if (dryRun) {
      addStep(report, 'created', `catégorie:${cat.key}`, `Catégorie « ${wanted} » créée`);
      return null;
    }
    category = await guild.channels.create({
      name: wanted,
      type: ChannelType.GuildCategory,
      permissionOverwrites: expectedOverwrites,
      reason: REASON,
    });
    resources.categoryIds[cat.key] = category.id;
    if (expectedOverwrites && !resources.managedCategoryOverwrites.includes(cat.key)) {
      resources.managedCategoryOverwrites.push(cat.key);
    } else if (shouldClearOverwrites) {
      resources.managedCategoryOverwrites = resources.managedCategoryOverwrites.filter((key) => key !== cat.key);
    }
    addStep(report, 'created', `catégorie:${cat.key}`, `Catégorie « ${wanted} » créée`);
    return category;
  }

  resources.categoryIds[cat.key] = category.id;
  const fixes: string[] = [];
  if (!sameName(category.name, wanted)) fixes.push('nom');
  if (overwriteTarget && !overwriteSetMatches(category, overwriteTarget)) fixes.push('permissions');
  if (expectedOverwrites && !resources.managedCategoryOverwrites.includes(cat.key)) {
    resources.managedCategoryOverwrites.push(cat.key);
  }
  if (fixes.length) {
    if (!dryRun) {
      await category.edit({
        name: wanted,
        ...(overwriteTarget ? { permissionOverwrites: overwriteTarget } : {}),
        reason: REASON,
      });
    }
    addStep(
      report,
      'updated',
      `catégorie:${cat.key}`,
      `Catégorie « ${wanted} » ${dryRun ? 'à aligner' : 'mise à jour'} (${fixes.join(', ')})`,
    );
  } else {
    addStep(report, 'ok', `catégorie:${cat.key}`, `Catégorie « ${wanted} » déjà présente`);
  }
  if (shouldClearOverwrites) {
    resources.managedCategoryOverwrites = resources.managedCategoryOverwrites.filter((key) => key !== cat.key);
  }
  return category;
}

async function ensureChannel(
  guild: Guild,
  channelCfg: BlueprintChannel,
  cat: BlueprintCategory,
  parent: CategoryChannel | null,
  config: AppConfig,
  report: BlueprintReport,
  dryRun: boolean,
  resources: BlueprintResourceIds,
): Promise<GuildBasedChannel | null> {
  const wanted = channelName(channelCfg, config.prefix).slice(0, 100);
  const type = channelType(channelCfg.kind);
  const target = `salon:${channelCfg.key}`;
  const reservedIds = new Set(
    Object.entries(resources.channelIds)
      .filter(([key]) => key !== channelCfg.key)
      .map(([, id]) => id),
  );
  const mappedId = resources.channelIds[channelCfg.key];
  const mapped = mappedId && !reservedIds.has(mappedId) ? guild.channels.cache.get(mappedId) : undefined;
  let existing = mapped?.type === type
    ? mapped
    : findExistingChannel(guild, channelCfg, wanted, parent?.id, reservedIds);

  if (!existing) {
    if (dryRun) {
      addStep(report, 'created', target, `${wanted} créé`);
      return null;
    }
    if (!parent) {
      addStep(report, 'skipped', target, `${wanted} ignoré : catégorie indisponible`);
      return null;
    }
    const newOverwrites = channelOverwrites(guild, channelCfg, cat);
    const created = await guild.channels.create({
      name: wanted,
      type,
      parent: parent.id,
      topic: channelCfg.kind === 'text' ? channelCfg.topic ?? undefined : undefined,
      userLimit: channelCfg.kind === 'voice' ? channelCfg.userLimit ?? 0 : undefined,
      permissionOverwrites: newOverwrites,
      reason: REASON,
    });
    resources.channelIds[channelCfg.key] = created.id;
    if (newOverwrites && !resources.managedChannelOverwrites.includes(channelCfg.key)) {
      resources.managedChannelOverwrites.push(channelCfg.key);
    } else {
      resources.managedChannelOverwrites = resources.managedChannelOverwrites.filter((key) => key !== channelCfg.key);
    }
    addStep(report, 'created', target, `${wanted} créé dans « ${parent.name} »`);
    return created;
  }

  resources.channelIds[channelCfg.key] = existing.id;
  const fixes: string[] = [];
  const overwrites = channelOverwrites(guild, channelCfg, cat);
  const shouldClearOverwrites = !overwrites && resources.managedChannelOverwrites.includes(channelCfg.key);
  const overwriteTarget = overwrites ?? (shouldClearOverwrites ? [] : undefined);
  if (!sameName(existing.name, wanted)) fixes.push('nom');
  if (parent && existing.parentId !== parent.id) fixes.push('catégorie');
  if (
    channelCfg.kind === 'text' &&
    (existing as TextChannel).topic !== (channelCfg.topic ?? null)
  ) {
    fixes.push('sujet');
  }
  if (
    channelCfg.kind === 'voice' &&
    (existing as VoiceChannel).userLimit !== (channelCfg.userLimit ?? 0)
  ) {
    fixes.push('limite');
  }
  if (overwriteTarget && !overwriteSetMatches(existing, overwriteTarget)) fixes.push('permissions');
  if (overwrites && !resources.managedChannelOverwrites.includes(channelCfg.key)) {
    resources.managedChannelOverwrites.push(channelCfg.key);
  }

  if (fixes.length) {
    if (!dryRun) {
      await existing.edit({
        name: wanted,
        ...(parent ? { parent: parent.id } : {}),
        ...(channelCfg.kind === 'text' ? { topic: channelCfg.topic ?? null } : {}),
        ...(channelCfg.kind === 'voice' ? { userLimit: channelCfg.userLimit ?? 0 } : {}),
        ...(overwriteTarget ? { permissionOverwrites: overwriteTarget } : {}),
        reason: REASON,
      });
    }
    addStep(
      report,
      'updated',
      target,
      `${wanted} ${dryRun ? 'à aligner' : 'mis à jour'} (${fixes.join(', ')})`,
    );
  } else {
    addStep(report, 'ok', target, `${wanted} conforme${parent ? ` dans « ${parent.name} »` : ''}`);
  }
  if (shouldClearOverwrites) {
    resources.managedChannelOverwrites = resources.managedChannelOverwrites.filter((key) => key !== channelCfg.key);
  }
  return existing;
}

// ------------------------------------------------------------
//  Déploiement complet
// ------------------------------------------------------------

export interface ApplyOptions {
  dryRun?: boolean;
  source?: string;
  /** attribuer le rôle aux membres déjà présents */
  assignRole?: boolean;
}

/**
 * Sérialise les déploiements pour un serveur. Cela évite que deux clics
 * rapprochés (panel + commande Discord, ou double-clic) créent les mêmes salons.
 */
export async function applyBlueprint(
  guild: Guild,
  options: ApplyOptions = {},
): Promise<BlueprintReport> {
  const previous = applyLocks.get(guild.id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  applyLocks.set(guild.id, current);
  await previous;
  try {
    return await applyBlueprintLocked(guild, options);
  } finally {
    release();
    if (applyLocks.get(guild.id) === current) applyLocks.delete(guild.id);
  }
}

async function applyBlueprintLocked(
  guild: Guild,
  options: ApplyOptions,
): Promise<BlueprintReport> {
  const dryRun = options.dryRun ?? false;
  const state = await getState();
  const config = state.config;
  const saved = state.meta.blueprintResources?.[guild.id];
  const resources: BlueprintResourceIds = saved
    ? {
        roleId: saved.roleId,
        categoryIds: { ...(saved.categoryIds ?? {}) },
        channelIds: { ...(saved.channelIds ?? {}) },
        managedCategoryOverwrites: [...(saved.managedCategoryOverwrites ?? [])],
        managedChannelOverwrites: [...(saved.managedChannelOverwrites ?? [])],
      }
    : categoryMap();
  const report: BlueprintReport = {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    dryRun,
    steps: [],
    totals: { created: 0, updated: 0, ok: 0, skipped: 0, error: 0 },
  };

  // Rafraîchir avant toute mutation. Si la lecture échoue, on n'essaie surtout
  // pas de créer « à l'aveugle » : ce serait une source de doublons.
  let readError: unknown;
  try {
    await guild.channels.fetch();
    await guild.roles.fetch();
  } catch (error) {
    readError = error;
  }
  if (readError) {
    addStep(report, 'error', 'discord:fetch', `Impossible de lire la structure du serveur : ${errorMessage(readError)}. Aucun salon n’a été modifié.`);
    report.finishedAt = new Date().toISOString();
    if (!dryRun) {
      await updateState((next) => {
        next.config.guildId = guild.id;
        next.meta.lastSetupAt = report.finishedAt;
        next.meta.lastSetupBy = options.source ?? 'bot';
        next.meta.blueprintReport = report;
      });
      await addLog({ level: 'error', source: options.source ?? 'bot', action: 'Lecture du blueprint échouée', detail: errorMessage(readError) });
    }
    return report;
  }

  try {
    const role = await ensureRole(guild, config, report, dryRun, resources);
    if (!dryRun && role && config.role.assignToExisting && options.assignRole !== false) {
      await assignRoleToExistingMembers(guild, role, report, dryRun);
    }
  } catch (error) {
    addStep(report, 'error', 'role', `Échec sur le rôle : ${errorMessage(error)}`);
  }

  // Traitement séquentiel : respecte les limites Discord et permet de reprendre
  // après une erreur. Une catégorie en échec ne laisse pas ses salons à la racine.
  for (const cat of config.categories) {
    let parent: CategoryChannel | null = null;
    try {
      parent = await ensureCategory(guild, cat, report, dryRun, resources);
    } catch (error) {
      addStep(report, 'error', `catégorie:${cat.key}`, `Échec catégorie « ${cat.slug} » : ${errorMessage(error)}`);
      for (const channel of cat.channels) {
        addStep(report, 'skipped', `salon:${channel.key}`, `Ignoré : la catégorie « ${cat.slug} » n’a pas pu être préparée`);
      }
      continue;
    }

    for (const channel of cat.channels) {
      try {
        await ensureChannel(guild, channel, cat, parent, config, report, dryRun, resources);
      } catch (error) {
        addStep(report, 'error', `salon:${channel.key}`, `Échec salon « ${channel.slug} » : ${errorMessage(error)}`);
      }
    }
  }

  report.finishedAt = new Date().toISOString();

  if (!dryRun) {
    const categoryKeys = new Set(config.categories.map((category) => category.key));
    const channelKeys = new Set(config.categories.flatMap((category) => category.channels.map((channel) => channel.key)));
    for (const key of Object.keys(resources.categoryIds)) if (!categoryKeys.has(key)) delete resources.categoryIds[key];
    for (const key of Object.keys(resources.channelIds)) if (!channelKeys.has(key)) delete resources.channelIds[key];
    resources.managedCategoryOverwrites = resources.managedCategoryOverwrites.filter((key) => categoryKeys.has(key));
    resources.managedChannelOverwrites = resources.managedChannelOverwrites.filter((key) => channelKeys.has(key));

    await updateState((next) => {
      next.config.guildId = guild.id;
      next.meta.lastSetupAt = report.finishedAt;
      next.meta.lastSetupBy = options.source ?? 'bot';
      next.meta.blueprintReport = report;
      next.meta.botTag = guild.client.user?.tag ?? next.meta.botTag;
      next.meta.blueprintResources ??= {};
      next.meta.blueprintResources[guild.id] = resources;
    });
    await addLog({
      level: report.totals.error ? 'warn' : 'success',
      source: options.source ?? 'bot',
      action: 'Déploiement du blueprint',
      detail: `${report.totals.created} créé(s), ${report.totals.updated} mis à jour, ${report.totals.ok} conforme(s), ${report.totals.skipped} ignoré(s), ${report.totals.error} erreur(s)`,
    });
  }

  return report;
}

// ------------------------------------------------------------
//  Résolution & audit
// ------------------------------------------------------------

/** Retrouve un salon du blueprint sur le serveur (ID géré, puis nom attendu). */
export async function resolveChannel(
  guild: Guild,
  config: AppConfig,
  key: string,
): Promise<GuildBasedChannel | null> {
  const cfg = findChannel(config, key);
  if (!cfg) return null;
  await guild.channels.fetch().catch(() => undefined);
  const type = channelType(cfg.kind);
  const saved = (await getState()).meta.blueprintResources?.[guild.id]?.channelIds[key];
  const mapped = saved ? guild.channels.cache.get(saved) : undefined;
  if (mapped?.type === type) return mapped;
  const wanted = channelName(cfg, config.prefix);
  return findExistingChannel(guild, cfg, wanted) ?? null;
}

export interface AuditItem {
  key: string;
  kind: 'role' | 'category' | 'channel';
  expected: string;
  actual: string | null;
  status: 'ok' | 'missing' | 'outdated';
}

/** Compare le serveur réel avec le blueprint (utilisé par le panel et /structure). */
export async function auditBlueprint(guild: Guild, config: AppConfig): Promise<AuditItem[]> {
  const items: AuditItem[] = [];
  await Promise.all([guild.channels.fetch(), guild.roles.fetch().catch(() => undefined)]);
  const resources = (await getState()).meta.blueprintResources?.[guild.id];

  const role = (resources?.roleId ? guild.roles.cache.get(resources.roleId) : undefined) ??
    guild.roles.cache.find((candidate) => sameName(candidate.name, config.role.name));
  const roleOutdated = Boolean(
    role &&
      (role.name !== config.role.name ||
        role.hexColor.toLowerCase() !== config.role.color.toLowerCase() ||
        role.hoist !== config.role.hoist ||
        role.mentionable !== config.role.mentionable),
  );
  items.push({
    key: 'role',
    kind: 'role',
    expected: config.role.name,
    actual: role?.name ?? null,
    status: !role ? 'missing' : roleOutdated ? 'outdated' : 'ok',
  });

  const claimedCategoryIds = new Set<string>();
  const claimedChannelIds = new Set<string>();
  for (const category of config.categories) {
    const expectedCategory = categoryName(category);
    const savedCategoryId = resources?.categoryIds[category.key];
    const mappedCategory = savedCategoryId && !claimedCategoryIds.has(savedCategoryId)
      ? guild.channels.cache.get(savedCategoryId)
      : undefined;
    const availableCategories = [...guild.channels.cache.values()].filter(
      (channel): channel is CategoryChannel =>
        channel.type === ChannelType.GuildCategory && !claimedCategoryIds.has(channel.id),
    );
    const foundCategory =
      (mappedCategory?.type === ChannelType.GuildCategory ? mappedCategory : undefined) ??
      availableCategories.find((channel) => sameName(channel.name, expectedCategory)) ??
      availableCategories.find((channel) => categoryHasSlug(channel.name, category));
    if (foundCategory) claimedCategoryIds.add(foundCategory.id);
    const expectedCategoryOverwrites = category.adminOnly ? adminOverwrites(guild) : undefined;
    const shouldClearCategoryOverwrites = !expectedCategoryOverwrites &&
      Boolean(resources?.managedCategoryOverwrites?.includes(category.key));
    const categoryOverwriteTarget = expectedCategoryOverwrites ?? (shouldClearCategoryOverwrites ? [] : undefined);
    const categoryOutdated = Boolean(
      foundCategory &&
        (!sameName(foundCategory.name, expectedCategory) ||
          (categoryOverwriteTarget && !overwriteSetMatches(foundCategory, categoryOverwriteTarget))),
    );
    items.push({
      key: `cat:${category.key}`,
      kind: 'category',
      expected: expectedCategory,
      actual: foundCategory?.name ?? null,
      status: !foundCategory ? 'missing' : categoryOutdated ? 'outdated' : 'ok',
    });

    for (const channel of category.channels) {
      const expected = channelName(channel, config.prefix);
      const type = channelType(channel.kind);
      const savedId = resources?.channelIds[channel.key];
      const mappedChannel = savedId && !claimedChannelIds.has(savedId)
        ? guild.channels.cache.get(savedId)
        : undefined;
      const found = mappedChannel?.type === type
        ? mappedChannel
        : findExistingChannel(guild, channel, expected, foundCategory?.id, claimedChannelIds);
      if (found) claimedChannelIds.add(found.id);
      const expectedOverwrites = channelOverwrites(guild, channel, category);
      const shouldClearChannelOverwrites = !expectedOverwrites &&
        Boolean(resources?.managedChannelOverwrites?.includes(channel.key));
      const channelOverwriteTarget = expectedOverwrites ?? (shouldClearChannelOverwrites ? [] : undefined);
      const needsUpdate = Boolean(
        found &&
          (!sameName(found.name, expected) ||
            (foundCategory && found.parentId !== foundCategory.id) ||
            (channel.kind === 'text' && (found as TextChannel).topic !== (channel.topic ?? null)) ||
            (channel.kind === 'voice' && (found as VoiceChannel).userLimit !== (channel.userLimit ?? 0)) ||
            (channelOverwriteTarget && !overwriteSetMatches(found, channelOverwriteTarget))),
      );
      items.push({
        key: channel.key,
        kind: 'channel',
        expected,
        actual: found
          ? `${found.name}${found.parent?.name ? ` · ${found.parent.name}` : ' · sans catégorie'}`
          : null,
        status: !found ? 'missing' : needsUpdate ? 'outdated' : 'ok',
      });
    }
  }
  return items;
}

/** Donne le rôle configuré à un membre (utilisé à l'arrivée). */
export async function giveMemberRole(member: GuildMember): Promise<boolean> {
  const state = await getState();
  if (!state.config.role.autoAssign) return false;
  const mappedId = state.meta.blueprintResources?.[member.guild.id]?.roleId;
  const role = (mappedId ? member.guild.roles.cache.get(mappedId) : undefined) ??
    member.guild.roles.cache.find((candidate) => sameName(candidate.name, state.config.role.name));
  if (!role || member.roles.cache.has(role.id)) return false;
  await member.roles.add(role, 'Limerence Bot — rôle automatique à l’arrivée');
  return true;
}
