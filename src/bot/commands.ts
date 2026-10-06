import {
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Client,
  type GuildBasedChannel,
  type GuildMember,
  type BaseGuildTextChannel,
  type ModalSubmitInteraction,
  type VoiceChannel,
} from 'discord.js';
import { applyBlueprint, auditBlueprint } from '../lib/blueprint';
import { resolveChannelSafe } from './resolve';
import { getState } from '../lib/store';
import { getPublicUrl, isOwner } from '../lib/auth';
import { createAnnouncement, parseSchedule, sendAnnouncement, cancelAnnouncement } from './announcements';
import { submitConfession } from './confessions';
import { banMember, kickMember, lockChannel, purgeMessages, setSlowmode } from './moderation';
import { createEmbedTemplate, findEmbedTemplate, publishEmbed, removeEmbedTemplate, updateEmbedTemplate } from './embeds';
import { channelDeletionPhrase, deleteAllGuildChannels } from '../lib/maintenance';
import { addLog } from '../lib/logs';
import { getRoom, setRoomLimit, transferOwnership, renameRoom, toggleLock, allowMember, kickFromRoom, deleteRoom } from './tempRooms';
import type { AppConfig } from '../lib/types';

// ============================================================
//  Commandes slash du bot Limerence
// ============================================================

function vocalOption(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return sub;
}

export function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Crée ou répare toute la structure du serveur (catégories, salons, rôle)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addBooleanOption((o) =>
        o.setName('apercu').setDescription('Simulation : affiche ce qui serait fait, sans rien modifier'),
      )
      .addBooleanOption((o) =>
        o.setName('role_existants').setDescription('Donner le rôle limerencien aux membres déjà présents (défaut : oui)'),
      ),

    new SlashCommandBuilder()
      .setName('structure')
      .setDescription('Vérifie que le serveur correspond bien au blueprint')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName('confession')
      .setDescription('Envoie une confession 100 % anonyme')
      .addStringOption((o) =>
        o.setName('message').setDescription('Ta confession (sinon un formulaire s’ouvre)').setMaxLength(900),
      ),

    new SlashCommandBuilder()
      .setName('annonce')
      .setDescription('Publier ou programmer une annonce')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName('message').setDescription('Texte de l’annonce').setRequired(true).setMaxLength(1800))
      .addChannelOption((o) =>
        o
          .setName('salon')
          .setDescription('Salon d’envoi (défaut : annonces)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      )
      .addStringOption((o) =>
        o
          .setName('quand')
          .setDescription('Vide = maintenant. Ex : 30m, 2h, 2026-10-06T20:00'),
      )
      .addStringOption((o) =>
        o
          .setName('mention')
          .setDescription('Mentionner tout le monde ?')
          .addChoices(
            { name: 'Aucune', value: 'none' },
            { name: '@here', value: 'here' },
            { name: '@everyone', value: 'everyone' },
          ),
      ),

    new SlashCommandBuilder()
      .setName('annonces')
      .setDescription('Lister les annonces programmées et envoyées')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('liste').setDescription('Voir les annonces'))
      .addSubcommand((s) =>
        s
          .setName('annuler')
          .setDescription('Annuler une annonce programmée')
          .addStringOption((o) => o.setName('id').setDescription('Les 8 premiers caractères de l’ID').setRequired(true)),
      ),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Supprimer des messages en masse')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption((o) =>
        o.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100),
      )
      .addUserOption((o) => o.setName('membre').setDescription('Ne supprimer que les messages de ce membre')),

    new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Verrouiller un salon (personne ne peut écrire)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) =>
        o.setName('salon').setDescription('Salon à verrouiller (défaut : salon courant)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),

    new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Déverrouiller un salon')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) =>
        o.setName('salon').setDescription('Salon à déverrouiller (défaut : salon courant)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Expulser un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre à expulser').setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Raison')),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Bannir un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre à bannir').setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Raison')),

    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Créer et publier des embeds personnalisés')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName('creer')
          .setDescription('Créer un modèle avec un formulaire; salon facultatif = publication immédiate')
          .addStringOption((o) => o.setName('nom').setDescription('Nom interne du modèle').setRequired(true).setMaxLength(64))
          .addChannelOption((o) => o.setName('salon').setDescription('Publier après création dans ce salon').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      )
      .addSubcommand((s) => s.setName('liste').setDescription('Afficher les modèles enregistrés'))
      .addSubcommand((s) =>
        s
          .setName('publier')
          .setDescription('Publier un modèle enregistré par ID ou nom')
          .addStringOption((o) => o.setName('id').setDescription('ID (8 premiers caractères) ou nom du modèle').setRequired(true))
          .addChannelOption((o) => o.setName('salon').setDescription('Salon de destination (sinon la cible mémorisée)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      )
      .addSubcommand((s) =>
        s
          .setName('modifier')
          .setDescription('Modifier le titre, le texte, la couleur et le pied de page')
          .addStringOption((o) => o.setName('id').setDescription('ID ou nom du modèle').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('supprimer')
          .setDescription('Supprimer un modèle enregistré')
          .addStringOption((o) => o.setName('id').setDescription('ID ou nom du modèle').setRequired(true)),
      ),

    new SlashCommandBuilder()
      .setName('regles')
      .setDescription('Créer ou modifier le règlement et le publier dans le salon règles')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName('salon')
      .setDescription('Créer ou supprimer un salon Discord')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addSubcommand((s) =>
        s
          .setName('creer')
          .setDescription('Créer un salon textuel ou vocal')
          .addStringOption((o) => o.setName('nom').setDescription('Nom du salon').setRequired(true).setMaxLength(100))
          .addStringOption((o) => o.setName('type').setDescription('Type du salon').setRequired(true).addChoices({ name: 'Texte', value: 'text' }, { name: 'Vocal', value: 'voice' }))
          .addChannelOption((o) => o.setName('categorie').setDescription('Catégorie facultative').addChannelTypes(ChannelType.GuildCategory))
          .addStringOption((o) => o.setName('sujet').setDescription('Sujet du salon texte').setMaxLength(1024)),
      )
      .addSubcommand((s) =>
        s
          .setName('supprimer')
          .setDescription('Supprimer un salon ou une catégorie après confirmation')
          .addChannelOption((o) => o.setName('salon').setDescription('Salon ou catégorie').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory))
          .addStringOption((o) => o.setName('confirmation').setDescription('Phrase affichée à la première étape')),
      ),

    new SlashCommandBuilder()
      .setName('salons')
      .setDescription('Outils de maintenance des salons')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName('tout-supprimer')
          .setDescription('Supprimer tous les salons et catégories — action irréversible')
          .addStringOption((o) => o.setName('confirmation').setDescription('Phrase SUPPRIMER-xxxx affichée lors de l’aperçu')),
      ),

    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Régler le délai entre les messages d’un salon')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addIntegerOption((o) => o.setName('secondes').setDescription('0 désactive le slowmode').setRequired(true).setMinValue(0).setMaxValue(21600))
      .addChannelOption((o) => o.setName('salon').setDescription('Défaut : salon courant').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

    new SlashCommandBuilder()
      .setName('vocal')
      .setDescription('Gérer ton salon vocal temporaire')
      .addSubcommand((s) =>
        vocalOption(
          s
            .setName('renommer')
            .setDescription('Renommer ton salon')
            .addStringOption((o) => o.setName('nom').setDescription('Nouveau nom').setRequired(true).setMaxLength(90)),
        ),
      )
      .addSubcommand((s) =>
        vocalOption(
          s
            .setName('limite')
            .setDescription('Changer la limite de places')
            .addIntegerOption((o) => o.setName('places').setDescription('0 = illimité').setRequired(true).setMinValue(0).setMaxValue(99)),
        ),
      )
      .addSubcommand((s) => vocalOption(s.setName('verrouiller').setDescription('Fermer ou ouvrir ton salon')))
      .addSubcommand((s) =>
        vocalOption(
          s
            .setName('autoriser')
            .setDescription('Autoriser quelqu’un à rejoindre même si c’est verrouillé')
            .addUserOption((o) => o.setName('membre').setDescription('Membre à autoriser').setRequired(true)),
        ),
      )
      .addSubcommand((s) =>
        vocalOption(
          s
            .setName('expulser')
            .setDescription('Expulser quelqu’un de ton salon')
            .addUserOption((o) => o.setName('membre').setDescription('Membre à expulser').setRequired(true)),
        ),
      )
      .addSubcommand((s) =>
        vocalOption(
          s
            .setName('transferer')
            .setDescription('Donner ton salon à quelqu’un d’autre')
            .addUserOption((o) => o.setName('membre').setDescription('Nouveau propriétaire').setRequired(true)),
        ),
      )
      .addSubcommand((s) => vocalOption(s.setName('supprimer').setDescription('Supprimer ton salon tout de suite')))
      .addSubcommand((s) => vocalOption(s.setName('reclamer').setDescription('Devenir propriétaire du salon où tu es'))),

    new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Obtenir le lien du panel d’administration'),

    new SlashCommandBuilder().setName('ping').setDescription('Latence du bot'),
  ];
}

// ------------------------------------------------------------
//  Enregistrement auprès de Discord
// ------------------------------------------------------------

export async function registerCommands(client: Client): Promise<void> {
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token || !client.user) return;
  const state = await getState();
  const guildId = state.config.guildId?.trim() || process.env.DISCORD_GUILD_ID?.trim() || null;
  const body = buildCommands().map((c) => c.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body });
      console.log(`[bot] ${body.length} commandes enregistrées sur le serveur ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body });
      console.log(`[bot] ${body.length} commandes globales enregistrées`);
    }
  } catch (err) {
    console.error('[bot] enregistrement des commandes échoué :', (err as Error).message);
  }
}

// ------------------------------------------------------------
//  Exécution
// ------------------------------------------------------------

function isAdmin(interaction: ChatInputCommandInteraction | ModalSubmitInteraction): boolean {
  if (isOwner(interaction.user.id)) return true;
  const allow = (process.env.ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.includes(interaction.user.id)) return true;
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator),
  );
}

function canManageChannels(interaction: ChatInputCommandInteraction): boolean {
  if (isAdmin(interaction)) return true;
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels));
}

export function summarizeReport(report: Awaited<ReturnType<typeof applyBlueprint>>): EmbedBuilder {
  const errors = report.steps.filter((s) => s.level === 'error');
  const lines = report.steps
    .filter((s) => s.level !== 'ok')
    .slice(0, 25)
    .map((s) => `${{ created: '🟢', updated: '🔵', skipped: '⚪', error: '🔴', ok: '⚪' }[s.level]} ${s.message}`);

  const embed = new EmbedBuilder()
    .setColor(errors.length ? 0xff6b6b : 0xffffff)
    .setAuthor({ name: report.dryRun ? '🧪 Simulation du blueprint' : '✅ Blueprint appliqué' })
    .setDescription(
      [
        `🟢 **${report.totals.created}** créé(s) · 🔵 **${report.totals.updated}** à aligner/mis à jour · ⚪ **${report.totals.ok}** conforme(s) · ⏭️ **${report.totals.skipped}** ignoré(s)`,
        errors.length ? `🔴 **${errors.length}** erreur(s)` : '',
        lines.length ? `\n${lines.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 3800),
    )
    .setFooter({
      text: report.dryRun
        ? 'Relance /setup sans « apercu » pour appliquer'
        : 'Relance /setup à tout moment : rien ne sera dupliqué',
    })
    .setTimestamp(new Date(report.finishedAt || Date.now()));

  if (errors.length) {
    embed.addFields({
      name: 'Erreurs',
      value: errors
        .slice(0, 5)
        .map((e) => `• ${e.message}`)
        .join('\n')
        .slice(0, 1000),
    });
  }
  return embed;
}

async function requireOwnedRoom(interaction: ChatInputCommandInteraction): Promise<
  { ok: true; channel: VoiceChannel; isOwnerOrAdmin: boolean } | { ok: false; message: string }
> {
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: 'Commande utilisable uniquement sur un serveur.' };
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const channel = member?.voice?.channel as VoiceChannel | null | undefined;
  if (!channel) return { ok: false, message: 'Rejoins un salon vocal temporaire d’abord 🎧' };

  const room = await getRoom(channel.id);
  if (!room) {
    return { ok: false, message: 'Ce salon n’est pas un salon temporaire. Rejoins le salon ➕ pour en créer un.' };
  }
  const allowed = room.ownerId === interaction.user.id || isAdmin(interaction);
  if (!allowed) return { ok: false, message: 'Seul le propriétaire du salon peut faire ça 👑' };
  return { ok: true, channel, isOwnerOrAdmin: true };
}

function modalInput(
  id: string,
  label: string,
  style: TextInputStyle,
  options: { value?: string; required?: boolean; maxLength?: number },
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(options.required ?? false)
    .setMaxLength(options.maxLength ?? 4000);
  if (options.value) input.setValue(options.value.slice(0, options.maxLength ?? 4000));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

function embedModal(
  customId: string,
  template?: { name?: string; title?: string; description?: string; color?: string; footer?: string },
): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(template ? 'Modifier le modèle d’embed' : 'Créer un embed personnalisé');
  modal.addComponents(
    modalInput('name', 'Nom du modèle', TextInputStyle.Short, { value: template?.name ?? 'Nouveau modèle', required: true, maxLength: 64 }),
    modalInput('title', 'Titre de l’embed', TextInputStyle.Short, { value: template?.title, maxLength: 256 }),
    modalInput('description', 'Texte principal', TextInputStyle.Paragraph, { value: template?.description, maxLength: 4000 }),
    modalInput('color', 'Couleur hexadécimale (#RRGGBB)', TextInputStyle.Short, { value: template?.color ?? '#FFFFFF', required: true, maxLength: 7 }),
    modalInput('footer', 'Pied de page (facultatif)', TextInputStyle.Short, { value: template?.footer, maxLength: 2048 }),
  );
  return modal;
}

function rulesModal(template?: { title?: string; description?: string; color?: string; footer?: string }): ModalBuilder {
  const modal = new ModalBuilder().setCustomId('rules:create').setTitle('Créer le règlement du serveur');
  modal.addComponents(
    modalInput('title', 'Titre', TextInputStyle.Short, { value: template?.title ?? 'Règlement du serveur', required: true, maxLength: 256 }),
    modalInput('description', 'Règles (texte principal)', TextInputStyle.Paragraph, { value: template?.description, required: true, maxLength: 4000 }),
    modalInput('color', 'Couleur hexadécimale (#RRGGBB)', TextInputStyle.Short, { value: template?.color ?? '#C9B8FF', required: true, maxLength: 7 }),
    modalInput('footer', 'Pied de page (facultatif)', TextInputStyle.Short, { value: template?.footer ?? 'Merci de préserver une communauté bienveillante.', maxLength: 2048 }),
  );
  return modal;
}

export async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  config: AppConfig,
): Promise<void> {
  const { commandName } = interaction;
  const guild = interaction.guild;

  const ephem = { flags: MessageFlags.Ephemeral as number };

  switch (commandName) {
    // ---------------- /setup ----------------
    case 'setup': {
      if (!guild) {
        await interaction.reply({ content: 'Utilisable uniquement sur un serveur.', ...ephem });
        return;
      }
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: 'Réservé aux administrateurs du serveur.', ...ephem });
        return;
      }
      const dryRun = interaction.options.getBoolean('apercu') ?? false;
      const assignRole = interaction.options.getBoolean('role_existants') ?? true;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const report = await applyBlueprint(guild, {
        dryRun,
        assignRole,
        source: `discord:${interaction.user.tag}`,
      });
      await interaction.editReply({ embeds: [summarizeReport(report)] });
      return;
    }

    // ---------------- /structure ----------------
    case 'structure': {
      if (!guild || !isAdmin(interaction)) {
        await interaction.reply({ content: 'Réservé aux administrateurs.', ...ephem });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const items = await auditBlueprint(guild, config);
      const missing = items.filter((i) => i.status === 'missing');
      const outdated = items.filter((i) => i.status === 'outdated');
      const embed = new EmbedBuilder()
        .setColor(missing.length ? 0xffcc66 : 0xffffff)
        .setAuthor({ name: '🔎 Audit du serveur' })
        .setDescription(
          [
            `✅ **${items.length - missing.length - outdated.length}** élément(s) conforme(s)`,
            missing.length ? `🔴 **${missing.length}** manquant(s)` : '🔴 aucun manquant',
            outdated.length ? `🟠 **${outdated.length}** à mettre à jour` : '',
            '',
            missing.length
              ? `**Manquants :**\n${missing.slice(0, 10).map((item) => `• ${item.expected}`).join('\n')}`
              : '',
            outdated.length
              ? `**À aligner :**\n${outdated.slice(0, 10).map((item) => `• ${item.actual ?? '—'} → ${item.expected}`).join('\n')}`
              : '',
            missing.length || outdated.length ? '\nLance /setup pour réparer.' : 'La structure est complète ✨',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ---------------- création et maintenance des embeds ----------------
    case 'embed': {
      if (!guild || !isAdmin(interaction)) {
        await interaction.reply({ content: 'Réservé aux administrateurs du serveur.', ...ephem });
        return;
      }
      const subcommand = interaction.options.getSubcommand();
      const state = await getState();
      if (subcommand === 'creer') {
        const channel = interaction.options.getChannel('salon');
        await interaction.showModal(embedModal(`embed:create:${channel?.id ?? 'none'}`));
        return;
      }
      if (subcommand === 'liste') {
        const templates = state.embeds.slice(0, 20);
        const description = templates.length
          ? templates.map((template) => `• **${template.name}** · \`${template.id.slice(0, 8)}\` · ${template.channelId ? `<#${template.channelId}>` : 'brouillon'}`).join('\n')
          : 'Aucun modèle enregistré. Lance `/embed creer` ou utilise le panel web.';
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xc9b8ff).setTitle('🪄 Modèles d’embed').setDescription(description).setFooter({ text: 'Gère aussi tes modèles sur le panel web' })],
          ...ephem,
        });
        return;
      }

      const reference = interaction.options.getString('id', true);
      const template = await findEmbedTemplate(reference);
      if (!template) {
        await interaction.reply({ content: 'Modèle introuvable ou ID ambigu. Utilise `/embed liste`.', ...ephem });
        return;
      }
      if (subcommand === 'modifier') {
        await interaction.showModal(embedModal(`embed:edit:${template.id}`, template));
        return;
      }
      if (subcommand === 'supprimer') {
        await removeEmbedTemplate(template.id, `discord:${interaction.user.tag}`);
        await interaction.reply({ content: `🗑️ Modèle **${template.name}** supprimé.`, ...ephem });
        return;
      }
      const channel = interaction.options.getChannel('salon');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await publishEmbed(guild, template, channel?.id, `discord:${interaction.user.tag}`);
      await interaction.editReply({ content: result.message ?? (result.ok ? '✅ Embed publié.' : '❌ Publication impossible.') });
      return;
    }

    case 'regles': {
      if (!guild || !isAdmin(interaction)) {
        await interaction.reply({ content: 'Réservé aux administrateurs du serveur.', ...ephem });
        return;
      }
      const current = (await getState()).embeds.find((template) => template.name.toLocaleLowerCase() === 'règlement');
      await interaction.showModal(rulesModal(current));
      return;
    }

    // ---------------- /confession ----------------
    case 'confession': {
      const message = interaction.options.getString('message');
      if (!message) {
        const modal = new ModalBuilder().setCustomId('conf:modal').setTitle('Confession anonyme 🤫');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('content')
              .setLabel('Ta confession (jamais associée à ton pseudo)')
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(config.confessions.maxLength)
              .setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        return;
      }
      if (!guild) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await submitConfession(guild, interaction.user.id, message);
      await interaction.editReply({ content: result.message });
      return;
    }

    // ---------------- /annonce ----------------
    case 'annonce': {
      if (!guild || !isAdmin(interaction)) {
        await interaction.reply({ content: 'Réservé aux administrateurs.', ...ephem });
        return;
      }
      const content = interaction.options.getString('message', true);
      const chosen = interaction.options.getChannel('salon');
      const when = interaction.options.getString('quand');
      const ping = (interaction.options.getString('mention') ?? 'none') as 'none' | 'here' | 'everyone';

      const target: GuildBasedChannel | null = chosen
        ? ((await guild.channels.fetch(chosen.id).catch(() => null)) as GuildBasedChannel | null)
        : await resolveChannelSafe(guild, config, 'announcements');

      if (!target || !target.isTextBased()) {
        await interaction.reply({ content: 'Salon introuvable. Lance `/setup` d’abord.', ...ephem });
        return;
      }

      const schedule = parseSchedule(when);
      if (schedule.error) {
        await interaction.reply({ content: schedule.error, ...ephem });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const created = await createAnnouncement({
        content,
        channelKey: 'announcements',
        channelId: target.id,
        scheduledFor: when,
        createdBy: `discord:${interaction.user.tag}`,
        ping,
      });
      if (!created.ok || !created.announcement) {
        await interaction.editReply({ content: `❌ ${created.error ?? 'Erreur inconnue'}` });
        return;
      }
      if (schedule.date) {
        await interaction.editReply({
          content: `⏰ Annonce programmée pour <t:${Math.floor(schedule.date.getTime() / 1000)}:F> dans <#${target.id}>.`,
        });
      } else {
        const sent = await sendAnnouncement(guild, created.announcement);
        await interaction.editReply({
          content: sent ? `✅ Annonce publiée dans <#${target.id}>.` : '❌ Envoi impossible (permissions ?).',
        });
      }
      return;
    }

    // ---------------- /annonces ----------------
    case 'annonces': {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: 'Réservé aux administrateurs.', ...ephem });
        return;
      }
      const state = await getState();
      const sub = interaction.options.getSubcommand();
      if (sub === 'annuler') {
        const id = interaction.options.getString('id', true);
        const found = state.announcements.find((a) => a.id.startsWith(id) && a.status === 'scheduled');
        if (!found) {
          await interaction.reply({ content: 'Aucune annonce programmée avec cet ID.', ...ephem });
          return;
        }
        await cancelAnnouncement(found.id);
        await interaction.reply({ content: `🗑️ Annonce \`${found.id.slice(0, 8)}\` annulée.`, ...ephem });
        return;
      }
      const list = state.announcements.slice(0, 15);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffffff)
            .setAuthor({ name: '📣 Annonces' })
            .setDescription(
              list.length
                ? list
                    .map((a) => {
                      const icon = a.status === 'sent' ? '✅' : a.status === 'scheduled' ? '⏰' : a.status === 'failed' ? '❌' : '⚪';
                      const when = a.sentAt
                        ? `<t:${Math.floor(new Date(a.sentAt).getTime() / 1000)}:R>`
                        : a.scheduledFor
                          ? `<t:${Math.floor(new Date(a.scheduledFor).getTime() / 1000)}:R>`
                          : 'maintenant';
                      return `${icon} \`${a.id.slice(0, 8)}\` · ${when} · ${a.content.slice(0, 70)}`;
                    })
                    .join('\n')
                : 'Aucune annonce pour le moment.',
            )
            .setFooter({ text: 'Gère-les aussi depuis le panel web' }),
        ],
        ...ephem,
      });
      return;
    }

    // ---------------- salons : création, suppression protégée, slowmode ----------------
    case 'salon': {
      if (!guild || !canManageChannels(interaction)) {
        await interaction.reply({ content: 'Cette commande demande la permission Gérer les salons.', ...ephem });
        return;
      }
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'creer') {
        const name = interaction.options.getString('nom', true).trim();
        const kind = interaction.options.getString('type', true);
        const chosenCategory = interaction.options.getChannel('categorie');
        const topic = interaction.options.getString('sujet')?.trim();
        if (!name || name.length > 100) {
          await interaction.reply({ content: 'Le nom doit contenir de 1 à 100 caractères.', ...ephem });
          return;
        }
        if (chosenCategory && chosenCategory.type !== ChannelType.GuildCategory) {
          await interaction.reply({ content: 'La catégorie choisie est invalide.', ...ephem });
          return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const channel = await guild.channels.create({
            name,
            type: kind === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
            ...(chosenCategory ? { parent: chosenCategory.id } : {}),
            ...(kind === 'text' && topic ? { topic } : {}),
            reason: `Limerence Bot — créé par ${interaction.user.tag}`,
          });
          await addLog({ level: 'success', source: `discord:${interaction.user.tag}`, action: 'Salon créé', detail: `${channel.name} (${channel.id})` });
          await interaction.editReply({ content: `✅ Salon créé : <#${channel.id}>.` });
        } catch (error) {
          await interaction.editReply({ content: `❌ Création impossible : ${(error as Error).message}` });
        }
        return;
      }

      const target = interaction.options.getChannel('salon') as GuildBasedChannel | null;
      if (!target) {
        await interaction.reply({ content: 'Salon introuvable.', ...ephem });
        return;
      }
      const required = channelDeletionPhrase(target.id);
      const confirmation = interaction.options.getString('confirmation')?.trim();
      if (confirmation !== required) {
        await interaction.reply({
          content: `⚠️ ${confirmation ? 'Confirmation incorrecte.' : 'Aucune suppression effectuée.'} Pour supprimer **${target.name}**, relance la commande avec la confirmation **${required}**. Les salons contenus dans une catégorie ne sont pas supprimés avec elle.`,
          ...ephem,
        });
        return;
      }
      try {
        await target.delete(`Limerence Bot — suppression demandée par ${interaction.user.tag}`);
        await addLog({ level: 'warn', source: `discord:${interaction.user.tag}`, action: 'Salon supprimé', detail: `${target.name} (${target.id})` });
        await interaction.reply({ content: `🗑️ **${target.name}** supprimé.`, ...ephem });
      } catch (error) {
        await interaction.reply({ content: `❌ Suppression impossible : ${(error as Error).message}`, ...ephem });
      }
      return;
    }

    case 'salons': {
      if (!guild || !isAdmin(interaction)) {
        await interaction.reply({ content: 'La suppression d’urgence est réservée aux administrateurs du serveur.', ...ephem });
        return;
      }
      await guild.channels.fetch().catch(() => undefined);
      const confirmation = interaction.options.getString('confirmation')?.trim();
      const required = channelDeletionPhrase(guild.id);
      if (confirmation !== required) {
        await interaction.reply({
          content: `🚨 Cette opération supprimera **tous les ${guild.channels.cache.size} salons et catégories** du serveur. Les messages hébergés dans ces salons seront perdus. Aucune action n’a été faite. Pour confirmer, relance avec la confirmation **${required}**. Après, tu pourras relancer /setup.`,
          ...ephem,
        });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const result = await deleteAllGuildChannels(guild, `discord:${interaction.user.tag}`);
        const errors = result.failed.slice(0, 5).map((failure) => `#${failure.name}: ${failure.reason}`).join(' · ');
        await interaction.editReply({
          content: `🧹 **${result.deleted}/${result.initialCount}** salon(s) supprimé(s).${result.failed.length ? ` ${result.failed.length} échec(s) : ${errors}` : ' Relance /setup pour reconstruire le blueprint.'}`,
        });
      } catch (error) {
        await interaction.editReply({ content: `❌ Opération impossible : ${(error as Error).message}` });
      }
      return;
    }

    case 'slowmode': {
      if (!guild || !canManageChannels(interaction)) {
        await interaction.reply({ content: 'Cette commande demande la permission Gérer les salons.', ...ephem });
        return;
      }
      const selected = interaction.options.getChannel('salon') as BaseGuildTextChannel | null;
      const contextChannel = interaction.channel;
      const target = selected ?? (
        contextChannel &&
        (contextChannel.type === ChannelType.GuildText || contextChannel.type === ChannelType.GuildAnnouncement)
          ? contextChannel as BaseGuildTextChannel
          : null
      );
      if (!target || (target.type !== ChannelType.GuildText && target.type !== ChannelType.GuildAnnouncement)) {
        await interaction.reply({ content: 'Choisis un salon textuel valide.', ...ephem });
        return;
      }
      const seconds = interaction.options.getInteger('secondes', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const value = await setSlowmode(target, seconds, `discord:${interaction.user.tag}`);
        await interaction.editReply({ content: value ? `⏳ Slowmode réglé à **${value}s** dans <#${target.id}>.` : `⏳ Slowmode désactivé dans <#${target.id}>.` });
      } catch (error) {
        await interaction.editReply({ content: `❌ Impossible de modifier le slowmode : ${(error as Error).message}` });
      }
      return;
    }

    // ---------------- modération ----------------
    case 'purge': {
      const purgeChannel = interaction.channel;
      if (
        !isAdmin(interaction) ||
        !purgeChannel ||
        (purgeChannel.type !== ChannelType.GuildText && purgeChannel.type !== ChannelType.GuildAnnouncement)
      ) {
        await interaction.reply({ content: 'Réservé aux administrateurs, dans un salon textuel.', ...ephem });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const count = interaction.options.getInteger('nombre', true);
      const author = interaction.options.getUser('membre');
      const deleted = await purgeMessages(
        purgeChannel as BaseGuildTextChannel,
        count,
        author?.id,
        `discord:${interaction.user.tag}`,
      );
      await interaction.editReply({ content: `🧹 ${deleted} message(s) supprimé(s).` });
      return;
    }

    case 'lock':
    case 'unlock': {
      const selected = interaction.options.getChannel('salon') as BaseGuildTextChannel | null;
      const contextChannel = interaction.channel;
      const target = selected ?? (
        contextChannel &&
        (contextChannel.type === ChannelType.GuildText || contextChannel.type === ChannelType.GuildAnnouncement)
          ? contextChannel as BaseGuildTextChannel
          : null
      );
      if (!target || (target.type !== ChannelType.GuildText && target.type !== ChannelType.GuildAnnouncement) || !canManageChannels(interaction)) {
        await interaction.reply({ content: 'Salon ou permissions invalides.', ...ephem });
        return;
      }
      await lockChannel(target, `discord:${interaction.user.tag}`, commandName === 'lock');
      await interaction.reply({
        content: commandName === 'lock' ? `🔒 <#${target.id}> verrouillé.` : `🔓 <#${target.id}> déverrouillé.`,
        ...ephem,
      });
      return;
    }

    case 'kick':
    case 'ban': {
      if (!guild || !isAdmin(interaction)) {
        await interaction.reply({ content: 'Réservé aux administrateurs.', ...ephem });
        return;
      }
      const user = interaction.options.getUser('membre', true);
      const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        if (commandName === 'kick') {
          const member = await guild.members.fetch(user.id);
          await kickMember(member, reason, `discord:${interaction.user.tag}`);
        } else {
          await banMember(guild, user.id, reason, `discord:${interaction.user.tag}`);
        }
        await interaction.editReply({ content: `✅ ${user.tag} a été ${commandName === 'kick' ? 'expulsé' : 'banni'}.` });
      } catch (err) {
        await interaction.editReply({ content: `❌ Impossible : ${(err as Error).message}` });
      }
      return;
    }

    // ---------------- /vocal ----------------
    case 'vocal': {
      const sub = interaction.options.getSubcommand();
      const state = await getState();
      const ephemReply = (content: string) => interaction.reply({ content, ...ephem });

      if (sub === 'reclamer') {
        const member = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
        const channel = member?.voice?.channel as VoiceChannel | null | undefined;
        if (!guild || !channel) {
          await ephemReply('Rejoins d’abord un salon vocal temporaire.');
          return;
        }
        const room = await getRoom(channel.id);
        if (!room) {
          await ephemReply('Ce salon n’est pas un salon temporaire.');
          return;
        }
        const previousOwnerPresent = channel.members.has(room.ownerId);
        if (room.ownerId !== interaction.user.id && previousOwnerPresent && !isAdmin(interaction)) {
          await ephemReply('Le propriétaire est toujours dans le salon ; seul un admin peut le reprendre.');
          return;
        }
        await transferOwnership(guild, channel, interaction.user.id);
        await ephemReply(`👑 Tu es maintenant propriétaire de **${channel.name}**.`);
        return;
      }

      const owned = await requireOwnedRoom(interaction);
      if (!owned.ok) {
        await ephemReply(owned.message);
        return;
      }
      const channel = owned.channel;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      switch (sub) {
        case 'renommer': {
          await renameRoom(channel, interaction.options.getString('nom', true));
          await interaction.editReply({ content: `✏️ Salon renommé : **${channel.name}**` });
          return;
        }
        case 'limite': {
          await setRoomLimit(channel, interaction.options.getInteger('places', true));
          await interaction.editReply({ content: '👥 Limite mise à jour.' });
          return;
        }
        case 'verrouiller': {
          const locked = await toggleLock(channel.guild, channel);
          await interaction.editReply({ content: locked ? '🔒 Salon verrouillé.' : '🔓 Salon ouvert.' });
          return;
        }
        case 'autoriser': {
          const user = interaction.options.getUser('membre', true);
          await allowMember(channel.guild, channel, user.id);
          await interaction.editReply({ content: `✅ <@${user.id}> peut rejoindre ton salon.` });
          return;
        }
        case 'expulser': {
          const user = interaction.options.getUser('membre', true);
          await kickFromRoom(channel, user.id);
          await interaction.editReply({ content: `👋 <@${user.id}> a été expulsé.` });
          return;
        }
        case 'transferer': {
          const user = interaction.options.getUser('membre', true);
          await transferOwnership(channel.guild, channel, user.id);
          await interaction.editReply({ content: `👑 <@${user.id}> est le nouveau propriétaire.` });
          return;
        }
        case 'supprimer': {
          await deleteRoom(channel, `Limerence Bot — supprimé par ${interaction.user.tag}`);
          await interaction.editReply({ content: '🗑️ Salon supprimé.' });
          return;
        }
        default:
          await interaction.editReply({ content: 'Sous-commande inconnue.' });
          return;
      }
    }

    // ---------------- /panel & /ping ----------------
    case 'panel': {
      const url = await getPublicUrl();
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffffff)
            .setAuthor({ name: '🖥️ Panel d’administration Limerence' })
            .setDescription(`**${url}**\n\nConnexion avec ton compte Discord (permission « Gérer le serveur » requise).`)
            .setFooter({ text: 'blueprint, confessions, annonces, modération, logs' }),
        ],
        ...ephem,
      });
      return;
    }

    case 'ping': {
      await interaction.reply({
        content: `🏓 Pong ! WebSocket : **${Math.round(interaction.client.ws.ping)} ms** · API : **${Date.now() - interaction.createdTimestamp} ms**`,
        ...ephem,
      });
      return;
    }

    default:
      await interaction.reply({ content: 'Commande inconnue.', ...ephem });
  }
}

export async function handleEmbedModalSubmit(
  interaction: ModalSubmitInteraction,
  config: AppConfig,
): Promise<boolean> {
  const isRules = interaction.customId === 'rules:create';
  const [scope, action, targetId] = interaction.customId.split(':');
  if (!isRules && scope !== 'embed') return false;
  if (!interaction.guild || !isAdmin(interaction)) {
    await interaction.reply({ content: 'Réservé aux administrateurs du serveur.', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const title = interaction.fields.getTextInputValue('title').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const color = interaction.fields.getTextInputValue('color').trim();
  const footer = interaction.fields.getTextInputValue('footer').trim();

  if (isRules) {
    const existing = (await getState()).embeds.find((template) => template.name.toLocaleLowerCase() === 'règlement');
    const rulesChannel = await resolveChannelSafe(guild, config, 'rules');
    const channelId = rulesChannel?.type === ChannelType.GuildText || rulesChannel?.type === ChannelType.GuildAnnouncement
      ? rulesChannel.id
      : undefined;
    const input = {
      name: 'Règlement',
      title,
      description,
      color,
      footer,
      channelId: channelId ?? '',
    };
    const saved = existing
      ? await updateEmbedTemplate(existing.id, input, `discord:${interaction.user.tag}`)
      : await createEmbedTemplate(input, `discord:${interaction.user.tag}`);
    if (!saved.ok || !saved.template) {
      await interaction.editReply({ content: `❌ ${saved.message ?? 'Enregistrement impossible.'}` });
      return true;
    }
    if (!channelId) {
      await interaction.editReply({ content: '✅ Règlement enregistré en brouillon. Le salon règles est introuvable : lance /setup, puis publie le modèle depuis /embed publier.' });
      return true;
    }
    const published = await publishEmbed(guild, saved.template, channelId, `discord:${interaction.user.tag}`);
    await interaction.editReply({ content: published.message ?? 'Règlement enregistré.' });
    return true;
  }

  if (action === 'create') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const channelId = targetId && targetId !== 'none' ? targetId : undefined;
    const saved = await createEmbedTemplate(
      { name, title, description, color, footer, ...(channelId ? { channelId } : {}) },
      `discord:${interaction.user.tag}`,
    );
    if (!saved.ok || !saved.template) {
      await interaction.editReply({ content: `❌ ${saved.message ?? 'Enregistrement impossible.'}` });
      return true;
    }
    if (!channelId) {
      await interaction.editReply({ content: `✅ Modèle **${saved.template.name}** enregistré. Publie-le ensuite avec /embed publier.` });
      return true;
    }
    const published = await publishEmbed(guild, saved.template, channelId, `discord:${interaction.user.tag}`);
    await interaction.editReply({ content: published.message ?? 'Modèle enregistré.' });
    return true;
  }

  if (action === 'edit') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const existing = (await getState()).embeds.find((template) => template.id === targetId);
    if (!existing) {
      await interaction.editReply({ content: '❌ Modèle introuvable.' });
      return true;
    }
    const updated = await updateEmbedTemplate(
      targetId,
      { name, title, description, color, footer, fields: existing.fields },
      `discord:${interaction.user.tag}`,
    );
    await interaction.editReply({ content: updated.ok ? `✅ Modèle **${updated.template?.name}** modifié. Les liens, images et champs avancés sont conservés.` : `❌ ${updated.message ?? 'Modification impossible.'}` });
    return true;
  }

  await interaction.editReply({ content: 'Sous-commande embed inconnue.' });
  return true;
}

export { parseSchedule };
