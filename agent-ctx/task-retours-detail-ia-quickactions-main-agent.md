# Task : Page détail d'un retour — Coach IA + actions rapides + workflow unifié

**Agent** : main-agent (Z.ai Code)
**Date** : exécution courante
**Fichier modifié** : `src/components/feedbackpro/retours-tab.tsx` (1059 → 1909 lignes)
**Périmètre** : Vue détaillée d'un retour (`if (detail) { ... }`) + helpers IA côté client.

## Contexte

Le tableau `RetoursTab` du dashboard Pro affiche la liste paginée des retours.
Au clic sur une ligne, la fonction `ouvrirDetail(r)` active la vue détaillée
pleine page (early-return quand `detail` est set). Cette vue manquait
d'intelligence IA et d'actions rapides. Le brief demande 8 améliorations.

## Helpers IA ajoutés (purs, hors composant)

- `tagsNegatifsDe(r)` / `tagsPositifsDe(r)` : filtre sur `NEGATIVE_TAGS_ETENDUS` / `POSITIVE_TAGS_ETENDUS` (constants.ts).
- `ilYA30Jours()` : timestamp cutoff.
- `CATEGORIE_PAR_TAG` (table) + `categorieTag(t)` + `categorieDominante(r)` : vote majoritaire sur les tags négatifs → `CategorieIA` ("Accueil" | "Rapidité" | "Compétence" | "Qualité" | "Attention" | "Propreté" | "Positif").
- `compterRecurrence(retour, tous)` : parcourt `items` (30 j) et compte les retours partageant au moins un tag, + tag le plus fréquent.
- `ordinalFr(n)` : "1er" / "Nème".
- `genererActions(categorie)` : 3 actions concrètes par catégorie.
- `impactEstime(categorie)` : "-60% de plaintes similaires sous 2 semaines" (ou "+30% de chances que le client revienne" pour les positifs).
- `genererRecommandationIA(retour, tous)` : agrège tout en `RecommandationIA { categorie, probleme, contexte, recurrence, actions, impact }`.
- `genererTemplatesReponse(retour)` : 3 templates selon la note (≥4 / ≤2 / =3), avec insertion du tag positif/négatif dans le texte.
- `formationPourCategorie(c)` : libellé de formation par catégorie.
- `statsEmploye(nom, tous)` : filtre `items` par `personnelMentionne` OU `employe.nom` (insensible à la casse), calcule moyenne, top-3 points forts/faibles, formations recommandées.
- `MiniGraphiqueRecurrence` : composant CSS pur (10 seaux × 3 jours = 30 j), responsive, dark mode, sans lib de chart.

## State / hooks ajoutés

- `texteActionStatut: StatutRetour` (workflow unifié, défaut = statut courant ou IN_PROGRESS si NEW).
- `dialogEmployeNom: string | null` (Dialog historique employé).
- `iaRef: HTMLDivElement` (scroll "Voir IA").
- `useAppStore((s) => s.session)` pour récupérer `pro.whatsapp` + `pro.nomEtablissement`.

## Logique métier préservée

Toutes les fonctions existantes sont conservées : `majRetour`, `enregistrerReponse`,
`ouvrirDetail`, `ouvrirReponse`, `fermerDetail`, `load`, `enArray`, `tronquer`,
`canalLabel`, `statutBadgeClass`, `pastilleClass`, le `useEffect` de chargement
zones+employés, le `load` paginé, la timeline `historiqueAffiche`.

`enregistrerAction` a été étendu pour accepter le nouveau statut (workflow unifié) :
`majRetour(detail.id, { actionPrise, statut: nouveauStatut, lu: true })`. L'appel
API PATCH est inchangé ; seul le payload ajoute `statut`.

## Layout de la vue détaillée (réécrit)

1. Bouton "Retour à la liste" + titre (inchangé).
2. **Header Card** (Improvement 4) : Stars + badge statut + NPS + date + **3 boutons rapides** :
   - ✍️ Répondre → ouvre `editionReponse` + focus textarea.
   - 📱 Alerter l'équipe → lien `https://api.whatsapp.com/send?phone=<num>&text=<msg>` (visible seulement si `pro.whatsapp` configuré) avec message pré-formaté (spec).
   - 💡 Voir IA → scroll vers `iaRef`.
   - (+ bouton "Marquer comme lu" aligné à droite si non lu)
3. **Indicateur de récurrence** (Improvement 7) : badge ambre "⚠️ Nème signalement 'Y' ce mois-ci" + lien "→ Voir la tendance complète" (scroll IA). Affiché seulement si `recurrence.count >= 2`.
4. **Carte Coach IA** (Improvement 1, avec `ref={iaRef}`) :
   - Header : icône Bot + "💡 Recommandation du Coach IA" + badge catégorie.
   - Grille 2 colonnes : "Problème détecté" + "Contexte" (avec `ordinalFr(count) + libelleTag`).
   - Si `recurrence.count >= 2` : mini-graphique 30 j (Improvement 7).
   - Liste numérotée 3 actions suggérées.
   - Bloc vert "Impact attendu".
5. **Carte infos** : grille zone/employé/canal/reçu le. **Le nom de l'employé est un `<button>` cliquable** (Improvement 6) qui ouvre le Dialog. Tags + commentaire + photo (inchangés).
6. **Réponse commerçant** (Improvement 5) : si `editionReponse`, 3 boutons "Template 1/2/3" au-dessus du textarea qui injectent le texte (éditable).
7. **Action managériale** (Improvement 8) : si `editionAction`, le formulaire contient :
   - Textarea (action).
   - `<Label htmlFor="action-statut">Nouveau statut</Label>` + `<Select id="action-statut">` (NEW / IN_PROGRESS / RESOLVED).
   - Hint text dynamique : "Le statut passera de X à Y à l'enregistrement" / "Le statut reste inchangé".
   - Bouton "Enregistrer l'action et le statut".
8. **Timeline suivi** (inchangée).
9. **Bas de page** (Improvement 3) : bouton "Marquer comme lu" + hint text "Le statut se modifie via le workflow « Action managériale » ci-dessus." + "Retour à la liste". **Le dropdown de statut séparé est supprimé.**
10. **Dialog historique employé** (Improvement 6) : nom, total retours, moyenne (Stars + note), top-3 points forts (badges verts ×count), top-3 points faibles (badges rouges ×count), formations recommandées par l'IA.

## WhatsApp : format du message (spec)

```
⚠️ Alerte qualité - Pizzeria Bella Napoli
Note : ★★☆☆☆ (2/5)
Motifs : 🟥 Personnel impoli
Commentaire : <commentaire>
Action requise : vérifier le service.
- Management FeedbackPro
```
Encodage via `encodeURIComponent`, lien `https://api.whatsapp.com/send?phone=<num>&text=<msg>&type=phone_number&app_absent=0` (cohérent avec `src/lib/whatsapp.ts` existant, évite la redirection wa.me qui corrompt les emojis).

## Dark mode

- Cartes Coach IA : `bg-primary/[0.02]` + `border-primary/30` (thème-agnostique).
- Blocs ambre (récurrence) : `dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200`.
- Blocs emerald (impact / action enregistrée) : `dark:border-emerald-700/60 dark:bg-emerald-950/20`.
- Mini-graphique : `dark:bg-amber-400` (barre actuelle) / `dark:bg-amber-700/70` (autres).
- Badges points forts/faibles : variantes `dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300` (verts) / `dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300` (rouges).

## Responsive

- Header Card : `flex flex-wrap items-center gap-2` + `ml-auto` sur la date et le bouton "Lu".
- Grille Coach IA : `sm:grid-cols-2` (stack mobile).
- Boutons rapides : `flex flex-wrap items-center gap-2` (mobile-friendly).
- Dialog : `sm:max-w-2xl` + `max-h-[70vh] overflow-y-auto` (scroll interne mobile).
- Mini-graphique : `flex items-end gap-1 h-16` + `flex-1` (chaque barre).

## Accessibilité

- Icônes décoratives : `aria-hidden`.
- `aria-label` sur la zone de réponse et le Select.
- `role="img"` + `aria-label` sur le mini-graphique.
- Boutons employé : `title` + `focus-visible:underline`.
- `Stars` réutilisée (déjà `aria-label`).
- `<Label htmlFor>` + `<SelectTrigger id>` pour l'association.

## Vérifications

```
$ bunx tsc --noEmit        → exit 0 (0 erreur)
$ bunx eslint src/components/feedbackpro/retours-tab.tsx  → exit 0 (0 erreur)

$ curl http://localhost:3001/                                → 200
$ curl -b cookies.txt http://localhost:3001/dashboard/retours → 200 (auth)
$ curl -X POST /api/auth/login (demo@pizzeria.fr / demo1234) → 200 {"ok":true,...}
```

(Préalable : `bun run lint` signale 1 erreur + 1 warning **pré-existants** dans
`language-selector.tsx` et `db.ts` — non introduits par cette tâche, non liés au
fichier modifié.)

## Fichiers modifiés

- `src/components/feedbackpro/retours-tab.tsx` (seul fichier touché).

## Notes pour agents futurs

- Les fonctions IA (`genererRecommandationIA`, `statsEmploye`, `genererTemplatesReponse`, `MiniGraphiqueRecurrence`) sont **pures** et réutilisables : peuvent être déplacées vers `src/lib/ia-retours.ts` si besoin.
- `texteActionStatut` par défaut = `detail.statut === "NEW" ? "IN_PROGRESS" : detail.statut` (préserve l'auto-passage NEW → IN_PROGRESS du workflow original).
- La suppression du dropdown de statut en bas ne casse pas la liste (le `DropdownMenu` ligne-par-ligne "Plus d'actions" du tableau reste intact).
- Le `Select` du workflow unifié porte `id="action-statut"` (associé au Label).
