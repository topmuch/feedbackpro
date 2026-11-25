# Task 5 — City Wallboard Airport Signage Redesign — Agent Record

**Task ID:** 5
**Agent:** city-wallboard-airport-signage-agent
**Date:** 2026-11-24
**Status:** DONE

## Objective
Redesign the existing `/city-wallboard` page (`src/app/city-wallboard/page.tsx`)
to match an airport signage aesthetic — modular rounded panels in golden yellow
`#FFD700` (alerts/tasks) + cobalt blue `#0026A3` (status/identity), white
rounded icon tiles, bold uppercase Arial typography, high contrast. All
existing functionality (polling, TTS, KPIs, incidents list, alerts panel,
sound toggle) preserved.

## Approach
Read the existing 788-line page first to map the logic surface, then rewrote
ONLY the visual layer — the entire TypeScript logic (state, refs, effects,
callbacks, polling, helpers) is byte-for-byte preserved. Only the JSX/CSS
presentation + the `KpiCard` component signature changed.

## Files touched
- MODIFIED `src/app/city-wallboard/page.tsx` (full rewrite of presentation
  layer; logic unchanged)

No other files modified.

## Design changes applied

### Color palette (constants block, lines ~47-58)
Replaced the dark Ville Connectée palette (`BG=#0a0a0a`, `CARD=#1a1a1a`,
`YELLOW=#FFDD00`, `BLUE=#1B2A8C`) with the airport signage palette:
- `YELLOW = '#FFD700'` — bright golden yellow (alert/task panels)
- `BLUE   = '#0026A3'` — deep cobalt blue (status/identity panels)
- `BLACK  = '#000000'` — text on yellow panels, footer bar
- `WHITE  = '#FFFFFF'` — icon tile backgrounds, text on blue panels, list bg
- `BG     = '#E8E8E8'` — light gray backdrop so panels pop
- `RED / GREEN / ORANGE` — status accents (kept)
- `FONT_SIGNAGE = "'Arial, Helvetica, sans-serif'"` — airport signage feel
- `PANEL_BORDER = '#D0D0D0'`, `ROW_BG = '#FAFAFA'`, `TEXT_MUTED = '#555555'`

### New helper: `typeIcon(t)`
Returns the lucide icon component per incident type:
- emergency → Siren, report → Megaphone, orientation → Compass,
  artisan → Wrench, mairie → Building2, default → AlertTriangle
- Used for the white rounded icon tile on each incident row.

### KpiCard component (full redesign)
Replaced the old `accent`-based dark card with a modular airport-signage panel:
- New props: `variant: 'yellow' | 'blue'`, optional `badgeCount`, `badgeColor`
- `variant='yellow'` → `backgroundColor: '#FFD700'`, `color: '#000'`
- `variant='blue'` → `backgroundColor: '#0026A3'`, `color: '#fff'`
- `borderRadius: '16px'`, `fontFamily: FONT_SIGNAGE`
- Structure: `[white icon tile 12px radius] → [column: LABEL uppercase / BIG NUMBER font-black text-2xl/3xl / sub-label]`
- Optional red badge pill (top-right) when `badgeCount > 0` — used for the
  Urgences card so a non-zero count screams visually.

### KPI row (6 cards) — color coding per spec
1. **Urgences** → `variant="yellow"` + `badgeCount={pendingEmergencies}` red badge
2. **Signalements** → `variant="yellow"`
3. **Orientations** → `variant="blue"`
4. **Artisans** → `variant="blue"`
5. **Satisfaction** → `variant="blue"`
6. **Revenus** → `variant="blue"`

### Header — blue panel
- `backgroundColor: '#0026A3'`, white text, `borderRadius: '0 0 16px 16px'`
- White rounded icon tile (`borderRadius: '14px'`) with `Building2` icon in black
- Title "CENTRE DE SUPERVISION URBAIN" — uppercase, `font-black`,
  `letterSpacing: '0.05em'`, responsive `text-xl md:text-3xl`
- Subtitle "Ville Connectée — Dakar" — uppercase, wide tracking
- Live clock in white (`text-2xl md:text-3xl font-black tabular-nums`) with Clock icon
- Sound toggle button: **yellow with black icon when ON**, white with blue
  icon + blue border when OFF. `borderRadius: '14px'`, `h-14 w-14`.

### Main grid `lg:grid-cols-[2fr_1fr]`
**Left column (2fr) — Incidents list (white card):**
- White background, `borderRadius: '16px'`, gray border
- Blue panel header bar with white text "INCIDENTS RÉCENTS" + AlertTriangle icon
- Each incident row = mini-panel (`borderRadius: '12px'`, `ROW_BG`):
  - White rounded icon tile (10px radius) with `typeIcon(inc.type)`
  - Category (uppercase, font-black) + lieu (MapPin + plate label · district)
  - Status badge (color from `statusColor()`, white text, uppercase)
  - Time-ago (`fmtTimeAgo`)
  - **Colored left border**: `6px solid` — RED for emergency, ORANGE for
    report, BLUE/YELLOW for orientation/artisan/mairie (via `typeColor()`),
    **GREEN if resolved** + `text-decoration: line-through` on the category +
    `opacity: 0.65` for resolved rows.
- Empty/loading states styled as uppercase muted centered panels.
- Custom scrollbar via `.wb-scroll` class + injected `<style>`.

**Right column (1fr) — Alerts panels:**
- **"URGENCES EN COURS"** — yellow panel header (`#FFD700`, black text),
  white rounded icon tile with Siren (red), red count pill badge.
  List of active emergencies: compact cards with white icon tile (Siren red),
  category (uppercase), lieu, time-ago, red left border.
- **"SIGNALEMENTS EN ATTENTE"** — blue panel header (`#0026A3`, white text),
  white rounded icon tile with Megaphone (black), blue-on-white count pill.
  List of pending reports: compact cards with Megaphone icon (orange),
  category, lieu, time-ago, orange left border.
- Each alert list `max-h-[calc(50vh-90px)] overflow-y-auto` with `.wb-scroll`.

### Footer — black bar with yellow text
- `backgroundColor: '#000000'`, `color: '#FFD700'`, `mt-auto` (sticky bottom),
  `borderRadius: '16px 16px 0 0'`, `font-black`, uppercase, wide tracking
- Left: `PLAQUES: X | ARTISANS: Y | SATISFACTION: Z/5`
- Right: `FEEDVOICE × MAIRIE DE DAKAR · VOIX: AMINATA · SON: activé/coupé · audio déverrouillé/en attente de geste`

### Custom scrollbar
Injected a `<style>` block defining `.wb-scroll` webkit + Firefox scrollbar
styling (thin, `#D0D0D0` thumb, transparent track, `#999` hover) — applied to
all overflow-y-auto containers on the page.

## Logic preserved (unchanged from prior agent)
- All imports (lucide icons + `parler` from `@/lib/staff-tts`)
- All type definitions (`CityIncidentLite`, `WallboardData`)
- All helpers: `pad`, `fmtClock`, `fmtDateFR`, `fmtTimeAgo`, `fmtFCFA`,
  `typeLabel`, `typeColor`, `statusColor`, `statusLabel` — kept verbatim.
  `typeColor` now also drives the incident-row left-border color.
- All state: `data`, `error`, `now`, `soundOn`, `audioUnlocked`
- All refs: `audioRef`, `seenIdsRef`, `firstPollRef`, `announcedRef`,
  `announcedResolvedRef`
- All effects: clock (1s), localStorage sound pref, audio-unlock on first
  gesture, polling `/api/city/wallboard` every 5s (deps `[playDing, announceIncident]`
  — same as original; the indirect `soundOn` coverage via those callbacks is
  preserved).
- All callbacks: `playDing`, `announceIncident` (Aminata TTS template),
  `toggleSound` (localStorage persistence + `speechSynthesis.cancel()` on off
  + ding + confirmation message on on).
- Polling new-incident detection (`seenIdsRef` + `firstPollRef` first-poll
  seed-only), resolved detection (`announcedResolvedRef`), 3s-spaced 3-announce
  cap, ding on salve — all identical.
- Derived data: `activeEmergencies`, `pendingReportsList`, `stats`.

## Validation
- `bun run lint` → 0 errors in `page.tsx`. The only project lint error is the
  pre-existing `react-hooks/set-state-in-effect` in
  `src/components/feedbackpro/city-dashboard.tsx:436` (unrelated, present
  before this task — same finding as the previous city-wallboard agent).
- Dev server log (`/home/z/my-project/dev.log`):
  - `GET /city-wallboard 200 in 635ms (compile: 576ms, render: 59ms)`
  - Only pre-existing `sonde-ai.ts` Edge Runtime fs/path warnings (unrelated).
- `curl http://localhost:3000/city-wallboard` → HTTP 200, HTML contains all
  expected airport-signage markers: "Centre de Supervision Urbain",
  "Urgences en cours", "Signalements en attente", "PLAQUES:", "ARTISANS:",
  "SATISFACTION:".
- Inline color audit of rendered HTML:
  - `#FFD700` × 5 (KPI yellow cards + alert header + sound toggle when ON)
  - `#0026A3` × 8 (header + KPI blue cards + incidents header + reports header)
  - `#E30613` × 2 (urgences badge + emergency accents)
  - `#00A651` × 1 (live status pulse)

## Notes for downstream agents
- The incident list is no longer a `<table>` — it is now a vertical stack of
  mini-panel rows (better matches the airport-signage "each row = panel"
  brief, and is more responsive on TV portrait/landscape orientations).
  All original data fields (type, category, lieu, statut, service, time-ago)
  are still represented; "service" (`assignedTo`) is folded into the
  yellow `→ {assignedTo}` line inside the alert cards (same as before) and
  omitted from the main row to keep each row scannable at 2m viewing distance.
  If a downstream task wants `assignedTo` back on the main row, it's a
  one-line addition next to the status badge.
- The KPI "Orientations" card still maps to `resolvedToday` (same as prior
  agent) — sublabel "Résolus aujourd'hui" makes the mapping transparent.
- The footer no longer has a top border line — the rounded black bar with
  `mt-auto` handles the sticky-bottom layout per the UI rules (no floating
  gap, natural push on overflow).
