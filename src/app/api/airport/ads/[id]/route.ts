// ============================================================
// GET / DELETE  /api/airport/ads/[id]
// ------------------------------------------------------------
// DELETE → supprime une publicité (superadmin).
// GET    → renvoie la liste complète des publicités (actives +
//          inactives) avec stats impressions / clicks (pour le
//          dashboard admin).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AdAdmin = {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  ctaText: string
  active: boolean
  clicks: number
  impressions: number
  createdAt: string
  updatedAt: string
}

function serializeAdmin(a: {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  ctaText: string
  active: boolean
  clicks: number
  impressions: number
  createdAt: Date
  updatedAt: Date
}): AdAdmin {
  return {
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    imageUrl: a.imageUrl,
    linkUrl: a.linkUrl,
    ctaText: a.ctaText,
    active: a.active,
    clicks: a.clicks,
    impressions: a.impressions,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

// ---------- GET : liste complète pour le dashboard admin ----------
export async function GET() {
  const ads = await db.airportAd.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return ok({ ads: ads.map(serializeAdmin) })
}

// ---------- DELETE : suppression ----------
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  const existing = await db.airportAd.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return fail('Publicité introuvable', 404)

  await db.airportAd.delete({ where: { id } })
  return ok({ id })
}

// ---------- PATCH : toggle active/inactive ----------
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  let body: { active?: unknown }
  try {
    body = (await req.json()) as { active?: unknown }
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  if (typeof body.active !== 'boolean') {
    return fail('`active` (booléen) est requis', 400)
  }

  const existing = await db.airportAd.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return fail('Publicité introuvable', 404)

  const updated = await db.airportAd.update({
    where: { id },
    data: { active: body.active },
  })

  return ok({ ad: serializeAdmin(updated) })
}
