# Task ID 2-4 — ProDashboard Airport Tabs Integration

**Agent**: main
**Date**: 2026-11-10
**Status**: ✅ Complete — tsc + eslint pass, dev server compiles

## Objectif

Intégrer les **4 onglets aéroport** (Wallboard, Zones, Signalements, Bot WhatsApp)
dans le **ProDashboard existant** (qui reste le seul shell du secteur Aéroport —
plus besoin de passer par `/airport-dashboard`). Les onglets aéroport n'apparaissent
QUE pour les Pros dont `typeEtablissement === "Aéroport"`, dans une section
« ✈️ Aéroport » dédiée, sans casser les 14 onglets classiques ni le thème clair
du ProDashboard.

## Décisions clés

1. **Pas de route supplémentaire** — tout est dans `src/app/page.tsx` via
   `<ProDashboard />` (le shell unique). Les slugs aéroport (`aeroport-wallboard`,
   `aeroport-zones`, `aeroport-signalements`, `aeroport-bot`) suivent la même
   convention `/dashboard/<slug>` que les 14 onglets classiques (rewriting
   `next.config.ts` → `/?tab=<slug>` + `history.pushState` côté client).

2. **Wallboard tab = iframe** — `<AirportWallboardTab />` embarque `/ops-wallboard`
   dans une iframe plein-écran (`h-[calc(100vh-12rem)]`). Le wallboard garde son
   thème sombre (slate-950) — c'est volontaire (affichage TV salle ops).

3. **Section sidebar « ✈️ Aéroport »** placée APRÈS `ONGLETS_PRINCIPAUX` et AVANT
   le séparateur « Gestion » — pour rester proche des onglets opérationnels
   (Zones, Retours). Le label utilise `text-emerald-300/80` (accent aéroport)
   pour la distinguer visuellement du label « Gestion » (`text-white/50`).

4. **Re-thémisation des 3 tabs existantes** (zones/reports/bot) du dark slate-950
   vers le light theme du ProDashboard. Mapping appliqué (par `replace_all`) :
   - `bg-slate-950` → `bg-background`
   - `bg-slate-900` → `bg-card`
   - `bg-slate-800` → `bg-muted`
   - `bg-slate-700` → `bg-muted`
   - `bg-slate-500` → `bg-muted`
   - `bg-slate-400` → `bg-muted-foreground`
   - `border-slate-{800,700,600,500}` → `border-border`
   - `divide-slate-800` → `divide-border`
   - `text-slate-{100,200}` → `text-foreground`
   - `text-slate-{300,400,700}` → `text-muted-foreground`
   - `text-slate-{500,600}` → `text-muted-foreground/70`
   - `text-emerald-{300,400}` → `text-emerald-600` (emerald = accent aéroport conservé)
   - `text-emerald-{100,200}` → `text-emerald-700`
   - `text-amber-{200,300}` → `text-amber-700`
   - `text-rose-{200,300}` → `text-rose-700`
   - `text-rose-400` → `text-rose-600`
   - `text-sky-300` → `text-sky-700`
   - `text-fuchsia-300` → `text-fuchsia-700`
   - `text-orange-300` → `text-orange-700`
   - `hover:text-white` → `hover:text-foreground`
   - **Conservé** : `bg-emerald-600` (boutons Save/Résoudre), `bg-{amber,sky,rose,fuchsia,emerald}-500/{10,15,20}` (translucent badge backgrounds), `bg-{amber,sky,emerald}-400` (status dots), `border-{amber,sky,rose,emerald,fuchsia}-500/{30,40}` (badge borders).

5. **i18n fallback** — les 3 fonctions `t()` locales du ProDashboard (qui ne
   lisent pas `next-intl` côté client) ont été étendues avec les 4 clés
   `nav.airport{Wallboard,Zones,Reports,Bot}` + `nav.aeroport` (label de section).
   Les fichiers `src/messages/{fr,en,es}.json` ont aussi été mis à jour.

## Fichiers modifiés / créés

| Fichier | Avant | Après | Δ | Rôle |
|---|---|---|---|---|
| `src/components/feedbackpro/pro-dashboard.tsx` | 608 | 669 | +61 | Ajout 4 onglets aéroport + section sidebar conditionnelle + 4 imports + i18n fallback |
| `src/components/feedbackpro/airport-zones-tab.tsx` | 928 | 928 | 0 | Re-thémisation dark → light (classes only, logique inchangée) |
| `src/components/feedbackpro/airport-reports-tab.tsx` | 560 | 560 | 0 | Re-thémisation dark → light (classes only, logique inchangée) |
| `src/components/feedbackpro/airport-bot-tab.tsx` | 426 | 426 | 0 | Re-thémisation dark → light (classes only, logique inchangée) |
| `src/components/feedbackpro/airport-wallboard-tab.tsx` | — | 26 | +26 | 🆕 Wrapper iframe `/ops-wallboard` |
| `src/messages/fr.json` | 263 | 267 | +4 | 4 clés nav aéroport (fr) |
| `src/messages/en.json` | 263 | 267 | +4 | 4 clés nav aéroport (en) |
| `src/messages/es.json` | 263 | 267 | +4 | 4 clés nav aéroport (es) |

## Détail des changements dans `pro-dashboard.tsx`

1. **Imports Lucide** : ajout de `Monitor`, `Plane`, `MessageCircle` (Inbox déjà importé).
2. **Imports composants** : ajout de `AirportZonesTab` (default), `AirportReportsTab` (default), `AirportBotTab` (default), `AirportWallboardTab` (named).
3. **Type `Onglet`** : +4 valeurs (`airport-wallboard`, `airport-zones`, `airport-reports`, `airport-bot`).
4. **`SLUG_TO_TAB`** : +4 entrées (`aeroport-wallboard`, `aeroport-zones`, `aeroport-signalements`, `aeroport-bot`).
5. **`TAB_TO_SLUG`** : +4 entrées (mapping inverse).
6. **`ONGLETS_AEROPORT: EntreeNav[]`** : nouveau tableau de 4 entrées avec icônes Monitor/Plane/Inbox/MessageCircle.
7. **`ContenuSidebar`** : nouveau prop `estAeroport?: boolean`. Quand `true`, rend une section « ✈️ Aéroport » (label emerald-300/80) APRÈS `ONGLETS_PRINCIPAUX` et AVANT le séparateur « Gestion ».
8. **2 call sites `ContenuSidebar`** (desktop + drawer mobile) : passent `estAeroport={typeEtablissement === "Aéroport"}`.
9. **Switch de contenu** (ligne ~553) : +4 lignes `{onglet === "airport-..." && <.../>}`.
10. **3 fonctions `t()` locales** : ajout de `nav.airportWallboard`, `nav.airportZones`, `nav.airportReports`, `nav.airportBot`, `nav.aeroport` dans le fallback map.

## APIs utilisées (inchangées)

Aucune nouvelle API. Les 4 onglets aéroport réutilisent les APIs existantes :
- `GET /api/airport/zones` + `PUT /api/airport/zones/[code]` (Zones tab)
- `GET /api/airport/reports` + `POST /api/airport/ops/resolve` (Reports tab)
- `GET /api/airport/ops-contacts` (Bot tab)
- `GET /api/airport/wallboard` (via iframe `/ops-wallboard`)

## Vérifications (toutes ✅)

### TypeScript
```bash
cd /home/z/my-project && bunx tsc --noEmit --skipLibCheck
# → aucune erreur
```

### ESLint
```bash
cd /home/z/my-project && bunx eslint \
  src/components/feedbackpro/pro-dashboard.tsx \
  src/components/feedbackpro/airport-zones-tab.tsx \
  src/components/feedbackpro/airport-reports-tab.tsx \
  src/components/feedbackpro/airport-bot-tab.tsx \
  src/components/feedbackpro/airport-wallboard-tab.tsx
# → aucune erreur / warning
```

### i18n JSON validité
```bash
node -e "JSON.parse(... fr/en/es.json)" # → All 3 i18n JSON files are valid
```

### Dev server
- `✓ Compiled in 413ms` / `1602ms` / `1262ms` (3 recompilations après éditions)
- Aucune erreur ni warning dans `dev.log`

### Tests fonctionnels (à valider par l'utilisateur)
1. Login `aeroport@dakar.sn` / `aero1234` → ProDashboard avec 14 onglets classiques + section « ✈️ Aéroport » (4 onglets).
2. Login `demo@pizzeria.fr` / `demo1234` → ProDashboard avec uniquement les 14 onglets classiques (pas de section aéroport).
3. Cliquer les 4 onglets aéroport → rendu correct en thème clair (cards blanches, accents emerald conservés).
4. L'onglet Wallboard affiche le wallboard sombre dans une iframe (comportement attendu — c'est un écran TV).

## Contraintes respectées

- ✅ Les 14 onglets classiques sont intacts (aucune modification de leur logique/render).
- ✅ Le layout/sidebar/thème du ProDashboard sont inchangés (juste une section en plus).
- ✅ Les tabs aéroport utilisent le même `BoutonOnglet` que les autres (cohérence visuelle).
- ✅ La section aéroport n'apparaît QUE pour `typeEtablissement === "Aéroport"`.
- ✅ TypeScript strict, pas de `any`.
- ✅ L'accent emerald est conservé pour les features aéroport (boutons Save/Résoudre, badges actifs, label de section).
