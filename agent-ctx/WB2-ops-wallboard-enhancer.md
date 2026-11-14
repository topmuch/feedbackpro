# WB2 — Ops Wallboard Tactical Command Center

## Scope
Transform `/home/z/my-project/src/app/ops-wallboard/page.tsx` (departure-board
list, 1253 lines) into a tactical command center with 6 major features.
Existing structure (dark theme, departure board style, polling 5s/30s,
Denise TTS, 15-min reminder, sound mute, fresh-IDs animation) preserved.

## Files delivered

### 1. `src/app/ops-wallboard/page.tsx` — 1253 → 2235 lines (+982)
- Imports extended with `Map as MapIcon, Phone, Megaphone, Trophy,
  AlertTriangle, TrendingUp, TrendingDown, Clock, ShieldAlert, Activity,
  Wrench, Users` (lucide-react).
  - **Note**: `Map` is renamed `MapIcon` to avoid shadowing the global
    JS `Map` class used elsewhere (`useRef<Map<string, string>>(new Map())`).
    Discovered via tsc error TS2350 "Only a void function can be called with
    the 'new' keyword".
- Removed unused `Zap` import (kept only icons actually referenced).
- Types: added `LeaderboardEntry` and `LeaderboardData` (matches
  `/api/airport/leaderboard` contract).
- Helpers added: `formatDurationMin`, `formatDurationSec`, `zoneFamily`,
  `truncateName`, `zoneStatus` + `ZONE_STATUS_META` map (calm/attention/
  critical/none), `isCriticalInCrisis`.
- Sub-components added:
  - `ZoneMapSection` — Feature #1 interactive map.
  - `EnhancedKpiTile` — Feature #2 decision KPI tile.
  - `InfoBar` — Feature #6 horizontal info bar (3 variants).
  - `CrisisButton` — Feature #4 red/green toggle with timer.
- `BoardRow` extended: new prop `onActionFeedback`, internal state
  `showAssignMenu` + `busy`, three icon buttons (`Wrench`, `Phone`,
  `Megaphone`) in a new 6th grid column. Mobile: hidden (sm+ only).
- `PlaceholderRow` + `RowSkeleton` updated: 6-col grid template aligned
  with `BoardRow`.
- Main component state added:
  - `filterZone: string | null` (zone filter from map click)
  - `crisisMode: boolean` + `crisisStart: Date | null` + `crisisSummary: string | null`
  - `leaderboard: LeaderboardData | null` (poll 60s)
  - `actionToast: { msg, kind } | null` (3.5s feedback)
- Memos added: `overallSlaPctNum`, `slaTrendDir`, `untreatedOver10Min`,
  `staffActive`, `topPerformer`, `topZone`, `tendance`,
  `filteredRows` (applies `filterZone` + `crisisMode` filters),
  `crisisElapsedSec`, `activeFilterLabel`.
- Handlers added: `handleCrisisStart`, `handleCrisisEnd`,
  `handleActionFeedback`.
- Effects added: leaderboard polling (60s).
- JSX new sections (in order, top to bottom):
  1. Crisis summary banner (post-deactivation, 6s)
  2. Crisis active banner (red strip when crisisMode)
  3. `ZoneMapSection` (after alerts, before stats strip)
  4. KPI Temps Réel section (4 tiles, after stats strip)
  5. Info Bars section (3 bars: top performer, zone critique, tendance)
  6. Toast feedback overlay (absolute, in main board container)
- Header: `CrisisButton` inserted between clock and mute button.
- Outer wrapper: `crisisMode ? 'bg-red-950/20' : ''` overlay.
- Column header updated: 6-col grid + "Actions" label.
- BoardRow invocation: passes `onActionFeedback={handleActionFeedback}`.
- Empty state: contextual message (crisis mastered / no zone match /
  default).

### 2. `src/components/feedbackpro/airport-prediction-radar.tsx` — 305 → 336 lines (+31)
- Feature #5: added `riskReason(zone)` helper returning a short string
  based on `riskScore` thresholds (>60, >40, >20, =0).
- Each zone card now displays the reasoning below the recommendation
  in a `<p>` with an `Activity` icon + `title` tooltip showing
  "Score N/100 — reason".

## How each feature works

### Feature #1 — Vue Cartographique (ZoneMapSection)
- Reads `data.zones` (from `/api/airport/wallboard`, poll 5s) — already
  returns `count_en_attente` per zone.
- Groups zones by family (`ext_*` → EXTÉRIEUR, `sec_*` → SÛRETÉ,
  `term_*` → TERMINAL, `com_*` → COMMERCIAL, `srv_*` → SERVICE).
  HISTORIQUE zones (legacy `bagages`, `sanitaires`, etc.) are skipped to
  avoid duplicates with the catalogued zones.
- Each zone is a button: emoji + truncated name + status dot + count.
  Status: 0 → calm (green), 1-2 → attention (amber), 3+ → critical (red,
  animate-pulse + bg-red-500/10).
- Click → `onSelectZone(code)` → sets `filterZone` state → `filteredRows`
  is recomputed and only rows with `r.zone?.code === filterZone` are
  shown. Click again (or "✕ Filtre" chip) → clears the filter.
- Layout: `grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2`.
- Container: `rounded-xl bg-black p-3`.
- Includes a legend strip below (calme / attention / critique).

### Feature #2 — KPI Temps Réel (EnhancedKpiTile, 4 new tiles)
- Added in a new section AFTER the existing 5-tile stats strip
  (existing tiles untouched).
- Tiles:
  1. **Temps moyen résolution** — `formatDurationMin(data.stats.avg_resolution_minutes)`
     → "8m 23s" or "—".
  2. **SLA respecté** — `overallSlaPct` (computed from `data.sla`),
     colored green ≥80%, amber 60-79%, red <60%, with trend indicator
     (↑ "OK" or ↓ "RISK").
  3. **Non traités >10min** — count of `data.recent_reports` where
     `statut !== 'RESOLU'` AND elapsedMin > 10. Warning badge + red
     border when count > 0.
  4. **Staff actif** — `leaderboard.leaderboard.filter(e => e.resolutions > 0).length`
     formatted "X/15" (or X/max(15,X) if more than 15 active).
- Source: leaderboard polled every 60s (lightweight — monthly data).

### Feature #3 — Actions Rapides per BoardRow
- BoardRow grid template extended from 5 to 6 columns
  (`sm:grid-cols-[1.2fr_2.5fr_1fr_1.3fr_0.8fr_0.6fr]`).
- New "Actions" cell (sm+ only, hidden on mobile) contains 3 buttons:
  - **🔧 Wrench** (amber) → opens a dropdown menu with 5 team choices
    (Nettoyage, Maintenance, Sécurité, Accueil, Logistique). Selecting
    one calls `POST /api/airport/assign` with `{reportId, method:'push',
    phone:'team:<key>', message:'Rerouting ops vers <Label>'}`. The
    API updates `assignedTo` on the report (legacy endpoint accepts
    arbitrary `phone` string).
  - **📞 Phone** (sky) → `window.open('tel:+221784858226', '_self')`.
  - **📢 Megaphone** (red) → `POST /api/airport/staff-scan` with
    `{staffTag:'wallboard_supervisor', action:'TAKE_CHARGE', reportId,
    staffName:'wallboard_supervisor', message:'Escalade manuelle…'}`.
    This triggers the existing staff-scan handler: marks the report
    EN_COURS + logs an audit entry (Denise will announce the change on
    the next 5s poll via `recently_resolved` / `recent_reports`).
- Each action shows a 3.5s toast feedback (`actionToast` state) at the
  top of the main board (green for OK, red for err).
- Column header gets a 6th label "Actions".

### Feature #4 — Mode Crise (CrisisButton + filter)
- Big red pulsing button "MODE CRISE" in header (between clock and mute).
- On activation:
  - `setCrisisMode(true)` + `setCrisisStart(new Date())`.
  - `playEscalationDing()` (Web Audio 660/880/990 Hz).
  - TTS: "Mode crise activé. Board filtré sur incidents critiques.
    Denise en mode crise."
- Button becomes green "FIN DE CRISE" + timer "DEPUIS 12min 34s"
  (live, refreshed by `now` clock at 1Hz).
- `crisisMode` triggers:
  - `filteredRows` filtered by `isCriticalInCrisis(r)` — non-RESOLU
    incidents where elapsed > 10min OR zone is sec_*/srv_medical/urg_*/
    sanitaires OR routedTeam='securite'.
  - Outer wrapper: `bg-red-950/20` overlay.
  - Red banner strip under header: "Mode crise — board filtré aux
    incidents critiques uniquement" + active filter label.
  - Empty state: "Aucun incident critique en cours — crise maîtrisée".
- On deactivation:
  - `setCrisisMode(false)`.
  - Compute elapsed seconds, format "Crise terminée — Durée: 12min 34s",
    display in a green banner for 6s.
  - TTS announcement of the summary.
- Crisis timer is reactive: `crisisElapsedSec` is a `useMemo` of
  `now.getTime() - crisisStart.getTime()`, so it ticks every second
  along with the wallboard clock.

### Feature #5 — Radar Prédiction Enhanced
- The radar component (separate file) already polls `/api/airport/predict`
  every 30s and computes real risk scores from report history.
- Added a per-zone reasoning line below the recommendation:
  - score > 60 → "Pic d'incidents dans les 20 dernières min"
  - score > 40 → "Tendance à la hausse"
  - score > 20 → "Surveillance normale"
  - score = 0 → "Aucun incident récent"
- Reasoning is rendered with an `Activity` icon and a `title` tooltip
  "Score N/100 — reason" for at-a-glance context.

### Feature #6 — Top Performer + Zone Critique + Tendance (InfoBar)
- Three info bars in a `lg:grid-cols-3` layout, between KPIs and main board.
- **Bar 1 — Top Performer** (emerald accent, Trophy icon): fetched from
  `/api/airport/leaderboard` (poll 60s). Shows "#1 [staffName] — X résolus,
  Ymin moy". Falls back to "Aucun classement" if empty.
- **Bar 2 — Zone Critique** (amber accent, AlertTriangle icon): from
  `data.top_zones[0]` (already sorted desc by `count_24h`).
  Shows "[emoji] [nom]" + "X signalements 24h".
- **Bar 3 — Tendance** (neutral/emerald/amber accent, dynamic icon):
  Aggregates zone trends: majority "up" → "↑X% vs hier" (amber,
  concerning); majority "down" → "↓X% vs hier" (emerald, improving);
  tie or all stable → "Stable vs hier" (neutral). Percentage is
  `round(zoneCountUp / (up+down) * 100)`. Detail shows total_24h.

## What was kept vs changed

### KEPT (zero modification)
- Polling 5s (wallboard) + 30s (alerts) + 1s (clock).
- Sound system: ding-dong + ding-critical + resolved + triple-ding
  escalation (Web Audio API).
- Denise TTS via `/api/voice/decide` (Voice Decision Engine).
- 15-min reminder escalation (alertedLateRef + playEscalationDing).
- Sound activation banner (10s auto-dismiss).
- Existing 5 stat tiles (24H, EN ATTENTE, EN COURS, RÉSOLUS, SLA %).
- StatutMeta palette (EN_ATTENTE → amber, EN_COURS → sky, RESOLU → green).
- Team meta (nettoyage, maintenance, securite, accueil, logistique, other).
- Alert rows under the header.
- Prediction radar placement.
- Bottom strip: SLA par zone + Charge par zone (footer 2 cols).
- Skeletons (StatSkeleton, RowSkeleton, MiniRowSkeleton) — RowSkeleton
  extended to 6 cols to match the new BoardRow grid.
- Visual language: `bg-[#1a1a1a]` cells, `font-mono`, amber labels
  `text-[10px] uppercase tracking-wider text-amber-400`.
- `recently_resolved` sound trigger.
- localStorage persistence for sound preference.
- All file header comments preserved (Style "departure board" etc.).

### CHANGED (additive only — no removals)
- Imports: added 11 lucide icons. `Zap` removed (was unused after).
- BoardRow: signature changed (added optional `onActionFeedback` prop).
  Grid extended from 5 to 6 columns (sm+). Mobile 2-col layout
  unchanged.
- PlaceholderRow: 6-col grid (sm+) to match BoardRow.
- RowSkeleton: 6-col grid (sm+) to match BoardRow.
- Column header: 6-col grid + new "Actions" label.
- Main component JSX: 5 new sections inserted in the layout flow
  (crisis summary / crisis active banner / ZoneMapSection / KPI Temps
  Réel / Info Bars) + toast overlay in main board container.
- Outer wrapper div: conditional `bg-red-950/20` overlay in crisis mode.
- Main board `<main>`: added `relative` class so the toast positions
  correctly.
- Empty state message: now contextual (crisis mastered / zone filter
  empty / default).

## Verifications (all green)

### ESLint
```
$ bunx eslint src/app/ops-wallboard/page.tsx src/components/feedbackpro/airport-prediction-radar.tsx
(no output — 0 errors, 0 warnings on modified files)
```
Project-wide `bun run lint` shows 3 pre-existing errors in
unrelated files (`prisma/seed-airport-ops-config.cjs`,
`language-selector.tsx`, `scratch-card.tsx`) — none in scope.

### TypeScript
```
$ npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(ops-wallboard|airport-prediction-radar)"
(no output — 0 errors on modified files)
```
Fix applied during dev: renamed `Map` → `MapIcon` to avoid shadowing
the global JS `Map` class (used in `useRef<Map<string, string>>(new Map())`).

### dev.log
Server healthy (Ready in 749ms, no errors related to ops-wallboard).

## Final metrics
- `src/app/ops-wallboard/page.tsx`: 1253 → 2235 lines (+982)
- `src/components/feedbackpro/airport-prediction-radar.tsx`: 305 → 336 lines (+31)
- Total: +1013 lines added across 2 files

## API endpoints used
- `GET /api/airport/wallboard` (existing, poll 5s) — main data source
- `GET /api/airport/alerts/check` (existing, poll 30s) — alerts
- `GET /api/airport/leaderboard` (existing, poll 60s NEW) — top performer
- `POST /api/airport/assign` (existing) — used by Feature #3 Wrench button
- `POST /api/airport/staff-scan` (existing) — used by Feature #3 Megaphone button
- `POST /api/voice/decide` (existing) — Denise TTS engine (unchanged)
- `GET /api/airport/predict` (existing, poll 30s) — radar (unchanged, frontend-only enhancement)

## How to preview
Open the **Preview Panel** on the right side of the interface
(the dev server is already running on port 3000). Navigate to the
`/ops-wallboard` route. The wallboard renders at 100vh with no scroll on
1920×1080; on smaller screens it stacks vertically with scroll. All 6
new features appear in the visual flow above the main departure grid.

## Architecture — relations with previous agents
- Built on top of `task5-wallboard-ops-room-main-agent.md` (initial
  wallboard + `/api/airport/wallboard` route).
- Reuses the same dark theme + departure-board visual language.
- Compatible with `airport-prediction-radar-main-agent.md` (radar
  component enhanced in place, no breaking change to the props contract).
- Compatible with `2-airport-prediction-radar-main-agent.md` work.
- All API contracts used are pre-existing — no new routes created.
