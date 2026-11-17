// ============================================================
// /api/airline/incidents — Module Compagnie Aérienne (TENANT-3)
// ------------------------------------------------------------
// GET    : liste des incidents compagnie (AirportReport filtré sur
//          les 4 zones airline : term_checkin, term_embarq,
//          airline_baggage_office, airline_waiting_room).
// PATCH  : mise à jour du statut (EN_ATTENTE → EN_COURS → RESOLU).
//          Body : { id, statut }
//
// Le module compagnie ne doit JAMAIS accéder aux signalements
// d'autres compagnies ou de l'infrastructure aéroport : on filtre
// strictement par les codes de zones airline.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { getZonesByTenant } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Codes des zones airline (source airport-config)
const AIRLINE_ZONE_CODES = getZonesByTenant('airline').map((z) => z.code)

const STATUTS_VALIDES = new Set(['EN_ATTENTE', 'EN_COURS', 'RESOLU'])

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  // On charge les AirportReport des dernières 48h dont la zone fait
  // partie des codes airline. On ne remonte QUE les signalements de
  // la compagnie (filtrage strict par zone).
  const since = new Date(Date.now() - 48 * 3600 * 1000)
  const zones = await db.airportZone.findMany({
    where: { code: { in: AIRLINE_ZONE_CODES } },
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

  // Map zoneId → { code, nom, emoji }
  const zoneById = new Map(zones.map((z) => [z.id, z]))

  return ok(
    reports.map((r) => ({
      id: r.id,
      zone: zoneById.get(r.zoneId) ?? null,
      tagScanne: r.tagScanne,
      problemType: r.problemType,
      flightNumber: r.flightNumber ?? null,
      commentaire: r.commentaire ?? null,
      photoUrl: r.photoUrl ?? null,
      statut: r.statut as 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU',
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    })),
  )
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || typeof body.statut !== 'string') {
    return fail('Paramètres manquants (id + statut)', 400)
  }
  if (!STATUTS_VALIDES.has(body.statut)) {
    return fail('Statut invalide', 400)
  }

  // Garde-fou : on ne modifie QUE les reports dont la zone est airline.
  const report = await db.airportReport.findUnique({
    where: { id: body.id },
    include: { zone: { select: { code: true } } },
  })
  if (!report) return fail('Signalement introuvable', 404)
  if (!report.zone || !AIRLINE_ZONE_CODES.includes(report.zone.code)) {
    return fail('Accès refusé : ce signalement ne appartient pas au module compagnie', 403)
  }

  const nextStatut = body.statut as 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'
  const resolvedAt = nextStatut === 'RESOLU' ? new Date() : null

  await db.airportReport.update({
    where: { id: body.id },
    data: { statut: nextStatut, resolvedAt },
  })

  return ok({ id: body.id, statut: nextStatut })
}
