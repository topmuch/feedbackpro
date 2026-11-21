// ============================================================
// /api/vip/incidents — Module Salon VIP (TENANT-3)
// ------------------------------------------------------------
// GET    : liste des signalements VIP (AirportReport filtré sur
//          les 6 zones vip_lounge).
// PATCH  : mise à jour du statut (EN_ATTENTE → EN_COURS → RESOLU).
//          Body : { id, statut }
//
// Le module VIP ne doit JAMAIS accéder aux signalements de l'aéroport
// ou des compagnies : on filtre strictement par les codes de zones
// vip_lounge.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { getZonesByTenant } from '@/lib/airport-config'
import { cloturerRoutagePourIncident } from '@/lib/routing-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VIP_ZONE_CODES = getZonesByTenant('vip_lounge').map((z) => z.code)
const STATUTS_VALIDES = new Set(['EN_ATTENTE', 'EN_COURS', 'RESOLU'])

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const since = new Date(Date.now() - 48 * 3600 * 1000)
  const zones = await db.airportZone.findMany({
    where: { code: { in: VIP_ZONE_CODES } },
    select: { id: true, code: true, nom: true, emoji: true },
  })
  const zoneIds = zones.map((z) => z.id)

  const reports = await db.airportReport.findMany({
    where: {
      zoneId: { in: zoneIds },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const zoneById = new Map(zones.map((z) => [z.id, z]))

  return ok(
    reports.map((r) => ({
      id: r.id,
      zone: zoneById.get(r.zoneId) ?? null,
      problemType: r.problemType,
      commentaire: r.commentaire ?? null,
      statut: r.statut as 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU',
      createdAt: r.createdAt.toISOString(),
      // Phase 2 — affectation staff (alertes douces → « Assigner à… »)
      assignedTo: r.assignedTo ?? null,
    })),
  )
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string') {
    return fail('Paramètres manquants (id requis)', 400)
  }

  const report = await db.airportReport.findUnique({
    where: { id: body.id },
    include: { zone: { select: { code: true } } },
  })
  if (!report) return fail('Signalement introuvable', 404)
  if (!report.zone || !VIP_ZONE_CODES.includes(report.zone.code)) {
    return fail('Accès refusé : ce signalement n\'appartient pas au module VIP', 403)
  }

  // --- Phase 2 — affectation staff seule (alertes douces « Assigner à… ») ---
  if (typeof body.assignedTo === 'string' && typeof body.statut !== 'string') {
    const assignee = body.assignedTo.trim().slice(0, 80)
    await db.airportReport.update({
      where: { id: body.id },
      data: { assignedTo: assignee || null },
    })
    return ok({ id: body.id, assignedTo: assignee || null })
  }

  if (typeof body.statut !== 'string') {
    return fail('Paramètres manquants (statut ou assignedTo)', 400)
  }
  if (!STATUTS_VALIDES.has(body.statut)) {
    return fail('Statut invalide', 400)
  }

  const nextStatut = body.statut as 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'
  const resolvedAt = nextStatut === 'RESOLU' ? new Date() : null

  await db.airportReport.update({
    where: { id: body.id },
    data: { statut: nextStatut, resolvedAt },
  })

  // --- MOTEUR DE ROUTAGE — clôture du cycle de vie de la tâche ---
  // EN_COURS → prise en charge (responseTimeSec) ; RESOLU → résolu
  // (resolutionTimeSec + compteur de charge décrémenté).
  if (nextStatut === 'EN_COURS') {
    cloturerRoutagePourIncident(body.id, 'accepted').catch(() => {})
  } else if (nextStatut === 'RESOLU') {
    cloturerRoutagePourIncident(body.id, 'resolved').catch(() => {})
  }

  return ok({ id: body.id, statut: nextStatut })
}
