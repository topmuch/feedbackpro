// ============================================================
// /api/vip/alerts — Alertes Maître d'Hôtel (mode discrétion)
// ------------------------------------------------------------
// GET   : alertes (filtre status=nouvelle|prise_en_charge|traitee, take).
//         Pollé par le dashboard (bandeau visuel or) et la vue staff.
//         AUCUN son : le mode discrétion impose des alertes VISUELLES.
// PATCH : prise en charge / traitement { id, action: 'prise'|'traite', staffName }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { logAudit } from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')?.trim()
  const take = Math.min(50, Math.max(1, parseInt(searchParams.get('take') ?? '20', 10) || 20))

  const where: Record<string, unknown> = {}
  if (status && ['nouvelle', 'prise_en_charge', 'traitee'].includes(status)) where.status = status

  const alerts = await db.vipGuestAlert.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  })

  return ok(
    alerts.map((a) => ({
      id: a.id,
      vipClientId: a.vipClientId,
      clientName: a.clientName,
      photo: a.photo,
      vipLevel: a.vipLevel,
      airline: a.airline,
      tableNumber: a.tableNumber,
      motif: a.motif,
      detail: a.detail,
      status: a.status,
      destinataire: a.destinataire,
      takenBy: a.takenBy,
      takenAt: a.takenAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
  )
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string') return fail('id requis', 400)

  const alert = await db.vipGuestAlert.findUnique({ where: { id: body.id } })
  if (!alert) return fail('Alerte introuvable', 404)

  if (body.action === 'prise') {
    const updated = await db.vipGuestAlert.update({
      where: { id: alert.id },
      data: {
        status: 'prise_en_charge',
        takenBy: typeof body.staffName === 'string' && body.staffName.trim() ? body.staffName.trim().slice(0, 120) : 'Maître d’Hôtel',
        takenAt: new Date(),
      },
    })
    await logAudit({
      actor: updated.takenBy ?? 'staff',
      actorRole: 'maitre_dhotel',
      action: 'ALERTE_PRISE',
      cible: updated.clientName,
      detail: `Prise en charge VIP ${updated.tableNumber ?? 'salon'}`,
    })
    return ok({ id: updated.id, status: updated.status, takenBy: updated.takenBy })
  }

  if (body.action === 'traite') {
    const updated = await db.vipGuestAlert.update({
      where: { id: alert.id },
      data: { status: 'traitee' },
    })
    await logAudit({
      actor: typeof body.staffName === 'string' && body.staffName.trim() ? body.staffName.trim() : 'staff',
      actorRole: 'maitre_dhotel',
      action: 'ALERTE_TRAITEE',
      cible: updated.clientName,
    })
    return ok({ id: updated.id, status: updated.status })
  }

  return fail('action invalide (prise | traite)', 400)
}
