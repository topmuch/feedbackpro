# Task 1 — Harmonisation couleurs Landing → #002e85

## Fichiers modifiés
- `src/app/globals.css`
- `src/components/feedbackpro/landing-view.tsx`

## Résumé des changements (couleurs)

### globals.css
- `.fp-text-gradient` : `linear-gradient(135deg, #8B5CF6, #3B82F6, #EC4899)` → `linear-gradient(135deg, #002e85, #0047c7, #002e85)`
- `.fp-bg-gradient` : `linear-gradient(135deg, #8B5CF6, #3B82F6)` → `linear-gradient(135deg, #002e85, #0047c7)`
- `.fp-bg-gradient-warm` : `linear-gradient(135deg, #EC4899, #F97316)` → `linear-gradient(135deg, #002e85, #0047c7)` (rose/orange supprimé)
- `.fp-mesh-bg` : radial-gradients rgba(139,92,246) / rgba(59,130,246) / rgba(236,72,153) → rgba(0,46,133) / rgba(0,71,199) / rgba(0,46,133)
- `@keyframes fp-pulse-glow` : rgba(139,92,246,...) → rgba(0,46,133,...)
- `@keyframes fp-card-glow` : rgba(139,92,246,...) → rgba(0,46,133,...)
- `.fp-gradient-border::before` linear-gradient → bleu profond
- `@keyframes fp-scan-pulse-soft` : rgba(139,92,246,...) → rgba(0,46,133,...)
- `.fp-scan-reward-border::before` linear-gradient → bleu profond
- `.dark .fp-scan-reward-border` background `rgba(30,20,50)` → `rgba(20,30,60)` (teinte bleutée)
- `.fp-scan-reward-border` background `#faf5ff` (violet clair) → `#f5f8ff` (bleu clair)

### landing-view.tsx
- Témoignages avatars : `from-violet-500 to-blue-500` et `from-pink-500 to-orange-500` → `from-[#002e85] to-[#0047c7]`
- Particules : rgba(139,92,246) / rgba(59,130,246) / rgba(236,72,153) / rgba(249,115,22) → rgba(0,46,133) / rgba(0,71,199)
- Icônes `text-violet-500` / `text-purple-400` → `text-[#002e85]`
- Badges `text-violet-600` / `text-pink-600` → `text-[#002e85]`
- Tableau comparatif : `border-purple-200 bg-purple-50` → `border-[#002e85]/30 bg-[#002e85]/10` (en-tête) et `bg-[#002e85]/5` (lignes)
- Hover borders : `hover:border-violet-300` / `hover:border-purple-300` → `hover:border-[#0047c7]` ou `hover:border-[#002e85]/30`
- Shadows : `shadow-purple-500/20` / `shadow-purple-500/30` / `shadow-[0_0_20px_rgba(139,92,246,0.4)]` → `shadow-[#002e85]/20` / `shadow-[#002e85]/30` / `shadow-[0_0_20px_rgba(0,46,133,0.4)]`
- Halo mockup hero : `from-violet-600/30 via-blue-600/20 to-pink-600/20` → `from-[#002e85]/30 via-[#0047c7]/20 to-[#002e85]/20`
- Pricing card populaire : `border-2 border-purple-300 ... shadow-purple-500/20` → `border-2 border-[#002e85] ... shadow-[#002e85]/20`
- CTA final : `border-purple-500/20 bg-gradient-to-br from-purple-600 to-blue-600 shadow-purple-500/30` → `border-[#002e85]/30 bg-gradient-to-br from-[#002e85] to-[#0047c7] shadow-[#002e85]/30`
- Particules décoratives CTA : `bg-violet-300` / `bg-blue-300` / `bg-pink-300` → `bg-white/50` / `bg-white/70` / `bg-white/40`
- Texte CTA highlight `text-pink-200` → `text-white`
- Bouton CTA blanc `text-purple-600` → `text-[#002e85]`
- Footer (fond sombre `bg-gray-900` préservé) : lien "Se connecter" `text-violet-400` → `text-[#5b8def]` (bleu plus clair pour lisibilité sur fond sombre)
- Quote icône témoignages `text-violet-200` → `text-[#002e85]/30`

## Éléments préservés (conformément aux consignes)
- Fond noir `bg-gray-900` du footer (sombre pour contraste)
- Fond blanc principal de la landing
- Étoiles jaunes `text-amber-400` (inchangées)
- Couleurs emerald (badges "Live", "10× moins cher", flèches vertes) — inchangées
- Couleurs rose-500 du tableau comparatif traditionnel (icônes X) — inchangées
- Couleurs amber pour récompenses / avis Google — inchangées

## Vérifications
- `bunx tsc --noEmit` → EXIT=0 ✓
- `curl http://localhost:3001/` → 200 ✓
- `curl http://localhost:3001/r/<token>` → 200 ✓
- Test agent-browser viewport 1440×900 + 320×568 : aucun débordement horizontal, tous les éléments visibles
- Vérification DOM via getComputedStyle : plus aucun rgb(139,92,246) / rgb(59,130,246) / rgb(236,72,153) / rgb(249,115,22) sur la landing
- `.fp-text-gradient` rend bien `linear-gradient(135deg, rgb(0,46,133), rgb(0,71,199), rgb(0,46,133))` ✓
