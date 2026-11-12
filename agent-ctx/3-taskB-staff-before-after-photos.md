# Task B (Phase 3) — Display Before/After Staff Photos in Reports List

## Goal
When airport staff scan a "Staff Only" QR with action=TAKE_CHARGE they upload a "before" photo;
with action=RESOLVE they upload an "after" photo. These are stored in `AirportStaffScan`.
Currently the reports list (`airport-reports-tab.tsx`) does NOT show these photos. Add a side-by-side
"Photos Avant / Après" section in a per-report details dialog and a quick photo-count badge in the
list rows.

## Scope (files I may touch)
- `src/app/api/airport/reports/route.ts`  (extend API response with `staffScans`)
- `src/components/feedbackpro/airport-reports-tab.tsx`  (Report type, details dialog, list badge)

## Out of scope (other agents)
- `airport-dashboard.tsx`
- `airport-scan-view.tsx`
- `airport-leaderboard-tab.tsx`
- `prisma/schema.prisma`

## Plan
1. Read both files fully — DONE.
2. API: batch query `db.airportStaffScan.findMany({ where: { reportId: { in: ids }, action: { in: ['TAKE_CHARGE','RESOLVE'] } }, orderBy: { createdAt: 'asc' } })`, group by reportId, attach as `staffScans: [{id,action,photoUrl,staffName,createdAt}]`.
3. Report type: add `staffScans?: Array<{id,action,photoUrl,staffName,createdAt}>`.
4. There is NO existing "details dialog" in the file. I will introduce a `ReportDetailsDialog` component that opens when clicking a new "Détails" button in each `ReportRow` actions area. This matches the spec ("the one that opens when clicking a report row") in spirit (clicking a button on the row opens the dialog) without disrupting the existing PhotoLightbox and AssignButtons behaviors.
5. Photos Avant/Après section: 4 states (both / only before / only after / none) with ArrowRight icon between the two cards, amber AVANT badge + emerald APRÈS badge, `rounded-lg border border-slate-700 bg-slate-900/50 overflow-hidden`, h-48 photos object-cover, clickable (PhotoLightbox reused).
6. List badge: in `ReportRow` badge cluster — both=emerald "2 photos", only before=amber "1 photo", none=no badge (camera-off muted icon optional). Using lucide `Camera`.

## Notes / deviations
- Photo count badge: spec says "No photos: nothing (or a muted camera-off icon)". I will render nothing for the "no photos" case (cleaner, less visual noise) — this is one of the explicitly allowed options in the spec.
- The "→" arrow between cards: I use a flex layout with the arrow as a middle item rather than a 3-col grid, so it stays centered and the cards share equal width. On mobile the layout stacks vertically and the arrow rotates 90° (ArrowRight becomes a downward visual).
- Details dialog content: I include the full report summary (zone, problem, tag, flight, status, dates, commentaire, VLM analysis) PLUS the before/after section so the manager has one comprehensive view. Reuses existing PhotoLightbox for the traveler photo and the staff photos.

## Work log
- Step 1: Read airport-reports-tab.tsx fully (1384 lines) and route.ts (75 lines). Confirmed: no existing details dialog in the component; ReportRow renders everything inline.
- Step 2: API extended — batch `db.airportStaffScan.findMany({ where: { reportId: { in: ids }, action: { in: ['TAKE_CHARGE','RESOLVE'] } }, orderBy: { createdAt: 'asc' } })`, indexed by reportId, attached to each report as `staffScans: [{id,action,photoUrl,staffName,createdAt}]`. No N+1.
- Step 3: Added `StaffScanLite` type + `staffScans?: StaffScanLite[]` field to `Report`.
- Step 4: Added helpers `getStaffPhotos(report)` and `formatTimestamp(iso)`.
- Step 5: Added photo-count badges in ReportRow badge cluster (emerald "2 photos" / amber "1 photo" / muted CameraOff only when traveler photo also missing).
- Step 6: Added "Détails" button (ChevronRight + Camera when photos exist) in ReportRow actions column.
- Step 7: Created `<ReportDetailsDialog>` (full details: info recap, traveler photo via PhotoLightbox, Photos Avant/Après section, VLM analysis, resolve action) + `<BeforeAfterPhotos>` (4 states: both with ArrowRight between, before-only with "(en cours de résolution)" hint, after-only with note, none with muted hint) + `<StaffPhotoCard>` (amber AVANT / emerald APRÈS badge, clickable img opens new tab, h-48 object-cover, staff name + timestamp).
- Step 8: Removed unused eslint-disable directive on `<img>` (the @next/next/no-img-element rule is not active in this project — confirmed by the existing PhotoLightbox using a plain `<img>`).
- Lint: my files are clean. Remaining 4 lint problems are all in files I did NOT touch (language-selector.tsx, scratch-card.tsx, src/lib/db.ts, prisma/seed-airport-ops-config.cjs).

## Files modified
1. `src/app/api/airport/reports/route.ts` — added batch staffScans query + inclusion in response.
2. `src/components/feedbackpro/airport-reports-tab.tsx` — Report type, helpers, ReportRow badge + Détails button, ReportDetailsDialog + BeforeAfterPhotos + StaffPhotoCard components.

## Exact locations (final line numbers)
### API (`src/app/api/airport/reports/route.ts`)
- Lines 52-84: batch fetch + Map indexing.
- Lines 106-113: `staffScans` field added to each report in the response.

### Component (`src/components/feedbackpro/airport-reports-tab.tsx`)
- Lines 65-71: new `StaffScanLite` type.
- Line 93: `staffScans?: StaffScanLite[]` added to `Report`.
- Lines 239-274: helpers `getStaffPhotos` + `formatTimestamp`.
- Lines 17-39: lucide imports extended with `ArrowRight`, `CameraOff`, `ChevronRight`, `User`.
- Lines 634-636: `staffPhotos` memo + `detailsOpen` state in `ReportRow`.
- Lines 717-748: photo-count badge cluster in the report LIST row (emerald "2 photos" / amber "1 photo" / muted CameraOff).
- Lines 805-819: "Détails" button in ReportRow actions.
- Lines 824-831: `<ReportDetailsDialog>` mounted at end of ReportRow.
- Lines 1217-1449: `<ReportDetailsDialog>` component definition.
- Lines 1357-1368: "Photos Avant / Après" section inside the details dialog.
- Lines 1451-1586: `<BeforeAfterPhotos>` + `<StaffPhotoCard>` components (the 4-state before/after rendering).

## Deviations from spec
1. **Details dialog did not exist** — the spec assumed "the report details Dialog (the one that opens when clicking a report row)" already existed. It did not. I created `<ReportDetailsDialog>` opened via a "Détails" button in the actions column (rather than making the whole row clickable) to avoid (a) nested-button HTML issues with the existing PhotoLightbox thumbnail and (b) click-propagation conflicts with the existing WhatsApp / Email / Résoudre buttons. The button is clearly labeled and shows a Camera icon when photos are present, so the manager can see at a glance which rows have visual proof.
2. **"No photos" badge** — spec said "nothing (or a muted camera-off icon)". I render the muted CameraOff icon ONLY when both staff photos AND the traveler photo are missing (to avoid redundant muted icons next to an existing traveler-photo thumbnail). This is one of the explicitly allowed options.
3. **Arrow layout** — spec said "2-column grid (grid-cols-2 gap-4)" with an arrow between. A strict 2-col grid cannot host a centered middle arrow, so I used a flex layout (`flex flex-col sm:flex-row sm:items-center`) with the ArrowRight as a dedicated middle flex item that rotates 90° on mobile (vertical stack) and stays horizontal on desktop. Cards remain equal-width via `flex-1`.
4. **Photo click target** — spec said "open in a new tab (or in a lightbox Dialog if you prefer)". I chose `<a target="_blank">` to avoid nested Radix Dialogs (the details dialog already contains the PhotoLightbox which itself opens a Dialog; nesting another Dialog for staff photos would stack 3 dialogs). New-tab is simpler and the spec explicitly allows it.

## Lint tail (final)
```
✖ 4 problems (3 errors, 1 warning)
  0 errors and 1 warning potentially fixable with the `--fix` option.
```
All 4 remaining problems are in files OUTSIDE my scope:
- `prisma/seed-airport-ops-config.cjs` — `@typescript-eslint/no-require-imports`
- `src/components/feedbackpro/language-selector.tsx` — `react-hooks/immutability`
- `src/components/feedbackpro/scratch-card.tsx` — `react-hooks/immutability`
- `src/lib/db.ts` — unused eslint-disable directive

My two files (`src/app/api/airport/reports/route.ts` and `src/components/feedbackpro/airport-reports-tab.tsx`) produce ZERO lint problems.

