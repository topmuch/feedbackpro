// ============================================================
// airport-routing.ts — RÉTRO-COMPAT (DEPRECATED)
// ------------------------------------------------------------
// Le routing problemType → équipe staff est désormais sector-agnostic
// et couvre TOUS les secteurs (aéroport + hôtel + gare + hôpital + ERP).
// Le code source canonique a été déplacé vers ./sector-routing.ts.
//
// Ce fichier ne fait que re-exporter l'API publique de sector-routing.ts
// afin de préserver la compatibilité avec les consommateurs existants
// (airport-scan-view.tsx, critical-alert.ts, admin-operations-tab.tsx…).
//
// Nouveaux consommateurs : importer directement depuis '@/lib/sector-routing'.
// ============================================================

export {
  routerVersService,
  serviceLabel,
  getAllTeams,
  getAllKnownProblems,
} from './sector-routing'
