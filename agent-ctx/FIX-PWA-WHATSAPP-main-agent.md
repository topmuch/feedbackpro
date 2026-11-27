# FIX-PWA-WHATSAPP — PWA install + WhatsApp incident details

Two fixes applied in one pass.

## Task 1 — PWA installation not triggering

### Root cause
- `public/manifest.webmanifest` still held **FeedVoice** branding
  (restaurant audit), with `theme_color: #bc7155` (terracotta) instead of
  the Ville Connectée blue. Chrome requires a valid manifest (name,
  start_url, display:standalone, 192+512 icons, theme/background colors) to
  emit `beforeinstallprompt`.
- The `<link rel="manifest">` was already present in `src/app/layout.tsx`
  (line 30) — kept.
- The service worker `public/sw.js` already has a `fetch` event handler
  (line 111) — verified, no change.
- The citizen QR page (`city-scan-view.tsx`) only showed a toast on iOS
  fallback — no step-by-step modal.

### Changes
1. **`public/manifest.webmanifest`** — rewritten with Ville Connectée /
   Aminata branding:
   - `name`: "Ville Connectée — Aminata, votre assistante municipale"
   - `short_name`: "Aminata"
   - `theme_color`: `#0066CC` (signalétique blue), `background_color`: `#FAFAF7`
   - `display: "standalone"`, `scope: "/"`, `start_url: "/"`
   - `lang: "fr"`, `categories`
   - icons: 192 (any + maskable), 512 (any + maskable), logo.svg (any)
2. **`src/app/layout.tsx`** — `meta theme-color` aligned to `#0066CC`
   (must match manifest theme_color). Added `apple-mobile-web-app-capable`,
   `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`
   ("Aminata") meta tags for iOS Add-to-Home-Screen.
3. **`src/components/feedbackpro/city-scan-view.tsx`** — PWA install UX:
   - Added `detectInstallPlatform()` (ios / android / desktop) +
     `isRunningStandalone()` helpers.
   - Imported shadcn `Dialog` components.
   - Added `showInstallModal` state + `appinstalled` event listener.
   - "Aminata dans ma poche" button: when `deferredPrompt` exists → calls
     `prompt()` (Chrome/Edge Android); otherwise opens a **modal** with
     step-by-step instructions adapted to the detected platform
     (iOS: Partager → Sur l'écran d'accueil → Ajouter ; Android: menu ⋮ →
     Installer l'application → Installer ; desktop: install icon / menu).
   - Button hidden when already running in standalone mode (installed).

## Task 2 — WhatsApp incident notification with full details

### `/api/city/incidents/route.ts` (POST)
- Added optional `citizenPhone` and `agentPhone` body fields.
- Added helpers:
  - `extractPhoneFromText()` — extracts a Senegal number from a free-text
    description (+221 / 00221 / local 9-digit, with spaces/dots/dashes).
  - `normalizePhone()` — normalizes any input to wa.me format (digits only,
    local → prefixed with 221).
  - `buildAgentNotificationMessage()` — full agent message:
    ```
    🚨 NOUVEAU SIGNALEMENT
    Type: {Urgence/Signalement} ({type})
    Catégorie: {category}
    Description: {description}
    Position GPS: {lat}, {lng}  (+ Google Maps link)
    Plaque: {plateNumber} - {label} ({district})
    Service assigné: {assignedTo}
    Date: {createdAt}
    ```
  - `buildCitizenConfirmationMessage()` — citizen confirmation:
    ```
    ✅ SIGNALEMENT CONFIRMÉ
    Votre signalement "{category}" a été enregistré.
    Référence: #{id.slice(-6)}
    Service assigné: {assignedTo}
    Vous serez notifié(e) de la résolution.
    ```
  - `buildWhatsappUrl()` — `https://wa.me/{phone}?text={encoded}` (or
    `wa.me/?text=…` contact-picker link when no phone is known).
- After incident creation, builds both URLs and returns them in the
  response as `whatsapp.agent` + `whatsapp.citizen` (citizen is `null` when
  no phone is found).

### `/api/city/notify-resolution/route.ts` (POST)
- Added optional `resolutionComment` body field (max 500 chars).
- Phone normalization extended to local Senegal format (9 digits → prefixed
  221) and `00221…` → `221…`.
- Message rewritten to the detailed format:
  ```
  ✅ RÉSOLUTION CONFIRMÉE
  Votre signalement "{category}" (réf #{id}) a été résolu par {assignedTo}.
  {resolutionComment if any}
  Merci pour votre contribution citoyenne !
  ```
- Response now also returns `resolutionComment`.

### Frontend wiring (`city-scan-view.tsx`)
- `postIncident()` return type extended to carry the `whatsapp` payload.
- Submission handler now passes `citizenPhone` (from the citizen light
  registration) and opens the citizen confirmation WhatsApp URL in a new
  tab when present (V1 manual send, zero WhatsApp Cloud API cost — same
  approach as the existing notify-resolution flow).

## Verification
- `bun run lint` → 0 errors, 3 pre-existing `no-page-custom-font` warnings
  (unrelated, present before this change).
- Dev server recompiled successfully (`✓ Compiled in 3s`).
- All referenced manifest icons (`/icon-192.png`, `/icon-512.png`,
  `/logo.svg`) exist in `public/`.
- `sw.js` `fetch` handler confirmed present (no change needed).
- Existing callers of `/api/city/incidents` and `/api/city/notify-resolution`
  remain backward compatible (new fields are optional; response additions
  are additive).
