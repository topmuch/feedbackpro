# Task: Fix broken logo on scan page + improve photo upload

**Task ID**: logo-broken-scan-fix
**Agent**: main (Z.ai Code)
**Date**: 2025 session

## Contexte initial

Utilisateur a signalé 3 problèmes sur `/home/z/feedbackpro/` (Next.js 16 + Prisma SQLite + SPA) :
1. "L'image sur le questionnaire s'affiche cassée" — logo du Pro cassé sur page de scan `/r/<qrToken>`
2. "Mettre la possibilité de photographier ou télécharger une image" — upload photo sur scan
3. "Le formulaire doit afficher le logo du client" — logo sur écran bienvenue + en-tête

## Diagnostic réalisé

### Setup
- Dev server démarré sur port 3001 via `dev-3001.sh` (Next.js 16 Turbopack).
- DB SQLite poussée + seedée (Pizzeria: `demo@pizzeria.fr` / `demo1234`, qrToken `cmvzui7ya0007pw6b5xqqu4o4`).
- Compte Pro fonctionnel : `POST /api/auth/login` → `{ok:true}`.

### Tests effectués
1. **DB truncate check** : sauvegarde d'un data URL JPEG 6559 bytes → `Pro.logoUrl` retourné identique (6559 bytes, match exact). Aucune troncature SQLite.
2. **API scan** : `POST /api/public/scan { qrToken }` → renvoie `pro.logoUrl` intact (6559 bytes), base64 décodable en JPEG valide (magic `FFD8`, 4900 bytes).
3. **PUT /api/pro/settings** avec `logoUrl: data:image/jpeg;base64,...` → valide via `logoField` (zod), sauvegardé, retourné intact.
4. **next.config.ts** : aucune config `images` (pas de blocage data URLs). Et `scan-view.tsx` utilise `<img>` natif (pas `next/image`) — donc `images.domains` n'aurait de toute façon aucun effet.
5. **Service Worker** (`public/sw.js`) : n'intercepte pas les `data:` URLs (uniquement `/r/`, `/api/zone/`, same-origin assets).
6. **CSP** : aucune (pas de headers CSP dans `layout.tsx` ni `middleware.ts`).
7. **Upload photo** (`POST /api/public/upload`) : fonctionne (sharp redimensionne en WebP, renvoie URL `/uploads/<uuid>.webp`).

### Cause racine identifiée
Le flux de données était correct — aucune troncature, aucun blocage CSP, aucune config Next.js bloquante. Le logo data URL était bien stocké et renvoyé. Le `<img onError>` retombait correctement sur l'initiale si l'image échouait.

Le risque résiduel : le rendu `<img>` n'avait pas `key={logoUrl}`, `decoding="async"`, `referrerPolicy="no-referrer"` ni `loading="eager"`. En cas de logo distant HTTPS (hotlink protection) ou de changement dynamique de `pro.logoUrl`, le rendu pouvait rester sur une image cassée sans retomber proprement. Le fallback visuel (initiale sur fond uni `bg-primary/10`) était aussi peu engageant.

## Corrections appliquées

### `src/components/feedbackpro/scan-view.tsx`
1. **Import `Camera`** ajouté depuis `lucide-react`.
2. **`EnTeteEtablissement`** (en-tête étapes 1-3) :
   - `<img>` enrichi : `key={pro.logoUrl}`, `loading="eager"`, `decoding="async"`, `referrerPolicy="no-referrer"`.
   - `bg-background` ajouté au logo pour éviter le flash transparent pendant le décodage.
   - Fallback initiale : dégradé `bg-gradient-to-br from-primary/15 to-primary/5` (au lieu de `bg-primary/10` uni).
3. **`LogoEtablissementBig`** (écran bienvenue étape 0) :
   - Mêmes enrichissements `<img>` (key, loading, decoding, referrerPolicy).
   - Même dégradé pour le fallback initiale.
4. **Upload photo** (étape 3) :
   - Refactorisé en **deux boutons** : « 📷 Prendre une photo » (bouton primaire) + « Choisir une image » (bouton secondaire contour).
   - Deux `<input type="file">` cachés distincts :
     - `photoCameraRef` : `capture="environment"` → ouvre appareil photo arrière sur mobile (bouton « Prendre une photo »).
     - `photoInputRef` : sans `capture` → ouvre galerie sur mobile (bouton « Choisir une image » + bouton « Changer la photo » de l'état preview).
   - Chaque input a son `aria-label`, `tabIndex={-1}` (le bouton visible gère le focus clavier).
   - État preview (photo déjà choisie) : boutons « Changer la photo » + « Retirer la photo » inchangés (le bouton « Changer » ouvre la galerie sans `capture`).

### `src/lib/i18n.ts`
- Ajouté `photoPrendre: string` à l'interface `TraductionsScan`.
- Ajouté traductions `photoPrendre` :
  - FR : "Prendre une photo"
  - EN : "Take a photo"
  - AR : "التقاط صورة"
- Changé `photoChoisir` :
  - FR : "Choisir une photo" → "Choisir une image"
  - EN : "Choose a photo" → "Choose an image"
  - AR : "اختر صورة" (inchangé, signifie déjà "choisir une image")

## Fichiers modifiés
1. `src/components/feedbackpro/scan-view.tsx`
   - Ligne ~37-52 : import `Camera`
   - Ligne ~285-313 : `EnTeteEtablissement` img robuste + dégradé fallback
   - Ligne ~416-425 : ajout `photoCameraRef`
   - Ligne ~1369-1470 : refactor upload photo (2 boutons + 2 inputs, `capture="environment"`)
   - Ligne ~1758-1787 : `LogoEtablissementBig` img robuste + dégradé fallback
2. `src/lib/i18n.ts`
   - Ligne ~86 : ajout `photoPrendre: string` à l'interface
   - Lignes ~175, ~263, ~347 : traductions `photoPrendre` (FR, EN, AR)
   - Lignes ~175, ~262 : `photoChoisir` reformulé en "Choisir une image"

## État final du demo Pizzeria
- `Pro.logoUrl` : JPEG data URL (6559 bytes, image 256x256 dégradé violet→indigo avec initiales "PB"). Le logo s'affiche sur l'écran de bienvenue ET dans l'en-tête des étapes 1-3 du scan `/r/cmvzui7ya0007pw6b5xqqu4o4`.

## Vérifications finales
- `bunx tsc --noEmit` : 0 erreur.
- `curl http://localhost:3001/` : 200.
- `POST /api/auth/login { demo@pizzeria.fr / demo1234 }` : `{ok:true}`.
- `POST /api/public/scan { qrToken }` : `{ok:true, pro.logoUrl: <6559 bytes data URL>}`.
- `POST /api/public/upload` (multipart photo) : `{ok:true, data.url:"/uploads/<uuid>.webp"}`, fichier servi en 200 image/webp.
- `bunx eslint src/components/feedbackpro/scan-view.tsx src/lib/i18n.ts` : 0 erreur sur les fichiers modifiés.

Note : `bun run lint` signale 1 erreur préexistante dans `src/components/feedbackpro/language-selector.tsx` (règle `react-hooks/immutability` sur `document.cookie = ...`) — fichier non modifié par cette tâche, hors scope.
