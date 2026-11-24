# Task 2 — CityDashboard: fill 6 empty tabs

**Agent:** main-agent
**File:** `src/components/feedbackpro/city-dashboard.tsx`
**Status:** DONE

## Goal
The `CityDashboard` component had 12 sidebar tabs but only 3 rendered content
(`overview`, `plates-mgmt`, `settings`). 6 tabs returned nothing when clicked.
This task fills those 6 empty tabs using the data already fetched in component
state (`incidents`, `plates`, `artisans`).

## Tabs implemented

| Tab ID            | Label              | Data source         | Notes |
|-------------------|--------------------|---------------------|-------|
| `emergencies`     | Urgences           | `incidents` (type=emergency) | Filterable cards: emoji+category, description, status badge (pending=orange / assigned=blue / resolved=green), assigned service (Police/Senelec/ONAS/Mairie), relative timestamp, plate number. Search + status chips. |
| `reports`         | Signalements       | `incidents` (type=report)    | Grouped by status (En attente / En cours / Résolus) with counts. Each group is a `ReportGroup` section reusing `IncidentCard`. Search bar. |
| `artisans`        | Artisans vérifiés  | `artisans`           | Table: avatar+name+trade, district, clickable `tel:` phone, Verified/Premium badges, star rating, contact count. Filter chips (Tous/Vérifiés/Premium) + search. |
| `mairie-dynamic`  | Mairie dynamique   | mock + live clock    | Open/closed banner (Lun-Ven 8h-16h, Sam 8h-12h), weekly hours table, services list (État civil, Permis, Impôts, CNI) with phone buttons, mock announcements. |
| `revenue`         | Revenus            | `artisans` + mock    | 3 KPI cards (total revenue, mairie 30% share, premium count), 6-month bar trend, top 8 artisans by revenue (contactCount * 5000 FCFA). Falls back to 18.4M mock if no artisans. |
| `plates-map`      | Carte des plaques  | `plates` + `incidents` | Card grid (no real map): plate number+label, district/address/GPS, scan count, last scan time (relative), status badge. Emergency pulse badge if active emergencies on that plate. Filter chips + search. |

## Architecture decisions

1. **Sub-components, not inline JSX.** Each tab is a dedicated function component
   (`EmergenciesView`, `ReportsView`, etc.) receiving data as props. This keeps
   the main `CityDashboard` body readable and isolates per-tab state (search
   strings, filters) from the parent.

2. **Shared `IncidentCard`.** Emergencies and reports share the same card layout
   via a single `IncidentCard` component parameterised by an accent colour.

3. **Shared helpers** added near the new views:
   - `incidentEmoji(type, category)` — picks an emoji from the category keywords.
   - `incidentStatusInfo(status)` — maps status string to French label + Tailwind
     bg/text classes (handles `pending`, `assigned`, `in_progress`, `resolved`).
   - `serviceInfo(assignedTo)` — maps assignedTo to Police/Senelec/ONAS/Mairie
     with an emoji.

4. **No new API calls.** Everything reads from the 3 state arrays already
   populated by `loadData()` and the 10s incident polling loop.

5. **Empty states.** Every view shows a friendly dashed-border empty card with a
   Lucide icon and contextual message ("Aucun incident pour le moment" /
   "Aucun résultat avec ces filtres").

6. **Design consistency.** Reused the existing palette constants
   (`COLOR_RED`, `COLOR_ORANGE`, `COLOR_BLUE`, `COLOR_GREEN`, `COLOR_GOLD`,
   `COLOR_ANTHRACITE`), the Georgia serif font for headings, rounded-2xl white
   cards with `border-[#EAE5DC]`, and the same search-input styling as
   `PlatesManagementView`.

## Edits made

1. **Imports** (line 56-57): added `Phone` and `Clock` to the lucide-react import
   list (used by `ArtisansView`/`MairieDynamicView`).

2. **Main component body** (lines 973-1001): inserted 6 conditional blocks
   `{activeNav === '<tab>' && (<View ... />)}` between the `plates-mgmt` block
   and the `overview` block.

3. **New sub-components** (lines 1918-3093): appended after `PlatesManagementView`:
   - 3 helper functions (`incidentEmoji`, `incidentStatusInfo`, `serviceInfo`)
   - `IncidentCard`
   - `EmergenciesView`
   - `ReportsView` + `ReportGroup`
   - `ArtisansView`
   - `MairieDynamicView` (+ `MAIRIE_SERVICES`, `MAIRIE_ANNOUNCEMENTS` consts)
   - `RevenueView` (+ `MONTHLY_TREND`, `RATE_PER_CONTACT` consts)
   - `PlatesMapView`

## Lint / type check

- `bun run lint` reports exactly 1 error on line 308
  (`if (saved) setCityLogoUrl(saved)` inside a `useEffect`). This is
  **pre-existing** code (the logo-from-localStorage loader, originally line 306
  before the import additions shifted line numbers). No new lint errors were
  introduced by this task.
- No `city-dashboard` errors in `dev.log`; the only warnings there are
  pre-existing Edge-Runtime `fs`/`path` issues in `src/lib/sonde-ai.ts`.

## Notes for downstream agents

- The 3 remaining empty tabs (`transports`, `teams`, `reports-mgmt`) were NOT in
  scope for this task and still render nothing. They can be filled in a future
  task.
- `MairieDynamicView` uses its own `useState`/`useEffect` clock (updated every
  30s) to compute open/closed status client-side, with `suppressHydrationWarning`
  on the time display to avoid SSR mismatch.
- `RevenueView` computes revenue as `contactCount * 5000 FCFA`; if real
  transaction data becomes available later, swap `RATE_PER_CONTACT` and the
  `totalRevenue`/`displayTotal` logic.
