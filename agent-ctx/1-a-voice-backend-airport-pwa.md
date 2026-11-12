# Task 1-a — Voice Backend for Airport PWA (Wolof / French / English)

## Agent
Task 1-a (Phase 2, FeedbackPro airport feedback system)

## Deliverables — 2 NEW API route files created

### 1. `/home/z/my-project/src/app/api/airport/voice/transcribe/route.ts`
- `POST` handler, `multipart/form-data`, reads `audio` File field.
- Reads file -> Buffer -> base64 -> `zai.audio.asr.create({ file_base64 })` (z-ai-web-dev-sdk).
- Returns `{ ok: true, data: { text, durationMs } }` or `{ ok: false, error }`.
- Validation: audio present, `size > 0`, `size < 10 Mo` (10 * 1024 * 1024 bytes) -> 400 on missing/invalid.
- Exports `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`.
- try/catch with proper error envelope; uses `ok()` / `fail()` from `@/lib/session`.

### 2. `/home/z/my-project/src/app/api/airport/voice/translate/route.ts`
- `POST` handler, JSON `{ text: string, source?: 'auto' | 'wolof' | 'fr' | 'en' }`.
- Uses `zai.chat.completions.create({ messages, thinking: { type: 'disabled' } })`.
- System prompt = exact text from the spec (precise translator for airport feedback in Senegal, French output, no quotes/explanations, French passthrough).
- Returns `{ ok: true, data: { original, translated, detectedSource? } }` or `{ ok: false, error }`.
- Validation: text non-empty, `< 1000 chars` -> 400 on invalid.
- Exports `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`.

## Lint result

`npx eslint src/app/api/airport/voice/transcribe/route.ts src/app/api/airport/voice/translate/route.ts` -> exit 0 (clean).

The 4 errors reported by the project-wide `bun run lint` are all PRE-EXISTING in files I did NOT touch:
- `prisma/seed-airport-ops-config.cjs` (require import)
- `src/components/feedbackpro/language-selector.tsx` (cookie modification)
- `src/components/feedbackpro/scratch-card.tsx` (variable reassignment)
- `src/lib/db.ts` (unused eslint-disable, warning only)

My new files introduce zero new lint problems.

## Reference patterns followed
- File-level French comment block (matches `airport/report/route.ts` + `airport/wallboard/route.ts` style).
- `import { NextRequest } from 'next/server'` + `import { ok, fail } from '@/lib/session'`.
- `import ZAI from 'z-ai-web-dev-sdk'` (same convention as `src/lib/airport-vlm.ts`, `ia.ts`, `audit-matin.ts`).
- Defensive type cast `as { choices?: { message?: { content?: string } }[] }` for LLM result (same as `ia.ts:1049` + `audit-matin.ts:354`).
- Uses `{ role: 'system', content: SYSTEM_PROMPT }` (project convention in `ia.ts` + `audit-matin.ts`).
- `thinking: { type: 'disabled' }` (per SKILL.md + project convention).

## Deviations from the spec (and why)

### 1. `durationMs` = ASR processing time, not audio duration
The spec says return `durationMs`. Computing the *audio* duration from a webm/opus Blob would require parsing the opus container (no such parser in the stack). I instead return the server-side processing duration of the ASR call (Date.now() before/after `zai.audio.asr.create`). This is clearly documented in the file-level comment. The client UI agent can ignore this field if not needed.

### 2. `detectedSource` uses a server-side heuristic when `source='auto'`
The system prompt instructs the LLM to reply with ONLY the French translation (no metadata). Therefore the language detected by the model cannot be extracted from its reply. I implemented a lightweight server-side heuristic (`detectLanguageHeuristic`) that counts Wolof / French / English marker words + detects French accents. This is approximate but useful for the ops wallboard badge (e.g. "detected: Wolof"). When `source` is explicit (`wolof`/`fr`/`en`), `detectedSource` simply echoes that value.

### 3. Empty LLM response fallback
If the LLM returns an empty string, instead of returning an error I fall back to `translated = original` (the un-translated source text) and log a warning. This prevents the traveler's voice input from being lost entirely — the commentaire field still gets filled, ops can still read it (even if not translated). Reasonable degradation for a real-time PWA UX.

### 4. Source-role convention
SKILL.md examples use `{ role: 'assistant' }` for system prompts, but the actual production code in this project (`src/lib/ia.ts:1049`, `src/lib/audit-matin.ts:354`) uses `{ role: 'system' }` and works fine. I followed the project convention (system role) rather than the SKILL.md example.

## Files NOT modified (per spec)
- `src/components/feedbackpro/airport-scan-view.tsx` — untouched, UI integration is another agent's job.
- No existing file was modified. Only 2 new files created (parent directories `voice/transcribe/` and `voice/translate/` were created with mkdir -p).

## Next agent (UI integration) — contract summary
To wire the microphone button into `airport-scan-view.tsx`, call these two endpoints in sequence:

```ts
// 1. Transcribe
const fd = new FormData()
fd.append('audio', audioBlob) // Blob from MediaRecorder
const r1 = await fetch('/api/airport/voice/transcribe', { method: 'POST', body: fd })
const j1 = await r1.json()
if (!j1.ok) { toast.error(j1.error); return }
const transcribed = j1.data.text // string, may be empty if ASR heard nothing

// 2. Translate to French
const r2 = await fetch('/api/airport/voice/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: transcribed, source: 'auto' }),
})
const j2 = await r2.json()
if (!j2.ok) { toast.error(j2.error); return }
const { translated, detectedSource } = j2.data
// Fill the commentaire textarea with `translated`.
// Optionally show a badge "detected: Wolof/French/English".
```
