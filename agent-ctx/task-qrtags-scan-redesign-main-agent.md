# Task : Refonte du questionnaire scan dans le style QRTags

**Task ID** : qrtags-scan-redesign
**Agent** : main (Z.ai Code)
**Date** : session en cours
**Projet** : `/home/z/feedbackpro/` (Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Prisma SQLite)

## Contexte

L'utilisateur a demandé une refonte du composant `src/components/feedbackpro/scan-view.tsx` pour
s'inspirer du design QRTags (https://qrtags.pro/inscrire) : wizard à étapes plein écran sur fond
coloré, cards blanches avec border noir, indicateur d'étape "ÉTAPE X SUR Y — SUJET", bouton
"Suivant" en bas plein largeur.

Le composant existant était un questionnaire "premium" mobile (cards glassmorphism, gradients
violet/bleu). Toute la logique métier devait être préservée (fetch, state, effets, i18n, upload
photo, Background Sync offline).

## Choix de design appliqués

- **Fond plein écran bleu FeedbackPro #2563EB** (`bg-blue-600`) — choix par défaut confirmé par
  l'utilisateur dans la spec.
- **Étape 1 (note)** : fond vire au vert (`bg-emerald-600`) si 4-5★, au rouge (`bg-rose-600`) si
  1-3★ — transition douce 500 ms.
- **Étape success (positif)** : fond `bg-emerald-600` (confettis).
- **Cards** : `bg-white text-gray-900 border-2 border-gray-900 rounded-2xl` ; état sélectionné
  inversé `bg-gray-900 text-white`.
- **4 étapes** au lieu de 3 (ajout d'une nouvelle étape `step4` pour le récapitulatif + envoi) :
  - `welcome` (auto 2s) → `step1` (note, auto 500ms) → `step2` (tags) → `step3` (commentaire +
    photo + NPS + email + geo consent) → `step4` (récap + envoi) → `success` (remerciement)
- **Indicateur d'étape** : `ÉTAPE {n} SUR 4 — {SUJET}` (VOTRE NOTE / DÉTAILS / COMMENTAIRE / ENVOI).
- **Barre de progression** : 4 segments fins (h-1) en bas de page, segment actif blanc sur fond
  blanc/25.
- **Bouton "Suivant"** : `bg-white text-blue-600 font-bold py-4 text-lg rounded-2xl w-full`,
  désactivé (`opacity-50 cursor-not-allowed`) si aucune sélection.
- **Bouton "Retour"** : discret en haut à gauche, `text-white/70 hover:text-white`.
- **i18n préservé** : FR / EN / AR (avec dir="rtl" pour l'arabe). Toutes les nouvelles chaînes
  ("ÉTAPE X SUR Y", "Suivant", sujets, titres H1, récap) ont été ajoutées aux 3 langues.

## Fichiers modifiés

### 1. `src/lib/i18n.ts`
- Ajout de 17 nouvelles clés à l'interface `TraductionsScan` :
  - `etapeSur(n, total, sujet)`, `sujetNote`, `sujetDetails`, `sujetCommentaire`, `sujetEnvoi`
  - `titreNoteH1`, `sousTitreNote`, `titreTagsPositif`, `titreTagsNegatif`, `sousTitreTagsH1`
  - `titreCommentaireH1`, `sousTitreCommentaire`, `titreEnvoiH1`, `sousTitreEnvoi`
  - `suivant`, `recapVotreNote`, `recapVotreCommentaire`, `recapAucunCommentaire`,
    `recapPhotoAjoutee`, `recapPersonnelAjoute`, `recapNps`, `recapModifier`, `etoileLabel(n)`
- Traductions ajoutées pour les 3 langues (FR / EN / AR).

### 2. `src/app/globals.css`
- Ajout de 3 nouvelles keyframes/classes pour le wizard QRTags :
  - `fp-scan-card-pop` : pop au clic d'une card (scale 1 → 0.94 → 1, 320 ms)
  - `fp-scan-fade-up` : apparition fade-in + slide-up (400 ms)
  - `fp-scan-bar-grow` : barre de progression (scaleX 0 → 1, 400 ms, origin left, RTL-aware)
- Ajout du styling scrollbar discret `.fp-scan-scroll` (curseur blanc/35 sur fond bleu, 6 px de
  large) pour les listes scrollables des étapes 2, 3, 4.
- Mise à jour du bloc `@media (prefers-reduced-motion: reduce)` pour inclure les 3 nouvelles
  classes.

### 3. `src/components/feedbackpro/scan-view.tsx`
Refonte MINEURE du code (logique préservée à 100 %) et MAJEURE du JSX/CSS.

**Logique préservée intégralement** :
- Toutes les imports (sauf `Skeleton` retiré car plus utilisé)
- Types `ScanData`, `Phase` (ajout de `"step4"`), `CanalEnvoi`
- Constantes `EMOJIS_NOTE`, `COULEURS_CONFETTI`, `MAX_COMMENTAIRE`
- Utilitaires `definitionTag`, `phraseAccroche`
- State du composant `ScanView` : langue, phase, sens, scanData, erreurScan, note, tags,
  personnel, commentaire, emailClient, nps, photoUrl, photoEnCours, photoErreur, photoInputRef,
  photoCameraRef, pulse, survol, soumission, dernierCanal, erreurEnvoi, recompenseGagnee,
  codeRecompense, geoConsent, horsLigne, timerRef
- Tous les useEffect (cleanup timer, détection langue, auto-transition welcome, clean tags
  employés)
- Toutes les fonctions métier : `changerLangue`, `chargerScan`, `allerEtape`, `annulerTimer`,
  `passerAuStep1`, `choisirNote`, `etoileClavier`, `basculerTag`, `onPhotoChoisie`, `envoyer`
- Toutes les API calls : `POST /api/public/scan`, `POST /api/public/retour`, `POST /api/public/upload`
- Background Sync (import dynamique `@/lib/offline-sync`, `stockerRetourOfflineLocal`)
- WhatsApp message building (`buildWhatsAppMessage`)
- Avis Google (D8) si `pro.googleReviewUrl` défini et note ≥ 4★
- Récompense (code promo dévoilé APRÈS envoi effectif)

**Nouveau composant ajouté** : `LogoPetit({ pro, zone })` — petit logo 40 px + nom établissement
+ nom zone, sur fond bleu (logo cadré blanc, texte blanc). Utilisé en en-tête des étapes 1 à 4
à la place de l'ancien `EnTeteEtablissement` (supprimé car plus utilisé).

**Composants modifiés** :
- `SelecteurLangue` : relooké QRTags (border-white/30, bg-white/15, text-white). Menu déroulant
  blanc classique pour la lisibilité.
- `EcranChargement` : relooké QRTags (fond `bg-blue-600`, spinner blanc, libellé blanc/80).
  Suppression du skeleton (plus adapté au fond bleu plein écran).
- `LogoEtablissementBig` : relooké QRTags (logo cadré `border-2 border-white bg-white`, fallback
  initiale sur fond blanc avec texte bleu).

**Refonte du return JSX** :
- Conteneur racine : `min-h-dvh flex flex-col text-white transition-colors duration-500` + classe
  de fond dynamique (`fondGlobal` : bg-blue-600 / bg-emerald-600 / bg-rose-600).
- Top bar (welcome + steps 1-4) : bouton "Retour" discret à gauche (steps 1-4) + SelecteurLangue
  + bouton Quitter (X) à droite.
- Main centré verticalement : `flex flex-1 flex-col` avec `key={phase}` pour rejouer
  l'animation CSS de transition (`fp-scan-slide-right` / `fp-scan-slide-left`).
- Footer (steps 1-4) : barre de progression 4 segments + bouton "Suivant" (steps 2-3) ou bloc
  "Envoyer" + WhatsApp + avis Google (step 4).
- Footer success : bouton "Fermer" + avis Google (si applicable).
- Pied "Propulsé par FeedbackPro" discret sur welcome + error.

**Étapes rendues** :
- `error` : card centrée, bouton "Réessayer" blanc sur bleu, "Retour à l'accueil" discret.
- `welcome` : cascade d'apparition (logo / nom / séparateur / phrase / tap-to-start) inchangée
  mais relookée sur fond bleu plein.
- `step1` (note) : 5 cards emoji en `grid-cols-5` (😡 😕 😐 😊 🤩) + label "N étoile(s)",
  h-24 sm:h-28 (touch target ≥ 96 px). Auto-transition 500 ms vers step2.
- `step2` (tags) : grid `grid-cols-2 sm:grid-cols-3` de cards emoji + label, groupées par
  pilier (v2) ou plates (fallback). Section "Comportement de l'employé" si déclencheur.
- `step3` (commentaire) : textarea blanc + compteur + slider NPS (si positif) + 2 boutons
  photo côte à côte (Prendre / Choisir) + email + geo consent + teaser récompense.
- `step4` (NOUVELLE étape — récap + envoi) : card blanche avec note + tags + personnel +
  commentaire + photo + NPS + email, boutons "Modifier" pour revenir à chaque étape. Bouton
  "Envoyer" plein largeur + WhatsApp + avis Google dans le footer.
- `success` : coche animée (positif) ou cœur pulsé (négatif) + "Merci" H1 + reward card avec
  code promo + bouton "Fermer".

## Vérifications finales

- `bunx tsc --noEmit` : **0 erreur**.
- `bunx eslint src/components/feedbackpro/scan-view.tsx src/lib/i18n.ts` : **0 erreur, 0 warning**.
- `bun run lint` : 1 erreur préexistante dans `language-selector.tsx` (règle
  `react-hooks/immutability` sur `document.cookie`) + 1 warning préexistant dans `lib/db.ts`
  (unused eslint-disable). Aucune de ces erreurs n'est dans les fichiers modifiés par cette tâche.
- `curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/` : **200** (32 ms).
- `curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/r/cmvzw3edl0007pwythi5n6bkg` :
  **200** (35-40 ms).
- `curl -sS -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d
  '{"email":"demo@pizzeria.fr","password":"demo1234"}'` : **`{"ok":true,...}`** (HTTP 200).
- `curl -sS -X POST http://localhost:3001/api/public/scan -H "Content-Type: application/json" -d
  '{"qrToken":"cmvzw3edl0007pwythi5n6bkg"}'` : **`{"ok":true,"data":{...}}`** (HTTP 200, renvoie
  zone + pro + tagsPositifs + tagsNegatifs + macroSecteur + piliers + tagsEmployes).

## Test fonctionnel end-to-end (agent-browser)

Test complet du flux sur `/r/cmvzw3edl0007pwythi5n6bkg` (Pizzeria Bella Napoli, zone Accueil) :

1. **Welcome** : logo + "BIENVENUE CHEZ" + nom établissement + zone + phrase d'accroche +
   "Touchez pour commencer 👆" pulsé. ✓
2. **Step 1** (après clic welcome) : "ÉTAPE 1 SUR 4 — VOTRE NOTE" + H1 + 5 cards emoji
   (1★ à 5★) + barre de progression 1/4. ✓
3. **Step 2** (après clic 4★ + auto-transition 500 ms) : fond vire au vert (emerald-600) +
   "ÉTAPE 2 SUR 4 — DÉTAILS" + "🎉 Qu'avez-vous apprécié ?" + 4 tags groupés par pilier +
   champ personnel + bouton "Suivant" (désactivé tant qu'aucun tag). ✓
4. **Step 3** (après clic tag + Suivant) : "ÉTAPE 3 SUR 4 — COMMENTAIRE" + textarea + compteur
   500 + slider NPS (positif) + 2 boutons photo + email + geo consent + teaser récompense +
   bouton "Suivant" activé. ✓
5. **Step 4** (NOUVELLE étape, après Suivant) : "ÉTAPE 4 SUR 4 — ENVOI" + card récap blanche
   avec note 4/5 + tag "Très accueillant" + commentaire "Aucun" + NPS 8/10 + boutons "Modifier"
   + bouton "Envoyer" + WhatsApp. ✓
6. **Success** (après clic Envoyer) : "🙏 Merci pour votre retour !" + reward card avec code
   promo "CAFE-OFFERT" dévoilé + bouton "Fermer". ✓

Test flow négatif (1★) :
- Fond vire au rouge (rose-600) à la step1 après clic 1★.
- Step 2 affiche "😔 Qu'est-ce qui n'a pas été ?" + tags négatifs + section "Comportement de
  l'employé" visible (note ≤ 2★ = déclencheur). ✓

Test i18n :
- Switch FR → EN : "BIENVENUE CHEZ" → "WELCOME TO", "ÉTAPE 1 SUR 4 — VOTRE NOTE" → "STEP 1 OF
  4 — YOUR RATING", "Suivant" → "Next", etc. ✓
- Switch EN → AR : dir="rtl" appliqué, chaînes traduites en arabe. ✓

## Note

La signature du composant est préservée :
`export function ScanView({ token, onExit }: { token: string; onExit: () => void })`.

Le contrat API est préservé :
- `POST /api/public/scan` : payload `{ qrToken }` inchangé.
- `POST /api/public/retour` : payload `{ qrToken, note, tags[], commentaire?, personnelMentionne?,
  emailClient?, canalChoisi?, geoConsent?, nps?, photoUrl? }` inchangé.
- `POST /api/public/upload` : multipart `photo` inchangé.

Aucun git commit/push effectué (conforme à la consigne).
