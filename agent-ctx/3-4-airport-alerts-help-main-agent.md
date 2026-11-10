# Task 3-4 — Seuils d'alerte + Bouton "Aide" PWA

Task ID: **3-4**
Agent: main-agent
Module: **FeedbackPro airport**
Status: ✅ Terminé

## Résumé

Deux fonctionnalités livrées pour le module aéroport :

1. **Seuils d'alerte configurables + détection de pics** — backend CRUD complet, endpoint `/alerts/check` qui détecte pics SPIKE_*, file d'attente PENDING_COUNT et absence de résolution NO_RESOLUTION_HOURS, UI de configuration dans le formulaire d'édition de zone, et bannière d'alertes temps réel sur le wallboard ops (polling 30s).
2. **Bouton "Aide" PWA** — bouton rouge "🆘 Demander de l'aide immédiatement" sur l'écran de confirmation du voyageur (PWA), dialog avec message + téléphone optionnels, endpoints CRUD pour ops (POST/GET/take/resolve), et bannière "DEMANDES D'AIDE EN ATTENTE" en haut de l'onglet Signalements (polling 10s).

## Fichiers créés

| Fichier | Lignes | Rôle |
|---|---:|---|
| `src/app/api/airport/thresholds/route.ts` | 140 | GET (liste) + POST (création) |
| `src/app/api/airport/thresholds/[id]/route.ts` | 164 | PUT (update PATCH-like) + DELETE |
| `src/app/api/airport/alerts/check/route.ts` | 337 | Cœur de détection — lit tous les seuils actifs, détecte pics/pending/no-resolution, met à jour `lastTriggeredAt` (anti-spam 30 min), log le payload WhatsApp |
| `src/app/api/airport/help/route.ts` | 203 | POST (crée AirportHelpRequest, log payload WhatsApp) + GET (liste filtrable par statut) |
| `src/app/api/airport/help/[id]/take/route.ts` | 77 | POST — passe à PRIS_EN_CHARGE + assignedTo |
| `src/app/api/airport/help/[id]/resolve/route.ts` | 77 | POST — passe à RESOLU + resolvedAt (idempotent) |

## Fichiers modifiés

| Fichier | Lignes | Modifications |
|---|---:|---|
| `src/components/feedbackpro/airport-zones-tab.tsx` | 2026 | +`AlertThresholdsSection` (table inline éditable, debounce 500 ms, save sur blur) |
| `src/components/feedbackpro/airport-reports-tab.tsx` | 859 | +`HelpRequestsBar` (cartes horizontales, polling 10s, take/resolve) |
| `src/components/feedbackpro/airport-scan-view.tsx` | 1063 | +Bouton "🆘 Demander de l'aide immédiatement" + Dialog (message + phone optionnels) + état succès |
| `src/app/ops-wallboard/page.tsx` | 886 | +Polling `/alerts/check` 30s, +`AlertBanner` (rouge pulsant critical / amber warning), section "ALERTES ACTIVES" au-dessus du main grid |

## Vérifications

- **TypeScript** : `bunx tsc --noEmit --skipLibCheck` → 0 erreur sur les fichiers concernés (1 erreur pré-existante dans `qrcode/route.ts` non touchée)
- **ESLint** : `bunx eslint <7 fichiers>` → 0 erreur, 0 warning
- **curl tests** :
  - `GET /api/airport/thresholds` → 200, retourne `thresholds[]` + métadonnées
  - `GET /api/airport/alerts/check` → 200, retourne `alerts[]` triées critical-first
  - `POST /api/airport/help` → 201, crée la demande, log le payload WhatsApp
  - `POST /api/airport/thresholds` → 201
  - `PUT /api/airport/thresholds/[id]` → 200 (toggle active)
  - `POST /api/airport/help/[id]/take` → 200, statut PRIS_EN_CHARGE
  - `POST /api/airport/help/[id]/resolve` → 200, statut RESOLU
  - `DELETE /api/airport/thresholds/[id]` → 200, `deleted: true`
- **Test E2E détection** : après seed des 5 zones + création de 3 reports sanitaires EN_ATTENTE → `/alerts/check` retourne 2 alertes :
  - `PENDING_COUNT` sanitaires : currentValue=3, threshold=1, **critical** (3 ≥ 1×2)
  - `SPIKE_15MIN` sanitaires : currentValue=3, threshold=3, **warning** (3 < 3×2)
- **Anti-spam** : second appel `/alerts/check` dans la minute → alertes toujours retournées (pour wallboard) avec `suppressed=true` (pas de refresh `lastTriggeredAt`, pas de re-log WhatsApp)
- **dev.log** : aucun warning/erreur de compilation

## Architecture

### Détection des alertes (`/alerts/check`)

```
Pour chaque AirportAlertThreshold actif :
  SPIKE_15MIN/30MIN/1H → count reports créés dans fenêtre N, groupés par zoneCode
                         si zoneCode="ALL" : trigger pour chaque zone qui dépasse
                         sinon : trigger si la zone ciblée dépasse
  PENDING_COUNT        → count reports statut="EN_ATTENTE"
                         si zoneCode="ALL" : count global
  NO_RESOLUTION_HOURS  → âge en heures du plus vieux report EN_ATTENTE

Severity :
  critical si currentValue >= threshold * 2
  warning  sinon

Anti-spam (30 min) :
  - si lastTriggeredAt < 30 min → alerte retournée mais suppressed=true
    (pas de refresh lastTriggeredAt, pas de log WhatsApp)
  - sinon → refresh lastTriggeredAt = now, log WhatsApp pour ops actifs
```

### Helper `getActiveShiftPhones()`

Pour l'instant retourne tous les `AirportOpsContact` avec `actif=true`. Quand la Feature 4 (shifts) sera livrée, remplacer par `getActiveShiftPhones()` qui filtre par créneau horaire (model `AirportShift` déjà présent dans le schéma).

### UI Thresholds (`AlertThresholdsSection`)

- Filtrée par `zoneCode === currentZone OR zoneCode === "ALL"` (donc visible et éditable depuis n'importe quel onglet zone)
- Save inline : debounce 500 ms après chaque modification locale (optimistic update immédiat pour réactivité UI)
- Flush sur blur du champ threshold (sans attendre le debounce)
- Toast sur erreur de sauvegarde
- Validation côté serveur (1 ≤ threshold ≤ 1000, types et zones strictement whitelistés)

### UI Wallboard (`AlertBanner`)

- Critical : bordure rouge pulsante + `shadow-rose` + emoji 🚨 + badge "ALERTE CRITIQUE"
- Warning : bordure amber solide + emoji ⚠️ + badge "Alerte"
- Affiche `currentValue` / `threshold` en mono tabular-nums à droite
- Section "ALERTES ACTIVES" cachée si `alerts.length === 0`

### UI PWA Aide (`airport-scan-view.tsx`)

- Bouton "🆘 Demander de l'aide immédiatement" en `bg-rose-600` plein large, sous la section opt-in WhatsApp
- Subtitle : "Un agent ops vient vous aider sur place"
- Dialog : message (optionnel, max 500 chars) + phone (optionnel, pré-rempli si `whatsappPhone` déjà saisi)
- Sur succès : remplace le formulaire par "✅ Demande envoyée. Un agent arrive sur place. Restez à cette position."
- Bouton reste visible après fermeture du dialog (pour re-demander si besoin)
- Reset complet sur "Signaler un autre problème"

### UI Ops Aide (`HelpRequestsBar`)

- Bannière en haut de l'onglet Signalements (au-dessus des filtres)
- Polling 10s : fetch concurrent `?statut=EN_ATTENTE` + `?statut=PRIS_EN_CHARGE`
- Cartes horizontales scrollables (responsive mobile : empilées vertical)
- "Prendre en charge" : `window.prompt()` pour le numéro ops (audit)
- "Résoudre" : un clic, toast succès
- Empty state : "Aucune demande d'aide en attente."

## Contraintes respectées

- ✅ TypeScript strict, pas de `any`
- ✅ Tailwind v4 (light pour dashboard tabs, dark slate-950 pour wallboard)
- ✅ Enveloppe `{ ok, data } | { ok: false, error }` via `@/lib/session`
- ✅ Prisma + `db` client de `@/lib/db`
- ✅ Pas d'auth (public, comme les autres endpoints airport)
- ✅ Mobile-first pour la PWA aide (bouton plein large h-auto py-4)
- ✅ Toast via `useToast` de `@/hooks/use-toast`
- ✅ FR hardcoded (pas de next-intl sur les tabs airport)
