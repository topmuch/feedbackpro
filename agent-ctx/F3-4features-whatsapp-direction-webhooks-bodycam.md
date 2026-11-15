# Task F3 — Build 4 Features (Single Agent)

**Agent**: F3 main agent
**Date**: 2026-11-15
**Scope**: 4 features (WhatsApp Bot 2.0, Direction Dashboard, Marketplace Webhooks, Body Cam Staff)

---

## Summary

Implemented 4 features end-to-end for the FeedbackPro airport platform.

- **Feature 1 — WhatsApp Bot 2.0 Conversational**: New `src/lib/whatsapp-bot-ai.ts` exports `processWhatsAppMessage(phone, message)` returning `{ reply, action? }`. Natural-language parser (accent-insensitive, synonym-based) recognizes: bilan/résumé/rapport, zone <name> (with synonym matching like "toilettes" → sanitaires), incident <id>, assigne <id> <team>, stats, aide, calme ?. Webhook route `whatsapp-webhook/route.ts` now dispatches via `processWhatsAppMessage` (keeping existing Twilio signature validation + TwiML response).

- **Feature 2 — Dashboard Direction (C-Level)**: New `GET /api/airport/direction-dashboard` aggregates 9 KPI blocks in one call: passenger estimate (active flights × 4 rotations × 150 pax), satisfaction % (Retour.note ≥ 4), NPS (Retour.nps 0-10), avg resolution (24h/7d/30d), SLA compliance (% resolved within zone target), ad revenue MTD (sum Campaign.priceMonthlyFcfa active), top 3 performers (AirportAgentScore current month), trends (weekly/monthly delta %), zone risk ranking (score = incidents × 1 + en_attente × 3 + avg_min × 0.2). Frontend `admin-direction-tab.tsx` renders 4 big KPI cards + CSS bar chart (7 bars navy/gold) + top 3 + zone risk table + "Export PDF" button (opens HTML report in new tab + auto-prints). Integrated as new "Direction" tab in admin-dashboard.tsx.

- **Feature 3 — Marketplace Webhooks**: Added `WebhookEndpoint` Prisma model (id/name/url/events JSON/active/createdAt). New `src/lib/webhook-dispatcher.ts` exports `dispatchWebhook(event, data)` — fetches all active endpoints subscribed to event, POSTs JSON payload with 5s timeout, never throws. `sendTestWebhook(url, name)` for the Test button. API: `GET/POST /api/admin/webhooks`, `DELETE/PATCH /api/admin/webhooks/[id]`, `POST /api/admin/webhooks/test`. Integrated dispatch calls in `/api/airport/report/route.ts` (event=`new_incident`) and `/api/airport/ops/resolve/route.ts` (event=`resolved`). Frontend `admin-webhooks-tab.tsx` — table with name/URL/events badges/status/actions (Test, Toggle, Delete) + create dialog with event checkboxes (new_incident, resolved, escalation, prediction_alert). Integrated as new "Webhooks" tab.

- **Feature 4 — Body Cam Staff**: Added `AirportStaffLocation` Prisma model (id/staffName/lat/lng/createdAt + @@index). Modified `airport-staff-view.tsx`:
  - Added `bodyCamInputRef` (second hidden `<input type="file" accept="image/*" capture="environment" />`)
  - `triggerBodyCam(scanId, mode)` auto-opens camera after `takeCharge` (mode=TAKE_CHARGE) and after `resolveReport` (mode=RESOLVE)
  - `onBodyCamChosen` handler: uploads photo via `/api/public/upload`, captures geolocation in parallel via `navigator.geolocation.getCurrentPosition()`, PATCHes the scan via new `PATCH /api/airport/staff-scan/[id]` (with photoUrl + message="geo:lat,lng"), posts GPS to `POST /api/airport/staff-location`, shows "📸 Photo auto-capturée (AVANT/APRÈS) + position GPS" flash confirmation
  - Also created missing `POST /api/public/upload` (was referenced by 5+ files but didn't exist) — uses sharp to convert to WebP, max 1600px wide, 8MB limit, stored in `data/uploads/` served by `/api/uploads/[file]`

## Files Created

```
src/lib/whatsapp-bot-ai.ts                                            (329 lines)
src/lib/webhook-dispatcher.ts                                         (181 lines)
src/app/api/admin/webhooks/route.ts                                   (110 lines)
src/app/api/admin/webhooks/[id]/route.ts                              (70 lines)
src/app/api/admin/webhooks/test/route.ts                              (54 lines)
src/app/api/airport/direction-dashboard/route.ts                      (316 lines)
src/app/api/airport/staff-location/route.ts                           (90 lines)
src/app/api/airport/staff-scan/[id]/route.ts                          (60 lines)
src/app/api/public/upload/route.ts                                    (104 lines)
src/components/feedbackpro/admin-direction-tab.tsx                    (658 lines)
src/components/feedbackpro/admin-webhooks-tab.tsx                     (493 lines)
```

## Files Modified

```
prisma/schema.prisma                       (+48 lines: WebhookEndpoint, AirportStaffLocation)
src/lib/db.ts                              (PRISMA_CACHE_KEY bump v22 → v23_f3)
src/app/api/airport/whatsapp-webhook/route.ts   (import processWhatsAppMessage, replace dispatch)
src/app/api/airport/report/route.ts        (+19 lines: dispatchWebhook('new_incident', …) fire-and-forget)
src/app/api/airport/ops/resolve/route.ts   (+18 lines: dispatchWebhook('resolved', …) fire-and-forget, select createdAt+tagScanne)
src/components/feedbackpro/admin-dashboard.tsx   (2 new tabs Direction+Webhooks, label maps, icons Plane+Webhook)
src/components/feedbackpro/airport-staff-view.tsx (+160 lines: bodyCamInputRef, captureGeolocation, uploadBodyCamPhoto, postStaffLocation, triggerBodyCam, onBodyCamChosen, flash UI)
```

## Verification

- **`bun run db:push`**: ✅ Prisma schema synced, client regenerated (v6.19.2)
- **`bunx tsc --noEmit`**: ✅ Zero TypeScript errors
- **`bunx eslint .`**: ✅ Zero errors introduced. 3 pre-existing errors remain (language-selector, scratch-card, seed-airport-ops-config.cjs) + 1 pre-existing warning (db.ts unused eslint-disable) — none from F3.
- **`bunx eslint <my new files>`**: ✅ Clean

## Key Design Decisions

1. **WhatsApp Bot 2.0**: kept the original `handleAirportBotMessage` (in `airport-bot.ts`) untouched — it's still used by other potential consumers. New `processWhatsAppMessage` is a parallel conversational parser with broader NLP. The webhook route now uses the new one. Returns `action` tag (assign/calm/help/etc.) for audit instead of `shouldAlert` boolean.

2. **Webhook dispatcher**: separate from existing `src/lib/webhooks.ts` (which is per-Pro Slack/Discord). The new `webhook-dispatcher.ts` is platform-wide marketplace integration (Slack/Teams/Zapier/Make/n8n), event-based (new_incident/resolved/escalation/prediction_alert). Fire-and-forget everywhere — never blocks the API response.

3. **Body Cam order**: per task spec, photo capture is triggered AFTER the POST staff-scan succeeds. To attach the photo to the already-created scan, added a new `PATCH /api/airport/staff-scan/[id]` endpoint (didn't exist before). This keeps the scan's `createdAt` accurate to the moment of the click, and the photo is attached asynchronously.

4. **`/api/public/upload`**: was missing (referenced by airport-scan-view, audit-matin-tab, admin-dashboard, scan-view, airport-staff-view). Created it with sharp → WebP conversion (1600px max, quality 80) — same storage path `data/uploads/` already served by `/api/uploads/[file]`.

5. **Direction dashboard**: strictly C-level — no individual incident IDs, no commentaire voyageur, no staff names beyond top-3 leaderboard. Aggregated metrics only.

## Integration Points for Future Agents

- **WhatsApp webhook**: now expects `processWhatsAppMessage` returning `{ reply, action? }` (not `shouldAlert`).
- **Webhook dispatcher**: any new event source should call `dispatchWebhook('<event_name>', payload)` fire-and-forget. Available events: `new_incident`, `resolved`, `escalation`, `prediction_alert`. Adding a new event requires adding it to `WEBHOOK_EVENTS` const in `webhook-dispatcher.ts` + the UI checkbox list in `admin-webhooks-tab.tsx` (`EVENT_META`).
- **Body cam PATCH**: `/api/airport/staff-scan/[id]` accepts `{ photoUrl?, message? }` — useful for any future "attach media to scan" feature.
- **Staff location**: `GET /api/airport/staff-location` returns deduped positions per staffName (10-min window) — wallboard map overlay can consume this directly.
