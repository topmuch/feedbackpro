# Task 3 — Pré-charger une ville (Commune Seeder Modal)

**Agent:** City Dashboard — Plate Management Enhancer
**Task ID:** 3
**File modified:** `/home/z/my-project/src/components/feedbackpro/city-dashboard.tsx`
**Status:** Complete

## Objective

Add a "Pré-charger une ville" feature to the dashboard's plate management
section. Lets the mairie pick a commune from the Dakar region and auto-generate
all plates for that commune's quartiers, with GPS pre-filled.

## Prior context used

- Task `1-city-seed-data.md` → confirms exports `DAKAR_REGION`,
  `ALL_COMMUNES`, `getCommuneByCode`, type `CommuneSeed`.
- `/api/city/plates/seed/route.ts` → POST `{ communeCode }`, returns
  `201 { ok: true, data: { created, commune, department, plates[] } }`,
  or `409` if plates with the prefix already exist.

## Changes delivered

### 1. Imports (top of file)
- Added `Map` to the `lucide-react` import block.
- Added:
  ```ts
  import { DAKAR_REGION, ALL_COMMUNES } from '@/lib/city-seed-data'
  import type { CommuneSeed } from '@/lib/city-seed-data'
  ```

### 2. New component `CommuneSeederModal` (~lines 2142–2522)
A self-contained modal inserted just before `PlatesManagementView` so it is in
scope when the view references it.

**Internal state:**
- `selectedDept: string | null` — currently chosen department name
- `generating: boolean` — controls spinner / disabled state
- `result: SeedResult | null` — success payload (`{ created, commune, department, plates[] }`)
- `error: string | null` — error message (409 etc.)

**Department color palette** (`DEPARTMENT_COLORS` map + `deptColor()` helper).
Static Tailwind classes (no runtime template-string tricks) so JIT picks them up:

| Department    | Color     | Hex        |
|---------------|-----------|------------|
| Dakar         | blue-ink  | `#2E5C8A`  |
| Pikine        | green     | `#4A7C59`  |
| Guédiawaye    | orange    | `#FF6B00`  |
| Keur Massar   | purple    | `#7A4FB0`  |
| Rufisque      | teal      | `#0F8A8A`  |

Each entry exposes `bg`, `ring`, `text`, `dot`, `btn` Tailwind class strings.

**UX flow (4 steps):**
1. **Step indicator breadcrumb** at the top (Département › Commune › Génération).
2. **Department selector** — grid of 5 cards (responsive 2 / 3 / 5 columns).
3. **Commune list** — appears once a department is selected. Cards show:
   - 2-letter code badge (department color)
   - commune name
   - quartier count + approximate GPS (`centerLat`, `centerLng` formatted to 4 decimals)
   - 5-quartier preview chips (`+N autres` when truncated)
   - "Générer les plaques" button (department color, full width)
4. **Generation states:**
   - **Loading** → centered spinner + helper text.
   - **Error (HTTP 409)** → red card: "Cette commune a déjà des plaques. Supprimez-les d'abord…"
     + toast (destructive).
   - **Success** → green card with check icon, created count, commune name, and
     the **first 5 plate numbers** (`DD#001`, …) as a preview grid. Buttons:
     "Pré-charger une autre commune" (`reset()`) and "Fermer & actualiser"
     (`onClose()` triggers parent `onRefresh`).

**Networking:** `POST /api/city/plates/seed` with `{ communeCode }`.
- On `res.status === 409`: friendly error message + destructive toast.
- On `json.ok`: stores `data` in `result` state and emits a success toast.

**Accessibility / responsiveness:**
- `role="dialog"`, `aria-modal="true"`, `aria-label`.
- Close button has `aria-label="Fermer"`.
- Overlay click outside dismisses the modal.
- `max-h-[90vh] overflow-y-auto` for long lists, sticky header.
- Grid collapses from 2 cols on mobile → 5 on `lg`.

### 3. `PlatesManagementView` integration
- Added state: `const [showSeeder, setShowSeeder] = useState(false)` (~line 2171).
- Added a prominent button in the header actions, **left of "Générer un lot"**:
  ```tsx
  <Button onClick={() => setShowSeeder(true)} className="bg-[#2E5C8A] text-white hover:bg-[#1F4A75]">
    <Map className="h-4 w-4 mr-1.5" /> Pré-charger une ville
  </Button>
  ```
- Modal render at the end of the view's JSX (~lines 2922-2935):
  ```tsx
  {showSeeder && (
    <CommuneSeederModal
      onClose={async () => {
        setShowSeeder(false)
        try { await onRefresh() } catch { /* ignore */ }
      }}
    />
  )}
  ```
  `onRefresh` is the parent prop already used elsewhere in the view — the plate
  list refreshes after a successful (or attempted) generation so the new
  `DD#001…` rows appear immediately in the table.

## Verification

- `bun run lint` → **1 pre-existing error** (line 440: `setState` inside an
  effect for `localStorage` city-logo URL — unrelated to this task, already
  documented in Task 1's notes). **No new errors** introduced by this change.
- Dev server log shows successful compilation (`✓ Compiled in 1438ms` after the
  edit) and no runtime errors related to `city-dashboard.tsx`,
  `plates/seed`, `Pré-charger`, or `CommuneSeeder`.

## Notes for downstream agents

- The modal lives inside the same file as `PlatesManagementView`. If you want to
  reuse it elsewhere, extract `CommuneSeederModal`, `DEPARTMENT_COLORS`,
  `deptColor`, and `SeedResult` into a dedicated file under
  `src/components/feedbackpro/`.
- The button colour (`#2E5C8A`) is a deliberate dark-blue-ink to distinguish it
  from the gold "Générer un lot" button — both are visible side by side in the
  header. This is a deep navy ink rather than a pure Tailwind `blue-*`, to keep
  the dashboard's editorial palette while still standing out.
- Plate prefix format is `${code}#${seq padded to 3}` (e.g. `DD#001`). The
  backend (`/api/city/plates/seed/route.ts`) handles the actual numbering and
  GPS spiral offset; the modal only fires the request and displays the result.
- To support re-seeding a commune later, the `409` branch is intentionally
  instructional — it points the user to delete existing plates from the table
  first (no destructive auto-delete from the modal).
