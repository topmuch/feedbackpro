# F2 — Data Visualization 3 Features (Heatmap + QR Analytics + Crystal Ball)

**Agent**: F2 (main)
**Project**: /home/z/my-project (Next.js 16 + TypeScript + Prisma SQLite)
**Date**: 2026-11-15

## Scope

Built 3 data-visualization features for the FeedbackPro airport ops dashboard:

1. **Heatmap Dynamique** — interactive thermal map replacing the static zone map
2. **Live QR Analytics** — real-time QR code performance dashboard
3. **Crystal Ball** — advanced prediction combining flights + ML patterns + weather

## Files Created

### API Routes

- `src/app/api/airport/qr-analytics/route.ts` (GET) — aggregates per `tagScanne`:
  - scans today / 7d / 30d, incidents, resolution rate, performance score
  - performance score = `scans30d / (activeIncidents + 1)` (higher = passive scans without unresolved problems)
  - dead QRs = tags with 0 scans in last 30 days
  - top performers = top 5 by scans30d
  - ROI per zone = `Campaign.priceMonthlyFcfa` (active campaigns) + incidents resolved
  - Initialized from `AIRPORT_ZONES` config so all physical tags appear (even with 0 scans)
  - Output: `{ generatedAt, totalScansToday, zones, deadQrs, topPerformers }`

- `src/app/api/airport/crystal-ball/route.ts` (GET) — enhanced predictions:
  - Fetches active `AirportFlightGate` entries
  - For each flight: simulate `paxCount` (deterministic hash 80-300), `etaMinutes` from `scheduledDeparture`
  - Impact mapping per gate-zone (term_embarq → checkin/security/sanitaires/resto/dutyfree)
  - Risk formula: `min(99, pax * 0.36 * weight + weatherImpact)` for exterior zones
  - Historical patterns: last 4 weeks of `AirportReport` grouped by `(dayOfWeek, hour, zoneCode)`, kept if `avgIncidents >= 3` and `occurrenceCount >= 2`
  - Weather simulation: deterministic per-day seed, 5 conditions (sunny/cloudy/rainy/stormy/snowy), season-aware
  - Auto-recommendations: flight (risk≥50), patterns (top 3), weather (impact≥20)
  - Output: `{ generatedAt, weather, predictions, patterns, recommendations }`

### Components (V2.0 palette: bg #F5F5F5, white rounded-15px, bleu #003399, jaune #FCD116, rouge #E30613, vert #00A651, orange #FF6B00)

- `src/components/feedbackpro/airport-heatmap.tsx` — `<AirportHeatmap>`:
  - CSS grid 5×5 with 20 zones positioned geographically
  - Row labels: EXTÉRIEUR / SÛRETÉ / TERMINAL / COMMERCIAL / SERVICE-URGENCE
  - Color intensity on `count_en_attente`: 0=green, 1-2=yellow, 3-5=orange, 6+=red
  - Pulsing animation (`fp-heat-pulse` keyframe) on critical zones
  - Animated particles flowing from critical zones to center (`fp-particle-flow` keyframe with CSS vars `--fp-start-x` / `--fp-start-y` for start position)
  - Click zone → `onZoneSelect(code|null)` event for table filtering; selected zone highlighted with blue ring
  - Legend bar at bottom with heat levels + counts
  - Polls `/api/airport/wallboard` every 5s
  - Title: "CARTE THERMIQUE · TEMPS RÉEL"

- `src/components/feedbackpro/admin-qr-analytics-tab.tsx` — `<AdminQrAnalyticsTab>`:
  - Live counter card (pulsing) for total scans today, MAJ 30s
  - KPI cards: QR morts (30j), top performer, avg resolution rate
  - Sortable table: tag, zone, scans today/7d/30d, incidents (+active count), resolution rate %, performance score
  - "QR Morts" section: tags with 0 scans in 30d (red highlight, scrollable list)
  - "Top Performers" section: top 5 by scans30d (with rank badge, gold #1 highlight)
  - Footer: total ad revenue (ROI) + last MAJ time

- `src/components/feedbackpro/airport-crystal-ball.tsx` — `<AirportCrystalBall>`:
  - Weather banner with icon + temperature + impact % badge
  - Critical alert banner when any prediction ≥70 risk score
  - Prediction cards (premium, colored top border by risk): flight number, airline, destination, pax count, ETA, zone impacted, risk %, risk reason, pattern matched (yellow card if applicable), recommendation (blue card), auto-action button "Pré-positionner équipes" (turns green when dispatched)
  - Patterns section: historical patterns with occurrence count + total incidents, top pattern flagged
  - Recommendations section: list with type (Vol/Pattern/Météo) + priority color border
  - Polls `/api/airport/crystal-ball` every 60s

## Validation

- `bunx tsc --noEmit` → **PASS** (0 errors)
- `bun run lint` → 0 errors / 0 warnings on new files (pre-existing errors in `language-selector.tsx`, `scratch-card.tsx`, `seed-airport-ops-config.cjs` are unrelated)
- `curl /api/airport/qr-analytics` → 200 OK, returns full `zones` array (all tags from config), `deadQrs`, `topPerformers`
- `curl /api/airport/crystal-ball` → 200 OK, returns `weather` (rainy +20% autumn), `recommendations` derived from weather
- Dev log: Prisma queries executing correctly (AirportReport 30d, Campaign active, AirportFlightGate active, AirportReport 28d)

## Design Decisions

- **Tag aggregation**: each AirportReport IS a scan event (user opens PWA via QR URL → creates report). `incidents` = total reports for the tag, `activeIncidents` = EN_ATTENTE + EN_COURS. Performance score formula `scans / (activeIncidents + 1)` rewards QRs that generate scans without leaving unresolved incidents.
- **Pax simulation**: deterministic hash of `flightNumber` so the same flight always shows the same pax count (stability for ops planning). Range 80-300.
- **Pattern detection threshold**: `avgIncidents >= 3 AND occurrenceCount >= 2` — filters out one-off spikes while catching genuine recurring patterns.
- **Weather simulation**: seed = `dayOfYear * 2654435761 % 1000` (Knuth multiplicative hash) — deterministic per day, season-aware (Northern hemisphere).
- **Particle animation**: CSS-only, no JS animation loop. Each critical zone spawns 3 particles with staggered delays (0/0.8/1.6s) flowing to container center via `left/top` percentage animation.
- **Heatmap onZoneSelect**: controlled component pattern (`selectedZone` prop + `onZoneSelect` callback) so the parent table can react to clicks without internal state coupling.

## Integration Notes (for next agents)

These 3 components are **not yet wired into the dashboard tabs**. To surface them:

1. **Heatmap**: import in `airport-dashboard.tsx` or `airport-zones-tab.tsx`, render `<AirportHeatmap onZoneSelect={setSelectedZone} selectedZone={selectedZone} />`. Pair with the reports table filtered by `selectedZone`.

2. **QR Analytics tab**: add to `pro-dashboard.tsx` or `admin-dashboard.tsx` as a new tab entry — `<AdminQrAnalyticsTab />` is self-contained (fetches its own data).

3. **Crystal Ball**: add as a new tab or section in the ops dashboard — `<AirportCrystalBall />` is self-contained.

All 3 components use the V2.0 palette consistently (bleu #003399 primary, yellow/red/green/orange accents, white cards rounded-15px, #F5F5F5 backgrounds) and match the visual language of `<AirportPredictionRadar>` already in the project.

## Files Touched

```
NEW src/app/api/airport/qr-analytics/route.ts        (185 lines)
NEW src/app/api/airport/crystal-ball/route.ts        (310 lines)
NEW src/components/feedbackpro/airport-heatmap.tsx               (340 lines)
NEW src/components/feedbackpro/admin-qr-analytics-tab.tsx        (720 lines)
NEW src/components/feedbackpro/airport-crystal-ball.tsx          (560 lines)
```

No existing files were modified.
