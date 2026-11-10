# 🚀 FeedbackPro — Le Coach IA d'Audit Qualité Continu

Plateforme SaaS B2B où **chaque client réel devient un Client Mystère** : il scanne le QR code
d'une **zone** de l'établissement (Accueil, Salle, Toilettes…), laisse une note de 1 à 5 ★,
des tags et un commentaire — et le **Coach IA** transforme ces retours en **rapport d'audit
quotidien ou hebdomadaire** avec les **3 priorités du jour**, des recommandations et des
prédictions.

L'IA détecte ce que les avis Google ne disent pas : quelles zones se dégradent, quels tags
reviennent, quels créneaux posent problème, quels employés ont besoin d'un accompagnement.

Plans : **Starter 29 €/mois** · **Pro 99 €/mois** · **Enterprise 249 €/mois**.

---

## ✨ Fonctionnalités

| Rôle | Fonctionnalités |
|---|---|
| **Client Mystère** (sans compte) | Scan du QR d'une zone → « Comment évaluez-vous [zone] ? » → note 1-5 ★ (étoiles 68 px) → **tags contextuels de la zone** (fond vert si 4-5★, orange si 1-3★) → commentaire → **bouton WhatsApp géant** (message structuré établissement + zone + date) → **écran de remerciement avec code promo** |
| **Établissement (PRO)** | **Coach IA** (rapport quotidien/hebdo, priorités du jour, historique des scores), vue d'ensemble (score global 30 j, évolution, taux d'interception), **zones** avec **QR code par zone** (carte dédiée : aperçu, nb de retours, score moyen, **PNG 1000×1000 avec logo**, **PDF A4 « VOTRE AVIS COMPTE »** au sous-titre adapté à la zone, **planche de 20 étiquettes 5×5 cm**, **commande de stickers** intégrée) + **page Récompenses** (toggle, type café/réduction/autre, code promo dévoilé après l'envoi, aperçu client en direct), retours filtrables + réponses + actions managériales, équipe (employés affectés aux zones + leaderboard gamifié), statistiques (courbe 30 j, tags, heatmap 7 j × 24 h, performance par zone), commandes de supports physiques, facturation (plans + Stripe), paramètres (logo, WhatsApp, récompense, fréquence des rapports) |
| **Superadmin** | Vue plateforme (MRR 29/99/249, Pros actifs, commandes en cours), gestion des établissements (plan, suspension, suppression), workflow des commandes (À imprimer → Imprimé → Expédié + n° de suivi → Livré) + bon d'impression PDF, revenus, paramètres plateforme |
| **Plateforme** | Emails transactionnels (bienvenue, commande, alerte, récap hebdo, **rapport IA**), SMS d'alerte (note ≤ 2★), **crons** (rapports quotidiens 7h UTC + récap hebdo lundi 8h UTC), pages légales RGPD |

## 🧰 Stack technique

- **Next.js 16** (App Router, SPA monopage + rewrites) + **TypeScript** strict
- **Tailwind CSS 4** + **shadcn/ui** (palette : bleu `#2563EB` + blanc + gris)
- **Prisma ORM** + **SQLite** (sandbox — compatible PostgreSQL/Supabase en production ;
  les tableaux et enums sont stockés en `STRING JSON` avec parse sécurisé)
- **Authentification maison** : sessions en base + cookie **httpOnly** `fp_session` +
  hachage **bcrypt** + guards serveur (`requirePro` / `requireAdmin`) + middleware Edge
- **Coach IA** : **z-ai-web-dev-sdk** (backend uniquement) avec **fallback déterministe** —
  jamais d'erreur 500 brute sur la génération de rapport
- **recharts** (graphiques), **qrcode** + **sharp** (PNG 1000×1000 avec logo composé),
  **jsPDF** (affiches/étiquettes/bon d'impression)
- **zustand** (état client), **zod** (validation partagée), **framer-motion** (animations)
- **Intégrations optionnelles** : **Stripe** (abonnements), **Twilio** (SMS), **Resend** (emails)
  — toutes en **mode démo sans clés** (aucune dépendance bloquante).

## ⚙️ Installation locale

```bash
# 1. Installer les dépendances
bun install

# 2. Configurer l'environnement (mode démo complet sans aucune clé)
cp .env.example .env

# 3. Créer / mettre à jour la base de données
bun run db:push

# 4. Peupler la base avec des données de démonstration
bun run db:seed

# 5. Lancer le serveur de développement
bun run dev
```

L'application est disponible sur **http://localhost:3000**.

> 💡 **Mode démo par défaut** : sans clés Twilio/Resend/Stripe, les SMS, emails et paiements
> sont simulés (logs serveur `📱 SMS simulé`, `📧 Email simulé`, toast « Mode démo »).
> Sans LLM disponible, le Coach IA produit un **rapport déterministe** calculé depuis les
> statistiques. Aucune fonctionnalité n'est bloquée sans clés.

## 🔑 Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | ✅ | Connexion base de données (SQLite local ou PostgreSQL production) |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL publique (liens emails/SMS, redirections Stripe, QR codes `/r/<qrToken>`) |
| `CRON_SECRET` | — | Protège les 2 crons (`/api/cron/rapports-quotidiens`, `/api/cron/recap-weekly`, header `Authorization: Bearer`) |
| `TWILIO_SID` / `TWILIO_TOKEN` / `TWILIO_PHONE` | — | Alertes SMS réelles (note ≤ 2★) via l'API REST Twilio |
| `RESEND_API_KEY` / `EMAIL_FROM` | — | Emails transactionnels via l'API Resend (dont rapports IA) |
| `STRIPE_SECRET_KEY` | — | Abonnements (Checkout Session + webhooks) |
| `STRIPE_WEBHOOK_SECRET` | — | Vérification de signature du webhook `/api/webhooks/stripe` |
| `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` | — | Price IDs récurrents (29 €, 99 € et 249 €/mois) |

Le détail des instructions de création (Twilio, Resend, Price IDs Stripe) est commenté
directement dans [`.env.example`](.env.example).

## 🔑 Comptes de démonstration

| Rôle | Email | Mot de passe | Détails |
|---|---|---|---|
| 👑 Superadmin | `admin@feedbackpro.fr` | `admin123` | Accès à la vue plateforme complète |
| 🍕 Établissement (Pro) | `demo@pizzeria.fr` | `demo1234` | Pizzeria Bella Napoli · plan PRO · **3 zones** (Accueil, Salle / Restaurant, Toilettes RDC) · ~64 retours · 4 employés · rapport IA de démo |
| 💇 Établissement (Starter) | `contact@salon-elegance.fr` | `demo1234` | Salon Élégance · plan STARTER (paywall zones/employés) |
| 🥖 Établissement (Pro) | `bonjour@paindor.fr` | `demo1234` | Boulangerie Pain d'Or · Marseille |

> Le **QR code de chaque zone** est visible dans l'onglet « Zones / QR code » du dashboard.
> L'URL de scan publique est de la forme `/r/<qrToken>` (rewritée vers `/?scan=<qrToken>`).

## 🗃️ Modèle de données (pivot Session 1)

```
User      { id, email, passwordHash, role: SUPERADMIN|PRO }
Pro       { id, userId, nomEtablissement, typeEtablissement, adresse, ville, whatsapp?,
            email (réception rapports IA), logoUrl?, plan: STARTER|PRO|ENTERPRISE,
            frequenceRapport: quotidien|hebdomadaire, recompense?, messageWhatsapp?,
            onboardingDone, suspendu, smsAlertes }
Zone      { id, proId, nom, description?, qrToken (unique), tagsPositifs JSON, tagsNegatifs JSON }
Employe   { id, proId, nom, poste?, zoneIds JSON, actif }
Retour    { id, proId, zoneId, employeId?, note 1-5, tags JSON, commentaire?,
            personnelMentionne?, canalChoisi?, ipCity?, recompenseUtilisee,
            statut: NEW|IN_PROGRESS|RESOLVED, historique JSON, lu, reponsePro?, actionPrise? }
RapportIA { id, proId, type: quotidien|hebdomadaire, periodeDebut/Fin, scoreGlobal 0-100,
            contenuMarkdown, priorites JSON, recommandations JSON, predictions JSON,
            envoyeParEmail, envoyeParSMS }
Commande  { id, proId, zoneId?, typeSupport, quantite, prixEuros, adresseLivraison,
            statut: A_IMPRIMER|IMPRIME|EXPEDIE|LIVRE, pdfUrl?, numeroSuivi? }
Alerte    { id, proId, retourId?, titre, message, canal: DASHBOARD|SMS, lu }
Setting   { key, value }
```

⚠️ Tous les champs marqués `JSON` sont des colonnes `String` (contrainte SQLite) manipulées
avec `JSON.parse` / `JSON.stringify` + try/catch et défaut `[]` (voir `src/lib/ia.ts#parseJsonArray`).

## 📁 Structure du projet

```
prisma/
  schema.prisma        # User, Session, Pro, Zone, Employe, Retour, RapportIA, Commande, Alerte, Setting
  seed.ts              # Démo : superadmin + Pizzeria Bella Napoli (3 zones) + 3 établissements
src/
  app/
    page.tsx           # SPA monopage : landing · auth · scan · dashboards (rewrites next.config)
    cgu/               # Pages légales réelles : /cgu · /mentions-legales · /confidentialite · /cookies
    api/
      auth/            # register (zone « Accueil » créée) · login · logout · me
      public/          # scan (POST { qrToken }) · retour (alias du canonique)
      retour/          # Endpoint canonique des retours (alerte SMS/email si note ≤ 2)
      pro/             # coach (GET/POST, Coach IA) · zones · overview · retours · employes
                       # · leaderboard · stats · qrcode?zoneId= · commandes · settings
                       # · account · plan · alertes · billing/checkout
      webhooks/stripe/ # Webhook signé : checkout.session.completed, customer.subscription.*
      cron/            # rapports-quotidiens (7h UTC) · recap-weekly (lundi 8h UTC)
      admin/           # overview · pros (GET + actions POST) · commandes · revenus · settings
  components/
    ui/                # Composants shadcn/ui
    feedbackpro/       # landing · auth · scan · pro-dashboard (coach-ia, zones, retours,
                       #   team, stats, qrcode, billing, settings, actions) · admin-dashboard
  lib/
    db.ts              # Client Prisma (singleton)
    session.ts         # Sessions en base + cookie httpOnly + ok()/fail() + serializePro()
    guards.ts          # requirePro / requireAdmin (blocage 403 des comptes suspendus)
    ia.ts              # 🤖 Le Coach IA : agrégation, LLM z-ai, fallback déterministe
    constants.ts       # PLANS (29/99/249), SUPPORTS, tags, PLAN_LIMITS, libellés
    validation.ts      # Schémas zod partagés client/serveur
    serialise.ts       # Sérialiseurs Zone/Retour (JSON parsé)
    twilio.ts          # sendSMS() — API REST Twilio (mode démo sans clés)
    email.ts           # sendEmail() + templates HTML dont emailRapportIA()
    whatsapp.ts        # Message WhatsApp structuré (📍 Zone, ⭐ Note, 🏷️ Tags…)
    pdf.ts             # Affiche A4 « VOTRE AVIS COMPTE », planche 5×5 cm, bon de commande
    qr.ts              # Composition QR + logo côté client (canvas)
  store/
    app-store.ts       # État global (zustand) : vue courante, session, token de scan
vercel.json            # Crons : rapports-quotidiens "0 7 * * *" · recap-weekly "0 8 * * 1"
```

## 🔐 Authentification & protection des routes

- Mots de passe hachés avec **bcrypt** (10 rounds) — jamais stockés en clair.
- La connexion crée une **Session en base** (30 jours) référencée par un cookie
  **httpOnly + SameSite=Lax** (`fp_session`) : le token de session est inaccessible en JavaScript.
- La protection est assurée **côté serveur** par les guards `requirePro()` (dashboard Pro)
  et `requireAdmin()` (superadmin) sur **chaque route API** : c'est la véritable barrière.
  Le middleware Edge vérifie en amont la présence du cookie pour `/dashboard/*` et `/superadmin/*`.
- Un Pro **suspendu** par le superadmin reçoit un **403** avec message dédié sur toutes les API Pro.
- Ce choix (sessions en base) garantit la **révocation immédiate** des sessions.

## 📡 API — conventions

Toutes les réponses suivent le format `{ ok: true, data }` ou `{ ok: false, error }`.

### Authentification

| Verbe + route | Auth | Description |
|---|---|---|
| `POST /api/auth/register` | — | `{ email, password, nomEtablissement, typeEtablissement, adresse, ville, whatsapp? }` → `{ user, pro }` — crée la **zone « Accueil »**, `onboardingDone=true`, `frequenceRapport="quotidien"` + **email de bienvenue** |
| `POST /api/auth/login` | — | → `{ user, pro }` + cookie de session |
| `POST /api/auth/logout` | ✓ | Déconnexion (session révoquée) |
| `GET /api/auth/me` | ✓ | `{ user: { id, email, role }, pro }` |

### Coach IA & dashboard Pro

| Verbe + route | Auth | Description |
|---|---|---|
| `GET /api/pro/coach` | PRO | Dernier rapport (JSON parsé), `prioritesDuJour`, indicateurs (retours 24 h, alertes non lues, note 7 j, score global 30 j, évolution %), historique des rapports |
| `POST /api/pro/coach` | PRO | `{ type? }` → `{ rapport }` — génération LLM + **fallback déterministe**, email non bloquant |
| `GET /api/pro/zones` | PRO | Zones avec `nbRetours` + `noteMoyenne` |
| `POST /api/pro/zones` | PRO | `{ nom, description?, tagsPositifs?, tagsNegatifs? }` → 403 si limite du plan (message FR d'upgrade) |
| `PATCH/DELETE /api/pro/zones` | PRO | Mise à jour (`{ id, … }`) / suppression (`?id=`) |
| `GET /api/pro/overview` | PRO | `scoreGlobal30j`, `evolutionPct`, `retoursMois`, `tauxInterception`, `alertesNonLues`, `courbe30j`, derniers retours |
| `GET /api/pro/retours` | PRO | Filtres `?note=&zoneId=&statut=&tag=&dateDebut=&dateFin=&page=` → `{ retours: RetourDetail[], total }` |
| `PATCH /api/pro/retours` | PRO | `{ id, statut?, reponsePro?, actionPrise?, lu? }` — historique journalisé |
| `GET /api/pro/retours/export` | PRO | Export CSV (BOM Excel) |
| `GET /api/pro/employes` · `POST` · `PATCH` · `DELETE ?id=` | PRO | Employés affectés aux zones + stats (403 si limite du plan) |
| `GET /api/pro/leaderboard` | PRO | `{ top: [{ employeId, nom, poste, positifs, negatifs, noteMoy, badge }] }` — « Employé du mois » (>20 positifs), « Entretien recommandé » (>10 négatifs) |
| `GET /api/pro/stats` | PRO | `courbe30j`, `parTag`, `parHeure` (7 j × 24 h), `parZone`, `kpis` |
| `GET /api/pro/qrcode?zoneId=` | PRO | `{ zone, urlScan: `${APP_URL}/r/<qrToken>`, pngDataUrl }` — PNG 1000×1000 avec logo composé (sharp) |
| `GET/POST /api/pro/commandes` | PRO | Commandes de supports (quantité/prix du catalogue + **email de confirmation**) |
| `PUT /api/pro/settings` | PRO | Paramètres établissement (logo, WhatsApp, fréquence rapports…) |
| `GET/POST /api/pro/recompenses` | PRO | Micro-récompense client : toggle, type (café/réduction/autre), code promo, texte affiché |
| `GET /api/zone/[qrToken]` | public | Infos de la zone scannée : nom, établissement, tags contextuels, récompense (teaser) |
| `DELETE /api/pro/account` | PRO | Suppression définitive (cascade) + déconnexion |
| `POST /api/pro/plan` | PRO | Changement de plan (paiement simulé en mode démo) |
| `GET/PATCH /api/pro/alertes` | PRO | Alertes temps réel (marquer lu / tout marquer) |
| `POST /api/pro/billing/checkout` | PRO | Checkout Stripe ou `{ mode: "DEMO" }` sans clés |

### Public (Client Mystère)

| Verbe + route | Auth | Description |
|---|---|---|
| `POST /api/public/scan` | — | `{ qrToken }` → `{ zone: { nom, description }, pro: { nomEtablissement, logoUrl, recompense }, tagsPositifs, tagsNegatifs }` — 404 si token inconnu |
| `POST /api/retour` | — | `{ qrToken, note, tags, commentaire?, personnelMentionne?, canalChoisi? }` → `{ retour, recompense }` — canonique, alerte **SMS/email** si note ≤ 2 |
| `POST /api/public/retour` | — | Alias réexporté du canonique `/api/retour` |

### Superadmin

| Verbe + route | Auth | Description |
|---|---|---|
| `GET /api/admin/overview` | SUPERADMIN | `totalPros`, `prosActifs` (≥ 1 retour / 30 j), `mrr` (29/99/249, non suspendus), `commandesEnCours`, `croissance30j`, `repartitionPlans`, `top10Pros` |
| `GET /api/admin/pros` | SUPERADMIN | Liste + counts (zones/retours/employés) + filtres `?plan=&q=&statut=` |
| `POST /api/admin/pros` | SUPERADMIN | `{ action: changerPlan\|suspendre\|reactiver\|supprimer, id, plan? }` |
| `GET/PATCH /api/admin/commandes` | SUPERADMIN | Workflow de statut — **n° de suivi exigé à EXPEDIE** |
| `GET /api/admin/revenus` | SUPERADMIN | CA abonnements (plans 29/99/249) + CA supports + évolution 12 mois |
| `GET/PATCH /api/admin/settings` | SUPERADMIN | Réglages plateforme (model `Setting`) |

### Crons & webhooks

| Verbe + route | Auth | Description |
|---|---|---|
| `GET /api/cron/rapports-quotidiens` | Bearer | Génère le rapport quotidien du Coach IA pour chaque Pro `frequenceRapport="quotidien"` non suspendu ayant des retours sur 24 h → `{ rapports: [...] }` (planifié `0 7 * * *`) |
| `GET /api/cron/recap-weekly` | Bearer | Récap hebdomadaire (volume, note moyenne, alertes ≤ 2★) par établissement (planifié `0 8 * * 1`) |
| `POST /api/webhooks/stripe` | Signature | Webhook Stripe (plans synchronisés via `metadata.proId`) |

## 🤖 Le Coach IA (`src/lib/ia.ts`)

1. **Agrégation** — `agregerDonnees(pro, debut, fin)` compile les retours de la période :
   note moyenne, répartition des notes, performance et tags par zone, top tags négatifs,
   heures de pointe, employés cités.
2. **Génération LLM** — `z-ai-web-dev-sdk` (backend uniquement) avec une consigne système FR
   stricte (`SYSTEM_PROMPT_FR`) : le modèle doit répondre **uniquement** un JSON
   `{ scoreGlobal, contenuMarkdown, priorites[3], recommandations, predictions }`.
   Parsing robuste (blocs ```json```, extraction `{…}`), validation, timeout 45 s.
3. **Fallback déterministe** — si le LLM échoue (réseau, JSON invalide, timeout), un rapport
   complet est calculé depuis les statistiques : `scoreGlobal = round(noteMoyenne × 20)`,
   markdown synthétique (Points forts / Points de vigilance / Analyse), priorités = top 3 tags
   négatifs. **La fonction ne lève jamais d'exception** vers les routes.

```bash
# Générer un rapport à la main (session Pro active) :
curl -X POST http://localhost:3000/api/pro/coach -H "Content-Type: application/json" -d '{"type":"quotidien"}'
# Cron quotidien (Bearer obligatoire) :
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/rapports-quotidiens
```

## 🔌 Intégrations optionnelles (mode démo sans clés)

### SMS — Twilio (`src/lib/twilio.ts`)
`sendSMS(to, message)` appelle l'API REST Twilio (`fetch` + Basic auth, sans SDK). Sans clés :
le message est loggé (`📱 SMS simulé (mode démo)`) et la fonction renvoie `true`. Utilisé pour
l'alerte réclamation (note ≤ 2★) avec **fallback email** si le SMS est désactivé.

### Emails — Resend (`src/lib/email.ts`)
`sendEmail(to, sujet, html)` appelle l'API Resend. Sans clé : log (`📧 Email simulé`) + `true`.
Templates HTML inline-CSS responsives : `emailBienvenue`, `emailConfirmationCommande`,
`emailAlerteRetour`, `emailRecapHebdo` et **`emailRapportIA`** (sujet
« 🤖 Votre rapport d'audit FeedbackPro — Score X/100 »). Tous les envois sont **non bloquants**.

### Paiements — Stripe
- `POST /api/pro/billing/checkout { plan }` : Checkout Session (mode subscription) avec
  `metadata.proId` ; sans clés → `{ mode: "DEMO" }` (l'onglet Facturation applique le plan
  localement via `POST /api/pro/plan`).
- `POST /api/webhooks/stripe` : signature vérifiée, plans synchronisés via `metadata.proId`.
- Price IDs à créer : Starter 29 €, Pro 99 €, Enterprise 249 € (mensuels).

## 📜 Scripts disponibles

| Commande | Description |
|---|---|
| `bun run dev` | Serveur de développement (port 3000) |
| `bun run lint` | Vérification ESLint |
| `bunx tsc --noEmit` | Vérification TypeScript stricte |
| `bun run db:push` | Applique le schéma Prisma à la base |
| `bun run db:seed` | Peuple la base avec les données de démo |
| `bun run db:generate` | Régénère le client Prisma |

## 🚢 Déploiement production — Vercel + Supabase (pas-à-pas)

### 1. Base de données Supabase
1. Créer un projet sur [supabase.com](https://supabase.com) (région Europe recommandée).
2. **Project Settings → Database → Connection string → URI** : copier l'URI PostgreSQL.
3. Dans `prisma/schema.prisma`, passer `provider = "postgresql"`, puis restaurer les
   `enum` Prisma (`Role`, `Plan`, `Statut`, `TypeSupport`, `StatutCommande`, `Canal`) et
   `tags String[]` (contraintes SQLite levées en production).
4. Appliquer le schéma : `DATABASE_URL="postgresql://..." bunx prisma db push`.

### 2. Déploiement Vercel
1. Pousser le dépôt sur GitHub puis « Import Project » sur [vercel.com](https://vercel.com).
2. Renseigner les variables d'environnement : `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`,
   `CRON_SECRET` et, optionnels : clés Twilio / Resend / Stripe.
3. Déployer. Les **2 crons** (`vercel.json`) s'activent automatiquement :
   rapports-quotidiens chaque jour 7h UTC, recap-weekly chaque lundi 8h UTC
   (Vercel Cron Hobby : 1 cron/jour ; plan Pro pour plus).
4. Webhook Stripe : endpoint `https://<votre-domaine>/api/webhooks/stripe` → `whsec_...`
   dans `STRIPE_WEBHOOK_SECRET`.
5. Vérifier : `/api/cron/rapports-quotidiens` renvoie `401` sans le bon Bearer (normal),
   `/r/<qrToken>` ouvre le scan de la zone, `/cgu` s'affiche.

---

## 🧭 Divergences assumées (transparence technique)

| Sujet | Spécification | Implémentation | Raison |
|---|---|---|---|
| Authentification | NextAuth (Credentials Provider) | Auth maison équivalente : bcrypt + sessions en base + cookie httpOnly + guards + middleware | Mêmes garanties (révocation immédiate, httpOnly), contrainte SPA monopage de l'environnement |
| Base de données | PostgreSQL | SQLite (sandbox) | Environnement de développement ; les `STRING[]`/enums sont en `STRING JSON` avec parse sécurisé — migration Supabase documentée ci-dessus |
| PDF | @react-pdf/renderer | jsPDF | Mêmes livrables (affiche A4, planche 5×5 cm, bon d'impression) avec une lib déjà intégrée et vérifiée |
| LLM | OpenAI GPT-4o | z-ai-web-dev-sdk (backend) | SDK disponible dans l'environnement ; parsing robuste + **fallback déterministe** garantissent le contrat |
| WhatsApp | API Cloud Business | Lien `api.whatsapp.com/send` pré-rempli (click to chat) | Aucune validation Meta requise, expérience immédiate côté gérant |

---

© FeedbackPro — [Mentions légales](/mentions-legales) · [CGU](/cgu) · [Confidentialité](/confidentialite) · [Cookies](/cookies)
