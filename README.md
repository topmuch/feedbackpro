# 🚀 FeedbackPro

Plateforme SaaS B2B qui permet aux commerces (restaurants, salons, boutiques…) de collecter des
retours clients via QR codes : le client scanne, note son expérience de 1 à 5 ★, et selon la note
il est **redirigé vers Google (avis public)** ou vers **WhatsApp (réclamation privée au gérant)**.

FeedbackPro intercepte les réclamations **avant** qu'elles ne deviennent des avis négatifs :
alerte instantanée au gérant (SMS **Twilio** ou email **Resend**), suivi des statuts,
gamification des équipes, statistiques avancées et abonnements **Stripe**.

---

## ✨ Fonctionnalités

| Rôle | Fonctionnalités |
|---|---|
| **Client final** (sans compte) | Scan QR → note 1-5 ★ → tags → commentaire → envoi WhatsApp ou avis Google |
| **Commerçant (PRO)** | Dashboard KPIs (note moyenne, taux d'interception), liste des retours + réponses + export CSV, QR code téléchargeable (PNG / affiche A4 / planche d'étiquettes), gestion des employés + leaderboard gamifié, statistiques (évolution, catégories, heatmap horaire), commandes de supports physiques, onglet **Facturation** (grille comparative des plans, paiement Stripe, historique), paramètres (logo, alertes) |
| **Superadmin** | Vue plateforme (MRR, commerçants, retours), gestion des plans, workflow des commandes (À imprimer → Imprimé → Expédié → Livré) + bon d'impression PDF |
| **Plateforme** | Emails transactionnels (bienvenue, commande, alerte, récap hebdo), SMS d'alerte (note ≤ 2★), cron hebdomadaire, pages légales RGPD (mentions légales, CGU, confidentialité, cookies) |

## 🧰 Stack technique

- **Next.js 16** (App Router) + **TypeScript** strict
- **Tailwind CSS 4** + **shadcn/ui** (palette : bleu `#2563EB` + blanc + gris)
- **Prisma ORM** + **SQLite** (sandbox — compatible PostgreSQL/Supabase en production)
- **Authentification** : sessions en base + cookie **httpOnly** + hachage **bcrypt**
- **recharts** (graphiques), **qrcode** (génération PNG), **jsPDF** (affiches/impression)
- **framer-motion** (animations), **zustand** (état client), **zod** (validation partagée)
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
> Aucune fonctionnalité n'est bloquée sans clés.

## 🔑 Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | ✅ | Connexion base de données (SQLite local ou PostgreSQL production) |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL publique (liens emails/SMS, redirections Stripe, QR codes) |
| `TWILIO_SID` / `TWILIO_TOKEN` / `TWILIO_PHONE` | — | Alertes SMS réelles (note ≤ 2★) via l'API REST Twilio |
| `RESEND_API_KEY` / `EMAIL_FROM` | — | Emails transactionnels via l'API Resend |
| `STRIPE_SECRET_KEY` | — | Abonnements (Checkout Session + webhooks) |
| `STRIPE_WEBHOOK_SECRET` | — | Vérification de signature du webhook `/api/webhooks/stripe` |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` | — | Price IDs récurrents (19 € et 79 € / mois) |
| `CRON_SECRET` | — | Protège `GET /api/cron/recap-weekly` (header `Authorization: Bearer`) |

Le détail des instructions de création (Twilio, Resend, Price IDs Stripe) est commenté
directement dans [`.env.example`](.env.example).

## 🔑 Comptes de démonstration

| Rôle | Email | Mot de passe | Détails |
|---|---|---|---|
| 👑 Superadmin | `admin@feedbackpro.fr` | `admin123` | Accès à la vue plateforme complète |
| 🍕 Commerçant (Pro) | `demo@pizzeria.fr` | `demo1234` | Pizzeria Bella Napoli · plan PRO · 64 retours · 4 employés |
| 💇 Commerçant (Starter) | `contact@salon-elegance.fr` | `demo1234` | Salon Élégance · plan STARTER (paywall équipe) |
| 🥖 Commerçant (Pro) | `bonjour@paindor.fr` | `demo1234` | Boulangerie Pain d'Or · Marseille |

> Le **QR code de démo** de chaque commerçant est visible dans l'onglet « QR code » de son
> dashboard. L'URL de scan publique est de la forme `/?scan=<qrToken>` (ou `/r/<qrToken>`).

## 📁 Structure du projet

```
prisma/
  schema.prisma        # Modèles : User, Session, Pro, Boutique, Employe, Retour, Commande, Alerte, Setting
  seed.ts              # Données de démonstration (bun run db:seed)
src/
  app/
    page.tsx           # Application monopage (SPA) : landing · auth · onboarding · scan · dashboards
    mentions-legales/  # Pages légales réelles (S6) : /mentions-legales · /cgu
    cgu/               #   /confidentialite · /cookies — RGPD, lien « Retour », footer croisé
    confidentialite/
    cookies/
    globals.css        # Thème bleu #2563EB (variables Tailwind/shadcn)
    api/
      auth/            # register (+ email de bienvenue) · login · logout · me
      public/          # scan (GET ?token) · retour (POST — cœur du produit)
      retour/          # Endpoint canonique des retours (alerte SMS/email si note ≤ 2)
      pro/             # overview · retours · employés · leaderboard · qrcode · stats
                       # · commandes (+ email de confirmation) · plan · billing/checkout
      webhooks/stripe/ # Webhook signé : checkout.session.completed, customer.subscription.*
      cron/            # recap-weekly (protégé par CRON_SECRET, récap hebdo)
      admin/           # overview (MRR…) · pros · commandes (workflow + PDF)
  components/
    ui/                # Composants shadcn/ui
    feedbackpro/       # landing · auth · onboarding · scan · dashboards · billing-tab · legal-layout
  lib/
    db.ts              # Client Prisma (singleton)
    session.ts         # Sessions en base + cookie httpOnly + helpers ok()/fail()
    guards.ts          # requirePro / requireAdmin (équivalent middleware)
    constants.ts       # Plans (PLANS, PLAN_LIMITS), tarifs supports, tags, libellés
    validation.ts      # Schémas zod partagés client/serveur
    twilio.ts          # sendSMS() — API REST Twilio (mode démo sans clés)
    email.ts           # sendEmail() + 4 templates HTML (Resend, mode démo sans clés)
    whatsapp.ts        # Construction du message WhatsApp structuré
    pdf.ts             # Affiche A4, planche d'étiquettes 5×5 cm, bon de commande
  store/
    app-store.ts       # État global (zustand) : vue courante, session, token de scan
vercel.json            # Cron : /api/cron/recap-weekly chaque lundi 8h UTC
```

## 🔐 Authentification & protection des routes

- Mots de passe hachés avec **bcrypt** (10 rounds) — jamais stockés en clair.
- La connexion crée une **Session en base** (30 jours) référencée par un cookie
  **httpOnly + SameSite=Lax** (`fp_session`) : le token de session est inaccessible en JavaScript.
- La protection des zones privées est assurée **côté serveur** par les guards
  `requirePro()` (dashboard commerçant) et `requireAdmin()` (superadmin) sur **chaque route API** :
  c'est la véritable barrière de sécurité. Le middleware Edge vérifie en amont la présence du
  cookie pour `/dashboard/*` et `/superadmin/*`.
- Ce choix (sessions en base plutôt que NextAuth/JWT) garantit la **révocation immédiate**
  des sessions et une compatibilité totale avec le déploiement monopage de l'environnement.

## 📡 API — conventions

Toutes les réponses suivent le format `{ ok: true, data }` ou `{ ok: false, error }`.

| Verbe + route | Auth | Description |
|---|---|---|
| `POST /api/auth/register` | — | Inscription commerçant + **email de bienvenue** |
| `POST /api/auth/login` | — | Connexion → cookie de session |
| `POST /api/auth/logout` | ✓ | Déconnexion (session révoquée) |
| `GET /api/auth/me` | ✓ | Utilisateur courant |
| `GET /api/public/scan?token=` | — | Infos commerce pour la page de scan |
| `POST /api/retour` (`/api/public/retour` alias) | — | Enregistre un retour (+ alerte **SMS/email** si note ≤ 2) |
| `GET /api/pro/overview` | PRO | KPIs dashboard |
| `GET /api/pro/retours` · `PATCH` | PRO | Liste / statut / réponse / lu |
| `GET /api/pro/retours/export` | PRO | Export CSV |
| `GET /api/pro/qrcode` | PRO | QR code PNG (dataURL 900 px) |
| `GET /api/pro/leaderboard` | PRO+ | Classement employés + recommandations |
| `GET/POST /api/pro/commandes` | PRO | Commandes de supports (+ **email de confirmation**) |
| `POST /api/pro/plan` | PRO | Changement de plan (paiement simulé en mode démo) |
| `POST /api/pro/billing/checkout` | PRO | Checkout Stripe (ou `{ mode: "DEMO" }` sans clés) |
| `POST /api/webhooks/stripe` | Signature | Webhook Stripe (plans synchronisés via `metadata.proId`) |
| `GET /api/cron/recap-weekly` | Bearer | Récap hebdomadaire (count, note moyenne, alertes) par commerçant |
| `GET /api/admin/overview` | SUPERADMIN | MRR, commerçants, commandes |
| `PATCH /api/admin/commandes` | SUPERADMIN | Workflow de statut |

## 🔌 Intégrations optionnelles (mode démo sans clés)

### SMS — Twilio (`src/lib/twilio.ts`)
`sendSMS(to, message)` appelle l'API REST Twilio (`fetch` + Basic auth, sans SDK). Sans
`TWILIO_SID`/`TWILIO_TOKEN`/`TWILIO_PHONE` : le message est loggé (`📱 SMS simulé (mode démo)`)
et la fonction renvoie `true`. Utilisé pour l'alerte réclamation (note ≤ 2★) envoyée au
WhatsApp du commerçant, avec **fallback email** si le SMS est désactivé (`smsAlertes: false`)
ou sans numéro configuré.

### Emails — Resend (`src/lib/email.ts`)
`sendEmail(to, sujet, html)` appelle l'API Resend. Sans `RESEND_API_KEY` : log
(`📧 Email simulé (mode démo)`) + `true`. Quatre templates HTML inline-CSS responsives
(design bleu #2563EB) : `emailBienvenue`, `emailConfirmationCommande`, `emailAlerteRetour`,
`emailRecapHebdo`. Tous les envois sont **non bloquants** : un échec n'interrompt jamais
l'inscription, la commande, le retour client ni le cron.

### Paiements — Stripe
- `POST /api/pro/billing/checkout { plan }` : crée une **Checkout Session** (mode subscription)
  avec `metadata.proId` + `metadata.plan`, `success_url /dashboard/billing?paiement=succes`,
  `cancel_url /dashboard/billing`. Sans `STRIPE_SECRET_KEY` → `{ ok, data: { mode: "DEMO" } }`
  (l'onglet Facturation applique le plan localement).
- `POST /api/webhooks/stripe` : vérifie la signature (`constructEvent`) puis synchronise les
  plans via `metadata.proId` — **aucune colonne Stripe en base**. Événements gérés :
  `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
  (retour Starter), `invoice.*` (log).
- Créer les Price IDs : Dashboard Stripe → Produits → 2 abonnements mensuels
  (Pro 19 €, Enterprise 79 €) → copier `price_xxx` dans `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE`.
- En local : `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

### Cron — récap hebdomadaire
`GET /api/cron/recap-weekly` (protégé par `Authorization: Bearer $CRON_SECRET`, 501 si absent)
agrège les retours des 7 derniers jours par commerçant (volume, note moyenne, alertes ≤ 2★)
et envoie `emailRecapHebdo`. Planifié par **Vercel Cron** chaque lundi 8h UTC (`vercel.json`).
Test local :
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/recap-weekly
```

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
2. **Project Settings → Database → Connection string → URI** : copier l'URL
   `postgresql://postgres.<ref>:<password>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres`.
3. Dans `prisma/schema.prisma`, passer `provider = "postgresql"`, puis restaurer les
   `enum` Prisma (`Role`, `Plan`, `Statut`, `TypeSupport`, `StatutCommande`) et `tags String[]`
   (contraintes SQLite levées en production).
4. Appliquer le schéma : `DATABASE_URL="postgresql://..." bunx prisma db push` puis
   `bun run db:seed` (optionnel, données de démo).

### 2. Déploiement Vercel
1. Pousser le dépôt sur GitHub puis « Import Project » sur [vercel.com](https://vercel.com).
2. Renseigner les variables d'environnement (Settings → Environment Variables) :
   `DATABASE_URL`, `NEXT_PUBLIC_APP_URL=https://<votre-domaine>` et, optionnels :
   clés Twilio / Resend / Stripe / `CRON_SECRET`.
3. Déployer. Le cron du récap hebdo (`vercel.json`) s'active automatiquement
   (Vercel Cron est inclus au plan Hobby avec un cron/jour ; plan Pro pour plus).
4. Webhook Stripe : Dashboard Stripe → Developers → Webhooks → endpoint
   `https://<votre-domaine>/api/webhooks/stripe` → sélectionner les événements
   `checkout.session.completed`, `customer.subscription.*`, `invoice.*` → copier le
   `whsec_...` dans `STRIPE_WEBHOOK_SECRET`.
5. Vérifier ensuite : `https://<votre-domaine>/api/cron/recap-weekly` renvoie
   `401` sans le bon Bearer (normal), et la page `/mentions-legales` s'affiche.

---

## 🗺️ Roadmap

- [x] **S1-S2** — MVP : scan, retours, dashboard commerçant, auth session
- [x] **S3** — QR codes téléchargeables, supports physiques, commandes
- [x] **S4** — Sidebar dashboard, retours avancés (timeline), gamification équipe, stats + PDF
- [x] **S5** — Superadmin (MRR, workflow commandes, suspension), Settings (logo, zone dangereuse), Setting store
- [x] **S6** — Production-ready : pages légales RGPD, SMS Twilio, emails Resend, onglet Facturation, Stripe (checkout + webhooks), cron récap hebdo
- [ ] Multi-boutiques Enterprise (choix de la boutique au scan)
- [ ] Réponses aux retours par email (boucle client)
- [ ] Application mobile PWA installable
- [ ] Intégration Google Business API (avis publics)
- [ ] Facturation automatique (PDF mensuels Stripe)

---

© FeedbackPro — [Mentions légales](/mentions-legales) · [CGU](/cgu) · [Confidentialité](/confidentialite) · [Cookies](/cookies)
