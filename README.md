# ✦ Limerence Bot

Bot Discord **économie + jeux + modération**, piloté par un **panel web d'administration**.

Le bot ne crée **aucune structure** sur ton serveur : pas de catégories, pas de salons, pas de rôle
fabriqué à l'installation. Il utilise uniquement les salons et les rôles **existants** que tu choisis
dans le panel, et il apporte tout le reste :

- 💰 une **économie complète** et configurable — **148 options** réparties en 17 sections ;
- 🃏 un **blackjack** de casino (sabot, partage, double, assurance, abandon, paris annexes) — **44 options** ;
- 🛒 une **boutique configurable** (rôles, boucliers, boosters, collections, stock, promotions) — **22 options** ;
- 🛡️ une **modération avancée** avec **avertissements + message privé automatique**, dossiers numérotés,
  sanctions graduées et auto-modération — **59 options** ;
- 🪄 confessions anonymes, annonces programmées, embeds personnalisés, vocaux temporaires ;
- 🎨 un **système d'interface unifié** : thème, menu central `/panel` et cartes par section —
  **41 options**.

**314 options** au total, **48 commandes slash**, et un seul service à déployer : le bot et le panel
tournent dans le même process Node (plan gratuit Render possible).

---

## Sommaire

1. [Fonctionnalités](#1-fonctionnalités)
2. [Le panel d'administration](#2-le-panel-dadministration)
3. [Préparer Discord (5 minutes)](#3-préparer-discord-5-minutes)
4. [Déployer sur Render (Blueprint)](#4-déployer-sur-render-blueprint)
5. [Empêcher la mise en veille : UptimeRobot](#5-empêcher-la-mise-en-veille--uptimerobot)
6. [Variables d'environnement](#6-variables-denvironnement)
7. [Persistance des données](#7-persistance-des-données)
8. [Développement local](#8-développement-local)
9. [Commandes Discord](#9-commandes-discord)
10. [Structure du projet](#10-structure-du-projet)
11. [Dépannage](#11-dépannage)

---

## 1. Fonctionnalités

### 💰 Économie (148 options · 17 sections)

| Domaine | Ce que tu règles |
| --- | --- |
| Monnaie & banque | devise, symbole, solde de départ, plafond de poche, banque, dépôts/retraits, intérêts (taux, intervalle, plafond), rôle « boost » |
| Gains passifs | récompense par message (min/max, cooldown, longueur minimale, anti-spam, plafond quotidien), gains vocaux par heure, récompenses de réactions |
| Invitations & arrivées | prime d'invitation, pénalité si l'invité part, prime d'arrivée, âge minimum du compte |
| Commandes | `/daily` (série, bonus hebdomadaire), `/work` (métiers personnalisés, échecs), `/crime` (risques, amendes, prison), `/rob` (pourcentage volé, bouclier, taxe), `/beg`, `/search` (lieux personnalisés), `/pay` (taxe, plafonds) |
| Drops | cagnotte lâchée automatiquement dans un salon, montant, fréquence, durée de vie, premier arrivé |
| Paris | mise minimale/maximale, pourcentage du solde, taxe de jeu, plafond de perte quotidienne |
| Classement | taille du classement, bots masqués, membres ignorés, rôle du « plus riche » rafraîchi automatiquement |
| Sécurité | anti-comptes multiples, historique des transactions, remise à zéro au départ, journal |

Chaque gain respecte les plafonds, les temps de recharge et les bonus de série — le calcul est dans
`src/lib/economy/`, entièrement testé.

### 🃏 Blackjack (44 options · 7 sections)

- Sabot de 1 à 8 jeux avec **pénétration réaliste** (remélange selon le pourcentage configuré) ;
- **double**, **partage** (nombre de partages, partage d'as à une carte, double après partage),
  **abandon** (pourcentage remboursé), **assurance** (plafond, ratio) ;
- payout du blackjack (`3:2`, `6:5`…), règle du 17 souple, égalité remboursée ou perdue ;
- paris annexes **21+3** et **paire parfaite** ;
- bonus de série de victoires, compensation après une série de défaites, taxe de table ;
- timeout de tour avec action automatique (rester / abandonner), messages et couleurs de table.

### 🛒 Boutique (22 options + catalogue illimité)

- 4 types d'articles : **rôle Discord** (durée configurable), **bouclier anti-vol**, **booster de gains**,
  **objet de collection** ;
- stock (limité ou illimité) avec **réassort automatique**, promotions datées, taxe d'achat, revente,
  limite par membre, rôle requis, âge de compte minimum, reçus en MP, vitrine dans un salon.

### 🛡️ Modération (59 options · 5 sections)

- **Avertissements** : dossier numéroté (`CAS-0001`), **message privé détaillé au membre** (raison,
  modérateur, nombre d'avertissements, sanction déclenchée, date d'expiration), publication dans le salon
  de modération, expiration automatique ;
- **Sanctions automatiques** par palier : mute → kick → ban (paliers configurables) ;
- **Dossiers** : historique complet, retrait, effacement, purge, consultation par membre ;
- **Sanctions** : kick, ban, unban, softban, mute/unmute, pseudonyme, rôles, purge filtrée (liens, pièces
  jointes, embeds, mentions, bots, mot-clé, membre), verrouillage, lockdown du serveur, slowmode, nuke ;
- **Auto-modération** temps réel : liens (liste blanche), invitations, mentions massives, majuscules,
  messages répétés, longueur, emojis, mots interdits, rôles/salons ignorés — avec testeur intégré au panel ;
- **Anti-raid** : seuil d'arrivées, fenêtre de temps, âge minimum de compte, lockdown automatique.

### 🎨 Interface du bot (41 options · 4 sections)

Tout ce que le bot affiche passe par un seul système d'interface, configurable dans le panel
(page **Interface du bot**, commande Discord `/panel`) :

- **Thème** : couleur d'accent, emoji de marque, nom de marque, pied de page, horodatage,
  miniatures, séparateur personnalisé, couleur par section ;
- **Menu central** : une carte « hub » qui regroupe toutes les fonctionnalités, avec navigation par
  boutons **et** menu déroulant, compte du membre, statistiques du serveur, classement, raccourcis de
  commandes, lien du panel ;
- **Sections** : économie 💰, blackjack 🃏, boutique 🛒, modération 🛡️ (réservable à l'équipe),
  communauté 🪄 et serveur 📊 — chacune activable, masquée automatiquement si la fonction
  correspondante est coupée ;
- **Cartes** : indices de commandes, nombre maximal de boutons, barres de progression
  (longueur et caractères personnalisables), application du thème aux cagnottes, dossiers et boutique ;
- **Accueil** : boutons d'accès rapide sous le message de bienvenue.

Le panel affiche un **aperçu du rendu Discord** calculé avec les mêmes fonctions que le bot : ce que
tu vois à l'écran est exactement ce que Discord affichera.

### 🪄 Communauté

- **Confessions anonymes** : formulaire Discord, validation par l'équipe, réactions, cooldown ;
- **Annonces** : envoi immédiat ou programmé (`30m`, `2h`, `3j`, date précise), mentions ;
- **Embeds personnalisés** : créateur visuel, modèles réutilisables, publication depuis le panel ou Discord ;
- **Vocaux temporaires** : salon hub « rejoindre pour créer », catégorie dédiée, renommage, verrouillage,
  limite de places, réclamation, suppression automatique. Le **panneau de contrôle est envoyé en MP**
  au propriétaire et ses boutons fonctionnent depuis le MP (comme `/vocal`) : le bot retrouve le
  serveur concerné à partir du salon, sans exiger que la commande soit lancée dessus.

---

## 2. Le panel d'administration

| Page | Contenu |
| --- | --- |
| `/` | Tableau de bord : état du bot, masse monétaire, parties, avertissements, classement, journal |
| `/ui` | **Interface du bot** : thème, menu central, sections, cartes + aperçu du rendu Discord |
| `/economy` | Les 148 options d'économie, avec recherche et aperçu des gains |
| `/economy/players` | Comptes des membres : soldes, banque, inventaire, ajustements, réinitialisation |
| `/blackjack` | Tables en cours, statistiques des joueurs, 44 options de jeu |
| `/shop` | Catalogue éditable (création, stock, position, visibilité) + 22 options |
| `/moderation` | Sanctions, rôles, salons, dossiers et 59 options |
| `/warns` | Avertissements par membre, barème automatique, historique |
| `/automod` | **Testeur de messages** + règles actives + détections récentes |
| `/welcome` | Message d'arrivée (**salon de publication au choix**), rôle existant, vocaux temporaires, **salons du bot** (11 emplacements) |
| `/confessions`, `/announcements`, `/embeds`, `/logs`, `/settings` | File de validation, annonces, modèles, journal, réglages |

L'éditeur de configuration est **générique** : une option déclarée dans `src/lib/*/config.ts` apparaît
automatiquement dans le panel, avec son type, ses bornes, son aide et ses dépendances.

**Salon du message de bienvenue.** Le bot publie l'arrivée d'un membre dans l'ordre suivant :

1. le **salon choisi** dans `Accueil & salons → Salon de publication` ;
2. à défaut, l'emplacement **« Bienvenue »** ;
3. à défaut, l'emplacement **« Salon principal »**.

Si aucun des trois n'est renseigné, le message n'est pas envoyé et un avertissement est écrit dans le
journal. La page affiche en direct le salon réellement utilisé et un aperçu du message rendu avec les
mêmes jetons que le bot (`{membre}`, `{pseudo}`, `{serveur}`, `{membres}`, `{compte}`, `{invites}`,
`{id}` — les anciens jetons anglais restent acceptés).

---

## 3. Préparer Discord (5 minutes)

1. <https://discord.com/developers/applications> → **New Application**.
2. Onglet **Bot** → *Reset Token* → copie le token dans `DISCORD_TOKEN`.
3. Onglet **Bot** → active **Server Members Intent**, **Message Content Intent** et
   **Presence Intent** (nécessaires pour la modération, l'économie et les vocaux).
4. Onglet **OAuth2** → copie l'**Application ID** (`DISCORD_CLIENT_ID`) et le **Client Secret**
   (`DISCORD_CLIENT_SECRET`).
5. Onglet **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`, permissions
   **Administrator** → ouvre le lien et invite le bot sur ton serveur.
6. Active le **mode développeur** dans Discord (Paramètres → Avancés) pour copier l'identifiant de ton
   serveur (`DISCORD_GUILD_ID`), les salons et les rôles.

> Le bot enregistre ses commandes slash au démarrage. Sur un serveur, la propagation est immédiate ;
> en global, elle peut prendre jusqu'à une heure.

---

## 4. Déployer sur Render (Blueprint)

1. Pousse ce repo sur GitHub.
2. Render → **New** → **Blueprint** → sélectionne le repo.
3. Renseigne les variables marquées `sync: false` (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`,
   `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `OWNER_DISCORD_ID`).
4. Déploie, puis ouvre `https://TON-URL/` : connecte-toi avec un compte Discord ayant
   **Gérer le serveur**.
5. Dans **Accueil & salons**, associe les salons que le bot doit utiliser.

`render.yaml` prévoit un seul service web (`/health` comme sonde) et, en commentaire, une base
Postgres optionnelle.

---

## 5. Empêcher la mise en veille : UptimeRobot

Le plan gratuit Render s'endort après 15 minutes d'inactivité. Crée un moniteur **HTTP(s)** sur
`https://TON-URL/health` toutes les **5 minutes** : la route `/health` relance le bot si besoin
(`KEEPALIVE_MINUTES` contrôle aussi l'auto-ping interne).

---

## 6. Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `DISCORD_TOKEN` | Token du bot (obligatoire en production) |
| `DISCORD_CLIENT_ID` | Application ID — OAuth et enregistrement des commandes |
| `DISCORD_CLIENT_SECRET` | Secret OAuth pour la connexion au panel |
| `DISCORD_GUILD_ID` | Serveur géré (sinon auto-détection du premier serveur) |
| `OWNER_DISCORD_ID` | Accès admin garanti au panel |
| `ADMIN_DISCORD_IDS` | Autres admins (identifiants séparés par des virgules) |
| `SESSION_SECRET` | Signature des sessions (généré par le Blueprint Render) |
| `PUBLIC_URL` | URL publique du panel (callback OAuth) |
| `DATABASE_URL` | PostgreSQL — sans cela, un fichier JSON local est utilisé |
| `DATA_DIR` | Dossier du fichier JSON (défaut : `./data`) |
| `DEMO_MODE` | Mode démo (refusé dès que l'OAuth Discord est configuré) |
| `KEEPALIVE_MINUTES` | Auto-ping `/health` (0 = désactivé) |
| `TEMP_ROOMS_PER_USER` | Vocaux temporaires par membre (0 = illimité) |
| `LIMERENCE_NO_MIRROR` | `1` = ne pas recopier le journal dans Discord (tests) |

---

## 7. Persistance des données

- **Avec `DATABASE_URL`** : tout l'état (configuration, comptes d'économie, boutique, dossiers de
  modération, confessions, annonces, embeds, journal) est stocké en jsonb dans la table
  `limerence_state`.
- **Sans** : fichier `data/state.json` (attention : effacé à chaque redéploiement sur un plan sans
  disque persistant — branche une base Postgres gratuite chez Neon ou Supabase pour le long terme).

Les **salons et les rôles** restent la source de vérité : le bot ne garde que leurs identifiants.

---

## 8. Développement local

```bash
npm install
cp .env.example .env.local   # renseigne DISCORD_TOKEN et DISCORD_CLIENT_ID
npm run dev                  # http://localhost:3000 (bot + panel)
```

Commandes utiles :

```bash
npm run typecheck   # tsc --noEmit sur tout le projet
npm run build       # build Next.js de production
npm test            # suite de tests (logique économie, blackjack, boutique, modération, bot)
```

La suite de tests (`tests/`) couvre la logique métier pure : 79 assertions réparties sur la
normalisation des configurations, l'économie (gains, plafonds, intérêts, transferts), le règlement du
blackjack (payouts, assurance, partage, taxes), la boutique (achats, stock, revente, réassort), la
modération (dossiers, paliers, auto-modération, MP de sanction), la persistance et l'intégrité des
48 commandes slash.

---

## 9. Commandes Discord

**48 commandes** enregistrées au démarrage.

### Économie & jeux (15)

`/balance` · `/profil` · `/daily` · `/work` · `/crime` · `/rob` · `/beg` · `/search` · `/pay` ·
`/bank` (solde, depot, retrait) · `/leaderboard` · `/inventaire` · `/revendre` ·
`/shop` (liste, acheter, vitrine) · `/blackjack` (jouer, carte, rester, doubler, split, assurance,
abandonner, quitter, stats, regles)

### Modération (25)

`/warn` (ajouter, liste, retirer, effacer, modifier) · `/cas` (voir, membre, liste) · `/kick` · `/ban` ·
`/unban` · `/softban` · `/mute` · `/unmute` · `/nick` · `/purge` (messages, utilisateur, bots, contient,
liens, pieces-jointes, embeds, mentions, tout) · `/lock` · `/unlock` · `/lockdown` · `/unlockdown` ·
`/slowmode` · `/nuke` · `/addrole` · `/removerole` · `/userinfo` · `/serverinfo` · `/roleinfo` ·
`/banlist` · `/antiraid` (statut, activer, desactiver) · `/economie` (donner, retirer, definir, reset,
etat) · `/aide`

### Communauté & vocal (8)

`/confession` · `/annonce` · `/annonces` (liste, annuler) · `/embed` (creer, liste, publier, modifier,
supprimer) · `/regles` · `/vocal` (renommer, limite, verrouiller, autoriser, expulser, transferer,
supprimer, reclamer) · `/panel` · `/ping`

---

## 10. Structure du projet

```
src/
├── app/
│   ├── (panel)/            # panel d'administration (pages + actions serveur)
│   │   ├── actions/        #   config, economy, shop, moderation, content, rooms
│   │   ├── economy/        #   configuration + comptes des membres
│   │   ├── blackjack/ shop/ moderation/ automod/ warns/ welcome/
│   │   └── confessions/ announcements/ embeds/ logs/ settings/
│   ├── api/auth/           # OAuth2 Discord
│   ├── health/route.ts     # sonde + auto-redémarrage du bot
│   └── login/page.tsx
├── bot/                    # couche Discord (événements, commandes, récompenses, scheduler)
│   └── ui.ts               # design system + menu central (cartes pures → embeds Discord)
├── components/             # Sidebar, ConfigEditor, DiscordPreview, sélecteurs, formulaires
└── lib/
    ├── economy/            # configuration (148 options), cœur de l'économie, actions
    ├── blackjack/          # configuration (44), moteur de jeu, table
    ├── shop/               # configuration (22), articles, achats
    ├── moderation/         # configuration (59), dossiers, auto-modération
    ├── ui/                 # configuration de l'interface (41 options)
    ├── welcome.ts          # jetons du message d'accueil + choix du salon
    ├── schema-fields.ts    # moteur de formulaires générique (types, bornes, validation)
    ├── channels.ts         # résolution des 11 emplacements de salon
    ├── store.ts            # persistance (Postgres ou JSON)
    └── config.ts types.ts  # état global
tests/                      # suite node --test (logique pure, sans Discord)
```

**Règle d'architecture** : `src/lib/**` est de la logique pure (testable sans Discord), `src/bot/**`
parle à Discord et n'importe jamais Next.js, `src/app/**` ne fait que de l'interface.

---

## 11. Dépannage

| Symptôme | Cause / solution |
| --- | --- |
| Les commandes slash n'apparaissent pas | `DISCORD_CLIENT_ID` manquant, ou propagation globale (jusqu'à 1 h). Relance depuis **Réglages → Redémarrer le bot** |
| « Bot hors ligne » dans le panel | `DISCORD_TOKEN` invalide ou intents non activés dans le portail développeur |
| Le bot ne poste rien | Aucun salon associé : va dans **Accueil & salons** et renseigne les emplacements |
| `Used disallowed intents` | Active **Server Members Intent** et **Message Content Intent** |
| Impossible de mute / ajouter un rôle | Remonte le bot dans la hiérarchie des rôles du serveur |
| Le panel demande une connexion Discord | Normal dès que `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` sont définis |
| Les données disparaissent au redéploiement | Branche `DATABASE_URL` (Postgres) — le fichier JSON n'est pas persistant sur Render |
| `/health` renvoie `booted: false` | Regarde les logs Render : le token ou la connexion Postgres est en cause |
