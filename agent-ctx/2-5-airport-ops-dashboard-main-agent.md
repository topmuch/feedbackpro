# Task ID 2-5 — Airport Ops Dashboard

**Agent**: main
**Date**: 2026-11-10
**Status**: ✅ Complete — all verifications pass

## Objectif

Construire un **dashboard ops aéroport** (route `/airport-dashboard`) avec 4 onglets (Wallboard, Zones, Signalements, Bot WhatsApp). Le dashboard est une console opérationnelle sombre (slate-950 + accents emerald) alignée visuellement avec le wallboard `/ops-wallboard` existant — sans aucune trace du bleu FeedbackPro `#002e85`.

## Fichiers créés

| Fichier | Lignes | Rôle |
|---|---|---|
| `src/app/airport-dashboard/page.tsx` | 32 | Page Next.js (server component) → rend `<AirportDashboard />`. `dynamic = 'force-dynamic'`, `robots: noindex`. |
| `src/components/feedbackpro/airport-dashboard.tsx` | 255 | Shell client : header sticky (logo ✈️ + horloge live + liens wallboard/accueil), tab bar (4 onglets), footer. Onglet piloté par `?tab=<slug>` via `history.pushState` + écoute `popstate`. |
| `src/components/feedbackpro/airport-zones-tab.tsx` | 928 | **Onglet critique** — éditeur des 5 zones. Sidebar (5 zones + counts) + formulaire d'édition (emoji/nom/description/tags/problématiques) + preview PWA. Default sélectionné : `sanitaires`. Dirty tracking, confirm dialog, toasts. |
| `src/components/feedbackpro/airport-reports-tab.tsx` | 560 | Liste filtrable des signalements (filtre zone + statut + recherche vol). Polling 10s. Bouton "Résoudre" qui appelle `POST /api/airport/ops/resolve`. |
| `src/components/feedbackpro/airport-bot-tab.tsx` | 426 | Panneau info bot WhatsApp : status (actif/démo), webhook URL copyable, 7 commandes documentées, table des numéros ops autorisés, variables d'env Twilio. |
| `src/app/api/airport/ops-contacts/route.ts` | 57 | **Nouvelle API** : `GET /api/airport/ops-contacts` liste `AirportOpsContact` (id, phone, name, role, actif). |
| **Total** | **2258** | |

## Décisions d'implémentation

1. **Wallboard tab = iframe** (Option B du brief) — `<iframe src="/ops-wallboard" className="w-full h-[calc(100vh-128px)] border-0" />`. Aucune modification du wallboard existant.

2. **Zone sélectionnée par défaut = `sanitaires`** (exigence utilisateur explicite). État initial `useState<string>('sanitaires')` dans `AirportZonesTab`.

3. **Validation côté client miroir des règles API** :
   - tags : `^[a-z0-9_-]{2,40}$`, max 10
   - problématiques : 3-100 chars, 1-6 par zone
   - emoji : 1-8 chars
   - nom : 2-60 chars
   - description : max 200 chars

4. **Dirty tracking + send-only-changed-fields** : le `handleSave` ne met dans le payload PUT que les champs qui diffèrent de l'état `saved`. Cela évite les écritures inutiles et les échecs de validation sur des champs non modifiés.

5. **Confirm dialog avant perte** : `window.confirm('Des modifications non sauvegardées seront perdues. Continuer ?')` au changement de zone dans la sidebar si `dirty === true`.

6. **Toast feedback** via `useToast` de `@/hooks/use-toast` — succès (vert) et erreur (destructive rouge). Le `<Toaster />` global est déjà monté dans `src/app/layout.tsx`.

7. **Polling Signalements 10s** avec `pollingRef` pour éviter les requêtes concurrentes. Refresh manuel aussi disponible.

8. **Couleurs** : `bg-slate-950` background principal, `bg-slate-900` header, `bg-slate-800` tab bar, accents `emerald-400/500/600` pour les actions principales. Aucune utilisation de `bg-primary`, `text-primary-foreground`, ou du bleu FeedbackPro.

9. **Mobile-first mais desktop-first visuellement** : la sidebar zones passe en scroll horizontal sur mobile (`overflow-x-auto`), les filtres reports s'enroulent (`flex-wrap`), le header compresse les libellés (`hidden sm:inline`).

## APIs utilisées

| Méthode | Endpoint | Rôle | Existant ? |
|---|---|---|---|
| GET | `/api/airport/zones` | Liste 5 zones + counts | ✅ Existant |
| PUT | `/api/airport/zones/[code]` | Mise à jour zone | ✅ Existant |
| GET | `/api/airport/reports?zone=&statut=&limit=` | Liste signalements filtrés | ✅ Existant |
| POST | `/api/airport/ops/resolve` | Marquer RESOLU | ✅ Existant |
| GET | `/api/airport/ops-contacts` | Liste numéros ops autorisés | 🆕 **Créé par cette tâche** |

## Vérifications (toutes ✅)

### TypeScript
```bash
$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -E "airport-dashboard|airport-zones-tab|airport-reports-tab|airport-bot-tab|ops-contacts"
# (vide — aucune erreur sur mes fichiers)
```

### ESLint
```bash
$ bun run lint 2>&1 | grep -E "airport-dashboard|airport-zones-tab|airport-reports-tab|airport-bot-tab|ops-contacts"
# (vide — 0 erreur, 0 warning sur mes fichiers)
# Les 2 erreurs + 1 warning restants sont pré-existants dans
# language-selector.tsx, scratch-card.tsx, db.ts — non touchés.
```

### Tests curl

1. **GET /api/airport/zones** → 200, renvoie bien 5 zones avec leurs tags/problémes ✅
2. **GET /airport-dashboard** → `HTTP 200` ✅
3. **PUT /api/airport/zones/sanitaires** `{"nom":"Sanitaires & Soins","emoji":"🚽"}` → 200, zone mise à jour, puis remise à l'état original ✅
4. **GET /api/airport/ops-contacts** → 200, renvoie 3 contacts seedés (Sophie Nettoyage, Pierre Maintenance, + ops) ✅
5. **GET /api/airport/reports?limit=3** → 200, `{reports:[],count:0}` ✅

### Dev log
Aucune erreur de compilation. Page `/airport-dashboard` compilée en 1223 ms (premier hit), routes API servies en ~100-180 ms.

## Points d'attention pour la suite

- **Pas d'auth** : le dashboard est public (comme le wallboard). En production, ajouter un middleware `requireAirportOps` sur `/airport-dashboard` et sur les APIs `PUT /zones/[code]`, `POST /ops/resolve`, `GET /ops-contacts`.
- **Tags suggestions** : durcies dans `TAG_SUGGESTIONS` (5 par code zone). Pour une config 100 % dynamique, brancher sur `AIRPORT_ZONES[].tags` depuis la config statique.
- **Polling reports 10s** : pas de pause quand l'onglet est inactif. Pour scaler, envisager une pause via `document.visibilityState`.
- **Wallboard iframe** : le brief mentionne une Option A (extraire `<WallboardContent />`) plus élégante. Si besoin de styling intégré au dashboard (pas d'iframe), refactor à prévoir dans une tâche séparée — ne pas casser le wallboard actuel.
