// ============================================================
// /api/vip/showers — Module Salon VIP (TENANT-3)
// ------------------------------------------------------------
// GET    : liste des douches (ShowerStatus). Si la table est vide,
//          on la seede avec 4 douches libres (boot initial).
// PATCH  : mise à jour du statut (free → occupied → cleaning → free).
//          Body : { id, status }
//          Si status = 'occupied', on timestamp occupiedSince.
//          Si status = 'free', on clear occupiedSince.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUTS_VALIDES = new Set(['free', 'occupied', 'cleaning'])
const DEFAULT_SHOWER_COUNT = 4
// Auto-libération : usage 20 min + nettoyage 10 min + marge 15 min.
// Une cabine restée occupied/cleaning au-delà est réputée abandonnée
// (staff parti sans PATCH / no-show) → repasse automatiquement "free".
// Corrige le bug « douche indisponible pendant 3373 minutes ».
const SHOWER_STALE_MIN = 45

/**
 * Libère les cabines dont l'occupation ou le nettoyage est périmé.
 * Idempotent, appelé avant chaque lecture (GET) — jamais de faux
 * "occupée depuis 3373 min" ne survit à cette passe.
 */
async function libererDouchesPerimees(): Promise<void> {
  const limite = new Date(Date.now() - SHOWER_STALE_MIN * 60_000)
  await db.showerStatus.updateMany({
    where: {
      status: { in: ['occupied', 'cleaning'] },
      OR: [
        { occupiedSince: { lt: limite } },
        { occupiedSince: null, updatedAt: { lt: limite } },
      ],
    },
    data: { status: 'free', occupiedSince: null },
  })
}

async function ensureSeeded(): Promise<void> {
  const count = await db.showerStatus.count()
  if (count > 0) return
  // Seed initial : 4 douches libres
  await db.showerStatus.createMany({
    data: Array.from({ length: DEFAULT_SHOWER_COUNT }, (_, i) => ({
      showerNumber: i + 1,
      status: 'free',
    })),
  })
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  await ensureSeeded()
  await libererDouchesPerimees()
  const showers = await db.showerStatus.findMany({
    orderBy: { showerNumber: 'asc' },
  })

  return ok(
    showers.map((s) => ({
      id: s.id,
      showerNumber: s.showerNumber,
      status: s.status as 'free' | 'occupied' | 'cleaning',
      occupiedSince: s.occupiedSince ? s.occupiedSince.toISOString() : null,
      updatedAt: s.updatedAt.toISOString(),
    })),
  )
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || typeof body.status !== 'string') {
    return fail('Paramètres manquants (id + status)', 400)
  }
  if (!STATUTS_VALIDES.has(body.status)) {
    return fail('Statut invalide', 400)
  }

  const existing = await db.showerStatus.findUnique({ where: { id: body.id } })
  if (!existing) return fail('Douche introuvable', 404)

  const nextStatus = body.status as 'free' | 'occupied' | 'cleaning'
  const occupiedSince = nextStatus === 'occupied' ? new Date() : null

  await db.showerStatus.update({
    where: { id: body.id },
    data: { status: nextStatus, occupiedSince },
  })

  return ok({ id: body.id, status: nextStatus })
}
