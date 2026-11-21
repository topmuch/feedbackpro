// ============================================================
// POST /api/routing/route — Déclencheur manuel du moteur
// ------------------------------------------------------------
// Deux modes (session requise — manager ou superadmin) :
//   A) { incidentId, incidentKind } → recharge l'incident depuis la
//      BDD (zone/type/priorité) et le route.
//   B) { zone, signalType, priority, incidentId?… } → routage direct.
//
// Utilisé par le bouton « Routage auto » des interfaces manager.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { routerIncident } from '@/lib/routing-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body) return fail('Payload JSON invalide', 400)

  const tenantKey = typeof body.tenantKey === 'string' ? body.tenantKey : 'vip_lounge'

  // Mode A — incident existant
  if (typeof body.incidentId === 'string' && body.incidentId && typeof body.incidentKind === 'string') {
    const kind = body.incidentKind as 'airport_report' | 'vip_request'
    if (kind === 'airport_report') {
      const report = await db.airportReport.findUnique({
        where: { id: body.incidentId },
        include: { zone: { select: { code: true, nom: true } } },
      })
      if (!report) return fail('Signalement introuvable', 404)
      const decision = await routerIncident({
        tenantKey,
        incidentKind: 'airport_report',
        incidentId: report.id,
        incidentLabel: `${report.problemType} — ${report.zone?.nom ?? 'zone ?'}`,
        zone: report.zone?.code ?? null,
        signalType: report.problemType,
        priority: body.priority ?? null,
      })
      return ok(decision)
    }
    if (kind === 'vip_request') {
      const request = await db.vipTableRequest.findUnique({
        where: { id: body.incidentId },
        include: { table: { select: { zone: true, tableNumber: true } } },
      })
      if (!request) return fail('Demande introuvable', 404)
      const meta = (() => {
        try {
          return JSON.parse(request.metadata) as { tags?: string[]; description?: string }
        } catch {
          return {}
        }
      })()
      const label =
        request.type === 'problem'
          ? `${meta.description || (meta.tags ?? []).join(', ') || 'Problème'} — ${request.table?.tableNumber ?? request.contextZone ?? 'salon'}`
          : `${request.type} — ${request.table?.tableNumber ?? request.contextZone ?? 'salon'}`
      const decision = await routerIncident({
        tenantKey,
        incidentKind: 'vip_request',
        incidentId: request.id,
        incidentLabel: label,
        zone: request.table?.zone ?? request.contextZone ?? null,
        signalType: request.type === 'problem' ? (meta.tags?.[0] ?? null) : request.type,
        priority: body.priority ?? null,
      })
      return ok(decision)
    }
    return fail('incidentKind invalide (airport_report | vip_request)', 400)
  }

  // Mode B — routage direct
  const decision = await routerIncident({
    tenantKey,
    incidentKind: (['airport_report', 'vip_request', 'proactive'].includes(body.incidentKind) ? body.incidentKind : 'airport_report') as
      | 'airport_report'
      | 'vip_request'
      | 'proactive',
    incidentId: typeof body.incidentId === 'string' ? body.incidentId : undefined,
    incidentLabel: typeof body.incidentLabel === 'string' ? body.incidentLabel : undefined,
    zone: body.zone ?? null,
    signalType: body.signalType ?? null,
    priority: body.priority ?? null,
  })
  return ok(decision)
}
