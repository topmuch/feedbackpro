# VIP-PHASE1 — Salon VIP Phase 1 (Tables, Clients, Requests)

**Agent**: main agent
**Task ID**: VIP-PHASE1
**Date**: 2026-11-18
**Status**: Completed

## Goal

Implement Phase 1 of the VIP Lounge transformation: persistent VipTable / VipClient / VipTableRequest models, a full REST API, an upgraded Vue d'Ensemble tab with a 2D interactive floor plan, a new Plan du Salon tab, a Demandes à la table section in the Signalements tab, and a client-facing QR scan view.

## What was created

### API routes (server-side, Prisma-backed)

| Route | Method(s) | Auth | Purpose |
|---|---|---|---|
| `/api/vip/tables` | GET, POST | required | List all VipTables with active requests; auto-seed 12 tables (T-01..T-12) on first GET; POST creates a new table (tableNumber, zone, seats) with auto-generated qrToken |
| `/api/vip/tables/[id]` | PATCH, DELETE | required | Update status (free/occupied/problem/reserved), clientName, clientVipLevel, arrivedAt; free → resets client fields; DELETE cascades requests |
| `/api/vip/tables/by-qr/[token]` | GET | **public** | Resolves a QR token to public table info (tableNumber, zone, seats, status) — used by the client scan view |
| `/api/vip/requests` | GET, POST | GET: required · POST: **public** | GET lists requests with table info (filter by status/type); POST creates a request — accepts `tableId` OR `qrToken` + `type` + optional `message` |
| `/api/vip/requests/[id]` | PATCH | required | Update status (pending → in_progress → done) + staffName; auto-syncs table.activeRequests counter |
| `/api/vip/clients` | GET, POST | required | List / create VipClients (name, photo, airline, vipLevel, preferences as JSON, notes) |

### Auto-seed logic (in `/api/vip/tables` GET)

When the `VipTable` table is empty, the GET handler inserts 12 tables:
- T-01..T-05 → zone `main` (4 seats each)
- T-06..T-08 → zone `buffet` (2 seats each)
- T-09..T-10 → zone `relaxation` (4 seats each)
- T-11..T-12 → zone `meeting` (6 seats each)

Each table gets a unique `qrToken` (cuid-like, 24 chars, prefixed with `t`).

### Frontend changes

#### `src/components/feedbackpro/vip-dashboard.tsx` (modified)

1. **New types** added: `VipTableData`, `VipTableStatus`, `VipTableRequestData`, `VipRequestWithTable`.
2. **New constants**: `TABLE_STATUS_STYLE`, `TABLE_ZONE_META`, `REQUEST_TYPE_META`, `REQUEST_STATUS_META`.
3. **New `'plan'` tab** added to the `VipTab` union (between `overview` and `incidents`).
4. **Sidebar** (`NAV_ITEMS`): added `🗺️ Plan du Salon` entry (Map icon) between Vue d'ensemble and Signalements.
5. **New shared subcomponents** (re-used by OverviewTab + FloorPlanTab):
   - `VipStarRating` — 5-star visual rating with half-star support
   - `TableCard` — single table card with status dot, client name, VIP badge, request count
   - `TableDetailSheet` — right-side Sheet panel showing: table number, zone, seats, status, client info, arrival time + duration, active requests list, QR code, and 3 action buttons (Libérer / Marquer problème / Assigner client with Dialog form for name + VIP level)
6. **`OverviewTab` rewritten** (Vue d'Ensemble):
   - Bandeau d'accueil (kept)
   - **6 KPI cards**: Capacité (clients/25 with progress bar), Séjour moyen (computed from arrivedAt of occupied tables), Satisfaction (4.8/5 with stars), Signalements actifs (incidents + table requests), Récompenses offertes, Douches libres
   - **Plan Interactif 2D du Salon**: grid of TableCards grouped by zone (Main, Buffet, Relaxation, Meeting) with status legend; click opens TableDetailSheet
   - **Alertes Douces** section (kept + extended with table problem + pending table requests alerts)
7. **`FloorPlanTab`** (new, "Plan du Salon" tab): full-screen floor plan with zone cards, status filter, legend, click-to-detail Sheet
8. **`IncidentsTab`** (Signalements): added "Demandes à la table" section at the bottom — lists all pending/in_progress VipTableRequests with table number, type icon, message, time, and "Prendre en charge" / "Terminer" actions + filter by type
9. **Main `VIPDashboard`**: added `tables` + `tableRequests` state, fetches them in `refreshData` (alongside incidents/showers/buffet), added `patchTable` + `patchRequest` callbacks with optimistic updates

#### `src/components/feedbackpro/vip-table-scan.tsx` (new)

Client-facing QR scan view. When a client scans a table QR (`?vipTable=<token>`):
1. Resolves the token via public `/api/vip/tables/by-qr/<token>` endpoint
2. Shows "🥂 Bienvenue, vous êtes à la Table T-XX"
3. 7 action buttons: 🍸 Rafraîchissement, 📋 Menu, 🚿 Douche, 🔌 Chargeur, 🛎️ Concierge, ⚠️ Problème, ⭐ Noter
4. Each click POSTs to `/api/vip/requests` (public) with `{qrToken, type}`
5. After click: confirmation screen "Votre demande a été transmise. Le staff arrive dans un instant. 🥂"

#### `src/store/app-store.ts` (modified)

- Added `"vip-table"` to the `View` union
- Added `vipTableToken: string | null` state + `openVipTable(token)` / `closeVipTable()` actions
- Added `vipTableTokenDepuisUrl()` URL helper
- Updated `deriveView` signature to accept `vipTableToken` (priority: scan > airport > staff > vip-table > session)

#### `src/app/page.tsx` (modified)

- Imports `VipTableScan` + `vipTableTokenDepuisUrl`
- Detects `?vipTable=<token>` on mount and on popstate → calls `openVipTable(token)`
- Renders `<VipTableScan>` when `view === 'vip-table'`

## Important fixes made

1. **`/api/vip/requests/route.ts`**: Fixed TypeScript narrowing issue where `let table = null` was inferred as `null` only. Changed to explicit `let table: Awaited<ReturnType<typeof db.vipTable.findUnique>> = null`.
2. **`/api/vip/requests/[id]/route.ts`**: Removed unused `isActiveNow` helper.
3. **Removed duplicate `src/middleware.ts`**: Next.js 16 requires only `src/proxy.ts` (the new convention); both files existed with identical content but different export names (`middleware` vs `proxy`), causing the dev server to crash on startup. Removed the old `middleware.ts` (proxy.ts is the Next.js 16 replacement with identical auth logic).

## Validation

- `bunx tsc --noEmit 2>&1 | grep vip` → 0 errors
- All public endpoints return correct status codes:
  - `GET /api/vip/tables/by-qr/<invalid>` → 404 `{"ok":false,"error":"Table introuvable pour ce QR code"}`
  - `POST /api/vip/requests` with invalid qrToken → 404
  - `GET /api/vip/tables` (no session) → 401
  - `GET /api/vip/clients` (no session) → 401
- Home page `/` compiles and returns HTTP 200
- `/?vipTable=foo` compiles and returns HTTP 200 (VipTableScan renders, fetches by-qr, shows error gracefully)
- Pre-existing lint errors in unrelated files (language-selector.tsx, scratch-card.tsx, db.ts, create-admin.cjs) — NOT introduced by this task
- `src/app/api/public/upload/route.ts` left untouched ✓
- Auth routes (`/api/auth/*`) left untouched ✓

## Files created

```
src/app/api/vip/tables/route.ts
src/app/api/vip/tables/[id]/route.ts
src/app/api/vip/tables/by-qr/[token]/route.ts
src/app/api/vip/requests/route.ts
src/app/api/vip/requests/[id]/route.ts
src/app/api/vip/clients/route.ts
src/components/feedbackpro/vip-table-scan.tsx
```

## Files modified

```
src/components/feedbackpro/vip-dashboard.tsx (added ~900 lines: VipStarRating, TableCard, TableDetailSheet, new OverviewTab, FloorPlanTab, Demandes à la table section in IncidentsTab, tables+requests wiring in main component)
src/store/app-store.ts (vip-table view + vipTableToken state + helpers)
src/app/page.tsx (vip-table view rendering + URL detection)
```

## Files removed (pre-existing conflicts)

```
src/middleware.ts (duplicate of src/proxy.ts — Next.js 16 requires proxy.ts only)
src/middleware.ts.bak
```

## Notes for next agent

- The `qrImageUrl` helper builds QR URLs as `/?vipTable=<token>` (matches the URL convention).
- The 4 table zones (main / buffet / relaxation / meeting) are distinct from the 5 airport-config VIP zones (vip_buffet / vip_relaxation / vip_showers / vip_reception / vip_meeting). The 4 zones here are the table layout zones for the floor plan, not the airport-config zones.
- The auto-seed runs only on the first GET when the DB is empty — it won't add tables T-13+ if you manually create T-01..T-12 first.
- The `activeRequests` counter on `VipTable` is denormalized for performance; the API keeps it in sync on request create/update.
- POST `/api/vip/requests` is **public** (no auth) because the client scanning a QR isn't logged in. It validates by `qrToken` instead.
- GET `/api/vip/tables/by-qr/[token]` is **public** and returns only public fields (no id, no qrToken, no client info).
