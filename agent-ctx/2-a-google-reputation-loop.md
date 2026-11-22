# Task 2-a — Boucle de réputation Google Reviews

Agent : google-reputation-loop · Date : session en cours · Statut : TERMINÉ

## Périmètre

Rediriger les clients satisfaits (≥ 4★) vers un avis Google public et donner
à l'établissement le contrôle de cette URL (champ + interrupteur dans les
paramètres Pro, exposition au flux public, carte CTA post-retour).

## Fichiers modifiés (8)

1. `prisma/schema.prisma` — modèle `Pro` : ajout de
   `googleReviewEnabled Boolean @default(true)` (bloc commentaire Task 2-a
   documentant `googleReviewUrl` + `googleReviewEnabled`). `googleReviewUrl
   String?` existait déjà (D8) — conservé tel quel. **db:push volontairement
   NON exécuté** (réservé à l'orchestrateur).
2. `src/lib/validation.ts` — `settingsSchema` : `googleReviewUrl` resserré en
   https-only (`https://` obligatoire si fournie, max 500 chars, `""` = suppr)
   + nouveau champ optionnel `googleReviewEnabled: z.boolean().optional()`
   (absent = ne pas modifier). La base ne contenait aucune URL http:// →
   aucun risque de casse sur données existantes (vérifié en SQL).
3. `src/app/api/pro/settings/route.ts` (PUT) — persiste `googleReviewEnabled`
   via spread conditionnel (même pattern que `smsAlertes`/`webhook*`) ;
   `googleReviewUrl` persisté comme avant ; header doc mis à jour.
4. `src/lib/session.ts` — `ProData` + `serializePro` : expose
   `googleReviewEnabled` (lecture défensive `?? true` pour la migration —
   pattern identique à `whiteLabel`). Le dashboard Pro reçoit donc la valeur
   via `session.pro` après PUT (source de vérité du formulaire).
5. `src/app/api/zone/[qrToken]/route.ts` (GET) — payload `pro` étendu (additif,
   contrat v1 préservé) avec `googleReviewUrl` + `googleReviewEnabled`
   (défensif, défaut true). `/api/public/scan` (réservé orchestrateur) NON
   touché : il expose déjà `googleReviewUrl` ; le client traite l'absence du
   flag comme "activé".
6. `src/lib/i18n.ts` — interface + fr/en/ar : nouvelles clés
   `avisGoogleTitre` (« Votre expérience vous a plu ? »),
   `avisGoogleSousTexte` (« Un avis Google nous aide énormément. Merci ! ») ;
   `avisGoogle` FR aligné sur la wording mission « Laisser un avis Google ».
7. `src/components/feedbackpro/scan-view.tsx` — CTA post-retour :
   - condition : `estPositif (note ≥ 4)` && `googleReviewEnabled !== false`
     && `googleReviewUrl` — carte rendue UNIQUEMENT en `phase === "success"`
     (après envoi réussi ou file d'attente offline) ;
   - les 2 liens pré-envoi D8 (footers "recap" et "step4") ont été SUPPRIMÉS
     (mission : jamais avant la confirmation d'envoi) ;
   - carte Hyer : `rounded-none` hairline Pebble `#d5d3d4`, p-4, zéro ombre,
     titre 17px encre, sous-texte ash `#8e8e95`, bouton pill `rounded-full`
     encre `#000d10` (h-12 = 48px ≥ 44px) avec icônes lucide `Star` +
     `ArrowRight`, `target="_blank" rel="noopener noreferrer"` ;
   - règle « une note clay par page » respectée : l'écran de succès a déjà
     sa note clay (titre gradient + confettis `#bc7155`) → bouton encre ;
   - URL absente ou flag désactivé → rien ne s'affiche ;
   - type `ScanData.pro.googleReviewEnabled?: boolean` (absent = true).
8. `src/components/feedbackpro/settings-tab.tsx` — section « Réputation
   Google » (remplace la carte D8 « Google Business Profile ») : Input URL
   (placeholder Google Maps), Switch « CTA avis Google sur le scan client »
   (label 17px), rangée de statut (actif / désactivé + lien « Tester »),
   bouton « Enregistrer » dédié réutilisant `saveSettings` (signature passée
   à `e?: React.FormEvent`) → même appel PUT + toast « Paramètres
   enregistrés ✓ ». Style : carte carrée hairline `rounded-none shadow-none`.

## Non modifié (contraintes respectées)

public/sw.js, src/lib/offline-sync.ts, src/app/api/auth/**,
src/app/api/public/**, src/app/api/demo/**, landing-hyer.tsx,
voice-demo-nathalie.tsx. Le flux airport (airport-scan-view + /api/airport/
zone/[tag], Task 3-C) volontairement non touché — hors périmètre 2-a.

## QA pour l'orchestrateur

1. `bun run db:push` (colonnes `googleReviewEnabled` créées + client Prisma
   régénéré ; les lectures défensives `?? true` rendent le code compatible
   avant/après push).
2. QA dashboard Pro : Paramètres → « Réputation Google » → saisir une URL
   https, basculer le switch, « Enregistrer » → toast + rechargement session.
   Rejeter une URL `http://…` (doit renvoyer 400 « URL invalide (doit
   commencer par https://) »).
3. QA scan client : scan QR → retour 4★ ou 5★ → écran succès → carte
   « Votre expérience vous a plu ? » + bouton pill encre ouvrant l'URL dans
   un nouvel onglet. Vérifier : 1-3★ → pas de carte ; toggle OFF → pas de
   carte ; URL vide → pas de carte ; aucune carte avant l'écran succès
   (étapes note/tags/commentaire/envoi).
4. Lint/tsc déjà verts au moment du commit : `bun run lint` 0 erreur,
   `bunx tsc --noEmit` exit 0.
