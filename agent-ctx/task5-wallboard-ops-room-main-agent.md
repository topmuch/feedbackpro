# Task 5 — Wallboard Ops Room Aéroport

## Objectif
Construire une page wallboard plein écran (TV en salle ops aéroport) +
l'API agrégée qui l'alimente. Affichage temps réel, thème sombre
distinct du reste de l'app (slate-950 + emerald/amber/rose/sky,
PAS le bleu FeedbackPro `text-[#002e85]`).

## Fichiers livrés

### 1. `src/app/api/airport/wallboard/route.ts` (214 lignes)
Route API publique (no-auth) agrégeant les données wallboard :
- `export const runtime = 'nodejs'`
- `export const dynamic = 'force-dynamic'`
- Charge tous les `AirportReport` des dernières **48h** (1 requête
  `findMany` avec `include: { zone }`), agrège côté JS.
- Sortie enveloppe `ok(data)` conforme au contrat spécifié :
  - `stats` : total_24h, en_attente, en_cours, resolus_24h,
    avg_resolution_minutes (null si aucun échantillon résolu valide)
  - `zones` : 5 zones ordonnées par `count_en_attente` desc, avec
    `count_24h`, `count_prev_24h` (pour trend), `last_report_at`,
    `trend` ("up"|"down"|"stable" comparaison last 24h vs prev 24h)
  - `top_zones` : top 3 par count_24h
  - `recent_reports` : 10 derniers signalements (id, zone, tagScanne,
    problemType, statut, photoCategory, routedTeam, createdAt)
  - `by_team` : buckets nettoyage/maintenance/securite/accueil/other
- Robustesse : fallback sur `AIRPORT_ZONES` (config statique) si une
  zone remontée par la BDD n'est pas dans la config ; filtrage des
  `resolvedAt < createdAt` (données incohérentes) pour l'avg.

### 2. `src/app/ops-wallboard/page.tsx` (595 lignes)
Page client Next.js App Router (vraie page, pas de rewrite) :
- `"use client"` — composant React unique
- Layout 100vh `flex flex-col overflow-hidden bg-slate-950` :
  - **Top bar h-16** : titre `✈️ AÉROPORT OPS — WALLBOARD` (font-mono
    font-bold), horloge centre (HH:MM:SS tabular-nums + date FR),
    indicateur `LIVE` (pastille verte pulsante) ou `ERREUR` (rouge)
  - **Main grid lg:grid-cols-12** (flex-1, min-h-0, overflow-hidden
    sur lg+) :
    - Colonne gauche `lg:col-span-3` : 4 `StatCard` (Signalements 24h
      emerald, En attente amber+pulse si >0, En cours sky, Résolus 24h
      emerald + temps moyen)
    - Colonne centre `lg:col-span-6` : 5 `ZoneRow` (emoji+nom, barre
      horizontale colorée par sévérité : rose si >5, amber si >0, slate
      si 0, badge "X en attente", trend arrow ↗/↘/→, temps relatif
      "il y a 3 min")
    - Colonne droite `lg:col-span-3` : 5 `TeamBar` (nettoyage emerald,
      maintenance amber, securite rose, accueil sky, autre slate) triées
      par count desc
  - **Bottom strip h-64** : feed horizontal scrollable de 10 `FeedCard`
    (zone emoji+nom, tagScanne, problemType, statut badge, photoCategory
    badge fuchsia si présent, routedTeam badge si présent, temps relatif)
- Comportement :
  - Poll `GET /api/airport/wallboard` toutes les **5 s** (setInterval,
    cleanup unmount, premier poll différé via setTimeout 0 pour
    respecter la règle `react-hooks/set-state-in-effect`)
  - Horloge `setInterval` 1 s, cleanup unmount
  - Détection nouveaux reports : `seenIdsRef` Set + flag `freshIds`
    (Set d'IDs nouveaux). Anim `animate-in fade-in slide-in-from-top-2
    duration-500` (tw-animate-css) rejouée uniquement sur les nouveaux
    IDs. Premier rendu = pas d'animation (sinon vague sur les 10 cards).
    Reset `freshIds` après 1.5 s pour ne pas rejouer au re-render.
  - Loading skeleton (StatSkeleton + ZoneSkeleton) sur premier poll
  - `tabular-nums` partout sur les nombres, font-mono sur stats
  - Responsive : `lg:overflow-hidden` désactivé sous lg → scroll
    vertical naturel ; sur petits écrans les colonnes s'empilent
  - Scrollbar discret injecté via `<style>{`...`}</style>` inline
- Helpers typés stricts (pas de `any`) :
  - `WallboardData`, `ZoneAgg`, `RecentReport`, `TeamKey`, `Trend`
  - `relativeTime`, `formatClock`, `formatDateFR`, `formatDuration`
  - `STATUT_META`, `TEAM_META`, `trendMeta`, `severityBarClass`,
    `statutMeta` (avec fallback pour statuts inconnus)
- Imports : `useCallback`, `useEffect`, `useMemo`, `useRef`, `useState`
  ; aucune dépendance externe (pas de shadcn component réutilisé
  volontairement — wallboard très spécifique, markup inline plus clair).

## Vérifications (toutes au vert)

### TypeScript
```
$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -E "src/app/ops-wallboard|src/app/api/airport/wallboard"
(no output — 0 erreur sur les fichiers livrés)
```
Les autres erreurs tsc remontées (retours/route.ts, login/route.ts,
scripts/seed.ts) sont préexistantes et hors périmètre de cette task.

### ESLint
```
$ bunx eslint src/app/ops-wallboard/page.tsx src/app/api/airport/wallboard/route.ts
(no output — 0 erreur, 0 warning)
```
Fix appliqué en cours de route : `void poll()` direct dans le body du
`useEffect` déclenchait `react-hooks/set-state-in-effect`. Solution :
`setTimeout(() => void poll(), 0)` pour le premier poll, setInterval
pour les suivants. Cleanup des deux timers.

### Endpoint API
```
$ curl -s http://localhost:3000/api/airport/wallboard
{"ok":true,"data":{"stats":{"total_24h":6,"en_attente":4,"en_cours":1,
"resolus_24h":1,"avg_resolution_minutes":null},
"zones":[...5 zones...],"top_zones":[...3...],
"recent_reports":[...6...],
"by_team":{"nettoyage":0,"maintenance":0,"securite":0,"accueil":0,
"other":6}}}
```
Tous les champs du contrat sont présents et correctement typés.
`avg_resolution_minutes = null` ici car le seul report RESOLU en base a
`resolvedAt < createdAt` (données de test incohérentes) — filtré
délibérément par l'API (ms >= 0).

### Endpoint page
```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ops-wallboard
200
$ curl -s http://localhost:3000/ops-wallboard | grep -oE "WALLBOARD|AÉROPORT OPS"
AÉROPORT OPS
WALLBOARD
```

### dev.log
Aucune erreur de compilation, uniquement des `GET /ops-wallboard 200`
et `GET /api/airport/wallboard 200`. Les erreurs résiduelles dans
dev.log (`EADDRINUSE`, `[airport-bot]` TypeError) sont préexistantes et
sans rapport avec cette task.

## Décisions d'implémentation

1. **Pas de `groupBy` Prisma** : SQLite + Prisma a des limitations sur
   `groupBy` avec filtres temporels complexes. Plus simple et plus
   rapide de tout charger (max ~48h de reports = petit volume) puis
   d'agréger en JS en une passe O(n).

2. **Fenêtre 48h pour trend** : on charge `createdAt >= now - 48h` pour
   pouvoir comparer last 24h vs previous 24h. Si trend = "up", il y a
   plus de signalements que la veille (alerte opérationnelle) ;
   affiché en rouge (↗). Si "down" → vert (↘). Si "stable" → gris (→).

3. **Pas d'auth sur l'API** : le cahier des charges dit "public route
   (no auth) — URL partagée avec ops team". Conformément, pas de
   `getSessionUser`, pas de check rôle.

4. **Pas de rewrite next.config** : étape 3 du brief explicite "Skip
   this step" — `/ops-wallboard` est une vraie page App Router, pas une
   route SPA. Aucun changement à `next.config.ts`.

5. **Composants inline vs shadcn** : le wallboard est très spécifique
   (cartes métriques custom, barres de heat, feed horizontal). Réutiliser
   `Card` shadcn aurait ajouté du padding/margin mal venu pour un layout
   TV pixel-perfect. Markup inline en `div` Tailwind, plus clair à
   maintenir pour ce cas.

6. **Animations tw-animate-css** : la lib est déjà importée dans
   `globals.css` (`@import "tw-animate-css"`). On réutilise ses classes
   `animate-in fade-in slide-in-from-top-2 duration-500` plutôt que de
   définir des keyframes custom.

7. **Pas de z.ai SDK / pas de WebSocket** : le brief spécifie explicitement
   polling 5 s. Pas besoin de mini-service socket.io pour ce cas
   d'usage (TV passive, latence 5 s acceptable).

## Architecture - relations avec le reste du projet

- Réutilise `db` depuis `src/lib/db.ts` (instance Prisma partagée)
- Réutilise `ok` depuis `src/lib/session.ts` (enveloppe normalisée)
- Réutilise `AIRPORT_ZONES` depuis `src/lib/airport-config.ts` (fallback
  metadata zones si zone BDD absente ou incomplète)
- Cohérent avec les routes aéroport existantes :
  - `GET /api/airport/zone/[tag]` (résolution tag → zone)
  - `POST /api/airport/report` (création signalement)
  - `GET /api/airport/reports` (liste filtrée, vue ops détaillée)
  - `POST /api/airport/whatsapp-optin` (opt-in notification voyageur)
  - **`GET /api/airport/wallboard`** (NOUVEAU — agrégation TV)

## Comment visualiser
1. Le dev server tourne sur port 3000.
2. Le wallboard est accessible sur la route native Next.js :
   `GET /ops-wallboard` (HTTP 200).
3. Il faut l'ouvrir via le Preview Panel (côté droit de l'interface) ou
   le bouton "Open in New Tab" — ne PAS pointer vers `localhost:3000`
   directement (non accessible depuis l'extérieur du sandbox).
4. L'API renvoie des données réelles (6 signalements en base de test au
   moment de la livraison).
