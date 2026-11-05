# Task Rattrapage + Audit Matin — Main Agent

## Date
2026-11-05

## Objectif
Développer deux nouvelles features pour FeedbackPro :

1. **Feature 1 — Alerte "Rattrapage Client" Interactive (Anti-TripAdvisor)** :
   - 1A. Écran "Rattrapage" côté client (scan-view.tsx)
   - 1B. Notification push manager (dashboard Pro)
   - 1C. Boucle de suivi (cron email)

2. **Feature 2 — Auto-Audit du Matin (Checklist dictée par l'IA)** :
   - 2A. Modèle Prisma AuditMatin
   - 2B. API audit-matin
   - 2C. Onglet "Audit Matin" dans le dashboard Pro
   - 2D. Intégration Coach IA

## Statut des sous-tâches

| Sous-tâche | Statut | Détails |
|-----------|--------|---------|
| 1A — Écran Rattrapage client | ✅ Fait | Nouvelle phase `"rattrapage"` dans scan-view.tsx, fond dégradé amber-50 → orange-50, icône 🤝 text-6xl pulse, titre "Nous sommes désolés", message personnalisé avec nom de l'établissement, compte à rebours 2:00 → 0:00 avec pulse, boutons "Je peux attendre" (vert) + "Je préfère partir" (outline), champ optionnel pour le nom du client, message de fin + bouton "Fermer" après le compte à rebours. Envoi du nom via POST /api/public/retour/rattrapage. |
| 1B — Toast persistant manager | ✅ Fait | notifications-bell.tsx détecte les nouvelles notifications `retour_negatif` via polling 30s (comparaison IDs déjà vus en ref). Toast persistant (TOAST_REMOVE_DELAY = 1 000 000 ms ≈ 16 min) avec titre "🚨 Retour négatif — [Zone]", description formatée (note/tags/commentaire), badge "⏳ Client en attente de rattrapage" si nom client, boutons "Je m'en occupe" (POST /api/pro/retours action=rattrapagePrisEnCharge) + "Voir le détail" (navigation SPA vers /dashboard/retours). Toast fermé via dismiss(toastId) après action. |
| 1C — Cron email suivi rattrapage | ✅ Fait | Route GET /api/cron/suivi-rattrapage protégée par CRON_SECRET. Récupère les retours négatifs ≤ 2★ des dernières 24h avec nomClientRattrapage ET emailClient. Envoie l'email `emailSuiviRattrapage` (template dans lib/email.ts) avec un lien mailto pré-rempli vers le manager. Anti-doublon via Setting `suivi_rattrapage:<retourId>`. Ajouté à vercel.json (schedule 0 9 * * *). |
| 2A — Modèle Prisma AuditMatin | ✅ Fait | Ajout du modèle AuditMatin (id, proId, pro, date, items JSON, photoUrls JSON, scoreManager Int, notes, createdAt, @@index([proId, date])). Ajout de la relation `audits AuditMatin[]` au modèle Pro. Ajout des champs `nomClientRattrapage String?` et `rattrapagePrisEnChargeAt DateTime?` au modèle Retour. Prisma db push + generate OK, dev server redémarré sur port 3001. |
| 2B — API audit-matin | ✅ Fait | GET /api/pro/audit-matin (génère ou récupère l'audit du jour). POST /api/pro/audit-matin (enregistre l'audit complété, calcule le scoreManager %). GET /api/pro/audit-matin/historique (30 derniers jours + comparaison Vision client vs Vision manager). |
| 2C — Onglet "Audit Matin" | ✅ Fait | Nouveau composant `audit-matin-tab.tsx` (606 lignes). Ajout de l'onglet `audit-matin` (icône Sunrise) dans ONGLETS_PRINCIPAUX après "coach". Mises à jour des 3 fonctions t() de pro-dashboard.tsx pour inclure "nav.auditMatin": "Audit Matin". 4 états : idle (Card "Bonjour"), checklist (items interactifs), done (récap), historique (timeline + graphe recharts + comparaison). Upload photo via /api/public/upload. Notes libres du manager. Sticky bar "Terminer l'audit". |
| 2D — Intégration Coach IA | ✅ Fait | Nouveau fichier `src/lib/audit-matin.ts` (345 lignes) avec : SYSTEM_PROMPT_AUDIT (Coach IA qualité pour le secteur), agregerRetoursVeille() (récupère les retours 24h + agrège topTagsNegatifs + zonesProblematiques + commentairesNegatifs), genererChecklistMatin() (LLM z-ai-web-dev-sdk backend avec timeout 30s + fallback heuristique déterministe), checklistHeuristique() (fallback basé sur top tags + zones problématiques + items génériques), calculerScoreManager(), serialiserAudit(). |

## Vérifications

- ✅ `bunx tsc --noEmit` → **0 erreur**
- ✅ `curl http://localhost:3001/` → **200**
- ✅ Login Pro `demo@pizzeria.fr` / `demo1234` → `{"ok":true,...}`
- ✅ `GET /api/pro/audit-matin` (avec cookie Pro) → retourne une checklist (3 items fallback) + source + dejaComplete + donnees agrégées
- ✅ `POST /api/pro/audit-matin` (avec cookie Pro) → enregistre l'audit, calcule le score 67% (2/3 validés), renvoie l'audit sérialisé
- ✅ `GET /api/pro/audit-matin/historique` (avec cookie Pro) → renvoie les audits 30 jours + comparaison (noteMoyenneClient, noteMoyenneManagerSur5, etc.)
- ✅ `GET /api/cron/suivi-rattrapage` sans Authorization → **401** (CRON_SECRET protégé)
- ✅ `GET /api/cron/suivi-rattrapage` avec Authorization: Bearer local-cron-secret → **200**, `{cibles:0, envoyes:0, erreurs:0, skipped:0}`
- ✅ `POST /api/public/retour/rattrapage` avec retourId inexistant → `{"ok":false,"error":"Retour introuvable"}`

## Fichiers modifiés/créés

### Fichiers modifiés
- `prisma/schema.prisma` — Ajout modèle `AuditMatin` + relation `audits` sur `Pro` + champs `nomClientRattrapage` et `rattrapagePrisEnChargeAt` sur `Retour`
- `src/lib/validation.ts` — Ajout champ `nomClientRattrapage` (optionnel, max 120) au `retourSchema`
- `src/lib/serialise.ts` — Ajout de `nomClientRattrapage` et `rattrapagePrisEnChargeAt` au `serialiserRetour`
- `src/app/api/retour/route.ts` — Persiste `nomClientRattrapage` dans le Retour + enrichit le message de la notification `retour_negatif` avec note/tags/commentaire/nom client + suffixe `|retourId=<id>` pour que le toast manager puisse extraire l'ID
- `src/app/api/pro/retours/route.ts` — Ajout de l'action POST `rattrapagePrisEnCharge` (horodate `rattrapagePrisEnChargeAt` sur le retour)
- `src/components/feedbackpro/scan-view.tsx` — Ajout phase `"rattrapage"` au type Phase, état rattrapage (secondes, nom, nomEnvoye, termine), useEffect compte à rebours 120s, fonction `envoyerNomRattrapage()`, transition vers rattrapage après envoi d'un retour négatif (si module alertes_temps_reel actif), bloc UI rattrapage (dégradé amber, icône 🤝, compte à rebours pulse, champ nom, boutons Je peux attendre / Je préfère partir / Fermer)
- `src/components/feedbackpro/notifications-bell.tsx` — Détection des nouvelles notifications `retour_negatif` via polling 30s + Set ref des IDs vus, fonction `declencherToastRattrapage` qui empile un toast persistant avec boutons d'action, extraction du retourId depuis le message, helpers `extraireRetourId` / `formaterMessageRattrapage`
- `src/lib/email.ts` — Ajout template `emailSuiviRattrapage` (sujet, corps HTML avec enveloppe FeedbackPro + bouton mailto pré-rempli vers le manager)
- `src/components/feedbackpro/pro-dashboard.tsx` — Import `Sunrise` (lucide), import `AuditMatinTab`, ajout de `"audit-matin"` au type `Onglet`, mappings SLUG_TO_TAB et TAB_TO_SLUG, entrée dans ONGLETS_PRINCIPAUX après "coach", rendering `<AuditMatinTab />`, ajout de "nav.auditMatin": "Audit Matin" dans les 3 fonctions t()
- `vercel.json` — Ajout cron `/api/cron/suivi-rattrapage` (schedule 0 9 * * *)

### Fichiers créés
- `src/lib/audit-matin.ts` — Moteur IA de l'audit du matin : SYSTEM_PROMPT_AUDIT, agregerRetoursVeille(), construirePrompt(), extraireJsonItems(), validerItemsLLM(), checklistHeuristique() (fallback), genererChecklistMatin() (LLM + fallback), serialiserAudit(), calculerScoreManager(), types ItemChecklist / ItemAuditSoumis / DonneesRetoursVeille
- `src/app/api/pro/audit-matin/route.ts` — GET (génère ou récupère l'audit du jour) + POST (enregistre l'audit complété)
- `src/app/api/pro/audit-matin/historique/route.ts` — GET (30 derniers jours + comparaison Vision client vs Vision manager)
- `src/app/api/public/retour/rattrapage/route.ts` — POST (met à jour le Retour avec nomClientRattrapage + met à jour le message de la notification manager)
- `src/app/api/cron/suivi-rattrapage/route.ts` — GET (cron quotidien, protégé par CRON_SECRET, envoie emailSuiviRattrapage aux clients ayant laissé nom + email sur un retour négatif ≤ 2★ des dernières 24h, anti-doublon via Setting)
- `src/components/feedbackpro/audit-matin-tab.tsx` — Onglet dashboard complet : 4 états (idle/checklist/done/historique), items interactifs Validé/Problème, upload photo, notes par item, notes libres du manager, sticky bar "Terminer l'audit", vue historique avec timeline + mini-graphe recharts + comparaison Vision client vs Vision manager

## Architecture / décisions clés

### Feature 1 — Rattrapage
- **Flow client** : scan → step1 (note ≤ 2) → step2/3/4 (tags, commentaire, photo, envoi) → POST /api/retour → si note ≤ 2 ET module alertes_temps_reel actif → phase "rattrapage" (au lieu de success/loterie). Sur rattrapage, le client peut saisir son nom (envoyé via POST /api/public/retour/rattrapage). Compte à rebours 120s. À la fin du compte à rebours ou sur clic "Je préfère partir", transition vers success.
- **Notification manager** : le POST /api/retour crée une notification type `retour_negatif` avec un message enrichi : `<note>/5 — <tags> — <commentaire> — Client : <nom> — En attente de rattrapage|retourId=<id>`. Le notifications-bell.tsx détecte les NOUVELLES notifications (première boucle peuple le Set sans déclencher de toast, les boucles suivantes déclenchent un toast persistant pour chaque nouvelle `retour_negatif` non lue). Le toast contient 2 boutons : "Je m'en occupe" (POST /api/pro/retours action=rattrapagePrisEnCharge) et "Voir le détail" (navigation SPA vers /dashboard/retours).
- **Boucle de suivi** : cron quotidien (vercel.json 0 9 * * *) protégé par CRON_SECRET. Pour chaque retour négatif ≤ 2★ des dernières 24h avec nomClientRattrapage ET emailClient, envoie un email de suivi avec un lien mailto pré-rempli vers le manager (le client reste dans une conversation privée, pas de page publique dédiée). Anti-doublon via Setting `suivi_rattrapage:<retourId>`.

### Feature 2 — Audit Matin
- **Modèle** : AuditMatin (proId, date, items JSON, photoUrls JSON, scoreManager Int, notes, createdAt) + index [proId, date]. Le score est calculé serveur à l'enregistrement (% d'items validés).
- **IA** : le prompt suit la spec exacte (Coach IA qualité pour le secteur, analyse des retours de la veille, checklist 3-6 items au format JSON avec id/label/urgence/photoRequise). Le LLM (z-ai-web-dev-sdk, backend uniquement, timeout 30s) est appelé via genererChecklistMatin(). Fallback heuristique déterministe si échec LLM : top tags négatifs récurrents → items "Corriger [tag] (N plaintes hier)", zones problématiques → items "Vérifier la zone [zone]" (photoRequise), items génériques si pas assez. La route ne lève JAMAIS d'exception.
- **API** : GET (récupère l'audit du jour s'il existe, sinon génère la checklist), POST (enregistre l'audit complété, écrase si déjà existant pour aujourd'hui), GET /historique (30 derniers jours + comparaison Vision client vs Vision manager).
- **UI** : 4 états — idle (Card "Bonjour" + résumé retours veille + bouton "Commencer l'audit"), checklist (items interactifs Validé/Problème + photo + notes par item + notes libres du manager + sticky bar "Terminer l'audit"), done (récap + score + items validés/invalidés), historique (timeline 30 jours + mini-graphe recharts + comparaison Vision client vs Vision manager).

## Notes / précautions
- **Pas de casse métier** : les nouveaux champs Prisma sont optionnels (nullable) → les anciens retours restent valides.
- **z-ai-web-dev-sdk en backend uniquement** : importé dans `src/lib/audit-matin.ts` (route API), jamais côté client.
- **Dark mode** : les nouveaux écrans utilisent `dark:` variants (rattrapage, audit tab).
- **Responsive** : tous les nouveaux écrans utilisent `sm:` / `lg:` breakpoints, mobile-first.
- **TypeScript strict** : 0 erreur de compilation.
- **Tests** : aucun test écrit (conforme aux consignes).
