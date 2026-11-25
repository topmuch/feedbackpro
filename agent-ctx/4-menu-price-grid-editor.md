# Task ID 4 — Menu / Price-grid editors for premium businesses

**Agent:** main-agent (Task ID 4 — follow-up)
**Primary file modified:** `src/components/feedbackpro/city-dashboard.tsx`
**Auxiliary files modified:**
- `src/app/api/city/businesses/route.ts` (GET serialize now exposes parsed `menu` / `priceGrid` arrays)
- `src/app/api/city/businesses/[id]/route.ts` (PATCH now accepts `menu` / `priceGrid` JSON strings + serializes them parsed)
**Status:** DONE

## Goal

Give the mairie the ability to fill in the premium content of an approved
business directly from `BusinessManagementView`:
- **Restaurants premium** → editor for up to 10 menu items `{name, photo, price}`
- **Artisans premium (non-restaurant)** → editor for up to 10 price-grid items `{service, photo, price, unit}`

Both editors use camera capture on mobile (`capture="environment"`), auto-resize
photos to 400 px (JPEG 0.7), serialize to JSON client-side, and PATCH
`/api/city/businesses/{id}` with `{menu: JSON.stringify(items)}` or
`{priceGrid: JSON.stringify(items)}`.

## Discovery while reading the file

The task brief mentioned:
> The `CityBusiness` type in the dashboard already includes `menu?: string | null` and `priceGrid?: string | null` (JSON strings)

In reality the dashboard's `CityBusiness` type already declared both fields as
**parsed arrays** (`BusinessMenuItem[] | null` / `BusinessPriceItem[] | null`),
and the GET serializer in `/api/city/businesses/route.ts` did **not** include
`menu` / `priceGrid` at all. The PATCH in `/api/city/businesses/[id]/route.ts`
also did not accept those fields. So although the task said "the API already
exists and accepts any field updates", it actually did not — without the API
edits the editor would silently fail (PATCH would return 400 "Aucun champ à
mettre à jour" and the GET would never surface the saved data back to the
dashboard).

I therefore extended both API routes so the feature works end-to-end. The
front-end stays typed as arrays (cleaner rendering) and the JSON parsing
happens server-side via a shared `parseJsonArray<T>` helper.

## Edits summary

### 1. Type changes — `city-dashboard.tsx` (lines 144-158)

```ts
type BusinessMenuItem = {
  id?: string
  name: string
  price: number
  description?: string | null
  photo?: string | null // data URL JPEG (max 400px, qualité 0.7)
}

type BusinessPriceItem = {
  id?: string
  service: string            // was: `label`
  price: number
  unit?: string | null       // ex: "forfait", "à l'heure", "m²"
  photo?: string | null      // data URL JPEG (max 400px, qualité 0.7)
}
```

Renamed `label` → `service` to match the Prisma schema doc comment
(`JSON: [{service, photo, price, unit}]`). The existing read-only viewers were
updated accordingly. `openPriceGridEditor` keeps a small back-compat shim that
reads `label` from legacy items.

### 2. New imports — `city-dashboard.tsx` (line 66)

Added `Camera` from `lucide-react` (used as the placeholder icon on the photo
capture buttons).

### 3. New module-level helpers — `city-dashboard.tsx` (lines 3676-3708)

- `resizePhotoToDataUrl(file, maxDim, quality, done)` — async helper that reads
  a `File` via `FileReader`, draws it into an offscreen `<canvas>` scaled to
  `maxDim` (preserving aspect ratio), and emits a `image/jpeg` data URL at the
  requested quality. Same pattern as `handlePhoto` in `city-scan-view.tsx`.
- `makeItemId(prefix)` — short unique id (`mi-…` / `pi-…`) for editor items.
  Uses the project's existing `Date.now() + Math.random().toString(36)` pattern.

### 4. BusinessManagementView — new state & handlers (lines 3731-4061)

State:
- `editingMenu` / `editingPriceGrid` — the `CityBusiness` being edited (drives
  the modal visibility)
- `menuItems` / `priceItems` — local edit buffer (`BusinessMenuItem[]` /
  `BusinessPriceItem[]`)
- `savingMenu` / `savingPriceGrid` — loading flags for the save buttons
- `menuFileRefs` / `priceFileRefs` — `useRef<Record<number, HTMLInputElement|null>>`
  for the hidden `<input type="file" capture="environment">` per item

Handlers:
- `openMenuEditor(b)` / `openPriceGridEditor(b)` — set the editing target and
  hydrate the buffer from the business's current `menu` / `priceGrid` arrays
- `addMenuItem` / `addPriceItem` — push a new empty item, capped at 10
  (toast if over the limit)
- `updateMenuItem(idx, patch)` / `updatePriceItem(idx, patch)` — immutable update
- `removeMenuItem(idx)` / `removePriceItem(idx)` — filter
- `handleMenuItemPhoto(idx, e)` / `handlePriceItemPhoto(idx, e)` — pull the
  file, call `resizePhotoToDataUrl(file, 400, 0.7, …)`, store the data URL on
  the item, reset the input value so the same file can be re-picked
- `handleSaveMenu` / `handleSavePriceGrid` — clean up the buffer (trim names,
  round prices, drop empty rows), require ≥ 1 item, then
  `patchBusiness(id, { menu: JSON.stringify(cleaned) }, …)`. Closes the modal
  and clears the buffer on success. Reuses the existing `patchBusiness` helper
  which already toasts the success message and refreshes both lists.

### 5. BusinessManagementView — two new editor modals (lines 4581-4942)

**Menu editor modal** (shown when `editingMenu` is set):
- Header: "Éditer le menu — {name}" + "{trade} · {n}/10 plats"
- Help text explaining the camera capture + 400 px resize
- Empty state when no items yet
- One card per item with:
  - Photo button (64×64) → opens the hidden `<input type="file"
    accept="image/*" capture="environment">`; shows the photo thumbnail or a
    `Camera` placeholder; hover overlay reads "Photo"
  - "Nom du plat" text input
  - "Prix (FCFA)" number input (`inputMode="numeric"`, step 100)
  - `Trash2` delete button (disabled while saving)
- Footer: "Ajouter un plat" outline button (disabled at 10), `{n}/10` counter,
  "Annuler" + "Enregistrer le menu" (blue, `Loader2` spinner while saving)

**Price-grid editor modal** (shown when `editingPriceGrid` is set):
- Header: "Éditer la grille tarifaire — {name}" + "{trade} · {n}/10 prestations"
- One card per item with:
  - Photo button (same pattern as menu, purple hover border)
  - "Prestation" text input
  - 2-column grid: "Prix (FCFA)" + "Unité" (forfait / à l'heure / m²…)
  - `Trash2` delete button
- Footer: "Ajouter une prestation" (disabled at 10), counter, "Annuler" +
  "Enregistrer la grille" (purple)

Both modals:
- `role="dialog"` + `aria-modal="true"`
- Click-outside closes (unless a save is in-flight — guarded with `!savingMenu`/`!savingPriceGrid`)
- `max-h-[90vh] overflow-y-auto` so the editor scrolls on small screens
- All buttons have `aria-label`s

### 6. BusinessCard — new edit buttons (lines 4575-4604 props, 4786-4809 buttons)

`BusinessCard` accepts two new optional callbacks:
- `onEditMenu?: () => void`
- `onEditPriceGrid?: () => void`

Two derived booleans control visibility:
```ts
const isRestaurant      = (b.category ?? '').toLowerCase() === 'restaurant'
const canEditMenu       = mode === 'approved' && b.isPremium && isRestaurant
const canEditPriceGrid  = mode === 'approved' && b.isPremium && !isRestaurant
```

So:
- A **premium restaurant** shows a blue "Éditer le menu" button (or "Créer le
  menu" when the menu is empty).
- A **premium non-restaurant** shows a purple "Éditer la grille" button (or
  "Créer la grille").

The pre-existing "Menu (N)" / "Tarifs (N)" outline buttons (which open the
read-only viewers) remain visible — they're now complementary: the outline
buttons are for *viewing* the published content, the solid buttons are for
*editing* it.

### 7. Existing view modals updated (lines 4449-4579)

- **Menu viewer**: now renders the photo thumbnail (`h-12 w-12 rounded-lg`) if
  `item.photo` is set; falls back to the `Utensils` icon badge otherwise.
- **Price-grid viewer**: now renders the photo thumbnail, displays
  `item.service` (was `item.label`) and the `item.unit` line below it.

### 8. BusinessManagementView wiring (line 4192-4193)

```tsx
<BusinessCard
  …
  onViewMenu={() => setViewMenu(b)}
  onViewPriceGrid={() => setViewPriceGrid(b)}
  onEditMenu={() => openMenuEditor(b)}        // NEW
  onEditPriceGrid={() => openPriceGridEditor(b)}  // NEW
/>
```

### 9. API — `GET /api/city/businesses` (route.ts)

Added a `parseJsonArray<T>(raw)` helper that safely `JSON.parse`s a stored
JSON string and returns `[]` on null / malformed / non-array. The `serialize`
function now includes:
```ts
menu:      parseJsonArray<{id?, name, price, description?, photo?}>(a.menu),
priceGrid: parseJsonArray<{id?, service, price, unit?, photo?}>(a.priceGrid),
```
So the dashboard receives ready-to-use arrays (matching the existing
`CityBusiness` type) without having to parse anything client-side.

### 10. API — `PATCH /api/city/businesses/[id]` ([id]/route.ts)

- Extended the body type to accept `menu?: string | null`,
  `priceGrid?: string | null` (and `premiumFeatures?: string[]` which the
  front-end already sends).
- Validation for both fields:
  - `null` / `''` → clears the column (`data.menu = null`)
  - must be a string; otherwise 400 "chaîne JSON attendue"
  - must `JSON.parse` to an array (≤ 10 items) — otherwise 400
  - hard size cap of 5 Mo to protect the DB column
- The `serialize` function was extended to include `menu` / `priceGrid` as
  parsed arrays (mirrors the GET serializer) so the PATCH response contains
  the freshly saved state.

## Verification

- `bun run lint` → 1 pre-existing error (`setCityLogoUrl` inside `useEffect`
  at line 436 — already present in commit `f1176a9`, mentioned in the prior
  Task 4 record). **0 new errors / warnings** from this change.
- `bunx tsc --noEmit` → 0 errors in `city-dashboard.tsx` and the two API
  routes. The two remaining TS errors are pre-existing in unrelated files
  (`plates/generate-batch/route.ts` and `city-scan-view.tsx`).
- `dev.log` → last compile `✓ Compiled in 1438ms`, no errors related to the
  dashboard or the businesses routes.

## Architecture decisions

1. **Parse JSON server-side, not client-side.** Both the GET and PATCH
   serializers now expose `menu` / `priceGrid` as ready-to-use arrays. This
   keeps the front-end fully typed (no `JSON.parse` at the call site) and
   centralises the defensive parsing in one `parseJsonArray<T>` helper that
   returns `[]` on any malformed payload — a corrupted JSON column can never
   crash the dashboard.

2. **Buffer-then-commit editor.** The editor maintains a local `menuItems` /
   `priceItems` buffer hydrated from the business record on open. Edits
   (add / update / remove / photo) mutate only the buffer; nothing is sent to
   the server until "Enregistrer" is clicked. This avoids one PATCH per
   keystroke and lets the user cancel freely.

3. **Photo capture pattern matches the rest of the app.** Same
   `<input type="file" accept="image/*" capture="environment">` + canvas
   resize + `toDataURL('image/jpeg', 0.7)` pattern used in `city-scan-view.tsx`.
   The 400 px cap (vs. 800 px for storefront photos) keeps the JSON column
   size reasonable since up to 10 photos can be stored per business.

4. **One input per item, indexed refs.** `menuFileRefs.current[idx]` and
   `priceFileRefs.current[idx]` store one hidden file input per editor row.
   Clicking the photo button calls `.click()` on the matching input. Inputs
   are reset after each pick so the same file can be re-selected.

5. **Defensive save (clean + validate).** `handleSaveMenu` / `handleSavePriceGrid`
   trim names, round prices, drop empty rows, and refuse to save if nothing
   has a name. This prevents saving a menu full of empty placeholders if the
   user clicked "Ajouter un plat" then closed without filling it.

6. **Premium-gated editing.** The edit buttons only appear for `isPremium`
   businesses. Within that, restaurants get the menu editor and everyone else
   gets the price-grid editor — matching the schema doc comments on the
   `menu` and `priceGrid` columns.

7. **Back-compat with `label`.** The previous Task 4 used `label` as the
   price-item field name; the schema doc says `service`. I renamed the type
   field to `service` (matching the schema) but `openPriceGridEditor` reads
   legacy `label` items and converts them on the fly, so any old data still
   renders correctly.

## Notes for downstream agents

- The Prisma `CityArtisan.menu` and `CityArtisan.priceGrid` columns already
  exist as `String?` (JSON). No migration is needed.
- The PATCH validation caps each field at 10 items and 5 Mo total — bump if
  you need more.
- The `BusinessMenuItem` / `BusinessPriceItem` types in the dashboard are the
  single source of truth for the editor's shape; the API serializers inline
  the same shape (duplicated on purpose so the API stays self-contained even
  if the dashboard type drifts).
- If you want the public-facing city scan view to also display the menu /
  price grid (currently it only lists businesses), you can reuse the
  `parseJsonArray` pattern on the public GET endpoint — but that's out of
  scope for this task.
