// ============================================================
// GET / PATCH / DELETE  /api/airport/flash-rewards/[id]
// ------------------------------------------------------------
// Détail + mutation d'une campagne Flash Rewards.
//
// GET    → renvoie la campagne + annonceur + compte des codes
//          par statut (unused/scratched/used/expired).
// PATCH  → met à jour partiellement la campagne (mêmes champs
//          que POST sur /api/airport/flash-rewards).
// DELETE → supprime la campagne (cascade codes + stats).
//
// Réponse enveloppe { ok, data } | { ok: false, error }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_REWARD_TYPES = new Set(['percentage', 'fixed_amount', 'free_article', 'gift'])
const VALID_STATUSES = new Set(['active', 'paused', 'expired'])

function str(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  const t = v.trim()
  return t.slice(0, max)
}
function strOrNull(v: unknown, max: number): string | null {
  const t = str(v, max)
  return t || null
}
function intOr(v: unknown, def: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    if (Number.isFinite(n)) return n
  }
  return def
}
function parseStringArray(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string')
  } catch {
    /* ignore */
  }
  return []
}

type CampaignRow = {
  id: string
  advertiserId: string
  advertiser?: { companyName: string | null } | null
  title: string
  rewardType: string
  rewardValue: string
  description: string
  imageUrl: string | null
  eligibleZones: string
  triggerIncidentTypes: string
  maxPerDay: number
  maxTotal: number
  codeValidityHours: number
  activeFrom: string
  activeTo: string
  pricePerCodeFcfa: number
  status: string
  startDate: Date
  endDate: Date | null
  createdAt: Date
  updatedAt: Date
}

function serializeCampaign(c: CampaignRow) {
  return {
    id: c.id,
    advertiserId: c.advertiserId,
    advertiserName: c.advertiser?.companyName ?? null,
    title: c.title,
    rewardType: c.rewardType,
    rewardValue: c.rewardValue,
    description: c.description,
    imageUrl: c.imageUrl,
    eligibleZones: parseStringArray(c.eligibleZones),
    triggerIncidentTypes: parseStringArray(c.triggerIncidentTypes),
    maxPerDay: c.maxPerDay,
    maxTotal: c.maxTotal,
    codeValidityHours: c.codeValidityHours,
    activeFrom: c.activeFrom,
    activeTo: c.activeTo,
    pricePerCodeFcfa: c.pricePerCodeFcfa,
    status: c.status,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate ? c.endDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

type Params = { params: Promise<{ id: string }> }

// ---------- GET : détail campagne + stats codes ----------
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const campaign = await db.flashRewardCampaign.findUnique({
    where: { id },
    include: { advertiser: { select: { companyName: true } } },
  })

  if (!campaign) {
    return fail('Campagne introuvable', 404)
  }

  // Comptage codes par statut
  const codes = await db.flashRewardCode.findMany({
    where: { campaignId: id },
    select: { status: true, createdAt: true, scratchedAt: true, usedAt: true },
  })

  const statusCounts: Record<string, number> = {
    unused: 0,
    scratched: 0,
    used: 0,
    expired: 0,
  }
  for (const c of codes) {
    if (statusCounts[c.status] !== undefined) {
      statusCounts[c.status]++
    }
  }

  return ok({
    campaign: serializeCampaign(campaign as CampaignRow),
    codes: {
      total: codes.length,
      unused: statusCounts.unused,
      scratched: statusCounts.scratched,
      used: statusCounts.used,
      expired: statusCounts.expired,
    },
  })
}

// ---------- PATCH : mise à jour partielle ----------
type UpdateBody = {
  advertiserId?: unknown
  title?: unknown
  rewardType?: unknown
  rewardValue?: unknown
  description?: unknown
  imageUrl?: unknown
  eligibleZones?: unknown
  triggerIncidentTypes?: unknown
  maxPerDay?: unknown
  maxTotal?: unknown
  codeValidityHours?: unknown
  activeFrom?: unknown
  activeTo?: unknown
  pricePerCodeFcfa?: unknown
  status?: unknown
  endDate?: unknown
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  let body: UpdateBody
  try {
    body = (await req.json()) as UpdateBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const existing = await db.flashRewardCampaign.findUnique({ where: { id } })
  if (!existing) {
    return fail('Campagne introuvable', 404)
  }

  // Construire l'objet data partiellement
  const data: Record<string, unknown> = {}

  if (body.advertiserId !== undefined) {
    const advertiserId = str(body.advertiserId, 100)
    if (!advertiserId) return fail("L'annonceur est requis", 400)
    const advertiser = await db.advertiser.findUnique({ where: { id: advertiserId } })
    if (!advertiser) return fail("Annonceur introuvable", 404)
    data.advertiserId = advertiserId
  }
  if (body.title !== undefined) {
    const title = str(body.title, 200)
    if (!title) return fail('Le titre est requis', 400)
    data.title = title
  }
  if (body.rewardType !== undefined) {
    const rewardType = str(body.rewardType, 50)
    if (!VALID_REWARD_TYPES.has(rewardType)) {
      return fail('Type de récompense invalide', 400)
    }
    data.rewardType = rewardType
  }
  if (body.rewardValue !== undefined) {
    const rewardValue = str(body.rewardValue, 100)
    if (!rewardValue) return fail('La valeur de la récompense est requise', 400)
    data.rewardValue = rewardValue
  }
  if (body.description !== undefined) {
    data.description = str(body.description, 1000)
  }
  if (body.imageUrl !== undefined) {
    data.imageUrl = strOrNull(body.imageUrl, 2048)
  }
  if (body.eligibleZones !== undefined) {
    const arr = Array.isArray(body.eligibleZones)
      ? body.eligibleZones.filter((z): z is string => typeof z === 'string')
      : []
    data.eligibleZones = JSON.stringify(arr)
  }
  if (body.triggerIncidentTypes !== undefined) {
    const arr = Array.isArray(body.triggerIncidentTypes)
      ? body.triggerIncidentTypes.filter((z): z is string => typeof z === 'string')
      : []
    data.triggerIncidentTypes = JSON.stringify(arr)
  }
  if (body.maxPerDay !== undefined) {
    data.maxPerDay = Math.max(1, intOr(body.maxPerDay, 50))
  }
  if (body.maxTotal !== undefined) {
    data.maxTotal = Math.max(1, intOr(body.maxTotal, 500))
  }
  if (body.codeValidityHours !== undefined) {
    data.codeValidityHours = Math.max(1, intOr(body.codeValidityHours, 24))
  }
  if (body.activeFrom !== undefined) {
    data.activeFrom = str(body.activeFrom, 5) || '08:00'
  }
  if (body.activeTo !== undefined) {
    data.activeTo = str(body.activeTo, 5) || '22:00'
  }
  if (body.pricePerCodeFcfa !== undefined) {
    data.pricePerCodeFcfa = Math.max(0, intOr(body.pricePerCodeFcfa, 500))
  }
  if (body.status !== undefined) {
    const statusRaw = str(body.status, 20)
    if (!VALID_STATUSES.has(statusRaw)) {
      return fail('Statut invalide', 400)
    }
    data.status = statusRaw
  }
  if (body.endDate !== undefined) {
    if (typeof body.endDate === 'string' && body.endDate.trim()) {
      const d = new Date(body.endDate)
      if (!isNaN(d.getTime())) {
        data.endDate = d
      } else {
        return fail('endDate invalide', 400)
      }
    } else {
      // null explicite → on retire la date de fin
      data.endDate = null
    }
  }

  const updated = await db.flashRewardCampaign.update({
    where: { id },
    data,
    include: { advertiser: { select: { companyName: true } } },
  })

  return ok({ campaign: serializeCampaign(updated as CampaignRow) })
}

// ---------- DELETE : suppression (cascade) ----------
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const existing = await db.flashRewardCampaign.findUnique({ where: { id } })
  if (!existing) {
    return fail('Campagne introuvable', 404)
  }

  // La cascade Prisma supprimera codes + stats automatiquement
  await db.flashRewardCampaign.delete({ where: { id } })

  return ok({ deleted: true })
}
