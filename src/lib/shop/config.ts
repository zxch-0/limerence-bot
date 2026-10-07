import type { ConfigOf, ConfigValues, FieldDef, SectionDef } from '../schema-fields';

// ============================================================
//  Boutique — configuration globale (22 options)
//  Les articles eux-mêmes sont des objets stockés dans l'état
//  (state.shopItems) et éditables dans le panel.
// ============================================================

export const SHOP_SECTIONS = [
  { id: 'access', label: 'Accès', emoji: '🛒', description: 'Activation, salon de la boutique, restrictions.' },
  { id: 'sales', label: 'Ventes & promotions', emoji: '🏷️', description: 'Taxe, remises globales et revente.' },
  { id: 'stock', label: 'Stock & rôles', emoji: '📦', description: 'Réassort automatique et durée des rôles achetés.' },
  { id: 'logging', label: 'Journal & notifications', emoji: '🧾', description: 'Traçabilité des achats.' },
] as const satisfies readonly SectionDef[];

export const SHOP_FIELDS = [
  { key: 'enabled', label: 'Activer la boutique', kind: 'boolean', section: 'access' },
  { key: 'itemsPerPage', label: 'Articles par page dans /shop', kind: 'integer', section: 'access', min: 1, max: 25 },
  { key: 'requireRoleIds', label: 'Rôles requis pour acheter (vide = tous)', kind: 'role', section: 'access', maxItems: 10 },
  { key: 'minAccountAgeDays', label: 'Âge minimum du compte (jours)', kind: 'integer', section: 'access', min: 0, max: 365 },
  { key: 'cooldownSeconds', label: 'Délai entre deux achats (secondes)', kind: 'integer', section: 'access', min: 0, max: 86_400 },
  { key: 'defaultMaxPerUser', label: 'Achats maximum par membre et article (0 = illimité)', kind: 'integer', section: 'access', min: 0, max: 1000 },
  { key: 'allowButtons', label: 'Boutons d’achat sous la vitrine', kind: 'boolean', section: 'access' },

  { key: 'purchaseTaxPercent', label: 'Taxe d’achat (%)', kind: 'percent', section: 'sales', min: 0, max: 50 },
  { key: 'saleEnabled', label: 'Promotion globale active', kind: 'boolean', section: 'sales' },
  { key: 'salePercent', label: 'Remise globale (%)', kind: 'percent', section: 'sales', min: 0, max: 90, dependsOn: 'saleEnabled' },
  { key: 'saleEndsAt', label: 'Fin de la promotion (AAAA-MM-JJTHH:MM, vide = sans fin)', kind: 'string', section: 'sales', maxLength: 32, dependsOn: 'saleEnabled' },
  { key: 'allowResell', label: 'Autoriser la revente (/revendre)', kind: 'boolean', section: 'sales' },
  { key: 'resellPercent', label: 'Prix de revente (% du prix d’achat)', kind: 'percent', section: 'sales', min: 0, max: 100, dependsOn: 'allowResell' },
  { key: 'allowRefund', label: 'Remboursement intégral pendant X minutes (0 = aucun)', kind: 'minutes', section: 'sales', min: 0, max: 1440 },

  { key: 'restockEnabled', label: 'Réassort automatique des stocks', kind: 'boolean', section: 'stock' },
  { key: 'restockEveryHours', label: 'Réassort toutes les X heures', kind: 'hours', section: 'stock', min: 1, max: 336, dependsOn: 'restockEnabled' },
  { key: 'restockPercent', label: 'Réassort à X % du stock initial (%)', kind: 'percent', section: 'stock', min: 1, max: 100, dependsOn: 'restockEnabled' },
  { key: 'roleDurationDays', label: 'Durée des rôles achetés (jours, 0 = permanent)', kind: 'integer', section: 'stock', min: 0, max: 3650 },
  { key: 'removeSoldOutItems', label: 'Masquer les articles épuisés', kind: 'boolean', section: 'stock' },

  { key: 'logPurchases', label: 'Journaliser chaque achat', kind: 'boolean', section: 'logging' },
  { key: 'notifyOnPurchase', label: 'Annoncer les achats dans le salon économie', kind: 'boolean', section: 'logging' },
  { key: 'sendReceiptInDM', label: 'Envoyer le reçu en MP', kind: 'boolean', section: 'logging' },
] as const satisfies readonly FieldDef[];

export type ShopConfig = ConfigOf<typeof SHOP_FIELDS>;

export const DEFAULT_SHOP_CONFIG: ShopConfig = {
  enabled: true,
  itemsPerPage: 8,
  requireRoleIds: [],
  minAccountAgeDays: 0,
  cooldownSeconds: 10,
  defaultMaxPerUser: 1,
  allowButtons: true,

  purchaseTaxPercent: 0,
  saleEnabled: false,
  salePercent: 10,
  saleEndsAt: '',
  allowResell: true,
  resellPercent: 60,
  allowRefund: 5,

  restockEnabled: false,
  restockEveryHours: 24,
  restockPercent: 100,
  roleDurationDays: 0,
  removeSoldOutItems: false,

  logPurchases: true,
  notifyOnPurchase: true,
  sendReceiptInDM: false,
};

export const SHOP_OPTIONS_COUNT = SHOP_FIELDS.length;

export const SHOP_DEFAULT_VALUES: ConfigValues = { ...DEFAULT_SHOP_CONFIG };
