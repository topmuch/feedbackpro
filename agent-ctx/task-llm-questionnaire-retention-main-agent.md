# Tâche : LLM Coach IA + Questionnaire DB + Dashboard Rétention

## Date
Novembre 2026

## Statut : 3/3 tâches terminées ✓

## Résumé

### Task 1 — Brancher le vrai LLM pour le Coach IA ✓
- `src/lib/ia.ts` : ajouté `genererRecommandationPourRetour(donnees)` qui appelle `ZAI.create()` + `zai.chat.completions.create()` (backend uniquement) avec un prompt ciblé sur UN retour précis. Fallback heuristique via `genererRapportHeuristique(donnees)`.
- L'API existante `POST /api/pro/coach` utilise déjà le LLM via `genererEtEnregistrerRapport → genererContenuRapport` (vérifié).
- Créé `POST /api/pro/coach/recommandation` : prend `retourId` ou `retour` (+ contexte), appelle le LLM, renvoie `{source, niveau, diagnostic, actions, impact, pointsPositifs}`.
- `src/components/feedbackpro/retours-tab.tsx` : ajouté `recoLLM` state + `useEffect` qui fetch `/api/pro/coach/recommandation` quand on ouvre un retour. Pendant l'attente, affiche le fallback heuristique. Indicateur visuel de source (LLM / fallback / chargement).

### Task 2 — Stocker questionnaire-config dans SecteurConfig + éditeur superadmin ✓
- `prisma/schema.prisma` : ajouté `questionnaireConfig String @default("{}")` au modèle `SecteurConfig`.
- `bunx prisma db push` + `bunx prisma generate` exécutés.
- `prisma/seed-questionnaire.ts` créé : importe `QUESTIONNAIRE_CONFIG` et l'injecte dans `SecteurConfig.questionnaireConfig` pour les 10 secteurs mappés (RESTAURATION→4 secteurs, HOTELLERIE→1, TRANSPORT→2, SANTE→1, ADMINISTRATION→2). Les 5 secteurs génériques conservent le fallback hardcoded.
- `src/lib/questionnaire-config.ts` : ajouté `getQuestionnaireConfigFromDb(config, macroSecteur)` qui parse le JSON BDD avec fallback sur `QUESTIONNAIRE_CONFIG` hardcoded + `macroSecteurPourTypeEtablissement(type)`.
- `src/app/api/admin/secteurs/route.ts` créé : `GET` liste les secteurs avec questionnaireConfig parsé + source (bdd/fallback) ; `PUT` met à jour le questionnaire (validation JSON + structure, supporte `{}` pour réinitialiser → fallback).
- `src/components/feedbackpro/admin-dashboard.tsx` : ajouté onglet "Configuration secteurs" (icône `ClipboardList`) avec sélecteur de secteur + éditeur JSON (textarea) + boutons Enregistrer/Réinitialiser + validation en temps réel.

### Task 3 — Dashboard Rétention dans superadmin ✓
- `src/app/api/admin/retention/route.ts` créé : `GET` calcule `clientsActifsParMois` (Pros avec ≥1 retour/mois), `nouveauxClientsParMois`, `tauxChurn` (suspendus + sans retour 30j / total), `ltvEstime` (prix plan moyen × durée moyenne abonnement), `repartitionPlans`, `resume`.
- `src/components/feedbackpro/admin-dashboard.tsx` : ajouté onglet "Rétention" (icône `Activity`) avec :
  - 4 KPI cards (Clients actifs, Taux de churn, LTV estimée, Total Pros)
  - 2 AreaCharts (clients actifs/mois, nouveaux clients/mois) avec gradients
  - 1 PieChart (répartition par plan) + tableau détaillé (plan, count, %, revenu mensuel)
  - Note méthodologique

## Fichiers modifiés/créés

### Modifiés
- `prisma/schema.prisma` — ajout champ `questionnaireConfig` à `SecteurConfig`
- `src/lib/ia.ts` — ajout `genererRecommandationPourRetour`, `genererRapportHeuristique`, types `DonneesRecommandation`, `RecommandationRetour`, prompt système `SYSTEM_PROMPT_RECO`
- `src/lib/questionnaire-config.ts` — ajout `getQuestionnaireConfigFromDb`, `macroSecteurPourTypeEtablissement`
- `src/components/feedbackpro/retours-tab.tsx` — state `recoLLM` + useEffect fetch LLM + indicateurs visuels (LLM/fallback/loading)
- `src/components/feedbackpro/admin-dashboard.tsx` — 2 nouveaux onglets (Rétention, Configuration secteurs) + 2 composants (`RetentionTab`, `SecteursTab`) + imports (`Activity`, `ClipboardList`, `Save`, `cn`)

### Créés
- `src/app/api/pro/coach/recommandation/route.ts` — POST recommandation IA ciblée
- `src/app/api/admin/secteurs/route.ts` — GET/PUT questionnaire par secteur
- `src/app/api/admin/retention/route.ts` — GET métriques de rétention
- `prisma/seed-questionnaire.ts` — seed du questionnaire adaptatif

## Vérifications finales

| Vérif | Résultat |
|-------|----------|
| `bunx tsc --noEmit` | ✓ 0 erreur |
| `curl http://localhost:3001/` | ✓ 200 |
| Login `demo@pizzeria.fr` | ✓ `{"ok":true,"data":{"user":{"role":"PRO"}}}` |
| Login `admin@feedbackpro.fr` | ✓ `{"ok":true,"data":{"user":{"role":"SUPERADMIN"}}}` |
| POST `/api/pro/coach/recommandation` | ✓ source=ia, 3 actions générées par LLM |
| GET `/api/admin/secteurs` | ✓ 15 secteurs (10 BDD + 5 fallback) |
| PUT `/api/admin/secteurs` | ✓ enregistre + réinitialise (`{}` → fallback) |
| GET `/api/admin/retention` | ✓ métriques complètes (churn, LTV, actifs/mois, répartition) |

## Notes
- `bun run lint` : 1 erreur pré-existante dans `language-selector.tsx` (non introduite par cette tâche) + 1 warning pré-existant dans `db.ts`. Aucune nouvelle erreur/warning introduite.
- Le dev server tourne sur le port 3001 avec `DATABASE_URL=file:/home/z/feedbackpro/db/feedbackpro.db` (le `.env` parent chargeait une autre DB — résolu en passant l'env var explicite au lancement).
- Pas de git commit/push effectué.
