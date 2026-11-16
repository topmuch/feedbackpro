# WAHOO-4 — Le "Mode Prédictif" de Denise

**Task ID:** WAHOO-4
**Agent:** main-agent (Z.ai Code)
**Date:** 2026-11-15
**Status:** ✅ Terminé

## Résumé

Denise ne se contente plus d'annoncer les incidents passés : elle
anticipe désormais les risques futurs en croisant trois signaux
opérationnels :

1. **Vols aux portes** (`AirportFlightGate` actifs dont le décollage est
   prévu dans les 15-45 prochaines minutes) — règle HIGH si ≥ 2 vols dans
   les 20 min avec ≥ 150 pax combinés.
2. **Patterns historiques** (4 dernières semaines d'`AirportReport`) —
   règle MEDIUM si une zone enregistre ≥ 3 incidents au créneau
   (jour-semaine + heure) courant.
3. **Charge actuelle** (signalements `EN_ATTENTE` + `EN_COURS` par zone) —
   règle MEDIUM si une zone atteint ≥ 3 pending, HIGH si ≥ 5.

Le wallboard ops affiche un bandeau slim navy/or "PRÉDICTION DENISE"
avec défilement horizontal (CSS marquee) et cycle de 8 s entre les
prédictions. La PWA staff reçoit aussi les prédictions HIGH via
`parler()` (voix Denise) pour que le terrain entende l'alerte en même
temps que la salle ops.

## Fichiers créés / modifiés

### 1. CRÉÉ — `src/app/api/airport/predictive-alert/route.ts`

GET endpoint qui génère les prédictions proactives.

**Spécifications implémentées :**
- `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`
- Imports : `db` from `@/lib/db`, `ok` from `@/lib/session`,
  `AIRPORT_ZONES` from `@/lib/airport-config`
- **Étape 1 — flight_arrival (HIGH)** :
  - Récupère tous les `AirportFlightGate` actifs
  - Calcule ETA en minutes depuis `scheduledDeparture` (format `HH:MM`)
    via `computeEtaMinutes()` (logique identique au crystal-ball API)
  - Filtre sur window `[15, 45]` minutes
  - Pour la règle HIGH : compte les vols avec `ETA ≤ 20 min`
  - Si `≥ 2 vols` ET `Σ paxCount ≥ 150` → prédiction HIGH
  - `paxCount` estimé via `simulatePaxCount(flightNumber)` — hash
    déterministe (même logique que crystal-ball) car le modèle
    `AirportFlightGate` ne stocke pas le paxCount directement
  - Mappe les portes vers les zones d'impact via
    `FLIGHT_IMPACT_BY_GATE_ZONE` (term_embarq → term_checkin,
    sec_filt_std, term_sanitaires, com_resto, com_dutyfree, etc.)
  - Sélectionne les top 3 zones par poids cumulé pour le message
  - Message : "Alerte prédictive : {N} vols arrivent simultanément dans
    {X} minutes. Risque élevé de saturation à {zones}. Renfort
    recommandé dès maintenant."
  - ID déterministe : `pred_flight_${flightCount}_${etaMinutes}`
- **Étape 2 — historical_pattern (MEDIUM)** :
  - Récupère les `AirportReport` des 4 dernières semaines
  - Filtre sur `dayOfWeek == current` ET `hour == current`
  - Groupe par zoneCode, compte les incidents
  - Si `≥ 3 incidents` pour une zone → MEDIUM
  - 1 seule prédiction par réponse (anti-spam — on garde la première
    zone trouvée)
  - Message : "Alerte prédictive : motif historique. La zone {zoneName}
    enregistre habituellement {N} incidents à cette heure les {day}s.
    Surveiller en priorité."
  - ID : `pred_hist_${zoneCode}_${dayOfWeek}_${hour}`
- **Étape 3 — current_load (MEDIUM/HIGH)** :
  - Compte les `AirportReport` avec `statut IN ('EN_ATTENTE', 'EN_COURS')`
    par zone
  - Si `≥ 3` → MEDIUM, si `≥ 5` → HIGH
  - 1 seule prédiction par réponse (la zone la plus chargée)
  - Message : "Alerte prédictive : charge actuelle élevée. {N} incidents
    en attente à {zoneName}. Risque de saturation imminente."
  - ID : `pred_load_${zoneCode}`
- **Filtre final** :
  - Garde uniquement `priority !== 'low'`
  - Tri par priorité (HIGH puis MEDIUM)
  - Limite à 3 prédictions max par réponse
- Réponse : `{ ok: true, data: { predictions: [...], generatedAt: ISO } }`

**Testé via curl :** avec 3 vols créés (AF747, DL6049, KL1024) à ETA
15-20 min avec ~767 pax combinés → a renvoyé une prédiction HIGH
correcte avec les zones `term_checkin`, `sec_filt_std`, `com_resto`.

### 2. MODIFIÉ — `src/app/ops-wallboard/page.tsx`

**Ajouts :**

a. **Type `PredictiveAlert`** (après `AchievementsData`, ~ligne 257) :
   contrats TypeScript de la réponse API (id, type, priority, message,
   zones, flightCount, paxCount, etaMinutes).

b. **State + ref** (après `announcedAchievementsRef`, ~ligne 1511) :
   - `const [predictiveAlerts, setPredictiveAlerts] = useState<PredictiveAlert[]>([])`
   - `const [predictiveTick, setPredictiveTick] = useState(0)` — index
     de la prédiction actuellement affichée dans le bandeau (cycle 8s)
   - `const announcedPredictionsRef = useRef<Set<string>>(new Set())` —
     dédup des annonces vocales

c. **Polling useEffect** (après le polling achievements, ~ligne 1759) :
   - Fetch `/api/airport/predictive-alert` avec `cache: 'no-store'`
   - Interval 5 min (`5 * 60 * 1000`)
   - Dépendance `[soundOn]` (refetch quand le son est activé/désactivé)
   - Pour chaque NOUVELLE prédiction HIGH : `setTimeout(() => speak(pred.message, soundOn), 1500)`
     — délai 1,5 s pour éviter le chevauchement avec les annonces
     prioritaires (nouveaux incidents, alertes critiques)
   - Cleanup : retire les IDs annoncés qui ne sont plus actifs
   - Prédictions MEDIUM : affichées dans le bandeau mais PAS annoncées
     vocalement (anti-spam sonore)

d. **Cycle useEffect** (après polling, ~ligne 1807) :
   - Si `predictiveAlerts.length > 1` : `setInterval(() => setPredictiveTick((t) => (t+1) % length), 8000)`
   - Permet de défiler entre les prédictions toutes les 8 s

e. **CSS keyframes** (dans le `<style>` global, ~ligne 2251) :
   - `@keyframes opsPredMarquee` — translateX de 0 à -50% (boucle
     seamless, texte dupliqué côté React pour éviter le flash)
   - `@keyframes opsPredFadeIn` — fade + translate Y au changement de
     prédiction
   - `.ops-pred-marquee` — `display: inline-flex` + animation 30s
     linear infinite + `:hover { animation-play-state: paused }`
   - `.ops-pred-fade-in` — animation 0.4s ease-out

f. **Bandeau "PRÉDICTION DENISE"** (entre KPI row et section CLASSEMENT,
   ~ligne 2643) :
   - Rendu conditionnel `{predictiveAlerts.length > 0 && (...)}`
   - Wrapper `<section aria-label="Prédictions Denise" aria-live="polite">`
   - Layout flex horizontal :
     - LEFT : `🔮` (pulsant) + label "PRÉDICTION DENISE" en or (#FCD116)
       sur fond navy (#003399)
     - RIGHT : badge priorité (HIGH=rouge #E30613 / MEDIUM=orange
       #FF6B00) + texte défilant (marquee, duplicé pour boucle
       seamless) + dots indicateurs (si >1 prédiction)
   - Style : `borderLeft: 4px solid #FCD116` (or), fond navy, coins
     arrondis 15px, box-shadow légère
   - `key={pred.id}` force le re-mount au changement → redémarre
     l'animation marquee + fade-in
   - Respecte l'accessibilité : `aria-label`, `aria-live="polite"`,
     `aria-hidden` sur les éléments décoratifs, `aria-label` sur le
     span visible du message (pour les lecteurs d'écran)

### 3. MODIFIÉ — `src/components/feedbackpro/airport-staff-view.tsx`

**Ajouts :**

a. **Ref de dédup** (après `firstPollDoneRef`, ~ligne 490) :
   - `const announcedPredictionsRef = useRef<Set<string>>(new Set())`

b. **Polling useEffect** (après le polling `pollPendingReports`,
   ~ligne 861) :
   - Gate : `if (!staffName || screen === 'login') return` — la PWA ne
     sonde que quand le staff est connecté
   - Fetch `/api/airport/predictive-alert` avec `cache: 'no-store'`
   - Interval 5 min via `window.setInterval`
   - Pour chaque NOUVELLE prédiction HIGH :
     `window.setTimeout(() => parler(pred.message), 1200)` — délai 1,2 s
     pour ne pas chevaucher le ding incident (polling 10s)
   - Cleanup : retire les IDs expirés du Set de dédup
   - Prédictions MEDIUM : non annoncées sur la PWA staff (seul le
     wallboard ops les affiche)

## Tests effectués

### Test API (curl)
- Sans données : `{"ok":true,"data":{"predictions":[],"generatedAt":"..."}}`
- Avec 3 vols AF747/DL6049/KL1024 à ETA 15-20 min, 767 pax combinés :
  ```json
  {
    "ok": true,
    "data": {
      "predictions": [{
        "id": "pred_flight_3_15",
        "type": "flight_arrival",
        "priority": "high",
        "message": "Alerte prédictive : 3 vols arrivent simultanément dans 15 minutes. Risque élevé de saturation à Files d'Attente (Check-in), Filtrage de Sûreté (Standard) et Restauration (Landside/Airside). Renfort recommandé dès maintenant.",
        "zones": ["term_checkin", "sec_filt_std", "com_resto"],
        "flightCount": 3,
        "paxCount": 767,
        "etaMinutes": 15
      }]
    }
  }
  ```
- Test data nettoyée via DELETE `/api/airport/flight-gates/[id]` après
  vérification

### Test compilation
- `GET /ops-wallboard` → HTTP 200 (compile: 59ms, render: 100ms)
- `GET /airport-dashboard` → HTTP 200 (compile: 1521ms, render: 83ms)
- `GET /api/airport/predictive-alert` → HTTP 200 (compile: 2ms, render: 9ms)

### Lint
- `bunx eslint src/app/api/airport/predictive-alert/route.ts src/app/ops-wallboard/page.tsx src/components/feedbackpro/airport-staff-view.tsx` → exit 0, 0 errors
- `bunx tsc --noEmit` → 0 erreurs sur les fichiers modifiés
  (pré-existing errors uniquement dans `src/app/api/airport/wallboard/route.ts`,
  fichier non touché par cette task)

### Dev log
- Aucune erreur ou warning dans `.zscripts/dev.log` concernant mes
  modifications
- Requêtes Prisma visibles : SELECT sur AirportFlightGate,
  AirportReport (×2), AirportZone — toutes exécutées correctement

## Erreurs rencontrées & résolues

Aucune erreur nouvelle. Les 3 erreurs ESLint rapportées par `bun run lint`
sont pré-existantes dans des fichiers non modifiés par cette task :
- `prisma/seed-airport-ops-config.cjs` (require() interdit)
- `src/components/feedbackpro/language-selector.tsx` (mutabilité cookie)
- `src/components/feedbackpro/scratch-card.tsx` (réassignation variable)

Les erreurs TypeScript dans `src/app/api/airport/wallboard/route.ts`
sont également pré-existantes (propriété `count_en_cours` manquante et
access optional chaining) — non liées à cette task.

## Décisions de design

1. **paxCount estimé via hash** : le modèle `AirportFlightGate` ne
   stocke pas `paxCount` (champ inexistant en BDD). On réutilise la
   même logique que `/api/airport/crystal-ball` (`simulatePaxCount()`)
   — hash déterministe du flightNumber → 80-300 pax. Cela garantit des
   valeurs stables par vol (le même AF747 aura toujours le même paxCount).

2. **IDs déterministes** : chaque prédiction porte un ID dérivé de son
   contenu (`pred_flight_${count}_${eta}`, `pred_hist_${zone}_${day}_${hour}`,
   `pred_load_${zone}`). Quand le wallboard et la PWA stockent ces IDs
   dans leur Set de dédup, la même prédiction ne sera pas réannoncée
   tant que ses conditions (count, ETA, zone, etc.) ne changent pas.

3. **Limite 3 prédictions** : anti-spam sonore. Même si 10 zones ont
   un pattern historique, on ne garde que les 3 plus prioritaires
   (HIGH d'abord, puis MEDIUM). 1 seule prédiction par type
   (`historical_pattern` et `current_load`) pour éviter la saturation.

4. **Délai 1,5 s (wallboard) / 1,2 s (PWA)** avant l'annonce vocale :
   laisse passer les annonces prioritaires (nouvel incident, alerte
   critique) avant la prédiction. évite la cacophonie.

5. **Prédictions MEDIUM non annoncées sur la PWA staff** : la PWA est
   déjà pollée toutes les 10 s pour les nouveaux incidents — ajouter
   des annonces MEDIUM toutes les 5 min serait trop intrusif pour le
   terrain. Le wallboard ops (en salle ops, son amplifié) affiche les
   MEDIUM visuellement dans le bandeau.

6. **Cycle 8 s sur le wallboard** : si plusieurs prédictions sont
   actives, on alterne entre elles plutôt que de tout empiler. Le
   marquee scroll est en complément pour les messages longs.

7. **Marquee avec texte dupliqué** : le span du message est rendu deux
   fois côte à côte (la 2e copie en `aria-hidden`), ce qui permet une
   boucle seamless (translateX -50% au lieu de -100% qui causerait un
   flash). Hover met en pause pour permettre la lecture.

8. **Component skip (task #2)** : conformément à la consigne
   "Skip this component. Focus on the API and wallboard integration",
   je n'ai pas créé `src/components/feedbackpro/predictive-alert-ticker.tsx`.
   Le polling et le rendu du bandeau sont intégrés directement dans la
   page ops-wallboard.
