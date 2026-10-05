# ✦ Limerence Bot

Bot Discord **clé en main** qui construit et gère un serveur **de A à Z** : catégories, salons
texte `➥ nom emoji`, salons vocaux (dont les privés `solo / duo / trio / quatuor / sections`),
rôle automatique **limerencien** en blanc, confessions anonymes, annonces programmées, modération…
le tout piloté depuis un **panel web d'administration**.

Le bot et le panel tournent dans **un seul service web Render** (plan gratuit possible) : un seul
déploiement, une seule URL, une seule facture.

---

## Sommaire

1. [Ce que le bot crée](#1-ce-que-le-bot-crée)
2. [Fonctionnalités](#2-fonctionnalités)
3. [Le panel d'administration](#3-le-panel-dadministration)
4. [Préparer Discord (5 minutes)](#4-préparer-discord-5-minutes)
5. [Déployer sur Render (Blueprint)](#5-déployer-sur-render-blueprint)
6. [Empêcher la mise en veille : UptimeRobot](#6-empêcher-la-mise-en-veille--uptimerobot)
7. [Variables d'environnement](#7-variables-denvironnement)
8. [Persistance des données](#8-persistance-des-données)
9. [Développement local](#9-développement-local)
10. [Commandes Discord](#10-commandes-discord)
11. [Structure du projet](#11-structure-du-projet)
12. [Dépannage](#12-dépannage)

---

## 1. Ce que le bot crée

Un blueprint **idempotent** : relance-le autant de fois que tu veux, rien n'est jamais dupliqué,
les salons existants sont simplement alignés (nom, catégorie, sujet, limite de places).

| Catégorie | Salons texte | Salons vocaux |
| --- | --- | --- |
| 📋 **INFOS** | `➥ règles 📜` · `➥ annonces 📣` · `➥ présentation 👋` | — |
| 🏠 **ACCUEIL** | `➥ chat 💬` · `➥ confessions 🤫` · `➥ photos 📸` | — |
| 🌍 **PUBLIC** | `➥ general 👥` · `➥ gaming 🎮` · `➥ musique 🎵` · `➥ chill 🌙` | `🔊 Vocal général` · `🔊 Gaming` · `🔊 Musique` · `🔊 Chill` |
| 🔒 **PRIVÉS** | — | `➕ créer-ton-salon` (hub) · `🔊 solo` (1) · `🔊 duo` (2) · `🔊 trio` (3) · `🔊 quatuor` (4) · `🔊 sections` |
| 🛡️ **ADMIN** (masquée) | `➥ logs-modération 🧾` · `➥ confessions-en-attente 🗂️` · `➥ panel-admin 🖥️` | — |

**Règles appliquées automatiquement :**

* chaque **salon texte** commence par `➥` et finit par un **emoji** (symbole personnalisable dans le panel) ;
* chaque **salon vocal** porte `🔊` en préfixe ;
* le rôle **limerencien** est créé en **blanc** (`#FFFFFF`) et attribué **automatiquement** à chaque arrivée
  (plus, si tu le souhaites, à tous les membres déjà présents) ;
* l'**ACCUEIL** est ouvert à tous, la catégorie **ADMIN** est invisible pour `@everyone` et réservée aux rôles
  ayant « Gérer le serveur » ;
* `➥ annonces 📣`, `➥ règles 📜`, `➥ confessions 🤫` sont en **lecture seule** (seuls les admins écrivent).

## 2. Fonctionnalités

### 🤫 Confessions anonymes
`/confession` ouvre un formulaire : l'auteur est enregistré côté bot (jamais affiché), la confession part
dans le salon **`➥ confessions-en-attente 🗂️`** avec des boutons **Publier / Refuser**. À la publication,
un embed anonyme est posté dans `➥ confessions 🤫` avec les réactions `❤️ 😮 🥺` (configurables), et le
même bouton est disponible dans le panel. Anti-spam et longueur max réglables.

### 🎧 Vocaux privés (les deux systèmes, comme demandé)
* **Salons fixes** : `🔊 solo` (1 place), `🔊 duo` (2), `🔊 trio` (3), `🔊 quatuor` (4), `🔊 sections`.
* **Salons temporaires (join-to-create)** : un membre rejoint `➕ créer-ton-salon`, le bot crée un salon
  privé à son nom, l'y déplace, lui envoie un **MP avec panneau de contrôle** (renommer, verrouiller,
  limite, réclamer, supprimer) et **supprime le salon dès qu'il se vide**.
  Commandes `/vocal renommer | limite | verrouiller | autoriser | expulser | transferer | supprimer | reclamer`.

### 📣 Annonces
Publication immédiate ou **programmée** (`30m`, `2h`, `3j` ou une date `2026-10-06T20:00`), avec mention
optionnelle `@here` / `@everyone`, depuis Discord (`/annonce`) ou depuis le panel (historique complet,
annulation, renvoi).

### 🤍 Rôle automatique
Rôle `limerencien` blanc, donné à l'arrivée, message de bienvenue automatique dans
`➥ présentation 👋`, attribution possible aux membres existants.

### 🛡️ Modération
Purge de messages (globale ou par auteur), verrouillage/déverrouillage de salon, expulsion, bannissement —
disponibles en commandes (`/purge`, `/lock`, `/unlock`, `/kick`, `/ban`) **et** dans le panel.
Chaque action est journalisée.

### 🧾 Journal
Toutes les actions (bot, panel, admins) sont horodatées dans le panel **et** recopiées dans
`➥ logs-modération 🧾`.

## 3. Le panel d'administration

Accessible sur l'URL Render de ton service, avec **connexion Discord OAuth2** réservée aux comptes ayant
la permission « Gérer le serveur » (ou à `OWNER_DISCORD_ID` / `ADMIN_DISCORD_IDS`).

| Page | Rôle |
| --- | --- |
| **Tableau de bord** | état du bot, statistiques, journal récent, aperçu du blueprint |
| **Déployer le blueprint** | checklist de mise en route, simulation (« simuler d'abord »), déploiement, dernier rapport détaillé |
| **Structure du serveur** | audit : ce qui est conforme / manquant / à aligner |
| **Salons & catégories** | éditeur visuel des catégories et salons (type, emoji, slug, sujet, places, lecture seule, admin, join-to-create) + aperçu en direct des noms Discord |
| **Rôle limerencien** | nom, couleur (blanc par défaut), attribution auto, mentionnable |
| **Vocaux privés** | réglages du join-to-create + liste des salons temporaires actifs (suppression, nettoyage) |
| **Confessions** | file d'attente (publier / refuser / supprimer), réglages salons + réactions + anti-spam |
| **Annonces** | création, programmation, historique, annulation |
| **Membres** | liste, rôles, arrivée, attribution manuelle du rôle |
| **Modération** | purge, verrouillage, expulsion, bannissement |
| **Journal** | toutes les entrées filtrables par niveau |
| **Réglages** | préfixe `➥`, ID du serveur, auto-déploiement au démarrage, état des variables d'environnement, lien d'invitation, redémarrage du bot, réinitialisation |

> Si les identifiants Discord ne sont pas encore renseignés, le panel se lance en **mode démo** avec des
> données fictives (aucune session anonyme n'est possible dès que l'OAuth2 est configuré).

## 4. Préparer Discord (5 minutes)

1. **Créer l'application** → <https://discord.com/developers/applications> → *New Application*
   (nom : `Limerence`).
2. **Onglet Bot** → *Reset Token* → copie le token → ce sera `DISCORD_TOKEN`.
3. **Onglet Bot** → active **SERVER MEMBERS INTENT** (obligatoire : rôle automatique + liste des membres).
   Le *Message Content Intent* n'est **pas** nécessaire.
4. **Onglet General Information** → copie l'**Application ID** → `DISCORD_CLIENT_ID`.
5. **Onglet OAuth2** → copie le **Client Secret** → `DISCORD_CLIENT_SECRET`, puis dans
   *Redirects* ajoute :
   ```
   http://localhost:3000/api/auth/callback
   https://TON-SERVICE.onrender.com/api/auth/callback
   ```
   (la seconde URL n'est connue qu'après la création du service Render — tu peux la rajouter juste après).
6. **Inviter le bot** (remplace `TON_CLIENT_ID`) :
   ```
   https://discord.com/oauth2/authorize?client_id=TON_CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```
   La permission **Administrateur** est recommandée : le bot crée catégories, salons, rôle et gère
   les déplacements vocaux. (Variante sans Administrateur : Gérer le serveur, Gérer les salons, Gérer les
   rôles, Gérer les messages, Expulser, Bannir, Déplacer des membres, Voir les salons.)
7. **Récupérer l'ID du serveur** : active le *Mode développeur* (Paramètres Discord → Avancés),
   clic droit sur le serveur → *Copier l'identifiant du serveur* → `DISCORD_GUILD_ID`.

## 5. Déployer sur Render (Blueprint)

1. Pousse ce dépôt sur **GitHub** (le fichier `render.yaml` est déjà prêt).
2. Sur <https://dashboard.render.com> → **New** → **Blueprint** → sélectionne le dépôt.
3. Render lit `render.yaml` et crée le service web **`limerence-bot`**
   (plan *Free*, région *Frankfurt*, build `npm ci && npm run build`, start `npm start`,
   health check `/health`).
4. Renseigne les variables demandées (celles marquées `sync: false`) :

   | Variable | Valeur |
   | --- | --- |
   | `DISCORD_TOKEN` | le token du bot |
   | `DISCORD_CLIENT_ID` | l'Application ID |
   | `DISCORD_CLIENT_SECRET` | le Client Secret |
   | `DISCORD_GUILD_ID` | l'ID de ton serveur |
   | `OWNER_DISCORD_ID` | ton ID Discord (accès panel garanti) |

   `SESSION_SECRET` est généré automatiquement par Render.
5. Clique sur **Apply** / **Create**. Le premier build prend 2 à 4 minutes.
6. Retourne dans le portail Discord (OAuth2 → Redirects) et ajoute l'URL du service :
   `https://limerence-bot-XXXX.onrender.com/api/auth/callback`.
7. Ouvre l'URL du service → **connexion Discord** → onglet **Déployer le blueprint** →
   *Appliquer le blueprint*. Tu peux d'abord cliquer sur **🧪 Simuler** pour voir ce qui sera créé.
8. Sur Discord, la commande `/setup` fait exactement la même chose (et `/structure` vérifie l'état).

> ⏳ **Rate limits Discord** : la création de salons est limitée à ~10 par 10 minutes. Si le déploiement
> s'interrompt à mi-chemin, relance-le simplement : il reprend là où il s'est arrêté, sans doublon.

## 6. Empêcher la mise en veille : UptimeRobot

Le plan gratuit Render endort un service web après **15 minutes sans trafic** : le bot se
déconnecterait. Deux protections sont incluses :

* **auto-ping interne** : le service s'appelle lui-même sur `/health` toutes les `KEEPALIVE_MINUTES`
  (10 minutes par défaut, réglable dans `render.yaml`) ;
* **Render** pingue déjà `/health` au démarrage (health check) → le bot s'allume immédiatement.

Pour un maintien 24/7 fiable, ajoute un moniteur externe gratuit :

1. Crée un compte sur <https://uptimerobot.com>.
2. **Add New Monitor** → type `HTTP(s)`.
3. **URL** : `https://TON-SERVICE.onrender.com/health`
4. **Monitoring Interval** : `5 minutes`.
5. (Optionnel) *Alert Contacts* : reçois un mail si le bot tombe.

Résultat : le service est réveillé toutes les 5 minutes, le bot reste connecté en permanence — sans
aucun plan payant.

> Alternative « zéro veille » : fais tourner le bot 24/7 sur une VM gratuite (Oracle Cloud, fly.io…) avec
> `DISCORD_TOKEN=… npm run start`, et garde Render uniquement pour le panel. Le code est identique.

## 7. Variables d'environnement

| Variable | Obligatoire | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | token du bot (Dev Portal → Bot) |
| `DISCORD_CLIENT_ID` | ✅ | Application ID |
| `DISCORD_CLIENT_SECRET` | ✅ | Client Secret (connexion du panel) |
| `DISCORD_GUILD_ID` | recommandé | ID du serveur géré (sinon : le premier serveur du bot) |
| `SESSION_SECRET` | ✅ en prod | signature des sessions du panel (généré par `render.yaml`) |
| `OWNER_DISCORD_ID` | recommandé | ton ID Discord : accès admin au panel garanti |
| `ADMIN_DISCORD_IDS` | optionnel | autres admins du panel, séparés par des virgules |
| `PUBLIC_URL` | optionnel | URL publique du panel (déduite de `RENDER_EXTERNAL_URL` sinon) |
| `DATABASE_URL` | optionnel | base Postgres pour une config persistante (voir §8) |
| `KEEPALIVE_MINUTES` | optionnel | fréquence de l'auto-ping `/health` (10 par défaut, `0` pour désactiver) |
| `DEMO_MODE` | optionnel | `true` force le mode démo, `false` le désactive |
| `TEMP_ROOMS_PER_USER` | optionnel | nombre max de salons vocaux temporaires par membre (`0` = illimité) |

## 8. Persistance des données

* **Sans `DATABASE_URL`** : la configuration (salons, rôle, réglages), les confessions, les annonces et le
  journal sont stockés dans un fichier JSON (`data/state.json`). Sur le plan gratuit Render, ce fichier est
  **effacé à chaque redéploiement** — ce n'est pas grave pour la structure du serveur (Discord est la
  source de vérité : il suffit de relancer le déploiement du blueprint), mais l'historique des confessions,
  annonces et logs est perdu.
* **Avec `DATABASE_URL`** (Postgres) : tout est persisté. Le `render.yaml` contient un bloc `databases:`
  commenté ; tu peux aussi utiliser **Neon** ou **Supabase** (gratuits, sans expiration) et coller
  simplement l'URL de connexion dans `DATABASE_URL`.

## 9. Développement local

```bash
git clone <ton-depot> && cd limerence-bot
npm install
cp .env.example .env      # puis renseigne le token, l'ID, le secret…
npm run dev               # http://localhost:3000
```

* Sans identifiants Discord, le panel démarre en **mode démo** : tu peux tout explorer.
* `npm run build && npm start` reproduit exactement l'environnement Render.
* `npm run typecheck` vérifie les types.

## 10. Commandes Discord

| Commande | Qui | Description |
| --- | --- | --- |
| `/setup` | Admins | crée ou répare toute la structure (`apercu: true` pour simuler) |
| `/structure` | Admins | audit du serveur face au blueprint |
| `/confession` | Tous | confession anonyme (formulaire ou message direct) |
| `/annonce` | Admins | publie ou programme une annonce (`quand: 2h`) |
| `/annonces liste` · `/annonces annuler` | Admins | suivi et annulation |
| `/vocal renommer` · `limite` · `verrouiller` · `autoriser` · `expulser` · `transferer` · `supprimer` · `reclamer` | Propriétaire du salon | gestion du salon vocal temporaire |
| `/purge` · `/lock` · `/unlock` · `/kick` · `/ban` | Admins | modération |
| `/panel` | Tous | lien vers le panel web |
| `/ping` | Tous | latence du bot |

## 11. Structure du projet

```
src/
├── app/
│   ├── (panel)/            # pages du panel (protégées par session admin)
│   │   ├── actions.ts      # server actions : blueprint, config, confessions, modération…
│   │   ├── page.tsx        # tableau de bord
│   │   ├── setup/ structure/ channels/ role/ voice/
│   │   ├── confessions/ announcements/ members/ moderation/ logs/ settings/
│   │   └── layout.tsx      # sidebar + garde d'accès
│   ├── api/auth/           # OAuth2 Discord (login + callback)
│   ├── health/             # health check Render / UptimeRobot + réveil du bot
│   └── login/              # page de connexion / mode démo
├── bot/
│   ├── events.ts           # ClientReady, GuildMemberAdd, VoiceStateUpdate, Interactions
│   ├── commands.ts         # commandes slash (définition + exécution)
│   ├── confessions.ts      # anonymisation, file d'attente, publication
│   ├── tempRooms.ts        # join-to-create + panneau de contrôle
│   ├── moderation.ts       # purge, lock, kick, ban
│   ├── announcements.ts    # annonces immédiates / programmées
│   ├── scheduler.ts        # tick 30 s (annonces, ménage)
│   └── resolve.ts          # résolution des salons du blueprint
├── lib/
│   ├── blueprint.ts        # moteur : crée/répare la structure du serveur
│   ├── config.ts           # blueprint par défaut (catégories, salons, rôle)
│   ├── store.ts            # persistance (Postgres ou fichier JSON)
│   ├── boot.ts             # démarrage du bot + auto-ping /health
│   ├── auth.ts             # OAuth2 Discord, sessions JWT, mode démo
│   ├── logs.ts             # journal du panel + miroir Discord
│   └── discord/client.ts   # instance unique du client Discord
└── components/             # UI du panel (sidebar, formulaires, éditeur de salons…)
render.yaml                 # Blueprint Render (1 service web)
```

## 12. Dépannage

| Symptôme | Solution |
| --- | --- |
| **« Used disallowed intents »** dans les logs | active **SERVER MEMBERS INTENT** dans Dev Portal → Bot |
| **Le bot ne crée pas de salons** | vérifie la permission *Gérer les salons* / Administrateur et que le bot est bien au-dessus du rôle ciblé |
| **`/setup` s'arrête au milieu** | rate limit Discord (10 salons / 10 min) : relance `/setup`, c'est idempotent |
| **Le panel refuse la connexion** | ton compte doit avoir *Gérer le serveur*, ou renseigne `OWNER_DISCORD_ID` |
| **« Invalid OAuth2 redirect_uri »** | ajoute `https://TON-SERVICE.onrender.com/api/auth/callback` dans OAuth2 → Redirects |
| **Le bot se déconnecte au bout de 15 min** | le service Render s'est endormi : configure UptimeRobot sur `/health` (§6) |
| **Le rôle limerencien n'est pas attribué** | vérifie que le rôle du bot est **plus haut** que `limerencien` dans la hiérarchie des rôles |
| **Confessions perdues après un redéploiement** | ajoute une base Postgres (`DATABASE_URL`, §8) |
| **`/vocal` dit « Ce salon n'est pas temporaire »** | ce salon fait partie des salons fixes (`solo`, `duo`…) : seuls les salons créés via le hub sont pilotables |

---

Fait avec 🤍 pour la communauté Limerence — blueprint, confessions anonymes et vocaux privés, prêts à
l'emploi.
