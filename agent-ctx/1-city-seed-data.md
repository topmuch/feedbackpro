# Task 1 — Dakar Region Seed Data (`city-seed-data.ts`)

**Agent:** Seed Data Author
**Task ID:** 1
**File created:** `/home/z/my-project/src/lib/city-seed-data.ts`
**Status:** Complete

## What was delivered

A self-contained TypeScript data module describing all **53 communes** of the
Dakar region (Senegal), organised by the 5 départements.

### Exports
- `CommuneSeed` — type for a commune (code, name, department, centerLat/Lng, quartiers)
- `DepartmentSeed` — type grouping communes under a department
- `DAKAR_REGION: DepartmentSeed[]` — full hierarchy, 5 departments
- `ALL_COMMUNES: CommuneSeed[]` — flat list of all 53 communes (derived)
- `getCommuneByCode(code: string): CommuneSeed | undefined` — case-insensitive lookup by 2-letter plate prefix

### Department breakdown (verified)
| Department    | Communes |
|---------------|----------|
| Dakar         | 19       |
| Pikine        | 12       |
| Guédiawaye    | 5        |
| Keur Massar   | 6        |
| Rufisque      | 11       |
| **Total**     | **53**   |

All 53 commune codes are unique (verified: 0 duplicates).

### Plate type hints applied
Quartiers without an explicit `type` default to `"standard"` downstream.
Only non-standard quartiers carry an explicit `type`:

| Commune | Quartier       | Type   | Reason            |
|---------|----------------|--------|-------------------|
| FN      | Campus UCAD    | ecole  | contains "Campus" |
| PN      | Cité Gare      | gare   | contains "Gare"   |
| TG      | Thiaroye Gare  | gare   | contains "Gare"   |
| SK      | Sébi Gare      | gare   | contains "Gare"   |

No quartier name contains "École"/"école" or "Mairie", so no other special types.

### Generated unités (social-housing estates)
- **Parcelles Assainies (PA):** `U1` … `U26` (26 unités) + `Cité Fadia` → 27 quartiers
- **Jaxaay-Parcelles (JP):** `Jaxaay 1 et 2` + `U1` … `U25` (25 unités) + `Niakoul Rab` → 27 quartiers

Generated via a local (non-exported) `genUnits(count)` helper — pure data
generation, no business logic.

### GPS coordinates
Approximate centre coordinates per commune as specified in the brief. They are
intentionally coarse — the mairie will refine per-quartier coordinates later
through the admin dashboard.

## Verification
- `bun run lint` on the file alone → **0 errors** (exit 0).
  (One unrelated pre-existing lint error exists in
  `src/components/feedbackpro/city-dashboard.tsx`, not from this task.)
- Runtime sanity script confirmed: 5 departments, 53 communes, 0 duplicate
  codes, 4 special-typed quartiers, correct unité counts, case-insensitive
  lookup returns the right commune and `undefined` for unknown codes.

## Notes for downstream agents
- Import pattern: `import { ALL_COMMUNES, getCommuneByCode, DAKAR_REGION } from '@/lib/city-seed-data'`
- `getCommuneByCode` is case-insensitive and trims input.
- Quartier `type` is optional; treat missing/undefined as `"standard"`.
- Codes are 2 uppercase ASCII letters — safe for plate prefixes and DB indexing.
