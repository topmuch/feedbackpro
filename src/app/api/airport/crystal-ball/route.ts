// ============================================================
// GET /api/airport/crystal-ball
// ------------------------------------------------------------
// "Crystal Ball" — Prédictions avancées combinant :
//   1. Vols actifs aux portes (AirportFlightGate) → impact pax
//      sur les zones voisines.
//   2. Patterns historiques (4 dernières semaines) → récurrence
//      par jour-semaine + heure (ex: "vendredi 14h, sanitaires
//      T1 ont 3+ incidents").
//   3. Météo simulée (saison + seed date) → modulateur de risque
//      (pluie = +20% extérieur, soleil = stable).
//   4. Recommandations auto dérivées des prédictions + patterns.
//
// Route publique (dashboard admin). runtime = nodejs +
// force-dynamic → jamais mis en cache CDN.
//
// Sortie (enveloppe ok/data) :
//   {
//     ok: true,
//     data: {
//       generatedAt: ISO,
//       weather: { condition, temperature, impact },
//       predictions: [
//         {
//           id, flightNumber, airline, destination, paxCount,
//           etaMinutes, gateTag, zoneCode, zoneNom, emoji,
//           riskScore, riskPercent, riskReason,
//           patternMatched: { ... } | null,
//           recommendation, actionLabel
//         }
//       ],
//       patterns: [
//         { dayOfWeek, dayName, hour, zoneCode, zoneNom, emoji,
//           occurrenceCount, avgIncidents, totalIncidents, message }
//       ],
//       recommendations: [
//         { type: 'flight'|'pattern', priority: 'high'|'medium'|'low',
//           message, zoneCode }
//       ]
//     }
//   }
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
const DAY_NAMES_FR_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

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
// Quand un vol est à une porte (embarquement), les pax vont
// traverser plusieurs zones : filtrage sûreté, sanitaires,
// restauration, duty-free, etc. On définit ici l'impact relatif
// (en % additionnel) par zone voisine pour un vol moyen.
type ImpactTarget = { zoneCode: string; weight: number; reason: string }
const FLIGHT_IMPACT_BY_GATE_ZONE: Record<string, ImpactTarget[]> = {
  term_embarq: [
    { zoneCode: 'term_checkin', weight: 0.5, reason: 'Pax check-in avant embarquement' },
    { zoneCode: 'sec_filt_std', weight: 0.4, reason: 'Pax passent le filtrage sûreté' },
    { zoneCode: 'term_sanitaires', weight: 0.25, reason: 'Pax utilisent sanitaires avant embarquement' },
    { zoneCode: 'com_resto', weight: 0.3, reason: 'Pax achètent food/duty-free' },
    { zoneCode: 'com_dutyfree', weight: 0.25, reason: 'Pax visitent duty-free' },
  ],
  embarquement: [
    { zoneCode: 'term_checkin', weight: 0.5, reason: 'Pax check-in avant embarquement' },
    { zoneCode: 'sec_filt_std', weight: 0.4, reason: 'Pax passent le filtrage sûreté' },
    { zoneCode: 'term_sanitaires', weight: 0.25, reason: 'Pax utilisent sanitaires avant embarquement' },
    { zoneCode: 'com_resto', weight: 0.3, reason: 'Pax achètent food/duty-free' },
  ],
  term_bagages: [
    { zoneCode: 'term_sanitaires', weight: 0.3, reason: 'Pax attendant bagages utilisent sanitaires' },
    { zoneCode: 'ext_taxi_off', weight: 0.25, reason: 'Pax prennent taxi après récupération' },
    { zoneCode: 'ext_transport_pub', weight: 0.2, reason: 'Pax prennent transport public' },
  ],
}

// Recommandations par code zone (cahier des charges V2.0).
const RECO_BY_ZONE: Record<string, string> = {
  term_checkin: 'Ouvrir 2 guichets supplémentaires',
  term_bagages: 'Vérifier tapis bagages — anticiper pic d\'attente',
  sec_filt_std: 'Rouvrir une file de filtrage prioritaire',
  term_sanitaires: 'Renforcer équipe nettoyage — pic d\'usage',
  term_san_pmr: 'Vérifier accès PMR — pic d\'usage',
  com_resto: 'Anticiper pic restauration — préparer stocks',
  com_dutyfree: 'Renforcer personnel boutique — pic d\'achats',
  com_lounge: 'Vérifier capacité lounge — pic d\'affluence',
  ext_taxi_off: 'Prévenir station taxis — pic de demande',
  ext_transport_pub: 'Coordonner avec transporteurs — pic de demande',
  ext_depose_min: 'Anticiper congestion dépose-minute',
  ext_park_p1: 'Vérifier barrières parking — pic d\'entrée',
  ext_park_p2: 'Vérifier navette P2 — pic de demande',
  sec_filt_fast: 'Activer file prioritaire — pic d\'affluence',
  sec_paf: 'Rouvrir guichets PAF — pic d\'attente',
  term_embarq: 'Vérifier porte et affichage — pic d\'embarquement',
  embarquement: 'Vérifier porte et affichage — pic d\'embarquement',
  srv_enfants: 'Surveiller aire de jeux — pic d\'affluence',
  srv_priere: 'Vérifier propreté espace prière',
  srv_medical: 'Vérifier présence infirmerie',
  urg_sos: 'Vérifier fonctionnement borne SOS',
  bagages: 'Vérifier tapis bagages — pic d\'attente',
  sanitaires: 'Renforcer équipe nettoyage — pic d\'usage',
  files_attente: 'Ouvrir guichets supplémentaires — pic d\'attente',
  restauration: 'Anticiper pic restauration — vérifier disponibilités',
}

const ACTION_LABELS: Record<string, string> = {
  term_checkin: 'Pré-positionner équipes check-in',
  term_bagages: 'Pré-positionner équipes bagages',
  sec_filt_std: 'Activer file prioritaire',
  sec_filt_fast: 'Activer file prioritaire',
  sec_paf: 'Ouvrir guichets PAF',
  term_sanitaires: 'Envoyer équipe nettoyage',
  term_san_pmr: 'Envoyer équipe nettoyage PMR',
  com_resto: 'Préparer stocks restauration',
  com_dutyfree: 'Renforcer personnel boutique',
  com_lounge: 'Vérifier capacité lounge',
  ext_taxi_off: 'Prévenir station taxis',
  ext_transport_pub: 'Coordonner transporteurs',
  ext_depose_min: 'Réguler dépose-minute',
  ext_park_p1: 'Vérifier barrières P1',
  ext_park_p2: 'Vérifier navette P2',
  term_embarq: 'Préparer porte embarquement',
  embarquement: 'Préparer porte embarquement',
  bagages: 'Pré-positionner équipes bagages',
  sanitaires: 'Envoyer équipe nettoyage',
  files_attente: 'Ouvrir guichets supplémentaires',
  restauration: 'Préparer stocks restauration',
}

// --- Weather simulation ---
type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy'
type Weather = { condition: WeatherCondition; label: string; temperature: number; impact: number; description: string }

function simulateWeather(now: Date): Weather {
  const month = now.getMonth() // 0-11
  // Détermine la saison (hémisphère nord).
  let season: 'winter' | 'spring' | 'summer' | 'autumn'
  if (month <= 1 || month === 11) season = 'winter'
  else if (month >= 2 && month <= 4) season = 'spring'
  else if (month >= 5 && month <= 7) season = 'summer'
  else season = 'autumn'

  // Seed déterministe par jour : même météo sur toute la journée.
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / MS_DAY,
  )
  const seed = (dayOfYear * 2654435761) % 1000
  const rand = seed / 1000

  let condition: WeatherCondition
  let label: string
  let temperature: number
  let impact: number // modulateur de risque appliqué aux zones extérieures
  let description: string

  if (season === 'summer') {
    temperature = 24 + Math.round((rand * 12)) // 24-36°C
    if (rand < 0.7) { condition = 'sunny'; label = 'Ensoleillé'; impact = 0; description = 'Ciel dégagé — pas d\'impact sur les flux' }
    else if (rand < 0.9) { condition = 'cloudy'; label = 'Nuageux'; impact = 5; description = 'Couvert — léger report vers intérieur' }
    else { condition = 'stormy'; label = 'Orageux'; impact = 25; description = 'Orages — retards vols probables, congestion terminaux' }
  } else if (season === 'winter') {
    temperature = -2 + Math.round(rand * 12) // -2 à 10°C
    if (rand < 0.4) { condition = 'cloudy'; label = 'Couvert'; impact = 10; description = 'Couvert — flux normaux' }
    else if (rand < 0.7) { condition = 'rainy'; label = 'Pluvieux'; impact = 20; description = 'Pluie — report des flux vers intérieur (+20% extérieur)' }
    else if (rand < 0.9) { condition = 'snowy'; label = 'Neige'; impact = 40; description = 'Neige — retards vols, congestion terminaux (+40%)' }
    else { condition = 'sunny'; label = 'Ensoleillé (froid)'; impact = 5; description = 'Beau temps froid — flux normaux' }
  } else if (season === 'autumn') {
    temperature = 8 + Math.round(rand * 12) // 8-20°C
    if (rand < 0.5) { condition = 'cloudy'; label = 'Couvert'; impact = 8; description = 'Couvert — flux normaux' }
    else if (rand < 0.85) { condition = 'rainy'; label = 'Pluvieux'; impact = 20; description = 'Pluie — report vers intérieur (+20% extérieur)' }
    else { condition = 'sunny'; label = 'Ensoleillé'; impact = 0; description = 'Beau temps — flux normaux' }
  } else {
    // spring
    temperature = 12 + Math.round(rand * 12) // 12-24°C
    if (rand < 0.6) { condition = 'sunny'; label = 'Ensoleillé'; impact = 0; description = 'Beau temps — flux normaux' }
    else if (rand < 0.85) { condition = 'cloudy'; label = 'Nuageux'; impact = 5; description = 'Couvert — flux normaux' }
    else { condition = 'rainy'; label = 'Pluvieux'; impact = 15; description = 'Pluie — report vers intérieur (+15% extérieur)' }
  }

  return { condition, label, temperature, impact, description }
}

// --- Pax count simulator ---
// Hash déterministe du flightNumber → nombre de pax stable par vol.
function simulatePaxCount(flightNumber: string): number {
  let hash = 0
  for (let i = 0; i < flightNumber.length; i++) {
    hash = (hash * 31 + flightNumber.charCodeAt(i)) & 0x7fffffff
  }
  // Range 80-300 pax.
  return 80 + (hash % 221)
}

// --- ETA simulator : minutes avant décollage ---
function computeEtaMinutes(scheduledDeparture: string | null, now: Date): number {
  if (!scheduledDeparture || !/^\d{2}:\d{2}$/.test(scheduledDeparture)) {
    // Pas d'heure prévue → on suppose 15 min (mock).
    return 15
  }
  const [h, m] = scheduledDeparture.split(':').map((x) => parseInt(x, 10))
  const target = new Date(now)
  target.setHours(h!, m!, 0, 0)
  let diffMs = target.getTime() - now.getTime()
  // Si le décollage est passé aujourd'hui, on suppose qu'il est dans le futur
  // (vol le lendemain ou heure ajustée) → on prend 15 min par défaut.
  if (diffMs < 0) {
    // Si plus de 2h passé → c'est probablement un vol déjà parti, on mock 15.
    if (diffMs < -MS_2H) return 15
    // Entre 0 et -2h : vol retardé, ETA = +30 min.
    return 30
  }
  return Math.max(5, Math.round(diffMs / 60000))
}

type Prediction = {
  id: string
  flightNumber: string
  airline: string | null
  destination: string | null
  paxCount: number
  etaMinutes: number
  gateTag: string
  zoneCode: string
  zoneNom: string
  emoji: string
  riskScore: number       // 0-100
  riskPercent: number     // % d'impact additionnel sur la zone
  riskReason: string
  patternMatched: {
    dayName: string
    hour: number
    avgIncidents: number
    message: string
  } | null
  recommendation: string
  actionLabel: string
}

type Pattern = {
  dayOfWeek: number
  dayName: string
  hour: number
  zoneCode: string
  zoneNom: string
  emoji: string
  occurrenceCount: number  // nb de {day,hour} distincts avec données
  avgIncidents: number     // moyenne d'incidents par occurrence
  totalIncidents: number
  message: string
}

type Recommendation = {
  type: 'flight' | 'pattern' | 'weather'
  priority: 'high' | 'medium' | 'low'
  message: string
  zoneCode: string | null
}

export async function GET() {
  const now = new Date()
  const nowMs = now.getTime()
  const since28d = new Date(nowMs - MS_28D)

  const weather = simulateWeather(now)

  // --- 1. Vols actifs aux portes ---
  const activeGates = await db.airportFlightGate.findMany({
    where: { active: true },
    orderBy: [{ updatedAt: 'desc' }],
  })

  // --- 2. Patterns historiques : reports des 4 dernières semaines ---
  // On groupe par (dayOfWeek, hour, zoneCode) et on cherche les
  // combinaisons récurrentes avec >= 3 incidents moyens par occurrence.
  const historicalReports = await db.airportReport.findMany({
    where: { createdAt: { gte: since28d } },
    select: {
      createdAt: true,
      zone: { select: { code: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Bucket : key = `${dayOfWeek}|${hour}|${zoneCode}` → { count, occurrences:Set }
  type PatAgg = { dayOfWeek: number; hour: number; zoneCode: string; count: number; dayHourKeys: Set<string> }
  const patAggBy = new Map<string, PatAgg>()
  for (const r of historicalReports) {
    const c = r.createdAt
    const dayOfWeek = c.getDay()
    const hour = c.getHours()
    const zoneCode = r.zone?.code ?? 'restauration'
    const key = `${dayOfWeek}|${hour}|${zoneCode}`
    let agg = patAggBy.get(key)
    if (!agg) {
      agg = { dayOfWeek, hour, zoneCode, count: 0, dayHourKeys: new Set<string>() }
      patAggBy.set(key, agg)
    }
    agg.count++
    // Marqueur d'occurrence : YYYY-MM-DD + hour (une occurrence = un créneau horaire unique)
    const dayKey = `${c.getFullYear()}-${c.getMonth()}-${c.getDate()}-${hour}`
    agg.dayHourKeys.add(dayKey)
  }

  // Construit la liste des patterns : avgIncidents >= 3 ET occurrenceCount >= 2.
  const patterns: Pattern[] = []
  for (const agg of patAggBy.values()) {
    const occurrenceCount = agg.dayHourKeys.size
    if (occurrenceCount < 2) continue
    const avgIncidents = agg.count / occurrenceCount
    if (avgIncidents < 3) continue
    const meta = zoneMetaByCode.get(agg.zoneCode) ?? zoneMetaByCode.get('restauration')!
    patterns.push({
      dayOfWeek: agg.dayOfWeek,
      dayName: DAY_NAMES_FR[agg.dayOfWeek],
      hour: agg.hour,
      zoneCode: agg.zoneCode,
      zoneNom: meta.nom,
      emoji: meta.emoji,
      occurrenceCount,
      avgIncidents: Math.round(avgIncidents * 10) / 10,
      totalIncidents: agg.count,
      message: `Tous les ${DAY_NAMES_FR[agg.dayOfWeek]}s à ${agg.hour}h, ${meta.nom} ont ${avgIncidents.toFixed(1)} incidents moyens`,
    })
  }
  patterns.sort((a, b) => b.avgIncidents - a.avgIncidents)
  const topPatterns = patterns.slice(0, 10)

  // Index pattern par (dayOfWeek, hour, zoneCode) pour lookup rapide.
  const patternIndex = new Map<string, Pattern>()
  for (const p of patterns) {
    patternIndex.set(`${p.dayOfWeek}|${p.hour}|${p.zoneCode}`, p)
  }

  // --- 3. Prédictions par vol actif ---
  const predictions: Prediction[] = []
  for (const gate of activeGates) {
    const paxCount = simulatePaxCount(gate.flightNumber)
    const etaMinutes = computeEtaMinutes(gate.scheduledDeparture, now)
    const gateZoneCode = tagToZoneCode.get(gate.gateTag) ?? 'term_embarq'
    const impactTargets = FLIGHT_IMPACT_BY_GATE_ZONE[gateZoneCode] ?? FLIGHT_IMPACT_BY_GATE_ZONE.term_embarq

    for (const target of impactTargets) {
      const meta = zoneMetaByCode.get(target.zoneCode) ?? zoneMetaByCode.get('restauration')!
      // Risk percent : (pax * 0.36 * weight), capped at 95%.
      // 180 pax * 0.36 = 64.8 → ~65% sur la zone principale.
      const baseRisk = Math.min(95, Math.round(paxCount * 0.36 * target.weight))
      // Modulateur météo : +weather.impact si zone extérieure.
      const isExterior = target.zoneCode.startsWith('ext_')
      const weatherImpact = isExterior ? weather.impact : 0
      const riskPercent = Math.min(99, baseRisk + weatherImpact)

      // Risk score 0-100 (mapping progressif).
      const riskScore = Math.min(100, Math.round(riskPercent * 1.0))

      // Pattern matching : cherche un pattern pour (dayOfWeek, hour, zoneCode).
      const dayOfWeek = now.getDay()
      const hour = now.getHours()
      const patternKey = `${dayOfWeek}|${hour}|${target.zoneCode}`
      const matched = patternIndex.get(patternKey) ?? null

      const riskReason = `${paxCount} pax ${etaMinutes <= 30 ? 'décollant' : 'en transit'} dans ${etaMinutes}min → ${target.reason.toLowerCase()} → +${riskPercent}%`
      const reco = RECO_BY_ZONE[target.zoneCode] ?? 'Surveiller la zone'
      const actionLabel = ACTION_LABELS[target.zoneCode] ?? 'Pré-positionner équipes'

      predictions.push({
        id: `${gate.id}-${target.zoneCode}`,
        flightNumber: gate.flightNumber,
        airline: gate.airline,
        destination: gate.destination,
        paxCount,
        etaMinutes,
        gateTag: gate.gateTag,
        zoneCode: target.zoneCode,
        zoneNom: meta.nom,
        emoji: meta.emoji,
        riskScore,
        riskPercent,
        riskReason,
        patternMatched: matched
          ? {
              dayName: matched.dayName,
              hour: matched.hour,
              avgIncidents: matched.avgIncidents,
              message: matched.message,
            }
          : null,
        recommendation: reco,
        actionLabel,
      })
    }
  }

  // Tri : par riskScore décroissant.
  predictions.sort((a, b) => b.riskScore - a.riskScore)

  // --- 4. Recommandations auto dérivées ---
  const recommendations: Recommendation[] = []

  // 4a. Prédictions à haut risque (>= 50%)
  for (const p of predictions) {
    if (p.riskScore >= 50) {
      recommendations.push({
        type: 'flight',
        priority: p.riskScore >= 70 ? 'high' : 'medium',
        message: `Vol ${p.flightNumber} (${p.paxCount} pax) → ${p.zoneNom} : ${p.recommendation}`,
        zoneCode: p.zoneCode,
      })
    }
  }

  // 4b. Patterns historiques détectés (top 3)
  for (const pat of topPatterns.slice(0, 3)) {
    recommendations.push({
      type: 'pattern',
      priority: pat.avgIncidents >= 5 ? 'high' : 'medium',
      message: `${pat.message}. Recommandation : ${RECO_BY_ZONE[pat.zoneCode] ?? 'renforcer la zone'}`,
      zoneCode: pat.zoneCode,
    })
  }

  // 4c. Météo
  if (weather.impact >= 20) {
    recommendations.push({
      type: 'weather',
      priority: weather.impact >= 30 ? 'high' : 'medium',
      message: `Météo ${weather.label.toLowerCase()} (${weather.description}). Anticiper congestion zones intérieures (terminaux, sanitaires, restauration).`,
      zoneCode: null,
    })
  }

  // Dédoublonnage par message.
  const seenMsg = new Set<string>()
  const dedupedRecos = recommendations.filter((r) => {
    if (seenMsg.has(r.message)) return false
    seenMsg.add(r.message)
    return true
  })

  return ok({
    generatedAt: now.toISOString(),
    weather: {
      condition: weather.condition,
      label: weather.label,
      temperature: weather.temperature,
      impact: weather.impact,
      description: weather.description,
    },
    predictions,
    patterns: topPatterns,
    recommendations: dedupedRecos,
  })
}
