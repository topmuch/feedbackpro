// ============================================================
// GET /api/airport/reports
// ------------------------------------------------------------
// Liste les signalements aéroport (vue ops/management).
// Filtres optionnels : ?zone=bagages&statut=EN_ATTENTE&limit=50
//
// Validation : si `statut` est fourni mais ne fait pas partie de
// {EN_ATTENTE, EN_COURS, RESOLU}, renvoie 400.
//
// Public pour l'instant (démo). En production, protéger par
// un cookie de session ops-aéroport (requireAirportOps).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUTS = new Set(['EN_ATTENTE', 'EN_COURS', 'RESOLU'])

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const zoneCode = url.searchParams.get('zone')
  const statut = url.searchParams.get('statut')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)

  // B10 : validation stricte du filtre statut
  if (statut && !VALID_STATUTS.has(statut)) {
    return fail(
      `Statut invalide : "${statut}". Valeurs acceptées : EN_ATTENTE, EN_COURS, RESOLU.`,
      400,
    )
  }

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

  // ---------------------------------------------------------------
  // Batch fetch des staffScans (TAKE_CHARGE + RESOLVE uniquement)
  // pour éviter un N+1. On ne remonte pas REPORT_ISSUE car non lié.
  // Tri ASC createdAt → TAKE_CHARGE avant RESOLVE dans l'UI.
  // ---------------------------------------------------------------
  const reportIds = reports.map((r) => r.id)
  const staffScans =
    reportIds.length > 0
      ? await db.airportStaffScan.findMany({
          where: {
            reportId: { in: reportIds },
            action: { in: ['TAKE_CHARGE', 'RESOLVE'] },
          },
          select: {
            id: true,
            action: true,
            photoUrl: true,
            staffName: true,
            createdAt: true,
            reportId: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : []

  // Index by reportId pour un attachage O(1)
  const scansByReport = new Map<string, typeof staffScans>()
  for (const s of staffScans) {
    if (!s.reportId) continue
    const list = scansByReport.get(s.reportId) ?? []
    list.push(s)
    scansByReport.set(s.reportId, list)
  }

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
      // Feature 2 — destinataire de l'affectation (whatsapp/email/push)
      assignedTo: r.assignedTo,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      // Task B (Phase 3) — photos AVANT/APRÈS prises par le staff
      staffScans: (scansByReport.get(r.id) ?? []).map((s) => ({
        id: s.id,
        action: s.action,
        photoUrl: s.photoUrl,
        staffName: s.staffName,
        createdAt: s.createdAt,
      })),
    })),
    count: reports.length,
  })
}
