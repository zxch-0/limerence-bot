import type { ConfigOf, ConfigValues, SectionDef } from '../schema-fields';

// ============================================================
//  Interface du bot — thème, menu central et cartes.
//  Toutes les sorties Discord (menu /panel, message de bienvenue,
//  cagnotte, boutique, dossiers de modération) partagent ce thème.
// ============================================================

export const UI_SECTIONS = [
  { id: 'theme', label: 'Thème', emoji: '🎨', description: 'Couleur, emoji, pied de page et mise en forme communs à tous les messages.' },
  { id: 'hub', label: 'Menu central (/panel)', emoji: '🧭', description: 'Le panneau qui regroupe toutes les fonctionnalités du bot.' },
  { id: 'sections', label: 'Sections du menu', emoji: '🗂️', description: 'Choisis les blocs affichés dans le menu central.' },
  { id: 'cards', label: 'Cartes & messages', emoji: '🪪', description: 'Boutons, barres de progression et application du thème aux autres messages.' },
] as const satisfies readonly SectionDef[];

export const UI_FIELDS = [
  // ---------------------------------------------------------- thème
  { key: 'accentColor', label: 'Couleur d’accent', kind: 'color', section: 'theme', hint: 'Couleur du liseré de tous les embeds.' },
  { key: 'accentEmoji', label: 'Emoji de marque', kind: 'string', section: 'theme', maxLength: 8 },
  { key: 'brandName', label: 'Nom affiché', kind: 'string', section: 'theme', maxLength: 32 },
  { key: 'footerText', label: 'Pied de page', kind: 'string', section: 'theme', maxLength: 100 },
  { key: 'showFooter', label: 'Afficher le pied de page', kind: 'boolean', section: 'theme' },
  { key: 'showTimestamp', label: 'Afficher l’horodatage', kind: 'boolean', section: 'theme' },
  { key: 'useThumbnails', label: 'Afficher les miniatures (avatars, articles)', kind: 'boolean', section: 'theme' },
  { key: 'showDivider', label: 'Séparateurs entre les blocs', kind: 'boolean', section: 'theme' },
  { key: 'divider', label: 'Caractère de séparation', kind: 'string', section: 'theme', maxLength: 24, dependsOn: 'showDivider' },
  { key: 'compact', label: 'Mode compact', kind: 'boolean', section: 'theme', hint: 'Textes plus courts, moins de lignes.' },
  { key: 'colorizeBySection', label: 'Couleur propre à chaque section', kind: 'boolean', section: 'theme', hint: 'Sinon, tout utilise la couleur d’accent.' },

  // ---------------------------------------------------------- menu central
  { key: 'hubEnabled', label: 'Activer le menu central', kind: 'boolean', section: 'hub', hint: '/panel ouvre un panneau regroupant toutes les fonctions.' },
  { key: 'hubStaffOnly', label: 'Réserver /panel à l’équipe', kind: 'boolean', section: 'hub' },
  { key: 'hubEphemeral', label: 'Répondre en message privé', kind: 'boolean', section: 'hub' },
  { key: 'hubTitle', label: 'Titre du menu', kind: 'string', section: 'hub', maxLength: 60, dependsOn: 'hubEnabled' },
  { key: 'hubDescription', label: 'Description du menu', kind: 'multiline', section: 'hub', maxLength: 800, dependsOn: 'hubEnabled' },
  { key: 'hubUseButtons', label: 'Navigation par boutons', kind: 'boolean', section: 'hub', dependsOn: 'hubEnabled' },
  { key: 'hubUseSelectMenu', label: 'Menu déroulant de navigation', kind: 'boolean', section: 'hub', dependsOn: 'hubEnabled' },
  { key: 'hubShowAccount', label: 'Afficher le solde du membre', kind: 'boolean', section: 'hub', dependsOn: 'hubEnabled' },
  { key: 'hubShowStats', label: 'Afficher les statistiques du serveur', kind: 'boolean', section: 'hub', dependsOn: 'hubEnabled' },
  { key: 'hubLeaderboardSize', label: 'Places du classement affichées', kind: 'integer', section: 'hub', min: 0, max: 10, dependsOn: 'hubShowStats' },
  { key: 'hubShowShortcuts', label: 'Afficher les raccourcis de commandes', kind: 'boolean', section: 'hub', dependsOn: 'hubEnabled' },
  { key: 'hubShowWebLink', label: 'Afficher le lien du panel web', kind: 'boolean', section: 'hub', dependsOn: 'hubEnabled' },

  // ---------------------------------------------------------- sections
  { key: 'sectionEconomy', label: 'Section « Économie »', kind: 'boolean', section: 'sections' },
  { key: 'sectionBlackjack', label: 'Section « Blackjack »', kind: 'boolean', section: 'sections' },
  { key: 'sectionShop', label: 'Section « Boutique »', kind: 'boolean', section: 'sections' },
  { key: 'sectionCommunity', label: 'Section « Communauté »', kind: 'boolean', section: 'sections' },
  { key: 'sectionInfo', label: 'Section « Serveur »', kind: 'boolean', section: 'sections' },
  { key: 'sectionModeration', label: 'Section « Modération »', kind: 'boolean', section: 'sections' },
  { key: 'moderationStaffOnly', label: 'Modération réservée à l’équipe', kind: 'boolean', section: 'sections', dependsOn: 'sectionModeration' },
  { key: 'hideDisabledSections', label: 'Masquer les sections désactivées', kind: 'boolean', section: 'sections', hint: 'Exemple : pas de bloc boutique si la boutique est coupée.' },

  // ---------------------------------------------------------- cartes
  { key: 'cardShowHints', label: 'Afficher les commandes utiles', kind: 'boolean', section: 'cards', hint: 'Rappelle les commandes liées sous chaque carte.' },
  { key: 'cardMaxButtons', label: 'Boutons maximum par ligne', kind: 'integer', section: 'cards', min: 1, max: 5 },
  { key: 'cardShowProgressBar', label: 'Barres de progression', kind: 'boolean', section: 'cards', hint: 'Plafonds quotidiens, stock, pénétration du sabot…' },
  { key: 'cardProgressBlocks', label: 'Longueur des barres', kind: 'integer', section: 'cards', min: 5, max: 30, dependsOn: 'cardShowProgressBar' },
  { key: 'progressFilledChar', label: 'Caractère « plein »', kind: 'string', section: 'cards', maxLength: 4, dependsOn: 'cardShowProgressBar' },
  { key: 'progressEmptyChar', label: 'Caractère « vide »', kind: 'string', section: 'cards', maxLength: 4, dependsOn: 'cardShowProgressBar' },
  { key: 'welcomeQuickActions', label: 'Boutons dans le message de bienvenue', kind: 'boolean', section: 'cards', dependsOn: 'cardShowHints' },
  { key: 'dropUseTheme', label: 'Cagnotte aux couleurs du thème', kind: 'boolean', section: 'cards' },
  { key: 'caseUseTheme', label: 'Dossiers de modération aux couleurs du thème', kind: 'boolean', section: 'cards' },
  { key: 'shopUseTheme', label: 'Vitrine de boutique aux couleurs du thème', kind: 'boolean', section: 'cards' },
] as const;

export type UiConfig = ConfigOf<typeof UI_FIELDS>;

export const DEFAULT_UI_CONFIG: UiConfig = {
  accentColor: '#c9b8ff',
  accentEmoji: '✦',
  brandName: 'Limerence',
  footerText: 'Limerence • /panel',
  showFooter: true,
  showTimestamp: true,
  useThumbnails: true,
  showDivider: true,
  divider: '━━━━━━━━━━',
  compact: false,
  colorizeBySection: true,

  hubEnabled: true,
  hubStaffOnly: false,
  hubEphemeral: true,
  hubTitle: 'Menu central',
  hubDescription:
    'Tout le bot au même endroit : économie, jeux, boutique, modération et vie du serveur.\nChoisis une section avec les boutons ci-dessous.',
  hubUseButtons: true,
  hubUseSelectMenu: true,
  hubShowAccount: true,
  hubShowStats: true,
  hubLeaderboardSize: 5,
  hubShowShortcuts: true,
  hubShowWebLink: true,

  sectionEconomy: true,
  sectionBlackjack: true,
  sectionShop: true,
  sectionCommunity: true,
  sectionInfo: true,
  sectionModeration: true,
  moderationStaffOnly: true,
  hideDisabledSections: true,

  cardShowHints: true,
  cardMaxButtons: 4,
  cardShowProgressBar: true,
  cardProgressBlocks: 12,
  progressFilledChar: '▰',
  progressEmptyChar: '▱',
  welcomeQuickActions: true,
  dropUseTheme: true,
  caseUseTheme: true,
  shopUseTheme: true,
};

export const UI_OPTIONS_COUNT = UI_FIELDS.length;

export const UI_DEFAULT_VALUES: ConfigValues = { ...DEFAULT_UI_CONFIG };
