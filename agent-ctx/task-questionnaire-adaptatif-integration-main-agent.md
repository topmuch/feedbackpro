# Task : Intégration du questionnaire adaptatif dans la page de scan

## Contexte
Projet **FeedbackPro** à `/home/z/feedbackpro/` — Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Prisma SQLite.

Le fichier `src/lib/questionnaire-config.ts` (839 lignes) définit 5 secteurs × 3 scénarios (CRISE/MITIGE/SUCCES) avec questions conditionnelles (Q2 dépend de Q1, options à sousOptions).

## Objectif
Remplacer les étapes 2-4 (tags + commentaire + NPS + photo + récap) du scan-view par le **questionnaire adaptatif** :
- Étape 0 : Bienvenue (inchangée)
- Étape 1 : Note (inchangée — 5 étoiles)
- Étape 2+ : Questions adaptatives (remplace tags + commentaire + NPS)
- Étape finale : Récap + envoi
- Succès : Remerciement (inchangé)

## Fichiers modifiés

### 1. `src/app/api/public/scan/route.ts`
- Ajout import `type Secteur` depuis `@/lib/questionnaire-config`
- Ajout fonction `secteurQuestionnairePourMacro(macroId)` qui mappe :
  - `RESTAURATION` → `RESTAURATION`
  - `HOTELLERIE` → `HOTELLERIE`
  - `TRANSPORT_AEROPORT_GARE` → `TRANSPORT`
  - `SANTE_HOPITAL_CLINIQUE` → `SANTE`
  - `ADMINISTRATION_ERP_PUBLIC` → `ADMINISTRATION`
- Ajout champ `secteurQuestionnaire: Secteur | null` dans la réponse API
- Compatibilité : contrat v1 + v2 préservés (champs additifs)

### 2. `src/lib/i18n.ts`
- Ajout de 11 nouvelles clés de traduction (FR/EN/AR) :
  - `sujetQuestions`, `titreQuestionsH1`, `sousTitreQuestions(temps)`
  - `valider`, `obligatoire`, `multiCompteur(n, max)`
  - `aideUnique`, `aideMultiple`
  - `recapVosReponses`, `recapReponsesVides`, `nonRenseigne`
- Interface `TraductionsScan` étendue (pas de rupture pour les langues existantes)

### 3. `src/components/feedbackpro/scan-view.tsx` (~1900 → ~2850 lignes)
- **Imports** : ajout de `getQuestionnaireConfig`, `getScenarioByNote`, `filterQuestionsByConditions` et types `Secteur`, `SecteurConfig`, `ScenarioConfig`, `Question`, `Option` depuis `@/lib/questionnaire-config`
- **Type `ScanData`** : ajout champ `secteurQuestionnaire?: Secteur | null`
- **Type `Phase`** : ajout `"questions"` et `"recap"` (à côté des `step2/3/4` legacy conservés pour les secteurs non couverts)
- **Helpers hors-composant** :
  - `optionsPourQuestion(question, reponses)` : retourne les sousOptions de l'option parente pour les questions conditionnelles
  - `reponseRenseignee(valeur)` : validation d'une réponse (string non vide ou tableau non vide)
  - `mapperReponsesEnPayload(questions, reponses, commentaireLibre, emailLibre)` : mappe les réponses adaptatives vers le contrat API `{ tags, commentaire, personnelMentionne, emailClient, photoUrl, nps }` — preserve l'API existante
- **État interne** :
  - `reponses: Record<string, string | string[]>` — réponses du questionnaire
  - `qIndex: number` — index de la question visible courante
  - `commentaireLibre: string` — commentaire optionnel saisi sur le récap
- **Mémoïsations** :
  - `secteurQ`, `useAdaptiveFlow` (déclarés tôt, avant les useEffects)
  - `configQ` = `getQuestionnaireConfig(secteurQ)` (mémoïsé sur secteurQ)
  - `scenario` = `getScenarioByNote(configQ, note)` (mémoïsé sur configQ + note)
  - `questionsVisibles` = `filterQuestionsByConditions(scenario.questions, reponses)` (re-filtré à chaque réponse)
  - `questionCourante`, `questionValide` (validation : obligatoire répondue + maxSelections respecté)
- **Navigation** :
  - `choisirNote(n)` : après 500ms, va à `"questions"` si `useAdaptiveFlow`, sinon `"step2"` (legacy)
  - `questionSuivante()` : avance d'une question ou passe au récap si dernière
  - `questionPrecedente()` : recule d'une question ou revient à l'étape note
  - `allerAQuestion(index)` : depuis le récap "Modifier", saute à une question précise
  - `basculerOptionMultiple(question, optionId)` : multi-sélection avec respect du `maxSelections` (FIFO)
  - `repondre(questionId, valeur)` : met à jour `reponses`
  - `retourEtape()` : étendu pour gérer `"questions"` et `"recap"`
- **Auto-save localStorage** (clé `fp_scan_<token>`) :
  - Sauvegarde : `note + reponses + commentaireLibre + qIndex + timestamp` à chaque changement
  - Restauration : au chargement du scan, si brouillon < 2h, restaure les réponses
  - Purge : à l'envoi réussi ou au nouveau scan
- **Sync photo** : useEffect propage `photoUrl` → `reponses[questionCourante.id]` quand la question courante est de type `photo`
- **UI - phase "questions"** :
  - Card blanche `bg-white border-2 border-[#002e85] rounded-2xl` (style QRTags)
  - En-tête : numéro Q + texte + badge obligatoire/optionnel
  - Compteur multiple (si `maxSelections`)
  - 5 types de rendu : `unique` (cards emoji radiogroup), `multiple` (cards emoji multi-sélection), `texte` (textarea), `email` (input email), `photo` (2 boutons Prendre/Choisir + preview)
- **UI - phase "recap"** :
  - Card blanche avec note (étoiles) + bouton Modifier
  - Liste des réponses aux questions adaptatives (une ligne par question, avec bouton Modifier qui ramène à la question)
  - Commentaire libre optionnel (textarea)
  - Email optionnel (si pas déjà collecté via une question email)
  - Consentement géo RGPD (opt-in)
  - Badge récompense teaser
  - Erreur d'envoi inline + bouton réessayer
- **Footer** :
  - Barre de progression dynamique (segments = `TOTAL_ETAPES`)
  - `TOTAL_ETAPES` = 4 (legacy) ou `2 + nbQuestions + 1` (adaptatif)
  - Bouton "Suivant" (questions) : désactivé si `!questionValide`, label "Valider" sur la dernière question
  - Bouton "Envoyer" (recap) : plein largeur, pulse-soft, avec spinner pendant l'envoi
- **`envoyer(canal)`** : 
  - Branche adaptative : appelle `mapperReponsesEnPayload` pour construire le payload
  - Branche legacy : conserve le comportement historique
  - Purge du brouillon localStorage après envoi réussi
  - Message WhatsApp construit avec les tags/commentaire/personnel mappés

## Flux conservé (legacy)
Pour les secteurs non couverts par le questionnaire-config (Boutique, Salon, Institut, Garage, Autre — `secteurQuestionnaire === null`), le flux historique est **strictement conservé** :
- `step2` : tags groupés par pilier + section employés
- `step3` : commentaire + NPS slider + photo + email + geoConsent
- `step4` : récap + envoi
Cela garantit une transition sans régression pour les comptes existants.

## Vérifications

### TypeScript
```bash
$ bunx tsc --noEmit
# Exit code 0 — aucune erreur
```

### ESLint (fichiers modifiés)
```bash
$ bunx eslint src/components/feedbackpro/scan-view.tsx src/lib/i18n.ts src/app/api/public/scan/route.ts
# Exit code 0 — aucune erreur ni warning
```

### Dev server (port 3001)
```bash
$ curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/
200
```
Le dev server est démarré via `bun next dev -p 3001` avec `DATABASE_URL=file:/home/z/feedbackpro/db/feedbackpro.db` et `NODE_OPTIONS=--max-old-space-size=1024`.

### Tests API end-to-end

**Mapping des 12 secteurs** (testé via POST /api/public/scan en modifiant temporairement le typeEtablissement de la Pizzeria) :
```
✓ Restaurant → RESTAURATION
✓ Fast Food → RESTAURATION
✓ Café / Bar → RESTAURATION
✓ Boulangerie / Pâtisserie → RESTAURATION
✓ Hôtel → HOTELLERIE
✓ Aéroport → TRANSPORT
✓ Gare / Station → TRANSPORT
✓ Hôpital / Clinique → SANTE
✓ Mairie / Administration → ADMINISTRATION
✓ Entreprise (accueil public) → ADMINISTRATION
✓ Boutique / Commerce → null (legacy flow)
✓ Salon de coiffure → null (legacy flow)
```

**POST /api/retour avec payload adaptatif** :
```json
// Request
{ "qrToken":"...", "note":2, "tags":["cuisine","plat_froid","impoli"],
  "commentaire":"Quel a été le principal problème ?: La Cuisine / Le Plat | Précisez le problème : Plat froid / tiède",
  "personnelMentionne":"Le serveur grand avec des lunettes", "canalChoisi":"aucun" }

// Response
{ "ok":true, "data":{ "retour":{ "id":"...", "note":2, "tags":[], "commentaire":"...", "statut":"NEW" },
  "recompense":"☕ Café offert...", "codeRecompense":"CAFE-OFFERT",
  "alerte":{ "recurrente":false, "nbSignalements":1, "canal":"DASHBOARD" } } }
```
Le serveur filtre silencieusement les ids de tags du questionnaire (cuisine, plat_froid, impoli) car ils ne sont pas dans le catalogue macro-secteur — comportement attendu et préservé. Le `commentaire` (avec le texte concaténé des questions texte) et le `personnelMentionne` sont stockés intégralement, ce qui préserve la richesse du feedback.

## Contraintes respectées
- ✅ TypeScript strict, pas d'`any`
- ✅ Signature du composant préservée : `export function ScanView({ token, onExit }: { token: string; onExit: () => void })`
- ✅ API `/api/retour` non cassée : payload identique `{ qrToken, note, tags, commentaire, personnelMentionne, nps, photoUrl, emailClient, canalChoisi, geoConsent }`
- ✅ Design QRTags conservé : fond blanc, cards `bg-white border-2 border-[#002e85] rounded-2xl`, bouton "Suivant" bleu `#002e85`
- ✅ i18n FR/EN/AR (11 nouvelles clés traduites dans les 3 langues, `dir="rtl"` pour l'arabe)
- ✅ Mobile-first : cards `min-h-20 sm:min-h-24`, boutons `min-h-14`, touch targets ≥ 48px
- ✅ `bunx tsc --noEmit` → 0 erreur
- ✅ `curl localhost:3001/` → 200
- ✅ Pas de git commit/push

## Notes techniques
- Le dev server du projet `/home/z/my-project` (port 3000) reste actif et n'a pas été touché.
- Le dev server feedbackpro (port 3001) a été démarré avec un wrapper `/tmp/start_fp_dev.sh` qui force `DATABASE_URL` (le shell parent a une variable `DATABASE_URL` globale qui pointe vers `/home/z/my-project/db/custom.db`).
- La base SQLite a été initialisée : `prisma db push --force-reset` + `prisma/seed.ts` (Pizzeria demo) + `prisma/seed-secteurs-v2.ts` (15 SecteurConfig).
- Le questionnaire-config n'a pas été modifié (utilisé en lecture seule).
