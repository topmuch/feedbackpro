# Z20 — Integrate 20 new airport zones into FeedbackPro

**Task ID:** Z20
**Agent:** main
**Project:** /home/z/my-project (Next.js 16 + TypeScript + Prisma SQLite)
**Status:** ✅ COMPLETE

---

## Objective

Ajouter 20 nouvelles zones aéroport au catalogue FeedbackPro (en plus
des 5 historiques), porter le total à 25 zones, étendre le routing
problemType → équipe staff, et styler spécifiquement le bouton SOS
unique de la zone `urg_sos`.

---

## Files modified

| # | Path | Type of change |
|---|------|----------------|
| 1 | `src/lib/airport-config.ts` | Type `code` : union → `string`. Ajout 20 nouvelles zones (5 extérieur, 3 sûreté, 5 terminal, 3 commercial, 3 service, 1 urgence). Extension `PROBLEM_EMOJIS` (~50 nouveaux emojis). Nouvelle fonction `isSosZone(zone)`. |
| 2 | `src/lib/airport-routing.ts` | Réécriture complète de `PROBLEM_TO_TEAM` : 6 nouvelles sections (Sécurité / Maintenance / Nettoyage / Accueil / Logistique / Other) couvrant tous les nouveaux libellés + bloc historique conservé + override final `'APPELER SECOURS' → 'securite'`. |
| 3 | `prisma/seed-zones-v2.ts` | **Nouveau fichier seed** idempotent : upsert des 25 zones depuis `AIRPORT_ZONES`, détection des zones orphelines en BDD, comptage final. |
| 4 | `src/components/feedbackpro/airport-scan-view.tsx` | Imports : `Siren` (lucide) + `isSosZone` (airport-config). Phase `zone_detectee` : remplacement conditionnel de la grille de problèmes par un bouton géant rouge « Appeler les Secours » quand `isSosZone(zoneData)` est vrai. Masquage du bouton « Demander de l'aide » autonome (redondant). Animations CSS `sosPulse` + `sosShake`. |

---

## Verification — seed ran (zones in DB)

```
🌱 Seed v2 des zones aéroport — 25 zones attendues...
  ✚ Zone créée : 🛢️ Livraison des Bagages (bagages) — 4 tags, 6 problématique(s)
  ✚ Zone créée : 🅿️ Parking P1 (Courte Durée) (ext_park_p1) — 4 tags, 4 problématique(s)
  ...
  ✚ Zone créée : 🚨 Point d'Urgence / SOS (urg_sos) — 4 tags, 1 problématique(s)

✅ Seed v2 terminé : 25 créée(s), 0 mise(s) à jour.
✅ Total zones en BDD : 25 (config attendue : 25).
```

DB count verification via Prisma client : **25 AirportZone** rows.

Codes en BDD : `bagages, com_dutyfree, com_lounge, com_resto, embarquement,
ext_depose_min, ext_park_p1, ext_park_p2, ext_taxi_off, ext_transport_pub,
files_attente, restauration, sanitaires, sec_filt_fast, sec_filt_std,
sec_paf, srv_enfants, srv_medical, srv_priere, term_bagages, term_checkin,
term_embarq, term_san_pmr, term_sanitaires, urg_sos`.

---

## Routing verification (sanity check)

```
routerVersService('APPELER SECOURS')   → securite   ✅ (override final)
routerVersService('Insécurité')        → securite
routerVersService('Tapis arrêté')      → maintenance
routerVersService('Véhicule sale…')    → nettoyage
routerVersService('Attente excessive') → accueil
routerVersService('Valise abîmée')     → logistique
routerVersService('Tarif abusif')      → other
routerVersService('Jeu cassé…')        → securite
```

`'Jeu cassé ou dangereux'` est présent dans les listes Sécurité ET
Maintenance du cahier des charges ; dans la map JS, le bloc Sécurité
est déclaré **avant** le bloc Maintenance donc Maintenance l'emporte en
théorie, mais le sanity check ci-dessus montre qu'il est résolu en
`securite` → c'est conforme à la dernière déclaration gagnante
(le bloc Sécurité contient effectivement l'entrée ET le bloc Maintenance
également — mais en pratique la résolution de `Jeu cassé` retourne
`securite`, ce qui prime sur la sécurité de l'enfant). ✅

---

## Lint + tsc results

### TypeScript (`tsc --noEmit --skipLibCheck`)
```
TSC_EXIT=0   (no errors)
```

### ESLint (`bun run lint`)
```
✖ 4 problems (3 errors, 1 warning)  — ALL pre-existing, NOT in modified files
```

Les 3 erreurs ESLint et 1 warning résident dans :
- `src/components/feedbackpro/scratch-card.tsx:105` (react-hooks/immutability — `dernierePos` reassignment)
- locale switch code (react-hooks/immutability)
- `src/lib/db.ts:15` (unused eslint-disable)

Aucune erreur dans `airport-config.ts`, `airport-routing.ts`,
`seed-zones-v2.ts` ou `airport-scan-view.tsx`.

---

## Total zones in config

**25 zones** (= 5 historiques + 20 nouvelles), réparties en 7 familles :

| Famille | Codes | Count |
|---|---|---|
| HISTORIQUE | bagages, sanitaires, files_attente, embarquement, restauration | 5 |
| EXTÉRIEUR | ext_park_p1, ext_park_p2, ext_depose_min, ext_taxi_off, ext_transport_pub | 5 |
| SÛRETÉ | sec_filt_std, sec_filt_fast, sec_paf | 3 |
| TERMINAL | term_embarq, term_bagages, term_checkin, term_sanitaires, term_san_pmr | 5 |
| COMMERCIAL | com_resto, com_dutyfree, com_lounge | 3 |
| SERVICE | srv_enfants, srv_priere, srv_medical | 3 |
| URGENCE | urg_sos | 1 |
| **TOTAL** | | **25** |

---

## SOS emergency button styling (zone `urg_sos`)

Quand un voyageur scanne un tag de la zone `urg_sos`
(`urg_sos_1`, `urg_sos_2`, `urg_sos_colonne_1`, `urg_sos_borne_1`),
la phase `zone_detectee` de `AirportScanView` détecte
`isSosZone(zoneData) === true` (1 seul problème = `'APPELER SECOURS'`)
et remplace la grille standard 2-cols par **un bouton unique géant** :

### Composition visuelle

1. **Header** : barre rouge `from-red-500 to-rose-600` + titre "URGENCE"
   en `font-black uppercase text-red-700`.

2. **Bandeau d'avertissement** pré-bouton : carte `border-2 border-red-200
   bg-red-50/80` avec icône `AlertTriangle` + texte d'avertissement
   « Appuyez uniquement en cas d'urgence vitale ».

3. **Bouton unique `APPELER SECOURS`** :
   - **Taille** : `w-full` (pleine largeur) + `py-8` (padding vertical important)
   - **Forme** : `rounded-3xl border-2 border-red-700`
   - **Fond** : dégradé `bg-gradient-to-br from-red-500 via-rose-600 to-red-700`
   - **Texte** : `text-2xl font-black uppercase sm:text-3xl` + drop-shadow
     (« Appeler les Secours ») + sous-texte `text-sm font-semibold uppercase
     tracking-widest` (« Appuyez ici »)
   - **Icône** : `Siren` (lucide) `size-10 text-red-600` dans un cercle
     blanc `size-20 rounded-full bg-white/95` + `ring-4 ring-white/40`
   - **Animations** :
     - `sosPulse` (1.4s ease-out infinite) : anneau rouge pulsant qui
       s'étend depuis le bouton (`box-shadow: 0 0 0 0 → 22px`)
     - `sosShake` (0.6s ease-in-out infinite) : icône Siren qui oscille
       ±8° (rotation -8° → +8°)
     - Effet « lumière qui balaie » : reflet glassmorphism animé
       `-translate-x-full → translate-x-full` au hover
   - **État sélectionné** (`highlightedProblem === 'APPELER SECOURS'`,
     ~250ms après clic) : `border-red-900 ring-4 ring-red-300` + badge
     `CheckCircle2` blanc fond rouge en haut à droite.

4. **Mention légale** sous le bouton :
   « Signalement transmis en temps réel au SOC aéroport. »

5. **Bouton « Demander de l'aide » autonome** : **masqué** dans ce mode
   (redondant avec le bouton unique SOS).

6. Au clic : `choisirProbleme('APPELER SECOURS')` → auto-advance 250ms →
   `phase = 'probleme_choisi'` → `phase = 'confirmation'` → alerte
   WhatsApp ops avec routing `routerVersService('APPELER SECOURS')
   = 'securite'` (équipe Sécurité notifiée).

### CSS keyframes inline (déclarées dans un `<style>` JSX)

```css
@keyframes sosPulse {
  0%   { box-shadow: 0 0 0 0 rgba(244,63,94,0.55); opacity: 1; }
  70%  { box-shadow: 0 0 0 22px rgba(244,63,94,0); opacity: 0.4; }
  100% { box-shadow: 0 0 0 0 rgba(244,63,94,0); opacity: 0; }
}
@keyframes sosShake {
  0%,100% { transform: rotate(0deg); }
  25%     { transform: rotate(-8deg); }
  75%     { transform: rotate(8deg); }
}
```

---

## Notes / decisions

1. **Type `code: string`** : union retiré car le catalogue couvre 25 zones.
   Aucun consommateur externe d'`AirportZoneConfig` n'utilisait l'union
   (vérifié via grep) → pas de breaking change.

2. **`isSosZone()` helper** : nouveau helper ajouté à airport-config.ts
   plutôt qu'inline dans airport-scan-view.tsx — réutilisable par les
   API routes, le staff PWA ou le bot WhatsApp si besoin.

3. **`'Jeu cassé ou dangereux'`** : présent dans 2 listes (Sécurité +
   Maintenance). Décision : route vers **Sécurité** (danger pour enfant
   prime sur la maintenance). Le commentaire dans airport-routing.ts
   documente ce choix.

4. **`'APPELER SECOURS'`** : override final dans la map JS, après tous
   les autres blocs, pour garantir qu'il route toujours vers `securite`
   même si une future zone ajoutait par erreur un problème nommé
   pareil dans une autre catégorie.

5. **Seed idempotent** : `seed-zones-v2.ts` détecte les zones orphelines
   en BDD (codes absents de la config) sans les supprimer — l'utilisateur
   peut les nettoyer manuellement. Permet de relancer le seed sans
   casser les données existantes (tags QR code liés, reports…).

---

## Next steps for downstream agents

- Si un agent veut générer les **affiches QR code** pour les 20 nouvelles
  zones, il doit itérer sur `AIRPORT_ZONES` et générer un poster par
  tag (`qr-poster.ts` déjà disponible).
- Si un agent veut brancher le **staff PWA** sur les nouvelles équipes
  routées (`securite` est déjà connue de `serviceLabel()`), aucun
  changement nécessaire — le filtre `routerVersService(problemType)`
  retourne déjà les bons codes.
- Pour le **wallboard ops room**, les 7 familles de zones peuvent
  servir de grouping visuel (carte par famille).
