# Task HARM — Harmonisation palette V2.0 sur toutes les pages FeedbackPro

## Objectif
Aligner toutes les pages de FeedbackPro sur la palette V2.0 premium du wallboard :
- `#003399` — Bleu aeroport (primary, headers, buttons)
- `#FCD116` — Jaune IATA (accents, highlights, badges)
- `#F5F5F5` — Gris clair (page background)
- `#FFFFFF` — Blanc (cards, panels)
- `#0F172A` — Dark sections (contrast)
- `#002288` — Bleu fonce (gradient endpoint, sidebar accent)

## Remplacements bulk (sed, case-insensitive pour hex)

| Regle | Avant | Apres | Occurrences | Fichiers |
|-------|-------|-------|-------------|----------|
| 1 | `#5257C9` | `#003399` | 191 | 18 |
| 2 | `#7578E8` | `#FCD116` | 0 | 0 |
| 3 | `#7C3AED` | `#FCD116` | 45 | 5 |
| 4 | `#F8FAFC` | `#F5F5F5` | 43 | 4 |
| 5 | `bg-slate-950` | `bg-[#0F172A]` | 13 | 4 |
| 6 | `from-violet-600 via-purple-600 to-fuchsia-600` | `from-[#003399] via-[#003399] to-[#0044bb]` | 17 | 3 |

**Total bulk : 309 remplacements**

## Modifications manuelles speciales

### 1. `src/app/globals.css` — variables CSS :root
- `--primary`: `oklch(0.38 0.14 264)` -> `#003399`
- `--primary-foreground`: `oklch(0.985 0 0)` -> `#FFFFFF`
- `--accent`: `oklch(0.97 0 0)` -> `#FCD116` (jaune IATA)
- `--sidebar`: `oklch(0.48 0.17 264)` -> `#003399`
- `--sidebar-accent`: `oklch(0.38 0.14 264)` -> `#002288` (bleu fonce pour items actifs)
- Comments mis a jour (V2.0 Palette FeedbackPro)
- Dark mode : oklch preserve (comme specifie), valeurs deja compatibles V2.0

### 2. `src/components/feedbackpro/pro-dashboard.tsx`
- 3x `bg-sidebar` -> `bg-[#003399]` (lignes 413, 467, 488 — aside + SheetContent)
- `bg-sidebar-foreground/XX` preserve (skeletons blancs opacite sur fond bleu)

### 3. `src/components/feedbackpro/airport-staff-view.tsx`
- `const INDIGO = '#003399'` -> `const BLEU = '#003399'` (rename const)
- `const INDIGO_DARK = '#4549b8'` -> `const BLEU_DARK = '#002288'` (V2.0 darker blue)
- 2x `style={{ color: INDIGO }}` -> `style={{ color: BLEU }}`
- 6x `#4549b8` -> `#002288` (gradients from-[#003399] to-[#002288])
- `via-indigo-50/30` -> `via-blue-50/30`
- Comments : "indigo FeedbackPro" -> "bleu aeroport V2.0", "Header indigo" -> "Header bleu aeroport"

### 4. `src/components/feedbackpro/airport-scan-view.tsx`
- `to-violet-50/40` -> `to-[#F5F5F5]` (confirmation phase background)
- `from-violet-500/10 to-indigo-500/10 ring-violet-300/30` -> `from-[#003399]/10 to-[#FCD116]/10 ring-[#003399]/30` (bloc Denise)
- 5x `shadow-purple-500/XX` -> `shadow-[#003399]/XX` (sur boutons gradient bleu)

### 5. `src/components/feedbackpro/scan-view.tsx`
- 2x `shadow-purple-500/30` -> `shadow-[#003399]/30` (sur boutons gradient bleu)

### 6. `src/components/feedbackpro/airport-dashboard.tsx`
- Header : `bg-slate-900 border-slate-800` -> `bg-gradient-to-r from-[#003399] to-[#002288] border-[#002288]` (V2.0 blue gradient accent sur dashboard dark)

### 7. `src/components/feedbackpro/admin-dashboard.tsx`
- Page bg : `bg-[#E9E9EF]` -> `bg-[#F5F5F5]` (V2.0 light gray)

### 8. `src/components/feedbackpro/airport-leaderboard-tab.tsx`
- Badge bg : `#E9E9EF` -> `#F5F5F5` (rank badges non-top-3)

### 9. Comments landing-view.tsx + auth-view.tsx
- "Palette indigo #003399 -> violet #FCD116" -> "Palette bleu aeroport #003399 -> jaune IATA #FCD116"

## Fichiers modifies (26 total)

### Via bulk sed (24 fichiers)
1. src/components/feedbackpro/overview-tab.tsx
2. src/components/feedbackpro/marketing-shell.tsx
3. src/components/feedbackpro/retours-tab.tsx
4. src/components/feedbackpro/contact-form.tsx
5. src/components/feedbackpro/use-cases-tabs.tsx
6. src/components/feedbackpro/admin-dashboard.tsx
7. src/components/feedbackpro/auth-view.tsx
8. src/components/feedbackpro/landing-view.tsx
9. src/components/feedbackpro/airport-scan-view.tsx
10. src/components/feedbackpro/airport-mode-emploi-tab.tsx
11. src/components/feedbackpro/airport-dashboard.tsx
12. src/components/feedbackpro/admin-messages-tab.tsx
13. src/components/feedbackpro/airport-staff-view.tsx
14. src/components/feedbackpro/onboarding-banner.tsx
15. src/components/feedbackpro/pricing-toggle.tsx
16. src/components/feedbackpro/stats-tab.tsx
17. src/components/feedbackpro/airport-prediction-radar.tsx
18. src/components/feedbackpro/admin-operations-tab.tsx
19. src/components/feedbackpro/scan-view.tsx
20. src/app/globals.css
21. src/app/api/airport/staff-qrcode/route.ts
22. src/app/api/airport/staff-scan/route.ts
23. src/app/api/airport/report/route.ts
24. src/app/api/airport/assign/route.ts

### Via edits manuels supplementaires (2 fichiers)
25. src/components/feedbackpro/pro-dashboard.tsx (bg-sidebar -> bg-[#003399])
26. src/components/feedbackpro/airport-leaderboard-tab.tsx (#E9E9EF -> #F5F5F5)

## Verification finale

### Zero occurrences restantes (grep case-insensitive)
- `#5257C9` : 0 (etait 191) OK
- `#7578E8` : 0 (etait 0) OK
- `#7C3AED` : 0 (etait 45) OK
- `#F8FAFC` : 0 (etait 43) OK
- `bg-slate-950` : 0 (etait 13) OK
- `from-violet-600 via-purple-600 to-fuchsia-600` : 0 (etait 17) OK
- `#E9E9EF` : 0 (etait 3) OK

### Lint (`bun run lint`)
- 3 errors + 1 warning, tous PRE-EXISTANTS et non lies aux changements de couleur :
  - `prisma/seed-airport-ops-config.cjs:10` — require() import (CommonJS seed)
  - `language-selector.tsx:33` — document.cookie assignment (react-hooks/immutability)
  - `scratch-card.tsx:105` — variable reassignment (react-hooks/immutability)
  - `db.ts:15` — unused eslint-disable (warning)
- Aucune erreur introduite par les changements de palette.

### TypeScript (`npx tsc --noEmit --skipLibCheck`)
- EXIT=0, aucune erreur de type.

### Dev server
- `GET /` -> 200 (compile + render OK)
- Multiples recompiles OK apres les changements.
- Pas d'erreur runtime liee aux couleurs.

## Notes design
- Les sections dark `#0F172A` sont preservees (contraste intentionnel, conforme regle 7).
- Le cyan `#06B6D4` est preserve (accent qui marche avec le bleu, conforme regle 8).
- Le emerald/vert pour success est preserve (conforme regle 9).
- Le rose/red pour danger est preserve (conforme regle 10).
- Le `#002e85` et `#0047c7` (harmonisation precedente landing) sont preserves — ce sont des bleus profonds compatibles V2.0, non listes dans les regles de remplacement.
- Les classes Tailwind violet/purple/fuchsia restantes (ex: `bg-violet-500/10` dans airport-leaderboard-tab, `text-violet-600` dans admin-dashboard) ne sont pas dans le scope des 6 regles explicites. Elles peuvent etre nettoyees dans une tache suivante si besoin.
