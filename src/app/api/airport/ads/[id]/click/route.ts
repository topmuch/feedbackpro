// ============================================================
// POST /api/airport/ads/[id]/click
// ------------------------------------------------------------
// Incrémente le compteur de clics quand un voyageur clique sur le
// CTA d'une publicité (avant de suivre le lien externe).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  const existing = await db.airportAd.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return fail('Publicité introuvable', 404)

  await db.airportAd.update({
    where: { id },
    data: { clicks: { increment: 1 } },
  })

  return ok({ id, clicked: true })
}
