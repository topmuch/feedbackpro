// ============================================================
// MOTEUR DE ROUTAGE INTELLIGENT — Configuration canonique
// ------------------------------------------------------------
// Définit le vocabulaire partagé entre le moteur (serveur), les
// interfaces (SuperAdmin « Matrice de Routage », Manager « Vue
// Orchestration ») et les flux de signalements existants :
//
//   - Catégories d'employés (routage hiérarchique)
//   - Types de signalements canoniques (le moteur route sur CES codes)
//   - Zones canoniques Salon VIP + normalisation des alias
//     (VipTable.zone, contextZone Nathalie, problemType libre)
//   - Règles métier de départ par secteur (seed idempotent)
//
// Les listes sont sérialisées en JSON côté DB (SQLite) — ce module
// fournit les helpers de parse sûrs.
// ============================================================

// ------------------------------------------------------------
// CATÉGORIES D'EMPLOYÉS
// ------------------------------------------------------------
export type RoutingCategory =
  | 'serveur'
  | 'barman'
  | 'nettoyage'
  | 'maintenance'
  | 'securite'
  | 'reception'
  | 'maitre_dhotel'
  | 'manager'

export const ROUTING_CATEGORIES: { code: RoutingCategory; label: string; emoji: string }[] = [
  { code: 'serveur', label: 'Serveur', emoji: '👤' },
  { code: 'barman', label: 'Chef / Barman', emoji: '🍸' },
  { code: 'nettoyage', label: "Équipe d'étage", emoji: '🧹' },
  { code: 'maintenance', label: 'Maintenance', emoji: '🔧' },
  { code: 'securite', label: 'Sécurité', emoji: '🛡️' },
  { code: 'reception', label: 'Réceptionniste', emoji: '🛎️' },
  { code: 'maitre_dhotel', label: "Maître d'Hôtel", emoji: '🎩' },
  { code: 'manager', label: 'Manager', emoji: '👑' },
]

export const CATEGORIE_LABEL = (code: string): string =>
  ROUTING_CATEGORIES.find((c) => c.code === code)?.label ?? code
export const CATEGORIE_EMOJI = (code: string): string =>
  ROUTING_CATEGORIES.find((c) => c.code === code)?.emoji ?? '👤'

// ------------------------------------------------------------
// TYPES DE SIGNALEMENTS CANONIQUES
// ------------------------------------------------------------
export const ROUTING_SIGNAL_TYPES: { code: string; label: string; emoji: string }[] = [
  { code: 'commande', label: 'Commande', emoji: '🛎️' },
  { code: 'service_lent', label: 'Service lent', emoji: '⏱️' },
  { code: 'nourriture', label: 'Nourriture / Boissons', emoji: '🍽️' },
  { code: 'proprete', label: 'Propreté', emoji: '🧹' },
  { code: 'bruit', label: 'Bruit', emoji: '🔊' },
  { code: 'equipement', label: 'Équipement HS', emoji: '🔧' },
  { code: 'confort', label: 'Confort', emoji: '🛋️' },
  { code: 'temperature', label: 'Clim / Chauffage', emoji: '🌡️' },
  { code: 'conciergerie', label: 'Conciergerie', emoji: '💼' },
  { code: 'attente', label: 'Attente / File', emoji: '🕐' },
  { code: 'vip', label: 'Client VIP mécontent', emoji: '👑' },
  { code: 'autre', label: 'Autre', emoji: '📋' },
]

export const SIGNAL_LABEL = (code: string | null): string => {
  if (!code) return 'Tous types'
  return ROUTING_SIGNAL_TYPES.find((t) => t.code === code)?.label ?? code
}
export const SIGNAL_EMOJI = (code: string | null): string => {
  if (!code) return '🌐'
  return ROUTING_SIGNAL_TYPES.find((t) => t.code === code)?.emoji ?? '📋'
}

// ------------------------------------------------------------
// ZONES CANONIQUES SALON VIP (codes = AirportZone vip_lounge)
// ------------------------------------------------------------
export const VIP_ROUTING_ZONES: { code: string; label: string; emoji: string }[] = [
  { code: 'com_lounge', label: 'Salon principal', emoji: '🥂' },
  { code: 'vip_buffet', label: 'Buffet / Bar', emoji: '🍽️' },
  { code: 'vip_relaxation', label: 'Espace Détente', emoji: '🧘' },
  { code: 'vip_showers', label: 'Douches', emoji: '🚿' },
  { code: 'vip_reception', label: 'Réception', emoji: '🛎️' },
  { code: 'vip_meeting', label: 'Réunions', emoji: '💼' },
]

export const ZONE_LABEL = (code: string | null): string => {
  if (!code) return 'Toutes zones'
  return VIP_ROUTING_ZONES.find((z) => z.code === code)?.label ?? code
}
export const ZONE_EMOJI = (code: string | null): string => {
  if (!code) return '🌐'
  return VIP_ROUTING_ZONES.find((z) => z.code === code)?.emoji ?? '📍'
}

/**
 * Normalise n'importe quelle source de zone vers un code canonique :
 *  - codes AirportZone déjà canoniques (vip_buffet, com_lounge…)
 *  - VipTable.zone        : main | buffet | relaxation | meeting
 *  - contextZone Nathalie : "Zone Buffet", "Espace Détente", "Terrasse",
 *    "Salles de Réunion", "Fauteuil 12"…
 */
export function normaliserZone(raw?: string | null): string | null {
  if (!raw) return null
  const z = raw.trim().toLowerCase()
  if (VIP_ROUTING_ZONES.some((v) => v.code === z)) return z
  // VipTable.zone + alias usuels
  if (z === 'main' || z === 'lounge' || z.includes('salon')) return 'com_lounge'
  if (z === 'buffet' || z.includes('buffet') || z.includes('bar')) return 'vip_buffet'
  if (z === 'relaxation' || z.includes('détente') || z.includes('detente') || z.includes('terrasse') || z.includes('fauteuil'))
    return 'vip_relaxation'
  if (z === 'showers' || z.includes('douche') || z.includes('wc') || z.includes('toilette')) return 'vip_showers'
  if (z === 'reception' || z.includes('réception') || z.includes('reception') || z.includes('accueil') || z.includes('conciergerie'))
    return 'vip_reception'
  if (z === 'meeting' || z.includes('réunion') || z.includes('reunion') || z.includes('salle')) return 'vip_meeting'
  return null
}

/**
 * Normalise n'importe quelle source de "type de signalement" vers un
 * code canonique :
 *  - PROBLEM_TAGS Nathalie : bruit, proprete, confort, temperature,
 *    service, equipement, autre
 *  - VipTableRequest.type  : refreshment, menu, shower, charger,
 *    concierge, problem, rating, cleanup
 *  - problemType libre (libellés français des zones vip_*)
 */
export function normaliserSignalType(raw?: string | null): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()

  // Déjà canonique
  if (ROUTING_SIGNAL_TYPES.some((t) => t.code === s)) return s

  // Tags Nathalie
  if (s === 'service') return 'service_lent'
  if (s === 'equipement') return 'equipement'

  // Types VipTableRequest
  if (s === 'refreshment' || s === 'menu') return 'commande'
  if (s === 'cleanup') return 'proprete'
  if (s === 'shower' || s === 'charger') return 'equipement'
  if (s === 'concierge') return 'conciergerie'
  if (s === 'rating') return null // note client → pas de routage

  // Libellés libres français (zones vip_*)
  if (s.includes('sonore') || s.includes('bruit')) return 'bruit'
  if (s.includes('propret')) return 'proprete'
  if (s.includes('nourriture') || s.includes('boisson') || s.includes('froide') || s.includes('épuis') || s.includes('epuis') || s.includes('chaude'))
    return 'nourriture'
  if (s.includes('clim') || s.includes('chauffage')) return 'temperature'
  if (s.includes('wi-fi') || s.includes('wifi') || s.includes('équipement') || s.includes('equipement') || s.includes('hs') || s.includes('vidéo') || s.includes('video') || s.includes('serviette') || s.includes('eau chaude') || s.includes('cassé'))
    return 'equipement'
  if (s.includes('attente') || s.includes('file') || s.includes('long') || s.includes('indisponible')) return 'attente'
  if (s.includes('accès') || s.includes('acces') || s.includes('réservation') || s.includes('reservation') || s.includes('concierge') || s.includes('demande spécifique') || s.includes('specifique'))
    return 'conciergerie'
  if (s.includes('service lent') || s.includes('lent')) return 'service_lent'
  if (s.includes('confort') || s.includes('fauteuil') || s.includes('éclairage') || s.includes('eclairage')) return 'confort'
  if (s.includes('vip') || s.includes('mécontent') || s.includes('mecontent')) return 'vip'
  if (s.includes('surpeupl')) return 'confort'
  return 'autre'
}

/**
 * Dérive une priorité heuristique quand le flux entrant n'en fournit pas.
 *  - vip / SOS → critical
 *  - bruit / securite → high
 *  - sinon medium
 */
export function prioriteHeuristique(signalType?: string | null): 'low' | 'medium' | 'high' | 'critical' {
  const t = normaliserSignalType(signalType)
  if (t === 'vip') return 'critical'
  if (t === 'bruit' || t === 'securite') return 'high'
  return 'medium'
}

// ------------------------------------------------------------
// RÈGLES MÉTIER DE DÉPART — SECTEUR SALON VIP
// (Table « Routage vers / Escalade si > » du cahier des charges)
// ------------------------------------------------------------
export type SeedRule = {
  zoneCode: string | null
  signalType: string | null
  targetCategory: string
  fallbackCategory?: string | null
  escalationAfterMin: number
  priority: 'low' | 'medium' | 'high' | 'critical'
  rulePriority: number
  deniseTone?: 'soft' | 'normal' | 'urgent'
}

export const VIP_SEED_RULES: SeedRule[] = [
  // Commande boisson / Buffet → Barman de garde · 5 min → Maître d'Hôtel
  { zoneCode: 'vip_buffet', signalType: 'commande', targetCategory: 'barman', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'medium', rulePriority: 6 },
  // Nourriture / Buffet → Barman · 5 min → Maître d'Hôtel
  { zoneCode: 'vip_buffet', signalType: 'nourriture', targetCategory: 'barman', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'high', rulePriority: 6 },
  // Propreté buffet → Équipe d'étage
  { zoneCode: 'vip_buffet', signalType: 'proprete', targetCategory: 'nettoyage', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 10, priority: 'medium', rulePriority: 5 },
  // Propreté table / Détente → Équipe d'étage · 10 min → Manager
  { zoneCode: 'vip_relaxation', signalType: 'proprete', targetCategory: 'nettoyage', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 10, priority: 'medium', rulePriority: 5 },
  // Confort / Détente (fauteuils, éclairage) → Maintenance
  { zoneCode: 'vip_relaxation', signalType: 'confort', targetCategory: 'maintenance', fallbackCategory: 'manager', escalationAfterMin: 15, priority: 'medium', rulePriority: 4 },
  // Bruit excessif / Toute zone → Maître d'Hôtel · 3 min → Manager
  { zoneCode: null, signalType: 'bruit', targetCategory: 'maitre_dhotel', fallbackCategory: 'manager', escalationAfterMin: 3, priority: 'high', rulePriority: 8, deniseTone: 'urgent' },
  // Client VIP mécontent / Toute zone → Maître d'Hôtel DIRECT · 0 min → Manager
  { zoneCode: null, signalType: 'vip', targetCategory: 'maitre_dhotel', fallbackCategory: 'manager', escalationAfterMin: 1, priority: 'critical', rulePriority: 10, deniseTone: 'urgent' },
  // Douche HS / Douches → Maintenance · 15 min → Manager
  { zoneCode: 'vip_showers', signalType: 'equipement', targetCategory: 'maintenance', fallbackCategory: 'manager', escalationAfterMin: 15, priority: 'high', rulePriority: 5 },
  // Propreté douches → Équipe d'étage · 10 min
  { zoneCode: 'vip_showers', signalType: 'proprete', targetCategory: 'nettoyage', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 10, priority: 'medium', rulePriority: 4 },
  // Attente / Réception → Réceptionniste · 5 min → Maître d'Hôtel
  { zoneCode: 'vip_reception', signalType: 'attente', targetCategory: 'reception', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'medium', rulePriority: 5 },
  // Conciergerie / Réception → Réceptionniste · 5 min → Maître d'Hôtel
  { zoneCode: 'vip_reception', signalType: 'conciergerie', targetCategory: 'reception', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'medium', rulePriority: 5 },
  // Réunions : équipement vidéo → Maintenance
  { zoneCode: 'vip_meeting', signalType: 'equipement', targetCategory: 'maintenance', fallbackCategory: 'manager', escalationAfterMin: 15, priority: 'high', rulePriority: 5 },
  // Salon principal : service → Serveur
  { zoneCode: 'com_lounge', signalType: 'service_lent', targetCategory: 'serveur', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 10, priority: 'medium', rulePriority: 4 },
  { zoneCode: 'com_lounge', signalType: 'commande', targetCategory: 'serveur', fallbackCategory: 'barman', escalationAfterMin: 5, priority: 'medium', rulePriority: 4 },
  { zoneCode: 'com_lounge', signalType: 'nourriture', targetCategory: 'barman', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'medium', rulePriority: 4 },
  // --- Filets de sécurité (spécificité faible, rulePriority basse) ---
  { zoneCode: null, signalType: 'service_lent', targetCategory: 'serveur', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 10, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'commande', targetCategory: 'serveur', fallbackCategory: 'barman', escalationAfterMin: 5, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'nourriture', targetCategory: 'barman', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'proprete', targetCategory: 'nettoyage', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 10, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'equipement', targetCategory: 'maintenance', fallbackCategory: 'manager', escalationAfterMin: 15, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'temperature', targetCategory: 'maintenance', fallbackCategory: 'manager', escalationAfterMin: 15, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'confort', targetCategory: 'maintenance', fallbackCategory: 'manager', escalationAfterMin: 15, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'conciergerie', targetCategory: 'reception', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'medium', rulePriority: 2 },
  { zoneCode: null, signalType: 'attente', targetCategory: 'reception', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 5, priority: 'medium', rulePriority: 2 },
  // Catch-all → Serveur · 10 min → Maître d'Hôtel
  { zoneCode: null, signalType: null, targetCategory: 'serveur', fallbackCategory: 'maitre_dhotel', escalationAfterMin: 10, priority: 'low', rulePriority: 1 },
]

// ------------------------------------------------------------
// HELPERS JSON SÛRS (SQLite : listes sérialisées)
// ------------------------------------------------------------
export function parseJsonArray<T>(s: string | null | undefined, fallback: T[] = []): T[] {
  if (!s) return fallback
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? (v as T[]) : fallback
  } catch {
    return fallback
  }
}

export function parseJsonObject<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as T) : fallback
  } catch {
    return fallback
  }
}

/**
 * Le staff est-il dans son créneau de shift maintenant ?
 * Pas de shift configuré → toujours de service (mode démo).
 */
export function estDansShift(
  shiftStart: string | null,
  shiftEnd: string | null,
  shiftDays: string | null,
  now: Date = new Date(),
): boolean {
  if (!shiftStart || !shiftEnd) return true
  const jour = now.getDay() // 0=dim … 6=sam
  const jours = parseJsonArray<number>(shiftDays, [0, 1, 2, 3, 4, 5, 6])
  if (jours.length > 0 && !jours.includes(jour)) return false

  const [h1, m1] = shiftStart.split(':').map(Number)
  const [h2, m2] = shiftEnd.split(':').map(Number)
  const cur = now.getHours() * 60 + now.getMinutes()
  const start = (h1 || 0) * 60 + (m1 || 0)
  const end = (h2 || 0) * 60 + (m2 || 0)

  if (end >= start) return cur >= start && cur <= end
  // Shift nocturne (ex: 22:00 → 06:00)
  return cur >= start || cur <= end
}

// ------------------------------------------------------------
// PRIORITÉS
// ------------------------------------------------------------
export const PRIORITE_LABEL: Record<string, string> = {
  low: 'Basse',
  medium: 'Normale',
  high: 'Haute',
  critical: 'Critique',
}

export const PRIORITE_CLASSE: Record<string, string> = {
  low: 'bg-stone-100 text-stone-600 border-stone-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
}

// ------------------------------------------------------------
// SEED TÂCHES PROACTIVES SALON VIP
// ------------------------------------------------------------
export const VIP_SEED_PROACTIVE = [
  {
    title: 'Vérification buffet',
    description: "Contrôle visuel du buffet : réassort, propreté, températures.",
    targetZone: 'vip_buffet',
    targetCategory: 'barman',
    recurrence: 'interval',
    intervalMinutes: 30,
    checklistItems: JSON.stringify([
      { item: 'Plats réassortis', required: true },
      { item: 'Surfaces propres', required: true },
      { item: 'Boissons chaudes disponibles', required: false },
    ]),
    notifyVia: JSON.stringify(['denise']),
    deniseMessage: 'Vérification buffet requise',
  },
  {
    title: 'Contrôle propreté Douches',
    description: 'Passage étage sur les cabines de douche et WC privés.',
    targetZone: 'vip_showers',
    targetCategory: 'nettoyage',
    recurrence: 'interval',
    intervalMinutes: 60,
    checklistItems: JSON.stringify([
      { item: 'Cabines nettoyées', required: true },
      { item: 'Serviettes réassorties', required: true },
    ]),
    notifyVia: JSON.stringify(['denise']),
    deniseMessage: 'Contrôle propreté des douches requis',
  },
  {
    title: 'Ronde Espace Détente',
    description: 'Ronde discrète : fauteuils, niveau sonore, confort client.',
    targetZone: 'vip_relaxation',
    targetCategory: 'serveur',
    recurrence: 'interval',
    intervalMinutes: 45,
    checklistItems: JSON.stringify([{ item: 'Ronde effectuée', required: true }]),
    notifyVia: JSON.stringify(['denise']),
    deniseMessage: 'Ronde Espace Détente à effectuer',
  },
]
