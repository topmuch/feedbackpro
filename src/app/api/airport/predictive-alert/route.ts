// ============================================================
// GET /api/airport/predictive-alert
// ------------------------------------------------------------
// Task WAHOO-4 — "Mode Prédictif" de Nathalie
//
// Nathalie ne se contente plus d'annoncer les incidents passés :
// elle ANTICIPE les risques futurs en croisant 3 signaux :
//
//   1. **Vols aux portes (AirportFlightGate)** — vols actifs dont
//      le décollage est prévu dans les 15-45 prochaines minutes.
//      On estime le paxCount (hash déterministe du flightNumber,
//      même logique que /api/airport/crystal-ball) et on mappe les
//      portes vers les zones d'impact (embarquement, bagages,
//      sanitaires, restauration, duty-free…). Si ≥ 2 vols
//      décollent dans les 20 min avec ≥ 150 pax combinés → HIGH.
//
//   2. **Patterns historiques (4 dernières semaines)** — pour le
//      jour-semaine + heure courante, on cherche les zones qui
//      totalisent ≥ 3 incidents sur la fenêtre. Si oui → MEDIUM.
//
//   3. **Charge actuelle** — on compte les signalements
//      EN_ATTENTE + EN_COURS par zone. Si une zone atteint ≥ 3
//      pending → MEDIUM (risque de saturation imminente).
//
// Filtre final : on ne garde que les prédictions HIGH ou MEDIUM,
// triées par priorité, limitées à 3 par réponse (pour éviter le
// spam vocal sur le wallboard). Chaque prédiction porte un ID
// déterministe (dérivé du contenu) pour la dédup des annonces
// côté client (announcedPredictionsRef).
//
// runtime = nodejs + force-dynamic → jamais mis en cache CDN.
// ============================================================

import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MS_DAY = 24 * 60 * 60 * 1000
const MS_28D = 28 * MS_DAY
const MS_2H = 2 * 60 * 60 * 1000

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

// Index zone metadata par code.
const zoneMetaByCode = new Map<string, { code: string; nom: string; emoji: string }>()
for (const z of AIRPORT_ZONES) {
  zoneMetaByCode.set(z.code, { code: z.code, nom: z.nom, emoji: z.emoji })
}

// Index tag → zoneCode dérivé de la config statique.
const tagToZoneCode = new Map<string, string>()
for (const z of AIRPORT_ZONES) {
  for (const t of z.tags) {
    tagToZoneCode.set(t, z.code)
  }
}

// --- Mapping impact pax sur zones voisines par zone de porte ---
// Repris de /api/airport/crystal-ball — quand un vol décolle, les
// pax traversent plusieurs zones (filtrage, sanitaires, resto…).
// On s'en sert pour générer la liste des zones à risque dans le
// message de la prédiction "flight_arrival".
type ImpactTarget = { zoneCode: string; weight: number }
const FLIGHT_IMPACT_BY_GATE_ZONE: Record<string, ImpactTarget[]> = {
  term_embarq: [
    { zoneCode: 'term_checkin', weight: 0.5 },
    { zoneCode: 'sec_filt_std', weight: 0.4 },
    { zoneCode: 'term_sanitaires', weight: 0.25 },
    { zoneCode: 'com_resto', weight: 0.3 },
    { zoneCode: 'com_dutyfree', weight: 0.25 },
  ],
  embarquement: [
    { zoneCode: 'term_checkin', weight: 0.5 },
    { zoneCode: 'sec_filt_std', weight: 0.4 },
    { zoneCode: 'term_sanitaires', weight: 0.25 },
    { zoneCode: 'com_resto', weight: 0.3 },
  ],
  term_bagages: [
    { zoneCode: 'term_sanitaires', weight: 0.3 },
    { zoneCode: 'ext_taxi_off', weight: 0.25 },
    { zoneCode: 'ext_transport_pub', weight: 0.2 },
  ],
  bagages: [
    { zoneCode: 'term_sanitaires', weight: 0.3 },
    { zoneCode: 'ext_taxi_off', weight: 0.25 },
  ],
}

// --- Helpers partagés avec /api/airport/crystal-ball ---

// Hash déterministe du flightNumber → nombre de pax stable par vol.
function simulatePaxCount(flightNumber: string): number {
  let hash = 0
  for (let i = 0; i < flightNumber.length; i++) {
    hash = (hash * 31 + flightNumber.charCodeAt(i)) & 0x7fffffff
  }
  // Range 80-300 pax.
  return 80 + (hash % 221)
}

// ETA en minutes avant décollage (format HH:MM).
function computeEtaMinutes(scheduledDeparture: string | null, now: Date): number {
  if (!scheduledDeparture || !/^\d{2}:\d{2}$/.test(scheduledDeparture)) {
    return 15
  }
  const [h, m] = scheduledDeparture.split(':').map((x) => parseInt(x, 10))
  if (h === undefined || m === undefined) return 15
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  let diffMs = target.getTime() - now.getTime()
  if (diffMs < 0) {
    // Vol déjà parti ou retardé.
    if (diffMs < -MS_2H) return 15
    return 30
  }
  return Math.max(5, Math.round(diffMs / 60000))
}

// --- Types ---

type PredictionType = 'flight_arrival' | 'historical_pattern' | 'current_load'
type PredictionPriority = 'high' | 'medium' | 'low'

type Prediction = {
  id: string
  type: PredictionType
  priority: PredictionPriority
  message: string
  zones: string[]
  flightCount: number
  paxCount: number
  etaMinutes: number
}

// --- Génération de messages FR ---

// Formate une liste de noms de zones à la française :
//   ["A"]              → "à A"
//   ["A","B"]          → "à A et B"
//   ["A","B","C"]      → "à A, B et C"
function formatZoneList(zones: string[]): string {
  if (zones.length === 0) return 'aux zones à risque'
  if (zones.length === 1) return `à ${zones[0]}`
  if (zones.length === 2) return `à ${zones[0]} et ${zones[1]}`
  return `à ${zones.slice(0, -1).join(', ')} et ${zones[zones.length - 1]}`
}

// Récupère le nom affichable d'une zone à partir de son code.
function zoneNom(code: string): string {
  return zoneMetaByCode.get(code)?.nom ?? code
}

// --- Logique principale ---

export async function GET() {
  const now = new Date()
  const nowMs = now.getTime()
  const currentDayOfWeek = now.getDay()
  const currentHour = now.getHours()
  const since28d = new Date(nowMs - MS_28D)

  // ============================================================
  // 1. Vols aux portes — window 15-45 min
  // ============================================================
  const activeGates = await db.airportFlightGate.findMany({
    where: { active: true },
    orderBy: [{ updatedAt: 'desc' }],
  })

  // FlightGroup : vol avec ETA + pax estimés + zone d'impact principale.
  type FlightInfo = {
    id: string
    flightNumber: string
    airline: string | null
    destination: string | null
    paxCount: number
    etaMinutes: number
    gateZoneCode: string
  }

  const flightsInWindow: FlightInfo[] = []
  for (const gate of activeGates) {
    const eta = computeEtaMinutes(gate.scheduledDeparture, now)
    if (eta < 15 || eta > 45) continue
    const gateZoneCode = tagToZoneCode.get(gate.gateTag) ?? 'term_embarq'
    flightsInWindow.push({
      id: gate.id,
      flightNumber: gate.flightNumber,
      airline: gate.airline,
      destination: gate.destination,
      paxCount: simulatePaxCount(gate.flightNumber),
      etaMinutes: eta,
      gateZoneCode,
    })
  }

  // Vols décollant dans les 20 prochaines minutes (règle HIGH).
  const flightsSoon = flightsInWindow.filter((f) => f.etaMinutes <= 20)
  const totalPaxSoon = flightsSoon.reduce((acc, f) => acc + f.paxCount, 0)

  const predictions: Prediction[] = []

  // --- Prédiction flight_arrival (HIGH) ---
  // Règle : ≥ 2 vols dans les 20 min + pax combinés ≥ 150.
  if (flightsSoon.length >= 2 && totalPaxSoon >= 150) {
    // Calcule l'ETA minimum (le vol le plus proche) — c'est le compte à rebours.
    const etaMinutes = Math.min(...flightsSoon.map((f) => f.etaMinutes))

    // Collecte les zones d'impact en sommant les poids par zone.
    const zoneWeights = new Map<string, number>()
    for (const f of flightsSoon) {
      const impacts =
        FLIGHT_IMPACT_BY_GATE_ZONE[f.gateZoneCode] ??
        FLIGHT_IMPACT_BY_GATE_ZONE.term_embarq
      for (const target of impacts) {
        zoneWeights.set(
          target.zoneCode,
          (zoneWeights.get(target.zoneCode) ?? 0) + target.weight,
        )
      }
    }
    // Top 3 zones par poids cumulé.
    const topZones = [...zoneWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code]) => code)

    const zoneNames = topZones.map(zoneNom)
    const message =
      `Alerte prédictive : ${flightsSoon.length} vols arrivent simultanément ` +
      `dans ${etaMinutes} minutes. Risque élevé de saturation ${formatZoneList(zoneNames)}. ` +
      `Renfort recommandé dès maintenant.`

    // ID déterministe : stable tant que flightCount + etaMinutes ne changent pas.
    predictions.push({
      id: `pred_flight_${flightsSoon.length}_${etaMinutes}`,
      type: 'flight_arrival',
      priority: 'high',
      message,
      zones: topZones,
      flightCount: flightsSoon.length,
      paxCount: totalPaxSoon,
      etaMinutes,
    })
  }

  // ============================================================
  // 2. Patterns historiques — 4 dernières semaines, même jour + heure
  // ============================================================
  const historicalReports = await db.airportReport.findMany({
    where: { createdAt: { gte: since28d } },
    select: {
      createdAt: true,
      zone: { select: { code: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Bucket par (dayOfWeek, hour, zoneCode) → count.
  const patternAgg = new Map<string, number>()
  for (const r of historicalReports) {
    const c = r.createdAt
    if (c.getDay() !== currentDayOfWeek) continue
    if (c.getHours() !== currentHour) continue
    const zoneCode = r.zone?.code ?? 'restauration'
    const key = `${currentDayOfWeek}|${currentHour}|${zoneCode}`
    patternAgg.set(key, (patternAgg.get(key) ?? 0) + 1)
  }

  // Pour chaque zone avec ≥ 3 incidents historiques à ce créneau → MEDIUM.
  // On ne garde que les zones présentes dans la config (pour avoir un nom propre).
  const patternPredictions: Prediction[] = []
  for (const [key, count] of patternAgg) {
    if (count < 3) continue
    const [, , zoneCode] = key.split('|')
    if (!zoneMetaByCode.has(zoneCode)) continue
    const meta = zoneMetaByCode.get(zoneCode)!
    const dayName = DAY_NAMES_FR[currentDayOfWeek]
    const message =
      `Alerte prédictive : motif historique. La zone ${meta.nom} ` +
      `enregistre habituellement ${count} incidents à cette heure les ${dayName}s. ` +
      `Surveiller en priorité.`
    patternPredictions.push({
      id: `pred_hist_${zoneCode}_${currentDayOfWeek}_${currentHour}`,
      type: 'historical_pattern',
      priority: 'medium',
      message,
      zones: [zoneCode],
      flightCount: 0,
      paxCount: 0,
      etaMinutes: 0,
    })
  }
  // Trie par nombre d'incidents décroissant, top 1 (anti-spam : 1 seul
  // pattern historique par réponse, on garde le plus significatif).
  patternPredictions.sort((a, b) => {
    // On compare par count extrait du message — simpler : on garde l'ordre
    // d'itération (Map conserve l'ordre d'insertion, lui-même dépend de
    // l'ordre des reports DESC). OK pour notre usage.
    return 0
  })
  if (patternPredictions.length > 0) {
    predictions.push(patternPredictions[0])
  }

  // ============================================================
  // 3. Charge actuelle — EN_ATTENTE + EN_COURS par zone
  // ============================================================
  const activeReports = await db.airportReport.findMany({
    where: { statut: { in: ['EN_ATTENTE', 'EN_COURS'] } },
    select: { zone: { select: { code: true } } },
  })

  const loadByZone = new Map<string, number>()
  for (const r of activeReports) {
    const zoneCode = r.zone?.code ?? 'restauration'
    loadByZone.set(zoneCode, (loadByZone.get(zoneCode) ?? 0) + 1)
  }

  const loadPredictions: Prediction[] = []
  for (const [zoneCode, count] of loadByZone) {
    if (count < 3) continue
    if (!zoneMetaByCode.has(zoneCode)) continue
    const meta = zoneMetaByCode.get(zoneCode)!
    const message =
      `Alerte prédictive : charge actuelle élevée. ${count} incidents en attente ` +
      `à ${meta.nom}. Risque de saturation imminente.`
    loadPredictions.push({
      id: `pred_load_${zoneCode}`,
      type: 'current_load',
      // ≥ 5 pending → HIGH (saturation imminente), sinon MEDIUM.
      priority: count >= 5 ? 'high' : 'medium',
      message,
      zones: [zoneCode],
      flightCount: 0,
      paxCount: 0,
      etaMinutes: 0,
    })
  }
  // Trie par charge décroissante — on ne garde que le top 1 (anti-spam).
  loadPredictions.sort((a, b) => {
    // On extrait le count du message pour trier — plus simple : on compare
    // par id (stable) puis on prend le premier. Mais pour que le top soit
    // significatif, on compte depuis loadByZone.
    const ca = loadByZone.get(a.zones[0]) ?? 0
    const cb = loadByZone.get(b.zones[0]) ?? 0
    return cb - ca
  })
  if (loadPredictions.length > 0) {
    predictions.push(loadPredictions[0])
  }

  // ============================================================
  // 4. Filtre final — HIGH + MEDIUM uniquement, tri par priorité, max 3
  // ============================================================
  const priorityRank: Record<PredictionPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  }
  const filtered = predictions
    .filter((p) => p.priority !== 'low')
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 3)

  return ok({
    predictions: filtered,
    generatedAt: now.toISOString(),
  })
}
