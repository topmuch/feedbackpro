// ============================================================
// /api/vip/buffet — Module Salon VIP (TENANT-3)
// ------------------------------------------------------------
// GET    : liste des items buffet (BuffetChecklist). Si la table est
//          vide, on la seede avec 3 items par défaut :
//            - buffet_fill   (niveau buffet)
//            - drinks_level  (niveau boissons)
//            - cleanliness   (propreté)
//          Chaque item a un nextCheck = lastCheck + 30 min (timer).
// PATCH  : mise à jour du niveau de remplissage (fillLevel).
//          Body : { id, fillLevel }
//          Recalcule status (ok / warning / critical) + lastCheck +
//          nextCheck (now + 30 min) pour réinitialiser le timer.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INTERVAL_MINUTES = 30
const DEFAULT_ITEMS = ['buffet_fill', 'drinks_level', 'cleanliness'] as const

async function ensureSeeded(): Promise<void> {
  const count = await db.buffetChecklist.count()
  if (count > 0) return
  const now = new Date()
  const next = new Date(now.getTime() + INTERVAL_MINUTES * 60_000)
  await db.buffetChecklist.createMany({
    data: DEFAULT_ITEMS.map((item) => ({
      item,
      fillLevel: 100,
      lastCheck: now,
      nextCheck: next,
      status: 'ok' as const,
    })),
  })
}

function statusFromFill(fill: number): 'ok' | 'warning' | 'critical' {
  if (fill <= 20) return 'critical'
  if (fill <= 50) return 'warning'
  return 'ok'
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  await ensureSeeded()
  const items = await db.buffetChecklist.findMany({
    orderBy: { item: 'asc' },
  })

  return ok(
    items.map((b) => ({
      id: b.id,
      item: b.item,
      fillLevel: b.fillLevel,
      lastCheck: b.lastCheck.toISOString(),
      nextCheck: b.nextCheck.toISOString(),
      status: b.status as 'ok' | 'warning' | 'critical',
    })),
  )
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || typeof body.fillLevel !== 'number') {
    return fail('Paramètres manquants (id + fillLevel)', 400)
  }
  const fillLevel = Math.max(0, Math.min(100, Math.round(body.fillLevel)))

  const existing = await db.buffetChecklist.findUnique({ where: { id: body.id } })
  if (!existing) return fail('Item introuvable', 404)

  const now = new Date()
  const nextCheck = new Date(now.getTime() + INTERVAL_MINUTES * 60_000)
  const status = statusFromFill(fillLevel)

  await db.buffetChecklist.update({
    where: { id: body.id },
    data: { fillLevel, lastCheck: now, nextCheck, status },
  })

  return ok({ id: body.id, fillLevel, status })
}
