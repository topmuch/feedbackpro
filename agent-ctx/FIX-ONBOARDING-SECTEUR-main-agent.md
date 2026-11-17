# FIX-ONBOARDING-SECTEUR — Onboarding tenant + Config secteurs

**Task ID**: `FIX-ONBOARDING-SECTEUR`
**Agent**: main-agent (Z.ai Code)
**Date**: 2025-01

## Contexte

Deux problèmes à corriger dans `/home/z/my-project` :

1. **Onboarding tenant invisible** : le `TenantSelectionStep` ne s'affichait
   jamais pour l'admin existant (`admin@feedbackpro.fr`, `tenantType: "classic"`,
   `justRegistered: false`), et des erreurs TypeScript dans `src/app/page.tsx`
   (ligne 232) cassaient le narrowing du type `View`.

2. **Config secteurs obsolète** : l'onglet "Config secteurs" du dashboard
   admin n'affichait que les anciens secteurs (restaurant, aéroport, hôtel…)
   sans montrer les nouveaux types de tenant (airport / airline / vip_lounge)
   ni les zones associées.

## Fichiers modifiés

### 1. `src/app/page.tsx`
- Import du type `View` depuis `@/store/app-store`.
- Création d'une constante `FOOTER_VIEWS: ReadonlySet<View>` contenant
  `["auth", "dashboard", "admin", "airport-ops"]` — les vues qui doivent
  afficher `AppFooter`.
- Remplacement de la comparaison `view !== "scan" && view !== "airport" && ...`
  (qui cassait le narrowing TS après les early returns des vues plein écran)
  par `{FOOTER_VIEWS.has(view) && <AppFooter />}`.
- Résout les 3 erreurs TS2367 sur la ligne 232.

### 2. `src/components/feedbackpro/vip-dashboard.tsx`
- Import de `useRef` depuis React (manquant).
- Correction du bug `notifiedRef` qui utilisait `useState<Set<string>>()[0]`
  au lieu de `useRef<Set<string>>(new Set())` → `.current` n'existait pas.
- Résout les 2 erreurs TS2339 sur `notifiedRef.current`.

### 3. `src/store/app-store.ts` — `deriveView()`
- Réordonné les checks : `justRegistered` est maintenant vérifié **AVANT**
  le rôle `SUPERADMIN`, pour qu'un admin puisse déclencher la sélection
  tenant via le bouton "Changer de tenant" du dashboard.
- Ajout d'une normalisation `.toLowerCase()` sur `tenantType` pour tolérer
  les valeurs en majuscules/minuscules variables.
- Ajout du fallback `'vip'` (alias court de `vip_lounge`).
- Documentation exhaustive des 5 étapes de routage et des 4 types de tenant.
- Tous les tenant types sont pris en charge : airport / airline / vip_lounge /
  classic (+ fallback sûr pour valeur inconnue → `dashboard`).

### 4. `src/components/feedbackpro/admin-dashboard.tsx`
#### 4a. Bouton "Changer de tenant" (top bar)
- Ajout des hooks `setJustRegistered` et `setView` depuis `useAppStore`.
- Fonction `changerTenant()` : pose `justRegistered=true` + `setView("onboarding-tenant")`
  en safety net + toast de confirmation.
- Nouveau bouton `<Button variant="outline" size="sm">` avec icône `Building2`
  dans la top bar (visible `sm+`), `title` affichant le tenant courant.
- Permet au superadmin (tenant classic par défaut) de tester le flux
  `TenantSelectionStep` → `POST /api/auth/tenant` → `refreshSession()`.

#### 4b. SecteursTab — Nouvelle section "Types d'établissement (Tenants)"
- Imports ajoutés : `AIRPORT_ZONES`, `getZonesByTenant`, type
  `AirportZoneConfig` depuis `@/lib/airport-config`.
- Nouvelle `<Card>` insérée en haut du `SecteursTab`, avant le sélecteur
  de secteurs existant, avec un titre `Plane` "Types d'établissement
  (Tenants)" et une `CardDescription` expliquant le routage.
- 4 sous-sections rendues via `TenantZonesSection` (nouveau composant) :
  - ✈️ **Aéroport** (tenant `airport`) — 17 zones + 5 zones legacy
    (bagages, sanitaires, files_attente, embarquement, restauration — sans
    `tenantType`, affichées par rétro-compat côté airport).
  - 🛫 **Compagnie Aérienne** (tenant `airline`) — 4 zones
    (`term_embarq`, `term_checkin`, `airline_baggage_office`,
    `airline_waiting_room`).
  - 🥂 **Salon VIP** (tenant `vip_lounge`) — 6 zones
    (`com_lounge` déplacée depuis commercial + 5 nouvelles : `vip_buffet`,
    `vip_relaxation`, `vip_showers`, `vip_reception`, `vip_meeting`).
  - 🏪 **Commerce classique** — récapitulatif avec le nombre de secteurs
    historiques chargés depuis `/api/admin/secteurs` (pas de zones
    aéroport dédiées — lien vers le sélecteur ci-dessous).

#### 4c. Nouveau composant `TenantZonesSection`
- Défini juste après `SecteursTab` (ligne ~4832).
- Props : `tenant`, `emoji`, `titre`, `description`, `accent` (classes
  Tailwind pour border + bg).
- Récupère les zones via `getZonesByTenant(tenant)` + (pour airport
  uniquement) les zones legacy sans `tenantType`.
- Affiche : header avec emoji + titre + badge `MapPin` compteur de zones,
  puis une grille scrollable (`max-h-72 overflow-y-auto admin-sidebar-nav`)
  des zones : emoji + nom + code métier en mono.
- Table `ZONES_DEPLACEES` : map code → `{from, to, label}` pour les zones
  historiques reclassées (check-in / embarquement → airline, com_lounge →
  vip_lounge) et les nouvelles zones airline/vip. Badge ambre "déplacé" ou
  "nouveau" affiché sur ces zones avec `title` détaillant l'origine.

## Vérifications

### TypeScript
```bash
bunx tsc --noEmit 2>&1 | head -10
# → EXIT 0, aucune erreur
```

### ESLint
Les 5 erreurs restantes sont **pré-existantes** dans des fichiers non
modifiés par cette tâche :
- `prisma/seed-airport-ops-config.cjs` (require)
- `scripts/create-admin.cjs` (require ×2)
- `src/components/feedbackpro/language-selector.tsx` (document.cookie)
- `src/components/feedbackpro/scratch-card.tsx` (var reassignment)
- `src/lib/db.ts` (unused eslint-disable warning)

Aucune erreur introduite dans les fichiers modifiés.

### Upload route
`src/app/api/public/upload/route.ts` est **présent** et intact
(POST handler FormData → writeFile dans `data/uploads/`, validation MIME +
extension + taille 10 Mo max).

### Dev log
Aucune nouvelle erreur 500 / compile error après les modifications
(`GET / 200`, `GET /api/auth/me 200` visibles en queue de `dev.log`).

## Contraintes respectées

- ✓ Code existant lu avant modification (app-store, page.tsx, admin-dashboard,
  airport-config, auth-view, vip-dashboard, upload route).
- ✓ Système d'authentification SHA256 (`src/lib/auth.ts`, `src/lib/crypto.ts`)
  non touché — ni `/api/auth/login`, ni `/api/auth/register`, ni
  `/api/auth/me` modifiés.
- ✓ Dashboard admin fonctionnel — seuls ajouts (bouton top bar + section
  SecteursTab), aucun retrait.
- ✓ `'use client'` présent en tête de `page.tsx`, `admin-dashboard.tsx`,
  `app-store.ts`, `vip-dashboard.tsx`, `auth-view.tsx`.
- ✓ Tous les fetch utilisent des chemins relatifs (`/api/admin/secteurs`,
  `/api/auth/tenant`, `/api/auth/me`, etc.).
- ✓ Aucun code de test écrit.
- ✓ `bunx tsc --noEmit` sort propre (0 erreur).
- ✓ `src/app/api/public/upload/route.ts` existe toujours.

## Points d'attention / Questions ouvertes

- Le bouton "Changer de tenant" change **réellement** le `tenantType` de
  l'admin en BDD via `POST /api/auth/tenant`. Si l'admin choisit "airline"
  puis se reconnecte, il sera routé vers `AirlineDashboard` (pas l'admin
  dashboard). Pour revenir en mode superadmin, il faut :
  1. Soit appeler `POST /api/auth/tenant` avec `tenantType: "classic"` (via
     un autre clic sur le bouton "Changer de tenant" s'il est accessible),
  2. Soit éditer la colonne `User.tenantType` en BDD à la main.
  Pas de bouton "annuler" dans le `TenantSelectionStep` actuellement (la
  seule sortie est logout). Amélioration future possible : ajouter un bouton
  "Retour admin" visible quand `session.user.role === "SUPERADMIN"`.

- Le composant `TenantZonesSection` utilise la classe CSS `admin-sidebar-nav`
  pour la scrollbar stylée (déjà définie dans `globals.css` pour la sidebar
  admin). Si cette classe est renommée un jour, la scrollbar des listes de
  zones perdra son style — mais restera fonctionnelle (scroll natif).

- La table `ZONES_DEPLACEES` est hardcodée dans `admin-dashboard.tsx`.
  Idéalement elle devrait vivre dans `src/lib/airport-config.ts` à côté
  d'`AIRPORT_ZONES` pour rester cohérente avec la source de vérité.
  Laissé en l'état pour limiter le blast radius du fix.
