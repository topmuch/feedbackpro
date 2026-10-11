# 🚀 FeedbackPro

Plateforme SaaS B2B qui permet aux commerces (restaurants, salons, boutiques…) de collecter des
retours clients via QR codes : le client scanne, note son expérience de 1 à 5 ★, et selon la note
il est **redirigé vers Google (avis public)** ou vers **WhatsApp (réclamation privée au gérant)**.

---

## ✨ Fonctionnalités

| Rôle | Fonctionnalités |
|---|---|
| **Client final** (sans compte) | Scan QR → note 1-5 ★ → tags → commentaire → envoi WhatsApp ou avis Google |
| **Commerçant (PRO)** | Dashboard KPIs (note moyenne, taux d'interception), liste des retours + réponses + export CSV, QR code téléchargeable (PNG / affiche A4 / planche d'étiquettes), gestion des employés + leaderboard gamifié, statistiques (évolution, catégories, heatmap horaire), commandes de supports physiques, abonnement Starter/Pro/Enterprise |
| **Superadmin** | Vue plateforme (MRR, commerçants, retours), gestion des plans, workflow des commandes (À imprimer → Imprimé → Expédié → Livré) + bon d'impression PDF |

## 🧰 Stack technique

- **Next.js 16** (App Router) + **TypeScript** strict
- **Tailwind CSS 4** + **shadcn/ui** (palette : bleu `#2563EB` + blanc + gris)
- **Prisma ORM** + **SQLite** (sandbox — compatible PostgreSQL/Supabase en production)
- **Authentification** : sessions en base + cookie **httpOnly** + hachage **bcrypt**
- **recharts** (graphiques), **qrcode** (génération PNG), **jsPDF** (affiches/impression)
- **framer-motion** (animations), **zustand** (état client)

## ⚙️ Installation

```bash
# 1. Installer les dépendances
bun install

# 2. Configurer l'environnement
cp .env.example .env

# 3. Créer / mettre à jour la base de données
bun run db:push

# 4. Peupler la base avec des données de démonstration
bun run db:seed

# 5. Lancer le serveur de développement
bun run dev
```

L'application est disponible sur **http://localhost:3000**.

## 🔑 Comptes de démonstration

| Rôle | Email | Mot de passe | Détails |
|---|---|---|---|
| 👑 Superadmin | `admin@feedbackpro.fr` | `admin123` | Accès à la vue plateforme complète |
| 🍕 Commerçant (Pro) | `demo@pizzeria.fr` | `demo1234` | Pizzeria Bella Napoli · plan PRO · 64 retours · 4 employés |
| 💇 Commerçant (Starter) | `contact@salon-elegance.fr` | `demo1234` | Salon Élégance · plan STARTER (paywall équipe) |
| 🥖 Commerçant (Pro) | `bonjour@paindor.fr` | `demo1234` | Boulangerie Pain d'Or · Marseille |

> Le **QR code de démo** de chaque commerçant est visible dans l'onglet « QR code » de son
> dashboard. L'URL de scan publique est de la forme `/?scan=<qrToken>`.

## 📁 Structure du projet

```
prisma/
  schema.prisma        # Modèles : User, Session, Pro, Boutique, Employe, Retour, Commande, Alerte
  seed.ts              # Données de démonstration (bun run db:seed)
src/
  app/
    page.tsx           # Application monopage (SPA) : landing · auth · onboarding · scan · dashboards
    globals.css        # Thème bleu #2563EB (variables Tailwind/shadcn)
    api/
      auth/            # register · login · logout · me
      public/          # scan (GET ?token) · retour (POST — cœur du produit)
      pro/             # overview · retours · export CSV · employés · leaderboard · qrcode · stats · commandes · plan · onboarding
      admin/           # overview (MRR…) · pros · commandes (workflow + PDF)
  components/
    ui/                # Composants shadcn/ui
    feedbackpro/       # landing · auth · onboarding · scan · dashboards pro/admin · onglets
  lib/
    db.ts              # Client Prisma (singleton)
    session.ts         # Sessions en base + cookie httpOnly + helpers ok()/fail()
    guards.ts          # requirePro / requireAdmin (équivalent middleware)
    constants.ts       # Plans, tarifs supports, tags, libellés
    whatsapp.ts        # Construction du message WhatsApp structuré
    pdf.ts             # Affiche A4, planche d'étiquettes 5×5 cm, bon de commande
  store/
    app-store.ts       # État global (zustand) : vue courante, session, token de scan
```

## 🔐 Authentification & protection des routes

- Mots de passe hachés avec **bcrypt** (10 rounds) — jamais stockés en clair.
- La connexion crée une **Session en base** (30 jours) référencée par un cookie
  **httpOnly + SameSite=Lax** (`fp_session`) : le token de session est inaccessible en JavaScript.
- La protection des zones privées est assurée **côté serveur** par les guards
  `requirePro()` (dashboard commerçant) et `requireAdmin()` (superadmin) sur **chaque route API** :
  c'est la véritable barrière de sécurité. Côté client, la SPA redirige vers la connexion
  si la session est absente (équivalent du middleware `withAuth` de NextAuth).
- Ce choix (sessions en base plutôt que NextAuth/JWT) garantit la **révocation immédiate**
  des sessions et une compatibilité totale avec le déploiement monopage de l'environnement.

## 📡 API — conventions

Toutes les réponses suivent le format `{ ok: true, data }` ou `{ ok: false, error }`.

| Verbe + route | Auth | Description |
|---|---|---|
| `POST /api/auth/register` | — | Inscription commerçant (email, mot de passe, commerce) |
| `POST /api/auth/login` | — | Connexion → cookie de session |
| `POST /api/auth/logout` | ✓ | Déconnexion (session révoquée) |
| `GET /api/auth/me` | ✓ | Utilisateur courant |
| `GET /api/public/scan?token=` | — | Infos commerce pour la page de scan |
| `POST /api/public/retour` | — | Enregistre un retour (+ alerte si note ≤ 2) |
| `GET /api/pro/overview` | PRO | KPIs dashboard |
| `GET /api/pro/retours` · `PATCH` | PRO | Liste / statut / réponse / lu |
| `GET /api/pro/retours/export` | PRO | Export CSV |
| `GET /api/pro/qrcode` | PRO | QR code PNG (dataURL 900 px) |
| `GET /api/pro/leaderboard` | PRO+ | Classement employés + recommandations |
| `POST /api/pro/commandes` | PRO | Commande de supports (stickers, chevalet, affiche) |
| `GET /api/admin/overview` | SUPERADMIN | MRR, commerçants, commandes |
| `PATCH /api/admin/commandes` | SUPERADMIN | Workflow de statut |

## 📜 Scripts disponibles

| Commande | Description |
|---|---|
| `bun run dev` | Serveur de développement (port 3000) |
| `bun run lint` | Vérification ESLint |
| `bun run db:push` | Applique le schéma Prisma à la base |
| `bun run db:seed` | Peuple la base avec les données de démo |
| `bun run db:generate` | Régénère le client Prisma |

## 🚢 Passage en production (Supabase / Vercel)

1. Créer un projet **Supabase** (PostgreSQL) et récupérer l'URL de connexion.
2. Dans `prisma/schema.prisma`, passer `provider = "postgresql"` puis restaurer les
   `enum` Prisma (`Role`, `Plan`, `Statut`, `TypeSupport`, `StatutCommande`) et `tags String[]`
   (contraintes SQLite levées en production).
3. `bunx prisma db push` puis `bun run db:seed`.
4. Déployer sur **Vercel** avec la variable d'environnement `DATABASE_URL`.

---

© FeedbackPro — Mentions légales et CGU disponibles depuis le pied de page de l'application.
