# Task C — Airport PWA Google Reviews Rating Card (D8)

**Phase 3 — Agent: taskC (Google Reviews redirect on airport confirmation screen)**

## Objective
Add a "rate your experience" prompt at the END of the airport PWA confirmation screen (`airport-scan-view.tsx`):
- 4-5 stars → redirect to airport Google Reviews page (new tab)
- 1-3 stars → internal feedback (reuse `/api/airport/help`) + optional email

## Files modified

### 1. `/home/z/my-project/src/app/api/airport/zone/[tag]/route.ts`
Extended the `airportPro` Prisma lookup to also `select` the existing `googleReviewUrl` column (already defined on `Pro` model — `prisma/schema.prisma` line 72). Returned as `airportGoogleReviewUrl` in the response payload (null when no Pro "Aéroport" linked or `googleReviewUrl` not set).

```ts
const airportPro = await db.pro.findFirst({
  where: { typeEtablissement: 'Aéroport', suspendu: false },
  select: { logoUrl: true, nomEtablissement: true, googleReviewUrl: true },
})
// ...
airportGoogleReviewUrl: airportPro?.googleReviewUrl ?? null,
```

Pattern strictly mirrors the existing `airportLogo` / `airportName` fields (single Prisma call, same `where` clause) — no extra DB roundtrip.

### 2. `/home/z/my-project/src/components/feedbackpro/airport-scan-view.tsx`

**Imports (line ~54):** added `Star` to the lucide-react imports list.

**ZoneData type (line ~78):** added optional field `airportGoogleReviewUrl?: string | null`.

**State (lines ~272-283):** added 4 new state hooks:
```ts
const [rating, setRating] = useState<number | null>(null)
const [ratingSubmitted, setRatingSubmitted] = useState(false)
const [ratingEmail, setRatingEmail] = useState("")
const [ratingSubmitting, setRatingSubmitting] = useState(false)
```

**Handlers (lines ~660-717):**
- `ouvrirAvisGoogle()` — `window.open(zoneData.airportGoogleReviewUrl, '_blank', 'noopener')` then hides the card.
- `envoyerRetourInterne()` — POSTs to `/api/airport/help` with payload `{ message: 'Note: X/5' + commentaire?, travelerPhone: email, tag, reportId }`. On success or failure (best-effort) hides the card.

**`signalerAutre` reset (lines ~740-744):** resets all four rating state hooks.

**Rating card UI (lines ~1571-1725):** inserted between the "Voir le message envoyé aux équipes" details section and the "Actions collées en bas" footer (which contains "Signaler un autre problème" + "Quitter").

Card visual:
- glassmorphism matching the confirmation screen (`rounded-2xl bg-white/70 backdrop-blur-md ring-1 ring-white/60 p-5`)
- amber→orange→fuchsia gradient strip on top
- 5 star buttons (`Star` icon, `size-10`), selected = `fill-amber-400 text-amber-400`, unselected = `text-slate-300`
- radiogroup ARIA semantics for accessibility

After rating selected:
- **4-5★:** message + if `airportGoogleReviewUrl` set → CTA "Laisser un avis Google ★" (amber-orange gradient, `ExternalLink` icon); if not set → amber info card "L'aéroport n'a pas encore configuré sa page Google Reviews — merci pour votre note !"
- **1-3★:** apology message + optional email input (`Label` + `Input` with `type="email"`) + "Envoyer mon retour interne" button (violet-fuchsia gradient, `Send` icon, `Loader2` spinner during submit)

After negative-feedback submission, a small confirmation banner "Merci — votre retour a été transmis à l'équipe ops." replaces the card (lines ~1713-1725).

**Gating conditions (line ~1581-1582):**
- `!ratingSubmitted` (hide after submit)
- `!reportResult.report.id.startsWith("pending-")` (skip for offline-pending reports)

## Lint result
`bun run lint` clean on both modified files. Pre-existing errors in unrelated files (`language-selector.tsx`, `scratch-card.tsx`) and pre-existing unused eslint-disable warnings in `airport-staffqr-tab.tsx` + `db.ts` remain untouched.

Tail of lint output:
```
src/components/feedbackpro/language-selector.tsx
  33:5  error  Error: This value cannot be modified ... (pre-existing)
src/components/feedbackpro/scratch-card.tsx
  105:5  error  Error: Cannot reassign variable after render completes ... (pre-existing)
src/lib/db.ts
  15:1  warning  Unused eslint-disable directive ... (pre-existing)
src/components/feedbackpro/airport-staffqr-tab.tsx
  380:22  warning  Unused eslint-disable directive ... (pre-existing)
  446:20  warning  Unused eslint-disable directive ... (pre-existing)
✖ 6 problems (3 errors, 3 warnings)
```

None of my modified files appear in the output (verified with grep).

## Deviations from spec & rationale

1. **`travelerPhone` reused for email:** the spec says to POST the email in the `travelerPhone` field. The `/api/airport/help` backend's `normalizePhone()` strips non-digits and validates `/^\d{8,15}$/` for phone — meaning an email like `vous@exemple.com` would be **silently dropped** (set to `null`). The spec is explicit though ("`travelerPhone: email`"), so I followed it verbatim. The email is still sent in the request body, but the backend will currently ignore it. If the team wants to actually persist the email, the backend `normalizePhone` should be relaxed or a separate `travelerEmail` field added — out of scope for Task C (other agents own help/audit routes).

2. **Best-effort submit on negative feedback:** if the POST to `/api/airport/help` fails (network), I still mark `ratingSubmitted=true` to avoid trapping the traveler in a retry loop. The confirmation screen remains fully usable. This matches the existing pattern in the airport offline PWA design philosophy (traveler's experience first, persistence best-effort).

3. **Rating card placement:** placed before the "Actions collées en bas" footer block (which contains "Signaler un autre problème" + "Quitter"), as specified. The "Voir le message envoyé" details remains just above the rating card.

4. **No `Card` from shadcn:** used raw `<section>` with glassmorphism classes to match the visual style of every other block on the airport confirmation screen (which all use `rounded-2xl bg-white/70 ... ring-1 ring-white/60` rather than the shadcn `Card` component). Visual consistency > strict component reuse.

5. **Prisma schema untouched:** as instructed. The `Pro.googleReviewUrl String?` field at line 72 already exists (used by the restaurant scan-view D8 feature) — I only read it, no migration needed.
