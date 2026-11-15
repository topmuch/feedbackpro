// ============================================================
// GET /api/airport/live-score
// ------------------------------------------------------------
// WAHOO-2 — "Live Score" public (hall d'aéroport / bureau du directeur)
// Calcule en temps réel un score de satisfaction (0-100) agrégé sur
// les signalements (AirportReport) des dernières 24h.
//
// Formule :
//   - Départ : 100
//   - EN_ATTENTE            : -2 pts/incident  (plafonné à -30)
//   - EN_COURS > SLA target : -3 pts/incident  (plafonné à -30)
//   - RESOLU > SLA          : -1 pt/incident   (plafonné à -15)
//   - RESOLU ≤ SLA          : +0.5 pt/incident (score plafonné à 100)
//   - Clamp final [0, 100]
//
// Niveau couleur :
//   green  (≥80)  #00A651  "Excellent"
//   orange (60-79)#FF6B00  "À surveiller"
//   red    (<60)  #E30613  "Critique"
//
// Réponse :
//   { ok, data: { score, level, color, label, stats, generatedAt } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Plafonds par pénalité pour éviter qu'une seule rafale ne mette le
// score à 0 de façon irréversible (le score reste recoverable via les
// résolutions rapides).
const CAP_EN_ATTENTE_PENALTY = 30 // 15 incidents max comptés
const CAP_EN_COURS_OVER_SLA_PENALTY = 30 // 10 incidents max comptés
const CAP_RESOLU_OVER_SLA_PENALTY = 15 // 15 incidents max comptés

// SLA par défaut (minutes) quand aucune ligne AirportSla n'est configurée
// pour une zone — cohérent avec le seuil "critique" EN_COURS > 15 min.
const DEFAULT_SLA_MINUTES = 15

// Seuil "critique non résolu" : EN_COURS depuis plus de X minutes.
const CRITICAL_ONGOING_MINUTES = 15

type Level = 'green' | 'orange' | 'red'

function levelFor(score: number): { level: Level; color: string; label: string } {
  if (score >= 80) return { level: 'green', color: '#00A651', label: 'Excellent' }
  if (score >= 60) return { level: 'orange', color: '#FF6B00', label: 'À surveiller' }
  return { level: 'red', color: '#E30613', label: 'Critique' }
}

export async function GET(_req: NextRequest) {
  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000)

  // 1. Tous les signalements des dernières 24h (avec zoneId pour résoudre
  //    le code zone → SLA target).
  const reports = await db.airportReport.findMany({
    where: { createdAt: { gte: since24h } },
    select: {
      id: true,
      statut: true,
      zoneId: true,
      createdAt: true,
      resolvedAt: true,
    },
  })

  // 2. Mapping zoneId → code zone, puis code zone → SLA target (minutes).
  const zones = await db.airportZone.findMany({ select: { id: true, code: true } })
  const zoneCodeById = new Map(zones.map((z) => [z.id, z.code]))

  const slas = await db.airportSla.findMany({ where: { active: true } })
  const slaByZoneCode = new Map(slas.map((s) => [s.zoneCode, s.targetMinutes]))

  function slaForZone(zoneId: string): number {
    const code = zoneCodeById.get(zoneId)
    if (!code) return DEFAULT_SLA_MINUTES
    return slaByZoneCode.get(code) ?? DEFAULT_SLA_MINUTES
  }

  const nowMs = now.getTime()

  // 3. Compteurs et pénalités
  let enAttente = 0
  let enCours = 0
  let enCoursOverSla = 0
  let resoluWithinSla = 0
  let resoluOverSla = 0
  let criticalUnresolved = 0

  for (const r of reports) {
    const statut = r.statut
    if (statut === 'EN_ATTENTE') {
      enAttente++
      continue
    }
    if (statut === 'EN_COURS') {
      enCours++
      const elapsedMin = (nowMs - r.createdAt.getTime()) / 60000
      const target = slaForZone(r.zoneId)
      if (elapsedMin > target) {
        enCoursOverSla++
      }
      // Critique = EN_COURS depuis plus de CRITICAL_ONGOING_MINUTES minutes
      if (elapsedMin > CRITICAL_ONGOING_MINUTES) {
        criticalUnresolved++
      }
      continue
    }
    if (statut === 'RESOLU') {
      if (!r.resolvedAt) {
        // RESOLU sans resolvedAt : on ne peut pas calculer le SLA → traité
        // comme "dans les temps" par défaut (pas de pénalité).
        resoluWithinSla++
        continue
      }
      const durationMin = (r.resolvedAt.getTime() - r.createdAt.getTime()) / 60000
      const target = slaForZone(r.zoneId)
      if (durationMin >= 0 && durationMin <= target) {
        resoluWithinSla++
      } else {
        resoluOverSla++
      }
    }
  }

  // 4. Calcul du score avec plafonds par pénalité
  const enAttentePenalty = Math.min(enAttente * 2, CAP_EN_ATTENTE_PENALTY)
  const enCoursOverSlaPenalty = Math.min(
    enCoursOverSla * 3,
    CAP_EN_COURS_OVER_SLA_PENALTY,
  )
  const resoluOverSlaPenalty = Math.min(
    resoluOverSla * 1,
    CAP_RESOLU_OVER_SLA_PENALTY,
  )
  const resoluWithinSlaBonus = resoluWithinSla * 0.5

  let score =
    100 -
    enAttentePenalty -
    enCoursOverSlaPenalty -
    resoluOverSlaPenalty +
    resoluWithinSlaBonus
  score = Math.max(0, Math.min(100, score))
  const rounded = Math.round(score)

  const { level, color, label } = levelFor(rounded)

  const total24h = reports.length
  const resolved = reports.filter((r) => r.statut === 'RESOLU').length
  const pending = enAttente
  const ongoing = enCours

  return ok({
    score: rounded,
    level,
    color,
    label,
    stats: {
      total24h,
      resolved,
      pending,
      ongoing,
      criticalUnresolved,
    },
    generatedAt: now.toISOString(),
  })
}
