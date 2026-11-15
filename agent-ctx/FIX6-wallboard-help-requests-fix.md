# FIX6 — Fix 6 critical wallboard & reports issues

Agent: FIX6
Scope: SOS help requests missing from wallboard, old zone codes not
displayed, reports tab auto-refresh, signalétique zone tiles, photo
display, resolution notifications.

## Files modified

1. `src/app/api/airport/wallboard/route.ts`
2. `src/app/ops-wallboard/page.tsx`
3. `src/components/feedbackpro/airport-reports-tab.tsx`

## Issue-by-issue summary

### Issue 1 + Issue 6 — SOS help requests in wallboard API (route.ts)
- Fetch `AirportHelpRequest` where `statut='EN_ATTENTE'` & `createdAt>=since24`.
- Fetch recently-resolved help requests (`RESOLU`, `resolvedAt >= now-30s`).
- Second aggregation loop: each help request increments `total_24h`,
  `en_attente`, zone `count_24h`, `count_en_attente`, `last_report_at`.
- Merged into `recent_reports` with `isHelpRequest:true`, id prefixed
  `sos_<id>` (no collision with AirportReport ids in dedup refs), and
  `problemType` from the `message` field.
- New `help_requests` array exposed in the response (id, zone, tagScanne,
  message, problemType, travelerPhone, statut, createdAt, resolvedAt)
  for the wallboard alerts panel.
- `recently_resolved` now also includes resolved help requests (prefixed
  `sos_`) → wallboard plays the "resolved" sound for SOS too (Issue 6).

### Issue 2 — zoneFamily old zone codes (ops-wallboard/page.tsx)
`zoneFamily()` now maps the 5 historical codes BEFORE prefix checks:
- bagages / sanitaires / files_attente / embarquement → TERMINAL
- restauration → COMMERCIAL
Reports created via `?airport=tapis_bagages_1` (code `bagages`) now
appear in the zone map instead of being filtered out as HISTORIQUE.

### Issue 3 — reports tab auto-refresh (airport-reports-tab.tsx)
Polling already existed (10s `setInterval`). Made background polls
**silent**: `load(silent?)` skips `setLoading(true/false)` when
`silent=true` so the skeleton no longer flickers every 10s. Manual
refresh buttons + filter changes still call `load()` (with loading).
Polling now calls `load(true)`.

### Issue 4 — signalétique zone tiles (ops-wallboard/page.tsx)
`ZoneTile` redesigned: top row is `[▸ yellow #FCD116] [emoji 16px]`,
then zone name, then count. Matches the signalétique layout
`[arrow][pictogram][text]`. Emoji kept but smaller; yellow directional
arrow added before it.

### Issue 5 — photo display (airport-reports-tab.tsx)
- `StaffPhotoCard` photos `h-48` → `h-64` (img + placeholder).
- AVANT / APRÈS badges restyled to yellow signalétique (bg `#FCD116`,
  black text, uppercase, letter-spacing) — consistent with the wallboard.
- Side-by-side on desktop was already in place (`sm:flex-row`).

### Wallboard page consumption (ops-wallboard/page.tsx)
- `RecentReport.isHelpRequest?: boolean` added.
- New `HelpRequestLite` type + `help_requests?` field on `WallboardData`.
- New `<HelpRequestAlertCard />` (signalétique, SOS badge, message,
  "APPELER VOYAGEUR" tel: link if travelerPhone present) rendered in
  the ALERTES ACTIVES panel (top 3).
- `activeReportAlerts` excludes `isHelpRequest` (no duplicate cards).
- `IncidentRow`: SOS rows get a yellow "SOS" pill in the PROBLÈME cell;
  assign + escalate actions (which hit report-only endpoints) are
  hidden for help requests; call-PC button kept.
- Poll announcement: if `latest.isHelpRequest`, Denise announces
  "Demande d'aide SOS voyageur..." instead of "Nouvel incident...".

## Verification
- `bun run lint`: 0 issues in the 3 modified files (4 pre-existing
  errors in unrelated files: scratch-card.tsx, language-selector.tsx,
  seed-airport-ops-config.cjs, db.ts).
- `npx tsc --noEmit --skipLibCheck`: clean (no output).
