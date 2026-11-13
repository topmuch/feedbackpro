# Task Z1 — Zone CRUD management + QR staff persistence

**Agent:** Z1 (main code agent)
**Status:** ✅ Complete
**Date:** 2026-11-13

## Objective

Two features added to the airport FeedbackPro dashboard:
1. **Add / Modify / Delete airport zones** from the dashboard (zones tab)
2. **Persist generated staff QR codes** in DB so they survive page close/reopen

## Files modified / created

### Prisma schema
- `prisma/schema.prisma` — appended `AirportStaffQr` model at end of file.
  Fields: `id` (cuid), `tag` (unique), `label`, `zoneCode?`, `createdAt`, `updatedAt`.
  Index on `zoneCode`. Pushed via `bun run db:push` (✅ succeeded, 16ms).

### Backend — Zones CRUD
- `src/app/api/airport/zones/route.ts` — **modified**:
  - `GET` now merges static config zones + custom DB-only zones (appended at end, sorted by code). Each zone gets a new `custom: boolean` field.
  - `POST` body `{ code, nom, emoji, description?, tags[], problemes[] }` → creates a new zone. Validates code regex `[a-z0-9_]{2,40}`, nom 2-60 chars, emoji 1-8, tags ≤10, problemes min 4 / max 12 (3-100 chars each). Refuses if code collides with static config or existing DB row (HTTP 409).
- `src/app/api/airport/zones/[code]/route.ts` — **modified**:
  - `PUT` (legacy) preserved — still requires code be in static config.
  - `PATCH` (new) — updates ANY existing zone (custom or canonical). Refuses 404 if zone not in DB.
  - `DELETE` (new) — removes a zone; cascades AirportReport rows via `onDelete: Cascade` defined in Prisma schema. Returns `{ deleted: true, code }`.

### Backend — Staff QRs CRUD
- `src/app/api/airport/staff-qrs/route.ts` — **created**:
  - `GET` → `db.$queryRaw` SELECT all rows from `AirportStaffQr` (ordered by createdAt DESC).
  - `POST` body `{ tag, label, zoneCode? }` → manual upsert (SELECT then UPDATE or INSERT with `crypto.randomUUID()` for the id).
- `src/app/api/airport/staff-qrs/[id]/route.ts` — **created**:
  - `DELETE` → removes a QR record by id.

> **Why raw SQL?** The Prisma schema was pushed (`bun run db:push` succeeded, client regenerated in `node_modules/.prisma/client`) AFTER the Next.js dev server had already started. The running dev server caches a `PrismaClient` instance in `globalThis['prisma_v*_…']` (see `src/lib/db.ts`) and the cache-busting loop only busts Node's native `require.cache` — but in Turbopack context `require` is a polyfill, so the old client (without `airportStaffQr` property) is reused. Raw SQL via `db.$queryRaw` / `db.$executeRaw` works around this without a manual server restart, exactly as documented in the existing comment at the top of `src/lib/db.ts`. The schema itself IS in sync with SQLite (table `AirportStaffQr` exists). On the next full dev-server restart, `db.airportStaffQr.findMany()` etc. will become available — the raw-SQL code remains valid and is forward-compatible.

### Prisma cache key bump
- `src/lib/db.ts` — bumped `PRISMA_CACHE_KEY` from `prisma_v16_score_blackbox` → `prisma_v17_staffqr`. This forces a new PrismaClient instance on the next dev-server restart (when HMR re-evaluates `db.ts` fresh from a stopped state). The current running process still holds the v17 instance that was created from the old @prisma/client (since HMR doesn't re-require @prisma/client), which is why raw SQL is still needed at runtime for now.

### Frontend — Zones tab
- `src/components/feedbackpro/airport-zones-tab.tsx` — **modified**:
  - Imported `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`.
  - Imported `AlertTriangle` and `Pencil` from `lucide-react`.
  - Added `custom?: boolean` to the `Zone` type.
  - Added CRUD helper functions: `postZone()`, `patchZone()`, `deleteZone()`.
  - Added `dialogState` (`'create' | { mode: 'edit'; zone } | null`) and `deletingCode` state to the main component.
  - Added `handleDialogSubmit` (dispatches to POST or PATCH) and `handleDeleteZone` (confirm + DELETE + refresh).
  - Sidebar:
    - New "Ajouter une zone" button (emerald gradient) at the top of the zones list.
    - Each zone row is now a `div` (instead of `button`) containing a clickable inner button for selection, plus a hover-revealed CRUD actions group (top-right) with "Modifier" (pencil) and "Supprimer" (trash) icon buttons.
    - Custom zones display a small "+" badge next to their name.
  - New `<ZoneCrudDialog>` component (added after main component, before `ZoneEditForm`):
    - Mode `create`: empty form, code editable (regex validated live), all 4+ problematiques required.
    - Mode `edit`: pre-filled from zone, code locked (disabled input).
    - Fields: Emoji (text input), Nom (max 60), Code (lowercase regex `[a-z0-9_]{2,40}`), Description (textarea max 200), Tags (comma-separated input → array via `parseTagsCsv`), Problématiques (dynamic list add/remove with min 4 validation badge).
    - Validation mirrors API rules; toasts on errors.
    - Emerald gradient Save button with `Plus`/`Save`/`Loader2` icons depending on state.

### Frontend — Staff QR tab
- `src/components/feedbackpro/airport-staffqr-tab.tsx` — **rewritten** (was 442 lines, now ~870 lines):
  - On mount, fetches both `GET /api/airport/staff-qrs` (saved QR list) and `GET /api/airport/zones` (for the zone select).
  - Generate form now has 3 fields: Tag, Label (libellé lisible), Zone (select populated from zones API, optional).
  - Generate button relabeled "Générer + sauvegarder" — after fetching the PNG from `/api/airport/staff-qrcode?tag=…&format=png`, it POSTs to `/api/airport/staff-qrs` to persist `{ tag, label, zoneCode }`. The saved QR is upserted into the local `savedQrs` state.
  - New section "3. QR codes sauvegardés" (Card):
    - Empty state with dashed-border placeholder.
    - Loading state with spinner.
    - Grid of `SavedQrCard` (1 col mobile / 2 cols sm / 3 cols lg).
  - New `SavedQrCard` sub-component: lazily fetches its own PNG preview from `/api/airport/staff-qrcode?tag=<tag>&format=png` on mount. Displays:
    - Header: emoji (guessed from tag) + label + zone badge (with zone emoji + zone label looked up from the zones API).
    - Body: 24×24 mini QR preview (loading spinner / error / image states) + tag (mono code).
    - Footer: 3 buttons — PNG download, PDF download, Delete (trash, with confirm + loading state).
  - `downloadPng()` and `downloadPdf()` accept an optional `overrideTag` so saved-QR cards can trigger downloads for any saved tag.
  - Refresh button to re-fetch the saved list manually.

## Verification

### `bun run db:push`
```
🚀 Your database is now in sync with your Prisma schema. Done in 16ms
✔ Generated Prisma Client (v6.19.2) to ./node_modules/@prisma/client in 299ms
```

### Lint (on modified files only)
```
$ bunx eslint <my 6 files>
EXIT=0
```
(The project-wide `bun run lint` reports 3 pre-existing errors in `language-selector.tsx` / `scratch-card.tsx` + 1 pre-existing warning in `db.ts` — none introduced by this task.)

### TypeScript
```
$ npx tsc --noEmit --skipLibCheck
EXIT=0
```

### Runtime smoke tests (curl)
```
POST /api/airport/zones              200  → creates "douane" zone (custom=true)
PATCH /api/airport/zones/douane      200  → updates nom + emoji
GET /api/airport/zones               200  → returns 5 default + 1 custom (douane)
DELETE /api/airport/zones/douane     200  → deleted (cascade)

POST /api/airport/staff-qrs          200  → upserts staff_nettoyage_t2
GET /api/airport/staff-qrs           200  → returns list (count: 1, then 3 after seeding)
POST /api/airport/staff-qrs          200  → upsert on same tag updates label/zoneCode
DELETE /api/airport/staff-qrs/[id]   200  → deletes the record
```

### Seeded sample data
3 staff QRs pre-saved for demo purposes:
- `staff_nettoyage_t1` / Nettoyage T1 / zone=sanitaires
- `staff_maintenance` / Maintenance / zone=embarquement
- `staff_securite_t2` / Sécurité T2 / zone=files_attente

## How the zone CRUD works

| Action | UI trigger | API call | Effect |
|--------|-----------|----------|--------|
| **Add** | "Ajouter une zone" button (top of sidebar) → opens Dialog with empty form | `POST /api/airport/zones` body `{ code, nom, emoji, description?, tags[], problemes[] }` | Creates a new AirportZone row. Code must be unique (409 if collides with static config or existing row). Min 4 problemes required. After success: list refreshes, new zone becomes selected. |
| **Modify** | Hover a zone row → click pencil icon → opens Dialog pre-filled with the zone's data; code field is disabled | `PATCH /api/airport/zones/[code]` body `{ nom?, emoji?, description?, tags?, problemes? }` | Updates the existing AirportZone row. Returns 404 if zone not in DB. After success: list refreshes, zone remains selected. |
| **Delete** | Hover a zone row → click trash icon → `window.confirm()` (warns about cascading reports if `reportsCount > 0`) | `DELETE /api/airport/zones/[code]` | Deletes the AirportZone row. AirportReport rows linked via `zoneId` are cascaded (Prisma `onDelete: Cascade`). After success: list refreshes; if the deleted zone was selected, selection moves to the first remaining zone. |

The existing inline editor (`ZoneEditForm`, with `PUT /api/airport/zones/[code]`) is preserved unchanged — the new Dialog is an additional CRUD surface, not a replacement.

## How the QR persistence works

| Action | API call | Effect |
|--------|----------|--------|
| **List** (on page load) | `GET /api/airport/staff-qrs` | Returns all `AirportStaffQr` rows ordered by `createdAt DESC`. Each card lazy-loads its PNG preview from `/api/airport/staff-qrcode?tag=<tag>&format=png`. |
| **Save** (when user clicks "Générer + sauvegarder") | `POST /api/airport/staff-qrs` body `{ tag, label, zoneCode? }` | Upsert on `tag`. If the tag already exists, updates `label` + `zoneCode` and bumps `updatedAt`; otherwise inserts a new row with `crypto.randomUUID()` as id. The returned QR is upserted into the local state immediately (no full refetch needed). |
| **Delete** (per-card trash button) | `DELETE /api/airport/staff-qrs/[id]` | Removes the row from `AirportStaffQr`. The QR itself remains valid (the `/api/airport/staff-qrcode?tag=…` endpoint regenerates it on demand from the tag) — only the saved metadata is removed. |

The saved list survives page close/reopen because it's backed by the SQLite `AirportStaffQr` table (verified by the seeded 3 records remaining across requests).

## Forward-compatibility note

After the next full restart of the Next.js dev server (or in production), `db.airportStaffQr.findMany()` / `.upsert()` / `.delete()` will work natively because the regenerated PrismaClient will be loaded fresh. The raw-SQL code in `staff-qrs/route.ts` and `staff-qrs/[id]/route.ts` will continue to function identically — no refactor required, but it can be cleaned up later if desired.
