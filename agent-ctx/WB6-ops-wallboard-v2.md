# WB6 — Ops Wallboard V2.0 Premium Refoundation

**Agent**: main-agent
**Task ID**: WB6
**Date**: 2025-11-15
**File**: `/home/z/my-project/src/app/ops-wallboard/page.tsx`
**Predecessor**: WB5 (Split-Flap Departure Board — dark/black theme)

## Objective

Completely rewrite the ops wallboard from the WB5 "Split-Flap Departure Board"
(dark gray #2B2B2B + black panel + flap tiles) to the new "Aéroport Premium
V2.0" design: light gray background (#F5F5F5), blue header (#003399) with
yellow logo (#FCD116), colored KPI cards, horizontal zone panels with colored
backgrounds per status, separated incidents table rows, premium white card
wrappers, and Roboto Condensed typography.

This was a complete visual refoundation — NOT a color tweak. ALL existing logic
(polling, sounds, TTS Denise, crisis mode, 15-min reminder, actions rapides,
zone filtering, SOS help requests, recently_resolved, dedup refs) preserved
100% verbatim.

## Result

- **File path**: `/home/z/my-project/src/app/ops-wallboard/page.tsx`
- **Line count**: 2495 lines (was 2574 in WB5)
- **Lint status**: CLEAN (`bunx eslint src/app/ops-wallboard/page.tsx` → no
  output, no errors). The repo-level `bun run lint` reports 3 pre-existing
  errors in OTHER files (`src/components/feedbackpro/scratch-card.tsx:105`,
  `src/lib/db.ts:15`) — NOT in the wallboard page.
- **TSC status**: CLEAN (`npx tsc --noEmit --skipLibCheck` → no output, no
  errors).
- **Dev server**: Running on port 3000, home route `/` returns 200 OK. No
  compile errors related to ops-wallboard.

## Design verification — V2.0 Premium

### Background
- ✅ Page background is `#F5F5F5` (light gray — NOT black, NOT dark). Confirmed
  via `PAGE_BG = '#F5F5F5'` constant applied to the root `<div>` via
  `style={{ backgroundColor: PAGE_BG }}`.

### Header
- ✅ Blue `#003399` (`BLEU` constant) background with `border-radius: 0 0 20px 20px`
  (rounded bottom only) and `box-shadow: 0 4px 10px rgba(0,0,0,0.2)`.
- ✅ Yellow logo box `#FCD116` (`JAUNE`) with `border-radius: 15px`, containing
  a white 50×50 icon container (`rounded-[10px] bg-white`) with lucide `Plane`
  icon in blue, plus "AÉROPORT OPS" (font-black) + subtitle "WALLBOARD · DIASS ·
  DÉPARTS".
- ✅ Right side: date (white) + alerts count (yellow) + LIVE badge (red
  `#E30613`, `rounded-[25px]`, ops-pulse + ops-live-pulse animations) + clock
  (yellow bg `#FCD116`, black text, `clamp(20px, 2.5vw, 36px)`,
  `rounded-[15px]`, `tabular-nums`) + MODE CRISE button (red bg, white border
  3px, `rounded-[15px]`) + sound toggle.

### KPI Row (6 colored cards)
- ✅ `grid-template-columns: repeat(6, 1fr)`, gap 15px, padding 20px 30px.
- ✅ Each card: `rounded-[15px]`, `box-shadow: 0 4px 8px rgba(0,0,0,0.1)`,
  `padding: 20px`, text-center, `min-height: 120px`.
- ✅ Card colors exactly per spec:
  - CRITIQUE: `bg-[#E30613] text-white` (red)
  - EN ATTENTE: `bg-[#FCD116] text-black` (yellow)
  - RÉSOLUS: `bg-[#00A651] text-white` (green)
  - TEMPS MOY: `bg-[#003399] text-white` (blue)
  - SLA: dynamic — green ≥80%, yellow 60-79%, red <60%, yellow if no data
  - STAFF: `bg-[#00A651] text-white` (green)
- ✅ Value: `text-5xl font-black leading-none tabular-nums` (via inline
  `fontSize: clamp(28px, 3.2vw, 48px)`).
- ✅ Label: `text-xs tracking-[2px] mt-2 font-bold` uppercase.

### Main Layout (2 columns)
- ✅ `grid-template-columns: 2fr 1fr`, gap 20px, padding 0 30px 20px.
- ✅ LEFT (Zones): white bg, `rounded-[20px]`,
  `box-shadow: 0 4px 10px rgba(0,0,0,0.1)`, padding 25px. Title "🗺 CARTE
  TEMPS RÉEL · {N} ZONES" (24px, 900, blue `#003399`, tracking 3px).
- ✅ Category blocks with label (14px, 900, black, tracking 3px,
  `border-bottom: 3px solid #FCD116`).
- ✅ Zones in `grid-cols-2 gap-3`.
- ✅ RIGHT (Alertes): white bg, same card style. Title "⚠ ALERTES ACTIVES".

### Zone Panels (KEY design element)
- ✅ Horizontal panels with colored backgrounds per status:
  - Calme (0): `bg-[#003399] text-white` (blue)
  - Attention (1-2): `bg-[#FF6B00] text-white` (orange)
  - Critique (3+): `bg-[#E30613] text-white` (red) + `ops-flash-red` animation
  - Default: `bg-[#FCD116] text-black` (yellow)
- ✅ `rounded-[15px]`, `padding: 15px 20px`, `box-shadow: 0 3px 6px
  rgba(0,0,0,0.1)`, `hover: -translate-y-0.5` (translateY -2px).
- ✅ `flex items-center justify-between`.
- ✅ Layout: [white 45×45 icon container `rounded-[10px]`] [zone name 15px 900
  tracking 1px] [status badge `bg-white/30`, 11px 900 tracking 2px,
  `rounded-[12px]`] [count 32px 900 `min-w-[50px] text-right tabular-nums`]
  [arrow circle 40×40 white `rounded-full`, `→` char, 20px black 900].

### Alerts (right column)
- ✅ Each alert: full-width card, critical=`bg-[#E30613] text-white` with
  `box-shadow: 0 4px 8px rgba(227,6,19,0.3)`, warning=`bg-[#FF6B00] text-white`.
- ✅ `rounded-[15px]`, `padding: 20px`, `margin-bottom: 15px`.
- ✅ Header: zone name (14px 900 tracking 2px) + time badge (white bg, red text,
  `rounded-[12px]`).
- ✅ Problem: 18px 900 tracking 1px.
- ✅ Buttons: white bg, black text, `rounded-[10px]`, font-black, 11px,
  `hover:bg-[#FCD116]`.

### Incidents Table
- ✅ Section title "📋 INCIDENTS DU JOUR" (24px, 900, blue, tracking 3px).
- ✅ Rows separated by gap 8px (`flex flex-col gap-2`).
- ✅ Headers: `bg-[#003399] text-white`, `padding: 14px 20px`,
  `rounded-[10px_10px_0_0]`.
- ✅ Row cells: `bg-white`, `padding: 14px 20px`, row `rounded-[10px]`,
  `box-shadow: 0 2px 4px rgba(0,0,0,0.06)`.
- ✅ Status badges: `rounded-[12px]`, `padding: 6px 14px`, `text-xs font-black
  tracking-[2px]`:
  - RÉSOLU: `bg-[#00A651] text-white`
  - EN ATTENTE: `bg-[#E30613] text-white`
  - EN COURS: `bg-[#FCD116] text-black`
- ✅ Action icons: 32×32 (`h-8 w-8`), `rounded-[8px]`, `bg-[#003399]
  text-white`, danger=`bg-[#E30613]`.
- ✅ Time: red `#E30613` if > 15min elapsed (EN RETARD), `font-black`.

### Radar Prédiction
- ✅ Title "🔮 RADAR PRÉDICTION — ÇA VA PÉTER DANS 20 MIN ?" (20px, 900, blue,
  tracking 3px).
- ✅ Wrapped in premium white card (`rounded-[20px] bg-white`, shadow,
  padding 25px) with inner `rounded-[15px] bg-[#F5F5F5]` wrapper around the
  `<AirportPredictionRadar />` component (preserved from previous version —
  its internal dark theme remains, but the outer wrapper is premium white).

### Legend Bar
- ✅ White bg, `rounded-[15px]`, `box-shadow`, `margin: 0 30px 20px`.
- ✅ `flex gap-8 padding: 20px 30px`.
- ✅ Legend boxes: `size-5 rounded-[5px]` (20×20, 5px radius).
- ✅ Colors: red (`#E30613`), orange (`#FF6B00`), yellow (`#FCD116`), green
  (`#00A651`), blue (`#003399`).
- ✅ Right-aligned hint text (CLIC ZONE POUR FILTRER · {N} TOTAL 24H).

### Typography
- ✅ Font: `'Roboto Condensed', Arial, sans-serif` loaded via Google Fonts
  `@import` in a `<style>` tag at the top of the component:
  `@import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@700;900&display=swap');`
- ✅ Applied to root `<div>` via `style={{ fontFamily: "'Roboto Condensed',
  Arial, sans-serif" }}`.
- ✅ ALL TEXT UPPERCASE (root `uppercase` class + all text spans use uppercase
  styling).
- ✅ font-weight: 700 (bold) for labels / 900 (black) for titles and values
  (`font-bold` / `font-black`).
- ✅ letter-spacing: 1-4px depending on element (1px for names/values, 2px for
  labels/badges, 3px for section titles).

## Preserved functionality (100% — verified)

All logic from the WB5 file is preserved verbatim. Only the visual rendering
layer changed. Verified via grep:

### State & refs (29 occurrences)
- `data`, `error`, `now`, `freshIds` (state)
- `seenIdsRef`, `firstLoadRef`, `previousStatusRef`, `announcedResolvedRef`,
  `alertedLateRef`, `escalationStartedRef`, `audioRef`, `announcedAlertsRef`
  (refs)
- `alerts`, `alertsError`, `filterZone`, `crisisMode`, `crisisStart`,
  `crisisSummary`, `leaderboard`, `actionToast`, `soundOn`, `showSoundBanner`
  (state)

### Polling intervals (unchanged)
- `/api/airport/wallboard` every **5s** (line 1417)
- `/api/airport/alerts/check` every **30s** (line 1452)
- `/api/airport/leaderboard` every **60s** (line 1472)
- Clock every **1s** (line 1559)

### Sound system
- `SOUND_NORMAL` = `/sounds/ding-dong.mp3` (line 361)
- `SOUND_CRITICAL` = `/sounds/ding-critical.wav` (line 362)
- `SOUND_RESOLVED` = `/sounds/resolved.wav` (line 363)
- `playSound()` function (sets src, volume 0.6, plays with catch)
- `playEscalationDing()` Web Audio (660/880/990 Hz sine, 0.18s stagger,
  0.25 gain, 0.16s decay) — preserved verbatim

### TTS Denise
- `speak()` function with race-condition fix (no `cancel()` before speak —
  instead: if speaking, cancel + setTimeout 50ms then speak; else speak
  directly)
- `decideAndSpeakForWallboard()` async function calling `/api/voice/decide`
- `void decideAndSpeakForWallboard` statement (marks function as used)

### 15-min reminder
- `alertedLateRef` Set tracks `${r.id}-${t}min` keys for t in [15, 20, 25, 30…]
- `escalationStartedRef` prevents firing on first load
- Plays `playEscalationDing()` + speaks retard message
- Cleans up keys when report resolved/removed

### Sound toggle
- `toggleSound()` reads/writes `localStorage['wallboard_sound']` ('1'/'0')
- Shows `showSoundBanner` for 10s if no preference on first load
- Plays SOUND_NORMAL + speaks "Son activé." when turning on
- Cancels speechSynthesis when turning off

### Crisis mode
- `handleCrisisStart()`: sets crisisMode, crisisStart, plays escalation ding,
  speaks crisis message
- `handleCrisisEnd()`: clears crisisMode, computes duration summary, speaks
  summary, shows summary banner for 6s
- `crisisElapsedSec` memo updates every second via `now`
- `isCriticalInCrisis()` filter (elapsedMin > 10 OR security/medical/urgency
  zones OR sanitaires OR routedTeam === 'securite')
- `CrisisButtonV2` component: red bg + white border 3px + rounded 15px when
  inactive; red pulse + timer + green FIN button when active

### Actions rapides per row
- `[ASSIGNER]` button → opens menu with 5 teams (nettoyage, maintenance,
  securite, accueil, logistique) → POST `/api/airport/assign`
- `[APPELER]` button → `window.open('tel:+221784858226')`
- `[ESCALADER]` button → POST `/api/airport/staff-scan` with
  `action: 'TAKE_CHARGE'`, `staffTag: 'wallboard_supervisor'`
- Toast feedback via `handleActionFeedback` (ok/err, 3.5s display)

### Zone filtering
- Click zone panel → `setFilterZone(code)` → filters `filteredRows` by
  `r.zone?.code === filterZone`
- Active zone gets white outline (3px)
- "✕ FILTRE: {zone}" button appears in zones section header to clear

### SOS help requests
- `HelpRequestAlertCard` component displays SOS alerts (orange/red card with
  zone name, message, time badge, "APPELER VOYAGEUR" tel: link)
- Rendered from `data.help_requests?.slice(0, 3)`

### recently_resolved
- On each poll, checks `d.recently_resolved` array
- For each new resolved id (not in `announcedResolvedRef`):
  - Plays `SOUND_RESOLVED`
  - Speaks "Signalement résolu. {zone}. {problemType}. Bien fait."
- Cleans up `announcedResolvedRef` when ids leave the active set

### Alert deduplication
- `announcedAlertsRef` Set tracks `${thresholdId}-${type}` keys
- Only announces critical alerts not already announced
- Plays `SOUND_CRITICAL` + speaks alert message
- Cleans up when alerts leave active set

## Components rewritten for V2.0

| Old (WB5) | New (WB6) | Purpose |
|-----------|-----------|---------|
| `FlapTile` | (removed) | Base split-flap tile — not needed in V2.0 |
| `FlapString` | (removed) | Per-character flap tiles — not needed |
| `KpiTile` | `KpiCard` | Colored card with value + label |
| `ZoneTile` | `ZonePanel` | Horizontal colored panel with icon/name/badge/count/arrow |
| `ActionFlapTile` | (removed) | Small flap action button — replaced with direct buttons |
| `AlertTileRow` | `AlertCard` | Full-width red/orange alert card |
| `ReportAlertTileRow` | `ReportAlertCard` | Full-width report alert card with action buttons |
| `HelpRequestTileRow` | `HelpRequestAlertCard` | Full-width SOS alert card |
| `IncidentFlapRow` | `IncidentRow` | White rounded row with colored status badge + 32×32 action icons |
| `PlaceholderFlapRow` | `PlaceholderRow` | Gray skeleton row |
| `SlaTileRow` | `SlaRow` | SLA row with colored pct badge |
| `ChargeTileRow` | `ChargeRow` | Charge row with colored progress bar + count badge |
| `KpiSkeletonFlap` | `KpiSkeleton` | Gray skeleton KPI card |
| `RowSkeletonFlap` | `RowSkeleton` | Gray skeleton incident row |
| `MiniRowSkeletonFlap` | `MiniRowSkeleton` | Gray skeleton mini row |
| `CrisisButtonFlap` | `CrisisButtonV2` | Red crisis button with white border 3px |

## Color palette (V2.0 — final)

```js
const JAUNE = '#FCD116'   // Yellow IATA — logo bg, clock bg, zone default, SLA badge
const BLEU = '#003399'    // Airport blue — header bg, calm zones, table headers, action icons
const NOIR = '#000000'    // Black — text on yellow
const BLANC = '#FFFFFF'   // White — card bg, text on colored bg
const ROUGE = '#E30613'   // Alert red — critical zones, LIVE badge, crisis, EN ATTENTE status
const VERT = '#00A651'    // Success green — resolved status, calm KPI, staff KPI
const ORANGE = '#FF6B00'  // Warning orange — attention zones, warning alerts
const PAGE_BG = '#F5F5F5' // Light gray — page background (makes panels pop)
```

## Animations (preserved + new)

- `opsPulse` — opacity pulse 1.4s (LIVE badge, crisis active)
- `opsFlashRed` — bg color flash #E30613 ↔ #FF0000 2s (critical zones)
- `opsFlashRedRow` — bg color flash white ↔ #FFE5E7 1.2s (late incident rows)
- `opsFlapIn` — slide-in from -6px 0.5s (new reports)
- `opsLivePulse` — scale + opacity pulse 1.4s (LIVE dot)
- `ops-crisis-overlay` — subtle red tint on main layout during crisis
- Custom scrollbar styling (blue thumb, gray track)

## Notes for future agents

1. The `<AirportPredictionRadar />` component (`src/components/feedbackpro/airport-prediction-radar.tsx`)
   is preserved with its original dark slate theme inside a premium white
   wrapper. If a future task wants the radar cards themselves restyled to
   match V2.0 (white bg, blue icon squares, etc.), that component would need
   to be refactored to expose its prediction data or be restyled internally.

2. The incidents table uses flex-based rows with `gap-2` rather than a real
   `<table>` with `border-spacing`. This achieves the "separated rows with
   rounded corners" effect more reliably in a responsive layout. Each row is
   a `flex` container with `rounded-[10px]` and its own shadow.

3. The KPI SLA card color is dynamic (green/yellow/red based on
   `overallSlaPctNum`), computed via `slaCardCls` memo. The other 5 KPI cards
   have fixed colors per the spec.

4. All `suppressHydrationWarning` attributes on clock/value spans are
   preserved to avoid hydration mismatches (server vs client time).
