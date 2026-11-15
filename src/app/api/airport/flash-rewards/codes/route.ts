// ============================================================
// GET /api/airport/flash-rewards/codes
// ------------------------------------------------------------
// Liste paginée des codes FlashRewardCode (admin). Sert
// l'onglet "Codes générés" du tableau de bord admin qui
// effectue un polling toutes les 15 secondes.
//
// Query :
//   ?campaignId=xxx → filtre par campagne
//   ?limit=100       → nombre max de codes (max 500, défaut 100)
//
// Réponse : { ok: true, data: { codes: [...] } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const campaignId = url.searchParams.get('campaignId')
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100))

  const where = campaignId ? { campaignId } : undefined

  const codes = await db.flashRewardCode.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      campaign: { select: { title: true } },
    },
  })

  const data = codes.map((c) => ({
    id: c.id,
    code: c.code,
    campaignId: c.campaignId,
    campaignTitle: c.campaign?.title ?? null,
    status: c.status,
    reportId: c.reportId,
    zoneCode: c.zoneCode,
    clientIp: c.clientIp,
    createdAt: c.createdAt.toISOString(),
    expiresAt: c.expiresAt.toISOString(),
    scratchedAt: c.scratchedAt ? c.scratchedAt.toISOString() : null,
    usedAt: c.usedAt ? c.usedAt.toISOString() : null,
  }))

  return ok({ codes: data })
}
