# Task A1 — Auth View Premium Redesign

## File
- Path: `/home/z/my-project/src/components/feedbackpro/auth-view.tsx`
- Lines: **789** (down from 1394 — wizard 4 étapes remplacé par un formulaire simple 5 champs)
- Export preserved: `export function AuthView()` (no props — driven by store `authMode`/`setAuthMode`)
- Directive: `"use client"`

## Checks
- `bun run lint`: **0 errors in auth-view.tsx** (4 pre-existing errors in scratch-card.tsx, push-manager.ts, airport-bot.ts require imports — unrelated to this task)
- `npx tsc --noEmit --skipLibCheck`: **0 errors in auth-view.tsx** (3 pre-existing errors in airport-staff-view.tsx + push-manager.ts — unrelated)
- Dev server: `✓ Compiled in 1637ms`, `GET / 200` — page renders clean

## Layout — Split Screen
- Root wrapper: `grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-[#F8FAFC]`
- Left (`PanneauVisuel`): `hidden ... lg:flex lg:flex-col lg:justify-between` — visible only on desktop (lg+), 50% width
- Right (`PanneauForm`): always visible, `flex min-h-screen items-center justify-center bg-[#F8FAFC]` — 50% width on desktop, full-width single column on mobile
- Mobile fallback: left visual panel hidden, mobile logo + "Accueil" link rendered at top of form panel (`lg:hidden`)

## Left Visual Panel — Premium Effects
- Gradient bg: `bg-gradient-to-br from-[#5257C9] to-[#7C3AED]` (indigo → violet)
- **3 animated aurora blobs** (CSS keyframes injected via `<style>`):
  - `fbp-aurora1` (22s loop, blur-[120px], white/15)
  - `fbp-aurora2` (27s loop, blur-[120px], [#7C3AED]/30)
  - `fbp-aurora3` (32s loop, blur-[120px], [#06B6D4]/20)
- Subtle grid overlay (40px×40px, opacity 8%)
- Logo: `<img src="/logo-feedbackpro.png" className="h-12 brightness-0 invert" />` (white)
- Tagline: "L'audit qualité continu pour votre établissement" (text-4xl/5xl bold)
- Testimonial glass dark card: border-white/15, bg-white/10, backdrop-blur-md, 5 stars (amber-300), "— Gérant de restaurant"
- Stats row: `4.9/5 ★ | +2M feedbacks | 98% satisfaction` (with white dividers)
- `prefers-reduced-motion` respected

## Right Form Panel — Premium Effects
- Background: `bg-[#F8FAFC]` (off-white)
- Form container: `max-w-md` centered
- **Tab toggle (pill sliding)**: framer-motion `layoutId="auth-tab-pill"` — gradient pill (`bg-gradient-to-r from-[#5257C9] to-[#7C3AED]`) slides between Connexion/Inscription tabs with spring transition (stiffness 380, damping 32)
- **Form slide-in animation**: `AnimatePresence mode="wait" initial={false}` + `motion.div` with `opacity: 0→1, x: 24→0` (and `x: 0→-24` on exit), duration 0.32s easeOut — fires on authMode switch only
- Mobile logo (lg:hidden) at top

## Login Form
- Title: "Connexion" + subtitle "Accédez à votre dashboard"
- Email input (Mail icon, left-aligned)
- Password input (Lock icon + Eye/EyeOff toggle on right)
- Submit button: `bg-gradient-to-r from-[#5257C9] to-[#7C3AED]` + `shadow-lg shadow-[#5257C9]/25` + `hover:scale-[1.02]` + `fbp-shimmer` (background-position animation 3.5s)
- "Mot de passe oublié ?" mailto link
- Divider "ou" with centered bg-[#F8FAFC] chip
- 2 demo buttons (quick login): "Démo Restaurant" (Building2 icon, demoLogin("pro")) + "Démo Admin" (Sparkles icon, demoLogin("admin")) — directly hit /api/auth/login, no manual form submission
- Below: "Pas encore de compte ? S'inscrire" link

## Signup Form (simplified vs. old 4-step wizard)
- Title: "Créer un compte" + subtitle "5 minutes de setup. Pas de carte bancaire."
- 5 fields only:
  1. Nom de l'établissement (Building2 icon)
  2. Email (Mail icon)
  3. Mot de passe (Lock + Eye/EyeOff toggle)
  4. Secteur select (Store icon + custom chevron SVG): Restaurant / Aéroport / Hôtel / Autre
- Submit button: same gradient + glow + shimmer as login
- Below: "Déjà un compte ? Se connecter" link
- Missing required server fields (adresse/ville/whatsapp/zones/logo) sent with valid placeholder values ("À compléter dans les paramètres" / "À compléter" / "" / [] / "") — user completes them in dashboard Settings

## Input Styling (per spec)
- All inputs: `h-12 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus-visible:border-[#5257C9] focus-visible:ring-2 focus-visible:ring-[#5257C9]/20`
- Icons positioned absolute left-3.5 with `pointer-events-none`
- Password show/hide toggle: absolute right-3, h-7 w-7 hover:bg-slate-100

## Button Styling (per spec)
- Primary buttons: `bg-gradient-to-r from-[#5257C9] to-[#7C3AED] text-white font-semibold rounded-xl shadow-lg shadow-[#5257C9]/25 hover:shadow-xl hover:scale-[1.02] transition-all`
- Demo buttons (outline): `border-2 border-slate-200 bg-white hover:border-[#5257C9]/40 hover:bg-slate-50`

## Logic Preserved
- Same API calls: `POST /api/auth/login`, `POST /api/auth/register`
- Same `refreshSession()` + `setView(role === "SUPERADMIN" ? "admin" : "dashboard")` post-success pattern
- `demoLogin(kind)` from store still invoked (sets `prefillLogin` for app-wide consistency)
- `prefillLogin` from store now actually used (useEffect syncs to form via `setValue`) — was previously ignored
- Zod schemas kept client-side for instant validation (email format, password min 6, etc.)
- Toast on signup success

## Icons Used (all from lucide-react)
- Mail, Lock, Eye, EyeOff, ArrowRight, Building2, Sparkles, Star, Store, AlertCircle, Loader2

## Notes for Downstream Tasks
- The signup form is now much simpler than the original 4-step wizard. If full establishment data collection (adresse, ville, whatsapp, zones, logo) is needed at signup, an onboarding flow post-signup should be added. Currently the user is redirected to the dashboard with placeholder values that they must complete in Settings.
- The `PanneauVisuel` is `aria-hidden="true"` (decorative)
- The sliding pill uses framer-motion `layoutId` — requires `LayoutGroup` or single parent (works out of the box here)
