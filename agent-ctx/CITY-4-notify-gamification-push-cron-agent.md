# CITY-4 — 4 Features for the City Module (Ville Connectée)

**Task ID:** CITY-4
**Agent:** main-agent (z.ai Code)
**Date:** 2026-11-26
**Status:** Completed

## Scope

Implemented 4 new features for the city module (`/api/city/*` and `/api/cron/*`):
1. Citizen Resolution Notification (#1) — WhatsApp deep-link on incident resolve
2. Citizen Gamification (#7) — points API per citizen action
3. Push Notifications for Mairie (#5) — web-push subscribe + broadcast
4. Daily Report Cron (#8) — `rapport-ville` daily aggregation + email

## Files Created

| File | Feature | Purpose |
|---|---|---|
| `src/app/api/city/notify-resolution/route.ts` | #1 | POST → generates `wa.me` URL with pre-filled resolution message |
| `src/app/api/city/citizens/[phone]/points/route.ts` | #7 | GET (points balance) + POST (award points per action) |
| `src/app/api/city/push/subscribe/route.ts` | #5 | POST → saves PushSubscription in-memory store |
| `src/app/api/city/push/send/route.ts` | #5 | POST → broadcasts web-push to all mairie subscribers |
| `src/app/api/cron/rapport-ville/route.ts` | #8 | GET (CRON_SECRET) → daily aggregation, saves CityReport, emails mairie |
| `src/lib/city-push-store.ts` | #5 | In-memory Map singleton for push subscriptions (V1, no schema change) |

## Files Modified

| File | Change |
|---|---|
| `src/components/feedbackpro/city-dashboard.tsx` | Added `extractPhoneFromDescription()` helper; wired `/api/city/notify-resolution` call into `handleUpdateIncident` success branch (opens `wa.me` deep link + toast "Citoyen notifié par WhatsApp" when a phone is found in the incident description) |
| `vercel.json` | Registered `/api/cron/rapport-ville` cron at `30 7 * * *` (daily 07:30 UTC) |

## Design Decisions

### Feature #1 — Citizen Resolution Notification
- **Approach chosen:** New endpoint returning a `wa.me` deep link (zero API cost, manual send by the agent).
- **Why not schema change:** The `CityIncident` model has no `citizenPhone` field, and per the task brief the schema cannot be modified right now. Instead, the frontend extracts a phone from the incident's free-text `description` using a regex (`/\+?\d(?:[\s.\-]?\d){7,14}/g`) with date-pattern exclusion.
- **Response shape:** `{ ok: true, data: { incidentId, whatsappUrl, message, resolvedAt } }`.
- **Frontend UX:** On successful PATCH to `resolved`, if a phone is found, the dashboard calls the notify endpoint, opens `wa.me` in a new tab, and toasts "Citoyen notifié par WhatsApp". If no phone is found, the standard "Incident résolu" toast is shown and the skip is logged. The notify call is wrapped in try/catch and is **non-blocking** — the incident stays resolved even if the notification fails.

### Feature #2 — Citizen Gamification
- **Points grid:** `report=+10`, `tax_report=+50`, `quartier_ad=+5`, `checkin=+2`, `sos=+0`.
- **SOS rationale:** Safety alerts are explicitly NOT gamified (a SOS is an emergency, not an achievement). The endpoint returns `awarded: 0` with a note rather than rejecting the call, so the frontend flow stays uniform.
- **Atomic increment:** Uses `db.cityCitizen.update({ where: { phone }, data: { points: { increment: amount } } })` — safe under concurrent calls from the same phone.
- **404 if citizen missing:** The frontend must first `POST /api/city/citizens` to create the account before awarding points.
- **Route params:** `[phone]` is read via `await params` (Next.js 16 expects a Promise). Phone is URL-decoded and normalized.

### Feature #3 — Push Notifications for Mairie
- **Pattern cloned from:** `/api/airport/push/subscribe` and `/api/airport/push/send`.
- **V1 storage:** In-memory `Map` singleton (`src/lib/city-push-store.ts`) persisted on `globalThis` to survive HMR. No `CityPushSubscription` Prisma model exists and the schema cannot be modified — the in-memory store is sufficient for a single-instance dev/sandbox server. **Refinement path:** add a `CityPushSubscription` model + `db:push`, then swap `listSubscriptions`/`upsertSubscription` for Prisma queries.
- **VAPID keys:** Shared with the airport module (`process.env.VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`). One VAPID keypair per app, not per module.
- **Demo mode:** Without VAPID keys, the send endpoint logs the payload and returns `skipped: 'no_vapid_keys'` (same graceful degradation as airport).
- **web-push import:** Dynamic `await import('web-push')` to keep ESLint `no-require-imports` happy (CJS/ESM interop).

### Feature #4 — Daily Report Cron
- **Auth pattern:** `Authorization: Bearer $CRON_SECRET` header, exactly like `/api/cron/rapports-quotidiens` and `/api/cron/recap-weekly`. Returns 501 if `CRON_SECRET` env unset, 401 if header mismatch.
- **Aggregation window:** Start of today UTC → now. Period string `YYYY-MM-DD` (UTC).
- **Metrics collected:** total incidents, resolved incidents + avg resolution minutes (from `resolvedAt - createdAt`), tax reports, new businesses (`CityArtisan`), quartier ads, orientations.
- **Persistence:** Upsert-logical on `CityReport` (type='daily', period=today). Finds existing row, updates if present, creates otherwise — idempotent so manual cron reruns are safe.
- **Email:** HTML template (inline-CSS, responsive) sent via `sendEmail()` to `process.env.CITY_MAIRIE_EMAIL` (fallback `mairie@feedvoice.local`). In demo mode (no Resend key) the email is logged and `emailSent=true` is still returned (non-blocking).
- **Schedule:** Added to `vercel.json` as `30 7 * * *` (07:30 UTC daily).

## Validation

- **Lint:** `bun run lint` — only 1 pre-existing error (`react-hooks/set-state-in-effect` on the logo localStorage load at line ~875, unrelated to this task). Zero new errors introduced by the 4 features.
- **TypeScript:** `bunx tsc --noEmit` — zero errors in any of the 6 new files. Pre-existing errors in `city-dashboard.tsx`, `city-scan-view.tsx`, `city-staff-view.tsx`, `plates/generate-batch/route.ts` remain unchanged (not in scope).
- **Patterns reused:** All routes follow the established conventions — `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`, `import { db } from '@/lib/db'`, `import { ok, fail } from '@/lib/session'`, response shape `{ ok: true, data } | { ok: false, error }`.

## API Contract Summary

```
POST /api/city/notify-resolution
  body: { incidentId: string, phone: string }
  → 200 { ok: true, data: { incidentId, whatsappUrl, message, resolvedAt } }
  → 404 if incident not found
  → 400 if missing fields

GET  /api/city/citizens/[phone]/points
  → 200 { ok: true, data: { citizen: { id, phone, name, points, ... } } }
  → 404 if citizen not registered

POST /api/city/citizens/[phone]/points
  body: { action: 'report'|'tax_report'|'quartier_ad'|'checkin'|'sos' }
  → 200 { ok: true, data: { action, awarded, total, previousTotal? } }
  → 404 if citizen not registered

POST /api/city/push/subscribe
  body: { endpoint, keys: { p256dh, auth }, staffName? }
  → 200 { ok: true, data: { id, endpoint, staffName } }

POST /api/city/push/send
  body: { title?, body, url?, tag?, staffName? }
  → 200 { ok: true, data: { sent, failed, total, skipped? } }

GET  /api/cron/rapport-ville   (Header: Authorization: Bearer $CRON_SECRET)
  → 200 { ok: true, data: { period, reportId, metrics, emailSent, emailRecipient } }
  → 401 if bad token, 501 if CRON_SECRET unset
```

## Notes for Next Agent

- The push subscription store is **in-memory** — it will be lost on server restart and does not sync across instances. If a persistent store is needed, add `model CityPushSubscription` to `prisma/schema.prisma` (mirror `AirportPushSubscription`), run `bun run db:push`, and replace the body of `src/lib/city-push-store.ts` with Prisma calls. The route handlers will not need to change.
- The `satisfaction` field in `CityReport` is hardcoded to `0` in the daily cron because there is no citizen rating mechanism yet in the city module. Wire it up when a satisfaction survey feature is added.
- The notify-resolution endpoint generates a `wa.me` deep link only. To send automatically (without agent click), integrate the WhatsApp Cloud API or the existing `src/lib/whatsapp.ts` / `src/lib/twilio.ts` providers in a future iteration.
