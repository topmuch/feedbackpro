# Task : retours-detail-design-highlight-main-agent

## Objectif
Améliorer le design de la page détail d'un retour client dans
`src/components/feedbackpro/retours-tab.tsx` (vue rendue quand `detail` est set,
early-return ~ligne 1921). Mettre en valeur les informations importantes.
**Contrainte : CSS/JSX uniquement — aucune logique métier modifiée.**

## Contexte exécution
- Projet : `/home/z/feedbackpro/` (Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma SQLite).
- Dev server attendu sur port 3001 — **n'était pas lancé** au démarrage.
- Setup effectué : `.env` créé (DATABASE_URL=file:/home/z/feedbackpro/data/feedbackpro.db),
  `bunx prisma db push` + `bun run db:seed` (crée le compte démo `demo@pizzeria.fr`/`demo1234`
  + 118 retours sur 9 zones).
- Script de lancement détaché : `.zscripts/start-dev-3001.sh` (cd + env + next dev -p 3001).
  Le serveur ne reste pas vivant en arrière-plan dans le sandbox (process killer),
  vérifs faites en foreground (start → curl → kill).

## Fichier modifié
- `src/components/feedbackpro/retours-tab.tsx` (3470 → 3472 lignes)
- `.zscripts/start-dev-3001.sh` (nouveau, utilitaire de lancement)
- `.env` (nouveau, pour le runtime DB)

## Améliorations visuelles apportées (CSS/JSX pur)

### 1. Header sticky plein couleur (SECTION 1)
- Fond plein couleur selon l'urgence via `cfgUrgence.cardBg` :
  - `urgent` (note ≤2 + récidive) → `bg-[#720032]` (bordeaux)
  - `atraiter` (note ≤2 isolé) → `bg-orange-500`
  - `mitige` (note = 3) → `bg-yellow-500`
  - `positif` (note ≥ 4) → `bg-[#0da14b]` (vert)
- Texte blanc sur tout le header.
- Note en **très gros** (`text-4xl font-black`) à gauche, étoiles XL (`Stars size={32}`).
- Zone / email / date en `text-white/80` (opacité réduite).
- Tous les boutons d'action en `bg-white/20 hover:bg-white/30 text-white`
  (translucides sur fond couleur).
- Badge urgence agrandi : `h-7 px-3 text-base font-bold` + emoji.

### 2. Cards dimension questionnaire (SECTION 2)
- Accent latéral coloré `border-l-4` selon la gravité :
  - 🔴 Critique → `border-l-red-500` + `bg-red-50/60`
  - 🟠 Élevée → `border-l-orange-500` + `bg-orange-50/60`
  - 🟡 Moyenne → `border-l-yellow-500` + `bg-yellow-50/60`
  - 🟢 OK → `border-l-green-500` + `bg-green-50/60`
  (champs `borderL` + `bgLight` ajoutés à l'objet `gravite`).
- Badge de gravité agrandi : `text-sm font-bold px-3 py-1` (au lieu de `text-[10px]`).
- Libellé du tag en `text-base font-bold` (au lieu de `text-sm font-semibold`).
- Titre section en `text-lg font-bold` + séparateur `border-b pb-3`.

### 3. Card Coach IA (SECTION 4)
- Diagnostic en `text-lg font-medium leading-relaxed` (au lieu de `text-sm`).
- Actions = **mini-cards numérotées individuelles** `bg-white/10 rounded-lg p-3`
  avec numéro en gros (`h-8 w-8 rounded-lg bg-white/25 text-base font-black`).
- Impact prévu dans un **badge proéminent** `bg-white/20 rounded-full px-4 py-2 text-lg font-bold`.
- Bouton « Appliquer » agrandi : `text-lg font-bold h-14`.
- Titre en `text-lg font-bold` + séparateur `border-b border-white/20 pb-3` + badge niveau `h-7 text-sm font-bold`.

### 4. Section action gérant (SECTION 5)
- Tags d'action en **gros boutons** `h-12 px-4 text-sm font-medium` (au lieu de `text-xs py-1.5`).
- Tags sélectionnés gardent fond plein coloré (`bg-primary text-primary-foreground`).
- Textarea : placeholder visible « Décrivez l'action que vous avez mise en place... ».
- Bouton « Enregistrer l'action » en **pleine largeur** `w-full h-12 text-base font-bold`.
  Bouton « Réinitialiser » déplacé au-dessus, aligné à droite.
- Titre en `text-lg font-bold` + séparateur `border-b pb-3`.

### 5. Suppression redondance
- Supprimé le bouton « Retour à la liste » en bas de page.
- Seul bouton retour conservé : dans le header sticky (translucide blanc).

### 6. Layout général
- Wrapper : `mx-auto max-w-4xl space-y-4` (était `space-y-6` — trop d'espace).
- Tous les titres de section : `text-lg font-bold` + séparateur visuel `border-b pb-3`.
- Titre « Réponse au client » aussi passé en `text-lg font-bold` + séparateur.

## Logique préservée (aucun changement)
Tous les handlers (`fermerDetail`, `majRetour`, `enregistrerReponse`, `enregistrerAction`,
`appliquerRecommandationsIA`, `supprimerRetour`…), states, effects, appels API
(`/api/pro/coach/recommandation`, `/api/pro/retours`…) sont **strictement identiques**.
Aucune signature de fonction, aucun type, aucun effect modifié.

## Vérifications
- `bunx tsc --noEmit` → **0 erreur** (avec DATABASE_URL fourni).
- `bun run lint` → 0 problème sur `retours-tab.tsx` (erreurs pré-existantes uniquement
  dans `i18n/request.ts`, `scan-view.tsx`, `scratch-card.tsx`, `db.ts` — non concernées).
- Serveur dev (port 3001) :
  - `GET /` → **200**
  - `POST /api/auth/login` (demo@pizzeria.fr/demo1234) → **ok:true**, cookie `fp_session` posé.
  - `GET /dashboard/retours` (authentifié) → **200**
  - (`GET /dashboard/retours` sans auth → 307 redirect /login, comportement attendu du middleware)

## Note pour agents suivants
Le serveur dev ne reste pas vivant en arrière-plan dans ce sandbox (orphan process killer).
Pour vérifier en live : `bash /home/z/feedbackpro/.zscripts/start-dev-3001.sh` en foreground,
ou utiliser le pattern start→curl→kill dans une même commande bash.
La DB est initialisée à `/home/z/feedbackpro/data/feedbackpro.db` (compte démo seedé).
