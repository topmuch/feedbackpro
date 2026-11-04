# Task : Refonte page détail retour — Dashboard d'Urgence 3 Niveaux + Fix IA

**Agent** : main-agent (Z.ai Code)
**Date** : exécution courante
**Fichier modifié** : `src/components/feedbackpro/retours-tab.tsx` (~3051 → ~3128 lignes)
**Périmètre** : Vue détaillée d'un retour (`if (detail) { ... }`) + logique IA `genererRecommandationIA`.

## Contexte / Problèmes signalés

1. **BUG IA — Recommandations inversées** : Pour un retour 2/5 (client mécontent), le Coach IA
   affichait des recommandations **positives** (« Féliciter l'équipe », « Demandez un avis Google »).
   Cause racine : `genererRecommandationIA` keyait les actions sur la **catégorie de tags**
   (`categorieDominante`), pas sur la **note**. Or `categorieDominante` retourne `"Positif"`
   dès qu'il n'y a pas de tag négatif — un 2/5 sans tag négatif produisait donc des actions
   positives. Inversion totale du sens.

2. **Layout 3 colonnes = confusion** : L'information était éparpillée en 3 colonnes
   (contexte / IA / actions). Besoin d'un flux vertical hiérarchisé en 3 niveaux.

## Correction du bug IA

### Nouveau type `NiveauIA` + `niveauDeNote(note)`

```ts
type NiveauIA = "crise" | "mitige" | "positif"
function niveauDeNote(note: number): NiveauIA {
  if (note <= 2) return "crise"      // 1-2★ → urgence/crise
  if (note === 3) return "mitige"    // 3★   → mitigé
  return "positif"                    // 4-5★ → succès
}
```

La NOTE pilote désormais le ton et le type d'actions (et non plus uniquement les tags).
`RecommandationIA` gagne un champ `niveau: NiveauIA`.

### `genererRecommandationIA` réécrite (note-driven)

3 branches distinctes selon `niveau` :

- **Crise (1-2★)** : Diagnostic `🚨 Client mécontent (N/5) — [zone]. [récurrence]. Risque d'avis
  négatif public si non traité.` · Actions : briefing équipe demain sur [problème] · formation
  ciblée · contacter le client (compensation). · Impact : prévention avis négatif + -60% plaintes.
- **Mitigé (3★)** : Diagnostic `⚠️ Expérience mitigée (3/5)…` · Actions : identifier point de
  friction · ajuster le processus · suivi personnalisé. · Impact : transformation en client satisfait.
- **Positif (4-5★)** : Diagnostic `✅ Client satisfait (N/5)…` · Actions : féliciter l'équipe ·
  formaliser la bonne pratique · demander un avis Google. · Impact : réputation en ligne + fidélisation.

### Garde-fou `sujetAction`

Quand `categorie === "Positif"` (aucun tag négatif — ex : 2/5 sans tag), on évite l'absurdité
« Briefing équipe demain sur bonne expérience signalée » en retombant sur
`"le problème signalé par le client"`. Les libellés de catégorie négatifs (Accueil, Rapidité,
Compétence, Qualité, Attention, Propreté) restent utilisés quand un tag négatif est présent.

### `NIVEAU_IA_CONFIG` (dégradés visuels)

| Niveau | Gradient | Badge |
|--------|----------|-------|
| crise  | `from-[#720032] to-[#5a0026]` (rouge bordeaux) | 🚨 Urgent / Crise |
| mitige | `from-amber-500 to-orange-600` (ambre/orange) | ⚠️ Mitigé |
| positif| `from-[#0da14b] to-[#0a8f3f]` (vert) | ✅ Positif |

## Refonte du layout — « Dashboard d'Urgence en 3 Niveaux » (flux vertical)

Remplacement du `grid lg:grid-cols-5` (3 colonnes) par un flux vertical hiérarchisé.

### NIVEAU 1 — En-tête Sticky (`sticky top-0 z-20`, `shadow-md`)
- Ligne 1 : `Stars` + note `/5` + zone (Badge MapPin) + date relative + badges Nouveau/NPS +
  **badge urgence aligné à droite** (URGENT / À TRAITER / MITIGÉ / POSITIF, couleur `cfgUrgence`).
- Ligne 2 : **phrase de contexte selon la note** (`phraseContexte`) :
  - crise → « Client mécontent — Risque d'avis négatif public »
  - mitigé → « Expérience mitigée — Points de friction à adresser »
  - positif → « Client satisfait — Opportunité de fidélisation et d'avis Google »
- Ligne 3 : **3 boutons d'action rapide** : ✍️ Répondre · 📱 WhatsApp équipe · ✅ Marquer résolu
  (le bouton « Coach IA » est supprimé — l'IA est désormais NIVEAU 2 juste en dessous).
  Si déjà résolu → Badge vert « Résolu » à la place du bouton.

### NIVEAU 2 — Coach IA (mise en avant maximale, juste sous le header)
- `Card` dégradée selon `cfgNiveau.gradient` (rouge / ambre / vert), texte blanc.
- Header : icône `Bot` + « 🧠 Recommandation du Coach IA » + badge niveau (`cfgNiveau.label`).
- 🔍 Diagnostic : `recoIA.contexte` (phrase adaptée à la note).
- Tendance 30 j (mini-graphique CSS) — uniquement si `recurrence.count >= 2`.
- 👉 Actions prioritaires : liste numérotée `recoIA.actions` (adaptées à la note).
- 📈 Impact prévu : `recoIA.impact` (encadré translucide blanc).
- Bouton « Appliquer ces recommandations → » → `appliquerRecommandationsIA(recoIA)`
  (pré-remplit le formulaire d'action managériale + scroll + focus).

### NIVEAU 3 — Détails & Historique (section repliable par défaut)
- `Card` + `Collapsible` shadcn (`CollapsibleTrigger` / `CollapsibleContent`).
- Header cliquable : « 📋 Détails du retour » + bouton « Déplier ▼ / Replier ▼ ».
- État `detailsOuverts` (défaut `false`) — replié pour garder le focus sur le Coach IA.
- Contenu (déplié) :
  - **Tags associés** (VISIBLES — c'était un des bugs : ils n'apparaissaient pas avant).
  - Zone + note moyenne zone (grille 2 colonnes avec Employé).
  - Employé (avatar initiales + nom cliquable → Dialog historique).
  - Commentaire client (blockquote) + canal + date.
  - Photo jointe (avec zoom → Dialog plein écran).
  - 📊 Contexte : récurrence + tendance zone + zone la plus touchée + catégorie IA / canal / statut.
  - 🕐 Timeline : historique des statuts (pastilles colorées).

## État / hooks ajoutés

- `detailsOuverts: boolean` (défaut `false`) — section NIVEAU 3 repliable.

## Imports ajoutés

- `Collapsible, CollapsibleContent, CollapsibleTrigger` depuis `@/components/ui/collapsible`.

## Logique métier préservée (NON cassée)

Toutes les fonctions existantes sont intactes : `majRetour`, `enregistrerReponse`,
`enregistrerAction`, `ouvrirDetail`, `ouvrirReponse`, `fermerDetail`, `load`, `appliquerRecommandationsIA`,
`genererTemplatesReponse`, `statsEmploye`, `compterRecurrence`, `categorieDominante`, `noteMoyenneZone`,
`zoneLaPlusTouchee`, `evolutionTag`, `MiniGraphiqueRecurrence`, `urganceDe`, `URGENCE_CONFIG`,
`historiqueAffiche`, les `useEffect` (chargement zones+employés, sync filtres), les refs
(`iaRef`, `actionFormRef`, `reponseRef`, `actionRef`), le `useAppStore` (session/whatsapp).

Le formulaire de réponse (pleine largeur), le formulaire d'action managériale (workflow unifié
avec statut), le bouton retour bas de page, le Dialog historique employé et le Dialog zoom photo
sont conservés à l'identique après NIVEAU 3.

`genererActions` et `impactEstime` (anciennes helpers category-driven) restent présents mais
ne sont plus appelés — `genererRecommandationIA` produit désormais directement les actions
note-driven. Aucune erreur tsc/lint (no-unused-vars est off dans la config ESLint).

## Nettoyage

- Suppression de la fonction imbriquée `scrollToIA` (devenue inutilitaire après la suppression
  du bouton « Coach IA » du header — l'IA est désormais NIVEAU 2, pas besoin de scroll).

## Vérifications

- `bunx tsc --noEmit` → **0 erreur** ✓
- `bun run lint` → 0 erreur sur `retours-tab.tsx` (les 2 problèmes restants sont pré-existants
  dans `language-selector.tsx` et `db.ts`, hors périmètre) ✓
- `curl /dashboard/retours` (avec cookie session `demo@pizzeria.fr`) → **200** ✓
- `curl /dashboard` (avec cookie) → **200** ✓
- Compilation Turbopack propre (dev.log : `GET /dashboard/retours 200`, aucun warning/erreur) ✓

## Note environnement (hors périmètre code)

Le dev server tournait sur la mauvaise base (`DATABASE_URL` shell =
`file:/home/z/my-project/db/custom.db` surchargeait le `.env` de FeedbackPro). Relancé avec
`DATABASE_URL=file:/home/z/feedbackpro/db/feedbackpro.db` explicite → login `demo@pizzeria.fr`
fonctionne, API retours renvoie 65 retours (répartis 1★×3, 2★×8, 3★×5, 4★×22, 5★×12).
Aucune modification de code liée à ce point — c'est uniquement un fix d'environnement de dev.

## Compte test pour vérification visuelle

- Login : `demo@pizzeria.fr` / `demo1234` (Pro, « Pizzeria Bella Napoli »)
- URL : `/dashboard/retours` → onglet « Retours » → cliquer « Voir le détail » sur un retour 2/5
  (ex : retour zone « Accueil » tag « accueil_froid ») → le Coach IA affiche désormais un
  diagnostic 🚨 crise (rouge bordeaux) avec briefing/formation/compensation, et NON plus
  « Féliciter l'équipe ».
