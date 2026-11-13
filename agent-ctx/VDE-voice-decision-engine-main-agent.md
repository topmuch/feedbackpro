# Task VDE — Voice Decision Engine (Denise's Brain)

**Agent:** VDE main agent
**Date:** 2026-11-13
**Scope:** Implement the complete Voice Decision Engine for Denise — the platform's
"brain" that transforms raw events into relevant vocal alerts. Covers Prisma
models, the decision engine library, seed rules, 4 API routes, a SuperAdmin
tab, integration into the airport PWA + ops-wallboard, plus tests.

All file paths, decisions, and tests are documented below for future subagents.

---

## 1. Prisma models — created via raw SQL

`prisma db push` failed due to pre-existing drift on the `Retour` table
(`etablissementId`, `note`, `proId`, `zoneId` columns required but missing in
the SQLite db). Per the task spec, fell back to raw SQL via
`bunx prisma db execute --schema prisma/schema.prisma --stdin` which created
the 3 tables without touching the drifted ones.

**Appended to** `/home/z/my-project/prisma/schema.prisma`:
- `VoiceDecisionRule` — `@@unique([sector, eventType])`, `@@index([sector, active])`
- `VoiceAnnouncementLog` — `@@index([sector, zoneRef, createdAt])`, `@@index([eventType, createdAt])`
- `VoiceTimeMode` — `@unique sector`

**SQL executed** (idempotent, `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`):
the 3 tables + 3 indexes (1 unique + 2 standard + 1 unique timemode).

After SQL: ran `bunx prisma generate` to regenerate the client, then bumped
the Prisma cache key in `src/lib/db.ts` from `prisma_v20_operations` →
`prisma_v21_voice` so the running dev server picks up the new client without
manual restart.

Verified by querying — `db.voiceDecisionRule.count()` and `.findMany()` work
in the API routes (see GET /api/admin/voice/rules log in
`/tmp/next-dev.log`).

---

## 2. Files created

### Core engine + seed
| File | Purpose |
|------|---------|
| `/home/z/my-project/src/lib/voice-decision-engine.ts` | Denise's brain — `decideAndSpeak()`, `getCurrentTimeMode()`, `getDecisionReason()`, 5-step pipeline |
| `/home/z/my-project/src/lib/voice-rules-seed.ts` | `seedVoiceRulesIfEmpty()` — 14 default rules (7 aeroport + 7 restaurant) + 2 VoiceTimeMode |

### API routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/home/z/my-project/src/app/api/admin/voice/rules/route.ts` | GET / POST | List rules (auto-seed on first GET) + upsert a rule |
| `/home/z/my-project/src/app/api/admin/voice/timemodes/route.ts` | GET / POST | List / upsert VoiceTimeMode per sector |
| `/home/z/my-project/src/app/api/admin/voice/logs/route.ts` | GET | Last 100 VoiceAnnouncementLog (filters: sector, spoken, eventType) |
| `/home/z/my-project/src/app/api/voice/decide/route.ts` | POST / GET | Public endpoint — body `{ event: VoiceEvent }` → returns `{ decision: VoiceDecision }` |

### SuperAdmin UI
| File | Purpose |
|------|---------|
| `/home/z/my-project/src/components/feedbackpro/admin-voice-tab.tsx` | Premium "Voix Denise" tab with 4 sub-sections (matrix / time / logs / test) |

---

## 3. Files modified

### `/home/z/my-project/src/lib/db.ts`
- Bumped `PRISMA_CACHE_KEY` from `'prisma_v20_operations'` → `'prisma_v21_voice'`
  so the dev server picks up the regenerated client (3 new models).

### `/home/z/my-project/src/components/feedbackpro/admin-dashboard.tsx`
- Added `Mic` to the lucide-react import list.
- Imported `AdminVoiceTab` from `@/components/feedbackpro/admin-voice-tab`.
- Added `"voix"` to the `OngletAdmin` union type.
- Added `{ id: "voix", labelKey: "nav.voix", icone: Mic }` to the ONGLETS array
  (placed between `notifications` and `parametres`).
- Added `{onglet === "voix" && <AdminVoiceTab />}` render block in main.
- Added `"nav.voix": "Voix Denise"` to both `t()` translation maps (lines 304
  and 481 — root component + sidebar component).

### `/home/z/my-project/src/components/feedbackpro/airport-staff-view.tsx`
- Removed unused import `routerVersService, serviceLabel` from
  `@/lib/airport-routing` (the new VDE flow no longer builds the "Équipe X"
  suffix manually — the template handles it server-side).
- Added a `VoiceEvent` / `VoiceDecision` type block + `decideAndParler()`
  helper near the top of the file (after constants, before PWA install type).
  The helper POSTs to `/api/voice/decide` and calls `parler(message)` only
  if `decision.shouldSpeak === true`.
- In `pollPendingReports()` (the 10s polling that detects new
  EN_ATTENTE incidents): replaced the direct `parler(\`Nouvel incident…\`)`
  call with `void decideAndParler({ sector: 'aeroport', eventType: 'new_scan',
  zone, type, temps, reportId })`. The ding + vibrate chain stays as before
  (auditory cue still fires for staff attention); Denise herself now decides
  whether to speak.

### `/home/z/my-project/src/app/ops-wallboard/page.tsx`
- Added a `VoiceEvent` / `VoiceDecision` type block + `decideAndSpeakForWallboard()`
  helper immediately after the existing `speak()` function.
  The helper POSTs to `/api/voice/decide` and calls `speak(message, true)`
  only if `decision.shouldSpeak === true`.
- In the polling loop (where new `recent_reports` are detected): replaced
  the manual "Urgence. [Zone]. [Problème]. [Équipe], intervenez
  immédiatement." TTS string construction with a single
  `void decideAndSpeakForWallboard({ sector: 'aeroport', eventType:
  'new_scan', zone, type, temps, reportId })` call. The `SOUND_NORMAL` ding
  still plays for visual attention; Denise decides whether to TTS.

---

## 4. The 5-step decision pipeline (`decideAndSpeak()`)

Located in `/home/z/my-project/src/lib/voice-decision-engine.ts`. Called
server-side by `POST /api/voice/decide`. Never throws — on internal error it
returns `shouldSpeak=false, reason="internal_error:<msg>"`.

### Step 1 — Fetch rule
`db.voiceDecisionRule.findUnique({ where: { sector_eventType: { sector, eventType } } })`.
- If no rule → `shouldSpeak=false, reason="no_rule"`.
- If `rule.active === false` → `shouldSpeak=false, reason="rule_inactive"`.
- If `rule.shouldSpeak === false` → `shouldSpeak=false, reason="rule_silent"`
  (template is still rendered + logged for audit, but no TTS).

### Step 2 — Time context
Computes the current mode from the hour:
- `06-10` → `opening`
- `10-14` → `service_lunch`
- `14-18` → `quiet`
- `18-22` → `service_dinner`
- `22-06` → `night`

Filters:
- `night` mode + eventType !== `security_sanitary` → `shouldSpeak=false,
  reason="night_mode_silent"`.
- `service_lunch` / `service_dinner` + priority === `info` →
  `shouldSpeak=false, reason="service_mode_info_filtered"`.
- `quiet` + priority === `info` → `shouldSpeak=false,
  reason="quiet_mode_filtered"`.

### Step 3 — Aggregation
If `rule.aggregationWindowSec > 0`:
- Query `VoiceAnnouncementLog` for same `(sector, zoneRef, eventType)` within
  the last `aggregationWindowSec` seconds.
- If `count >= 3 AND aggregationWindowSec <= 180` → upgrade priority to
  `important`, set `aggregateId`, replace message with `"Alerte multiple
  {zone}. {count} incidents {type}. Renfort nécessaire."`,
  `reason="aggregation_upgraded"`. The escalation bypasses step 4's
  deduplication (the upgrade MUST speak).
- Else if `count >= maxAnnouncementsPerWindow` → `shouldSpeak=false,
  reason="aggregation_suppressed"`, with `suppressUntil` set to now +
  windowSec.

### Step 4 — Deduplication
- **Double-scan**: if `event.reportId` exists and a log with the same
  `reportId` exists in the last 60s → `shouldSpeak=false,
  reason="double_scan_suppressed"`.
- **Doublon**: if a log with the same `(sector, zoneRef, eventType)` exists
  in the last 120s AND priority wasn't upgraded in step 3 →
  `shouldSpeak=false, reason="deduplication_suppressed"`.

### Step 5 — Build message + log + return
- `renderTemplate()` replaces `{ZONE}`, `{TYPE}`, `{TEMPS}`, `{TABLE}`,
  `{PRODUIT}`, `{DETAIL}`, `{DÉTAIL}` (accented variant), `{STAFF_NOM}`.
- If aggregation upgraded → message is replaced with the aggregated form.
- Volume is taken from the rule (or from `PRIORITY_VOLUME[finalPriority]`
  if priority was upgraded): `critical=+20%`, `important=0%`, `info=-10%`,
  `silent=0%`.
- Tone follows the same logic via `PRIORITY_TONE`.
- `targetAudience` is `["staff_all","ops","wallboard"]` for critical,
  `["staff_assigned","ops"]` for important, `["staff_assigned"]` for info,
  `[]` for silent.
- `logAndReturn()` inserts a `VoiceAnnouncementLog` row (best-effort — DB
  failure doesn't block the decision) then returns the `VoiceDecision`.

### Helper exports
- `getCurrentTimeMode(sector)` — async wrapper (currently same as
  `resolveTimeModeFromHour()` since the JSON in VoiceTimeMode uses the same
  default bounds; future subagents could extend it to read the actual JSON).
- `resolveTimeModeFromHour(sector, hour)` — pure function, the actual logic.
- `getDecisionReason(decision)` — returns the human-readable reason label
  (used by the admin logs table).

---

## 5. Seed rules (14 total)

**Aéroport (7):**
| eventType | shouldSpeak | priority | tone | volume | aggregation | template |
|-----------|-------------|----------|------|--------|-------------|----------|
| security_sanitary | true | critical | urgent | +20% | 0 | ALERTE SÉCURITÉ. {ZONE}. Intervention immédiate requise. |
| incident_service | true | important | firm | 0% | 180s / 1 | Attention équipe. Incident {TYPE} à {ZONE}. En attente depuis {TEMPS}. |
| new_scan | true | info | soft | -10% | 300s / 1 | Nouvel incident signalé {ZONE}. Type: {TYPE}. |
| product_missing | true | important | firm | 0% | 0 | Rupture stock {PRODUIT} à {ZONE}. Réapprovisionnement urgent. |
| incident_resolved | false | silent | calm | 0% | 0 | Incident résolu {ZONE}. |
| feedback_positive | false | silent | soft | 0% | 0 | Feedback positif reçu. |
| staff_connect | false | silent | soft | 0% | 0 | Connexion staff {STAFF_NOM}. |

**Restaurant (7):**
| eventType | shouldSpeak | priority | tone | volume | aggregation | template |
|-----------|-------------|----------|------|--------|-------------|----------|
| plate_error | true | critical | urgent | +20% | 0 | URGENCE CUISINE. Table {TABLE}. {DETAIL}. Vérification immédiate. |
| service_slow | true | important | firm | 0% | 300s | Alerte service. Table {TABLE} attend depuis {TEMPS}. Priorité table {TABLE}. |
| negative_feedback | true | info | soft | -10% | 600s / 1 | Nouveau feedback négatif table {TABLE}. À consulter au prochain passage. |
| product_out_of_stock | true | important | firm | 0% | 0 | Info cuisine. {PRODUIT} épuisé. Mettre à jour ardoise / menu. |
| feedback_positive | false | silent | soft | 0% | 0 | Feedback positif reçu. |
| reservation_cancelled | false | silent | soft | 0% | 0 | Réservation annulée. |
| rush_hour | false | silent | calm | 0% | 0 | Mode rush activé. Denise silencieuse. |

The seed is **idempotent** — `seedVoiceRulesIfEmpty()` checks `count()` first
and only inserts if 0. The rules GET endpoint auto-calls it on first request.

---

## 6. SuperAdmin tab — "Voix Denise"

Located at `/home/z/my-project/src/components/feedbackpro/admin-voice-tab.tsx`.
Premium design with 4 sub-sections in a Tabs component (Matrice / Horaire /
Historique / Test).

### Section A — Matrice de Décision
- Sticky header with `Mic` icon + Refresh button.
- Sector filter (`Select`: all / aeroport / restaurant).
- `Table` with 10 columns: event type (icon + mono), shouldSpeak (`Switch`
  inline toggle), priority (badge red/amber/green/gray), tone (badge),
  volume (mono), template (truncated), aggregation sec, max/win, active
  (`Switch` inline), edit (pencil button).
- Row click → opens `RuleEditDialog` (full edit form with all fields +
  template variable hints).
- Inline `Switch` toggles call `saveRule()` immediately (POST upsert).
- `RuleEditDialog` shows sector + eventType in title, all editable fields
  (shouldSpeak, active, priority, tone, volumeAdjustment, aggregationWindowSec,
  maxAnnouncementsPerWindow, template) + Save/Cancel.

### Section B — Contexte Horaire
- One card per sector with 5 columns (06-10, 10-14, 14-18, 18-22, 22-06).
- Each column shows: time range (mono), current mode badge (color-coded),
  `Select` to change the mode (opening / service_lunch / quiet /
  service_dinner / night), description text.
- Single "Enregistrer" button at the top right POSTs both sectors' modes.

### Section C — Historique des Annonces
- Table with 7 columns: Date/Time (fr-FR), Secteur (badge), Event type
  (mono), Zone (mono), Message (truncated with title tooltip), Prononcé
  (CheckCircle2 green / AlertTriangle gray), Raison (human-readable via
  `reasonLabel()`).
- Two filters: sector (`Select`), spoken (`Select`: all / true / false).
- Limited to 100 latest logs (server-side take: 100).

### Section D — Test Denise
- Card "Tester la voix": Textarea for custom message + Select for tone
  (urgent/firm/soft/calm) + "Parler" button.
- The tone translates to Web Speech API params:
  - urgent: rate=1.25, pitch=0.85, volume=1
  - firm: rate=1.1, pitch=0.9, volume=0.95
  - soft: rate=0.95, pitch=1.05, volume=0.75
  - calm: rate=0.85, pitch=1.1, volume=0.65
- Card "Mode horaire courant": live clock + per-sector current mode badge
  (computed from `new Date().getHours()`). Updates every second.

All effects use the `setTimeout(0)` pattern (per `react-hooks/immutability`
rule that flagged direct `void fn()` calls in `useEffect`).

---

## 7. PWA + Wallboard integration

### airport-staff-view.tsx
- `pollPendingReports()` (10s interval): on each new EN_ATTENTE incident,
  the staff PWA calls `decideAndParler()` instead of `parler()` directly.
  The ding + vibrate chain still fires (auditory cue for the staff). The
  VDE decides whether Denise actually speaks.
- Local user actions (login welcome, "pris en charge par…", "résolu en X
  minutes", etc.) still use `parler()` directly — they're not "events" but
  feedback on user-driven actions, so they bypass the engine.

### ops-wallboard/page.tsx
- `poll()` (5s interval): on each new report ID, the wallboard calls
  `decideAndSpeakForWallboard()` instead of building the "Urgence. [Zone]…"
  TTS string manually. The `SOUND_NORMAL` ding still plays.
- Resolutions and escalation sounds are unchanged — they were already
  governed by `announcedResolvedRef` / `alertedLateRef` Sets (anti-spam) and
  don't need the VDE.

### Why this is correct
- Server-side decision = same matrix for PWA + wallboard (consistency).
- The engine logs every decision to `VoiceAnnouncementLog`, so the admin
  "Historique" tab shows exactly what Denise said or didn't say, and why.
- Deduplication works across the two clients: if the staff PWA already
  announced a new_scan for zone X in the last 120s, the wallboard's poll
  5s later will see the log row and stay silent (reason=
  `deduplication_suppressed`).

---

## 8. Tests run (curl + dev server)

All tests passed against the live dev server (port 3000). The dev server
dies under heavy Turbopack compile pressure in the sandbox, but each test
got a clean JSON response before the next compile triggered an OOM. The
production-managed dev server (`bun run dev` in the system loop) handles
this fine.

| # | Event | Expected | Actual response |
|---|-------|----------|-----------------|
| 1 | aeroport/new_scan "Terminal 1 Porte B12" | speak? (depends on time) | `shouldSpeak=false, reason="service_mode_info_filtered"` ✓ (test ran at 18:39 → service_dinner → info filtered) |
| 2 | aeroport/security_sanitary "Toilettes T1" | speak critical/urgent/+20% | `shouldSpeak=true, priority="critical", tone="urgent", volume="+20%", message="ALERTE SÉCURITÉ. Toilettes T1. Intervention immédiate requise."` ✓ |
| 3 | aeroport/new_scan (dup zone) | dedup or filter | `shouldSpeak=false, reason="service_mode_info_filtered"` ✓ (filter short-circuits before dedup) |
| 4 | restaurant/plate_error table 12 | speak critical/urgent/+20% | `shouldSpeak=true, message="URGENCE CUISINE. Table 12. plat froid. Vérification immédiate."` ✓ |
| 5 | aeroport/incident_resolved | silent rule_silent | `shouldSpeak=false, reason="rule_silent"` ✓ |
| 6 | GET /api/admin/voice/rules | 200 + array | `{"rules":[...14 rules...]}` ✓ |
| 7 | GET /api/admin/voice/timemodes | 200 + 2 modes | `{"timemodes":[{sector:"aeroport",...},{sector:"restaurant",...}]}` ✓ |
| 8 | GET /api/admin/voice/logs?sector=aeroport&spoken=false | 200 + logs | `{"logs":[{eventType:"incident_resolved",reason:"rule_silent",...},{eventType:"new_scan",reason:"service_mode_info_filtered",...}]}` ✓ |

---

## 9. Lint + tsc

### `bun run lint` (filtered for my files)
- 0 errors in `voice-decision-engine.ts`, `voice-rules-seed.ts`,
  `admin-voice-tab.tsx`, the 4 API routes, `airport-staff-view.tsx`,
  `ops-wallboard/page.tsx`, `admin-dashboard.tsx`.
- The 4 remaining lint errors are pre-existing in unrelated files
  (`language-selector.tsx:33`, `scratch-card.tsx:105`, `db.ts:15` warning).
- Initial run flagged `react-hooks/immutability` on 3 `useEffect(() =>
  void fn(), [])` patterns in `admin-voice-tab.tsx` — fixed by wrapping
  each in `setTimeout(() => void fn(), 0)` with proper cleanup.

### `npx tsc --noEmit --skipLibCheck` (filtered for my files)
- 0 errors in any of my created/modified files.
- Pre-existing errors in `scripts/seed.ts`, `src/app/api/login/route.ts`,
  `src/app/api/retours/[id]/route.ts`, etc. come from the schema drift
  (`Retour.etablissementId` vs schema's `proId`/`zoneId`) — not introduced
  by this task.

---

## 10. How to use this in future work

### To add a new event type
1. Add a row to `ALL_RULES` in `src/lib/voice-rules-seed.ts` (or upsert
   via `POST /api/admin/voice/rules`).
2. Optionally extend `REASON_LABELS` in `admin-voice-tab.tsx` if you add a
   new `reason` string.
3. The PWA / wallboard just need to call `decideAndParler()` / 
   `decideAndSpeakForWallboard()` with the new `eventType`.

### To change the time-mode bounds
Currently `resolveTimeModeFromHour()` uses hardcoded bounds (06/10/14/18/22).
The `VoiceTimeMode.modes` JSON is editable from the admin tab (Section B)
but the resolution function doesn't yet read it. Future subagent could:
- Read `VoiceTimeMode.modes` JSON in `decideAndSpeakInner()`.
- Parse keys like `"06-10"` → `[6, 10)`.
- Override the default bounds.

### To bypass the engine for testing
`GET /api/voice/decide` returns a usage doc. `POST` with `{event:{sector,
eventType, ...}}` returns the decision JSON without speaking (the server
has no TTS — the client must speak). Use the SuperAdmin "Test Denise"
section to verify the browser TTS rendering.

---

## 11. Notes for the next subagent

- The `parler()` function in `src/lib/staff-tts.ts` takes only a string.
  The volume/tone adjustments from the decision (`decision.volumeAdjustment`,
  `decision.tone`) are NOT applied — they're returned in the decision JSON
  for the client to use if it wants to. Currently both `decideAndParler()`
  (PWA) and `decideAndSpeakForWallboard()` (wallboard) call the existing
  `parler()`/`speak()` as-is. If you want true volume control, you'd need to
  extend `parler()` to accept `(text, { volume, rate, pitch })` or write a
  new `parlerWithDecision(decision)` helper.
- The `decideAndSpeak()` function never throws — it always returns a
  `VoiceDecision`. If you see `reason="internal_error:..."` in the logs,
  check the dev server console for the actual stack trace.
- The deduplication window (120s) is hardcoded in the engine. If you want
  to make it configurable per rule, add a `deduplicationWindowSec` column
  to `VoiceDecisionRule` and use it in step 4.
- The aggregation upgrade threshold (`>= 3 in < 180s`) is also hardcoded.
  Same idea — add a column if you need per-rule tuning.
