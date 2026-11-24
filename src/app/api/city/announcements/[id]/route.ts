// ============================================================
// /api/city/announcements/[id]
// ------------------------------------------------------------
// DELETE → supprime une annonce.
// PATCH  → met à jour le statut ou les champs d'une annonce.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set(['draft', 'scheduled', 'active', 'expired'])

// ---------------------------------------------------------------
// DELETE — supprimer une annonce
// ---------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID requis', 400)

  try {
    await db.cityAnnouncement.delete({ where: { id } })
    return ok({ deleted: id })
  } catch {
    return fail('Annonce introuvable', 404)
  }
}

// ---------------------------------------------------------------
// PATCH — mettre à jour le statut ou les champs
// ---------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID requis', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    status?: string
    title?: string
    message?: string
    audioText?: string
    priority?: string
  }

  const data: Record<string, unknown> = {}
  if (b.status && VALID_STATUSES.has(b.status)) data.status = b.status
  if (typeof b.title === 'string' && b.title.trim().length >= 3)
    data.title = b.title.trim().slice(0, 120)
  if (typeof b.message === 'string' && b.message.trim().length >= 5)
    data.message = b.message.trim().slice(0, 1000)
  if (typeof b.audioText === 'string') data.audioText = b.audioText.trim().slice(0, 500)
  if (b.priority && ['normal', 'urgent', 'info'].includes(b.priority))
    data.priority = b.priority

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ valide à mettre à jour', 400)
  }

  try {
    const updated = await db.cityAnnouncement.update({
      where: { id },
      data,
    })
    return ok({
      announcement: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
      },
    })
  } catch {
    return fail('Annonce introuvable', 404)
  }
}
