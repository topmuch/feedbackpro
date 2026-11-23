// ============================================================
// /api/vip/buffet — Module Salon VIP (TENANT-3)
// ------------------------------------------------------------
// GET    : liste des items buffet (BuffetChecklist). Si la table est
//          vide, on la seede avec 3 items par défaut :
//            - buffet_fill   (niveau buffet)
//            - drinks_level  (niveau boissons)
//            - cleanliness   (propreté)
//          Chaque item a un nextCheck = lastCheck + 30 min (timer).
//
//          FIX BUG TIMER 4024 MIN : si un item est en retard depuis
//          PLUS DE 2× l'intervalle (données périmées — salon fermé,
//          seed jamais rafraîchi…), on REBASE le cycle : lastCheck
//          = maintenant, nextCheck = maintenant + 30 min. Sinon le
//          dashboard affichait « dernière vérification il y a 4024
//          min » (≈ 2,8 jours) — pas premium du tout. Les retards
//          RAISONNABLES (≤ 2× intervalle) sont conservés : l'alerte
//          « Vérification buffet requise » reste fonctionnelle.
//
// PATCH  : deux modes :
//          - { id, fillLevel } → met à jour le niveau + reset timer.
//          - { id, snoozeMin } → « Reporter 15 min » : décale UNIQUE
//            le nextCheck (lastCheck intact, fillLevel intact).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INTERVAL_MINUTES = 30
// Au-delà de ce retard (2× l'intervalle), les données sont considérées
// périmées → rebase du cycle au lieu d'afficher un timer absurde.
const STALE_AFTER_MIN = INTERVAL_MINUTES * 2
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

/**
 * Rebase les items PÉRIMÉS (retard > 2× intervalle) : le cycle
 * reprend à maintenant. Retourne le nombre d'items rebasés.
 */
async function rebaseStaleItems(): Promise<number> {
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MIN * 60_000)
  const stale = await db.buffetChecklist.findMany({
    where: { nextCheck: { lt: staleCutoff } },
  })
  if (stale.length === 0) return 0
  const now = new Date()
  const next = new Date(now.getTime() + INTERVAL_MINUTES * 60_000)
  await db.buffetChecklist.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { lastCheck: now, nextCheck: next },
  })
  return stale.length
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
  // FIX 4024 min : rebase silencieux des items périmés (> 2× intervalle)
  await rebaseStaleItems()
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
  if (!body || typeof body.id !== 'string') {
    return fail('Paramètres manquants (id requis)', 400)
  }

  const existing = await db.buffetChecklist.findUnique({ where: { id: body.id } })
  if (!existing) return fail('Item introuvable', 404)

  // --- Mode « Reporter 15 min » (snooze) : décale UNIQUEMENT le timer.
  // Le fillLevel et la dernière vérification restent intacts.
  if (typeof body.snoozeMin === 'number' && typeof body.fillLevel !== 'number') {
    const snoozeMin = Math.max(1, Math.min(180, Math.round(body.snoozeMin)))
    const now = new Date()
    const nextCheck = new Date(now.getTime() + snoozeMin * 60_000)
    await db.buffetChecklist.update({
      where: { id: body.id },
      data: { nextCheck },
    })
    return ok({ id: body.id, snoozeMin, nextCheck: nextCheck.toISOString() })
  }

  // --- Mode standard : mise à jour du niveau + reset du cycle.
  if (typeof body.fillLevel !== 'number') {
    return fail('Paramètres manquants (fillLevel ou snoozeMin)', 400)
  }
  const fillLevel = Math.max(0, Math.min(100, Math.round(body.fillLevel)))

  const now = new Date()
  const nextCheck = new Date(now.getTime() + INTERVAL_MINUTES * 60_000)
  const status = statusFromFill(fillLevel)

  await db.buffetChecklist.update({
    where: { id: body.id },
    data: { fillLevel, lastCheck: now, nextCheck, status },
  })

  return ok({ id: body.id, fillLevel, status })
}
