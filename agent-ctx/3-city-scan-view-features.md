# Task 3 — CityScanView enhancements (4 features)

**File modified**: `src/components/feedbackpro/city-scan-view.tsx`

## Summary

Added 4 new features to the citizen QR scan view without breaking existing modules
(urgence, signalement, orientation, artisans, mairie, tax_fraud, itineraire, annonces, sante).

## Changes

### 1. Plate type rendering (`plate.plateType === 'ecole'`)
- `CityPlate` type now includes `plateType: string` (standard | ecole | gare | mairie).
- In the main `phase === 'main'` branch, when `plate.plateType === 'ecole'` and
  `forceFullMenu === false`, a new `<SchoolCheckinView />` replaces `<MainView />`.
- "Menu complet" link in SchoolCheckinView (header + bottom button + confirmation
  screen) sets `forceFullMenu = true` and switches to the standard `<MainView />`.
- The welcome page (which unlocks the TTS voice via the user gesture) is shown
  first, unchanged — only the destination after the gesture differs for école plates.

### 2. SchoolCheckinView component (new)
- Signalétique-style header (blue panel, rounded card, location tile).
- 3 large colored buttons:
  - ✅ "Je suis bien arrivé" (green `#00A651`) → POST `/api/city/checkins` with
    `status: "arrived"`.
  - 🚪 "Je quitte l'école" (blue `#0066CC`) → `status: "left"`.
  - ⚠️ "J'ai un souci" (red `#E30613`) → `status: "sos"`.
- Phone identification via `onEnsureCitizen('school')` — opens the
  `CitizenRegistrationModal` (which asks for phone, name, parentPhone).
- Voice confirmation in the gesture (before any await): "Aminata confirme votre
  arrivée à l'école {label}…" (per status). Same pattern as `handleSubmitIncident`
  to keep iOS Safari / Chrome mobile TTS working.
- Confirmation screen (`SchoolCheckinConfirmation`): big circle, title, parent
  notification badge ("Notification envoyée à votre parent" — mocked), metadata
  (school, time, plate), and two CTAs (Faire un autre pointage / Menu complet).
- Buttons disabled until `citizenPhone` is set.

### 3. SOS silencieux (long press) in UrgenceView
- New black SOS panel with a red circular button requiring a **3-second long
  press** (`SOS_HOLD_MS = 3000`) to activate.
- Pointer events: `onPointerDown` starts a `setTimeout` + a 50ms-progress
  `setInterval`; `onPointerUp` / `onPointerLeave` / `onPointerCancel` cancel
  both. Stored in `longPressTimerRef` / `progressTimerRef`.
- Visual progress: SVG `<circle>` with `strokeDasharray` / `strokeDashoffset`
  that fills clockwise as `sosProgress` goes 0→100. Live % text under the button.
- On completion:
  1. **Photo capture**: `navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}})`
     → hidden `<video>` → `<canvas>` → `toDataURL('image/jpeg', 0.6)`.
     The temporary `<video>` is appended with `1px×1px opacity:0` so no visible
     preview, no flash. Cleaned up in `finally`.
  2. **Audio recording**: `MediaRecorder` with `{audio:true}`, 5 seconds,
     `Blob` → `FileReader` → `dataURL`.
  3. **GPS**: existing `captureGps()` (null-safe).
  - All three run in parallel via `Promise.all` — each is null-safe, so the SOS
    is always sent even if camera/mic/GPS are refused.
  4. Citizen identification: `onEnsureCitizen('general')` if `citizenPhone` is
     null — non-blocking (the SOS is sent without phone if the modal is cancelled).
  5. `POST /api/city/sos` with `{plateId, qrToken, photoDataUrl, audioDataUrl,
     gpsLat, gpsLng, citizenPhone}`.
- Discreet confirmation: `parler('S O S envoyé…')` + toast (no alarm sound).
- Warning text: "Maintenez **3 secondes** pour envoyer un SOS silencieux avec
  photo et audio…".
- Three discreet icons under the button: 📷 Photo · 🎙 Audio 5 s · 📍 GPS.
- Cleanup on unmount clears both timers.
- Note: the ref-via-useEffect pattern triggered the `react-hooks/immutability`
  rule (`triggerSosSilencieuxRef.current = …` inside an effect); refactored to
  plain inline functions capturing the latest closure (no useCallback, no ref).

### 4. Extended ArtisansView (BusinessCard)
- **New types**: `CityBusiness`, `CityCitizen`, `CityCheckin`, `CitySos` (all
  matching the API contracts in the task description).
- **Category filter chips** (horizontally scrollable): All, Artisan, Commerce,
  Restaurant, Coiffure, Mécanicien, Téléphonie, Nettoyage. Each chip colored by
  `BUSINESS_CATEGORIES` config.
- New fetch effect: `GET /api/city/businesses?lat&lng&radius=500&category=…`
  (instead of the old `/api/city/artisans`). Refetches on category change.
- **BusinessCard** component (new) shows:
  - Photo thumbnail (`photoUrl`) — 64×64 rounded.
  - Name + trade.
  - Category badge colored by type.
  - Distance (rounded m), hours, rating (+reviewCount) — only if present.
  - Description (line-clamped to 2 lines).
  - "Appeler" button (`tel:` link, green).
  - "WhatsApp" button (`https://wa.me/{digits}`, green `#25D366`) — only if
    `business.whatsapp` present.
  - **Premium features** (`isPremium`):
    - Menu items (parsed from `business.menu` JSON `[{"name","price"}]`, first 3).
    - Price grid (parsed from `business.priceGrid` JSON `[{"service","price"}]`).
    - "Commander" button (WhatsApp pre-filled with menu items) — only for
      restaurants with a menu.
  - **Sponsored badge** (gold `#C9A961` "Sponsorisé" + Sparkles icon) at
    top-right; sponsored offer text below the card if `sponsoredOffer` present.
  - **Verified badge** (blue BadgeCheck icon) if `verified`.
- Sort: sponsored first, then by distance ascending.
- Old `handleContactArtisan` is kept (no longer rendered); a new
  `handleContactBusiness` POSTs to `/api/city/businesses/:id/contact` (mock,
  fire-and-forget) and increments `contactCount` optimistically.

### 5. CitizenRegistrationModal (new, reusable)
- Modal overlay (`fixed inset-0 z-[100]`) with a bottom-sheet style card on
  mobile, centered on desktop.
- Two modes:
  - `general`: phone (required) + name (optional). Used by SOS silencieux.
  - `school`: phone (required) + name (optional) + parent phone (optional).
    Used by SchoolCheckinView. `schoolName` is auto-filled from `plateLabel`.
- Validates phone (≥8 digits, after stripping non-digits/`+`).
- Submit → `POST /api/city/citizens` with `{phone, name?, schoolName?,
  parentPhone?}` → returns `{ok, data:{citizen}}`.
- Parent state: `citizenPhone`, `citizenName`, `showCitizenModal`,
  `citizenModalMode`, `citizenSubmitting`, plus a `citizenModalResolverRef`
  that lets `ensureCitizen(mode)` return a `Promise<string|null>` — resolves
  with the phone on submit, `null` on cancel.
- The modal is rendered as a sibling in three branches: `phase === 'sub'`
  (SOS), the école main branch, and the standard main branch — so the overlay
  works regardless of which view triggered it.
- A `Shield` icon + privacy note reassures the citizen about data sharing.

## Helpers added (module-level, not in component)
- `captureDiscreetPhoto(): Promise<string|null>` — getUserMedia → canvas →
  dataURL. Null-safe; cleans up the temporary `<video>` and stream tracks.
- `captureAudioDataUrl(seconds=5): Promise<string|null>` — MediaRecorder →
  Blob → FileReader → dataURL. Null-safe.
- `postSosSilencieux(payload)` / `postCheckin(payload)` / `postCitizen(payload)`
  — typed fetch wrappers for the 3 new endpoints, all returning
  `{ok:true,…} | {ok:false,error}`.
- `BUSINESS_CATEGORIES` + `businessCategoryColor(category)` for the chips and
  card badges.

## Imports added
- `useMemo` from `react`.
- From `lucide-react`: `Hand`, `Mic`, `X`, `BadgeCheck`, `Sparkles`, `DoorOpen`,
  `LogIn`.

## Lint status
- `city-scan-view.tsx` passes ESLint with zero errors and zero warnings.
- The remaining project-level error (`city-dashboard.tsx:431` —
  `setState` inside an effect) and the unused eslint-disable warnings are
  preexisting in another file and untouched by this task.

## Dev server
- `dev.log` final line: `✓ Compiled in 561ms` — no compilation errors
  introduced. The `sonde-ai.ts` Edge Runtime warnings are preexisting and
  unrelated.

## Notes for the API team (parallel work)
- `POST /api/city/citizens` body: `{phone, name?, schoolName?, parentPhone?}`
  → `{ok, data:{citizen:{id, phone, name?, schoolName?, parentPhone?, createdAt?}}}`.
- `POST /api/city/checkins` body: `{plateId, citizenPhone, status: "arrived"|"left"|"sos"}`
  → `{ok, data:{checkin:{id, plateId, citizenPhone, status, createdAt}}}`.
- `POST /api/city/sos` body: `{plateId?, qrToken?, photoDataUrl?, audioDataUrl?,
  gpsLat?, gpsLng?, citizenPhone?}` → `{ok, data:{sos:{…}}}`.
- `GET /api/city/businesses?lat&lng&radius=500&category=` →
  `{ok, data:{businesses: CityBusiness[]}}` where each business may include
  `photoUrl`, `whatsapp`, `hours`, `description`, `distance`, `rating`,
  `reviewCount`, `verified`, `isPremium`, `isSponsored`, `sponsoredOffer`,
  `menu` (JSON string), `priceGrid` (JSON string).
- All field names are matched exactly in the `CityBusiness` / `CityCitizen` /
  `CityCheckin` / `CitySos` type definitions.
