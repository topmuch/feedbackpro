// ============================================================
// /api/vip/clients — VipClient (TENANT-3 — VIP Lounge Phase 1)
// ------------------------------------------------------------
// GET  : liste tous les VipClients (triés par visitCount desc).
// POST : crée un nouveau VipClient.
//        Body : { name, photo?, airline?, vipLevel?, preferences?, notes? }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VIP_LEVELS_VALIDES = new Set(['gold', 'platinum', 'diamond'])

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const clients = await db.vipClient.findMany({
    orderBy: [{ visitCount: 'desc' }, { name: 'asc' }],
    take: 200,
  })

  return ok(
    clients.map((c) => ({
      id: c.id,
      name: c.name,
      photo: c.photo ?? null,
      airline: c.airline ?? null,
      vipLevel: c.vipLevel,
      boardingPassId: c.boardingPassId ?? null,
      preferences: c.preferences,
      visitCount: c.visitCount,
      lastVisit: c.lastVisit?.toISOString() ?? null,
      notes: c.notes ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  )
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return fail('Paramètres manquants (name requis)', 400)
  }

  const name = body.name.trim().slice(0, 120)
  const photo = typeof body.photo === 'string' && body.photo.trim() ? body.photo.trim() : null
  const airline = typeof body.airline === 'string' && body.airline.trim() ? body.airline.trim().slice(0, 80) : null
  const vipLevel =
    typeof body.vipLevel === 'string' && VIP_LEVELS_VALIDES.has(body.vipLevel) ? body.vipLevel : 'gold'

  // preferences : accepte un tableau de strings ou un JSON string
  let preferencesJson = '[]'
  if (Array.isArray(body.preferences)) {
    try {
      preferencesJson = JSON.stringify(body.preferences.slice(0, 20).map((p) => String(p).slice(0, 100)))
    } catch {
      preferencesJson = '[]'
    }
  } else if (typeof body.preferences === 'string' && body.preferences.trim()) {
    // Si déjà un JSON valide, on garde tel quel ; sinon on encapsule
    try {
      JSON.parse(body.preferences)
      preferencesJson = body.preferences
    } catch {
      preferencesJson = JSON.stringify([body.preferences.trim().slice(0, 100)])
    }
  }

  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null

  const created = await db.vipClient.create({
    data: {
      name,
      photo,
      airline,
      vipLevel,
      preferences: preferencesJson,
      notes,
    },
  })

  return ok(
    {
      id: created.id,
      name: created.name,
      photo: created.photo,
      airline: created.airline,
      vipLevel: created.vipLevel,
      boardingPassId: created.boardingPassId,
      preferences: created.preferences,
      visitCount: created.visitCount,
      lastVisit: created.lastVisit?.toISOString() ?? null,
      notes: created.notes,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    201,
  )
}
