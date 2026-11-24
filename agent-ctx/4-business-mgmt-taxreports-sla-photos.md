# Task 4 — CityDashboard management features

**Agent:** main-agent (Task ID 4)
**File modified:** `src/components/feedbackpro/city-dashboard.tsx`
**Auxiliary files modified:** `src/app/api/city/incidents/route.ts`, `src/app/api/city/incidents/[id]/route.ts`
**Status:** DONE

## Goal

Add four management capabilities to the CityDashboard:
1. Business approval management (new "Commerces" tab in Administration section)
2. SLA photos display on incident cards (Avant/Après + arrival/resolution badges)
3. AI analysis display on tax reports (fill the empty "Rapports" tab)
4. Premium activation panel with per-feature toggles

## API contracts (created in parallel by another agent)

The front-end consumes these endpoints (already implemented or in progress):
- `GET /api/city/businesses?status=pending|approved` → list of `CityBusiness`
- `PATCH /api/city/businesses/{id}` — body: `{status?, isPremium?, isSponsored?, offerText?, offerEndsAt?, premiumFeatures?}`
- `PATCH /api/city/incidents/{id}` — extended body: `{status?, staffName?, arrivedAt?, beforePhoto?, afterPhoto?}` (extended by this task)
- `GET /api/city/tax-reports` (existing, exposes `aiAnalysis` JSON string)
- `PATCH /api/city/tax-reports/{id}` (existing — Valider / Encaisser / Récompenser)

## Edits summary

### 1. Types (lines 91-214)
Extended `CityIncident` with optional `arrivedAt`, `beforePhoto`, `afterPhoto` (string ISO / data URL).

Added new types:
- `BusinessMenuItem`, `BusinessPriceItem` (sub-shapes for the `menu` and `priceGrid` arrays)
- `CityBusiness` (full business record: id, name, trade, category, phone, district, address, photoUrl, status, isPremium, isSponsored, offerText, offerEndsAt, premiumFeatures, menu, priceGrid, createdAt)
- `TaxReportAiAnalysis` (parsed shape: depositType, hasVehicle, vehiclePlate, description, confidence)
- `CityTaxReport` (full tax report: photoUrl, vehiclePlate, aiAnalysis JSON string, status, taxAmount, rewardAmount, rewardMethod, citizenPhone, plate relation, etc.)

### 2. Helpers (lines 260-281)
- `formatDateTime(iso)` — short French format `JJ/MM/AAAA à HH:MM`
- `resolutionMinutes(startIso, endIso)` — duration in minutes between arrivedAt and resolvedAt
- `formatDurationLabel(min)` — "18 min" or "1 h 12"

### 3. PhotoLightbox + PhotoThumb (lines 2532-2660)
Shared photo-viewer utilities used everywhere photos need enlarging:
- `PhotoLightbox({src, caption, onClose})` — full-screen fixed overlay, Esc to close, body scroll-lock, click-outside dismiss
- `PhotoThumb({src, label, size})` — small thumbnail button that opens a `PhotoLightbox` on click; renders a "Avant"/"Après"/etc. caption overlay

### 4. IncidentCard enhanced (lines 2755-2801)
Added a new SLA block between the info rows and the action buttons. Visible only when at least one of `arrivedAt`, `beforePhoto`, `afterPhoto` is set:
- Blue "Pris en charge le JJ/MM à HH:MM" badge (when `arrivedAt`)
- Green "Résolu en X min" badge (when both `arrivedAt` + `resolvedAt` are set)
- Side-by-side `PhotoThumb` thumbnails labelled "Avant" and "Après" (when respective photo is set)
- When both photos exist, an "Avant / Après" label appears between them
- Public-photos notice: "Photos publiques — transparence citoyenne"

### 5. BusinessManagementView (lines 3631-4300)
Two-section management page fetched from `/api/city/businesses?status=...`:

**Section 1 — "En attente de validation" (status=pending)**
- Header with orange left-border + count badge
- Empty state when nothing pending
- `BusinessCard` grid with photo, name, trade, category badge, phone (tel:), district, address, submission time
- Two action buttons: **Approuver** (green) → PATCH `{status:"approved"}` and **Rejeter** (red) → PATCH `{status:"rejected"}`

**Section 2 — "Commerces actifs" (status=approved)**
- Header with search bar (filters by name/trade/category/district/phone)
- `BusinessCard` grid with same info + premium/sponsored badges + offer text preview
- Action buttons per card:
  - **Activer Premium / Désactiver Premium** toggle → opens feature-choice modal or PATCH `{isPremium:false}`
  - **Sponsoriser / Arrêter sponsoring** → opens offer form or PATCH `{isSponsored:false, offerText:null, offerEndsAt:null}`
  - **Menu (N)** — visible only if `menu.length > 0` — opens a list modal with name + price + description
  - **Tarifs (N)** — visible only if `priceGrid.length > 0` — opens a list modal with label + price

**Section 3 — Premium activation panel**
- Header with Sparkles icon, premium count badge
- Lists every `isPremium=true` business with their active feature badges (Menu / Grille / Sponsorisé)
- "Feature" button → opens feature-choice modal (Menu & Commande / Grille Tarifaire / Annonce sponsorisée)
- "Désactiver Premium" button → PATCH `{isPremium:false, isSponsored:false}`

**Modals**
- Feature-choice modal (3 large buttons with icon + description)
- Sponsor form modal (offerText textarea + datetime-local for offerEndsAt)
- Menu viewer modal (list with Utensils icon, price in FCFA)
- PriceGrid viewer modal (list with Tag icon, price in FCFA)

### 6. TaxReportsView + TaxReportCard (lines 4537-5213)
Self-contained view fetched from `GET /api/city/tax-reports`:

**Helpers**
- `parseAiAnalysis(raw)` — safely parses the JSON `aiAnalysis` field, returns `TaxReportAiAnalysis | null`
- `depositTypeColor(type)` — colour-coded badge by deposit type (Dump sauvage / Véhicule / Conteneur / Chantier / Inconnu)
- `taxReportStatusInfo(status)` — French label + Tailwind bg classes for `reported | verified | tax_collected | rewarded`
- `rewardMethodLabel(method)` — Wave / Orange Money / Pass Internet / Points fidélité

**TaxReportsView**
- Header with total count + total taxes encaissées + total rewards versées
- Filter chips (Tous / Signalés / Vérifiés / Encaissés / Récompensés) with live counts
- Search bar (matches vehiclePlate, description, plateNumber, district, AI-extracted fields)
- Card grid using `TaxReportCard`

**TaxReportCard**
- Photo thumbnail (clickable → `PhotoLightbox`) or `FileBarChart` placeholder
- Status badge (top-right, coloured by status)
- Description (citoyen quote, clamped)
- AI analysis block (purple-tinted card with Sparkles icon):
  - Deposit type badge (coloured by `depositType`)
  - Vehicle plate mono badge (red) if `vehiclePlate` detected by AI or supplied by citizen
  - "Pas de véhicule" badge if `hasVehicle === false`
  - AI description (italic, clamped 3 lines)
  - Confidence bar (purple fill, % label)
- Info rows: véhicule signalé, plaque QR, citoyen (tel:), agent
- Tax / reward summary cards (green / gold) when amounts > 0
- Status-driven action buttons:
  - `reported` → **Valider** (blue) → PATCH `{status:"verified"}`
  - `verified` → **Encaisser** (green) → PATCH `{status:"tax_collected", taxAmount:25000}`
  - `tax_collected` → **Récompenser** (gold) → opens reward dialog
  - `rewarded` → green "Récompense envoyée" badge with relative timestamp
- Reward dialog: displays the auto-calculated reward (1000 FCFA vehicle / 500 FCFA dump), method select (Wave / Orange Money / Pass Internet / Points), required citizen phone input → PATCH `{status:"rewarded", rewardMethod, citizenPhone}`

### 7. Sidebar + main render wiring
- Added new nav item `{ id: 'businesses', label: 'Commerces', icon: ShoppingBag }` in the Administration section (between `plates-mgmt` and `announcements`)
- Added conditional render blocks:
  - `activeNav === 'businesses'` → `<BusinessManagementView onRefresh={handleRefresh} />`
  - `activeNav === 'reports-mgmt'` → `<TaxReportsView />` (previously empty)

### 8. New lucide-react icons imported
Added `Utensils`, `Tag`, `ShoppingBag`, `Sparkles` for the new views (menu / price-grid / commerce list / premium activation respectively).

### 9. handleUpdateIncident extended (lines 665-700)
When marking an incident as `in_progress`, the optimistic update now also sets `arrivedAt = now` (if not already set), and the PATCH body includes `arrivedAt: true` (server shortcut for "now"). This populates the SLA badge immediately.

### 10. API: incidents GET + PATCH extended
- `src/app/api/city/incidents/route.ts` (GET) — serializer now returns `arrivedAt`, `beforePhoto`, `afterPhoto` so the dashboard polling loop gets them.
- `src/app/api/city/incidents/[id]/route.ts` (PATCH) — now accepts `arrivedAt` (ISO string or `true` shortcut for "now"), `beforePhoto`, `afterPhoto` (data URLs persisted as-is for transparency).

## Architecture decisions

1. **Defensive parsing.** The `CityBusiness` and `CityTaxReport` shapes are inferred from the API contract; the front-end only renders fields that exist. `parseAiAnalysis` wraps `JSON.parse` in try/catch so a malformed `aiAnalysis` field never crashes the dashboard.

2. **Self-contained data fetching.** `BusinessManagementView` and `TaxReportsView` fetch their own data via `useEffect` + `useCallback(fetchLists)`, mirroring the pattern of the existing `AnnouncementsView`. They refresh after each PATCH mutation so the UI stays in sync.

3. **Shared `PhotoLightbox` + `PhotoThumb`.** Rather than re-implementing per view, a single lightbox component is reused for: incident Avant/Après photos, business card photos, and tax report photos. Esc closes, body-scroll-lock prevents background scroll, click-outside dismisses.

4. **Optimistic UI for `arrivedAt`.** The `handleUpdateIncident` callback now stamps `arrivedAt` locally before the PATCH roundtrip, so the "Pris en charge le …" badge appears instantly.

5. **Reward modal reuses existing API contract.** The reward PATCH sends `{status:"rewarded", rewardMethod, citizenPhone}` — the server computes the amount (1000 vehicle / 500 dump) and creates the `CityReward` record, so the front-end only needs to display the expected amount in the modal for transparency.

6. **Feature-choice modal.** Premium activation requires choosing which feature to enable (Menu & Commande / Grille Tarifaire / Annonce sponsorisée). Selecting "sponsored" opens the offer form in sequence.

## Verification

- `bun run lint` — 1 pre-existing error (line 431 `setCityLogoUrl` inside useEffect — not introduced by this task, was already present in commit `f1176a9`), 0 warnings from new code.
- `dev.log` — no compile errors, no missing modules. Dev server recompiles cleanly.
- All new components are typed; no `any` introduced.
- Mobile-first responsive grids (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`).
- All interactive elements have `aria-label`s; modals declare `role="dialog"` + `aria-modal="true"`.

## Notes for downstream agents

- The `CityBusiness` model does not yet exist in `prisma/schema.prisma` (Task 3 — backend). The front-end is ready to consume it once the `GET /api/city/businesses?status=...` and `PATCH /api/city/businesses/{id}` routes are implemented; in the meantime the views show empty states.
- The `CityTaxReport.aiAnalysis` field exists in the schema (`String?` JSON) but is not yet populated by any API route. Once the AI analysis pipeline writes to this column, the `TaxReportsView` will automatically render the deposit-type badge, vehicle plate, description, and confidence bar.
- The `arrivedAt`, `beforePhoto`, `afterPhoto` columns already exist on `CityIncident` (added by a previous migration). The incidents GET/PATCH routes were extended to surface and accept them.
