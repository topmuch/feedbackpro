# Task 3 — Phase 2 — Airport PWA Full Offline (no 4G)

**Agent**: main agent
**Scope**: Upgrade the traveler-facing airport PWA to work fully offline (zone page from cache, queued submits in IndexedDB, auto-sync on reconnect, offline banner).

## Deliverables (all 3 created/updated)

### 1. `/home/z/my-project/public/sw.js` (EXTENDED, existing logic preserved)
- **CACHE_NAME bumped** `feedbackpro-v2` → `feedbackpro-airport-v3` (forces shell refresh on next visit; old v2 cache deleted by the activate handler).
- **NEW** `CACHE_AIRPORT_API = "feedbackpro-airport-api-v3"` — dedicated cache for airport zone GET responses (kept separate from `CACHE_API` which holds TTL-marked `/api/zone/[qrToken]` responses). Added to the activate cleanup exclusion list so it survives activation.
- **NEW fetch handler — network-first with offline fallback for `GET /api/airport/zone/*`**: tries network, caches `200` responses, falls back to cache (or `503 Offline`) on network failure. No TTL (network always preferred).
- **NEW fetch handler — Background Sync for failed `POST /api/airport/report`**: intercepts ONLY network errors (fetch throws) and `5xx` responses. `4xx` (invalid payload) is **not** queued — retrying won't help. On retryable failure: stores the request body in IndexedDB store `airport-pending-reports` (auto-increment key), registers sync tag `sync-airport-report`, and returns a synthetic `200 { ok:true, offline:true }` so the PWA shows its "hors ligne" confirmation screen.
- **NEW IndexedDB helpers** (self-contained, tiny promise wrapper, no imports): `ouvrirDbAirport`, `stockerRapportAirportOffline`, `lireRapportsAirportOffline`, `supprimerRapportAirportOffline`. DB `feedbackpro-airport` v1, store `airport-pending-reports`, keyPath `id`, autoIncrement. **Shared with the React hook** (same DB/store) so the SW replays what the hook enqueues and vice-versa.
- **NEW `sync` event listener** for tag `sync-airport-report` → `rejouerRapportsAirportOffline()`: replays each queued POST; on `2xx` deletes the entry; on `4xx` deletes (purges invalid, non-retryable); on `5xx` keeps for next retry; on network throw breaks (still offline). Notifies all controlled clients via `postMessage({type:'airport-pending-changed'})` so the banner refreshes.
- **NEW `message` listener** for `'airport-replay-offline'` — manual replay trigger from the hook (Safari fallback when Background Sync API is unsupported).
- All existing restaurant logic (`/api/public/retour` POST + `fp-retour-sync` + `fp-offline` DB + `/api/zone/[qrToken]` cache-first + `/r/[qrToken]` network-first + stale-while-revalidate for static assets) **untouched**.

### 2. `/home/z/my-project/src/hooks/use-airport-offline.ts` (NEW)
`'use client'` hook exporting `useAirportOffline()` returning `{ isOnline, pendingCount, pendingReports, enqueueReport, forceSync, registerSync }`.
- **isOnline** via `useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot)` — React-recommended pattern for `navigator.onLine`; avoids `setState`-in-effect lint errors and SSR hydration mismatch (server snapshot = `true`).
- **pendingCount / pendingReports** via `useState`, refreshed in an effect using an async IIFE (setState behind `await` → lint-clean) on mount and on the custom window event `'airport-pending-changed'` (dispatched after every IndexedDB write). Also refreshes when the SW `postMessage`s `{type:'airport-pending-changed'}` (background sync deleted entries).
- **enqueueReport(payload)** — `addPending` to IndexedDB, dispatches `'airport-pending-changed'`, then `registerSync()`.
- **forceSync()** — manual replay (Safari fallback): `POST /api/airport/report` for each entry; deletes on `2xx` (success) and `4xx` (invalid, non-retryable); keeps on `5xx`; breaks on network throw (still offline). Returns `{ success, failed }`.
- **registerSync()** — `navigator.serviceWorker.ready` → `reg.sync?.register('sync-airport-report')` if supported, else no-op.
- On `isOnline` flipping to `true`: postMessages the SW `'airport-replay-offline'` (extra replay nudge for non-Background-Sync browsers).
- IndexedDB helpers inline (`openDb`, `readAllPending`, `addPending`, `deletePending`) — DB `feedbackpro-airport` v1, store `airport-pending-reports`, keyPath `id`, autoIncrement. **Same DB as the SW**.
- SSR-safe: every `window`/`navigator`/`indexedDB` access guarded with `typeof ... !== 'undefined'`; on SSR returns `isOnline:true, pendingCount:0, pendingReports:[]` and no-op functions.

### 3. `/home/z/my-project/src/components/feedbackpro/airport-offline-banner.tsx` (NEW)
`'use client'` component, props `{ className?: string }`, uses `useAirportOffline()`:
- **Offline** → sticky amber banner `bg-amber-500/10 text-amber-200 border-b border-amber-500/30`, `WifiOff` icon with `animate-pulse`, text "Mode offline — votre signalement sera envoyé dès le retour du réseau."
- **Online + pendingCount > 0** → sticky sky banner `bg-sky-500/10 text-sky-200 border-b border-sky-500/30`, `CloudUpload` icon, text "{N} signalement(s) en file d'attente — synchronisation…" + button "Forcer la sync maintenant" (`RefreshCw` icon) calling `forceSync()`.
- **Online + pendingCount === 0** → `return null`.
- Icons from `lucide-react` (`WifiOff`, `RefreshCw`, `CloudUpload`). `role="status" aria-live="polite"` for accessibility.

## Files NOT modified (per spec)
- `src/components/feedbackpro/airport-scan-view.tsx` — left untouched; the integration agent will wire `<AirportOfflineBanner />` at the top and call `enqueueReport()` on submit failure.

## Lint result
`cd /home/z/my-project && bun run lint` → **0 errors in the 3 deliverables**. The 3 remaining errors + 1 warning are all pre-existing in untouched files:
- `prisma/seed-airport-ops-config.cjs:10` — `@typescript-eslint/no-require-imports` (pre-existing)
- `src/components/feedbackpro/language-selector.tsx:33` — `react-hooks/immutability` (pre-existing)
- `src/components/feedbackpro/scratch-card.tsx:105` — `react-hooks/immutability` (pre-existing)
- `src/lib/db.ts:15` — unused eslint-disable warning (pre-existing)

## Deviations from spec (with rationale)
1. **Added `CACHE_AIRPORT_API` cache name** (not in spec). The spec only said to bump `CACHE_NAME`. A dedicated cache for airport zone GET responses keeps them separate from the TTL-marked `/api/zone/[qrToken]` entries in `CACHE_API` (different caching strategy: network-first w/o TTL vs cache-first w/ TTL). Minor, consistent with the existing "one cache per strategy" pattern.
2. **Used `useSyncExternalStore` for `isOnline`** instead of `useState` + `useEffect` + `setIsOnline(navigator.onLine)`. The spec's literal approach triggers the React 19 `react-hooks/set-state-in-effect` lint error (synchronous `setState` in effect body). `useSyncExternalStore` is the React-recommended primitive for `navigator.onLine` and is SSR-safe via `getServerSnapshot`. Behaviour is identical (online/offline events → re-render), just lint-clean and hydration-safe.
3. **4xx responses are purged, not retried** (both in SW `rejouerRapportsAirportOffline` and hook `forceSync`). The spec said "On success, delete the entry. On failure, leave it for the next retry." A `4xx` is a permanent client error (invalid tag, unrecognized problemType) — retrying forever would block the queue. Purging `4xx` while keeping `5xx`/network-failures for retry is the robust interpretation. Documented inline.
4. **Hook listens to SW `postMessage({type:'airport-pending-changed'})`** in addition to the window custom event. The spec only mentioned the window event. Without the SW message, the banner's pending count wouldn't refresh when Background Sync deletes entries in the background. Necessary for the feature to actually work end-to-end.
5. **`forceSync()` fetches go through the SW** (the SW intercepts `/api/airport/report` POSTs from the page). When online, the SW passes through (real response), hook deletes the entry — clean. When offline, the SW re-queues under a new id and returns a synthetic `200`; the hook sees `ok` and deletes the original — net effect: entry stays queued (moved to a new id), no data loss, no duplicates. Did **not** add a bypass header (spec didn't ask); current behaviour is correct.

## Integration notes for the agent wiring `airport-scan-view.tsx`
- Import: `import { AirportOfflineBanner } from '@/components/feedbackpro/airport-offline-banner'`
- Import hook: `import { useAirportOffline } from '@/hooks/use-airport-offline'`
- Place `<AirportOfflineBanner />` as the first child inside the PWA root wrapper (it's `sticky top-0 z-50`, full width).
- On submit: try `fetch('/api/airport/report', { POST })` normally. If the response has `offline: true` (SW queued it) OR the fetch throws, fall back to `enqueueReport(payload)` for an explicit local copy + `registerSync()` nudge. Either path keeps the report safe.
- The SW auto-registers `sync-airport-report` on failed POSTs, so even without calling `enqueueReport`, background sync will replay. `enqueueReport` is the belt-and-suspenders path for explicit UI feedback.
