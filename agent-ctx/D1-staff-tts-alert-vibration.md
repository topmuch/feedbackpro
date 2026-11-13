# D1 — Denise TTS voice + sound alert + vibration (airport staff PWA)

**Task ID:** D1
**Agent:** staff-tts-alert-vibration
**Date:** 2025-11-13
**Status:** DONE

## Goal

Add 3 alert features to the airport staff PWA
(`/home/z/my-project/src/components/feedbackpro/airport-staff-view.tsx`)
so the staff gets notified on every new incident (vibration + ding
sound + Denise voice) and gets a confirmation voice when an incident
is resolved.

## Files created

| Path | Purpose |
| --- | --- |
| `src/lib/staff-tts.ts` | `parler(texte)` — Web Speech API, voice "Denise" (fr-FR, rate 1.1, pitch 0.9, volume 1). Cancels previous utterance before speaking. Picks a French voice from `getVoices()` if available. |
| `src/lib/staff-alert.ts` | `jouerDing()` — Web Audio API, two ascending sines (880 Hz + 988 Hz), no audio file. `vibrer()` — Vibration API, pattern `[200,100,200,100,200]`. Both silently no-op if the API is missing (SSR / desktop / old browser). |
| `src/lib/airport-routing.ts` | `routerVersService(problemType)` → team code (`nettoyage`, `maintenance`, `accueil`, `securite`, `logistique`, `other`). `serviceLabel(team)` → displayable French label. Used to prefix the TTS announcement with the responsible team. |

## Files modified

| Path | Change |
| --- | --- |
| `src/components/feedbackpro/airport-staff-view.tsx` | Added 3 imports + `seenReportIdsRef` + `firstPollDoneRef` + a polling `useEffect` (10 s interval) that fetches ALL `EN_ATTENTE` reports and fires the alert chain on new ones. Added `parler(...)` call in `resolveReport` after a successful `RESOLVE` POST. |

## Where the alerts are triggered

### 1. New incident detection — polling

The staff PWA had **no continuous polling** before this task (only
`fetchStats` on mount + `confirmScan` on manual scan). I added a new
`pollPendingReports` callback + `useEffect` that:

- Runs every **10 s** (`window.setInterval(..., 10000)`), only when
  `staffName` is set (staff identified).
- Fetches `/api/airport/reports?statut=EN_ATTENTE&limit=200` — ALL
  pending reports, not filtered by terminal/service (the user
  confirmed "annonce tous les incidents").
- On the **first poll**, seeds `seenReportIdsRef` with all current IDs
  **without alerting** (avoids a salve of alerts for incidents that
  were already pending when the app opened).
- On subsequent polls, for each report whose ID is NOT in
  `seenReportIdsRef`:
  1. `vibrer()` — phone vibration (ding-ding-ding pattern)
  2. `jouerDing()` — Web Audio "ding ding" (880 Hz + 988 Hz)
  3. `parler("Nouvel incident signalé. Zone {zone}. Type: {problemType}. Équipe {label}. Veuillez prendre en charge.")` — Denise voice

`vibrer()` + `jouerDing()` are called once per salve (not N times) to
avoid a cacophony if several incidents arrive in the same poll. The
TTS `parler()` is called for each new incident — the last one wins
because `parler()` calls `speechSynthesis.cancel()` before speaking
(same behaviour as the wallboard, which announces only the most
recent incident).

The `routerVersService(problemType)` lookup prefixes the announcement
with the responsible team when known (e.g. "Équipe Nettoyage.") so
the staff hears who should take charge.

### 2. Resolution confirmation — resolveReport handler

In `resolveReport()` (POST `/api/airport/staff-scan` with
`action: 'RESOLVE'`), right after `if (json?.ok)`:

```ts
const minutes = activeReport
  ? Math.round((Date.now() - new Date(activeReport.createdAt).getTime()) / 60000)
  : 0
parler(`Incident résolu. Temps écoulé: ${minutes} minutes. Merci.`)
```

This is the **confirmation to the staff member themselves** on their
phone. The wallboard already does its own "Signalement résolu… Bien
fait." announcement on the ops-room screen (separate voice, separate
device).

## Alert chain (order)

```
new EN_ATTENTE report detected by polling
        │
        ▼
   vibrer()        ← Vibration API  [200,100,200,100,200]
        │
        ▼
   jouerDing()     ← Web Audio API  880Hz + 988Hz sines
        │
        ▼
   parler(...)     ← Web Speech API  Denise voice (fr-FR, pitch 0.9, rate 1.1)
                    "Nouvel incident signalé. Zone X. Type: Y. Équipe Z. Veuillez prendre en charge."
```

The vibration + ding fire **immediately** (capture attention), then
the voice describes the incident. On resolve:

```
RESOLVE POST success
        │
        ▼
   parler("Incident résolu. Temps écoulé: N minutes. Merci.")
```

## Voice config (Denise)

Reuses the same Web Speech API as the wallboard
(`src/app/ops-wallboard/page.tsx` → `speak()`), but tuned for the
staff "Denise" profile (more assertive / commanding):

| Param | Wallboard | Staff (Denise) |
| --- | --- | --- |
| `lang` | `fr-FR` | `fr-FR` |
| `rate` | 1.05 | 1.1 (faster — assertif) |
| `pitch` | 1.0 | 0.9 (grave — Denise) |
| `volume` | 0.9 | 1.0 |
| `cancel()` before speak | yes | yes |

## Validation

- `npx eslint src/lib/staff-tts.ts src/lib/staff-alert.ts src/lib/airport-routing.ts src/components/feedbackpro/airport-staff-view.tsx` → **EXIT 0** (0 errors, 0 warnings on the 4 files I touched).
- `bun run lint` (whole project) → 4 pre-existing problems in OTHER files (`scratch-card.tsx`, `language-selector.tsx`, `db.ts`, `prisma/seed-airport-ops-config.cjs`) — none related to this task.
- `npx tsc --noEmit --skipLibCheck` → 5 pre-existing errors in `src/app/api/airport/zones/[code]/route.ts` + `src/app/api/airport/zones/route.ts` — **0 errors in my files** (`staff-tts.ts`, `staff-alert.ts`, `airport-routing.ts`, `airport-staff-view.tsx`).
- Dev server log (`dev.log`) shows `✓ Compiled in 0ms` + `GET / 200` after the edits — no crash.

## Notes for future agents

- The polling interval is **10 s**. If this is too aggressive for
  battery / network, bump it to 15–20 s. The wallboard polls every 5 s
  for comparison.
- The first-poll seeding (`firstPollDoneRef`) is important — without
  it, opening the app on a terminal with 5 pending incidents would
  fire 5 vibrations + 5 dings at once.
- `jouerDing()` creates a fresh `AudioContext` each call. This is fine
  for occasional alerts but could hit browser limits if alerts fire
  very frequently. If that becomes an issue, reuse a single
  `AudioContext` stored in a module-level ref.
- Web Audio + TTS require a user gesture to unlock on mobile
  (autoplay policy). The staff unlocks audio by saving their name
  (click on "Enregistrer") or scanning a QR — both are gestures, so
  by the time the first alert fires the audio context is unlocked.
- The Denise voice announcement includes the team name only when
  `routerVersService()` returns something other than `'other'`. For
  unknown problem types the announcement skips the team prefix.
