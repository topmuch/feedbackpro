// ============================================================
// /api/vip/clients/[id]/notes — Notes concierge horodatées
// ------------------------------------------------------------
// POST : ajoute une note concierge ("préfère rosé",
//        "allergie arachides", "coin calme préféré"...).
// GET  : liste des notes du client.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { logAudit } from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const TYPES_VALIDES = new Set(['concierge', 'allergie', 'preference', 'service'])

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  const notes = await db.vipClientNote.findMany({
    where: { vipClientId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return ok(
    notes.map((n) => ({
      id: n.id,
      auteur: n.auteur,
      contenu: n.contenu,
      type: n.type,
      createdAt: n.createdAt.toISOString(),
    })),
  )
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  const client = await db.vipClient.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!client) return fail('Client VIP introuvable', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body.contenu !== 'string' || !body.contenu.trim()) {
    return fail('Contenu de note requis', 400)
  }

  const type = typeof body.type === 'string' && TYPES_VALIDES.has(body.type) ? body.type : 'concierge'
  const auteur =
    typeof body.auteur === 'string' && body.auteur.trim() ? body.auteur.trim().slice(0, 120) : 'Concierge'

  const created = await db.vipClientNote.create({
    data: {
      vipClientId: id,
      auteur,
      contenu: body.contenu.trim().slice(0, 500),
      type,
    },
  })

  await logAudit({
    actor: user.email,
    actorRole: 'PRO',
    action: 'NOTE_AJOUTEE',
    cible: client.name,
    detail: `[${type}] ${created.contenu.slice(0, 120)}`,
  })

  return ok(
    {
      id: created.id,
      auteur: created.auteur,
      contenu: created.contenu,
      type: created.type,
      createdAt: created.createdAt.toISOString(),
    },
    201,
  )
}
