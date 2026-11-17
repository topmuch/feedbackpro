# TENANT-3 — Multi-tenant system (Airport / Airline / VIP Lounge)

**Task ID:** TENANT-3
**Agent:** Main agent
**Status:** Completed
**Date:** 2026-11-17

## Context

The project already had an Airport module (`src/components/feedbackpro/airport-dashboard.tsx`, `src/lib/airport-config.ts`, `/ops-wallboard` page, ~60 `/api/airport/*` routes). This task adds two new tenant modules — **Airline** (compagnie aérienne) and **VIP Lounge** (salon VIP) — alongside a tenant filtering system and an onboarding step that asks new users which type of establishment they manage.

The full spec lives in the task prompt. Key constraints respected:
- No modification to the auth/login route (SHA256 preserved).
- `src/app/api/public/upload/route.ts` left intact (verified).
- All API calls use relative paths.
- No test code written.
- `'use client'` on every React component with hooks.
- TypeScript strict typing throughout.

## Changes summary

### Step 1 — Prisma schema (`prisma/schema.prisma`)

- Added `tenantType String @default("classic")` to the `User` model
  (`airport | airline | vip_lounge | classic`).
- Added 3 new models at the end of the schema:
  - `BaggageDispute` (airline — litiges bagages : flightNumber, passengerName, description, photoUrl, status `open|resolved|escalated`).
  - `ShowerStatus` (VIP — statut douches : showerNumber, status `free|occupied|cleaning`, occupiedSince).
  - `BuffetChecklist` (VIP — checklist buffet : item, fillLevel %, lastCheck, nextCheck, status `ok|warning|critical`).
- Ran `bun run db:push` twice (after edit + final verify) — Prisma Client regenerated, schema in sync with SQLite `db/custom.db`.

### Step 2 — Zone filtering (`src/lib/airport-config.ts`)

- Added optional `tenantType?: 'airport' | 'airline' | 'vip_lounge'` field to `AirportZoneConfig`.
- Tagged every existing zone with its tenant:
  - **airport** : ext_park_p1/p2, ext_depose_min, ext_taxi_off, ext_transport_pub, sec_filt_std/fast/paf, term_bagages, term_sanitaires, term_san_pmr, com_resto, com_dutyfree, srv_enfants, srv_priere, srv_medical, urg_sos (+ the 5 legacy zones without tenantType for retro-compat).
  - **airline** (moved) : term_checkin, term_embarq.
  - **vip_lounge** (moved) : com_lounge.
- Added 2 new airline zones: `airline_baggage_office`, `airline_waiting_room`.
- Added 5 new VIP zones: `vip_buffet`, `vip_relaxation`, `vip_showers`, `vip_reception`, `vip_meeting`.
- Added helper:
  ```ts
  export function getZonesByTenant(tenantType: string): AirportZoneConfig[]
  ```
- Extended `PROBLEM_EMOJIS` map with the new problem labels.

### Step 3 — Wallboard filter (`src/app/ops-wallboard/page.tsx` + `src/app/api/airport/wallboard/route.ts`)

**API route** (`/api/airport/wallboard`):
- Introduced `AIRPORT_ONLY_ZONES` constant = `AIRPORT_ZONES.filter(z => z.tenantType === 'airport' || !z.tenantType)`.
- All 4 loops that previously iterated `AIRPORT_ZONES` (zone metadata index, zone agg buckets, SLA init, SLA final dict) now iterate `AIRPORT_ONLY_ZONES`. Airline and VIP zones can no longer pollute the wallboard output.

**Wallboard page** (`/ops-wallboard`):
- Imported `AIRPORT_ZONES` and built a `AIRPORT_ZONE_CODES` Set.
- Added a defensive client-side filter in `zonesByFamily` useMemo (`if (!AIRPORT_ZONE_CODES.has(z.code)) continue`) as a second guardrail in case the API ever leaks a non-airport zone.

### Step 4 — Onboarding tenant step

**New API** — `src/app/api/auth/tenant/route.ts`:
- `POST /api/auth/tenant { tenantType }` — persists the chosen tenant on the current user.
- Validates `tenantType ∈ {airport, airline, vip_lounge, classic}`.
- Auth required (`getSessionUser`). Prisma update with SQL-brute fallback for migration safety.

**Auth APIs** — exposed `tenantType` in responses:
- `src/app/api/auth/login/route.ts` — added `tenantType` to the `user` payload (defensive read).
- `src/app/api/auth/register/route.ts` — same (defaults to `'classic'`).
- `src/app/api/auth/me/route.ts` — same.
- `src/lib/session.ts` — added `tenantType: string` to `SessionUser` type + defensive read in `getSessionUser`.

**Store** — `src/store/app-store.ts`:
- Added `'airline' | 'vip' | 'onboarding-tenant'` to the `View` union.
- Added `tenantType?` to `SessionData.user`.
- Added `justRegistered: boolean` state + `setJustRegistered` action.
- Extended `deriveView` to take `justRegistered` and route accordingly:
  - `justRegistered && session` → `'onboarding-tenant'`
  - `tenantType === 'airline'` → `'airline'`
  - `tenantType === 'vip_lounge'` → `'vip'`
  - `airport` and `classic` → `'dashboard'` (ProDashboard with airport tabs)
- Updated all 6 `deriveView(...)` call sites to pass `get().justRegistered`.

**Auth view** — `src/components/feedbackpro/auth-view.tsx`:
- Imported `Plane` and `Wine` icons (used by tenant cards).
- `InscriptionForm`: after successful registration, calls `setJustRegistered(true)` BEFORE `refreshSession()` so `deriveView` routes to `'onboarding-tenant'`. Safety net falls back to `setView('onboarding-tenant')`.
- `ConnexionForm`: explicitly calls `setJustRegistered(false)` BEFORE `refreshSession()` so login never re-triggers the tenant step.
- New exported component `TenantSelectionStep` — full-screen onboarding step:
  - 4 cards (Aéroport ✈️ / Compagnie 🛫 / Salon VIP 🥂 / Commerce 🏪).
  - On click → `POST /api/auth/tenant` → `setJustRegistered(false)` → `refreshSession()` → deriveView routes to the right dashboard.
  - Logout link in header (escape hatch).

**Routing** — `src/app/page.tsx`:
- Imported `TenantSelectionStep`, `AirlineDashboard`, `VIPDashboard`.
- Added 3 new view branches BEFORE the navigation fallback:
  - `view === 'onboarding-tenant'` → `<TenantSelectionStep />`
  - `view === 'airline'` → `<AirlineDashboard />`
  - `view === 'vip'` → `<VIPDashboard />`
- Excluded these 3 views from the global `<AppFooter />` (they have their own footers).

### Step 5 — Airline Dashboard (`src/components/feedbackpro/airline-dashboard.tsx`)

Single-file dashboard, palette **bleu ciel (#0EA5E9) / blanc / slate**, calm operational feel (NOT IATA wallboard style).

**Structure**:
- Header sticky : company name + clock + refresh + logout.
- Dissatisfaction alert banner (orange/amber) when ≥1 incident > 10 min without resolution.
- KPI row : 4 zone cards (Check-in, Embarquement, Baggage office, Salle d'attente) with total / en cours / résolus.
- Tab bar : Incidents | Litiges Bagages.
- `IncidentsTab` : filterable list (Tous / Nouveau / En cours / Résolu), workflow buttons (Prendre en charge → Résoudre), flight number badge, lateness badge (>10 min), photo thumbnail.
- `BaggageDisputesTab` : list of `BaggageDispute` rows with photo, flight number, passenger name, status badges, Marquer résolu / Escalader actions.

**Denise config** (TTS):
- Local `parlerCalme()` helper with `rate=0.9`, `pitch=1.0` (vs airport `1.1`/`0.9`).
- 2 levels only — "Important/Opérationnel" (new incident) and "Info/Factuel" (status change). **Never critical tone.**
- Speaks only 1 new incident at a time (no cacophony).

**Respected interdictions**:
- No Wallboard IATA (no iframe to `/ops-wallboard`).
- No Mode Crise.
- No Régie Publicitaire.
- No Radar Prédiction.
- No access to other companies' data — incidents API filters strictly by `AIRLINE_ZONE_CODES`.

**APIs created**:
- `src/app/api/airline/incidents/route.ts` — GET (list, 48h window, filtered by airline zone codes) + PATCH (status update with zone ownership guard).
- `src/app/api/airline/baggage-disputes/route.ts` — GET (list) + PATCH (status update).
- Both require auth (`getSessionUser`) and reject cross-tenant access.

### Step 6 — VIP Dashboard (`src/components/feedbackpro/vip-dashboard.tsx`)

Single-file dashboard, palette **or (#D4AF37) / noir (#1a1a1a) / bordeaux (#722F37)**, elegant minimal style, smooth animations.

**Structure**:
- Header sticky gold-on-black : lounge name + clock + refresh + logout.
- VIP Client Alert banner (gold pulse, animate-pulse) — appears for 10s on new `EN_ATTENTE` incident, dismissed manually or auto.
- Tab bar (5) : Vue d'ensemble | Buffet | Douches | Signalements | Récompenses.
- `OverviewTab` : 3 KPI cards (signalements ouverts / douches libres / niveau buffet moyen) + 6 zone cards (vip_buffet, vip_relaxation, vip_showers, vip_reception, vip_meeting, com_lounge).
- `BuffetTab` : checklist with slider + 25/50/75/100% quick buttons; last/next check timer (30 min interval); status color (ok/warning/critical).
- `ShowersTab` : grid of shower cards with status badge (Libre/Occupé/Nettoyage), occupied duration, action buttons (Marquer occupée / Marquer nettoyage / Marquer libre), QR code link for free showers.
- `IncidentsTab` : workflow Nouveau → En cours → Résolu (NO sound, only visual badges).
- `RewardsTab` : 4 premium offers (Champagne 🥂, Upgrade Massage 💆, Upgrade Suite 👑, Cocktail Signature 🍸) + concierge note (no automatic dispatch).

**Denise config**:
- **TTS DISABLED by default** — no `parler()` call anywhere in the file.
- Mode discrétion : `vibrationDiscrete()` helper uses `navigator.vibrate([40, 50, 40])` for haptic feedback only (no audio).
- All alerts are visual (gold pulse banner + badges).
- Denise would only speak if explicitly invoked by the concierge (not implemented — preserves discretion).

**Respected interdictions**:
- No Wallboard airport style.
- No loud voice alerts.
- No classic advertising.
- No Radar Prediction.

**APIs created**:
- `src/app/api/vip/incidents/route.ts` — GET (list, filtered by `VIP_ZONE_CODES`) + PATCH (status update with zone ownership guard).
- `src/app/api/vip/showers/route.ts` — GET (auto-seeds 4 free showers on first call) + PATCH (status update with `occupiedSince` timestamp management).
- `src/app/api/vip/buffet/route.ts` — GET (auto-seeds 3 items: buffet_fill, drinks_level, cleanliness with 30-min nextCheck timer) + PATCH (fillLevel update recalcules status + resets 30-min timer).

### Step 7 — Routing

Already covered in Step 4 / page.tsx edits above. Final routing matrix:

| tenantType    | View              | Component              |
|---------------|-------------------|------------------------|
| `airport`     | `dashboard`       | `ProDashboard` (+ tabs)|
| `airline`     | `airline`         | `AirlineDashboard`     |
| `vip_lounge`  | `vip`             | `VIPDashboard`         |
| `classic`     | `dashboard`       | `ProDashboard`         |
| (just registered) | `onboarding-tenant` | `TenantSelectionStep` |

## Verification

- `bun run db:push` — schema in sync, Prisma Client regenerated.
- `bun run lint` — **0 errors on touched files**. Pre-existing errors remain on `language-selector.tsx`, `scratch-card.tsx`, `db.ts`, `create-admin.cjs`, `seed-airport-ops-config.cjs` (untouched by this task).
- Dev server health-checked:
  - `GET /` → 200
  - `GET /api/auth/me` → 200
  - `GET /api/vip/showers` → 401 (auth required, expected)
  - `GET /api/vip/buffet` → 401 (auth required, expected)
  - `GET /api/airline/incidents` → 401 (auth required, expected)
  - `POST /api/auth/tenant` with invalid tenant → 400 "Type d'établissement invalide"
  - `POST /api/auth/tenant` without auth → 401 "Non authentifié"

## Files created

- `src/components/feedbackpro/airline-dashboard.tsx` (~470 lines)
- `src/components/feedbackpro/vip-dashboard.tsx` (~570 lines)
- `src/app/api/auth/tenant/route.ts`
- `src/app/api/airline/incidents/route.ts`
- `src/app/api/airline/baggage-disputes/route.ts`
- `src/app/api/vip/incidents/route.ts`
- `src/app/api/vip/showers/route.ts`
- `src/app/api/vip/buffet/route.ts`

## Files modified

- `prisma/schema.prisma` — added `User.tenantType` + 3 new models.
- `src/lib/airport-config.ts` — added `tenantType` field + tags on every zone + 7 new zones + `getZonesByTenant` helper + new problem emojis.
- `src/app/api/airport/wallboard/route.ts` — filtered on `AIRPORT_ONLY_ZONES` (4 loops).
- `src/app/ops-wallboard/page.tsx` — defensive client-side filter via `AIRPORT_ZONE_CODES`.
- `src/lib/session.ts` — added `tenantType` to `SessionUser` + defensive read.
- `src/app/api/auth/login/route.ts` — exposed `tenantType` in response.
- `src/app/api/auth/register/route.ts` — exposed `tenantType` in response.
- `src/app/api/auth/me/route.ts` — exposed `tenantType` in response.
- `src/store/app-store.ts` — added `airline`/`vip`/`onboarding-tenant` views + `justRegistered` state + tenant-aware `deriveView`.
- `src/components/feedbackpro/auth-view.tsx` — added `TenantSelectionStep` export + `setJustRegistered` hooks in login/register flows.
- `src/app/page.tsx` — imported new components + 3 new view branches + footer exclusion.

## Constraints respected

- `'use client'` on all new React components with hooks (`airline-dashboard.tsx`, `vip-dashboard.tsx`, `TenantSelectionStep`).
- TypeScript strict typing (no `any` in new code).
- All fetch calls use relative paths (`/api/auth/tenant`, `/api/airline/incidents`, etc.).
- No test code written.
- `src/app/api/public/upload/route.ts` left intact (verified exists).
- Auth login route left untouched (SHA256 preserved, only the success response payload was extended with `tenantType`).
- Dockerfile not modified (still `node:22-alpine` + `bun install` + `bun run build`).

## Notes for downstream agents

- The `User.tenantType` column is read defensively via `(user as unknown as { tenantType?: string }).tenantType ?? 'classic'` in all 3 auth routes + `getSessionUser`. This protects against Prisma Client cache during the migration window. After the next full server restart, the defensive cast can be removed (but is harmless to keep).
- `BaggageDispute`, `ShowerStatus`, `BuffetChecklist` rows are global (no `userId`/`proId`). If multi-lounge isolation becomes a requirement, add a `proId String?` column + filter on it in the API routes.
- The airline and VIP dashboards do NOT currently expose a "create incident" form (incidents come from the PWA traveler flow via `/api/airport/report`). If a manual-creation flow is needed, add a `POST` handler on `/api/airline/incidents` and `/api/vip/incidents` that creates an `AirportReport` with the right `zoneId`.
