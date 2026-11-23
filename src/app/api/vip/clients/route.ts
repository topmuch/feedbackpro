// ============================================================
// /api/vip/clients — Base Clients VIP (module fondamental)
// ------------------------------------------------------------
// GET  : liste + recherche (q), filtre niveau/compagnie, tri.
// POST : création — consentements RGPD photo/profil requis si
//        photo ou profil fournis. Audit trail à chaque création.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import {
  VIP_LEVELS_VALIDES,
  parseStringArray,
  serialiserVipClient,
  logAudit,
} from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// preferences/allergies : accepte tableau de strings ou JSON string ou string brute
function normaliserListeBrute(input: unknown, max = 20, maxLen = 100): string {
  if (Array.isArray(input)) {
    return JSON.stringify(input.slice(0, max).map((p) => String(p).slice(0, maxLen)))
  }
  if (typeof input === 'string' && input.trim()) {
    try {
      const parsed = JSON.parse(input)
      if (Array.isArray(parsed)) return JSON.stringify(parsed.slice(0, max).map((p) => String(p).slice(0, maxLen)))
    } catch {
      /* string brute */
    }
    return JSON.stringify([input.trim().slice(0, maxLen)])
  }
  return '[]'
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const niveau = searchParams.get('niveau')?.trim()
  const compagnie = searchParams.get('compagnie')?.trim()

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { airline: { contains: q } },
      { boardingPassId: { contains: q } },
    ]
  }
  if (niveau && VIP_LEVELS_VALIDES.has(niveau)) where.vipLevel = niveau
  if (compagnie) where.airline = { contains: compagnie }

  const clients = await db.vipClient.findMany({
    where,
    orderBy: [{ visitCount: 'desc' }, { name: 'asc' }],
    take: 500,
    include: {
      _count: { select: { visits: true, conciergeNotes: true } },
    },
  })

  return ok(
    clients.map((c) => ({
      ...serialiserVipClient(c),
      nbNotes: c._count.conciergeNotes,
    })),
  )
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Body JSON invalide', 400)
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return fail('Paramètres manquants (name requis)', 400)
  }

  const name = body.name.trim().slice(0, 120)
  const photo = typeof body.photo === 'string' && body.photo.trim() ? body.photo.trim().slice(0, 500) : null
  const airline = typeof body.airline === 'string' && body.airline.trim() ? body.airline.trim().slice(0, 80) : null
  const boardingPassId =
    typeof body.boardingPassId === 'string' && body.boardingPassId.trim()
      ? body.boardingPassId.trim().slice(0, 80)
      : null
  const vipLevel =
    typeof body.vipLevel === 'string' && VIP_LEVELS_VALIDES.has(body.vipLevel) ? body.vipLevel : 'gold'

  // RGPD — consentements explicites. Une photo sans consentement photo est refusée.
  const consentPhoto = Boolean(body.consentPhoto)
  const consentProfil = Boolean(body.consentProfil)
  if (photo && !consentPhoto) {
    return fail('Consentement photo requis pour enregistrer une photo (RGPD)', 400)
  }
  if (!consentProfil) {
    return fail('Consentement explicite du client requis pour créer son profil (RGPD)', 400)
  }

  const preferences = normaliserListeBrute(body.preferences)
  const allergies = normaliserListeBrute(body.allergies)
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null

  // Anti-doublon : même nom (insensible à la casse) déjà enregistré
  const doublon = await db.vipClient.findFirst({ where: { name: { contains: name } } })
  if (doublon && doublon.name.toLowerCase() === name.toLowerCase()) {
    return fail('Un client VIP avec ce nom existe déjà (utilisez la fiche existante)', 409)
  }

  const created = await db.vipClient.create({
    data: {
      name,
      photo,
      airline,
      boardingPassId,
      vipLevel,
      preferences,
      allergies,
      consentPhoto,
      consentProfil,
      notes,
      ownerUserId: user.id,
    },
  })

  await logAudit({
    actor: user.email,
    actorRole: 'PRO',
    action: 'CLIENT_CREE',
    cible: created.name,
    detail: `Niveau ${created.vipLevel}${airline ? ` — ${airline}` : ''}`,
  })

  return ok(serialiserVipClient(created), 201)
}
