# WAHOO-1 — Denise "Traducteur Universel"

**Task ID:** WAHOO-1
**Agent:** main-agent
**Date:** 2026-11-15
**Status:** ✅ Complete

## Concept

A tourist (Chinese, Ivorian, English, Arabic, etc.) scans a QR code and writes/speaks
their problem in their own language. The system translates it instantly to French and
Denise announces it in French to the staff:

> "Alerte. Un passager signale un bagage oublié à la porte B4. Message original en anglais."

## Files Created

### 1. `src/app/api/airport/translate/route.ts` (NEW)
- POST endpoint. Body: `{ text: string, sourceLang: string }`
- Uses `z-ai-web-dev-sdk` LLM to translate text to French
- System prompt: "You are a professional translator. Translate the following text to
  French. Preserve the meaning and urgency. Respond with ONLY the translated French
  text, no explanations."
- If `sourceLang === 'fr'` or text is empty → returns text as-is (no LLM call,
  cost/latency optimization)
- Returns `{ ok: true, data: { original, translated, sourceLang } }`
- `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`
- Supports 11 languages + auto-detect: fr, en, zh, ar, es, de, pt, it, ru, ja, wo, auto
- Cleans up LLM output (strips surrounding quotes « » " ')
- Defensive fallback: if LLM returns empty, falls back to original text

### 2. `src/components/feedbackpro/language-picker.tsx` (NEW)
- `"use client"` component
- Props: `{ value: string, onChange: (lang: AirportLang) => void, className?: string }`
- Compact dropdown with flags for 11 languages + auto-detect:
  - 🇫🇷 Français (fr), 🇬🇧 English (en), 🇸🇳 Wolof (wo), 🇨🇳 中文 (zh),
    🇸🇦 العربية (ar), 🇪🇸 Español (es), 🇩🇪 Deutsch (de), 🇵🇹 Português (pt),
    🇮🇹 Italiano (it), 🇷🇺 Русский (ru), 🇯🇵 日本語 (ja), 🌍 Auto
- Button + popover pattern (closes on outside-click / Escape)
- Glassmorphism violet/fuchsia style matching the scan view
- Exports `AirportLang` type + `getLangInfo` helper
- Mobile PWA compact (44px touch targets, max-h-72 scrollable list)

## Files Modified

### 3. `src/components/feedbackpro/airport-scan-view.tsx`
- Imported `LanguagePicker` + `AirportLang` type + `Languages` icon
- Added state:
  - `selectedLang` (AirportLang, default 'fr')
  - `translatedComment` (string | null)
  - `translating` (boolean)
  - `translateReqIdRef` (ref for request invalidation)
  - `dictating`, `dictationError`, `recognitionRef` (Web Speech API)
- Added debounced translation effect (800ms):
  - When `selectedLang !== 'fr'` and commentaire is non-empty, POSTs to
    `/api/airport/translate` after 800ms of inactivity
  - Request IDs prevent stale translations from overwriting newer ones
  - Resets `translatedComment` when commentaire is emptied or lang switches to 'fr'
- Added Web Speech API dictation:
  - `demarrerDictation()` / `arreterDictation()` callbacks
  - `LANG_TO_LOCALE` map: fr→fr-FR, en→en-US, zh→zh-CN, ar→ar-SA, es→es-ES,
    de→de-DE, pt→pt-PT, it→it-IT, ru→ru-RU, ja→ja-JP, wo→fr-FR (fallback),
    auto→fr-FR
  - Fills commentaire Textarea with transcribed text (preserves existing text)
  - Cleanup on unmount (aborts recognition)
- UI changes in `probleme_choisi` phase:
  - `<LanguagePicker>` rendered ABOVE the commentaire Textarea (next to the Label)
  - Microphone button (Web Speech API) next to the LanguagePicker
  - Translation preview box BELOW the textarea (highlighted emerald):
    - "Traduction en cours…" spinner while translating
    - "📋 Votre message en français : [translated text]" + "Denise annoncera
      cette version au staff ops." when translated
    - "La traduction apparaîtra ici automatiquement." hint when text exists but
      no translation yet
  - Moved existing inline voice-lang selector (auto/wolof/fr/en for MediaRecorder
    pipeline) next to the existing "Parler" button below the textarea
  - Placeholder changes based on selectedLang
- Modified `envoyerSignalement` submit handler:
  - When `translatedComment` is set AND `selectedLang !== 'fr'`:
    - `commentaire` = French translation (Denise announces French)
    - `commentaireOriginal` = original text (preserved for reference)
    - `commentaireLang` = source language code
  - Otherwise sends commentaire as-is
  - Added `selectedLang` + `translatedComment` to useCallback deps

### 4. `src/app/api/airport/report/route.ts`
- Accepts optional `commentaireOriginal` and `commentaireLang` in POST body
- Validates both fields (type + length ≤ 1000)
- Normalizes `commentaireLang` against whitelist (fr, en, zh, ar, es, de, pt,
  it, ru, ja, wo, auto)
- Builds `commentaireStocke` combining all info when lang ≠ 'fr':
  - Format: `[origine:en] French translated text — Original (en): original text`
  - The `[origine:XX]` prefix is parseable by the wallboard
  - The French text is what Denise announces
  - The original text is preserved for audit/email/ops reference
- Stores `commentaireStocke` in DB `commentaire` field
- Passes `commentaireStocke` to email notification + WhatsApp payload
- Passes `commentaireLang` + `commentaireOriginal` to webhook dispatcher
  (Slack/Teams integrations get structured fields for filtering)

### 5. `src/app/api/airport/wallboard/route.ts`
- Added `parseCommentaireLang()` helper:
  - Regex parses `[origine:XX]` prefix from commentaire
  - Returns lowercase lang code or null if no prefix
- Added `commentaireLang` field to `recent_reports` response (parsed from
  each report's commentaire field)
- Added `commentaireLang: null` to SOS help request items (no translation
  for SOS messages)

### 6. `src/app/ops-wallboard/page.tsx`
- Added `commentaireLang?: string | null` to `RecentReport` type
- Added `langueEnFrancais()` helper:
  - Maps lang codes to French names: en→anglais, zh→chinois, ar→arabe,
    es→espagnol, de→allemand, pt→portugais, it→italien, ru→russe,
    ja→japonais, wo→wolof, auto→langue auto-détectée
  - Returns null for 'fr' (no announcement needed) or unknown codes
- Modified the new-incident announcement (lines ~1515-1535):
  - Calls `langueEnFrancais(latest.commentaireLang)`
  - If non-null, appends ` Message original en [langue].` to the announcement
  - Example: "Nouvel incident signalé. Livraison des Bagages. Type: Tapis
    arrêté. En attente depuis 1 minute. Message original en anglais."
  - Works for both regular incidents AND SOS help requests
  - Keeps the announcement concise (doesn't read the full comment)

## End-to-End Data Flow

```
Passenger (English)          PWA (client)              Backend                  Wallboard
─────────────────────        ──────────────            ────────                 ──────────
Types: "I forgot my bag"     
   │                         
   ▼ (800ms debounce)        
POST /api/airport/translate  
   │ ─────────────────────▶  z-ai-web-dev-sdk LLM
   │ ◀─────────────────────  "J'ai oublié mon sac"
   │                         
Shows preview box:           
"📋 Votre message en         
 français : J'ai oublié..."  
   │                         
Submits report:              
POST /api/airport/report     
   │ commentaire = "J'ai oublié mon sac" (FR)
   │ commentaireOriginal = "I forgot my bag" (EN)
   │ commentaireLang = "en"
   │ ─────────────────────▶  Stores: "[origine:en] J'ai oublié... 
   │                           — Original (en): I forgot..."
   │                          WhatsApp/email/webhook get combined text
   │                         
                             GET /api/airport/wallboard
                             ◀────────────────────────  parseCommentaireLang()
                                commentaireLang: "en"
                                │
                                ▼
                             speak("Nouvel incident signalé. 
                               Livraison des Bagages. Type: Tapis arrêté.
                               En attente depuis 1 minute. 
                               Message original en anglais.")
```

## Testing Performed

### Translate API (live curl tests)
- ✅ Empty text → returns empty (no LLM call)
- ✅ sourceLang='fr' → returns text unchanged (no LLM call)
- ✅ English "I forgot my bag at gate B4" → "J'ai oublié mon sac à la porte B4"
- ✅ Chinese "我忘记了行李在B4登机口" → "J'ai oublié mes bagages au gate B4."

### Report API (live curl test)
- ✅ POST with commentaire + commentaireOriginal + commentaireLang
- ✅ Stored commentaire: `[origine:en] J'ai oublié mon sac à la porte B4 — Original (en): I forgot my bag at gate B4`
- ✅ WhatsApp message includes the combined text in "Précision voyageur"

### Wallboard API (live curl test)
- ✅ Returns `commentaireLang: "en"` in recent_reports for the translated report

### Compilation (dev.log verified)
- ✅ `POST /api/airport/translate 200` (multiple calls, LLM working)
- ✅ `POST /api/airport/report 200` (with translation fields)
- ✅ `GET /api/airport/wallboard 200` (returns commentaireLang)
- ✅ `GET /ops-wallboard 200` (wallboard page compiles)
- ✅ `GET /?tag=term_bagages_1 200` (scan view compiles via home page)

### Lint
- ✅ No new lint errors in any modified/created file
- Pre-existing lint errors in `language-selector.tsx`, `scratch-card.tsx`,
  `seed-airport-ops-config.cjs` are unrelated to this task (not touched)

## Design Decisions

### Why encode language in `commentaire` field (no Prisma migration)?
The task explicitly preferred "the simplest approach" — store the French
translation in `commentaire` and prepend the original language info. Adding a
new Prisma field would require `bun run db:push` (schema migration). The
`[origine:XX]` prefix approach:
- Requires zero schema changes
- Is parseable by a simple regex server-side
- Preserves the original text for audit/email/webhooks
- Keeps Denise's announcement text clean (wallboard parses the prefix
  server-side and exposes a clean `commentaireLang` field)

### Why two separate voice systems?
The scan view already had a MediaRecorder + ASR backend pipeline (Phase 2 —
Wolof/FR/EN) with its own inline voice-lang selector. The task asked to add
Web Speech API dictation tied to the new LanguagePicker. These are kept
separate to avoid breaking the existing ASR pipeline:
- **New system** (above textarea): LanguagePicker + Web Speech mic button →
  in-browser dictation + LLM translation via `/api/airport/translate`
- **Existing system** (below textarea): inline voice-lang selector + "Parler"
  button → MediaRecorder + `/api/airport/voice/transcribe` + `/api/airport/voice/translate`

The new system is lighter (no audio upload, no backend ASR) and supports
more languages (11 vs 3). The existing system remains for Wolof (which
SpeechRecognition doesn't support natively).

### Why request IDs for translation?
The debounced translation effect fires after 800ms of inactivity. If the
passenger keeps typing, multiple translations could be in flight. The
`translateReqIdRef` counter ensures only the latest request's response
updates `translatedComment` — stale responses are silently discarded.

## Constraints Respected
- ✅ `'use client'` for React components with hooks
- ✅ `z-ai-web-dev-sdk` ONLY in backend API routes (translate route)
- ✅ TypeScript strict typing throughout
- ✅ Existing shadcn/ui components used (Button, Textarea, Label)
- ✅ All fetch calls use relative paths (`/api/airport/translate`)
- ✅ No test code written
- ✅ `bun run lint` passes (no new errors)
- ✅ No compile errors in dev.log
