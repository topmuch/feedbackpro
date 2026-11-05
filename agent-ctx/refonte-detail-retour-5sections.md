# Refonte page "Détail du Retour" — 5 sections verticales

## Tâche
Refonte complète de la page de détail d'un retour client dans
`src/components/feedbackpro/retours-tab.tsx` : remplacer l'ancien layout
(sticky header + Coach IA + Collapsible détails + 2 formulaires) par
**5 sections verticales** dans l'ordre exact :
1. En-tête contextuel sticky
2. Réponses au questionnaire (cards, OUVERT — plus de Collapsible)
3. Récompense client (si présente)
4. Recommandation du Coach IA
5. Appréciation du gérant (toujours visible, avec tags d'action prédéfinis)

## Fichier modifié
- `src/components/feedbackpro/retours-tab.tsx` (3328 → 3470 lignes)

## Changements détaillés

### 1. Type `Retour` + helpers (haut du fichier)
- Ajout du champ `recompenseUtilisee?: boolean` sur le type `Retour`
  (colonne existante en DB, pas encore exposée côté client)
- Ajout de la constante `ACTION_TAGS` (6 tags : 🎓 Formation, ⚠️ Recadrage,
  ⚙️ Processus, 🎁 Compensation, 🏆 Félicitations, 📝 Autre)
- Ajout de `parserActionPrise()` : parse "tag1 | tag2 — commentaire"
  → `{ tags, commentaire }` (robuste : legacy sans tags remonte tout en commentaire)
- Ajout de `construireActionPrise()` : reconstruit la chaîne depuis tags + commentaire

### 2. State + logique métier (composant RetoursTab)
- Nouveau state `actionTagsSelectionnes: Set<string>` (multi-sélection)
- Nouveau ref `reponseFormRef` (scroll vers le formulaire de réponse)
- `ouvrirDetail` / `ouvrirReponse` : pré-remplissent les tags + commentaire
  depuis `detail.actionPrise` via `parserActionPrise()`
- `enregistrerAction` : construit `actionPrise` via `construireActionPrise(tags, commentaire)`
  → `majRetour(id, { actionPrise, statut, lu: true })`
- Suppression de l'ancien state `detailsOuverts` (Collapsible retiré)
- Suppression des imports `Collapsible*` (inutilisés)

### 3. Vue détail — 5 sections (remplace l'ancien bloc `if (detail) { return (...) }`)
Layout : `<div className="mx-auto max-w-4xl space-y-6">`

- **SECTION 1** — En-tête sticky : bouton "← Retour à la liste" + badge statut
  (Nouveau/En cours/Résolu coloré) + note ★ + zone 📍 + email client (mailto:)
  + timestamp relatif + 4 boutons (Répondre, WhatsApp, Supprimer, Marquer résolu)
- **SECTION 2** — Cards questionnaire OUVERTES (grid sm:grid-cols-2) :
  chaque tag → card `rounded-xl border border-gray-200 bg-white p-4 shadow-sm`
  avec Q01/Q02 + libellé + badge gravité (🔴 Critique / 🟠 Élevée / 🟡 Moyenne /
  🟢 OK / ⚪ Neutre). Cards séparées pour commentaire 💬 et photo 📸 (zoom au clic).
  Zone + employé + contexte + timeline conservés.
- **SECTION 3** — Récompense (card ambre) : visible si `pro.recompenseActive && pro.recompense`
  OU `detail.recompenseUtilisee`. Affiche type / code / texte + statut ✅ Utilisé / ⏳ En attente.
- **SECTION 4** — Coach IA : card dégradée (rouge/ambre/vert selon note) avec
  diagnostic + actions + impact + bouton "Appliquer" + indicateur source LLM/fallback.
  Identique à l'ancien NIVEAU 2, déplacé en section 4.
- **SECTION 5** — Appréciation gérant (toujours visible) : 6 tags cliquables multi-sélection
  + textarea commentaire + 3 pills statut (Nouveau/En cours/Résolu) + bouton "Enregistrer"
  + aperçu de la dernière action enregistrée.
- **Formulaire de réponse** conservé (accessible via bouton "Répondre" → scroll + focus)
- **Dialogs** conservés à l'identique : historique employé, zoom photo, suppression

### Fonctions métier conservées (inchangées)
`majRetour`, `envoyerReponse`/`enregistrerReponse`, `supprimerRetour`, `fermerDetail`,
`appliquerRecommandationsIA`, `ouvrirDetail`, `ouvrirReponse`, `recoLLM` + fetch
`/api/pro/coach/recommandation`, `genererRecommandationIA`, `statsEmploye`,
`MiniGraphiqueRecurrence`, `urgenceDe`, `NIVEAU_IA_CONFIG`, `URGENCE_CONFIG`.

## Vérifications
- `bunx tsc --noEmit` → **0 erreur** ✓
- `curl -sS http://localhost:3001/dashboard/retours` (avec cookie `fp_session`) → **HTTP 200** ✓
  (page compilée en 19.4s, aucun erreur dans dev.log)
- `bun run lint` → **0 problème dans retours-tab.tsx** ✓
  (2 erreurs pré-existantes dans scratch-card.tsx et db.ts, non liées à cette tâche)
- Dev server actif sur port 3001 (Turbopack)

## Note environnement
Le sandbox a 3.9 Go RAM ; la compilation de la SPA (page.tsx + retours-tab.tsx ~3470 lignes
+ nombreux imports) consomme ~1.6 Go. Le serveur peut OOM-killer si plusieurs routes sont
compilées en succession. La compilation de `/dashboard/retours` réussit (200) mais le
serveur peut mourir peu après sous pression mémoire. Ce n'est PAS un problème de code
(tsc passe, la page compile et sert en 200).
