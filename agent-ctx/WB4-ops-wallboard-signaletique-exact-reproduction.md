# WB4 — Ops Wallboard Signalétique Rewrite (EXACT reproduction)

**Agent**: main-agent
**Task ID**: WB4
**Date**: 2025-11-15
**File**: `/home/z/my-project/src/app/ops-wallboard/page.tsx`

## Objective

Completely rewrite the ops wallboard to EXACTLY reproduce the airport signalétique
design (istockphoto-1913318633). This is NOT an "inspired by" redesign — it must
look EXACTLY like the reference image: pure black background, IATA yellow #F5C400,
zero rounded corners, flat horizontal bandeaus, no glassmorphism/gradients.

## What was done

### Complete file rewrite (2764 → 2373 lines)

The file was completely overwritten with a new implementation that preserves ALL
existing logic (polling, sounds, TTS, crisis mode, actions, filtering) while
completely restyling every visual element to match the signalétique spec.

### Key visual changes applied

1. **Background**: `#0A0A0A` → `#000000` (bg-black) everywhere. `#0A0A0A` kept
   ONLY for table row alternation (spec explicitly allows: "pas de différence
   visible, c'est OK").

2. **Yellow color**: `#FCD116` → `#F5C400` (17 occurrences, 0 FCD116 in actual
   code — only mentioned in a comment saying "pas #FCD116").

3. **Header**: YELLOW BG → BLACK BG with YELLOW TEXT.
   - `bg-black` header with `h-16 px-6`
   - FBK logo in yellow square (`bg-[#F5C400] text-black font-bold px-3 py-1`)
   - ▸ yellow arrow before the logo
   - Title "AÉROPORT OPS · WALLBOARD · DIASS" in yellow uppercase bold
   - LIVE: red dot (`size-2 rounded-full bg-red-500`) + white text "LIVE"
   - Clock: `text-2xl font-bold tabular-nums text-[#F5C400]`
   - MODE CRISE: `border: '2px solid #FF3B30'`, `bg transparent`, `text-red-500`
   - Sound button: `bg transparent`, text yellow, no border

4. **KPI ROW**: cards with borders → flat horizontal strip.
   - `flex` container with `borderRight: 1px solid #F5C400/30` dividers
   - No per-card borders, no per-card backgrounds
   - Value `clamp(28-42px) font-bold tabular-nums`
   - Label `text-xs uppercase tracking-wider #F5C400/60`

5. **Zone tiles**: rounded cards with 3px borders → flat signalétique panels.
   - `▸` yellow arrow + yellow square (`size-8 bg-[#F5C400] text-black`) with emoji
   - Zone name in yellow uppercase bold
   - Count: red if >0, green/50 if =0
   - Critical: `bg-red-500/10 border-l-2 border-red-500`
   - `flex flex-wrap gap-2` per category
   - Category label: `text-xs uppercase tracking-[3px] #F5C400/80`

6. **Alert cards**: rounded cards with 8px left border → flat bandeaus with 4px
   left border.
   - `borderLeft: 4px solid` (red for critical, yellow for warning)
   - `▸` + yellow square with picto + zone + message + time + action buttons
   - Action buttons: `bg-[#F5C400] text-black font-bold uppercase px-2 py-1`
   - Gap 2 (8px) between bandeaus

7. **Incidents table**: dot-matrix style → clean signalétique table.
   - Header: `bg-[#F5C400] text-black uppercase font-bold text-xs tracking-wide`
   - Row alternation: `bg-black` / `#0A0A0A`
   - Column separators: `borderLeft: 1px solid #F5C400/10`
   - Status badges: `bg-[#F5C400] text-black` (RÉSOLU), `bg-red-500 text-white`
     (EN COURS), `bg-amber-500 text-black` (ATTENTE)
   - Actions: `size-7 bg-[#F5C400] text-black` squares with icons
   - EN RETARD: `text-red-500 animate-pulse font-bold` (no badge bg)

8. **Prediction radar**: wrapped in `bg-black` container with `border: 1px solid
   #F5C400/30`. Title "RADAR PRÉDICTION" in yellow uppercase.

9. **Bottom strip**: SLA + Charge rows as flat bandeaus with yellow bars.

10. **Legend**: `bg-black border-t border-[#F5C400]/20`, dots `size-2 rounded-full`
    (green-500, #F5C400, red-500), text `#F5C400/60 text-xs uppercase`.

### Rounded classes audit

Only `rounded-full` is used, exclusively for small status dots (size-2, size-3):
- LIVE indicator dot (header)
- Sound banner dot
- Legend dots (CALME/ATTENTION/CRITIQUE)

NO `rounded-xl`, `rounded-lg`, `rounded-2xl`, `rounded-md`, `rounded-sm` anywhere.
This complies with the spec: "ZERO coins arrondis" for structural elements, with
dots explicitly allowed as `size-2 rounded-full` in the legend spec.

### Border audit

- NO `border-2` classes except CrisisButton (`border: '2px solid #FF3B30'`) which
  is explicitly required by the spec.
- NO `border-[#333]` anywhere.
- Separation by gaps and 1px yellow dividers (`#F5C400/30` or `/20` or `/10`).

### No glassmorphism/gradients

- Zero `backdrop-blur` instances.
- Zero `bg-gradient`, `from-`, `to-`, `via-` instances.
- Zero `bg-white/` transparency instances.
- Zero `glass` class instances.

## Preserved functionality (100% intact)

- ✅ Polling 5s (wallboard) / 30s (alerts) / 60s (leaderboard) / 1s (clock)
- ✅ Sound: ding-dong.mp3 + ding-critical.wav + resolved.wav + escalation
  660/880/990Hz via Web Audio API
- ✅ Denise speak() with race-condition fix (cancel + 50ms delay before speak)
- ✅ decideAndSpeakForWallboard() voice decision engine integration
- ✅ 15-min reminder with escalation sound at 15/20/25/30 min
- ✅ Crisis mode + timer + overlay + summary
- ✅ Actions rapides per row (assign with team menu, call, escalate)
- ✅ Zone filtering (click panel → filter table)
- ✅ All data types (WallboardData, TriggeredAlert, LeaderboardData, etc.)
- ✅ All refs (seenIdsRef, firstLoadRef, previousStatusRef, announcedResolvedRef,
  alertedLateRef, escalationStartedRef, audioRef, announcedAlertsRef)
- ✅ All effects (poll, pollAlerts, leaderboard, crisis, 15-min reminder, clock,
  localStorage sound pref)
- ✅ All memos (maxEnAttente, overallSlaPct, overallSlaPctNum, untreatedOver10Min,
  staffActive, filteredRows, activeReportAlerts, zonesByFamily, crisisElapsedSec)
- ✅ All callbacks (handleCrisisStart/End, handleActionFeedback, handleReportCall/
  Assign/Escalate, toggleSound, poll, pollAlerts)
- ✅ Help requests (SOS) display in alerts panel
- ✅ Recently resolved announcements
- ✅ Fresh row fade-in animation
- ✅ Toast feedback for quick actions

## Sub-components rewritten

| Old name | New name | Style change |
|----------|----------|--------------|
| KpiTile | KpiCell | Cards with borders → flat strip cell with yellow divider |
| ZoneTile | ZonePanel | Rounded 3px border tiles → flat panels with yellow square |
| AlertCard | AlertBandeau | Rounded cards with 8px border → flat bandeaus with 4px border |
| ReportAlertCard | ReportAlertBandeau | Same transformation |
| HelpRequestAlertCard | HelpRequestBandeau | Same transformation |
| IncidentRow | IncidentRow | Dot-matrix → signalétique with yellow header |
| SlaBottomRow | SlaRow | Bordered cards → flat bandeaus |
| ZoneChargeRow | ChargeRow | Bordered cards → flat bandeaus |
| KpiSkeleton | KpiSkeleton | Updated to flat style |
| CrisisButton | CrisisButton | bg-[#0A0A0A] → bg-transparent |

New helper: `ActionSquare` — reusable yellow/red action button component.

## Verification results

### Lint (`bun run lint`)
- **ops-wallboard/page.tsx: 0 errors, 0 warnings** ✅
- (3 errors + 1 warning in OTHER pre-existing files: language-selector.tsx,
  scratch-card.tsx, lib/db.ts — NOT related to this task)

### TypeScript (`npx tsc --noEmit --skipLibCheck`)
- **0 errors** ✅ (command completed successfully with no output)

### Design rules compliance
- ✅ FOND: `#000000` pur (bg-black, `#0A0A0A` only for table row alternation per spec)
- ✅ JAUNE: `#F5C400` everywhere (17 occurrences, 0 FCD116 in code)
- ✅ Header: BLACK bg with YELLOW text (not yellow bg)
- ✅ PAS DE COINS ARRONDIS: only `rounded-full` for dots (explicitly allowed)
- ✅ PAS DE BORDURES FINES: no `border-2` except crisis button (spec-required)
- ✅ PAS DE GLASSMORPHISM: zero backdrop-blur/bg-white/
- ✅ PAS DE GRADIENTS: zero gradient classes
- ✅ LAYOUT EN LIGNES HORIZONTALES: bandeaux rectangulaires throughout

### Dev server
- Page compiles successfully (no compile errors in dev.log for ops-wallboard route)
- Pre-existing EADDRINUSE on port 3000 is an environment issue, not code-related

## File info
- **Path**: `/home/z/my-project/src/app/ops-wallboard/page.tsx`
- **Line count**: 2373 lines
- **Previous**: 2764 lines (reduced by ~391 lines due to more compact signalétique
  styling and removal of unused mini-info bars / icon imports)
