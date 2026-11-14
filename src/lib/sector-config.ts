// ============================================================
// FeedbackPro — Registry central multi-secteurs
// ------------------------------------------------------------
// Mappe chaque typeEtablissement (champ Pro.typeEtablissement
// en BDD) vers la config statique du secteur correspondant :
//   - restaurant  → secteurs classiques (Zone + tags)
//   - aeroport    → AIRPORT_ZONES (25 zones)
//   - hotel       → HOTEL_ZONES   (15 zones)
//   - gare        → GARE_ZONES    (12 zones)
//   - hopital     → HOPITAL_ZONES (12 zones)
//   - erp         → ERP_ZONES     (12 zones)
//
// Point d'entrée unique pour :
//   - récupérer la liste des zones d'un secteur (getSectorZones)
//   - résoudre un typeEtablissement Pro → SectorConfig (getSectorByType)
//   - itérer sur tous les secteurs (SECTORS) — utile pour le seed,
//     les selecteurs d'onboarding, le superadmin, etc.
//
// Le routing problemType → équipe staff reste sector-agnostic :
// voir sector-routing.ts (routerVersService).
// ============================================================

import { AIRPORT_ZONES, type AirportZoneConfig } from './airport-config'
import { HOTEL_ZONES, type HotelZoneConfig } from './hotel-config'
import { GARE_ZONES, type GareZoneConfig } from './gare-config'
import { HOPITAL_ZONES, type HopitalZoneConfig } from './hopital-config'
import { ERP_ZONES, type ErpZoneConfig } from './erp-config'

/** Type commun à toutes les configs zone (aéroport/hôtel/gare/hôpital/erp). */
export type ZoneConfig = {
  code: string
  nom: string
  emoji: string
  description?: string
  tags: string[]
  problemes: string[]
}

/** Identifiants des secteurs supportés par FeedbackPro. */
export type SectorId = 'restaurant' | 'aeroport' | 'hotel' | 'gare' | 'hopital' | 'erp'

/** Configuration complète d'un secteur. */
export type SectorConfig = {
  id: SectorId
  /** Libellé affichable du secteur (ex: "Aéroports"). */
  nom: string
  /** Emoji représentant le secteur. */
  emoji: string
  /** Valeur stockée dans Pro.typeEtablissement en BDD. */
  typeEtablissement: string
  /** Code prefix des tags QR (ex: "hot_" pour hôtel). Vide pour restaurant. */
  tagPrefix?: string
  /** Zones du secteur (vide pour restaurant — utilise Zone + SecteurConfig). */
  zones: ZoneConfig[]
}

/**
 * Union des types zone exports (utile pour les consommateurs qui
 * veulent manipuler une zone sans connaître son secteur d'origine).
 */
export type AnyZoneConfig = AirportZoneConfig | HotelZoneConfig | GareZoneConfig | HopitalZoneConfig | ErpZoneConfig

/**
 * Registry central : tous les secteurs supportés par FeedbackPro.
 * L'ordre est volontairement : restaurant, aéroport, hôtel, gare,
 * hôpital, ERP — pour suivre l'ordre historique d'intégration.
 */
export const SECTORS: SectorConfig[] = [
  {
    id: 'restaurant',
    nom: 'Restauration',
    emoji: '🍽️',
    typeEtablissement: 'Restaurant',
    tagPrefix: '',
    // Restaurant utilise le système classique Zone + SecteurConfig
    // (zones définies par le Pro lui-même, pas de catalogue statique).
    zones: [],
  },
  {
    id: 'aeroport',
    nom: 'Aéroports',
    emoji: '✈️',
    typeEtablissement: 'Aéroport',
    tagPrefix: '',
    zones: AIRPORT_ZONES,
  },
  {
    id: 'hotel',
    nom: 'Hôtellerie',
    emoji: '🏨',
    typeEtablissement: 'Hôtel',
    tagPrefix: 'hot_',
    zones: HOTEL_ZONES,
  },
  {
    id: 'gare',
    nom: 'Gares',
    emoji: '🚌',
    typeEtablissement: 'Gare',
    tagPrefix: 'gar_',
    zones: GARE_ZONES,
  },
  {
    id: 'hopital',
    nom: 'Santé',
    emoji: '🏥',
    typeEtablissement: 'Hôpital',
    tagPrefix: 'hop_',
    zones: HOPITAL_ZONES,
  },
  {
    id: 'erp',
    nom: 'Établissements Publics',
    emoji: '🏛️',
    typeEtablissement: 'ERP',
    tagPrefix: 'erp_',
    zones: ERP_ZONES,
  },
]

/**
 * Renvoie la config secteur pour un typeEtablissement donné.
 * Retourne null si le type n'est pas reconnu.
 *
 *   getSectorByType('Aéroport') → SectorConfig aéroport
 *   getSectorByType('Hôtel')    → SectorConfig hôtel
 *   getSectorByType('Mairie')   → null (non mappé — admin doit
 *                                  configurer typeEtablissement='ERP')
 */
export function getSectorByType(typeEtablissement: string): SectorConfig | null {
  if (!typeEtablissement) return null
  return SECTORS.find((s) => s.typeEtablissement === typeEtablissement) ?? null
}

/**
 * Renvoie la liste des zones d'un secteur (par typeEtablissement).
 * Tableau vide si le secteur n'est pas reconnu ou si c'est le secteur
 * restaurant (qui utilise le système Zone + SecteurConfig).
 */
export function getSectorZones(typeEtablissement: string): ZoneConfig[] {
  const sector = getSectorByType(typeEtablissement)
  return sector?.zones ?? []
}

/**
 * Renvoie la config secteur par son SectorId.
 * Retourne null si l'id n'est pas reconnu.
 */
export function getSectorById(id: SectorId): SectorConfig | null {
  return SECTORS.find((s) => s.id === id) ?? null
}

/**
 * Résout un tag URL scanné vers la zone correspondante, en
 * recherchant dans TOUS les secteurs (aéroport + hôtel + gare +
 * hôpital + erp). Retourne null si le tag n'est reconnu par
 * aucune zone.
 *
 * Permet à l'API /api/scan de résoudre n'importe quel tag sans
 * connaître à l'avance le secteur du Pro.
 */
export function resolveZoneByTag(tag: string): ZoneConfig | null {
  const normalise = tag.trim().toLowerCase()
  if (!normalise) return null
  for (const sector of SECTORS) {
    for (const z of sector.zones) {
      if (z.tags.some((t) => t.toLowerCase() === normalise)) return z
    }
  }
  return null
}

/**
 * Récupère une zone par son code métier, en recherchant dans
 * TOUS les secteurs.
 */
export function getZoneByCode(code: string): ZoneConfig | null {
  if (!code) return null
  for (const sector of SECTORS) {
    const z = sector.zones.find((z) => z.code === code)
    if (z) return z
  }
  return null
}

/**
 * Renvoie le secteur propriétaire d'une zone (par code).
 * Retourne null si la zone n'est trouvée dans aucun secteur.
 */
export function getSectorForZoneCode(code: string): SectorConfig | null {
  if (!code) return null
  for (const sector of SECTORS) {
    if (sector.zones.some((z) => z.code === code)) return sector
  }
  return null
}

/**
 * Renvoie toutes les zones de tous les secteurs (catalogue flat),
 * hors restaurant (qui n'a pas de zones statiques). Utile pour le
 * seed qui doit upsert l'ensemble des zones en BDD.
 */
export function getAllStaticZones(): ZoneConfig[] {
  return SECTORS.flatMap((s) => s.zones)
}
