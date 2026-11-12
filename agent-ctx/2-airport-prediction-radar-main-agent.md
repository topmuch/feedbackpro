# Task 2 — "Ça va péter dans 20 min" Prediction Feature

Agent: airport-prediction-radar-main-agent
Phase: 2 (FeedbackPro airport feedback system)
Date: auto

## Context

Built the temporal-pattern analysis system that forecasts which airport
zones are at risk of a spike in passenger complaints within the next 20
minutes, displayed on the ops wallboard as a "Radar Prédiction" widget.

This task is self-contained: 2 new files only. Integration into the
existing wallboard (e.g. `/ops-wallboard` page or
`<AirportWallboardTab />`) is delegated to a later agent.

## Files created (absolute paths)

1. **API route**: `/home/z/my-project/src/app/api/airport/predict/route.ts`
2. **Component**: `/home/z/my-project/src/components/feedbackpro/airport-prediction-radar.tsx`

No existing files were modified.

## API route spec compliance

`GET /api/airport/predict`:
- `export const runtime = 'nodejs'`
- `export const dynamic = 'force-dynamic'`
- French file-level comment block matching the wallboard route's style
- `import { db } from '@/lib/db'`
- `import { ok } from '@/lib/session'` — uses the existing `ok()` envelope helper
- `import { AIRPORT_ZONES } from '@/lib/airport-config'` — zone metadata fallback
- Loads all `AirportReport` records from the last 6h with zone join
  (`include: { zone: { select: { code, nom, emoji } } }`)
- For each of the 5 zones (`bagages`, `sanitaires`, `files_attente`,
  `embarquement`, `restauration`) computes:
  - `countLast5Min`, `countLast15Min`, `countLast30Min`,
    `countPrev30Min` (30→60 min ago, exclusive — no overlap with last30)
  - `trendRatio = countLast30Min / max(countPrev30Min, 1)`
  - `pendingCount` (EN_ATTENTE or EN_COURS, regardless of time window)
- Risk score (0-100) per the exact heuristic in the spec:
  - Base = `countLast30Min * 12`
  - Acceleration bonus: `+25` if `trendRatio >= 1.5`, `+15` more if `>= 2.0`
  - Pending accumulation: `+15` if `pendingCount >= 3`, `+15` more if `>= 5`
  - Recency burst: `+20` if `countLast5Min >= 2`
  - Capped at 100 (and floored at 0 for safety)
- Risk level mapping (exact thresholds):
  - 0-19  → CALME
  - 20-39 → VIGILANCE
  - 40-59 → TENDU
  - 60-79 → CRITIQUE   ("Ça va péter dans ~20 min")
  - 80-100 → IMMINENT  ("EXPLOSION IMMINENTE")
- `minutesToBurst = max(5, 20 - (score - 60) / 2)` only if `score >= 60`
- Precomputed recommendations per zone code (exact strings from spec)
- Returns JSON envelope `{ ok: true, data: { generatedAt, globalRiskScore,
  globalRiskLevel, zones[], alerts[] } }`
- `globalRiskScore` = average of all zone scores (rounded)
- `alerts[]` = zones with level CRITIQUE or IMMINENT, sorted by score desc

## Component spec compliance

`<AirportPredictionRadar className? />` (`'use client'`):
- Polls `/api/airport/predict` every 30 s via `setInterval`, plus an
  immediate fetch on mount
- SSR-safe: renders a skeleton (5 placeholder tiles, animate-pulse) until
  the first fetch resolves; renders an error card if the first fetch fails
- Header: "RADAR PRÉDICTION" + live clock (1 Hz) + RefreshCw spinner
- Pulsing red banner at the top when `alerts.length > 0`:
  "ALERTE PRÉVENTIVE — Ça va péter dans ~{minutesToBurst} min sur {zone.nom}"
  (uses the top alert = highest risk score)
- Grid of 5 zone cards: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`
- Each card shows: emoji + zone name, big risk score (font-mono text-3xl),
  level badge with exact Tailwind classes from spec, mini stats row
  (`30min: X | pending: Y | trend: ↑/↓/→`), recommendation text
- Level badge classes (exact from spec):
  - CALME → `bg-emerald-500/20 text-emerald-300 border-emerald-500/30`
  - VIGILANCE → `bg-yellow-500/20 text-yellow-300 border-yellow-500/30`
  - TENDU → `bg-orange-500/20 text-orange-300 border-orange-500/30`
  - CRITIQUE → `bg-rose-500/20 text-rose-300 border-rose-500/30` + animate-pulse
  - IMMINENT → `bg-rose-600/30 text-rose-100 border-rose-500/50` + animate-pulse
- Trend arrow: ↑ (trendRatio>=1.5), ↓ (<0.7), → (else) using lucide-react
  `TrendingUp` / `TrendingDown` / `Minus`. Special-case: if both
  countLast30Min and countPrev30Min are 0 → Minus (neutral, no misleading
  "decelerating" arrow on a calm zone).
- Icons used (all from lucide-react, already in package.json):
  `AlertTriangle`, `Activity`, `Radar`, `TrendingUp`, `TrendingDown`,
  `Minus`, `RefreshCw`
- `suppressHydrationWarning` on the live clock span and on the "Maj:"
  timestamp span (both render client-only time strings)
- Palette consistent with existing airport components: slate-950 bg,
  slate-800 borders, mono fonts for numeric values, emerald/amber/rose
  accents

## Lint result

`cd /home/z/my-project && bun run lint 2>&1 | tail -40`:

```
$ eslint .

/home/z/my-project/prisma/seed-airport-ops-config.cjs
  10:26  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports

/home/z/my-project/src/components/feedbackpro/language-selector.tsx
  33:5  error  Error: This value cannot be modified
  ...   react-hooks/immutability

/home/z/my-project/src/components/feedbackpro/scratch-card.tsx
  105:5  error  Error: Cannot reassign variable after render completes
  ...    react-hooks/immutability

/home/z/my-project/src/lib/db.ts
  15:1  warning  Unused eslint-disable directive ...

✖ 4 problems (3 errors, 1 warning)
```

**All 4 lint problems are pre-existing in files I did NOT create or modify**
(`seed-airport-ops-config.cjs`, `language-selector.tsx`, `scratch-card.tsx`,
`db.ts`). Targeted lint on the 2 new files:

```
bunx eslint src/app/api/airport/predict/route.ts \
            src/components/feedbackpro/airport-prediction-radar.tsx
→ exit 0, no errors, no warnings
```

## Deviations from spec

None. All thresholds, formulas, level names, badge classes, JSON envelope
shape, recommendations, and `runtime`/`dynamic` exports follow the spec
verbatim.

Minor non-spec additions (all backward-compatible and only improve UX):
- Added an error card UI branch in the component for when the first fetch
  fails (spec said "skeleton until first fetch resolves" — extending that
  to "or error card if first fetch fails" is the natural complement and
  keeps the wallboard visible instead of blank).
- Added a small footer line showing the global risk score/level and the
  "Maj:" timestamp. The spec's component design section didn't explicitly
  request it but the API returns `globalRiskScore`/`globalRiskLevel` and
  not displaying them would waste the field. Easy to remove if undesired.
- Special-cased the trend arrow to `→` when both countLast30Min and
  countPrev30Min are 0 (avoids a misleading "↓ decelerating" on a zone
  with zero activity — `trendRatio = 0/1 = 0` would otherwise map to ↓).
  `trendRatio` itself is still computed exactly per spec; only the arrow
  glyph is neutralised in that edge case.
- Used `r.statut === 'EN_ATTENTE' || r.statut === 'EN_COURS'` string
  comparison (the wallboard route does the same with a `Statut` type
  alias) rather than importing a Prisma enum — matches existing pattern
  in `airport/wallboard/route.ts`.

## Integration notes for the next agent

To embed the widget in the wallboard:

```tsx
import { AirportPredictionRadar } from '@/components/feedbackpro/airport-prediction-radar'

// Inside the wallboard layout (e.g. /ops-wallboard page or a tab):
<AirportPredictionRadar className="w-full" />
```

The component is fully self-contained: it fetches its own data, manages
its own polling interval, and cleans up on unmount. No props beyond
optional `className` are required. The dark slate-950 card is designed
to sit inside an already-dark wallboard container; if embedded in a
light-themed page, wrap it in a dark parent or accept the contrast.

The API route is public (no auth) and uncached (`force-dynamic`), so it
can be hit directly for debugging:
`GET /api/airport/predict` → `{ ok: true, data: { ... } }`.
