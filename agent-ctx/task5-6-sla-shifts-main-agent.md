# Task 5-6 — Feature 3 (SLA temps de résolution) + Feature 4 (Planification des quarts)

Agent: main
Date: 2026-11-10

## Contexte

J'ai construit 2 features pour le module aéroport FeedbackPro :

- **Feature 3 — SLA temps de résolution** : un objectif par zone, calcul du respect SLA temps réel sur le wallboard.
- **Feature 4 — Planification des quarts (shifts)** : shifts ops avec heures, jours et numéros actifs, résolution du quart courant pour router alertes & help requests.

## Fichiers créés

| Fichier | Lignes | Rôle |
|---|---:|---|
| `src/lib/airport-shifts.ts` | 211 | Helper partagé : `getActiveShiftPhones()`, `getAllActiveOpsPhones()`, `isShiftActiveAt()`, parsing HH:MM, gestion quarts de nuit |
| `src/app/api/airport/sla/route.ts` | 65 | `GET /api/airport/sla` — liste tous les SLA (5 zones, fallback null si non défini) |
| `src/app/api/airport/sla/[zoneCode]/route.ts` | 71 | `PUT /api/airport/sla/[zoneCode]` — upsert targetMinutes (1..1440 min) |
| `src/app/api/airport/shifts/route.ts` | 199 | `GET` (liste) + `POST` (crée shift) avec validation complète |
| `src/app/api/airport/shifts/[id]/route.ts` | 198 | `PUT` (update partiel) + `DELETE` |
| `src/app/api/airport/shifts/active/route.ts` | 52 | `GET /api/airport/shifts/active` — utilise `getActiveShiftPhones()` + `getAllActiveOpsPhones()` |

## Fichiers modifiés

| Fichier | Avant → Après | Changement |
|---|---:|---|
| `src/app/api/airport/wallboard/route.ts` | 214 → 306 | Ajout du champ `sla` (record par zone avec targetMinutes, resolvedCount, avgResolutionMinutes, slaCompliancePercent, pendingBreaches) |
| `src/components/feedbackpro/airport-zones-tab.tsx` | 1688 → 2026 | Ajout de `<SlaConfigSection>` (input objectif + save on blur + aperçu live 24h polling 30s) inséré après `<AlertThresholdsSection>` |
| `src/components/feedbackpro/airport-bot-tab.tsx` | 426 → 988 | Ajout de `<ShiftsSection>` + `<ShiftRow>` (table editable avec debounce 600ms, statut "QUART ACTUEL" polling 60s) |
| `src/app/ops-wallboard/page.tsx` | 595 → 886 | Ajout type `SlaStats`, sous-composant `SlaRow`, nouvelle colonne "SLA par zone" (lg:col-span-3) entre zones et team routing |

## Architecture

### Feature 3 — SLA
- DB : modèle `AirportSla { zoneCode unique, targetMinutes Int, active }` (déjà dans le schéma Prisma).
- Wallboard : piggyback sur la boucle existante (48h de reports). Pour chaque report :
  - Si `RESOLU` dans les 24h : incr `resolvedCount`, accumule `sumResolutionMs`, et si `ms/60000 ≤ targetMinutes` → incr `resolvedWithinTarget`.
  - Si `EN_ATTENTE` : si `now - createdAt > targetMinutes * 60000` → incr `pendingBreaches`.
- `slaCompliancePercent = resolvedCount > 0 ? round(resolvedWithinTarget / resolvedCount * 100) : 0`.

### Feature 4 — Shifts
- DB : modèle `AirportShift { name, startTime, endTime, daysOfWeek JSON, opsPhones JSON, active }`.
- Helper `isShiftActiveAt()` :
  - Quart normal (`start ≤ end`) : `inDaysToday && nowMin ∈ [start, end[`.
  - Quart de nuit (`start > end`) : `(inDaysToday && nowMin ≥ start) || (inDaysYesterday && nowMin < end)`.
  - Gestion explicite du jour précédent pour la partie après minuit des quarts overnight.
- `getAllActiveOpsPhones()` : priorise `role ∈ {ops, manager}`, fallback sur tous les contacts actifs si aucun ops/manager.
- Consommable par les features 1 (alertes) et 2 (help request) des autres agents via `getActiveShiftPhones()`.

## Verification

### TypeScript
```
$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep -E "sla|shifts|airport-bot|airport-zones|ops-wallboard"
(empty — aucune erreur sur mes fichiers)
```
Le seul `tsc` error restant est dans `src/app/api/airport/qrcode/route.ts` (pré-existant, `Buffer<ArrayBufferLike>` non assignable à `BodyInit`) — pas un de mes fichiers.

### ESLint
```
$ bunx eslint src/app/api/airport/sla src/app/api/airport/shifts src/lib/airport-shifts.ts \
    src/components/feedbackpro/airport-bot-tab.tsx \
    src/components/feedbackpro/airport-zones-tab.tsx \
    src/app/ops-wallboard/page.tsx
EXIT: 0
```

### curl tests
- `GET /api/airport/sla` → 200, retourne 5 zones avec SLA targets (15/10/20/30/30 min).
- `PUT /api/airport/sla/restauration {targetMinutes:25}` → 200, renvoie le SLA mis à jour.
- `GET /api/airport/shifts` → 200, retourne 3 shifts seedés (Matin 06-14, Après-midi 14-22, Nuit 22-06).
- `POST /api/airport/shifts` → 200, crée un nouveau shift avec validation.
- `PUT /api/airport/shifts/[id]` → 200, met à jour partiellement.
- `DELETE /api/airport/shifts/[id]` → 200, supprime.
- `GET /api/airport/shifts/active` à 22:56 → 200, retourne le shift `Nuit (22:00-06:00)` comme actif (quart overnight correctement géré).
- `GET /api/airport/wallboard` → 200, `data.sla` contient les 5 zones avec `targetMinutes`, `resolvedCount`, `avgResolutionMinutes`, `slaCompliancePercent`, `pendingBreaches`.

### Frontend
- `/ops-wallboard` → 200, "SLA par zone" est présent dans le HTML rendu.
- Aucune erreur de compilation dans `dev.log`.

## Notes pour les autres agents

- Le helper `getActiveShiftPhones()` (dans `src/lib/airport-shifts.ts`) est prêt à être utilisé par les features 1 (alertes) et 2 (help request) pour router vers l'équipe active. Si aucun shift n'est actif, `phones` est `[]` et l'appelant doit fallback sur `getAllActiveOpsPhones()`.
- Le contrat de réponse de `GET /api/airport/shifts/active` inclut `allPhones` pour faciliter le fallback côté appelant.
- La seed `prisma/seed-airport-ops-config.cjs` (créée par l'agent Feature 1) seed déjà 3 shifts + 5 SLA + 5 thresholds — mes endpoints les exposent.
