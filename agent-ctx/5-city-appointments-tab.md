# Task 5 — City Dashboard "Rendez-vous" tab

**Agent**: city-appointments-tab
**File edited**: `src/components/feedbackpro/city-dashboard.tsx`
**Date**: 2025-11-25

## Objective
Add a "Rendez-vous" tab to the City Dashboard allowing supervisors to view and
process citizen appointment requests submitted via the QR PWA, and to move each
one through the `pending → confirmed → completed` workflow (with cancellation
allowed at any pre-completion step).

## API contract used
- `GET /api/city/appointments` → `{ ok, data: { appointments: [...], count } }`
- `PATCH /api/city/appointments/[id]` body `{ status }` → `{ ok }`
- Status values: `pending | confirmed | cancelled | completed`

## Changes made

### 1. Nav item (Administration section)
Inserted `{ id: 'appointments', label: 'Rendez-vous', icon: Calendar }` in
`NAV_SECTIONS` between `announcements` and `revenue`. The `Calendar` icon was
already imported from `lucide-react`.

### 2. Render branch
Added `{activeNav === 'appointments' && (<AppointmentsView />)}` immediately
after the `announcements` render branch (around line 1251).

### 3. AppointmentsView component (appended at end of file)
Self-contained function component that:

- **State**: `appointments`, `loading`, `updatingId` (tracks which row is being
  PATCHed so we can disable its buttons + show a spinner).
- **Fetch** (`useCallback` + `useEffect`): hits `/api/city/appointments` on
  mount with `cache: 'no-store'`, sorts results newest-first by `createdAt`
  before storing.
- **updateStatus**: PATCHes `/api/city/appointments/[id]` with `{ status }`.
  On success it does an optimistic in-place update of the matching row and
  fires a success toast; on failure it shows an error toast. Buttons on the row
  being updated are disabled and show a spinner while the request is in flight.
- **Stats summary** (`useMemo`): 4-card grid at the top — Total RDVs, En attente
  (orange `pending` badge), Confirmés (green `confirmed` badge), Terminés (blue
  `completed` badge). Uses the existing project palette constants
  (`COLOR_ORANGE`, `COLOR_GREEN`, `COLOR_BLUE`, `COLOR_GOLD`).
- **List**: each appointment card shows
  - Reference badge (gold, e.g. `RDV-1544DFF`)
  - Status badge (orange/green/red/blue per status)
  - Name + phone (with `Phone` icon)
  - Motif (full text, bold "Motif :" prefix)
  - Preferred date (formatted `DD/MM/YYYY HH:MM`) if present
  - Plate info (`plateNumber · label`) if present, with `MapPin` icon
  - Created-at relative time via the existing `timeAgo()` helper, with `Clock` icon
- **Action buttons** (right column):
  - "Confirmer" → green, shown only when `pending`
  - "Annuler" → red outline, shown when `pending` or `confirmed`
  - "Terminer" → blue, shown only when `confirmed`
  - Each uses `Check` / `X` / `Loader2` icons appropriately
- **Empty state**: dashed-border card with `Calendar` icon and the exact
  required message: "Aucun rendez-vous pour le moment. Les demandes citoyennes
  apparaîtront ici."
- **Long-list handling**: the list container uses
  `max-h-[calc(100vh-22rem)] overflow-y-auto` so the stats grid + header stay
  visible while the list scrolls.

### Types
Added local `CityAppointment` type matching the API shape (id, reference, name,
phone, email, motif, status union, preferredDate, plate `{plateNumber,label}|null`,
createdAt) plus an `APPOINTMENT_STATUS_META` map giving `{label, color}` per
status so card badges and the stats grid share one source of truth.

## Design notes
- Reused the existing project color constants (`COLOR_ORANGE/GREEN/BLUE/RED/GOLD`)
  for badge backgrounds — `color + '15'` (hex alpha) for soft backgrounds, full
  hex for text.
- Consistent with other views in the same file (`AnnouncementsView`,
  `BusinessManagementView`): white rounded-2xl cards, `border-2 border-[#d5d3d4]`,
  `shadow-sm`, Arial heading font.
- All required Lucide icons (`Calendar`, `Phone`, `MapPin`, `Check`, `X`,
  `Clock`, `RefreshCw`, `Loader2`) were already imported — no new imports added.
- `Badge` + `Button` from `@/components/ui/*` reused; no custom primitives.

## Verification
- `bun run lint` → **0 new problems**. The only reported error
  (`react-hooks/set-state-in-effect` at line 441) is **pre-existing** in the
  `city_logo_url` localStorage effect and is unrelated to this task.
- Dev server (`bun run dev`) compiled successfully ("✓ Compiled in 614ms");
  the only dev.log warnings concern `src/lib/sonde-ai.ts` importing `fs`/`path`
  in Edge instrumentation, also unrelated.

## Integration notes for downstream agents
- The frontend is fully wired. The backend endpoints
  `GET /api/city/appointments` and `PATCH /api/city/appointments/[id]` still
  need to be created (Prisma model + route handlers). Once deployed, this view
  will work with no further frontend changes.
- Suggested Prisma model (for whoever implements the API):
  ```prisma
  model CityAppointment {
    id            String   @id @default(cuid())
    reference     String   @unique        // "RDV-XXXXXXXX"
    name          String
    phone         String
    email         String?
    motif         String
    status        String   @default("pending") // pending|confirmed|cancelled|completed
    preferredDate DateTime?
    plateId       String?
    plate         CityPlate? @relation(fields: [plateId], references: [id])
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
  }
  ```
- The PATCH handler should accept `{ status }`, validate the transition, update
  the row, and return `{ ok: true }` (matching what this view expects).
