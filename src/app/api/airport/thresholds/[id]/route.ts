// ============================================================
// PUT    /api/airport/thresholds/[id]
// DELETE /api/airport/thresholds/[id]
// ------------------------------------------------------------
// Met à jour ou supprime un seuil d'alerte existant.
//
// PUT body : { threshold?, active?, zoneCode?, type? }
//   - tous les champs sont optionnels (PATCH sémantique via PUT)
//   - zones/types validés comme pour POST
//
// DELETE : supprime le seuil. Idempotent (404 si introuvable).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const THRESHOLD_TYPES = [
  'SPIKE_15MIN',
  'SPIKE_30MIN',
  'SPIKE_1H',
  'PENDING_COUNT',
  'NO_RESOLUTION_HOURS',
] as const
type ThresholdType = (typeof THRESHOLD_TYPES)[number]

const ZONE_CODES = ['ALL', ...AIRPORT_ZONES.map((z) => z.code)]

function isThresholdType(s: string): s is ThresholdType {
  return (THRESHOLD_TYPES as readonly string[]).includes(s)
}

function serialize(t: {
  id: string
  zoneCode: string
  type: string
  threshold: number
  active: boolean
  lastTriggeredAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: t.id,
    zoneCode: t.zoneCode,
    type: t.type as ThresholdType,
    threshold: t.threshold,
    active: t.active,
    lastTriggeredAt: t.lastTriggeredAt ? t.lastTriggeredAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!id) return fail('id manquant', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    threshold?: number
    active?: boolean
    zoneCode?: string
    type?: string
  }

  const existing = await db.airportAlertThreshold.findUnique({ where: { id } })
  if (!existing) {
    return fail('Seuil introuvable', 404)
  }

  const updates: {
    threshold?: number
    active?: boolean
    zoneCode?: string
    type?: string
  } = {}

  if (b.threshold !== undefined) {
    const n =
      typeof b.threshold === 'string' ? parseInt(b.threshold, 10) : b.threshold
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 1000) {
      return fail('threshold doit être un nombre entre 1 et 1000', 400)
    }
    updates.threshold = Math.round(n)
  }

  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') {
      return fail('active doit être un booléen', 400)
    }
    updates.active = b.active
  }

  if (b.zoneCode !== undefined) {
    if (!ZONE_CODES.includes(b.zoneCode)) {
      return fail(
        `zoneCode invalide : ${b.zoneCode}. Valeurs acceptées : ${ZONE_CODES.join(', ')}`,
        400,
      )
    }
    updates.zoneCode = b.zoneCode
  }

  if (b.type !== undefined) {
    if (!isThresholdType(b.type)) {
      return fail(
        `type invalide. Valeurs acceptées : ${THRESHOLD_TYPES.join(', ')}`,
        400,
      )
    }
    updates.type = b.type
  }

  if (Object.keys(updates).length === 0) {
    return ok({ threshold: serialize(existing) })
  }

  const updated = await db.airportAlertThreshold.update({
    where: { id },
    data: updates,
  })

  console.log(
    `[airport-thresholds] PUT — seuil ${updated.id} mis à jour (${Object.keys(updates).join(', ')})`,
  )

  return ok({ threshold: serialize(updated) })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!id) return fail('id manquant', 400)

  const existing = await db.airportAlertThreshold.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) {
    // Idempotent : 404 si introuvable
    return fail('Seuil introuvable', 404)
  }

  await db.airportAlertThreshold.delete({ where: { id } })
  console.log(`[airport-thresholds] DELETE — seuil ${id} supprimé`)

  return ok({ deleted: true, id })
}
