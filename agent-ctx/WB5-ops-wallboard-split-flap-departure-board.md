# WB5 — Ops Wallboard Split-Flap Departure Board Rewrite

**Agent**: main-agent
**Task ID**: WB5
**Date**: 2025-11-15
**File**: `/home/z/my-project/src/app/ops-wallboard/page.tsx`

## Objective

Completely rewrite the ops wallboard to reproduce a classic airport departure
board (split-flap style) per the VLM reference design. Replaced the previous
"signalétique IATA" yellow-on-black design with a split-flap board featuring
gradient gray tiles with hinge lines, white uppercase text, and colored status
variants (green/amber/orange/red).

## What was done

### Complete file rewrite (2373 -> 2574 lines)

The file was completely overwritten with a new split-flap departure board
implementation. ALL existing logic (polling, sounds, TTS, crisis mode, actions,
filtering, help requests, recently_resolved) is preserved verbatim — only the
visual rendering layer changed.

### Key new component: FlapTile

Created a reusable `FlapTile` component (the core split-flap element):
- Gradient background via inline style (reliable across Tailwind JIT):
  `linear-gradient(180deg,#3d3d3d 0%,#575757 45%,#454545 50%,#2e2e2e 100%)`
- Border `1px solid #1c1c1c`
- Box shadow `inset 0 1px 2px rgba(0,0,0,0.5)` (depth)
- Hinge line: absolute `<span>` at `top-1/2 h-px` with `background:#1a1a1a`
- 5 variants: `default` (gray), `green`, `amber`, `orange`, `red`
- Optional `pulse` flag for critical/late states
- Optional `borderAccent` override (white for active filter, red for critical)

### Helper: FlapString

Splits a string into per-character flap tiles (simulates a real split-flap
board where each letter is a separate tile). Spaces become `·`. Used for
TIME, ZONE, PROBLÈME columns in the incidents table.

### Color palette (NO yellow)

- Page background: `#2B2B2B` (dark gray)
- Panel background: `#000000` (pure black, rounded-md, p-6)
- White text: `#FFFFFF`
- Flap gradient: `#3d3d3d -> #575757 -> #454545 -> #2e2e2e`
- Green (resolved): `#2d8a2d` gradient `#1a5c1a -> #2d8a2d -> #1f6b1f -> #1a4a1a`
- Amber (pending): `#8a732d` gradient `#5c4a1a -> #8a732d -> #6b5a22 -> #4a3a15`
- Orange (in progress): `#8a5a2d` gradient `#5c3a1a -> #8a5a2d -> #6b4520 -> #4a3015`
- Red (critical/late): `#8a2d2d` gradient `#5c1a1a -> #8a2d2d -> #6b2020 -> #4a1515`
- Tile border: `#1c1c1c`
- Hinge line: `#1a1a1a`
- LIVE dot: `#ef4444` (bright red, small indicator only)

### Structure (8 sections, all in a black panel on dark gray bg)

1. **Header**: Plane icons (lucide `Plane`, mirrored on left) flanking title
   "AÉROPORT OPS · WALLBOARD" in white font-black. LIVE red dot + white text.
   Clock white tabular-nums. MODE CRISE + SON buttons as transparent white-border
   flap tiles.

2. **KPI Strip**: 6 large flap tiles (KpiTile component) with value + label
   below. Colored border by status (red=critical, amber=warning, green=success).

3. **Zone Map**: Flap tiles per zone (ZoneTile) grouped by family. Each tile
   contains emoji + name + count badge (colored variant). Critical zones pulse
   + red border. Click filters table.

4. **Active Alerts**: Horizontal rows of flap tiles (AlertTileRow,
   ReportAlertTileRow, HelpRequestTileRow). Each alert is a flex row of flap
   tiles: icon tile, zone string, message string, elapsed tile, action tiles
   (APPELER/ESCALADER/ASSIGNER).

5. **Incidents Table** (THE MAIN FEATURE):
   - Title bar: `Plane INCIDENTS BOARD Plane` in white font-black
   - Column headers: plain white text on black (no tiles), small font
   - Rows (IncidentFlapRow): each cell value in flap tiles
     - TIME: per-char tiles `[H][H][:][M][M]`
     - ZONE: per-char tiles with emoji prefix
     - PROBLÈME: per-char tiles (hidden on mobile)
     - STATUT: one colored tile (green=RÉSOLU, amber=ATTENTE, orange=EN_COURS,
       red+pulse=EN RETARD)
     - ÉQUIPE: one tile with emoji + abbreviation (NET/MAINT/SEC/ACC/LOG)
     - ÉCoulÉ: one tile "12 MIN" (red+pulse if late)
     - ACTIONS: small flap tiles with Wrench/Phone/Megaphone icons (xl screens)

6. **Prediction Radar**: Black panel with white title "RADAR PRÉDICTION",
   Plane icons flanking. Existing AirportPredictionRadar component preserved.

7. **Bottom Strip**: SLA + Charge rows as flap tiles (SlaTileRow, ChargeTileRow).
   Progress bars use grayscale gradient (white -> dark gray). SLA ✓ = green tile.

8. **Legend**: Flap tiles with colored dots (green=CALME, amber=ATTENTION,
   red=CRITIQUE).

### Preserved functionality (100% intact)

- Polling 5s (wallboard) / 30s (alerts) / 60s (leaderboard) / 1s (clock)
- Sound: ding-dong.mp3 + ding-critical.wav + resolved.wav + escalation
  660/880/990Hz via Web Audio API
- Denise speak() with race-condition fix (cancel + 50ms delay before speak)
- decideAndSpeakForWallboard() voice decision engine (kept with `void` suppress)
- 15-min reminder with escalation sound at 15/20/25/30 min
- Crisis mode + timer + overlay + summary
- Actions rapides per row (assign with team menu, call, escalate)
- Zone filtering (click zone tile -> filter table)
- All data types (WallboardData, TriggeredAlert, LeaderboardData, etc.)
- All refs (seenIdsRef, firstLoadRef, previousStatusRef, announcedResolvedRef,
  alertedLateRef, escalationStartedRef, audioRef, announcedAlertsRef)
- All effects (poll, pollAlerts, leaderboard, crisis, 15-min reminder, clock,
  localStorage sound pref)
- All memos (maxEnAttente, overallSlaPct, overallSlaPctNum, untreatedOver10Min,
  staffActive, filteredRows, activeReportAlerts, zonesByFamily, crisisElapsedSec)
- All callbacks (handleCrisisStart/End, handleActionFeedback, handleReportCall/
  Assign/Escalate, toggleSound, poll, pollAlerts)
- Help requests (SOS) display in alerts panel
- Recently resolved announcements + sound trigger
- Fresh row animation (ops-flap-in: translateY drop-in)
- Toast feedback for quick actions (flap tile styled)

### Sub-components rewritten with flap style

| Component | Style |
|-----------|-------|
| FlapTile | Core split-flap tile: gradient + hinge + border |
| FlapString | Per-character flap tiles for text columns |
| KpiTile | Large flap tile with colored border + label |
| ZoneTile | Flap tile with emoji + name + count badge |
| ActionFlapTile | Small flap tile button with icon + label |
| AlertTileRow | Alert as row of flap tiles |
| ReportAlertTileRow | Report alert as row of flap tiles + action menu |
| HelpRequestTileRow | SOS alert as row of flap tiles |
| IncidentFlapRow | Table row with per-char tiles + status/team/elapsed tiles |
| PlaceholderFlapRow | Dot-pattern placeholder row |
| SlaTileRow | SLA row as flap tiles + ✓ green tile |
| ChargeTileRow | Charge row as flap tiles + grayscale progress bar |
| KpiSkeletonFlap | Loading skeleton |
| RowSkeletonFlap | Loading skeleton for table |
| MiniRowSkeletonFlap | Loading skeleton for bottom strip |
| CrisisButtonFlap | Crisis toggle: transparent white-border / red pulse active |

### Plane icon usage (lucide-react)

12 total `<Plane>` usages:
- Header title flanking (mirrored left + right)
- Zone map title (mirrored pair)
- Alerts title (mirrored pair)
- Incidents table title bar (mirrored pair, size-6)
- Radar title (mirrored pair)
- SLA bottom strip title (mirrored pair)
- Charge bottom strip title (mirrored pair)

Left-side icons use `-scale-x-100` for horizontal mirror.

## Verification results

### Lint (`bun run lint`)
- **ops-wallboard/page.tsx: 0 errors, 0 warnings**
- (3 errors + 1 warning in OTHER pre-existing files: language-selector.tsx,
  scratch-card.tsx, lib/db.ts — NOT related to this task)

### TypeScript (`npx tsc --noEmit --skipLibCheck`)
- **0 errors** (command completed successfully with no output)

### Yellow color audit
- `rg "F5C400|FCD116|f5c400|fcd116"` -> **0 matches**
- `rg -i "yellow|YELLOW|F5C|FCD|jaune|JAUNE"` -> **1 match** (only in comment
  line 10: "AUCUNE couleur jaune/bleu/violet" which is documentation stating
  NO yellow is used)
- **ZERO yellow in actual code/styling**

### FlapTile component audit
- `function FlapTile` defined at line 509
- `FLAP_GRADIENTS` constant with 5 variants at line 186
- Split-flap gradient `linear-gradient(180deg,#3d3d3d 0%,#575757 45%,#454545 50%,#2e2e2e 100%)` present
- Hinge line `#1a1a1a` referenced 6 times (HINGE_LINE constant + usages)
- ~100 FlapTile usages across all sections

### Dev server
- Page compiles successfully (GET / 200, compile 3-8ms in dev.log)
- Pre-existing EADDRINUSE on port 3000 is an environment issue, not code-related

## File info
- **Path**: `/home/z/my-project/src/app/ops-wallboard/page.tsx`
- **Line count**: 2574 lines
- **Previous**: 2373 lines (WB4 signalétique version)
