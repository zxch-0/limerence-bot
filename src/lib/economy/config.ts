import type { ConfigOf, ConfigValues, FieldDef, SectionDef } from '../schema-fields';

// ============================================================
//  Économie — configuration complète (144 options)
//
//  La liste ECONOMY_FIELDS est la SEULE source de vérité :
//    • le type EconomyConfig en est dérivé
//    • DEFAULT_ECONOMY_CONFIG est vérifié par TypeScript contre ce type
//    • le panel génère son interface à partir de ces mêmes champs
// ============================================================

export const ECONOMY_SECTIONS = [
  { id: 'currency', label: 'Monnaie & banque', emoji: '💰', description: 'Devise, solde de départ, plafonds et intérêts bancaires.' },
  { id: 'messages', label: 'Messages', emoji: '💬', description: 'Récompenses gagnées en discutant, avec anti-spam et plafond quotidien.' },
  { id: 'voice', label: 'Vocal', emoji: '🎧', description: 'Récompenses par minute passée en salon vocal.' },
  { id: 'reactions', label: 'Réactions', emoji: '✨', description: 'Petites récompenses quand un membre ajoute une réaction.' },
  { id: 'invites', label: 'Invitations', emoji: '📨', description: 'Récompenser les invitations réelles (retirées si le membre part).' },
  { id: 'join', label: 'Arrivées', emoji: '👋', description: 'Prime d’arrivée pour les nouveaux comptes légitimes.' },
  { id: 'daily', label: 'Quotidien', emoji: '📅', description: '/daily avec série quotidienne et bonus hebdomadaire.' },
  { id: 'work', label: 'Travail', emoji: '🛠️', description: '/work : gains aléatoires, métiers personnalisés et échecs.' },
  { id: 'crime', label: 'Crime', emoji: '🕵️', description: '/crime : risques, amendes et prison.' },
  { id: 'rob', label: 'Vol', emoji: '🥷', description: '/rob : vol d’un pourcentage du solde d’un autre membre.' },
  { id: 'beg', label: 'Manche', emoji: '🙏', description: '/beg : petites sommes aléatoires, refus possible.' },
  { id: 'search', label: 'Fouille', emoji: '🔎', description: '/search : fouiller un lieu pour trouver un peu d’argent.' },
  { id: 'pay', label: 'Transferts', emoji: '💸', description: '/pay : envoyer de l’argent à un membre, taxe et plafonds.' },
  { id: 'drops', label: 'Drops', emoji: '🎁', description: 'Cagnottes lâchées automatiquement dans un salon.' },
  { id: 'gambling', label: 'Paris', emoji: '🎲', description: 'Règles communes à tous les jeux d’argent (blackjack inclus).' },
  { id: 'income', label: 'Rôles de revenu', emoji: '💼', description: 'Rôles achetés en boutique qui génèrent un revenu passif (/income).' },
  { id: 'progression', label: 'XP & niveaux', emoji: '📈', description: 'Expérience, niveaux et bonus de gains.' },
  { id: 'prestige', label: 'Prestige', emoji: '🌟', description: 'Recommencer plus fort contre un bonus permanent.' },
  { id: 'quests', label: 'Quêtes', emoji: '🎯', description: 'Quêtes quotidiennes communes à tout le serveur.' },
  { id: 'lottery', label: 'Loterie', emoji: '🎟️', description: 'Tickets, cagnotte progressive et tirages automatiques.' },
  { id: 'market', label: 'Bourse', emoji: '📊', description: 'Actions fictives dont les cours fluctuent en continu.' },
  { id: 'rewards', label: 'Roue & coffres', emoji: '🎁', description: 'Roue de la fortune gratuite et coffres à ouvrir.' },
  { id: 'achievements', label: 'Succès', emoji: '🏅', description: 'Succès déblocables automatiquement avec récompenses.' },
  { id: 'leaderboard', label: 'Classement & rôles', emoji: '🏆', description: 'Top des membres et rôle du plus riche.' },
  { id: 'security', label: 'Sécurité & historique', emoji: '🔒', description: 'Anti-abus, journal des transactions, comptes fantômes.' },
] as const satisfies readonly SectionDef[];

export const ECONOMY_FIELDS = [
  // ---------- Monnaie & banque ----------
  { key: 'enabled', label: 'Activer l’économie', kind: 'boolean', section: 'currency', hint: 'Coupe toutes les commandes et récompenses d’économie.' },
  { key: 'currencyName', label: 'Nom de la devise', kind: 'string', section: 'currency', maxLength: 24 },
  { key: 'currencyPlural', label: 'Nom au pluriel', kind: 'string', section: 'currency', maxLength: 24 },
  { key: 'currencySymbol', label: 'Symbole (emoji)', kind: 'string', section: 'currency', maxLength: 8 },
  { key: 'startBalance', label: 'Solde de départ', kind: 'integer', section: 'currency', min: 0, max: 1_000_000 },
  { key: 'maxBalance', label: 'Solde maximum en poche (0 = illimité)', kind: 'integer', section: 'currency', min: 0, max: 100_000_000 },
  { key: 'allowNegative', label: 'Autoriser les soldes négatifs', kind: 'boolean', section: 'currency' },
  { key: 'balanceFloor', label: 'Plancher de solde', kind: 'integer', section: 'currency', min: -1_000_000, max: 1_000_000, hint: 'Le solde ne descend jamais sous cette valeur.' },
  { key: 'bankEnabled', label: 'Activer la banque', kind: 'boolean', section: 'currency', hint: '/bank depot · /bank retrait' },
  { key: 'maxBank', label: 'Capacité de la banque', kind: 'integer', section: 'currency', min: 0, max: 100_000_000 },
  { key: 'bankDepositMin', label: 'Dépôt minimum', kind: 'integer', section: 'currency', min: 0, max: 1_000_000 },
  { key: 'bankWithdrawMin', label: 'Retrait minimum', kind: 'integer', section: 'currency', min: 0, max: 1_000_000 },
  { key: 'interestEnabled', label: 'Intérêts bancaires', kind: 'boolean', section: 'currency' },
  { key: 'interestRatePercent', label: 'Taux d’intérêt (%)', kind: 'percent', section: 'currency', min: 0, max: 50, step: 0.1 },
  { key: 'interestIntervalHours', label: 'Intervalle des intérêts (heures)', kind: 'hours', section: 'currency', min: 1, max: 168 },
  { key: 'interestMax', label: 'Intérêts maximum par versement', kind: 'integer', section: 'currency', min: 0, max: 1_000_000 },
  { key: 'interestMinBank', label: 'Banque minimale pour toucher les intérêts', kind: 'integer', section: 'currency', min: 0, max: 10_000_000 },
  { key: 'roundAmounts', label: 'Arrondir les gains à l’entier', kind: 'boolean', section: 'currency' },
  { key: 'hideBalances', label: 'Masquer le solde des autres', kind: 'boolean', section: 'currency', hint: '/balance autrui répond en privé.' },
  { key: 'boostRoleId', label: 'Rôle « boost »', kind: 'roleOne', section: 'currency', hint: 'Les porteurs gagnent plus sur toutes les récompenses.' },
  { key: 'boostMultiplierPercent', label: 'Bonus du rôle boost (%)', kind: 'percent', section: 'currency', min: 0, max: 500 },
  { key: 'economyChannelOnly', label: 'Limiter les commandes à certains salons', kind: 'boolean', section: 'currency' },
  { key: 'economyAllowedChannels', label: 'Salons autorisés', kind: 'channel', section: 'currency', dependsOn: 'economyChannelOnly', maxItems: 25 },

  // ---------- Messages ----------
  { key: 'messageRewardEnabled', label: 'Récompenser les messages', kind: 'boolean', section: 'messages' },
  { key: 'messageMin', label: 'Gain minimum', kind: 'integer', section: 'messages', min: 0, max: 10_000 },
  { key: 'messageMax', label: 'Gain maximum', kind: 'integer', section: 'messages', min: 0, max: 10_000 },
  { key: 'messageCooldownSeconds', label: 'Délai entre deux gains (secondes)', kind: 'integer', section: 'messages', min: 0, max: 86_400 },
  { key: 'messageMinLength', label: 'Longueur minimale du message', kind: 'integer', section: 'messages', min: 0, max: 500 },
  { key: 'messageIgnoreBots', label: 'Ignorer les bots', kind: 'boolean', section: 'messages' },
  { key: 'messageIgnoredChannels', label: 'Salons ignorés', kind: 'channel', section: 'messages', maxItems: 25 },
  { key: 'messageAllowedChannels', label: 'Salons seuls autorisés (vide = tous)', kind: 'channel', section: 'messages', maxItems: 25 },
  { key: 'messageStreakEnabled', label: 'Bonus de série quotidienne', kind: 'boolean', section: 'messages' },
  { key: 'messageStreakPercent', label: 'Bonus par jour de série (%)', kind: 'percent', section: 'messages', min: 0, max: 100 },
  { key: 'messageStreakMaxPercent', label: 'Bonus de série plafonné à (%)', kind: 'percent', section: 'messages', min: 0, max: 500 },
  { key: 'messageDailyCapEnabled', label: 'Plafond quotidien', kind: 'boolean', section: 'messages' },
  { key: 'messageDailyCap', label: 'Plafond de gains par message / jour', kind: 'integer', section: 'messages', min: 0, max: 1_000_000 },
  { key: 'messageNotifyOnCap', label: 'Prévenir quand le plafond est atteint', kind: 'boolean', section: 'messages', dependsOn: 'messageDailyCapEnabled' },

  // ---------- Vocal ----------
  { key: 'voiceRewardEnabled', label: 'Récompenser le vocal', kind: 'boolean', section: 'voice' },
  { key: 'voiceMinPerHour', label: 'Gain minimum / heure', kind: 'integer', section: 'voice', min: 0, max: 100_000 },
  { key: 'voiceMaxPerHour', label: 'Gain maximum / heure', kind: 'integer', section: 'voice', min: 0, max: 100_000 },
  { key: 'voiceMinMinutes', label: 'Minutes minimum avant premier gain', kind: 'minutes', section: 'voice', min: 0, max: 600 },
  { key: 'voiceTickMinutes', label: 'Fréquence des versements (minutes)', kind: 'minutes', section: 'voice', min: 1, max: 120 },
  { key: 'voiceDailyCapEnabled', label: 'Plafond quotidien vocal', kind: 'boolean', section: 'voice' },
  { key: 'voiceDailyCap', label: 'Plafond par jour', kind: 'integer', section: 'voice', min: 0, max: 1_000_000 },
  { key: 'voiceAllowedCategories', label: 'Catégories prises en compte (vide = toutes)', kind: 'channel', section: 'voice', maxItems: 25, hint: 'Identifiants de catégories Discord.' },
  { key: 'voiceIgnoredChannels', label: 'Salons vocaux ignorés', kind: 'channel', section: 'voice', maxItems: 25 },
  { key: 'voiceIgnoreMuted', label: 'Exclure les membres muets/sourdine', kind: 'boolean', section: 'voice' },

  // ---------- Réactions ----------
  { key: 'reactionRewardEnabled', label: 'Récompenser les réactions', kind: 'boolean', section: 'reactions' },
  { key: 'reactionMin', label: 'Gain minimum', kind: 'integer', section: 'reactions', min: 0, max: 1_000 },
  { key: 'reactionMax', label: 'Gain maximum', kind: 'integer', section: 'reactions', min: 0, max: 1_000 },
  { key: 'reactionCooldownSeconds', label: 'Délai entre deux gains (secondes)', kind: 'integer', section: 'reactions', min: 0, max: 86_400 },
  { key: 'reactionIgnoreBots', label: 'Ignorer les bots', kind: 'boolean', section: 'reactions' },

  // ---------- Invitations ----------
  { key: 'inviteRewardEnabled', label: 'Récompenser les invitations', kind: 'boolean', section: 'invites' },
  { key: 'inviteRewardAmount', label: 'Montant par invitation', kind: 'integer', section: 'invites', min: 0, max: 1_000_000 },
  { key: 'inviteLeavePenalty', label: 'Retirer la somme si l’invité part', kind: 'boolean', section: 'invites' },
  { key: 'invitePerUserCap', label: 'Nombre d’invitations récompensées max / membre', kind: 'integer', section: 'invites', min: 0, max: 10_000, hint: '0 = illimité.' },
  { key: 'inviteMinAccountAgeDays', label: 'Âge minimum du compte invité (jours)', kind: 'integer', section: 'invites', min: 0, max: 3650 },

  // ---------- Arrivées ----------
  { key: 'joinBonusEnabled', label: 'Prime d’arrivée', kind: 'boolean', section: 'join' },
  { key: 'joinBonusAmount', label: 'Montant de la prime', kind: 'integer', section: 'join', min: 0, max: 1_000_000 },
  { key: 'joinBonusMinAccountAgeDays', label: 'Âge minimum du compte (jours)', kind: 'integer', section: 'join', min: 0, max: 3650 },
  { key: 'joinBonusDirectMessage', label: 'Annoncer la prime en MP', kind: 'boolean', section: 'join' },

  // ---------- Quotidien ----------
  { key: 'dailyEnabled', label: 'Activer /daily', kind: 'boolean', section: 'daily' },
  { key: 'dailyMin', label: 'Gain minimum', kind: 'integer', section: 'daily', min: 0, max: 1_000_000 },
  { key: 'dailyMax', label: 'Gain maximum', kind: 'integer', section: 'daily', min: 0, max: 1_000_000 },
  { key: 'dailyStreakBonus', label: 'Bonus par jour de série', kind: 'integer', section: 'daily', min: 0, max: 100_000 },
  { key: 'dailyStreakMaxBonus', label: 'Bonus de série plafonné à', kind: 'integer', section: 'daily', min: 0, max: 1_000_000 },
  { key: 'dailyCooldownHours', label: 'Délai entre deux /daily (heures)', kind: 'hours', section: 'daily', min: 1, max: 72 },
  { key: 'dailyResetOnMiss', label: 'Remettre la série à zéro après un oubli', kind: 'boolean', section: 'daily' },
  { key: 'dailyWeeklyBonus', label: 'Bonus du 7e jour consécutif', kind: 'integer', section: 'daily', min: 0, max: 1_000_000 },

  // ---------- Travail ----------
  { key: 'workEnabled', label: 'Activer /work', kind: 'boolean', section: 'work' },
  { key: 'workMin', label: 'Salaire minimum', kind: 'integer', section: 'work', min: 0, max: 1_000_000 },
  { key: 'workMax', label: 'Salaire maximum', kind: 'integer', section: 'work', min: 0, max: 1_000_000 },
  { key: 'workCooldownMinutes', label: 'Délai entre deux /work (minutes)', kind: 'minutes', section: 'work', min: 1, max: 10_080 },
  { key: 'workFailChancePercent', label: 'Chance d’échec (%)', kind: 'percent', section: 'work', min: 0, max: 100 },
  { key: 'workFailPenaltyPercent', label: 'Perte en cas d’échec (% du salaire)', kind: 'percent', section: 'work', min: 0, max: 100 },
  { key: 'workDailyCap', label: 'Nombre de /work par jour (0 = illimité)', kind: 'integer', section: 'work', min: 0, max: 100 },
  { key: 'workJobs', label: 'Métiers affichés', kind: 'list', section: 'work', maxItems: 40 },

  // ---------- Crime ----------
  { key: 'crimeEnabled', label: 'Activer /crime', kind: 'boolean', section: 'crime' },
  { key: 'crimeMin', label: 'Butin minimum', kind: 'integer', section: 'crime', min: 0, max: 1_000_000 },
  { key: 'crimeMax', label: 'Butin maximum', kind: 'integer', section: 'crime', min: 0, max: 1_000_000 },
  { key: 'crimeCooldownMinutes', label: 'Délai entre deux /crime (minutes)', kind: 'minutes', section: 'crime', min: 1, max: 10_080 },
  { key: 'crimeSuccessChancePercent', label: 'Chance de réussite (%)', kind: 'percent', section: 'crime', min: 0, max: 100 },
  { key: 'crimeFailPenaltyPercent', label: 'Amende en cas d’échec (% du solde)', kind: 'percent', section: 'crime', min: 0, max: 100 },
  { key: 'crimeJailEnabled', label: 'Prison en cas d’échec', kind: 'boolean', section: 'crime' },
  { key: 'crimeJailMinutes', label: 'Durée de la prison (minutes)', kind: 'minutes', section: 'crime', min: 1, max: 10_080 },
  { key: 'crimeMinBalance', label: 'Solde minimum pour jouer', kind: 'integer', section: 'crime', min: 0, max: 1_000_000 },

  // ---------- Vol ----------
  { key: 'robEnabled', label: 'Activer /rob', kind: 'boolean', section: 'rob' },
  { key: 'robCooldownMinutes', label: 'Délai entre deux /rob (minutes)', kind: 'minutes', section: 'rob', min: 1, max: 10_080 },
  { key: 'robSuccessChancePercent', label: 'Chance de réussite (%)', kind: 'percent', section: 'rob', min: 0, max: 100 },
  { key: 'robMinPercent', label: 'Part volée minimum (%)', kind: 'percent', section: 'rob', min: 0, max: 100 },
  { key: 'robMaxPercent', label: 'Part volée maximum (%)', kind: 'percent', section: 'rob', min: 0, max: 100 },
  { key: 'robMinVictimBalance', label: 'Solde minimum de la victime', kind: 'integer', section: 'rob', min: 0, max: 10_000_000 },
  { key: 'robFailPenaltyPercent', label: 'Amende en cas d’échec (% du butin visé)', kind: 'percent', section: 'rob', min: 0, max: 100 },
  { key: 'robShieldEnabled', label: 'Autoriser le bouclier anti-vol (boutique)', kind: 'boolean', section: 'rob' },
  { key: 'robTaxPercent', label: 'Taxe sur le butin (%)', kind: 'percent', section: 'rob', min: 0, max: 90 },
  { key: 'robDailyCap', label: 'Nombre de /rob par jour (0 = illimité)', kind: 'integer', section: 'rob', min: 0, max: 100 },
  { key: 'robBlockNewAccountHours', label: 'Bloquer les comptes de moins de X heures', kind: 'hours', section: 'rob', min: 0, max: 720 },

  // ---------- Manche ----------
  { key: 'begEnabled', label: 'Activer /beg', kind: 'boolean', section: 'beg' },
  { key: 'begMin', label: 'Aumône minimum', kind: 'integer', section: 'beg', min: 0, max: 100_000 },
  { key: 'begMax', label: 'Aumône maximum', kind: 'integer', section: 'beg', min: 0, max: 100_000 },
  { key: 'begCooldownMinutes', label: 'Délai entre deux /beg (minutes)', kind: 'minutes', section: 'beg', min: 1, max: 10_080 },
  { key: 'begRefuseChancePercent', label: 'Chance de refus (%)', kind: 'percent', section: 'beg', min: 0, max: 100 },
  { key: 'begDailyCap', label: 'Nombre de /beg par jour (0 = illimité)', kind: 'integer', section: 'beg', min: 0, max: 200 },
  { key: 'begLines', label: 'Phrases de manche', kind: 'list', section: 'beg', maxItems: 30 },

  // ---------- Fouille ----------
  { key: 'searchEnabled', label: 'Activer /search', kind: 'boolean', section: 'search' },
  { key: 'searchMin', label: 'Trouvaille minimum', kind: 'integer', section: 'search', min: 0, max: 100_000 },
  { key: 'searchMax', label: 'Trouvaille maximum', kind: 'integer', section: 'search', min: 0, max: 100_000 },
  { key: 'searchCooldownSeconds', label: 'Délai entre deux /search (secondes)', kind: 'integer', section: 'search', min: 10, max: 86_400 },
  { key: 'searchFailChancePercent', label: 'Chance de ne rien trouver (%)', kind: 'percent', section: 'search', min: 0, max: 100 },
  { key: 'searchPlaces', label: 'Lieux fouillés', kind: 'list', section: 'search', maxItems: 30 },

  // ---------- Transferts ----------
  { key: 'payEnabled', label: 'Activer /pay', kind: 'boolean', section: 'pay' },
  { key: 'payTaxPercent', label: 'Taxe de transfert (%)', kind: 'percent', section: 'pay', min: 0, max: 50 },
  { key: 'payMinAmount', label: 'Montant minimum', kind: 'integer', section: 'pay', min: 1, max: 1_000_000 },
  { key: 'payMaxAmount', label: 'Montant maximum (0 = illimité)', kind: 'integer', section: 'pay', min: 0, max: 100_000_000 },
  { key: 'payCooldownSeconds', label: 'Délai entre deux /pay (secondes)', kind: 'integer', section: 'pay', min: 0, max: 86_400 },
  { key: 'payDailyCap', label: 'Total transférable par jour (0 = illimité)', kind: 'integer', section: 'pay', min: 0, max: 100_000_000 },
  { key: 'payBlockNewAccountHours', label: 'Bloquer les comptes de moins de X heures', kind: 'hours', section: 'pay', min: 0, max: 720 },

  // ---------- Drops ----------
  { key: 'dropEnabled', label: 'Lâcher des cagnottes', kind: 'boolean', section: 'drops' },
  { key: 'dropMin', label: 'Cagnotte minimum', kind: 'integer', section: 'drops', min: 1, max: 1_000_000 },
  { key: 'dropMax', label: 'Cagnotte maximum', kind: 'integer', section: 'drops', min: 1, max: 1_000_000 },
  { key: 'dropCooldownMinutes', label: 'Intervalle entre deux drops (minutes)', kind: 'minutes', section: 'drops', min: 1, max: 10_080 },
  { key: 'dropAllowedChannels', label: 'Salons de drop (vide = salon économie)', kind: 'channel', section: 'drops', maxItems: 10 },
  { key: 'dropLifetimeSeconds', label: 'Durée de vie du drop (secondes)', kind: 'integer', section: 'drops', min: 10, max: 86_400 },
  { key: 'dropFirstClaimOnly', label: 'Un seul gagnant par drop', kind: 'boolean', section: 'drops' },

  // ---------- Paris ----------
  { key: 'gamblingEnabled', label: 'Autoriser les jeux d’argent', kind: 'boolean', section: 'gambling' },
  { key: 'gamblingTaxPercent', label: 'Taxe sur les gains (%)', kind: 'percent', section: 'gambling', min: 0, max: 50 },
  { key: 'betMin', label: 'Mise minimum', kind: 'integer', section: 'gambling', min: 1, max: 1_000_000 },
  { key: 'betMax', label: 'Mise maximum (0 = illimité)', kind: 'integer', section: 'gambling', min: 0, max: 100_000_000 },
  { key: 'betMaxPercentOfBalance', label: 'Mise maximum (% du solde, 0 = illimité)', kind: 'percent', section: 'gambling', min: 0, max: 100 },
  { key: 'betCooldownSeconds', label: 'Délai entre deux parties (secondes)', kind: 'integer', section: 'gambling', min: 0, max: 3600 },
  { key: 'betAllowedChannels', label: 'Salons de jeu autorisés (vide = partout)', kind: 'channel', section: 'gambling', maxItems: 15 },
  { key: 'dailyLossLimitEnabled', label: 'Limiter les pertes quotidiennes', kind: 'boolean', section: 'gambling' },
  { key: 'dailyLossLimit', label: 'Perte maximale par jour (0 = illimité)', kind: 'integer', section: 'gambling', min: 0, max: 100_000_000 },

  // ---------- Rôles de revenu ----------
  { key: 'incomeEnabled', label: 'Activer les revenus de rôles', kind: 'boolean', section: 'income', hint: 'Les articles « Rôle de revenu » de la boutique génèrent un revenu passif.' },
  { key: 'incomeMaxAccruedHours', label: 'Revenu accumulable au maximum (heures)', kind: 'hours', section: 'income', min: 1, max: 8760, dependsOn: 'incomeEnabled' },

  // ---------- XP & niveaux ----------
  { key: 'xpEnabled', label: 'Activer l’expérience (XP)', kind: 'boolean', section: 'progression' },
  { key: 'xpPerAmount', label: 'Pièces gagnées pour 1 XP', kind: 'integer', section: 'progression', min: 1, max: 1_000_000, dependsOn: 'xpEnabled' },
  { key: 'levelBonusPercent', label: 'Bonus de gains par niveau (%)', kind: 'percent', section: 'progression', min: 0, max: 100, dependsOn: 'xpEnabled' },
  { key: 'levelBonusMaxPercent', label: 'Bonus de niveau plafonné à (%)', kind: 'percent', section: 'progression', min: 0, max: 500, dependsOn: 'xpEnabled' },
  { key: 'levelReward', label: 'Récompense par niveau gagné', kind: 'integer', section: 'progression', min: 0, max: 1_000_000, dependsOn: 'xpEnabled' },
  { key: 'levelUpAnnounce', label: 'Annoncer les montées de niveau', kind: 'boolean', section: 'progression', dependsOn: 'xpEnabled' },

  // ---------- Prestige ----------
  { key: 'prestigeEnabled', label: 'Activer le prestige', kind: 'boolean', section: 'prestige' },
  { key: 'prestigeMinTotal', label: 'Fortune minimale pour prestigier', kind: 'integer', section: 'prestige', min: 1, max: 1_000_000_000, dependsOn: 'prestigeEnabled' },
  { key: 'prestigeBonusPercent', label: 'Bonus de gains par niveau de prestige (%)', kind: 'percent', section: 'prestige', min: 0, max: 100, dependsOn: 'prestigeEnabled' },

  // ---------- Quêtes ----------
  { key: 'questsEnabled', label: 'Activer les quêtes quotidiennes', kind: 'boolean', section: 'quests' },
  { key: 'questsPerDay', label: 'Quêtes par jour et par membre', kind: 'integer', section: 'quests', min: 1, max: 10, dependsOn: 'questsEnabled' },
  { key: 'questRewardMin', label: 'Récompense minimum d’une quête', kind: 'integer', section: 'quests', min: 0, max: 1_000_000, dependsOn: 'questsEnabled' },
  { key: 'questRewardMax', label: 'Récompense maximum d’une quête', kind: 'integer', section: 'quests', min: 0, max: 1_000_000, dependsOn: 'questsEnabled' },
  { key: 'questXpReward', label: 'XP offerte par quête complétée', kind: 'integer', section: 'quests', min: 0, max: 100_000, dependsOn: 'questsEnabled' },

  // ---------- Loterie ----------
  { key: 'lotteryEnabled', label: 'Activer la loterie', kind: 'boolean', section: 'lottery' },
  { key: 'lotteryTicketPrice', label: 'Prix d’un ticket', kind: 'integer', section: 'lottery', min: 1, max: 1_000_000, dependsOn: 'lotteryEnabled' },
  { key: 'lotteryDrawEveryHours', label: 'Tirage toutes les X heures', kind: 'hours', section: 'lottery', min: 1, max: 168, dependsOn: 'lotteryEnabled' },
  { key: 'lotteryJackpotPercent', label: 'Part des mises alimentant le jackpot (%)', kind: 'percent', section: 'lottery', min: 1, max: 100, dependsOn: 'lotteryEnabled' },
  { key: 'lotteryAnnounce', label: 'Annoncer les tirages et les gagnants', kind: 'boolean', section: 'lottery', dependsOn: 'lotteryEnabled' },

  // ---------- Bourse ----------
  { key: 'marketEnabled', label: 'Activer la bourse', kind: 'boolean', section: 'market' },
  { key: 'marketTickMinutes', label: 'Fluctuation des cours toutes les X minutes', kind: 'minutes', section: 'market', min: 1, max: 1440, dependsOn: 'marketEnabled' },
  { key: 'marketVolatilityPercent', label: 'Volatilité maximale par fluctuation (%)', kind: 'percent', section: 'market', min: 0, max: 100, dependsOn: 'marketEnabled' },
  { key: 'marketFeePercent', label: 'Frais d’achat/vente (%)', kind: 'percent', section: 'market', min: 0, max: 20, dependsOn: 'marketEnabled' },
  { key: 'marketSymbols', label: 'Actions disponibles (SYMBOLE:prix de départ)', kind: 'list', section: 'market', maxItems: 12, dependsOn: 'marketEnabled' },

  // ---------- Roue & coffres ----------
  { key: 'spinEnabled', label: 'Activer la roue de la fortune (/spin)', kind: 'boolean', section: 'rewards' },
  { key: 'spinCooldownHours', label: 'Délai entre deux tours de roue (heures)', kind: 'hours', section: 'rewards', min: 1, max: 168, dependsOn: 'spinEnabled' },
  { key: 'spinMin', label: 'Gain minimum de la roue', kind: 'integer', section: 'rewards', min: 0, max: 1_000_000, dependsOn: 'spinEnabled' },
  { key: 'spinMax', label: 'Gain maximum de la roue', kind: 'integer', section: 'rewards', min: 0, max: 1_000_000, dependsOn: 'spinEnabled' },
  { key: 'spinJackpotAmount', label: 'Jackpot de la roue', kind: 'integer', section: 'rewards', min: 0, max: 100_000_000, dependsOn: 'spinEnabled' },
  { key: 'spinJackpotChancePercent', label: 'Chance de jackpot (%)', kind: 'percent', section: 'rewards', min: 0, max: 100, dependsOn: 'spinEnabled' },
  { key: 'cratesEnabled', label: 'Activer les coffres (/coffre)', kind: 'boolean', section: 'rewards' },
  { key: 'cratesDailyFree', label: 'Coffres gratuits par jour', kind: 'integer', section: 'rewards', min: 0, max: 10, dependsOn: 'cratesEnabled' },
  { key: 'crateMin', label: 'Gain minimum d’un coffre', kind: 'integer', section: 'rewards', min: 0, max: 1_000_000, dependsOn: 'cratesEnabled' },
  { key: 'crateMax', label: 'Gain maximum d’un coffre', kind: 'integer', section: 'rewards', min: 0, max: 1_000_000, dependsOn: 'cratesEnabled' },
  { key: 'crateXp', label: 'XP offerte par coffre ouvert', kind: 'integer', section: 'rewards', min: 0, max: 100_000, dependsOn: 'cratesEnabled' },
  { key: 'crateJackpotAmount', label: 'Jackpot d’un coffre', kind: 'integer', section: 'rewards', min: 0, max: 100_000_000, dependsOn: 'cratesEnabled' },
  { key: 'crateJackpotChancePercent', label: 'Chance de jackpot par coffre (%)', kind: 'percent', section: 'rewards', min: 0, max: 100, dependsOn: 'cratesEnabled' },

  // ---------- Succès ----------
  { key: 'achievementsEnabled', label: 'Activer les succès', kind: 'boolean', section: 'achievements' },
  { key: 'achievementReward', label: 'Récompense par succès débloqué', kind: 'integer', section: 'achievements', min: 0, max: 1_000_000, dependsOn: 'achievementsEnabled' },
  { key: 'achievementXp', label: 'XP offerte par succès débloqué', kind: 'integer', section: 'achievements', min: 0, max: 100_000, dependsOn: 'achievementsEnabled' },

  // ---------- Classement ----------
  { key: 'leaderboardEnabled', label: 'Activer le classement', kind: 'boolean', section: 'leaderboard' },
  { key: 'leaderboardSize', label: 'Nombre de places affichées', kind: 'integer', section: 'leaderboard', min: 3, max: 100 },
  { key: 'leaderboardHideBots', label: 'Masquer les bots', kind: 'boolean', section: 'leaderboard' },
  { key: 'leaderboardIgnoredIds', label: 'Membres exclus du classement', kind: 'list', section: 'leaderboard', maxItems: 25 },
  { key: 'richestRoleEnabled', label: 'Donner un rôle au plus riche', kind: 'boolean', section: 'leaderboard' },
  { key: 'richestRoleId', label: 'Rôle du plus riche', kind: 'roleOne', section: 'leaderboard', dependsOn: 'richestRoleEnabled' },
  { key: 'richestRefreshHours', label: 'Rafraîchir le rôle toutes les X heures', kind: 'hours', section: 'leaderboard', min: 1, max: 168 },
  { key: 'showRankInProfile', label: 'Afficher le rang dans /profil', kind: 'boolean', section: 'leaderboard' },

  // ---------- Sécurité ----------
  { key: 'antiAltEnabled', label: 'Bloquer les comptes trop récents', kind: 'boolean', section: 'security' },
  { key: 'antiAltAccountAgeDays', label: 'Âge minimum du compte (jours)', kind: 'integer', section: 'security', min: 0, max: 365, dependsOn: 'antiAltEnabled' },
  { key: 'ignoreBotsEverywhere', label: 'Ignorer tous les bots', kind: 'boolean', section: 'security' },
  { key: 'logTransactions', label: 'Journaliser les transactions', kind: 'boolean', section: 'security' },
  { key: 'historySize', label: 'Transactions conservées par membre', kind: 'integer', section: 'security', min: 0, max: 200 },
  { key: 'resetOnLeave', label: 'Réinitialiser le compte au départ du membre', kind: 'boolean', section: 'security' },
  { key: 'allowSelfGive', label: 'Autoriser /economie donner sur soi-même', kind: 'boolean', section: 'security' },
] as const satisfies readonly FieldDef[];

export type EconomyConfig = ConfigOf<typeof ECONOMY_FIELDS>;

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  // Monnaie & banque
  enabled: true,
  currencyName: 'Pièce',
  currencyPlural: 'Pièces',
  currencySymbol: '🪙',
  startBalance: 500,
  maxBalance: 0,
  allowNegative: false,
  balanceFloor: 0,
  bankEnabled: true,
  maxBank: 250_000,
  bankDepositMin: 1,
  bankWithdrawMin: 1,
  interestEnabled: true,
  interestRatePercent: 1,
  interestIntervalHours: 24,
  interestMax: 5_000,
  interestMinBank: 100,
  roundAmounts: true,
  hideBalances: false,
  boostRoleId: '',
  boostMultiplierPercent: 25,
  economyChannelOnly: false,
  economyAllowedChannels: [],

  // Messages
  messageRewardEnabled: true,
  messageMin: 2,
  messageMax: 9,
  messageCooldownSeconds: 60,
  messageMinLength: 4,
  messageIgnoreBots: true,
  messageIgnoredChannels: [],
  messageAllowedChannels: [],
  messageStreakEnabled: true,
  messageStreakPercent: 2,
  messageStreakMaxPercent: 50,
  messageDailyCapEnabled: true,
  messageDailyCap: 1_500,
  messageNotifyOnCap: false,

  // Vocal
  voiceRewardEnabled: true,
  voiceMinPerHour: 30,
  voiceMaxPerHour: 80,
  voiceMinMinutes: 5,
  voiceTickMinutes: 10,
  voiceDailyCapEnabled: true,
  voiceDailyCap: 2_000,
  voiceAllowedCategories: [],
  voiceIgnoredChannels: [],
  voiceIgnoreMuted: true,

  // Réactions
  reactionRewardEnabled: true,
  reactionMin: 1,
  reactionMax: 4,
  reactionCooldownSeconds: 300,
  reactionIgnoreBots: true,

  // Invitations
  inviteRewardEnabled: true,
  inviteRewardAmount: 250,
  inviteLeavePenalty: true,
  invitePerUserCap: 0,
  inviteMinAccountAgeDays: 7,

  // Arrivées
  joinBonusEnabled: true,
  joinBonusAmount: 300,
  joinBonusMinAccountAgeDays: 3,
  joinBonusDirectMessage: false,

  // Quotidien
  dailyEnabled: true,
  dailyMin: 150,
  dailyMax: 400,
  dailyStreakBonus: 25,
  dailyStreakMaxBonus: 500,
  dailyCooldownHours: 20,
  dailyResetOnMiss: true,
  dailyWeeklyBonus: 500,

  // Travail
  workEnabled: true,
  workMin: 80,
  workMax: 350,
  workCooldownMinutes: 60,
  workFailChancePercent: 12,
  workFailPenaltyPercent: 20,
  workDailyCap: 8,
  workJobs: ['barista', 'développeur', 'livreur', 'graphiste', 'serveur', 'jardinier', 'streamer', 'électricien'],

  // Crime
  crimeEnabled: true,
  crimeMin: 100,
  crimeMax: 900,
  crimeCooldownMinutes: 90,
  crimeSuccessChancePercent: 45,
  crimeFailPenaltyPercent: 10,
  crimeJailEnabled: true,
  crimeJailMinutes: 45,
  crimeMinBalance: 50,

  // Vol
  robEnabled: true,
  robCooldownMinutes: 120,
  robSuccessChancePercent: 40,
  robMinPercent: 5,
  robMaxPercent: 25,
  robMinVictimBalance: 200,
  robFailPenaltyPercent: 30,
  robShieldEnabled: true,
  robTaxPercent: 5,
  robDailyCap: 3,
  robBlockNewAccountHours: 24,

  // Manche
  begEnabled: true,
  begMin: 5,
  begMax: 60,
  begCooldownMinutes: 20,
  begRefuseChancePercent: 35,
  begDailyCap: 15,
  begLines: [
    'Un passant te glisse quelques pièces.',
    'Tu fais la manche devant la boulangerie.',
    'Quelqu’un te donne de la monnaie en souriant.',
    'Tu vends un vieux badge à un collectionneur.',
  ],

  // Fouille
  searchEnabled: true,
  searchMin: 10,
  searchMax: 120,
  searchCooldownSeconds: 180,
  searchFailChancePercent: 25,
  searchPlaces: ['le canapé', 'la voiture', 'le grenier', 'le sac à dos', 'la machine à café', 'le parc'],

  // Transferts
  payEnabled: true,
  payTaxPercent: 2,
  payMinAmount: 10,
  payMaxAmount: 0,
  payCooldownSeconds: 30,
  payDailyCap: 0,
  payBlockNewAccountHours: 12,

  // Drops
  dropEnabled: true,
  dropMin: 50,
  dropMax: 400,
  dropCooldownMinutes: 180,
  dropAllowedChannels: [],
  dropLifetimeSeconds: 900,
  dropFirstClaimOnly: true,

  // Paris
  gamblingEnabled: true,
  gamblingTaxPercent: 3,
  betMin: 10,
  betMax: 0,
  betMaxPercentOfBalance: 0,
  betCooldownSeconds: 5,
  betAllowedChannels: [],
  dailyLossLimitEnabled: false,
  dailyLossLimit: 0,

  // Rôles de revenu
  incomeEnabled: true,
  incomeMaxAccruedHours: 168,

  // XP & niveaux
  xpEnabled: true,
  xpPerAmount: 100,
  levelBonusPercent: 0.5,
  levelBonusMaxPercent: 25,
  levelReward: 100,
  levelUpAnnounce: true,

  // Prestige
  prestigeEnabled: true,
  prestigeMinTotal: 1_000_000,
  prestigeBonusPercent: 2,

  // Quêtes
  questsEnabled: true,
  questsPerDay: 3,
  questRewardMin: 200,
  questRewardMax: 800,
  questXpReward: 50,

  // Loterie
  lotteryEnabled: true,
  lotteryTicketPrice: 100,
  lotteryDrawEveryHours: 24,
  lotteryJackpotPercent: 50,
  lotteryAnnounce: true,

  // Bourse
  marketEnabled: true,
  marketTickMinutes: 30,
  marketVolatilityPercent: 10,
  marketFeePercent: 1,
  marketSymbols: ['LMC:100', 'DSO:250', 'CRY:80', 'GLD:500', 'NEB:150', 'VOX:60'],

  // Roue & coffres
  spinEnabled: true,
  spinCooldownHours: 20,
  spinMin: 50,
  spinMax: 500,
  spinJackpotAmount: 10_000,
  spinJackpotChancePercent: 2,
  cratesEnabled: true,
  cratesDailyFree: 1,
  crateMin: 25,
  crateMax: 250,
  crateXp: 25,
  crateJackpotAmount: 5_000,
  crateJackpotChancePercent: 5,

  // Succès
  achievementsEnabled: true,
  achievementReward: 100,
  achievementXp: 50,

  // Classement
  leaderboardEnabled: true,
  leaderboardSize: 10,
  leaderboardHideBots: true,
  leaderboardIgnoredIds: [],
  richestRoleEnabled: false,
  richestRoleId: '',
  richestRefreshHours: 24,
  showRankInProfile: true,

  // Sécurité
  antiAltEnabled: false,
  antiAltAccountAgeDays: 7,
  ignoreBotsEverywhere: true,
  logTransactions: true,
  historySize: 25,
  resetOnLeave: false,
  allowSelfGive: false,
};

export const ECONOMY_OPTIONS_COUNT = ECONOMY_FIELDS.length;

/** Valeurs par défaut au format générique (utilisé par le panel et les tests). */
export const ECONOMY_DEFAULT_VALUES: ConfigValues = { ...DEFAULT_ECONOMY_CONFIG };

export type EconomySectionId = (typeof ECONOMY_SECTIONS)[number]['id'];
export type EconomyFieldKey = keyof EconomyConfig;
