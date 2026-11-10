// ============================================================
// GET /api/airport/reports
// ------------------------------------------------------------
// Liste les signalements aéroport (vue ops/management).
// Filtres optionnels : ?zone=bagages&statut=EN_ATTENTE&limit=50
//
// Public pour l'instant (démo). En production, protéger par
// un cookie de session ops-aéroport (requireAirportOps).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const zoneCode = url.searchParams.get('zone')
  const statut = url.searchParams.get('statut')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)

  const where: { zoneId?: string; statut?: string } = {}
  if (zoneCode) {
    const zone = await db.airportZone.findUnique({ where: { code: zoneCode }, select: { id: true } })
    if (!zone) return fail(`Zone inconnue : ${zoneCode}`, 404)
    where.zoneId = zone.id
  }
  if (statut) where.statut = statut

  const reports = await db.airportReport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { zone: { select: { code: true, nom: true, emoji: true } } },
  })

  return ok({
    reports: reports.map((r) => ({
      id: r.id,
      zone: r.zone,
      tagScanne: r.tagScanne,
      problemType: r.problemType,
      commentaire: r.commentaire,
      photoUrl: r.photoUrl,
      photoCategory: r.photoCategory,
      routedTeam: r.routedTeam,
      photoAnalysis: r.photoAnalysis,
      flightNumber: r.flightNumber,
      whatsappOptin: r.whatsappOptin,
      whatsappPhone: r.whatsappPhone,
      statut: r.statut,
      whatsappPayload: r.whatsappPayload,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    })),
    count: reports.length,
  })
}
