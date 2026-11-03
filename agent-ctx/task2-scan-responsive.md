# Task 2 — Responsive scan-view (mobile 375px → 320px)

## Fichier modifié
- `src/components/feedbackpro/scan-view.tsx`

## Méthode de vérification
- agent-browser avec viewport 375×667 (iPhone SE) ET 320×568 (iPhone SE 1st gen)
- Screenshots pris à chaque étape : welcome, step1, step2, step3, step4
- Vérification `document.documentElement.scrollWidth > window.innerWidth` pour détecter tout débordement horizontal

## Captures d'écran (dans /home/z/feedbackpro/agent-ctx/)
- `scan-welcome-375.png` / `scan-welcome-375-v2.png`
- `scan-step1-375.png` / `scan-step1-375-v2.png` / `scan-step1-320.png` / `scan-step1-320-v2.png`
- `scan-step2-375.png` / `scan-step2-320-v2.png`
- `scan-step3-375.png` / `scan-step3-320-v2.png`
- `scan-step4-375.png` / `scan-step4-320.png` / `scan-step4-320-v2.png`

## Changements appliqués (responsive)

### Étape 1 — Grille d'étoiles (5 cards)
- Grille : `mt-7 grid-cols-5 gap-2 sm:gap-3` → `mt-6 grid-cols-5 gap-1.5 sm:gap-2` (gap plus serré sur mobile)
- Cards : `h-24 sm:h-28 p-1.5` (hauteur fixe) → `min-h-20 sm:min-h-24 p-1.5 sm:p-2` (hauteur min flexible, padding réduit sur desktop)
- Mesures à 375px : 5 cards × 64px × 80px, total 344px, padding inclus 376px ≈ viewport 375px ✓
- Mesures à 320px : 5 cards × 53px × 80px, total 289px, padding inclus 321px ≈ viewport 320px ✓

### Étape 2 — Grilles de tags
- Grille groupée par pilier : `gap-2.5 sm:gap-3` → `gap-2 sm:gap-3` (plus serré sur mobile)
- Grille plate (fallback) : `gap-2.5 sm:gap-3` → `gap-2 sm:gap-3`
- Cards tags : `min-h-24 p-2.5 sm:min-h-28` → `min-h-20 p-2 sm:min-h-24 sm:p-3` (plus compact sur mobile)
- Mesures à 320px : cards 126×80px, no overflow ✓
- Note : la grid `grid-cols-2` fonctionne correctement — si chaque pilier n'a qu'1 tag, seul 1 colonne est remplie (comportement attendu, pas un bug CSS)

### Logo établissement (étape Bienvenue)
- `<LogoEtablissementBig>` image : `size-32 sm:size-40` → `size-24 sm:size-32` (plus petit sur mobile)
- `<LogoEtablissementBig>` initiale (fallback) : `size-32 text-6xl sm:size-40` → `size-24 text-5xl sm:size-32 sm:text-6xl`
- Mesures à 320px : logo 96×96px, centré horizontalement ✓

## Éléments déjà responsive (vérifiés, non modifiés)
- Top bar : `px-4 pt-4 sm:px-6` ✓
- Main : `px-4 pb-4 sm:px-6` ✓
- Footer : `px-4 pb-4 sm:px-6` ✓
- H1 étapes 1-4 : `text-2xl sm:text-3xl` ✓
- H1 welcome : `text-3xl sm:text-4xl` ✓ (conforme consigne "OK")
- H1 success/error : tailles adaptées ✓
- Boutons "Continuer" / "Suivant" / "Envoyer" : `w-full max-w-xs` (welcome) ou `w-full` (footer) ✓
- Textarea, Input email, Input personnel : composants shadcn `w-full` par défaut ✓
- Slider NPS : composant shadcn `w-full` par défaut ✓
- Boutons photo : `grid grid-cols-2 gap-2` (2 colonnes fixes) ✓
- Grille tags employés : `grid grid-cols-2 gap-2 sm:grid-cols-3` ✓

## Vérifications finales
- `bunx tsc --noEmit` → EXIT=0 ✓
- `curl http://localhost:3001/` → 200 ✓
- `curl http://localhost:3001/r/<token>` → 200 ✓
- `agent-browser eval` à 320×568 : `overflowX: false` sur toutes les étapes (welcome, step1, step2, step3, step4) ✓
- `agent-browser eval` à 375×667 : `overflowX: false` sur toutes les étapes ✓

## Note
Le scan-view était déjà en grande partie responsive (mobile-first avec breakpoints `sm:`).
Les ajustements ci-dessus réduisent encore la taille des cards étoiles/tags et du logo
sur mobile pour gagner en densité et confort visuel sur les petits écrans (≤ 375px).
La logique métier (API calls, state, i18n, navigation) n'a pas été touchée.
