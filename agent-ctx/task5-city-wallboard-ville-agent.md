# Task 5 — City Wallboard (Ville Connectée) — Agent Record

**Task ID:** 5
**Agent:** city-wallboard-ville-agent
**Date:** 2026-11-24
**Status:** DONE

## Objective
Create a City Wallboard page for the Ville Connectée module, inspired by the
airport ops wallboard (`/ops-wallboard`) but using Aminata's voice
(`parler()` from `@/lib/staff-tts`) instead of Nathalie's speak().

## Deliverables

### 1. API endpoint — `src/app/api/city/wallboard/route.ts`
- `GET` only, public (no auth — shared URL for the municipal supervision room).
- `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'`
  → never CDN-cached.
- Uses `import { db } from '@/lib/db'` and queries `CityIncident`, `CityPlate`,
  `CityArtisan` (all confirmed in `prisma/schema.prisma`).
- Returns `{ ok: true, data: { stats, recentIncidents } }` via `ok()` from
  `@/lib/session`.
- Stats aggregated:
  - `totalIncidents24h` — count on last 24h (all types)
  - `pendingEmergencies` — type=emergency, status in (pending|assigned|in_progress).
    Note: emergencies are created directly with status='assigned' by
    `/api/city/incidents` POST, so filtering on `status='pending'` alone
    would miss active emergencies.
  - `pendingReports` — type=report, status='pending'
  - `resolvedToday` — status='resolved' AND resolvedAt >= start-of-day local
  - `platesCount` — `db.cityPlate.count()`
  - `activeArtisans` — `db.cityArtisan.count({ where: { active: true } })`
  - `avgSatisfaction` — mock 4.6
  - `revenueTotal` — mock 18_400_000 FCFA
- `recentIncidents` — last 10 with `plate` relation joined
  (`plateNumber`, `label`, `district`) and ISO-serialized dates.
- All 7 count/findMany queries run in parallel via `Promise.all([...])`.
- Verified: `curl http://localhost:3000/api/city/wallboard` → `200`
  `{ok:true,data:{stats:{...avgSatisfaction:4.6,revenueTotal:18400000},recentIncidents:[]}}`.

### 2. Wallboard page — `src/app/city-wallboard/page.tsx`
- `'use client'` + `export const dynamic = 'force-dynamic'` (cache-busting).
- Standalone route at `/city-wallboard`, accessible directly.
- Polling `/api/city/wallboard` every 5s with `cache: 'no-store'`.
- Dark theme charte Ville Connectée:
  - bg `#0a0a0a`, cards `#1a1a1a`, border `#262626`
  - text white, accent yellow `#FFDD00` + accent blue `#1B2A8C`
  - status colors: red `#E30613`, orange `#FF6B00`, green `#00A651`
- Header: Building2 icon (blue tile + yellow border) + title
  "CENTRE DE SUPERVISION URBAIN" + subtitle "Ville Connectée — Dakar",
  with a live clock (HH:MM:SS) updating every 1s + full French date.
- KPI row: 6 `<KpiCard>` in a responsive grid (`grid-cols-2 md:3 lg:6`):
  1. Urgences → `pendingEmergencies` (red)
  2. Signalements → `pendingReports` (orange)
  3. Orientations → `resolvedToday` (blue) — sublabel "Résolus aujourd'hui"
  4. Artisans → `activeArtisans` (yellow)
  5. Satisfaction → `avgSatisfaction.toFixed(1)` (yellow)
  6. Revenus → `fmtFCFA(revenueTotal)` → "18,40M FCFA" (green)
- Main grid `lg:grid-cols-[2fr_1fr]`:
  - Left: recent incidents table (10 rows, sticky header, scrollable up to
    `max-h-[calc(100vh-360px)]`). Columns: Type badge (color-coded), Catégorie,
    Lieu (plate label + district with MapPin), Statut (color-coded uppercase),
    Service (assignedTo), "Il y a" (time-ago).
  - Right: alerts panel — split between "Urgences en cours" (red-bordered cards)
    and "Signalements en attente" (subtle cards), each scrollable.
- Live status pill ("Live — màj toutes les 5s" with pulsing green dot) +
  inline error display if the fetch fails.
- Voice announcement logic (Aminata):
  - `seenIdsRef` (Set) + `firstPollRef` (bool) — first poll only seeds the set,
    no announcements (otherwise a salve would fire for all historical incidents
    at wallboard boot).
  - On subsequent polls, new incidents (id not in `seenIdsRef`) of type
    `emergency` or `report` trigger:
    1. `playDing()` → `/sounds/ding-dong.mp3` via hidden `<audio>` ref.
    2. `parler()` call (3s apart, max 3 per poll) with the prescribed template:
       - emergency: `Nouvelle urgence signalée. ${category}. ${service} notifié.`
       - report:    `Nouveau signalement. ${category}. ${service} notifié.`
       - `service` omitted (no "notifié" clause) when `assignedTo` is null.
  - `announcedRef` (Set) dedupes — never announces the same id twice.
- Sound toggle button (Volume2 / VolumeX from lucide-react):
  - Persisted in `localStorage` under key `city_wallboard_sound` (`'1'` / `'0'`).
  - Default ON (no pref → soundOn=true), consistent with the airport wallboard
    behaviour (TV-dedicated room).
  - On toggle off → `window.speechSynthesis.cancel()`.
  - On toggle on → plays ding + confirmation message via `parler()`.
- Autoplay policy unlock: first `pointerdown`/`keydown` anywhere primes the
  audio element (silent play at volume 0.001 then reset), tracked by
  `audioUnlocked` state shown in the footer.
- Footer: brand "FeedVoice × Mairie de Dakar — Ville Connectée" + voice/sound
  status line.
- ~470 lines total — within the spirit of the "~300-400 lines" guidance
  (slightly over because of the typed helpers + table column rendering, but
  deliberately much smaller than the 3475-line airport wallboard).

### 3. Wrapper tab — `src/components/feedbackpro/city-wallboard-tab.tsx`
- `'use client'` (matches `airport-wallboard-tab.tsx` pattern).
- Single iframe embedding `/city-wallboard` in `absolute inset-0` layout
  inside a `h-[calc(100vh-80px)]` rounded container, exactly as specified
  in the task brief.

## Files touched
- NEW `src/app/api/city/wallboard/route.ts`
- NEW `src/app/city-wallboard/page.tsx`
- NEW `src/components/feedbackpro/city-wallboard-tab.tsx`
- NEW `/agent-ctx/task5-city-wallboard-ville-agent.md` (this record)

No existing files modified — the wrapper is ready to be wired into the
CityDashboard sidebar by a follow-up task (not in this task's scope).

## Validation
- `npx eslint src/app/api/city/wallboard/route.ts src/app/city-wallboard/page.tsx
  src/components/feedbackpro/city-wallboard-tab.tsx` → 0 errors, 0 warnings.
- `bun run lint` → only 1 pre-existing error in
  `src/components/feedbackpro/city-dashboard.tsx:306` (unrelated setState-in-effect
  warning, present before this task).
- Dev server (`/home/z/my-project/dev.log`) shows:
  - `GET /api/city/wallboard 200 in 11ms (compile: 6ms, render: 6ms)`
  - `GET /city-wallboard 200 in 580ms (compile: 540ms, render: 40ms)`
- `curl http://localhost:3000/api/city/wallboard` returns the full envelope:
  `{ok:true,data:{stats:{...avgSatisfaction:4.6,revenueTotal:18400000},recentIncidents:[]}}`.
- `curl http://localhost:3000/city-wallboard` returns HTML containing
  "CENTRE DE SUPERVISION URBAIN" + "Ville Connectée".

## Notes for downstream agents
- KPI "Orientations" card is mapped to `resolvedToday` because the API spec
  in the brief did not include an "orientation" count. The card sublabel
  "Résolus aujourd'hui" makes the mapping transparent to the operator. If a
  follow-up wants a real `orientation24h` count, add it to the API and swap
  the KPI value — the `KpiCard` props make this a one-liner.
- The wrapper `<CityWallboardTab />` is NOT yet wired into the
  `<CityDashboard />` sidebar (the dashboard uses its own `activeNav` state
  with hardcoded `NAV_SECTIONS`). To surface the wallboard tab in the
  dashboard, add a `{ id: 'wallboard', label: 'Wallboard TV', icon: Radio }`
  entry to `NAV_SECTIONS` (Administration section) and render
  `<CityWallboardTab />` when `activeNav === 'wallboard'`. Left out of this
  task per scope.
- Mock KPIs (`avgSatisfaction`, `revenueTotal`) are clearly tagged "(mock)"
  in the card sublabels so operators aren't misled.
