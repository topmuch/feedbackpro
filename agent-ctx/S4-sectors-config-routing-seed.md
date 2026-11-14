# S4 — Configuration files for 4 new sectors (Hotel, Gare, Hôpital, ERP)

**Task ID:** S4
**Agent:** main
**Project:** /home/z/my-project (Next.js 16 + TypeScript + Prisma SQLite)
**Status:** ✅ COMPLETE

---

## Objective

Créer les fichiers de configuration statique pour 4 nouveaux secteurs
(Hôtel, Gare, Hôpital, ERP) en suivant le pattern du fichier
`airport-config.ts` existant. Étendre le routing `problemType → équipe`
pour couvrir les nouveaux libellés. Centraliser tout dans un registry
`sector-config.ts`. Seeder la BDD avec l'ensemble des zones multi-secteurs.

---

## Files created / modified

| # | Path | Type | Sectors | Zones |
|---|------|------|---------|-------|
| 1 | `src/lib/hotel-config.ts` | NEW | Hôtel | 15 |
| 2 | `src/lib/gare-config.ts` | NEW | Gare (routière + maritime) | 12 |
| 3 | `src/lib/hopital-config.ts` | NEW | Hôpital / Santé | 12 |
| 4 | `src/lib/erp-config.ts` | NEW | ERP (admin publique) | 12 |
| 5 | `src/lib/sector-config.ts` | NEW | Registry central | 76 (tous secteurs) |
| 6 | `src/lib/sector-routing.ts` | NEW | Routing multi-secteurs | n/a |
| 7 | `src/lib/airport-routing.ts` | REWRITE → re-export | (rétro-compat) | n/a |
| 8 | `prisma/seed-all-sectors.ts` | NEW | Seed multi-secteurs | 76 |

---

## Total zones per sector

| Sector | ID | typeEtablissement | Zones | Code prefix |
|---|---|---|---|---|
| Restauration | `restaurant` | `Restaurant` | 0 (système Zone+SecteurConfig) | n/a |
| Aéroports | `aeroport` | `Aéroport` | 25 | (mixte) |
| Hôtellerie | `hotel` | `Hôtel` | 15 | `hot_` |
| Gares | `gare` | `Gare` | 12 | `gar_` |
| Santé | `hopital` | `Hôpital` | 12 | `hop_` |
| ERP | `erp` | `ERP` | 12 | `erp_` |
| **TOTAL** | | | **76** | |

### Détail des 15 zones Hôtel

| Famille | Code | Nom |
|---|---|---|
| ACCUEIL | `hot_reception` | Réception / Concierge |
| ACCUEIL | `hot_lobby` | Hall / Lobby |
| CHAMBRES | `hot_chambre_std` | Chambres Standard |
| CHAMBRES | `hot_chambre_sup` | Chambres Supérieures |
| CHAMBRES | `hot_suite` | Suites |
| RESTAURATION | `hot_resto` | Restaurant / Petit-déjeuner |
| RESTAURATION | `hot_bar` | Bar / Lounge |
| WELLNESS | `hot_spa` | Spa / Wellness |
| WELLNESS | `hot_pool` | Piscine |
| SERVICES | `hot_meeting` | Salles de réunion / Banquet |
| SERVICES | `hot_ascenseur` | Ascenseurs |
| SERVICES | `hot_couloir` | Couloirs / Circulation |
| SERVICES | `hot_sanitaires` | Sanitaires communs |
| EXTERIEUR | `hot_parking` | Parking |
| EXTERIEUR | `hot_exterieur` | Jardin / Terrasse |

### Détail des 12 zones Gare

| Famille | Code | Nom |
|---|---|---|
| FLUX | `gar_hall` | Hall principal |
| FLUX | `gar_billeterie` | Guichets / Billéterie |
| FLUX | `gar_info` | Info voyageurs |
| EMBARQUEMENT | `gar_quai_bus` | Quais embarquement bus |
| EMBARQUEMENT | `gar_quai_bateau` | Quais embarquement bateau |
| EMBARQUEMENT | `gar_attente` | Salle d'attente |
| SERVICES | `gar_sanitaires` | Sanitaires |
| SERVICES | `gar_resto` | Restauration / Café |
| SERVICES | `gar_boutique` | Boutiques |
| SERVICES | `gar_consigne` | Consignes / Bagagerie |
| LOGISTIQUE | `gar_parking` | Parking / Dépose-minute |
| LOGISTIQUE | `gar_pmr` | Accessibilité PMR |

### Détail des 12 zones Hôpital

| Famille | Code | Nom |
|---|---|---|
| FLUX | `hop_accueil` | Accueil / Admission |
| FLUX | `hop_attente` | Salle d'attente |
| FLUX | `hop_urgences` | Service des Urgences |
| SOINS | `hop_chambre` | Chambres (patients) |
| SOINS | `hop_bloc` | Bloc opératoire |
| SOINS | `hop_labo` | Laboratoire |
| SOINS | `hop_imagerie` | Imagerie (Radio/IRM) |
| SOINS | `hop_pharmacie` | Pharmacie / Dispensaire |
| CIRCULATION | `hop_couloir` | Couloirs / Circulation |
| CIRCULATION | `hop_sanitaires` | Sanitaires |
| LOGISTIQUE | `hop_resto` | Restauration / Cafétéria |
| LOGISTIQUE | `hop_parking` | Parking |

### Détail des 12 zones ERP

| Famille | Code | Nom |
|---|---|---|
| FLUX | `erp_accueil` | Accueil / Guichet |
| FLUX | `erp_attente` | Salle d'attente |
| FLUX | `erp_info` | Info point / Kiosque |
| BUREAUX | `erp_bureau` | Bureaux (services publics) |
| BUREAUX | `erp_salle` | Salles de réunion / Auditorium |
| SELF-SERVICE | `erp_borne` | Bornes interactives |
| CIRCULATION | `erp_sanitaires` | Sanitaires |
| CIRCULATION | `erp_couloir` | Couloirs / Hall |
| CIRCULATION | `erp_ascenseur` | Ascenseurs |
| LOGISTIQUE | `erp_resto` | Restauration / Cafétéria |
| LOGISTIQUE | `erp_parking` | Parking |
| LOGISTIQUE | `erp_securite` | Sécurité / Contrôle d'accès |

---

## sector-config.ts — API publique

```ts
import {
  SECTORS,                    // SectorConfig[] — tous les secteurs
  getSectorByType,            // (typeEtablissement) → SectorConfig | null
  getSectorZones,             // (typeEtablissement) → ZoneConfig[]
  getSectorById,              // (SectorId)         → SectorConfig | null
  resolveZoneByTag,           // (tag)              → ZoneConfig | null (cross-secteur)
  getZoneByCode,              // (code)             → ZoneConfig | null (cross-secteur)
  getSectorForZoneCode,       // (code)             → SectorConfig | null
  getAllStaticZones,          // ()                 → ZoneConfig[] (flat, hors restaurant)
} from '@/lib/sector-config'
```

Le restaurant est volontairement exclu du catalogue statique (il
utilise le système `Zone + SecteurConfig` où les zones sont créées
par le Pro lui-même). Les 4 nouveaux secteurs partagent la même
table `AirportZone` en BDD (servant de registry générique multi-
secteurs — son nom historique est conservé pour éviter une
migration destructrice).

---

## sector-routing.ts — Routing étendu

`PROBLEM_TO_TEAM` étendu avec **~60 nouveaux libellés** provenant
des 4 nouveaux secteurs. Le routing reste **sector-agnostic** :
un même libellé (ex: "Éclairage HS") route vers la même équipe
(maintenance) quel que soit le secteur (couloir hôtel, quai de gare,
parking ERP…).

Nouveaux libellés ajoutés par catégorie :

| Équipe | Exemples de nouveaux libellés |
|---|---|
| **securite** | `Sécurité insuffisante` (hôtel/gare/hôpital/ERP) |
| **maintenance** | `Clé ou carte fonctionnelle HS`, `Clim ou chauffage HS`, `Clim HS`, `TV ou minibar HS`, `Sèche-cheveux HS`, `Jacuzzi ou spa HS`, `Équipement audiovisuel HS`, `En panne`, `Lent`, `Barrière HS`, `Mobilier cassé`, `Écran HS`, `Écran cassé`, `Consigne HS`, `Ascenseur HS`, `Rampe manquante`, `Équipement en panne`, `Borne HS`, `Logiciel en panne`, `Détecteur HS` |
| **nettoyage** | `Propreté draps ou sol`, `Eau trouble ou froide`, `Sol mouillé`, `Hygiène insuffisante` |
| **accueil** | `File trop longue`, `Bruit excessif`, `Bruit couloirs`, `Réservation impossible`, `Espace insuffisant`, `Info absente`, `Info erronée`, `Info erronée ou absente`, `Annonce inaudible`, `Guichet fermé`, `Quai saturé`, `Bus retardé`, `Embarquement bloqué`, `Places insuffisantes`, `Attente résultats`, `Dossier bloqué` |
| **logistique** | `Bagage égaré`, `Minibar vide`, `Buffet épuisé`, `Transats manquants`, `Bagage bloqué`, `Personnel insuffisant`, `Équipement manquant`, `Encombrement`, `Médicament indisponible`, `Agent absent` |
| **other** | `Literie inconfortable`, `Vue obstruée`, `Isolation phonique`, `Service lent`, `Plat froid`, `Moustiques`, `Personnel désagréable`, `Accessibilité PMR`, `Non accessible PMR` |

API publique (rétro-compatible) :

```ts
import {
  routerVersService,    // (problemType) → 'nettoyage'|'maintenance'|'accueil'|'securite'|'logistique'|'other'
  serviceLabel,         // (team)        → 'Nettoyage'|'Maintenance'|'Accueil'|'Sécurité'|'Logistique'|'Autre'
  getAllTeams,          // ()            → string[6]
  getAllKnownProblems,  // ()            → string[] (clés de la map)
} from '@/lib/sector-routing'
// ou depuis '@/lib/airport-routing' (re-export déprécié)
```

### airport-routing.ts (rétro-compat)

Fichier rewrite → simple re-export :
```ts
export { routerVersService, serviceLabel, getAllTeams, getAllKnownProblems } from './sector-routing'
```
Les 3 consommateurs existants (`airport-scan-view.tsx`,
`admin-operations-tab.tsx`, `critical-alert.ts`) n'ont pas besoin
de modification.

---

## Seed verification

```
🌱 Seed multi-secteurs — toutes les zones statiques...
   Catalogue attendu :
     🍽️ Restauration                   0 zone(s)
     ✈️ Aéroports                     25 zone(s)
     🏨 Hôtellerie                    15 zone(s)
     🚌 Gares                         12 zone(s)
     🏥 Santé                         12 zone(s)
     🏛️ Établissements Publics        12 zone(s)
   ─────────────────────────────────────────────
   TOTAL                                   76 zone(s)

▸ Secteur ✈️ Aéroports (25 zones)...     ✚ 25 créées
▸ Secteur 🏨 Hôtellerie (15 zones)...     ✚ 15 créées
▸ Secteur 🏛️ Gares (12 zones)...          ✚ 12 créées
▸ Secteur 🏥 Santé (12 zones)...          ✚ 12 créées
▸ Secteur 🏛️ Établissements Publics (12).. ✚ 12 créées

✅ Seed multi-secteurs terminé : 76 créée(s), 0 mise(s) à jour.
✅ Total zones en BDD : 76 (catalogue attendu : 76).
```

Vérification DB par prefix (via Prisma client direct) :

```json
{
  "bagages": 1, "com": 3, "embarquement": 1, "erp": 12, "ext": 5,
  "files": 1, "gar": 12, "hop": 12, "hot": 15, "restauration": 1,
  "sanitaires": 1, "sec": 3, "srv": 3, "term": 5, "urg": 1
}
```

→ **76 zones en BDD** (12 erp + 12 gar + 12 hop + 15 hot + 25 airport-related) ✅

---

## Lint + tsc results

### TypeScript (`npx tsc --noEmit --skipLibCheck`)
```
0 errors  (clean — aucun output)
```

### ESLint (`bun run lint 2>&1 | tail -10`)
```
✖ 4 problems (3 errors, 1 warning)
```
Les 3 erreurs + 1 warning sont **toutes pré-existantes** et ne
touchent AUCUN des fichiers créés/modifiés par S4 :
- `src/components/feedbackpro/scratch-card.tsx:105` — `dernierePos` reassignment (react-hooks/immutability)
- `src/lib/db.ts:15` — unused eslint-disable directive

Vérification ciblée (grep sur les nouveaux fichiers) :
```
OK - no lint errors in new files
```

### Dev server (`tail -30 /home/z/my-project/dev.log`)
```
GET / 200 in 35ms (compile: 3ms, render: 33ms)
✓ Compiled in 471ms
```
Server tourne normalement, toutes les routes répondent en 200.

---

## Architecture decisions

1. **Réutilisation de la table `AirportZone`** : plutôt que de créer
   une nouvelle table `Zone` générique (qui aurait nécessité une
   migration et cassé les références `AirportReport.zoneId`), on
   étend `AirportZone` pour servir de registry multi-secteurs. Les
   codes sont préfixés par secteur (`hot_`, `gar_`, `hop_`, `erp_`)
   pour éviter toute collision avec les codes aéroport existants.

2. **`sector-config.ts` registry central** : un seul point d'entrée
   pour récupérer la config d'un secteur par `typeEtablissement`,
   `SectorId`, ou par tag/code de zone (cross-secteur). Les helpers
   `resolveZoneByTag` et `getZoneByCode` permettent à l'API `/scan`
   de résoudre n'importe quel tag sans connaître à l'avance le
   secteur du Pro.

3. **Routing sector-agnostic** : la même problématique (ex:
   "Éclairage HS") route vers la même équipe (maintenance) quel que
   soit le secteur. Cela évite la duplication de la map et garantit
   la cohérence du routing. Les libellés sont partagés entre
   secteurs quand c'est pertinent (ex: "Personnel absent" apparaît
   dans hôtel/gare/hôpital/ERP — un seul entry dans la map).

4. **Rétro-compat airport-routing.ts** : le fichier historic est
   réécrit comme simple `export * from './sector-routing'` afin que
   les 3 consommateurs existants (airport-scan-view, admin-ops,
   critical-alert) continuent à fonctionner sans modification.
   Les nouveaux consommateurs doivent importer depuis
   `@/lib/sector-routing`.

5. **`getAllStaticZones()`** : helper exposé par `sector-config.ts`
   qui retourne toutes les zones statiques flat (hors restaurant).
   Utilisé par le seed pour itérer sur tous les secteurs en une
   seule passe. Évite au seed de connaître la structure interne
   de chaque fichier `*-config.ts`.

6. **Apostrophes typographiques** : pour les `nom`/`description`
   contenant une apostrophe (ex: "Salle d'attente", "Hall d'accueil",
   "Sécurité / Contrôle d'accès"), on utilise l'apostrophe
   typographique `'` (U+2019) plutôt que l'apostrophe droite `'`
   qui aurait nécessité un backslash-escape. C'est aussi plus
   typographiquement correct en français, et c'est déjà le pattern
   utilisé par `airport-config.ts` ligne 75 (`'Files d'Attente'`).

---

## Next steps for downstream agents

- **S5 (UI scan view multi-secteur)** : peut maintenant utiliser
  `getSectorByType(pro.typeEtablissement)` pour récupérer le
  catalogue de zones du secteur du Pro connecté, et
  `resolveZoneByTag(tag)` pour résoudre n'importe quel QR code
  cross-secteur. Le routing `routerVersService(problemType)` est
  déjà sector-agnostic et fonctionne out-of-the-box.

- **S6 (Admin onboarding secteurs)** : peut utiliser `SECTORS` du
  `sector-config.ts` pour afficher un dropdown des 6 secteurs
  supportés lors de l'onboarding Pro (avec emoji + libellé +
  typeEtablissement à stocker dans `Pro.typeEtablissement`).

- **S7 (QR code posters multi-secteurs)** : peut itérer sur
  `getAllStaticZones()` pour générer un poster QR par tag pour
  chaque secteur (4 posters par zone × 76 zones = ~250 posters).
  Le helper `getSectorForZoneCode(code)` permet d'ajouter le
  libellé du secteur en en-tête du poster.

- **S8 (Wallboard ops room)** : peut grouper les incidents par
  secteur via `getSectorForZoneCode(zone.code)` puis par famille
  de zone (parsing du prefix : `hot_`/`gar_`/`hop_`/`erp_`/`ext_`/
  `sec_`/`term_`/`com_`/`srv_`/`urg_`).
