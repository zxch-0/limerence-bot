import {
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type OverwriteResolvable,
  type Role,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';
import { channelName, findChannel, findCategory } from './config';
import { getState, updateState } from './store';
import { addLog } from './logs';
import type {
  AppConfig,
  BlueprintCategory,
  BlueprintChannel,
  BlueprintReport,
  BlueprintStep,
} from './types';

// ============================================================
//  Moteur de blueprint : crée/complète la structure du serveur
//  L'opération est IDEMPOTENTE : on peut la relancer autant de
//  fois que nécessaire, rien n'est dupliqué.
// ============================================================

const REASON = 'Limerence Bot — déploiement du blueprint';

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function categoryName(cat: BlueprintCategory): string {
  return `${cat.emoji} ${cat.slug}`.replace(/\s+/g, ' ').trim();
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
    if (role.id === guild.roles.everyone.id) continue;
    const isAdminRole =
      role.permissions.has(PermissionFlagsBits.Administrator) ||
      role.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!isAdminRole) continue;
    if (role.managed) continue;
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
  config: AppConfig,
): OverwriteResolvable[] | undefined {
  if (category.adminOnly || channel.adminOnly) {
    // on garde le rôle "limerencien" hors des salons admin
    return adminOverwrites(guild);
  }
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
  void config;
  return undefined;
}

function channelType(kind: BlueprintChannel['kind']): ChannelType.GuildText | ChannelType.GuildVoice {
  return kind === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
}

// ------------------------------------------------------------
//  Rôle automatique
// ------------------------------------------------------------

export async function ensureRole(
  guild: Guild,
  config: AppConfig,
  report: BlueprintReport,
  dryRun: boolean,
): Promise<Role | null> {
  const cfg = config.role;
  await guild.roles.fetch();
  let role = guild.roles.cache.find((r) => sameName(r.name, cfg.name)) ?? null;

  if (!role) {
    if (dryRun) {
      report.steps.push({
        level: 'created',
        target: 'role',
        message: `Rôle « ${cfg.name} » créé (couleur ${cfg.color})`,
      });
      report.totals.created++;
      return null;
    }
    role = await guild.roles.create({
      name: cfg.name,
      color: cfg.color as `#${string}`,
      hoist: cfg.hoist,
      mentionable: cfg.mentionable,
      reason: REASON,
    });
    report.steps.push({
      level: 'created',
      target: 'role',
      message: `Rôle « ${cfg.name} » créé (couleur ${cfg.color})`,
    });
    report.totals.created++;
  } else {
    const colorOk = role.hexColor.toLowerCase() === cfg.color.toLowerCase();
    const needsUpdate = !colorOk || role.hoist !== cfg.hoist || role.mentionable !== cfg.mentionable;
    if (needsUpdate && !dryRun) {
      await role.edit({
        color: cfg.color as `#${string}`,
        hoist: cfg.hoist,
        mentionable: cfg.mentionable,
        reason: REASON,
      });
      report.steps.push({
        level: 'updated',
        target: 'role',
        message: `Rôle « ${cfg.name} » mis à jour (couleur ${cfg.color})`,
      });
      report.totals.updated++;
    } else {
      report.steps.push({
        level: 'ok',
        target: 'role',
        message: `Rôle « ${cfg.name} » conforme`,
      });
      report.totals.ok++;
    }
  }
  return role;
}

async function assignRoleToExistingMembers(
  guild: Guild,
  role: Role,
  report: BlueprintReport,
  dryRun: boolean,
) {
  if (dryRun) return;
  try {
    await guild.members.fetch();
  } catch {
    /* intent privilégié manquant : on continue avec le cache */
  }
  let added = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    if (member.roles.cache.has(role.id)) continue;
    try {
      await member.roles.add(role, 'Limerence Bot — attribution du rôle aux membres');
      added++;
    } catch {
      /* permissions insuffisantes sur ce membre */
    }
  }
  if (added > 0) {
    report.steps.push({
      level: 'updated',
      target: 'role',
      message: `Rôle attribué à ${added} membre(s) déjà présent(s)`,
    });
    report.totals.updated++;
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
): Promise<CategoryChannel | null> {
  const wanted = categoryName(cat);
  await guild.channels.fetch();
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && sameName(c.name, wanted),
  ) as CategoryChannel | undefined;

  if (!channel) {
    if (dryRun) {
      report.steps.push({
        level: 'created',
        target: `catégorie:${cat.key}`,
        message: `Catégorie « ${wanted} » créée`,
      });
      report.totals.created++;
      return null;
    }
    channel = await guild.channels.create({
      name: wanted,
      type: ChannelType.GuildCategory,
      permissionOverwrites: cat.adminOnly ? adminOverwrites(guild) : undefined,
      reason: REASON,
    });
    report.steps.push({
      level: 'created',
      target: `catégorie:${cat.key}`,
      message: `Catégorie « ${wanted} » créée`,
    });
    report.totals.created++;
    return channel;
  }

  report.steps.push({
    level: 'ok',
    target: `catégorie:${cat.key}`,
    message: `Catégorie « ${wanted} » déjà présente`,
  });
  report.totals.ok++;
  return channel;
}

async function ensureChannel(
  guild: Guild,
  channelCfg: BlueprintChannel,
  cat: BlueprintCategory,
  parent: CategoryChannel | null,
  config: AppConfig,
  report: BlueprintReport,
  dryRun: boolean,
): Promise<GuildBasedChannel | null> {
  const wanted = channelName(channelCfg, config.prefix);
  const type = channelType(channelCfg.kind);
  const target = `salon:${channelCfg.key}`;

  let existing = guild.channels.cache.find(
    (c) => c.type === type && sameName(c.name, wanted),
  ) as GuildBasedChannel | undefined;

  if (!existing) {
    // rattrapage : salon créé hors blueprint, même slug mais emoji différent
    existing = guild.channels.cache.find((c) => {
      if (c.type !== type) return false;
      const n = c.name.toLowerCase();
      if (channelCfg.kind === 'voice') {
        return n.includes((channelCfg.label ?? channelCfg.slug).toLowerCase());
      }
      return n.includes(`➥ ${channelCfg.slug.toLowerCase()}`) || n === `${channelCfg.slug}`.toLowerCase();
    }) as GuildBasedChannel | undefined;
  }

  if (!existing) {
    if (dryRun) {
      report.steps.push({ level: 'created', target, message: `${wanted} créé` });
      report.totals.created++;
      return null;
    }
    const created = await guild.channels.create({
      name: wanted,
      type,
      parent: parent?.id,
      topic: channelCfg.kind === 'text' ? (channelCfg.topic ?? undefined) : undefined,
      userLimit: channelCfg.kind === 'voice' ? (channelCfg.userLimit ?? 0) : undefined,
      permissionOverwrites: channelOverwrites(guild, channelCfg, cat, config),
      reason: REASON,
    });
    report.steps.push({ level: 'created', target, message: `${wanted} créé` });
    report.totals.created++;
    return created;
  }

  // le salon existe : on aligne nom, catégorie, sujet et limite
  const fixes: string[] = [];
  if (!sameName(existing.name, wanted)) fixes.push('nom');
  if (parent && existing.parentId !== parent.id) fixes.push('catégorie');
  if (
    channelCfg.kind === 'text' &&
    channelCfg.topic &&
    (existing as TextChannel).topic !== channelCfg.topic
  ) {
    fixes.push('sujet');
  }
  if (
    channelCfg.kind === 'voice' &&
    (existing as VoiceChannel).userLimit !== (channelCfg.userLimit ?? 0)
  ) {
    fixes.push('limite');
  }

  if (fixes.length && !dryRun) {
    await existing.edit({
      name: wanted,
      parent: parent?.id,
      topic: channelCfg.kind === 'text' ? (channelCfg.topic ?? undefined) : undefined,
      userLimit: channelCfg.kind === 'voice' ? (channelCfg.userLimit ?? 0) : undefined,
      reason: REASON,
    });
    report.steps.push({
      level: 'updated',
      target,
      message: `${wanted} mis à jour (${fixes.join(', ')})`,
    });
    report.totals.updated++;
  } else {
    report.steps.push({ level: 'ok', target, message: `${wanted} conforme` });
    report.totals.ok++;
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

export async function applyBlueprint(
  guild: Guild,
  options: ApplyOptions = {},
): Promise<BlueprintReport> {
  const dryRun = options.dryRun ?? false;
  const state = await getState();
  const config = state.config;

  const report: BlueprintReport = {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    dryRun,
    steps: [],
    totals: { created: 0, updated: 0, ok: 0, skipped: 0, error: 0 },
  };

  // 1. rôle
  let role: Role | null = null;
  try {
    role = await ensureRole(guild, config, report, dryRun);
    if (!dryRun && role && config.role.assignToExisting && options.assignRole !== false) {
      await assignRoleToExistingMembers(guild, role, report, dryRun);
    }
  } catch (err) {
    report.steps.push({
      level: 'error',
      target: 'role',
      message: `Échec sur le rôle : ${(err as Error).message}`,
    });
    report.totals.error++;
  }

  // 2. catégories + salons (séquentiel : plus respectueux des rate limits Discord)
  for (const cat of config.categories) {
    let parent: CategoryChannel | null = null;
    try {
      parent = await ensureCategory(guild, cat, report, dryRun);
    } catch (err) {
      report.steps.push({
        level: 'error',
        target: `catégorie:${cat.key}`,
        message: `Échec catégorie « ${cat.slug} » : ${(err as Error).message}`,
      });
      report.totals.error++;
      continue;
    }

    for (const ch of cat.channels) {
      try {
        await ensureChannel(guild, ch, cat, parent, config, report, dryRun);
      } catch (err) {
        report.steps.push({
          level: 'error',
          target: `salon:${ch.key}`,
          message: `Échec salon « ${ch.slug} » : ${(err as Error).message}`,
        });
        report.totals.error++;
      }
    }
  }

  report.finishedAt = new Date().toISOString();

  if (!dryRun) {
    await updateState((s) => {
      s.config.guildId = guild.id;
      s.meta.lastSetupAt = report.finishedAt;
      s.meta.lastSetupBy = options.source ?? 'bot';
      s.meta.blueprintReport = report;
      s.meta.botTag = guild.client.user?.tag ?? s.meta.botTag;
    });
    await addLog({
      level: report.totals.error ? 'warn' : 'success',
      source: options.source ?? 'bot',
      action: 'Déploiement du blueprint',
      detail: `${report.totals.created} créé(s), ${report.totals.updated} mis à jour, ${report.totals.ok} conforme(s), ${report.totals.error} erreur(s)`,
    });
  }

  return report;
}

// ------------------------------------------------------------
//  Résolution & audit
// ------------------------------------------------------------

/** Retrouve un salon du blueprint sur le serveur (par son nom attendu). */
export async function resolveChannel(
  guild: Guild,
  config: AppConfig,
  key: string,
): Promise<GuildBasedChannel | null> {
  const cfg = findChannel(config, key);
  if (!cfg) return null;
  const wanted = channelName(cfg, config.prefix);
  await guild.channels.fetch();
  return (
    (guild.channels.cache.find((c) => sameName(c.name, wanted)) as GuildBasedChannel | undefined) ??
    null
  );
}

export interface AuditItem {
  key: string;
  kind: 'role' | 'category' | 'channel';
  expected: string;
  actual: string | null;
  status: 'ok' | 'missing' | 'outdated';
}

/** Compare le serveur réel avec le blueprint (utilisé par la page Structure). */
export async function auditBlueprint(guild: Guild, config: AppConfig): Promise<AuditItem[]> {
  const items: AuditItem[] = [];
  await guild.channels.fetch();
  await guild.roles.fetch().catch(() => undefined);

  const role = guild.roles.cache.find((r) => sameName(r.name, config.role.name));
  items.push({
    key: 'role',
    kind: 'role',
    expected: config.role.name,
    actual: role?.name ?? null,
    status: !role
      ? 'missing'
      : role.hexColor.toLowerCase() === config.role.color.toLowerCase()
        ? 'ok'
        : 'outdated',
  });

  for (const cat of config.categories) {
    const wanted = categoryName(cat);
    const found = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && sameName(c.name, wanted),
    );
    items.push({
      key: `cat:${cat.key}`,
      kind: 'category',
      expected: wanted,
      actual: found?.name ?? null,
      status: !found ? 'missing' : sameName(found.name, wanted) ? 'ok' : 'outdated',
    });

    for (const ch of cat.channels) {
      const expected = channelName(ch, config.prefix);
      const type = channelType(ch.kind);
      const found = guild.channels.cache.find(
        (c) => c.type === type && sameName(c.name, expected),
      );
      items.push({
        key: ch.key,
        kind: 'channel',
        expected,
        actual: found?.name ?? null,
        status: !found ? 'missing' : 'ok',
      });
    }
  }
  return items;
}

/** Donne le rôle "limerencien" à un membre (utilisé à l'arrivée). */
export async function giveMemberRole(member: GuildMember): Promise<boolean> {
  const state = await getState();
  if (!state.config.role.autoAssign) return false;
  const role = member.guild.roles.cache.find((r) => sameName(r.name, state.config.role.name));
  if (!role) return false;
  if (member.roles.cache.has(role.id)) return false;
  await member.roles.add(role, 'Limerence Bot — rôle automatique à l’arrivée');
  return true;
}

export function isKnownChannelKey(config: AppConfig, key: string): boolean {
  return Boolean(findChannel(config, key));
}

export function categoryByKey(config: AppConfig, key: string) {
  return findCategory(config, key);
}
