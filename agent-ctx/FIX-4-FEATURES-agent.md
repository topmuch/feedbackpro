# FIX-4-FEATURES — Implementation report

**Task ID:** FIX-4-FEATURES
**Agent:** main-agent
**Date:** 2026-11-18
**Status:** All 4 features implemented, TypeScript & ESLint clean.

## Summary

Implemented 4 features for the FeedbackPro project at `/home/z/my-project`.
All files were read BEFORE being modified. TypeScript strict compilation
passes (`bunx tsc --noEmit` → 0 errors). ESLint passes for all touched
files (the 5 pre-existing errors in `language-selector.tsx` /
`scratch-card.tsx` / `lib/db.ts` are unrelated to this task).

---

## Feature 1 — Notifications dans signalements (admin top bar bell)

### Files modified
- **NEW** `src/components/feedbackpro/airport-incidents-bell.tsx` — Bell
  component dedicated to airport incidents (`EN_ATTENTE`).
- `src/components/feedbackpro/admin-dashboard.tsx` — imported
  `AirportIncidentsBell` and placed it next to the existing
  `NotificationsBell` in the admin top bar (line ~497).

### Implementation
- Polls `GET /api/airport/reports?statut=EN_ATTENTE&limit=5` every 20 s
  (cache: "no-store").
- Badge count on the bell (amber, `9+` if > 9) shows the number of
  pending incidents (`count` field of the API response).
- Clicking the bell opens a dropdown with the 5 most recent pending
  incidents: zone emoji, `zone.nom`, `problemType`, and a relative time
  (`à l'instant`, `il y a X min`, …).
- Footer link "Voir le centre opérationnel" navigates SPA-style to
  `/superadmin/operations` (uses `window.history.pushState` + popstate).
- Tone support (`light` | `dark`) consistent with the existing
  `NotificationsBell` component.

### Notes
- Did **NOT** modify the existing `NotificationsBell` component (which is
  wired to `/api/notifications` + the rattrapage client toasts). Added
  a sibling dedicated bell instead to keep concerns separated.

---

## Feature 2 — Voix Denise : Gestion des Signalements

### Files modified
- `src/components/feedbackpro/admin-voice-tab.tsx`:
  - Imported `useRef` (for stable refs), `parler` from `@/lib/staff-tts`,
    and 3 new icons (`Megaphone`, `CheckCheck`, `TrendingUp`).
  - Updated the Tabs grid from `md:grid-cols-4` to `md:grid-cols-5` to
    host the new "Signalements" tab.
  - Added `<TabsContent value="signalements">` rendering the new
    `SignalementsDeniseSection` component.
  - Added the `SignalementsDeniseSection` function (~330 lines) plus the
    `KpiPill` helper at the bottom of the file.

### Implementation
- **KPIs** at the top: Total / En attente / En cours / Résolus (derived
  from the loaded reports).
- **Feed temps réel**: polls `GET /api/airport/reports?limit=10` every
  15 s; uses a `Set<string>` ref to detect new incidents on subsequent
  polls (silently — the bell handles the toast side).
- **Table** of the 10 most recent incidents with columns: Incident
  (emoji + problemType + #shortId), Zone, Statut (badge), Signalé
  (relative time), Actions Denise.
- **Buttons per row**:
  - **Annoncer** (Megaphone, violet): calls `parler()` from
    `@/lib/staff-tts` with a phrase like "Nouveau signalement. Zone X.
    <problemType>." Triggers the Web Speech API (Denise voice = grave +
    fast).
  - **Escalader** (TrendingUp, amber): POST `/api/airport/ops/take-charge`
    with `{ reportId }` → marks the report as `EN_COURS`. Also announces
    "Escalade signalée. Zone X. Prise en charge ops."
  - **Résoudre** (CheckCheck, emerald): POST `/api/airport/ops/resolve`
    with `{ reportId }` → marks as `RESOLU` + sets `resolvedAt`. Also
    announces "Signalement résolu. Zone X."
- Buttons are disabled while a request is in-flight (`busyId` state) or
  when the report is already `RESOLU` (opacity-60 on the row).
- Manual refresh button in the header.

---

## Feature 3 — Header QR code avec logo aéroport

### Files modified
- `src/components/feedbackpro/airport-scan-view.tsx`:
  - Refactored the `AirportLogo` component to always render an `<img>`:
    - `src = zoneData.airportLogo || "/logo-feedbackpro.png"` (the
      airport Pro's `logoUrl` field, or the default FeedbackPro logo).
    - Removed the Plane-icon fallback — the header now ALWAYS shows a
      logo image (per the task spec: "If the establishment has a
      `logoUrl`, use it. Otherwise use `/logo-feedbackpro.png`").
    - Added `onError` handler: if the remote `logoUrl` is broken, the
      browser swaps it for `/logo-feedbackpro.png` (idempotent guard
      prevents infinite loops).
  - Added a new self-contained `HeaderClock` component (HH:MM, format
    FR 24h, refreshed every 30 s via `setInterval`).
  - Added a `formatHeureCourte(d: Date)` helper.
  - Wired the `HeaderClock` into both headers that already display
    `AirportLogo`:
    - Header 1 (`phase === "zone_detectee"`) — restructured to a 2-line
      layout: establishment name (line 1) + clock (line 2) next to the
      logo. Layout: `[Logo] [Name + Clock]` … `[Quit button]`.
    - Header 2 (`phase === "probleme_choisi"`) — same 2-line layout:
      `[Logo] [Zone emoji + Name + Clock]`.

### Notes
- The `zoneData.airportLogo` field is populated by the existing
  `GET /api/airport/zone/[tag]` route which already pulls it from the
  first non-suspended Pro with `typeEtablissement='Aéroport'`. No API
  changes needed.
- The third header (rose, `aide_sos` phase) was left untouched: it does
  not show a logo today (only zone emoji + name) — adding a logo there
  would change the SOS UX semantics, so it's out of scope.

---

## Feature 4 — Logo dans Paramètres → affiché dans header QR

### Files modified
1. `src/lib/validation.ts` — added `"setLogo"` to the `adminProActionSchema`
   action enum, and added a new optional `logoUrl` field with a Zod refine
   that accepts:
   - `""` (clear the logo),
   - absolute URLs `https?://…`,
   - relative URLs served by `/api/uploads/*` or `/uploads/*`
     (returned by `/api/public/upload`),
   - `data:image/…` URLs.
2. `src/app/api/admin/pros/route.ts`:
   - GET: now exposes `logoUrl: p.logoUrl ?? null` in the response so the
     admin UI can preview the current logo.
   - POST: added a new `case "setLogo"` branch that updates the Pro's
     `logoUrl` field (null when `logoUrl === ""` to clear).
3. `src/components/feedbackpro/admin-dashboard.tsx`:
   - Extended the existing `ProLigne` type with `logoUrl?: string | null`.
   - Wrapped the existing `ParametresTab` `<form>` inside a
     `<div className="space-y-4 max-w-2xl">` to host the new
     `LogoEtablissementCard` **above** the existing settings form.
   - Added a new `LogoEtablissementCard` component (~330 lines):
     - **Establishment picker**: Select shadcn/ui with Pros sorted
       (Aéroport first, then alphabetical). Pre-selects the first
       Aéroport Pro if one exists.
     - **Image upload**: hidden `<input type="file">` triggered by a
       button. Uploads via `POST /api/public/upload` (FormData field
       "photo") → returns `{ url: "/api/uploads/<uuid>.webp" }`.
     - **Preview**: shows the current logo (pending upload > Pro.logoUrl
       > fallback `/logo-feedbackpro.png`) in an 80×80 box.
     - **Save button**: `POST /api/admin/pros { action: "setLogo", id,
       logoUrl }` — disabled until a new image has been uploaded.
     - **Clear button**: same endpoint with `logoUrl: ""` — sets the
       Pro's logoUrl to null (header falls back to /logo-feedbackpro.png).
     - All buttons are `type="button"` so they don't trigger the parent
       settings form submit.
     - Toasts for every action (upload, save, clear, errors).

### Notes
- `src/app/api/public/upload/route.ts` was **NOT** modified — verified it
  still exists (yes, 2057 bytes, 6 Nov 17 08:34) and is consumed as-is by
  `LogoEtablissementCard`.
- Auth/login routes (SHA256) were **NOT** modified.
- No Prisma schema change was needed: `Pro.logoUrl` already exists in
  `prisma/schema.prisma` (line 47).

---

## Verification

### TypeScript
```
$ bunx tsc --noEmit
(no output → 0 errors)
```

### ESLint
```
$ bun run lint
6 problems (5 errors, 1 warning) — all PRE-EXISTING in:
  - src/components/feedbackpro/language-selector.tsx (1 error, immutable cookie)
  - src/components/feedbackpro/scratch-card.tsx     (1 error, reassign after render)
  - src/lib/db.ts                                   (1 warning, unused eslint-disable)
None of my modified files produce lint errors.
```

### Dev server log
All compilations succeed (✓ Compiled in Xms). No errors related to my
changes.

### API contract verification
- `GET /api/airport/reports?statut=EN_ATTENTE&limit=5` — already
  supported (filter by `statut` + `limit` validated, returns
  `{ reports: [...], count }`).
- `GET /api/airport/reports?limit=10` — used by Feature 2.
- `POST /api/airport/ops/resolve { reportId }` — used by Feature 2.
- `POST /api/airport/ops/take-charge { reportId }` — used by Feature 2.
- `POST /api/public/upload` (FormData "photo") — used by Feature 4.
- `POST /api/admin/pros { action: "setLogo", id, logoUrl }` — NEW action
  added to existing endpoint.
- `GET /api/admin/pros` — extended with `logoUrl` field.

---

## Files touched (recap)

| File | Status | Lines |
|------|--------|-------|
| `src/components/feedbackpro/airport-incidents-bell.tsx` | NEW | 211 |
| `src/components/feedbackpro/admin-dashboard.tsx` | MODIFIED | +2 imports, +1 bell in top bar, +1 line in `ProLigne` type, +1 wrapper div, +1 close div, +1 `</form>` close, +330 `LogoEtablissementCard` |
| `src/components/feedbackpro/admin-voice-tab.tsx` | MODIFIED | +1 import `useRef`, +3 icons, +1 `parler` import, +1 TabsTrigger, +1 TabsContent, +330 `SignalementsDeniseSection` + `KpiPill` |
| `src/components/feedbackpro/airport-scan-view.tsx` | MODIFIED | rewrote `AirportLogo` (no Plane fallback), +`HeaderClock` +`formatHeureCourte`, +clock in 2 headers |
| `src/lib/validation.ts` | MODIFIED | +`"setLogo"` action, +`logoUrl` field with refine |
| `src/app/api/admin/pros/route.ts` | MODIFIED | +`logoUrl` in GET response, +`case "setLogo"` in POST |
