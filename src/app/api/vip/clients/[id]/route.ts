// ============================================================
// /api/vip/clients/[id] — Fiche client VIP
// ------------------------------------------------------------
// GET    : détail complet (visites, notes concierge, alertes).
// PATCH  : modification (nom, photo, compagnie, niveau, préférences,
//          allergies, consentements, notes) + audit.
// DELETE : PURGE RGPD — suppression totale et irréversible du profil
//          (cascade visites / notes / alertes) sur demande du client.
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

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  const client = await db.vipClient.findUnique({
    where: { id },
    include: {
      visits: { orderBy: { createdAt: 'desc' }, take: 50 },
      conciergeNotes: { orderBy: { createdAt: 'desc' }, take: 50 },
      guestAlerts: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  })
  if (!client) return fail('Client VIP introuvable', 404)

  return ok({
    ...serialiserVipClient(client),
    visits: client.visits.map((v) => ({
      id: v.id,
      canal: v.canal,
      tableNumber: v.tableNumber,
      detection: v.detection,
      createdAt: v.createdAt.toISOString(),
    })),
    conciergeNotes: client.conciergeNotes.map((n) => ({
      id: n.id,
      auteur: n.auteur,
      contenu: n.contenu,
      type: n.type,
      createdAt: n.createdAt.toISOString(),
    })),
    guestAlerts: client.guestAlerts.map((a) => ({
      id: a.id,
      motif: a.motif,
      detail: a.detail,
      status: a.status,
      tableNumber: a.tableNumber,
      createdAt: a.createdAt.toISOString(),
    })),
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  const existing = await db.vipClient.findUnique({ where: { id } })
  if (!existing) return fail('Client VIP introuvable', 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Body JSON invalide', 400)

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return fail('Nom invalide', 400)
    data.name = body.name.trim().slice(0, 120)
  }
  if (body.photo !== undefined) {
    const photo = typeof body.photo === 'string' && body.photo.trim() ? body.photo.trim().slice(0, 500) : null
    const consentPhoto = body.consentPhoto !== undefined ? Boolean(body.consentPhoto) : existing.consentPhoto
    if (photo && !consentPhoto) {
      return fail('Consentement photo requis pour enregistrer une photo (RGPD)', 400)
    }
    data.photo = photo
    data.consentPhoto = consentPhoto
  }
  if (body.airline !== undefined) {
    data.airline = typeof body.airline === 'string' && body.airline.trim() ? body.airline.trim().slice(0, 80) : null
  }
  if (body.boardingPassId !== undefined) {
    data.boardingPassId =
      typeof body.boardingPassId === 'string' && body.boardingPassId.trim()
        ? body.boardingPassId.trim().slice(0, 80)
        : null
  }
  if (body.vipLevel !== undefined) {
    if (typeof body.vipLevel !== 'string' || !VIP_LEVELS_VALIDES.has(body.vipLevel)) {
      return fail('Niveau VIP invalide (gold | platinum | diamond)', 400)
    }
    data.vipLevel = body.vipLevel
  }
  if (body.preferences !== undefined) {
    const prefs = parseStringArray(body.preferences).slice(0, 20).map((p) => p.slice(0, 100))
    data.preferences = JSON.stringify(prefs)
  }
  if (body.allergies !== undefined) {
    const alg = parseStringArray(body.allergies).slice(0, 20).map((p) => p.slice(0, 100))
    data.allergies = JSON.stringify(alg)
  }
  if (body.consentPhoto !== undefined && data.consentPhoto === undefined) {
    // Retrait de consentement photo → purge de la photo (RGPD)
    const consent = Boolean(body.consentPhoto)
    data.consentPhoto = consent
    if (!consent) data.photo = null
  }
  if (body.consentProfil !== undefined) {
    data.consentProfil = Boolean(body.consentProfil)
  }
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null
  }

  const updated = await db.vipClient.update({ where: { id }, data })

  await logAudit({
    actor: user.email,
    actorRole: 'PRO',
    action: 'CLIENT_MODIFIE',
    cible: updated.name,
    detail: `Champs : ${Object.keys(data).join(', ')}`,
  })

  return ok(serialiserVipClient(updated))
}

// PURGE RGPD — "Purge sur demande" : suppression totale du profil et de
// l'historique (visites, notes, alertes en cascade), tracée dans l'audit.
export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const { id } = await params
  const existing = await db.vipClient.findUnique({ where: { id } })
  if (!existing) return fail('Client VIP introuvable', 404)

  await db.vipClient.delete({ where: { id } })

  await logAudit({
    actor: user.email,
    actorRole: 'PRO',
    action: 'PURGE_RGPD',
    cible: existing.name,
    detail: `Purge totale sur demande — profil, ${existing.visitCount} visite(s), notes et alertes supprimés`,
  })

  return ok({ purged: true, name: existing.name })
}
