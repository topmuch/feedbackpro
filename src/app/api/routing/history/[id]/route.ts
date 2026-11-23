// ============================================================
// PATCH /api/routing/history/[id] — Cycle de vie d'une tâche routée
// ------------------------------------------------------------
// Body : { action: 'accept' | 'resolve' | 'fail' | 'reassign' }
//   accept   → outcome 'accepted' + responseTimeSec (prise en charge)
//   resolve  → outcome 'resolved' + resolutionTimeSec + open=false
//              (+ résolution de l'incident source si lié)
//   fail     → outcome 'failed' + open=false
//   reassign → re-déclenche le moteur pour l'incident lié
// Session requise (staff, manager ou superadmin).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { routerIncident } from '@/lib/routing-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!['accept', 'resolve', 'fail', 'reassign'].includes(action)) {
    return fail('Action invalide (accept | resolve | fail | reassign)', 400)
  }

  const ligne = await db.routingHistory.findUnique({ where: { id } })
  if (!ligne) return fail('Tâche de routage introuvable', 404)

  const maintenant = Date.now()

  if (action === 'accept') {
    await db.routingHistory.update({
      where: { id },
      data: {
        outcome: 'accepted',
        responseTimeSec: Math.round((maintenant - ligne.createdAt.getTime()) / 1000),
      },
    })
    // Répercute sur l'incident source
    if (ligne.incidentKind === 'airport_report' && ligne.incidentId) {
      await db.airportReport.update({ where: { id: ligne.incidentId }, data: { statut: 'EN_COURS' } }).catch(() => {})
    }
    if (ligne.incidentKind === 'vip_request' && ligne.incidentId) {
      await db.vipTableRequest.update({ where: { id: ligne.incidentId }, data: { status: 'in_progress' } }).catch(() => {})
    }
    return ok({ id, outcome: 'accepted' })
  }

  if (action === 'resolve') {
    await db.routingHistory.update({
      where: { id },
      data: {
        outcome: 'resolved',
        open: false,
        responseTimeSec: ligne.responseTimeSec ?? Math.round((maintenant - ligne.createdAt.getTime()) / 1000),
        resolutionTimeSec: Math.round((maintenant - ligne.createdAt.getTime()) / 1000),
      },
    })
    if (ligne.incidentKind === 'airport_report' && ligne.incidentId) {
      await db.airportReport
        .update({ where: { id: ligne.incidentId }, data: { statut: 'RESOLU', resolvedAt: new Date() } })
        .catch(() => {})
    }
    if (ligne.incidentKind === 'vip_request' && ligne.incidentId) {
      await db.vipTableRequest.update({ where: { id: ligne.incidentId }, data: { status: 'done' } }).catch(() => {})
    }
    return ok({ id, outcome: 'resolved' })
  }

  if (action === 'fail') {
    await db.routingHistory.update({ where: { id }, data: { outcome: 'failed', open: false } })
    return ok({ id, outcome: 'failed' })
  }

  // reassign — le moteur re-choisit (exclut implicitement le staff
  // surchargé via l'anti-surcharge)
  if (!ligne.incidentId) {
    return fail('Impossible de réassigner une tâche sans incident lié', 400)
  }
  const decision = await routerIncident({
    tenantKey: ligne.tenantKey,
    incidentKind: ligne.incidentKind as 'airport_report' | 'vip_request' | 'proactive',
    incidentId: ligne.incidentId,
    incidentLabel: ligne.incidentLabel ?? undefined,
    zone: ligne.zoneCode,
    signalType: ligne.signalType,
    priority: (ligne.priority as 'low' | 'medium' | 'high' | 'critical') ?? null,
  })
  // L'ancienne ligne est marquée failed (remplacée par la nouvelle)
  await db.routingHistory.update({ where: { id }, data: { outcome: 'failed', open: false } }).catch(() => {})
  return ok({ id, reassigned: decision })
}
