# Task FR-1 — Flash Rewards implementation (work record)

## Summary
Implemented the complete Flash Rewards feature (scratch cards post-incident)
for the airport PWA: schema fix + 6 API routes + admin tab + passenger overlay
+ integration into airport-scan-view.

## Steps completed

### Step 1 — Schema fix (Advertiser back-relation)
- File: `prisma/schema.prisma` (line ~1017)
- Added `flashRewardCampaigns FlashRewardCampaign[]` field to `model Advertiser`
  right after `campaigns Campaign[]`. This was missing and blocked `db:push`.

### Step 2 — db:push
- Ran `bun run db:push` → success. Generated new Prisma Client (v6.19.2).
- Bumped Prisma cache key in `src/lib/db.ts` from `prisma_v23_f3` →
  `prisma_v24_flash_rewards` so the new client instance knows about the
  3 new models (FlashRewardCampaign / FlashRewardCode / FlashRewardStat).

### Step 3 — API routes
Created 6 route files under `src/app/api/airport/flash-rewards/`:
1. `route.ts` — GET (list with advertiser, ordered desc) + POST (create).
2. `[id]/route.ts` — GET (single + codes count by status) / PATCH (partial
   update) / DELETE (cascade codes + stats).
3. `redeem/route.ts` — POST passenger flow. Implements all 7 filter steps
   (active + date window, time window HH:MM, eligibleZones JSON parse,
   triggerIncidentTypes JSON parse, anti-abuse max 3 codes/day/IP,
   campaign limits maxPerDay + maxTotal, code generation `FBK-XXXX-YYYY`
   with retry on collision).
4. `scratch/route.ts` — POST marks code status='scratched', scratchedAt=now,
   upserts daily FlashRewardStat (scratches++). Idempotent (no-op if already
   scratched).
5. `stats/route.ts` — GET aggregated stats per campaign (codes by status,
   views/scratches/used, revenue = used × pricePerCodeFcfa, conversion
   rate). Plus last 20 codes with campaign title. Supports `?campaignId=`.
6. `codes/route.ts` — GET paginated list of FlashRewardCode with campaign
   title (used by the "Codes générés" admin sub-tab polling 15s). Supports
   `?campaignId=` + `?limit=` (max 500).

All routes use `runtime='nodejs'` + `dynamic='force-dynamic'`, import db from
`@/lib/db`, and use `ok/fail` from `@/lib/session`.

### Step 4 — Admin component
Created `src/components/feedbackpro/admin-flash-rewards-tab.tsx` (exported
function `AdminFlashRewardsTab`). 4 sub-tabs via shadcn Tabs:

A. **Créer une campagne** — Full form: advertiser dropdown (from
   `/api/admin/ads/advertisers`), title, rewardType RadioGroup
   (percentage/fixed_amount/free_article/gift), rewardValue + unit chip,
   description Textarea, image upload via POST `/api/public/upload` +
   preview, eligibleZones checkboxes (uses `AIRPORT_ZONES` from
   `@/lib/airport-config`), triggerIncidentTypes checkboxes (dedup'd
   from all zones' problemes), limit inputs (maxPerDay/maxTotal/
   codeValidityHours), time inputs (activeFrom/activeTo), pricePerCodeFcfa,
   endDate. Buttons: Enregistrer (POST), Aperçu carte (Dialog preview
   showing what the passenger will see — title, value, code mockup).

B. **Codes générés** — Table with columns Code / Campaign / Status (badge
   colored by status: unused=slate, scratched=gold, used=emerald,
   expired=red) / Zone / Created / Expires / ScratchedAt / UsedAt.
   Filter by campaign dropdown. Polls every 15s.

C. **Statistiques** — Global KPIs (revenue, codes used, scratches,
   total codes) + per-campaign cards with views/scratches/used/
   conversion/revenue + CSS horizontal bars showing code distribution
   by status. CTR comparison vs classic ads (~2-3%).

D. **Conversion par annonceur** — Table grouped by advertiser:
   campaignCount, totalCodes, usedCodes, avgConversionRate, revenueFcfa.

Palette: navy #003399 + gold #FCD116 (consistent throughout).

### Step 5 — Admin dashboard integration
Modified `src/components/feedbackpro/admin-dashboard.tsx`:
- Imported `Gift` from `lucide-react` and added to imports.
- Imported `AdminFlashRewardsTab`.
- Added `"flash_rewards"` to `OngletAdmin` type.
- Added `{ id: "flash_rewards", labelKey: "nav.flash_rewards", icone: Gift }`
  to `ONGLETS` array right after `regie_pub`.
- Added render `{onglet === "flash_rewards" && <AdminFlashRewardsTab />}`.
- Added `"nav.flash_rewards": "Flash Rewards"` to BOTH translation maps
  (the one in `AdminDashboard()` and the one in `ContenuSidebarAdmin`).

### Step 6 — Passenger overlay
Created `src/components/feedbackpro/flash-reward-overlay.tsx` (default
`FlashRewardOverlay`). Full-screen overlay with backdrop blur, centered
card max-w-md, animated entrance via framer-motion. Flow:
1. On mount → POST `/redeem` with `{ reportId, zoneCode, problemType,
   clientIp }` (clientIp hint empty — server resolves via X-Forwarded-For).
2. If `eligible=false` → `onClose()` immediately (no visual noise).
3. If `eligible=true` → 3s teasing phase ("Votre cadeau vous attend…"
   with animated Gift icon + 3 countdown dots).
4. Scratch phase: canvas-based scratch effect (adapted from existing
   `scratch-card.tsx` but with a richer content layer underneath —
   campaign imageUrl OR gradient navy/gold, title, big reward value,
   description, code in monospace gold, expiry text). Detection at ≥55%
   scratched → triggers reveal animation.
5. On reveal → POST `/scratch` (idempotent) + shows action buttons:
   "Enregistrer le code" (saves to localStorage `flash_rewards_codes`,
   max 20) + "Partager sur WhatsApp" (deep link wa.me with prefilled
   text). Then "Continuer" closes the overlay.
6. X close button top-right (also Escape key closes).

### Step 7 — Airport scan view integration
Modified `src/components/feedbackpro/airport-scan-view.tsx`:
- Imported `FlashRewardOverlay`.
- Added state `const [showFlashReward, setShowFlashReward] = useState(false)`.
- In the existing Denise confirmation useEffect (around line 828), added
  `setTimeout(() => setShowFlashReward(true), 3500)` after `parler(...)`
  with proper cleanup (`clearTimeout` in the return fn).
- Added `setShowFlashReward(false)` to `signalerAutre()` reset.
- Rendered the overlay right after the exitAd block (before final
  `</div>`): `{showFlashReward && reportResult && (<FlashRewardOverlay
  reportId=... zoneCode=... problemType=... onClose=... />)}`.

## Verification
- `bun run db:push` → success (schema in sync).
- `bun run lint` → my code has zero errors and zero warnings. The 3
  remaining errors are pre-existing (in `seed-airport-ops-config.cjs`,
  `language-selector.tsx`, `scratch-card.tsx`) and not introduced by
  this task. 1 pre-existing warning in `src/lib/db.ts`.
- `bunx tsc --noEmit` → my files compile with no TypeScript errors.
  Only pre-existing errors in `src/app/api/airport/wallboard/route.ts`
  (untouched by this task).
- `dev.log` shows successful `✓ Compiled` messages and HTTP 200
  responses, no errors related to flash-rewards files.

## Files created (new)
- `src/app/api/airport/flash-rewards/route.ts`
- `src/app/api/airport/flash-rewards/[id]/route.ts`
- `src/app/api/airport/flash-rewards/redeem/route.ts`
- `src/app/api/airport/flash-rewards/scratch/route.ts`
- `src/app/api/airport/flash-rewards/stats/route.ts`
- `src/app/api/airport/flash-rewards/codes/route.ts`
- `src/components/feedbackpro/admin-flash-rewards-tab.tsx`
- `src/components/feedbackpro/flash-reward-overlay.tsx`

## Files modified
- `prisma/schema.prisma` (added `flashRewardCampaigns` back-relation)
- `src/lib/db.ts` (bumped Prisma cache key to v24)
- `src/components/feedbackpro/admin-dashboard.tsx` (Gift icon + import +
  type + ONGLETS entry + render + 2 translation map entries)
- `src/components/feedbackpro/airport-scan-view.tsx` (import + state +
  setTimeout in Denise effect + signalerAutre reset + overlay render)

## Notes / decisions
- Added a 6th route `/codes` (not in the original 5-route spec) because
  the "Codes générés" admin sub-tab needs to list more than the 20 codes
  returned by the stats endpoint, with a campaign filter. The stats
  endpoint already returns `recentCodes` (last 20) so the codes endpoint
  is the natural complement for the polling table view.
- Used `useRef` for `dernierePosRef` in the scratch canvas (instead of
  the mutable `let dernierePos` pattern in the legacy `scratch-card.tsx`)
  to avoid the `react-hooks/immutability` lint error.
- The teasing phase is 3 seconds (matching the spec "~3 seconds") with
  animated Gift icon pulsing + 3 countdown dots.
- The FlashRewardOverlay setTimeout is 3500ms (matches the spec
  "~3500ms after Denise's parler() call") so the voice finishes before
  the card appears.
- Anti-abuse IP resolution: client can't know its public IP, so the
  client sends an empty `clientIp` hint and the server resolves it from
  `X-Forwarded-For` or `x-real-ip` headers (fallback 'unknown').
