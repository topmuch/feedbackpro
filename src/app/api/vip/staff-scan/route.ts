// ============================================================
// POST /api/vip/staff-scan
// ------------------------------------------------------------
// QR Staff PWA — un employé VIP scanne une demande de table et
// choisit l'une des deux actions suivantes :
//   • TAKE_CHARGE → status='in_progress', staffName renseigné
//   • RESOLVE     → status='done', staffName renseigné
//
// Le compteur activeRequests de la table est ajusté automatiquement
// selon les transitions de statut (actif ↔ inactif).
//
// Body : { requestId: string, action: 'TAKE_CHARGE' | 'RESOLVE',
//          staffId?: string, staffName?: string }
// Réponse : { ok: true, data: { id, status, staffName, updatedAt } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/vip/staff-scan
// Body: { requestId, action, staffId, staffName }
// action: 'TAKE_CHARGE' → sets status='in_progress', staffName
// action: 'RESOLVE' → sets status='done', staffName
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId : null
  const action = typeof body.action === 'string' ? body.action : null
  const staffName = typeof body.staffName === 'string' ? body.staffName : null

  if (!requestId || !action) {
    return fail('requestId et action requis', 400)
  }

  if (action !== 'TAKE_CHARGE' && action !== 'RESOLVE') {
    return fail('Action invalide (TAKE_CHARGE ou RESOLVE)', 400)
  }

  const current = await db.vipTableRequest.findUnique({ where: { id: requestId } })
  if (!current) {
    return fail('Demande introuvable', 404)
  }

  const newStatus = action === 'TAKE_CHARGE' ? 'in_progress' : 'done'
  const updated = await db.vipTableRequest.update({
    where: { id: requestId },
    data: { status: newStatus, staffName: staffName ?? current.staffName },
  })

  // Adjust activeRequests counter on the table
  // QR_ROUTING — une demande CLIENT_GLOBAL n'a pas de table : rien à
  // décrémenter/incrementer dans ce cas.
  const wasActive = current.status === 'pending' || current.status === 'in_progress'
  const isNowActive = updated.status === 'pending' || updated.status === 'in_progress'
  if (current.tableId && !wasActive && isNowActive) {
    await db.vipTable.update({ where: { id: current.tableId }, data: { activeRequests: { increment: 1 } } })
  } else if (current.tableId && wasActive && !isNowActive) {
    await db.vipTable.update({ where: { id: current.tableId }, data: { activeRequests: { decrement: 1 } } })
  }

  return ok({
    id: updated.id,
    status: updated.status,
    staffName: updated.staffName,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
