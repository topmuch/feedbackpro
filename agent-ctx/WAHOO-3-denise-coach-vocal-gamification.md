# WAHOO-3 — Denise "Coach Vocal" & Gamification

**Task ID:** WAHOO-3
**Agent:** main-agent (Z.ai Code)
**Date:** 2026-11-15
**Status:** ✅ Terminé

## Résumé

Denise ne se contente plus d'alerter sur les problèmes : elle félicite et
motivate le staff quand un agent résout un incident rapidement. À la
résolution, si l'agent bat son record perso ou respecte le temps cible SLA,
Denise l'annonce par son prénom ("Bravo Amadou. Incident résolu en 3 minutes.
Nouveau record personnel !"), un son "level up" (arpège majeur ascendant) joue
via Web Audio API, un toast stylé or/vert apparaît, et un overlay "trophée
géant" animé occupe l'écran pendant 2.5 s.

## Fichiers créés / modifiés

### 1. CRÉÉ — `src/lib/level-up-sound.ts`
Utilitaire Web Audio API qui génère un son "level up" (arpège majeur ascendant)
sans fichier audio.

**Spécifications implémentées :**
- `playLevelUpSound(): void` — export unique, fire-and-forget
- Détection `window.AudioContext || window.webkitAudioContext` (silencieux si absent / SSR)
- AudioContext partagé (`sharedCtx`) lazy-init et réutilisé entre appels
- Politique autoplay : `ctx.resume()` explicite si état `suspended` (catch silencieux)
- 4 notes : `[523.25, 659.25, 783.99, 1046.50]` Hz (C5, E5, G5, C6 — arpège majeur)
- Chaque note : sine wave, gain peak 0.15, exponential decay → 0.001 sur 200 ms
- Stagger 100 ms entre chaque note → durée totale ~500 ms
- Helper privé `playNote(ctx, freq, startAt)` factorise l'enveloppe ADSR simplifiée

### 2. CRÉÉ — `src/app/api/airport/check-record/route.ts`
API POST qui détermine si une résolution constitue un record perso (all-time)
et/ou respecte le SLA cible de la zone.

**Request body :** `{ staffName: string, resolutionMinutes: number, zoneCode: string }`

**Response :**
```json
{
  "ok": true,
  "data": {
    "isRecord": true,
    "isUnderTarget": true,
    "targetMinutes": 5,
    "previousAvg": 7,
    "resolutionMinutes": 3,
    "firstResolution": false
  }
}
```

**Logique implémentée :**
- 4 requêtes Prisma en parallèle (`Promise.all`) :
  1. `AirportAgentScore.findUnique` par `staffName + month` (mois courant YYYY-MM)
  2. `AirportSla.findUnique` par `zoneCode` → `targetMinutes`
  3. `AirportAuditTrail.count` WHERE actor=staffName, action='RESOLVED' → `totalCount`
  4. `AirportAuditTrail.count` WHERE actor=staffName, action='RESOLVED', elapsedMin < resolutionMinutes → `strictlyLessCount`
- `previousAvg` : moyenne mensuelle AVANT la résolution courante, recalculée
  depuis le score (déjà mis à jour par `staff-scan` via `updateAgentScore`) :
  `prevTotal / prevResolutions = (totalMinutes - resolutionMinutes) / (resolutions - 1)`
- `firstResolution` : `totalCount <= 1` (en production, staff-scan a écrit
  l'entrée courante dans l'audit trail avant l'appel check-record, donc
  `totalCount === 1` signifie "seule l'entrée courante est présente" = première
  résolution ever).
- `isRecord` : vrai si
  - `firstResolution` (triviallement record), OU
  - `strictlyLessCount === 0` (aucune résolution passée strictement plus
    rapide → la courante est la meilleure, ex-aequo toléré), OU
  - `score.resolutions > 1 && resolutionMinutes < previousAvg` (plus rapide que
    la moyenne mensuelle précédente — gamification souple).
- `isUnderTarget` : `targetMinutes !== null && resolutionMinutes <= targetMinutes`
- Validation stricte du body + `trim()` + `Math.max(0, Math.round(...))` sur
  `resolutionMinutes` (robuste aux floats / négatifs).
- Patterns respectés : `export const runtime = 'nodejs'`,
  `export const dynamic = 'force-dynamic'`, `import { db } from '@/lib/db'`,
  `import { ok, fail } from '@/lib/session'`.

### 3. MODIFIÉ — `src/components/feedbackpro/airport-staff-view.tsx`

**Imports ajoutés :**
- `import { playLevelUpSound } from '@/lib/level-up-sound'` (après `staff-alert`)

**Types ajoutés (après `EmployeEntry`) :**
- `interface CheckRecordResponse` (forme de la réponse API check-record)
- `type RecordToastKind = 'record' | 'underTarget'`
- `interface RecordToast { kind: RecordToastKind; text: string }`

**State hooks ajoutés (après `toast`) :**
- `const [celebration, setCelebration] = useState<string | null>(null)` — emoji
  géant pour l'overlay de célébration (null = pas d'overlay)
- `const [recordToast, setRecordToast] = useState<RecordToast | null>(null)` —
  pill stylée (or/vert) qui remplace le toast sombre quand il y a motif de
  félicitations

**`resolveReport` modifié** (autour de la ligne 988) :
1. Capture `zoneCode = activeReport?.zone?.code ?? ''` **avant** `setActiveReport(null)`
2. Calcule `minutes` (inchangé)
3. Appel try/catch à `POST /api/airport/check-record` avec
   `{ staffName, resolutionMinutes: minutes, zoneCode }` (relative path)
4. En cas d'échec réseau/API → `recordData` reste `null` → fallback message
   par défaut existant (pas de blocage UI)
5. Extrait `prenom = (staffName || 'Agent').split(' ')[0]` pour annonces
   chaleureuses ("Bravo Amadou.")
6. Branche selon le résultat :
   - **`isRecord && isUnderTarget`** → `parler("Bravo X. Incident résolu en N minutes. Nouveau record personnel !")` + `playLevelUpSound()` + overlay celebration + recordToast or
   - **`isUnderTarget` only** → `parler("Bravo X. Incident résolu en N minutes. Dans les temps cible.")` + `playLevelUpSound()` + recordToast vert
   - **`isRecord` only** → `parler("Bravo X. Nouveau record personnel : N minutes.")` + `playLevelUpSound()` + overlay celebration + recordToast or
   - **Neither** → `parler("Incident résolu en N minutes. Merci.")` + `setToast(...)` (sombre, message par défaut existant)
7. `vibrer()` inchangé (toujours appelé)
8. Le reste du flow (`setResolveComment`, `setActiveReport(null)`, `go('home', -1)`, `fetchStats()`) inchangé
9. Tous les `playLevelUpSound()` sont fire-and-forget (pas awaité)
10. Tous les `setTimeout` pour reset `celebration` (2.5 s) / `recordToast` (4 s)
    utilisent `window.setTimeout` (pour typo SSR-safe)

**Rendu ajouté** (après le toast inline existant, avant `</div>` final) :

a. **Toast stylé record/underTarget** (pilule or ou vert, en HAUT de l'écran) :
   - `<AnimatePresence>` + `motion.div` avec key=recordToast.text
   - Anim : opacity/y/scale in/out (250 ms easeOut)
   - Classe conditionnelle : `bg-[#FCD116] text-[#003399]` (record) ou
     `bg-[#00A651] text-white` (underTarget)
   - Shadow colorée assortie (`shadow-[0_10px_30px_rgba(...,0.45)]`)
   - Position `fixed top-24 z-[60]` (pour ne PAS empiéter sur le toast sombre
     en `bottom-6`)
   - `role="status" aria-live="polite"` pour accessibilité
   - Texte : `🏆 Nouveau record personnel ! X min` ou
     `✅ Résolu dans les temps cible (X min ≤ Y min cible)`

b. **Overlay de célébration "level up"** (trophée géant centré, 2.5 s) :
   - `<AnimatePresence>` + `motion.div` wrapper full-screen
   - `pointer-events-none` + `aria-hidden="true"` (ne bloque pas l'UI)
   - 3 couches animées en parallèle :
     - Halo doré flou (`bg-[#FCD116]/45 blur-3xl`) qui scale [0 → 1.4 → 1.2]
     - Anneau concentrique (`border-4 border-[#FCD116]`) qui scale [0 → 2.2]
       avec opacity [0.9 → 0] (effet "level up ring" qui se dissipe)
     - Trophée géant `text-[120px]` qui scale [0 → 1.35 → 0.95 → 1.1 → 1]
       avec rotation [-25 → 8 → -4 → 2 → 0] (effet "tada")
   - `drop-shadow` sur l'emoji pour la lisibilité sur fond clair
   - z-[100] (au-dessus de tout)
   - Durée totale 0.7–1 s d'animation ; l'état `celebration` reste `null` après
     2.5 s (réinitialisé par `setTimeout`)

## Tests & validation

### API testée (curl — production simulation)

Scénario : agent "Amadou Test" avec une résolution passée à 2 min dans
l'audit trail, plus une entrée "courante" insérée pour simuler le prérequis
`staff-scan` (qui écrit l'audit entry avant l'appel check-record).

```bash
$ curl -X POST /api/airport/check-record -d '{"staffName":"Amadou Test","resolutionMinutes":3,"zoneCode":"sanitaires"}'
{"ok":true,"data":{"isRecord":false,"isUnderTarget":true,"targetMinutes":5,"previousAvg":0,"resolutionMinutes":3,"firstResolution":false}}
# → 3 min n'est pas un record (passé à 2 min plus rapide), mais ≤ SLA 5 min ✓

$ curl -X POST /api/airport/check-record -d '{"staffName":"Amadou Test","resolutionMinutes":1,"zoneCode":"sanitaires"}'
{"ok":true,"data":{"isRecord":true,"isUnderTarget":true,"targetMinutes":5,"previousAvg":0,"resolutionMinutes":1,"firstResolution":false}}
# → 1 min est un nouveau record (1 < 2) ET ≤ SLA 5 min ✓

$ curl -X POST /api/airport/check-record -d '{"staffName":"Amadou Test","resolutionMinutes":5,"zoneCode":"sanitaires"}'
{"ok":true,"data":{"isRecord":false,"isUnderTarget":true,"targetMinutes":5,"previousAvg":0,"resolutionMinutes":5,"firstResolution":false}}
# → 5 min n'est pas un record (5 > 2), mais = SLA 5 min (≤) ✓

$ curl -X POST /api/airport/check-record -d '{"staffName":"Amadou Test","resolutionMinutes":3,"zoneCode":"unknown_zone"}'
{"ok":true,"data":{"isRecord":false,"isUnderTarget":false,"targetMinutes":null,"previousAvg":0,"resolutionMinutes":3,"firstResolution":false}}
# → zone inconnue → targetMinutes=null, isUnderTarget=false ✓
```

### Pages
- `POST /api/airport/check-record` → 200 ✅ (compile OK, 4 requêtes Prisma
  parallèles : `AirportAgentScore.findUnique`, `AirportSla.findUnique`,
  2 × `AirportAuditTrail.count`)
- `GET /` → 200 ✅ (compile OK avec les nouveaux imports/state/render)

### Lint (`bun run lint`)
Aucune erreur/warning sur les fichiers créés/modifiés :
- `level-up-sound.ts` → 0 problème
- `check-record/route.ts` → 0 problème
- `airport-staff-view.tsx` → 0 problème

Les 4 problèmes lint restants sont tous pré-existants dans des fichiers non
touchés par cette tâche :
- `prisma/seed-airport-ops-config.cjs:10` (require import — pre-existing)
- `language-selector.tsx:33` (immutability — pre-existing)
- `scratch-card.tsx:105` (immutability — pre-existing)
- `lib/db.ts:15` (unused eslint-disable — pre-existing)

### dev.log
- Aucune erreur de compilation. `✓ Compiled in ...` à chaque modification.
- `POST /api/airport/check-record 200 in 6ms` (render 4 ms)
- 4 requêtes Prisma attendues vues dans les logs : 1 findUnique score + 1
  findUnique SLA + 2 count audit trail.

## Erreurs rencontrées & résolutions

1. **Bug initial dans la logique `firstResolution`** : la première version
   utilisait `lessOrEqualCount <= 1 && strictlyLessCount === 0` pour détecter
   "première résolution ever", mais ce test se déclenchait aussi pour des
   agents ayant des résolutions passées plus lentes (cas : passé à 5 min,
   courant à 3 min → `lessOrEqualCount === 1` (seule la courante ≤ 3), donc
   `firstResolution=true` à tort).
   **Résolution** : remplacé par un `totalCount` séparé (count tous les
   `AirportAuditTrail` RESOLVED de l'agent, sans filtre `elapsedMin`).
   `firstResolution = totalCount <= 1` (en production, staff-scan a écrit
   l'entrée courante dans l'audit trail avant l'appel check-record, donc
   `totalCount === 1` signifie vraiment "seule l'entrée courante est
   présente" = première résolution ever). Le `lessOrEqualCount` a été
   supprimé au profit de cette logique plus claire.

2. **Bug subtil dans le test curl** : les tests curl initiaux (sans
   précondition staff-scan) donnaient `firstResolution=true` à tort pour
   "Amadou Test" qui avait pourtant une entrée passée. C'est un artefact du
   scénario de test artificiel (curl sans staff-scan préalable) — en
   production, `resolveReport` attend toujours `staff-scan` avant d'appeler
   `check-record`, donc l'entrée courante est présente dans l'audit trail.
   Confirmé en simulant l'entrée courante (insertion manuelle) : la logique
   donne alors `firstResolution=false` correctement.

3. **Aucune erreur de compilation** sur les nouveaux fichiers — structure
   TypeScript strictement typée, imports corrects, `runtime='nodejs'` +
   `dynamic='force-dynamic'` conformes aux autres routes aéroport.

## Notes d'architecture

- **AudioContext partagé** : `level-up-sound.ts` maintient une instance
  `sharedCtx` réutilisée entre appels (économie de ressources navigateur).
  Le `resume()` explicite gère la politique autoplay (premier appel après
  interaction utilisateur).
- **Web Audio API vs fichier MP3** : pas de fichier audio requis (vs
  `staff-alert.ts` qui utilise `/sounds/ding-dong.mp3`). L'arpège est généré
  à la volée par oscillateurs sine — léger, instantané, aucune dépendance
  asset.
- **Fire-and-forget** : `playLevelUpSound()` ne retourne pas de promesse et
  n'est pas awaité dans `resolveReport`. Le son joue en arrière-plan pendant
  que l'UI continue (`setActiveReport(null)`, `go('home', -1)`, etc.).
- **Fallback gracieux** : si l'API check-record échoue (réseau down, erreur
  500, etc.), `recordData` reste `null` → le message par défaut existant
  ("Incident résolu en N minutes. Merci.") est utilisé. L'incident reste
  résolu côté serveur (staff-scan a déjà réussi), seule la gamification est
  silenciée — pas de blocage.
- **Palette aéroport respectée** : navy `#003399` (texte sur fond or),
  gold `#FCD116` (record), green `#00A651` (under target). Aucune couleur
  indigo ou blue Tailwind ajoutée — conformément aux règles UI.
- **Accessibilité** : le toast stylé a `role="status"` + `aria-live="polite"`
  pour les lecteurs d'écran. L'overlay celebration a `aria-hidden="true"`
  (purement décoratif, ne porte pas d'information — l'annonce vocale Denise
  + le toast suffisent à informer).
- **Positionnement des toasts** : le toast sombre par défaut reste en
  `bottom-6`, le nouveau toast stylé est en `top-24` — pas de chevauchement
  possible entre les deux.
- **framer-motion** réutilise les imports existants (`motion`, `AnimatePresence`
  déjà importés en haut du fichier) — pas de nouvelle dépendance.
- **Strict ordering** : `zoneCode` capturé AVANT `setActiveReport(null)` pour
  pouvoir l'envoyer à l'API check-record (sinon `activeReport` serait null
  au moment du fetch).
