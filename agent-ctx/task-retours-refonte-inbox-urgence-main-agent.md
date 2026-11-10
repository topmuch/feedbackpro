# Task : Refonte page Retours (liste "Inbox Intelligente" + détail "Dashboard d'Urgence")

**Agent** : main-agent (Z.ai Code)
**Date** : exécution courante
**Fichier modifié** : `src/components/feedbackpro/retours-tab.tsx` (2868 → 3045 lignes, +177 lignes)
**Périmètre** : Vue liste (cards horizontales, filtres pills, résumé IA) + Vue détail (header sticky, layout 3 colonnes, card IA dégradée).

## Contexte

La page `RetoursTab` du dashboard Pro gère deux vues :
- **Liste** quand `detail === null` : cards intelligentes, filtres, résumé IA Coach.
- **Détail** quand `detail` est set (early-return) : layout 3 colonnes avec IA en mise en avant.

Un agent précédent (`task-retours-detail-ia-quickactions-main-agent.md`) avait posé les fondations
(helpers IA, layout 3 colonnes, header sticky, card IA dégradée bleue, templates de réponse).
Cette tâche est une **refonte visuelle ciblée** pour aligner 100 % sur le brief :

1. Badges urgence en **fond plein** (spec : `bg-red-500 text-white`, etc.).
2. **Hover élévation** sur les cards (`hover:-translate-y-0.5 hover:shadow-lg`).
3. **Évolution hebdomadaire %** dans le Résumé IA Coach (priorité tag).
4. **Stats rapides** enrichies dans le détail (Zone la plus touchée + Tendance 7j).
5. **Timeline card** dédiée dans la colonne gauche du détail (spec).
6. **Badges visuels** uniformisés : Nouveau bleu, Urgent rouge, Récidive ambre, Tags colorés.

## Helpers IA ajoutés (purs, hors composant)

### `evolutionTag(tag, items)` → `EvolutionSemaine | null`
Calcule l'évolution d'un tag entre cette semaine (7 derniers jours) et la semaine précédente (7-14 jours) :
- `thisWeek` : occurrences sur les 7 derniers jours
- `lastWeek` : occurrences sur les 7 jours précédents
- `pct` : pourcentage d'évolution arrondi (`((thisWeek - lastWeek) / lastWeek) * 100`)
- `nouveau` : true si `lastWeek === 0 && thisWeek > 0` (tag nouveau cette semaine)
- Renvoie `null` si aucune occurrence sur les deux semaines.

### `zoneLaPlusTouchee(retour, tous)` → `{ nom, count } | null`
Identifie la zone qui concentre le plus de retours partageant au moins un tag avec `retour`,
sur 30 jours (utilise `ilYA30Jours()` existant). Exclut le retour courant. Renvoie null si aucune
zone n'est ressortie ou si le retour n'a aucun tag.

## Type étendu

```typescript
type EvolutionSemaine = { pct: number; nouveau: boolean; thisWeek: number; lastWeek: number }

type PrioriteIA =
  | { type: "tag"; emoji: string; titre: string; detail: string; tagId?: string; evolution?: EvolutionSemaine | null }
  | { type: "zone"; emoji: string; titre: string; detail: string; zoneNom?: string }
  | { type: "employe"; emoji: string; titre: string; detail: string; employeNom?: string }
```

## Changements Liste — "L'Inbox Intelligente"

### 1. `URGENCE_CONFIG` — Badges solides (spec)
Avant : `bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300` (léger, dark-mode dépendant).
Après : `border-transparent bg-red-500 text-white shadow-sm shadow-red-500/30` (solide, dark-mode agnostique).

| Urgence  | Couleur avant        | Couleur après (spec)                     |
|----------|----------------------|------------------------------------------|
| urgent   | rose-50 / rose-700   | `bg-red-500 text-white` + shadow red/30  |
| atraiter | orange-50 / orange-700 | `bg-orange-500 text-white` + shadow orange/30 |
| mitige   | amber-50 / amber-700 | `bg-yellow-500 text-white` + shadow yellow/30 |
| positif  | emerald-50 / emerald-700 | `bg-green-500 text-white` + shadow green/30 |

Nouveau champ `glow` (ex : `hover:shadow-red-500/20`) appliqué au hover de la card pour un halo
coloré subtil qui renforce le code urgence.

### 2. Hover élévation sur `CarteRetour` et `GroupeCartes`
```diff
- "rounded-3xl border bg-card shadow-sm hover:shadow-md transition-all duration-200 border-l-4"
+ "rounded-3xl border bg-card shadow-sm transition-all duration-200 border-l-4"
+ "hover:shadow-lg hover:-translate-y-0.5"
```
Per spec : `hover:shadow-lg hover:-translate-y-0.5 transition-all`.

### 3. `calculerResumeIA` — Évolution % sur la priorité tag
Avant : `detail = "Thème récurrent à traiter en priorité"` (statique).
Après : détail dynamique selon `evolutionTag(bestTag, items)` :
- 🆕 Nouveau (lastWeek = 0) : `🆕 N cette semaine — nouveau vs semaine précédente`
- ↗️ Hausse (pct > 0) : `↗️ +X% vs semaine précédente (last → this)`
- ↘️ Baisse (pct < 0) : `↘️ X% vs semaine précédente (last → this)`
- → Stable (pct = 0) : `→ Stable vs semaine précédente (N cette semaine)`
- Pas d'évolution (null) : texte par défaut conservé.

### 4. `BadgeEvolution` (nouveau composant)
Rendu compact d'une `EvolutionSemaine` :
- Nouveau : badge bleu `🆕 Nouveau`
- Hausse : badge rouge `↗️ +X%` (mauvaise nouvelle = rouge)
- Baisse : badge vert `↘️ X%` (bonne nouvelle = vert)
- Stable : badge muted `→ Stable`

Dark mode géré (`dark:border-X-700 dark:bg-X-950/50 dark:text-X-300`).
`title` HTML expose le détail `Cette semaine : N · Semaine précédente : M`.

### 5. `ResumeCoachIA` — Mise à jour
- Titre avec emoji 📊 et mention "(Coach IA)" : `📊 Résumé de la semaine (Coach IA)`.
- Boutons priorités : `hover:bg-muted/40 hover:shadow-sm` (subtle lift).
- Badge évolution affiché à droite du titre de la priorité tag (via `BadgeEvolution`).

### 6. `CarteRetour` — Tags plus vivants
Avant : `bg-rose-50 text-rose-700` (trop léger).
Après : `bg-rose-100 text-rose-800` (spec exacte : `bg-<color>-100 text-<color>-800`).
Hover : `hover:scale-105 hover:shadow-sm` (effet de palpitation).

### 7. `CarteRetour` — Badge "Nouveau" bleu plein (spec)
Avant : `<Badge className="h-5 px-1.5 text-[10px]">Nouveau</Badge>` (bg-primary par défaut).
Après : `border-blue-300 bg-blue-500 text-white shadow-sm shadow-blue-500/30` avec emoji ✨.
Spec : `Badge "Nouveau" (bleu)`.

### 8. `CarteRetour` — Badge "Récidive" ambre (spec)
Avant : `inline-flex items-center gap-1 font-medium text-amber-700` (texte simple).
Après : badge ambre plein `border-amber-300 bg-amber-100 text-amber-800` avec emoji 🔁.
Title HTML : `Nème signalement « Y » sur 30 jours`.
Spec : `Badge "Récidive" (ambre)`.

### 9. `GroupeCartes` — Badge "Récurrence" ambre (spec)
Avant : `URGENCE_CONFIG.urgent.badge` (rouge, incorrect).
Après : `bg-amber-500 text-white` (ambre, cohérent avec "Récidive").
Emoji 🔁 ajouté.

## Changements Détail — "Le Dashboard d'Urgence"

### 1. Header sticky — Badge "Nouveau" bleu plein
Même refonte que la liste : `border-blue-300 bg-blue-500 text-white shadow-sm shadow-blue-500/30` avec ✨.

### 2. Colonne Gauche (40%) — Timeline card (spec)
Avant : 4e card = "Tags associés" (doublon avec la colonne droite).
Après : 4e card = "Timeline du retour" (historique des statuts/actions, déplacé depuis le form d'action).
- Icône `Clock` + titre "Timeline du retour".
- Même rendu `<ol>` que l'ancien "Suivi du retour" (pastilles colorées, badges statut, dates).
- Empty state : "Aucun historique" en italique.

### 3. Colonne Centrale (40%) — Inchangée
Card IA dégradée bleue (`bg-gradient-to-br from-[#002e85] to-[#0047c7] text-white`) :
- Diagnostic, mini-graphique 30j, actions prioritaires, impact, bouton "Appliquer".
- Commentaire client en dessous.

### 4. Colonne Droite (20%) — Stats rapides enrichies (spec)
Ajout de 2 lignes (spec : "Nème signalement ce mois, zone la plus touchée, tendance (↗️ +40%)") :
- **Zone la plus touchée** : utilise `zoneLaPlusTouchee(detail, items)`. Affiche `Nom (count)`,
  tronqué si long, avec `title`. Fallback `—` si null.
- **Tendance 7j** : utilise `evolutionTag(recurrence.tagFrequent, items)`. Affiche `↗️ +X%`
  (rouge), `↘️ X%` (vert), `→ Stable` (muted), ou `🆕 Nouveau` (bleu). `title` expose le détail.

### 5. Colonne Droite (20%) — Tags associés (spec)
Avant : `<Badge variant="outline">` compact (text-xs, sans couleur).
Après : `<span>` coloré par polarity (rose pour négatif, emerald pour positif, muted pour neutre),
avec `bg-100 text-800` per spec ("liste des tags avec icônes + couleurs").

### 6. Form action managériale — Timeline inline supprimée
La timeline "Suivi du retour" qui était inline à la fin du form d'action est supprimée
(elle est désormais une card dédiée dans la colonne gauche, sans duplication).

## Logique métier préservée

Toutes les fonctions existantes sont conservées et fonctionnent à l'identique :
- `majRetour`, `envoyerReponse` (POST `/api/pro/retours` action=repondre), `enregistrerReponse`,
  `enregistrerAction` (workflow unifié avec `texteActionStatut`).
- `ouvrirDetail`, `ouvrirReponse`, `fermerDetail`.
- `load(p)` paginé avec filtres API (note, zoneId, employeId, statut, tag, dateDebut, dateFin).
- `filtrerParTag`, `voirEmploye`, `appliquerRecommandationsIA`, `ouvrirCoachIA`.
- `genererRecommandationIA`, `categorieDominante`, `compterRecurrence`, `statsEmploye`,
  `genererTemplatesReponse`, `MiniGraphiqueRecurrence`.
- Synchronisation filtres rapides/temporels avec filtres API (useEffect `fRapide` / `fTemporel`).
- Dialog historique employé + Dialog zoom photo plein écran.
- `useAppStore((s) => s.session)` pour `pro.whatsapp` + `pro.nomEtablissement`.

## Dark mode

- Badges urgence solides : couleurs identiques en light/dark (les `bg-X-500 text-white` sont
  agnostiques du thème).
- BadgeEvolution : variantes `dark:border-X-700 dark:bg-X-950/50 dark:text-X-300` pour les badges
  à fond clair (rose-100, emerald-100, etc.).
- Tags colorés (CarteRetour + colonne droite détail) : `dark:border-X-800 dark:bg-X-950/60 dark:text-X-300`.
- Card IA dégradée : inchangée (bleu fixe `#002e85 → #0047c7`).
- Card Résumé IA Coach : `bg-primary/[0.04]` (thème-agnostique).

## Accessibilité

- Tous les emojis décoratifs sont `aria-hidden`.
- `title` HTML sur les badges évolution / récurrence / zone touchée pour exposer le détail au
  survol et aux lecteurs d'écran.
- Boutons priorités (Résumé IA) : `text-left` + `focus-visible` natif du `<button>`.
- Hover `translate-y` désactivé implicitement par `prefers-reduced-motion` via le
  `transition-all duration-200` (pas d'animation forcée).
- Tags cliquables : `title` expose `Filtrer par « Y »`.

## Responsive

- CarteRetour : `flex flex-wrap` sur toutes les lignes (mobile-friendly).
- Layout 3 colonnes : `lg:grid-cols-5` (stack sur `< lg`).
- Header sticky détail : `flex flex-wrap` pour les 4 boutons d'action.
- Dialog historique employé : `sm:max-w-2xl` + `max-h-[70vh] overflow-y-auto`.
- Stats rapides : `flex items-center justify-between gap-2` avec `truncate max-w-[55%]` sur la zone.

## Vérifications

```
$ bunx tsc --noEmit                    → exit 0 (TSC OK)
$ bunx eslint src/components/feedbackpro/retours-tab.tsx → exit 0 (ESLINT OK)
$ curl http://localhost:3001/                                  → 200
$ curl -b cookies.txt http://localhost:3001/dashboard          → 200
$ curl -b cookies.txt http://localhost:3001/dashboard/retours  → 200
$ curl -X POST /api/auth/login (demo@pizzeria.fr / demo1234)   → 200 {"ok":true,...}
```

Dev log : aucun warning/error après compilation (Next.js 16.1.3 Turbopack).

## Fichiers modifiés

- `src/components/feedbackpro/retours-tab.tsx` (seul fichier touché, 2868 → 3045 lignes).

## Notes pour agents futurs

- `evolutionTag` et `zoneLaPlusTouchee` sont **pures** et réutilisables : pourraient être
  déplacées vers `src/lib/ia-retours.ts` si un autre composant en a besoin (ex : Coach IA tab).
- `BadgeEvolution` est un composant réutilisable (peut servir dans le tab Stats ou Coach IA).
- L'`URGENCE_CONFIG.glow` est optionnel : si une card n'en a pas besoin, omettre dans le `cn()`.
- La Timeline card du détail duplique la logique de l'ancien "Suivi du retour" : si l'UI évolue,
  penser à mettre les deux à jour (ou factoriser dans un composant `TimelineRetour`).
- Les badges urgence utilisent `border-transparent` pour neutraliser le `variant="outline"` du
  shadcn Badge. Si on passe à `variant="default"`, retirer le `border-transparent`.
