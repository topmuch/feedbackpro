# WAHOO-2 — Le "Live Score" Public

**Task ID:** WAHOO-2
**Agent:** main-agent (Z.ai Code)
**Date:** 2026-11-15
**Status:** ✅ Terminé

## Résumé

Widget temps réel "Live Score" de satisfaction agrégée (0-100), avec gros
chiffre animé qui passe du vert → orange → rouge selon le niveau. Destiné aux
écrans du hall aéroport et au bureau de la direction. Polling 10s sur
`/api/airport/live-score`.

## Fichiers créés / modifiés

### 1. CRÉÉ — `src/app/api/airport/live-score/route.ts`
API GET qui calcule le score temps réel sur les AirportReport des dernières 24h.

**Formule appliquée :**
- Départ : 100
- EN_ATTENTE : -2 pts/incident (plafonné à -30 → 15 incidents max comptés)
- EN_COURS > SLA target : -3 pts/incident (plafonné à -30 → 10 max)
- RESOLU > SLA : -1 pt/incident (plafonné à -15 → 15 max)
- RESOLU ≤ SLA : +0.5 pt/incident (score plafonné à 100)
- Clamp final [0, 100]

**Niveau couleur :**
- green (≥80) #00A651 "Excellent"
- orange (60-79) #FF6B00 "À surveiller"
- red (<60) #E30613 "Critique"

**Mapping SLA :** zoneId → AirportZone.code → AirportSla.targetMinutes.
SLA par défaut = 15 min si aucune ligne AirportSla configurée (cohérent avec
le seuil "critique" EN_COURS > 15 min).

**Stats retournées :** total24h, resolved, pending, ongoing, criticalUnresolved
(EN_COURS depuis > 15 min).

Patterns respectés : `export const runtime = 'nodejs'`,
`export const dynamic = 'force-dynamic'`, `import { db } from '@/lib/db'`,
`import { ok } from '@/lib/session'`.

### 2. CRÉÉ — `src/components/feedbackpro/live-score-widget.tsx`
Composant client `"use client"`. Props : `{ className?: string, compact?: boolean }`.

**Features implémentées :**
- Polling `/api/airport/live-score` toutes les 10s
- Gros chiffre animé (comptage old→new sur 800ms via requestAnimationFrame +
  easing easeOutCubic, hook `useAnimatedNumber`)
- Couleur de fond qui transite en 700ms (CSS `transition: background-color`)
- Palette aéroport : green #00A651 / orange #FF6B00 / red #E30613
- Label "Score de Satisfaction" + sous-titre "Terminal 1 · {label}"
- Stats row : "{resolved} résolus · {pending} en attente · {ongoing} en cours"
- Badge "LIVE" pulsant (framer-motion) + point pulsant
- Bordure d'alerte pulsante (inset box-shadow) si criticalUnresolved > 0
- Badge "{n} critiques" si criticalUnresolved > 0
- Timestamp discret "maj HH:MM:SS"
- Taille : ~120px (full) / ~60px (compact)
- Carte rounded-[20px], ombre profonde `0 12px 30px rgba(0,0,0,0.18)`
- Loading skeleton (animate-pulse) au premier chargement
- Error state : bordure rouge #E30613 + "Erreur de chargement" + bouton Réessayer
- Halos décoratifs subtils en fond (cercles semi-transparents)
- Accessibilité : `role="status"`, `aria-live="polite"`, `aria-label` descriptif

### 3. MODIFIÉ — `src/components/feedbackpro/admin-direction-tab.tsx`
- Ajout import : `import { LiveScoreWidget } from "@/components/feedbackpro/live-score-widget"`
- Insertion `<LiveScoreWidget />` en hero full-width AVANT les 4 KPI cards
  (entre le header et la grille des BigKpi), vers la ligne 216.

### 4. MODIFIÉ — `src/app/ops-wallboard/page.tsx`
- Ajout import : `import { LiveScoreWidget } from '@/components/feedbackpro/live-score-widget'`
  (après `import { parler } from '@/lib/staff-tts'`, ligne 64)
- Section "KPI ROW" : grille passée de `repeat(6, 1fr)` → `repeat(8, 1fr)`
- `<LiveScoreWidget compact className="col-span-2 min-h-[120px] flex flex-col justify-center" />`
  inséré en premier élément (occupe 2 colonnes, prominent, aligné en hauteur
  avec les KpiCard minHeight 120px). Les 6 KpiCards existantes sont conservées
  (approche "alongside" plutôt que "replacing" — aucune info perdue).

## Tests & validation

### API testée (curl)
```bash
$ curl http://localhost:3000/api/airport/live-score
{"ok":true,"data":{"score":98,"level":"green","color":"#00A651","label":"Excellent",
"stats":{"total24h":1,"resolved":0,"pending":1,"ongoing":0,"criticalUnresolved":0},
"generatedAt":"2026-11-15T23:15:41.479Z"}}
```
Score = 100 - (1 EN_ATTENTE × 2) = 98 ✅ (formule correcte)

### Pages
- `GET /api/airport/live-score` → 200 ✅
- `GET /ops-wallboard` → 200 ✅ (compile OK avec le nouveau widget)
- `GET /` → 200 ✅

### Lint (`bun run lint`)
Aucune erreur/warning sur les fichiers créés/modifiés :
- `live-score-widget.tsx` → 0 problème
- `live-score/route.ts` → 0 problème
- `admin-direction-tab.tsx` → 0 problème
- `ops-wallboard/page.tsx` → 0 problème

Les 4 problèmes lint restants sont tous pré-existants dans des fichiers non
touchés par cette tâche :
- `prisma/seed-airport-ops-config.cjs:10` (require import — pre-existing)
- `language-selector.tsx:33` (immutability — pre-existing)
- `scratch-card.tsx:105` (immutability — pre-existing)
- `lib/db.ts:15` (unused eslint-disable — pre-existing)

### dev.log
Aucune erreur de compilation. `✓ Compiled in ...` à chaque modification.
Requêtes Prisma attendues : AirportReport (24h) + AirportZone + AirportSla.

## Erreurs rencontrées & résolutions

1. **`mkdir` parent missing** lors de la création du fichier route — résolu en
   créant d'abord le dossier `src/app/api/airport/live-score`.
2. **Lint warning** "Unused eslint-disable directive" sur
   `live-score-widget.tsx:88` — le commentaire
   `// eslint-disable-next-line react-hooks/exhaustive-deps` n'était pas
   nécessaire (les deps `[target, duration]` sont correctes). Remplacé par un
   commentaire explicatif documentant l'omission intentionnelle de `display`
   des deps.
3. **Variables inutilisées** `subtitleSize` / `labelSize` dans le widget —
   supprimées avant le premier lint.
4. **`key={data.score}`** superflu sur le span du chiffre (l'animation est
   pilotée par le state du hook `useAnimatedNumber`, pas par remontage) —
   supprimé pour la propreté.

## Notes d'architecture

- Le hook `useAnimatedNumber` utilise `requestAnimationFrame` + easing
  `easeOutCubic` plutôt que `framer-motion`'s `animate` pour un comptage
  déterministe et léger (pas de re-render supplémentaire côté motion).
- `framer-motion` est quand même utilisé pour les micro-animations (badge LIVE
  pulsant, bordure d'alerte, point indicateur) — transitions déclaratives
  propres.
- Les plafonds par pénalité (CAP_*) rendent le score recoverable : une rafale
  d'incidents EN_ATTENTE ne met pas le score à 0 de façon irréversible ; les
  résolutions rapides (+0.5 chacune) peuvent le remonter.
- Le composant gère ses propres états loading/error/success — il peut être
  placé n'importe où sans casser le layout parent (le parent n'a pas à gérer
  ces états).
