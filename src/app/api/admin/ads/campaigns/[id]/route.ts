// ============================================================
// PATCH / DELETE  /api/admin/ads/campaigns/[id]
// ------------------------------------------------------------
// Mise à jour (PATCH) ou suppression (DELETE) d'une campagne.
//
// PATCH : accepte n'importe quel sous-ensemble des champs :
//   { title, imageUrl, landingUrl, zoneCode, priority, startDate,
//     endDate, dailyBudgetViews, priceMonthlyFcfa, status }
//   *** TRIPLE VERROU #2 (BACKEND) *** — si zoneCode est modifié,
//   on re-vérifie isAdEligible. Refus 403 + log si zone interdite.
//
// DELETE : supprime la campagne (cascade sur CampaignSlot + AdStat).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { getZoneByCode, isZoneAdEligibleByCode } from '@/lib/sector-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PatchBody = {
  title?: unknown
  imageUrl?: unknown
  landingUrl?: unknown
  zoneCode?: unknown
  priority?: unknown
  startDate?: unknown
  endDate?: unknown
  dailyBudgetViews?: unknown
  priceMonthlyFcfa?: unknown
  status?: unknown
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  // Vérifie que la campagne existe
  const existing = await db.campaign.findUnique({
    where: { id },
    select: { id: true, advertiserId: true, title: true },
  })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Campagne introuvable' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}

  if (typeof body.title === 'string') {
    const t = body.title.trim()
    if (!t) return fail('Titre ne peut pas être vide', 400)
    data.title = t.slice(0, 200)
  }

  if (body.imageUrl !== undefined) {
    if (typeof body.imageUrl === 'string' && body.imageUrl.trim()) {
      const s = body.imageUrl.trim().slice(0, 2048)
      const isRelative = s.startsWith('/')
      const isData = s.startsWith('data:')
      if (!isRelative && !isData) {
        try {
          new URL(s)
        } catch {
          return fail('imageUrl invalide', 400)
        }
      }
      data.imageUrl = s
    } else {
      data.imageUrl = null
    }
  }

  if (body.landingUrl !== undefined) {
    if (typeof body.landingUrl === 'string' && body.landingUrl.trim()) {
      const s = body.landingUrl.trim().slice(0, 2048)
      const isRelative = s.startsWith('/')
      const isData = s.startsWith('data:')
      if (!isRelative && !isData) {
        try {
          new URL(s)
        } catch {
          return fail('landingUrl invalide', 400)
        }
      }
      data.landingUrl = s
    } else {
      data.landingUrl = null
    }
  }

  // *** TRIPLE VERROU #2 (BACKEND) — re-check sur changement de zone ***
  if (typeof body.zoneCode === 'string') {
    const zoneCode = body.zoneCode.trim()
    if (!zoneCode) return fail('Zone ne peut pas être vide', 400)
    const zoneCfg = getZoneByCode(zoneCode)
    const zoneNom = zoneCfg?.nom ?? zoneCode
    if (!isZoneAdEligibleByCode(zoneCode)) {
      console.warn(
        `[AD1-VERROU] Tentative de re-ciblage d'une campagne sur zone interdite : ` +
          `campaignId=${id}, zoneCode=${zoneCode} (${zoneNom}). Refus 403.`,
      )
      return fail(
        `Zone ${zoneNom} interdite à la publicité. Règle FeedbackPro : jamais sur urgence.`,
        403,
      )
    }
    data.zoneCode = zoneCode
  }

  if (body.priority !== undefined) {
    const p =
      typeof body.priority === 'number'
        ? body.priority
        : Number(body.priority)
    if (!Number.isFinite(p)) return fail('Priority invalide', 400)
    data.priority = Math.max(1, Math.min(10, Math.floor(p)))
  }

  if (typeof body.startDate === 'string') {
    const d = new Date(body.startDate.trim())
    if (Number.isNaN(d.getTime())) return fail('startDate invalide', 400)
    data.startDate = d
  }

  if (body.endDate !== undefined) {
    if (typeof body.endDate === 'string' && body.endDate.trim()) {
      const d = new Date(body.endDate.trim())
      if (Number.isNaN(d.getTime())) return fail('endDate invalide', 400)
      data.endDate = d
    } else {
      data.endDate = null
    }
  }

  if (body.dailyBudgetViews !== undefined) {
    if (
      (typeof body.dailyBudgetViews === 'number' && body.dailyBudgetViews > 0) ||
      (typeof body.dailyBudgetViews === 'string' &&
        /^\d+$/.test(body.dailyBudgetViews.trim()))
    ) {
      data.dailyBudgetViews = Math.floor(Number(body.dailyBudgetViews))
    } else {
      data.dailyBudgetViews = null
    }
  }

  if (body.priceMonthlyFcfa !== undefined) {
    if (
      (typeof body.priceMonthlyFcfa === 'number' && body.priceMonthlyFcfa >= 0) ||
      (typeof body.priceMonthlyFcfa === 'string' &&
        /^\d+$/.test(body.priceMonthlyFcfa.trim()))
    ) {
      data.priceMonthlyFcfa = Math.floor(Number(body.priceMonthlyFcfa))
    } else {
      data.priceMonthlyFcfa = null
    }
  }

  if (typeof body.status === 'string') {
    const s = body.status.trim()
    if (!['draft', 'active', 'paused', 'completed'].includes(s)) {
      return fail('Statut invalide', 400)
    }
    data.status = s
  }

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  const updated = await db.campaign.update({ where: { id }, data })
  return ok({
    campaign: {
      id: updated.id,
      advertiserId: updated.advertiserId,
      title: updated.title,
      imageUrl: updated.imageUrl,
      landingUrl: updated.landingUrl,
      zoneCode: updated.zoneCode,
      priority: updated.priority,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate ? updated.endDate.toISOString() : null,
      dailyBudgetViews: updated.dailyBudgetViews,
      status: updated.status,
      priceMonthlyFcfa: updated.priceMonthlyFcfa,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  const existing = await db.campaign.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'Campagne introuvable' }, { status: 404 })
  }

  await db.campaign.delete({ where: { id } })
  return ok({ id })
}
