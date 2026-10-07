import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandChannelOption,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

// ============================================================
//  Définition des commandes slash
//  Ce module n'importe rien de Next.js : il est donc testable
//  directement avec `node --test`.
// ============================================================

export type CommandDefinition = SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

/** Restreint une option « salon » aux salons textuels. */
function textChannel<T extends SlashCommandChannelOption>(option: T): T {
  return option.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
}

// ------------------------------------------------------------
//  Économie
// ------------------------------------------------------------

export function economyCommands(): CommandDefinition[] {
  return [
    new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Affiche ton solde (poche + banque)')
      .addUserOption((o) => o.setName('membre').setDescription('Consulter le solde d’un autre membre')),

    new SlashCommandBuilder()
      .setName('profil')
      .setDescription('Fiche économique complète : solde, rang, statistiques, inventaire')
      .addUserOption((o) => o.setName('membre').setDescription('Membre à consulter')),

    new SlashCommandBuilder().setName('daily').setDescription('Récupérer ta récompense quotidienne'),

    new SlashCommandBuilder().setName('work').setDescription('Travailler pour gagner de l’argent'),

    new SlashCommandBuilder().setName('crime').setDescription('Tenter un coup risqué mais lucratif'),

    new SlashCommandBuilder()
      .setName('rob')
      .setDescription('Voler une partie de l’argent d’un membre')
      .addUserOption((o) => o.setName('membre').setDescription('Victime').setRequired(true)),

    new SlashCommandBuilder().setName('beg').setDescription('Faire la manche'),

    new SlashCommandBuilder().setName('search').setDescription('Fouiller les environs pour trouver de l’argent'),

    new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Envoyer de l’argent à un membre')
      .addUserOption((o) => o.setName('membre').setDescription('Destinataire').setRequired(true))
      .addIntegerOption((o) => o.setName('montant').setDescription('Montant à envoyer').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName('bank')
      .setDescription('Gérer ta banque')
      .addSubcommand((s) => s.setName('solde').setDescription('Voir le contenu de ta banque'))
      .addSubcommand((s) =>
        s
          .setName('depot')
          .setDescription('Déposer de l’argent en banque')
          .addIntegerOption((o) => o.setName('montant').setDescription('Montant (0 = tout)').setRequired(true).setMinValue(0)),
      )
      .addSubcommand((s) =>
        s
          .setName('retrait')
          .setDescription('Retirer de l’argent de la banque')
          .addIntegerOption((o) => o.setName('montant').setDescription('Montant (0 = tout)').setRequired(true).setMinValue(0)),
      ),

    new SlashCommandBuilder().setName('leaderboard').setDescription('Classement des membres les plus riches'),

    new SlashCommandBuilder().setName('inventaire').setDescription('Voir les objets que tu possèdes'),

    new SlashCommandBuilder()
      .setName('revendre')
      .setDescription('Revendre un objet de ton inventaire')
      .addStringOption((o) => o.setName('objet').setDescription('Nom ou identifiant de l’objet').setRequired(true)),

    new SlashCommandBuilder()
      .setName('shop')
      .setDescription('Ouvrir la boutique du serveur')
      .addSubcommand((s) =>
        s
          .setName('liste')
          .setDescription('Voir les articles disponibles')
          .addStringOption((o) => o.setName('categorie').setDescription('Filtrer par catégorie')),
      )
      .addSubcommand((s) =>
        s
          .setName('acheter')
          .setDescription('Acheter un article')
          .addStringOption((o) => o.setName('article').setDescription('Nom ou identifiant de l’article').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('vitrine').setDescription('Publier la vitrine de la boutique (admin)')),

    new SlashCommandBuilder()
      .setName('blackjack')
      .setDescription('Jouer au blackjack')
      .addSubcommand((s) =>
        s
          .setName('jouer')
          .setDescription('Ouvrir une table et miser')
          .addIntegerOption((o) => o.setName('mise').setDescription('Montant misé').setRequired(true).setMinValue(1))
          .addIntegerOption((o) => o.setName('annexe').setDescription('Pari annexe 21+3 (facultatif)').setMinValue(0)),
      )
      .addSubcommand((s) => s.setName('carte').setDescription('Tirer une carte'))
      .addSubcommand((s) => s.setName('rester').setDescription('Rester (ne plus tirer)'))
      .addSubcommand((s) => s.setName('doubler').setDescription('Doubler la mise et tirer une carte'))
      .addSubcommand((s) => s.setName('split').setDescription('Séparer une paire en deux mains'))
      .addSubcommand((s) =>
        s
          .setName('assurance')
          .setDescription('Prendre une assurance quand le donneur montre un as')
          .addIntegerOption((o) => o.setName('montant').setDescription('Montant de l’assurance').setMinValue(1)),
      )
      .addSubcommand((s) => s.setName('abandonner').setDescription('Abandonner la main et récupérer une partie de la mise'))
      .addSubcommand((s) => s.setName('quitter').setDescription('Abandonner la partie en cours'))
      .addSubcommand((s) => s.setName('stats').setDescription('Tes statistiques au blackjack'))
      .addSubcommand((s) =>
        s
          .setName('regles')
          .setDescription('Règles actives de la table')
      ),
  ];
}

// ------------------------------------------------------------
//  Modération
// ------------------------------------------------------------

export function moderationCommands(): CommandDefinition[] {
  return [
    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Système d’avertissements (le membre reçoit un MP)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand((s) =>
        s
          .setName('ajouter')
          .setDescription('Avertir un membre (MP + dossier)')
          .addUserOption((o) => o.setName('membre').setDescription('Membre à avertir').setRequired(true))
          .addStringOption((o) => o.setName('raison').setDescription('Raison de l’avertissement').setRequired(true).setMaxLength(500))
          .addStringOption((o) => o.setName('preuve').setDescription('Lien ou capture (facultatif)').setMaxLength(500)),
      )
      .addSubcommand((s) =>
        s
          .setName('liste')
          .setDescription('Voir les avertissements d’un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre concerné').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('retirer')
          .setDescription('Retirer un avertissement')
          .addStringOption((o) => o.setName('dossier').setDescription('Numéro ou identifiant du dossier').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('effacer')
          .setDescription('Effacer tous les avertissements d’un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre concerné').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('modifier')
          .setDescription('Modifier la raison d’un dossier')
          .addStringOption((o) => o.setName('dossier').setDescription('Numéro ou identifiant du dossier').setRequired(true))
          .addStringOption((o) => o.setName('raison').setDescription('Nouvelle raison').setRequired(true).setMaxLength(500)),
      ),

    new SlashCommandBuilder()
      .setName('cas')
      .setDescription('Consulter les dossiers de modération')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addSubcommand((s) =>
        s
          .setName('voir')
          .setDescription('Afficher un dossier')
          .addStringOption((o) => o.setName('dossier').setDescription('Numéro ou identifiant').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('membre')
          .setDescription('Historique complet d’un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre concerné').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('liste')
          .setDescription('Derniers dossiers du serveur')
          .addStringOption((o) =>
            o
              .setName('type')
              .setDescription('Filtrer par type')
              .addChoices(
                { name: 'Avertissements', value: 'warn' },
                { name: 'Mutes', value: 'timeout' },
                { name: 'Expulsions', value: 'kick' },
                { name: 'Bannissements', value: 'ban' },
                { name: 'Auto-modération', value: 'automod' },
                { name: 'Notes', value: 'note' },
              ),
          ),
      ),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Expulser un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre à expulser').setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Bannir un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre à bannir').setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500))
      .addIntegerOption((o) =>
        o.setName('jours').setDescription('Jours de messages supprimés (0-7)').setMinValue(0).setMaxValue(7),
      ),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Lever un bannissement')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((o) => o.setName('id').setDescription('Identifiant Discord du membre').setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

    new SlashCommandBuilder()
      .setName('softban')
      .setDescription('Expulser puis débannir pour supprimer les messages')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

    new SlashCommandBuilder()
      .setName('mute')
      .setDescription('Réduire au silence un membre (timeout)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre à mute').setRequired(true))
      .addIntegerOption((o) => o.setName('minutes').setDescription('Durée en minutes (défaut : config)').setMinValue(1).setMaxValue(40_320))
      .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

    new SlashCommandBuilder()
      .setName('unmute')
      .setDescription('Lever le mute d’un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),

    new SlashCommandBuilder()
      .setName('nick')
      .setDescription('Changer le pseudonyme d’un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
      .addUserOption((o) => o.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addStringOption((o) => o.setName('pseudo').setDescription('Nouveau pseudo (vide = réinitialiser)').setMaxLength(32)),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Supprimer des messages en masse')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addSubcommand((s) =>
        s
          .setName('messages')
          .setDescription('Supprimer les N derniers messages')
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('utilisateur')
          .setDescription('Supprimer les messages d’un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('bots')
          .setDescription('Supprimer les messages des bots')
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('contient')
          .setDescription('Supprimer les messages contenant un texte')
          .addStringOption((o) => o.setName('texte').setDescription('Texte recherché').setRequired(true).setMaxLength(100))
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('liens')
          .setDescription('Supprimer les messages contenant des liens')
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('pieces-jointes')
          .setDescription('Supprimer les messages avec pièce jointe')
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('embeds')
          .setDescription('Supprimer les messages contenant un embed')
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('mentions')
          .setDescription('Supprimer les messages avec trop de mentions')
          .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre (1-100)').setMinValue(1).setMaxValue(100)),
      )
      .addSubcommand((s) =>
        s
          .setName('tout')
          .setDescription('Vider un salon en le recréant à l’identique')
          .addChannelOption((o) => textChannel(o.setName('salon').setDescription('Salon à vider'))),
      ),

    new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Verrouiller un salon')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) => o.setName('salon').setDescription('Salon (défaut : salon courant)')),

    new SlashCommandBuilder()
      .setName('unlock')
      .setDescription('Déverrouiller un salon')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) => o.setName('salon').setDescription('Salon (défaut : salon courant)')),

    new SlashCommandBuilder()
      .setName('lockdown')
      .setDescription('Verrouiller tous les salons texte du serveur')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName('unlockdown')
      .setDescription('Rendre la parole à tout le serveur')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Régler le slowmode d’un salon')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addIntegerOption((o) =>
        o.setName('secondes').setDescription('Délai entre deux messages (0 = désactivé)').setRequired(true).setMinValue(0).setMaxValue(21_600),
      )
      .addChannelOption((o) => textChannel(o.setName('salon').setDescription('Salon (défaut : salon courant)'))),

    new SlashCommandBuilder()
      .setName('nuke')
      .setDescription('Supprimer puis recréer un salon à l’identique')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) => textChannel(o.setName('salon').setDescription('Salon (défaut : salon courant)'))),

    new SlashCommandBuilder()
      .setName('addrole')
      .setDescription('Donner un rôle à un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Rôle').setRequired(true)),

    new SlashCommandBuilder()
      .setName('removerole')
      .setDescription('Retirer un rôle à un membre')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Rôle').setRequired(true)),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Informations sur un membre')
      .addUserOption((o) => o.setName('membre').setDescription('Membre (défaut : toi)')),

    new SlashCommandBuilder().setName('serverinfo').setDescription('Informations sur le serveur'),

    new SlashCommandBuilder()
      .setName('roleinfo')
      .setDescription('Informations sur un rôle')
      .addRoleOption((o) => o.setName('role').setDescription('Rôle').setRequired(true)),

    new SlashCommandBuilder()
      .setName('banlist')
      .setDescription('Lister les membres bannis')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName('antiraid')
      .setDescription('Protection anti-raid')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('statut').setDescription('État de la protection'))
      .addSubcommand((s) => s.setName('activer').setDescription('Activer la protection'))
      .addSubcommand((s) => s.setName('desactiver').setDescription('Désactiver la protection')),

    new SlashCommandBuilder()
      .setName('economie')
      .setDescription('Administration de l’économie')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName('donner')
          .setDescription('Donner de l’argent à un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
          .addIntegerOption((o) => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
      )
      .addSubcommand((s) =>
        s
          .setName('retirer')
          .setDescription('Retirer de l’argent à un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
          .addIntegerOption((o) => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
      )
      .addSubcommand((s) =>
        s
          .setName('definir')
          .setDescription('Définir le solde exact d’un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
          .addIntegerOption((o) => o.setName('montant').setDescription('Nouveau solde').setRequired(true).setMinValue(0)),
      )
      .addSubcommand((s) =>
        s
          .setName('reset')
          .setDescription('Réinitialiser le compte d’un membre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('etat').setDescription('Statistiques économiques du serveur')),

    new SlashCommandBuilder().setName('aide').setDescription('Liste des commandes du bot'),
  ];
}

// ------------------------------------------------------------
//  Animation & utilitaires
// ------------------------------------------------------------

export function utilityCommands(): CommandDefinition[] {
  return [
    new SlashCommandBuilder()
      .setName('confession')
      .setDescription('Envoie une confession 100 % anonyme')
      .addStringOption((o) => o.setName('message').setDescription('Ta confession').setMaxLength(900)),

    new SlashCommandBuilder()
      .setName('annonce')
      .setDescription('Publier ou programmer une annonce')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName('message').setDescription('Texte de l’annonce').setRequired(true).setMaxLength(1800))
      .addChannelOption((o) => textChannel(o.setName('salon').setDescription('Salon d’envoi (défaut : salon annonces)')))
      .addStringOption((o) => o.setName('quand').setDescription('Vide = maintenant. Ex : 30m, 2h, 2026-10-06T20:00'))
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
      .setDescription('Gérer les annonces programmées')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('liste').setDescription('Voir les annonces'))
      .addSubcommand((s) =>
        s
          .setName('annuler')
          .setDescription('Annuler une annonce programmée')
          .addStringOption((o) => o.setName('id').setDescription('Les 8 premiers caractères de l’ID').setRequired(true)),
      ),

    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Créer et publier des embeds personnalisés')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName('creer')
          .setDescription('Créer un modèle avec un formulaire')
          .addStringOption((o) => o.setName('nom').setDescription('Nom interne du modèle').setRequired(true).setMaxLength(64))
          .addChannelOption((o) => textChannel(o.setName('salon').setDescription('Publier immédiatement dans ce salon'))),
      )
      .addSubcommand((s) => s.setName('liste').setDescription('Afficher les modèles enregistrés'))
      .addSubcommand((s) =>
        s
          .setName('publier')
          .setDescription('Publier un modèle enregistré')
          .addStringOption((o) => o.setName('id').setDescription('ID (8 premiers caractères) ou nom').setRequired(true))
          .addChannelOption((o) => textChannel(o.setName('salon').setDescription('Salon de destination'))),
      )
      .addSubcommand((s) =>
        s
          .setName('modifier')
          .setDescription('Modifier un modèle')
          .addStringOption((o) => o.setName('id').setDescription('ID ou nom du modèle').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('supprimer')
          .setDescription('Supprimer un modèle')
          .addStringOption((o) => o.setName('id').setDescription('ID ou nom du modèle').setRequired(true)),
      ),

    new SlashCommandBuilder()
      .setName('regles')
      .setDescription('Rédiger et publier le règlement du serveur')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName('vocal')
      .setDescription('Gérer ton salon vocal temporaire')
      .addSubcommand((s) =>
        s
          .setName('renommer')
          .setDescription('Renommer ton salon')
          .addStringOption((o) => o.setName('nom').setDescription('Nouveau nom').setRequired(true).setMaxLength(90)),
      )
      .addSubcommand((s) =>
        s
          .setName('limite')
          .setDescription('Changer la limite de places')
          .addIntegerOption((o) => o.setName('places').setDescription('0 = illimité').setRequired(true).setMinValue(0).setMaxValue(99)),
      )
      .addSubcommand((s) => s.setName('verrouiller').setDescription('Verrouiller / ouvrir ton salon'))
      .addSubcommand((s) =>
        s
          .setName('autoriser')
          .setDescription('Autoriser un membre à rejoindre')
          .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('expulser')
          .setDescription('Expulser un membre de ton salon')
          .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('transferer')
          .setDescription('Donner la propriété du salon')
          .addUserOption((o) => o.setName('membre').setDescription('Nouveau propriétaire').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('supprimer').setDescription('Supprimer ton salon'))
      .addSubcommand((s) => s.setName('reclamer').setDescription('Réclamer un salon temporaire abandonné')),

    new SlashCommandBuilder().setName('panel').setDescription('Lien du panel d’administration'),

    new SlashCommandBuilder().setName('ping').setDescription('Latence du bot'),
  ];
}

export function buildCommands(): CommandDefinition[] {
  return [...economyCommands(), ...moderationCommands(), ...utilityCommands()];
}

export const COMMAND_COUNT = buildCommands().length;
