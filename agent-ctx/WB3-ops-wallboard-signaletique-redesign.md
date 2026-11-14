# WB3 — Ops Wallboard "Signalétique Aéroportuaire" Redesign

## Scope
Completely rewrite `/home/z/my-project/src/app/ops-wallboard/page.tsx`
with a new visual design inspired by airport signage panels
(IATA yellow #FCD116 + deep black #0A0A0A + flat high-contrast
uppercase typography). All existing functionality preserved:
polling 5s/30s/60s/1s, sound system (ding-dong/ding-critical/
resolved/escalation 660/880/990Hz), Denise TTS via voice-decision
engine, 15-min reminder, sound toggle (localStorage), Mode Crise
with timer, Actions rapides (🔧/📞/📢), zone map filtering,
prediction radar, bottom SLA + charge strip.

## File delivered

### `src/app/ops-wallboard/page.tsx` — 2235 → 2596 lines (+361)

**Layout (top to bottom) — Signalétique Aéroport style:**

1. **HEADER** — full-width yellow bar (`#FCD116`) with black text
   - Left: black logo box with yellow `Plane` icon + "AÉROPORT OPS"
     (32px black) + subtitle "WALLBOARD · DIASS · DÉPARTS"
   - Center: date in FR + alert count
   - Right: LIVE badge (red, pulsing via custom `ops-live-dot` /
     `ops-live-blink` keyframes) + Clock 42px black-on-yellow
     tabular-nums + MODE CRISE button (border 2px red, pulsing) +
     Sound toggle (black box)

2. **KPI ROW** — 6 tiles, no gaps (`grid-cols-3 lg:grid-cols-6`)
   - Each tile: black bg, 2px right border `#333`, 4px bottom border
     colored by accent
   - Giant numbers `clamp(28px, 5vw, 56px)` font-weight 900
   - Labels 12px bold uppercase letter-spacing 2px `#999`
   - Numbers colored: CRITIQUE=red, EN ATTENTE=yellow/red, RÉSOLUS=
     green, TEMPS MOY.=yellow, SLA=green/orange/red, STAFF=green/
     yellow
   - `KpiTile` sub-component with `accent` prop mapping to IATA
     color hex codes

3. **MAIN GRID** — `grid-cols-1 lg:grid-cols-[2fr_1fr]` separated
   by 3px border `#222`

   **LEFT — Zone Map (signalétique)**
   - Section header: "CARTE TEMPS RÉEL · 25 ZONES" 16px yellow
     letter-spacing 4px
   - 5 family groups (EXTÉRIEUR / SÛRETÉ / TERMINAL / COMMERCIAL /
     SERVICE) each with:
     - Yellow ▶ prefix + 13px label letter-spacing 4px
     - Bottom border 2px `#333`
     - Grid `grid-cols-3 sm:grid-cols-5 lg:grid-cols-6` of
       `ZoneTile` components
   - Each `ZoneTile`:
     - 3px border colored by status (green/yellow/red)
     - Critical: `ops-flash-red` animation (rgba red bg pulse) +
       red border + red-tinted bg
     - Active filter: yellow border + yellow box-shadow ring
     - Emoji 22px + truncated UPPERCASE name 10px + count 20px
   - Below map: 3 mini info-bars (borderLeft 4px colored) for
     ZONE CRITIQUE / TENDANCE 24H / TOP PERFORMER

   **RIGHT — Active Alerts Panel**
   - Section header: "ALERTES ACTIVES" 16px yellow with 3px yellow
     bottom border
   - Scrollable list (`max-h-[420px] lg:max-h-[520px] overflow-y-auto`)
   - Combines:
     - `AlertCard` for threshold alerts from `/api/airport/alerts/
       check` (max 4) — 3px border + 8px left border colored by
       severity (red critical / yellow warning), flashRed for
       critical
     - `ReportAlertCard` for EN_ATTENTE/EN_COURS signalements
       (fills up to 4 total) — same border style + action buttons
       (APPELER OPS / ASSIGNER with dropdown / ESCALADER)
       all yellow bg `#FCD116` black text 11px uppercase

4. **INCIDENTS TABLE**
   - Yellow header row (`#FCD116` bg, `#0A0A0A` text 13px 900 weight
     letter-spacing 2px): ZONE / PROBLÈME / STATUT / ÉQUIPE / IL Y A
   - Body rows alternating `#0A0A0A` / `#111111`, 2px border-top
     between cells `#222`
   - `IncidentRow` sub-component (5-col grid):
     - Zone cell: status dot (red if late) + emoji + UPPERCASE yellow
       name 14px
     - Problem cell: white bold uppercase 14px
     - Statut cell: bordered badge with status color + EN RETARD
       badge (pulsing red) if > 15 min
     - Équipe cell: team emoji + UPPERCASE label + 3 action buttons
       (🔧 yellow border / 📞 yellow border / 📢 red border)
     - IL Y A cell: tabular-nums UPPERCASE red if late, white
       otherwise
   - Late rows: red-tinted background `rgba(255,59,48,0.08)`
   - `PlaceholderRow` with `· · ·` dots for empty slots

5. **PREDICTION RADAR** — preserved `<AirportPredictionRadar>`
   wrapped in a 3px-yellow-top-border section with yellow header
   "RADAR PRÉDICTION — ÇA VA PÉTER DANS 20 MIN ?"

6. **BOTTOM STRIP** — `grid-cols-1 lg:grid-cols-2` with 3px yellow
   top border
   - LEFT: SLA PAR ZONE — 6 `SlaBottomRow` (2-col grid on sm+)
     with emoji + UPPERCASE name + ≤target + colored pct
   - RIGHT: CHARGE PAR ZONE — 6 `ZoneChargeRow` with emoji +
     UPPERCASE name + colored progress bar (red/yellow/gray) +
     count

7. **LEGEND BAR** — bottom strip with 3 colored dots + labels
   (CALME green / ATTENTION yellow / CRITIQUE red) + reminder
   "CLIC SUR UNE ZONE POUR FILTRER · X TOTAL 24H"

## CSS Keyframes (injected via `<style>` tag in JSX)
- `opsPulse` — opacity 1 → .55 → 1 (1.4s ease-in-out infinite)
- `opsFlashRed` — background rgba(255,59,48,0.12) → 0.28 → 0.12
  (1.2s ease-in-out infinite) — applied to critical zones + alerts
- `opsFadeIn` — opacity 0 + translateY(-8px) → opacity 1 +
  translateY(0) (0.5s ease-out) — applied to fresh incident rows
- `opsPing` — scale(1) opacity 1 → scale(2) opacity 0 (1.4s
  cubic-bezier) — applied to LIVE badge dot via ::before
- `opsLiveBlink` — opacity 1 → 0.4 → 1 — applied to LIVE text +
  error dot

Helper CSS classes:
- `.ops-pulse` — animation: opsPulse 1.4s ease-in-out infinite
- `.ops-flash-red` — animation: opsFlashRed 1.2s ease-in-out infinite
- `.ops-fade-in` — animation: opsFadeIn 0.5s ease-out
- `.ops-crisis-overlay` — background-color: rgba(255,59,48,0.06)
- `.ops-live-dot` — relative + ::before red ping animation
- `.ops-live-blink` — animation: opsLiveBlink 1.4s ease-in-out infinite

## Color palette (IATA standard)
- Background: `#0A0A0A` (deep black, NOT slate/neutral)
- Primary yellow: `#FCD116` (IATA standard yellow)
- Accent yellow: `#FFD700`
- White text: `#FFFFFF`
- Red alert: `#FF3B30`
- Green OK: `#34C759`
- Orange warning: `#FF9500`
- Gray text: `#999999`
- Borders: 3px yellow `#FCD116` for section dividers, 2px `#333` /
  `#222` for tiles/cells

## Functionality preserved (100%)
- **Polling**: `/api/airport/wallboard` every 5s,
  `/api/airport/alerts/check` every 30s, `/api/airport/leaderboard`
  every 60s, clock 1s
- **Sound system**: `SOUND_NORMAL` (ding-dong.mp3) +
  `SOUND_CRITICAL` (ding-critical.wav) + `SOUND_RESOLVED`
  (resolved.wav) + `playEscalationDing()` (Web Audio API 660/880/
  990 Hz triple-ding)
- **Denise TTS**: `decideAndSpeakForWallboard()` via
  `/api/voice/decide` (POST with VoiceEvent payload) +
  `speak()` fallback for resolved/escalation announcements
- **15-min reminder**: `alertedLateRef` Set tracks thresholds per
  reportId + 5min increments (15/20/25/30…). Badge "EN RETARD"
  pulsing red on IncidentRow + ReportAlertCard. Escalation sound
  + TTS "Signalement en retard. X minutes écoulées…" at each new
  threshold crossed
- **Sound toggle**: button in header, persists to
  `localStorage['wallboard_sound']`. Bannière d'activation
  auto-dismiss 10s if never activated
- **Crisis mode**: `CrisisButton` toggles `crisisMode` → filters
  `filteredRows` to `isCriticalInCrisis(r)` (statut ≠ RESOLU +
  elapsed > 10min OR sec_/medical/urg_ zone OR routedTeam=securite).
  Timer `crisisElapsedSec` updates every 1s via `now` state.
  Activation: `playEscalationDing()` + TTS "Mode crise activé".
  Deactivation: 6s summary banner "Crise terminée — Durée: Xmin Ys"
  + TTS. Overlay: `.ops-crisis-overlay` adds red-tinted bg
- **Actions rapides per row**: 3 icon buttons in IncidentRow
  (🔧 ASSIGNER → POST /api/airport/assign with team dropdown /
  📞 APPELER → tel:+221784858226 / 📢 ESCALADER → POST
  /api/airport/staff-scan with action=TAKE_CHARGE). Toast feedback
  3.5s in the table container (ok green / err red)
- **Zone map filtering**: click `ZoneTile` → toggles `filterZone`
  state → `filteredRows` filters by `r.zone?.code === filterZone`.
  Active tile shows yellow ring. "✕ FILTRE" button clears
- **Prediction radar**: `<AirportPredictionRadar className="w-full" />`
  preserved in dedicated section
- **Bottom strip**: SLA per zone (6 rows) + Charge par zone (6 rows)
  preserved as `SlaBottomRow` + `ZoneChargeRow`
- **All data types preserved**: WallboardData, ZoneAgg, RecentReport,
  SlaStats, LeaderboardEntry, LeaderboardData, TriggeredAlert,
  AlertsCheckResponse, TeamKey, Statut, Trend, ZoneFamily,
  ZoneStatus, VoiceEvent, VoiceDecision
- **All helper functions preserved**: relativeTime (+ new
  relativeTimeSignaletique for UPPERCASE short version),
  formatClock, formatDateFR, statutMeta (refactored to return
  IATA colors instead of Tailwind classes), teamMeta,
  formatDurationMin, formatDurationSec, zoneFamily, truncateName,
  zoneStatus + ZONE_STATUS_META (refactored to color hex codes),
  isCriticalInCrisis, fetchWallboard, fetchAlerts, playSound,
  speak, decideAndSpeakForWallboard, playEscalationDing
- **All state preserved**: data, error, now, freshIds, seenIdsRef,
  firstLoadRef, previousStatusRef, announcedResolvedRef,
  alertedLateRef, escalationStartedRef, soundOn, audioRef,
  announcedAlertsRef, showSoundBanner, alerts, alertsError,
  filterZone, crisisMode, crisisStart, crisisSummary, leaderboard,
  actionToast
- **All effects/handlers preserved**: poll (5s), pollAlerts (30s),
  leaderboard polling (60s), clock 1s, localStorage sound load,
  toggleSound, handleCrisisStart/End, handleActionFeedback,
  15-min escalation effect, handlers for report call/assign/
  escalate

## What changes (vs previous departure-board style)
- Background: `bg-neutral-950` → `bg-[#0A0A0A]` (deep black)
- Header: dark gradient amber→orange → solid yellow bar `#FCD116`
  with black text
- KPI tiles: small monospace tiles → giant 56px signalétique tiles
  with colored bottom borders
- Statut badges: Tailwind class-based (amber/sky/green) → IATA hex
  colors (#FCD116 / #FF9500 / #34C759) via inline `style`
- Zone map: soft rounded cards with Tailwind ring classes →
  3px-bordered signalétique tiles with inline border colors +
  flashRed animation
- Board rows: dot-matrix grid with monospace → 5-col incidents
  table with yellow header row + alternating row bg + bordered
  status badges
- Alerts: banner rows below header → right-side panel cards with
  severity-colored left border + yellow action buttons
- Footer: 2-column SLA/charge → preserved 2-col layout but
  restyled with 2px borders + colored bars
- Added: legend bar at the very bottom with colored dots + filter
  reminder

## Technical notes
- All IATA colors applied via inline `style={{ backgroundColor:
  '#FCD116' }}` or Tailwind arbitrary values `bg-[#FCD116]` /
  `text-[#FF3B30]` (preferred inline for clarity in component
  internals)
- ALL TEXT UPPERCASE via `.toUpperCase()` on dynamic strings +
  `font-bold uppercase` Tailwind class on labels
- Letter-spacing via inline `letterSpacing: '2px'` /
  `'4px'` for headings
- Font: system bold sans-serif via Tailwind `font-black` /
  `font-bold` (no custom font loading)
- Responsive:
  - Mobile: KPI 3-col, main grid stacks (zone map full width →
    alerts below → table below → radar → bottom strip → legend)
  - Desktop lg+: KPI 6-col, main grid 2fr+1fr, all sections
    visible side-by-side
- Single-file overwrite, `'use client'` directive at top
- Default export `OpsWallboardPage` preserved
- `Map as MapIcon` alias preserved (avoids shadowing JS `Map`
  class used in `useRef<Map<string, string>>`)

## Lint + tsc status
- `bun run lint`: 0 errors in ops-wallboard/page.tsx (3 unrelated
  pre-existing errors in language-selector.tsx, scratch-card.tsx,
  db.ts)
- `npx tsc --noEmit --skipLibCheck`: 0 errors in ops-wallboard/
  page.tsx (6 unrelated pre-existing errors in
  voice-decision-engine.ts around line 287-313 — 'rule' possibly
  null)
- Dev log: no ops-wallboard compile errors. `GET / 200` returned
  successfully after rewrite

## Sections built (8 total)
1. Header (yellow IATA bar with logo + clock + LIVE + MODE CRISE
   + sound toggle)
2. Sound activation banner (yellow, auto-dismiss 10s)
3. Crisis summary banner (post-deactivation, 6s, green)
4. Crisis active banner (red, while crisisMode)
5. KPI ROW (6 giant signalétique tiles)
6. MAIN GRID (2fr zone map + 1fr alerts panel)
7. INCIDENTS TABLE (yellow header + alternating rows + actions)
8. PREDICTION RADAR (preserved, signalétique-styled wrapper)
9. BOTTOM STRIP (SLA per zone + Charge par zone, 6 rows each)
10. LEGEND BAR (3 colored dots + filter reminder + total count)

## Functionality preserved checklist
- [x] Polling 5s/30s/60s/1s (wallboard/alerts/leaderboard/clock)
- [x] Sound system (3 audio files + Web Audio escalation 660/880/
      990Hz)
- [x] Denise TTS via /api/voice/decide
- [x] 15-min reminder (badge EN RETARD + escalation sound at
      15/20/25/30min)
- [x] Sound toggle (localStorage persistence)
- [x] Crisis mode (button + timer + filter critical + overlay)
- [x] Actions rapides (🔧/📞/📢 per row)
- [x] Zone map filtering (click zone → filter table)
- [x] Prediction radar (AirportPredictionRadar component)
- [x] Bottom strip (SLA per zone + Charge par zone)
- [x] All data types (WallboardData, TriggeredAlert, etc.)
- [x] All helper functions (relativeTime, formatClock, statutMeta,
      teamMeta, zoneFamily, zoneStatus, isCriticalInCrisis,
      fetchWallboard, fetchAlerts, playSound, speak,
      decideAndSpeakForWallboard, playEscalationDing)
- [x] All state + refs + effects
- [x] Default export OpsWallboardPage
- [x] 'use client' directive
