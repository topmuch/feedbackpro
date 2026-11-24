# Task 5-8 — CityDashboard: 7 enhancements (QR, actions, forms, redesign)

**Agent:** main-agent
**File edited:** `src/components/feedbackpro/city-dashboard.tsx`
**Status:** DONE

## Goal

Enhance the CityDashboard with 7 features: editable plaques with QR codes,
incident status actions, artisan creation, transport/teams tabs, editable
mairie, and a modern overview redesign.

## Tasks completed

### Task 1 — PlatesMapView: QR code + editable owner info
- Each plate card now shows a **QR code image (100x100)** built from
  `composedQrs[p.id]` (premium composition with city logo) or
  `qrServerUrl(${origin}/?cityPlate=${p.qrToken}, 200)` as fallback.
- The image is wrapped in a `<button>` that opens a **lightbox dialog**
  showing the QR at full size with the plate number + label.
- Each card has a **"Modifier"** button that opens an edit form with
  fields: label, district, address, lat, lng. Saving calls
  `PATCH /api/city/plates/{id}` then `onRefresh()` to reload data.
- Success / error feedback via `useToast`.
- PlatesMapView now accepts `composedQrs`, `cityLogoUrl`, `onRefresh`,
  `onNavigate` props. The header has a "Gérer les plaques" button that
  navigates to the plates-mgmt tab.

### Task 2 — ReportsView: Pris en charge / Résolu buttons
- `IncidentCard` accepts an optional `onUpdateStatus?: (id, newStatus)` prop.
  When provided, action buttons are rendered based on current status:
  - `pending` → **"Pris en charge"** button (sets status to `in_progress`)
  - `in_progress` or `assigned` → **"Résolu"** button (sets status to `resolved`)
  - `resolved` → **green "Résolu" badge** with timestamp + staffName (no buttons)
- The button calls `PATCH /api/city/incidents/{id}` with `{status}` body.
- CityDashboard now has a `handleUpdateIncident(id, newStatus)` callback
  that does **optimistic local state update** + PATCH. On failure it
  reverts and shows an error toast.
- `ReportsView` and `EmergenciesView` both accept `onUpdateStatus` and
  pass it through `ReportGroup` to each `IncidentCard`. This means
  emergencies can also be triaged directly from the Urgences tab.

### Task 3 — ArtisansView: Ajouter un artisan button + form
- New "Ajouter un artisan" button at the top of the header (green).
- Opens an inline form with fields: name, trade, phone, district,
  lat, lng, **verified (checkbox)**, **premium (checkbox)**.
- Validation: name ≥ 2 chars, trade ≥ 2 chars, phone matches
  `^\+?\d{8,15}$`.
- On submit: `POST /api/city/artisans` with all fields.
- After success:
  - The newly-created artisan is prepended to a local `localAdded` state
    with the admin's verified/premium choices (the API forces these to
    false for citizen submissions, but the director's choices are
    respected in the dashboard display).
  - `onRefresh()` is called to refresh the server-side list.
  - Toast "Artisan ajouté".
- The `CityArtisan` type was extended to include `lat`, `lng`, `address`
  fields (the API already returned them but the type didn't reflect it).

### Task 4 — TransportView (new tab, localStorage)
- New component `TransportView` rendered when `activeNav === 'transports'`.
- Persists entries in `localStorage` under key `city_transports`.
- Each entry has: id, line, destination, schedule, type (bus/taxi/train).
- Pre-seeded with 4 default lines (Bus 25, Bus 18, TER Dakar-AIBD, Taxi collectif Médina).
- "Ajouter transport" button opens a form with line, destination,
  schedule, and a 3-button type selector (bus/train/taxi with emojis).
- Cards use colored top borders + emoji badges per type:
  bus=blue, train=purple, taxi=gold.
- Each card has a "Supprimer" button.
- Uses the `Bus` icon from lucide-react.

### Task 5 — MairieDynamicView: editable + localStorage
- Complete rewrite. Now persists:
  - `city_mairie_services` — services municipaux (name, phone, desc, icon)
  - `city_mairie_hours` — horaires d'ouverture (day, hours, open)
  - `city_mairie_announcements` — annonces (title, date, time, emoji)
- Each section has its own "Ajouter" button:
  - "Ajouter un service" — opens a form with name, phone, description,
    and an emoji picker (15 emojis to choose from).
  - "Ajouter une annonce" — opens a form with title, date, time, emoji picker.
- Each service row has 3 actions: Appeler (tel:), Modifier (icon gear),
  Supprimer (icon trash). Modifier reuses the same form in edit mode.
- Each announcement has a Supprimer button.
- The hours section is **editable inline**: each row has a text input for
  the hours string + a toggle button (✓ open / ✗ closed).
- The "Mairie ouverte/fermée" status is now **computed from the stored
  hours** (parses "8h00 - 16h00" format and compares to current time).
- Open/closed state hydrates after localStorage load to avoid SSR mismatch.

### Task 6 — TeamsView (new tab, localStorage)
- New component `TeamsView` rendered when `activeNav === 'teams'`.
- Persists entries in `localStorage` under key `city_teams`.
- Each member has: id, name, role, phone, district, status
  (active/off_duty).
- Pre-seeded with 4 default members across different roles/districts.
- "Ajouter un membre" button opens a form with name, role (select:
  Chef de quartier, Agent, Technicien, Coordinateur, Inspecteur),
  phone, district, and a status toggle (En service / En repos).
- Member cards show:
  - avatar (initial in colored circle)
  - name + role (with role emoji)
  - district
  - status badge (green "En service" / gray "Repos") — clickable to toggle
- Each card has a **"Appeler" button** (`tel:` link) and a Supprimer button.
- Uses the `Users2` icon from lucide-react.
- Header shows live counts: total / active / off-duty.

### Task 7 — Overview redesign
- **Hero banner** (dark gradient): title "Vue d'ensemble", subtitle,
  live clock + "Système actif" pulse indicator.
- **Enhanced KPI grid** (6 cards using new `KpiCardEnhanced` component):
  - colored top border matching the metric type (red/orange/blue/green/gold/purple)
  - **trend indicator** badge (e.g. "+8%", "+12%", "+0.2") with up/flat arrow
  - subtle color halo at bottom-right
  - hover lifts the card (-translate-y-0.5 + shadow)
  - status chip (Critique / À traiter / ✓ OK) when relevant
- **3-column grid on desktop** (`xl:grid-cols-3`):
  - **Col 1**: Activity Timeline + Heatmap quartiers
    - Timeline: vertical list of recent incidents with colored dots,
      emoji, category, description, plate info, time-ago. Has a vertical
      gradient line connecting entries. Scrollable (max-h-400px).
  - **Col 2**: Quick Actions + Alertes en direct
    - Quick Actions: 8 buttons in a 2x4 grid (Ajouter plaque, Voir urgences,
      Créer annonce, Nouvel artisan, Carte plaques, Mairie dynamique,
      Équipes terrain, Transports). Each has icon, label, badge (for
      urgences count), hover lift, navigates to the corresponding tab.
    - Alertes en direct: scrollable list of top 5 recent alerts with
      "Traiter" and "Détails" buttons that navigate to the relevant tab.
  - **Col 3**: Carte plaques (compact) + Revenus artisans (dark) + Aminata (dark)
    - Compact map (260px) with "Voir carte →" button to navigate
    - Revenus card has "Détails revenus →" button
    - Aminata card has "Diffuser une annonce" button that navigates
- New sub-components added: `KpiCardEnhanced`, `QuickAction`.

## Architecture decisions

1. **Optimistic UI for incident status changes** —
   `handleUpdateIncident` snapshots `incidents`, updates local state
   immediately, PATCHes the API. On failure it reverts + reloads.
   This keeps the sidebar badge and KPI counts in sync without waiting
   for a refetch.

2. **Local `localAdded` state for artisans** — Since the API's GET
   filters `verified=true` only, a newly-created artisan (verified=false
   by the API) wouldn't appear in the list after refetch. The dashboard
   keeps a local list of just-added artisans so the director sees them
   immediately. The local copy uses the admin's verified/premium
   choices (not the API's forced false).

3. **localStorage try/catch everywhere** — All localStorage access is
   wrapped in try/catch to handle SSR (window/localStorage undefined
   during SSR) and private browsing (quota exceeded / disabled).

4. **Hydration guard** — `MairieDynamicView` uses a `hydrated` flag
   that prevents the live clock from starting before localStorage
   values are loaded, ensuring the open/closed status is computed
   from the stored hours (not the default mock).

5. **Type extension for CityArtisan** — Added `lat`, `lng`, `address`
   to the type since the API's `serialize()` returns them but the
   type didn't reflect it. This was needed for the artisan add form
   to copy GPS coords back into the local display list.

6. **No API changes** — All edits were confined to `city-dashboard.tsx`
   as instructed. Where the API doesn't support a feature (e.g.
   verified/premium flags on POST artisan), the dashboard compensates
   with local state.

## Edits made (high-level)

- **Imports**: no new imports added (all needed icons already imported).
- **CityDashboard body**:
  - Added `handleUpdateIncident` callback (~50 lines).
  - Updated routing to pass `onUpdateStatus`, `composedQrs`,
    `cityLogoUrl`, `onRefresh`, `onNavigate` to relevant views.
  - Added routing for `transports` and `teams` tabs (previously empty).
  - Replaced the entire `activeNav === 'overview'` block with the
    redesigned hero + KPIs + 3-column grid.
- **New sub-components** (after `KpiCard`):
  - `KpiCardEnhanced` (~95 lines) — KPI with trend + halo
  - `QuickAction` (~30 lines) — action button for the Quick Actions grid
- **IncidentCard**: rewrote to accept `onUpdateStatus` and render
  action buttons / résolu badge.
- **ReportsView / EmergenciesView**: accept + forward `onUpdateStatus`.
- **ReportGroup**: accept + forward `onUpdateStatus`.
- **ArtisansView**: rewrote with add form + localAdded state.
- **MairieDynamicView**: full rewrite (~580 lines, localStorage-backed).
- **PlatesMapView**: rewrote with QR image + Modifier form + lightbox.
- **TransportView** (new, ~250 lines): localStorage + add form.
- **TeamsView** (new, ~330 lines): localStorage + add form + Appeler.

## Lint / type check

- `bun run lint`: 1 error on line 317
  (`if (saved) setCityLogoUrl(saved)` inside a `useEffect`). This is
  **pre-existing** code (the logo-from-localStorage loader, originally
  line 315 in the previous version). No new lint errors were introduced.
- `bunx tsc --noEmit --skipLibCheck`: no errors specific to
  `city-dashboard.tsx` after the two fixes (CityArtisan type extension
  for lat/lng/address, and `as TeamMember['status']` cast for the
  toggleStatus function).
- Dev server compiles cleanly (`✓ Compiled in 561ms`); no
  city-dashboard errors in `dev.log`.

## Notes for downstream agents

- The `reports-mgmt` tab is still empty (was not in this task's scope).
- All localStorage keys used:
  - `city_logo_url` (existing)
  - `city_sound` (existing)
  - `city_mairie_services`, `city_mairie_hours`, `city_mairie_announcements` (new)
  - `city_transports` (new)
  - `city_teams` (new)
- The `composedQrs` map is computed in the parent `CityDashboard` for
  the first 24 plates (limit on canvas composition performance). Plates
  beyond index 24 use the raw `qrServerUrl` fallback.
- The Artisan POST endpoint ignores `verified` and `premium` in the
  body (forces them to false). The dashboard works around this with
  local state, but if a future agent updates the API to accept those
  fields, the local `localAdded` workaround can be removed.
- The IncidentCard action buttons appear in BOTH ReportsView and
  EmergenciesView (both pass `onUpdateStatus`). This is intentional —
  emergencies should be triageable too.
