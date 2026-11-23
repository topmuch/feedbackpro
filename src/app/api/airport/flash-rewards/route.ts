// ============================================================
// GET / POST  /api/airport/flash-rewards
// ------------------------------------------------------------
// Gestion des campagnes "Flash Rewards" (cartes à gratter
// post-signalement). Une fois qu'un voyageur signale un
// incident et que la voix de Nathalie a parlé, une carte à
// gratter s'affiche. Le voyageur gratte → révèle une
// récompense (ex: -15% au Café Teranga) avec un code unique.
// L'annonceur paie uniquement les codes UTILISÉS.
//
// GET  → liste toutes les campagnes (admin) avec annonceur,
//        triées par createdAt desc.
// POST → crée une nouvelle campagne (admin).
//
// Réponse enveloppe { ok, data } | { ok: false, error }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------- Types publics (mirror du modèle Prisma) ----------
type FlashRewardCampaignPublic = {
  id: string
  advertiserId: string
  advertiserName: string | null
  title: string
  rewardType: string
  rewardValue: string
  description: string
  imageUrl: string | null
  eligibleZones: string[]
  triggerIncidentTypes: string[]
  maxPerDay: number
  maxTotal: number
  codeValidityHours: number
  activeFrom: string
  activeTo: string
  pricePerCodeFcfa: number
  status: string
  startDate: string
  endDate: string | null
  createdAt: string
  updatedAt: string
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

function serializeCampaign(c: {
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
}): FlashRewardCampaignPublic {
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

// ---------- GET : liste toutes les campagnes (admin) ----------
export async function GET() {
  const campaigns = await db.flashRewardCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { advertiser: { select: { companyName: true } } },
  })

  const data = campaigns.map(serializeCampaign)

  return ok({ campaigns: data })
}

// ---------- POST : création d'une campagne ----------
type CreateCampaignBody = {
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

export async function POST(req: NextRequest) {
  let body: CreateCampaignBody
  try {
    body = (await req.json()) as CreateCampaignBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const advertiserId = str(body.advertiserId, 100)
  if (!advertiserId) {
    return fail("L'annonceur est requis", 400)
  }
  // Vérifie que l'annonceur existe
  const advertiser = await db.advertiser.findUnique({ where: { id: advertiserId } })
  if (!advertiser) {
    return fail("Annonceur introuvable", 404)
  }

  const title = str(body.title, 200)
  if (!title) {
    return fail('Le titre est requis', 400)
  }

  const rewardType = str(body.rewardType, 50)
  if (!VALID_REWARD_TYPES.has(rewardType)) {
    return fail(
      `Type de récompense invalide (attendu: percentage|fixed_amount|free_article|gift)`,
      400,
    )
  }

  const rewardValue = str(body.rewardValue, 100)
  if (!rewardValue) {
    return fail('La valeur de la récompense est requise', 400)
  }

  const description = str(body.description, 1000)
  const imageUrl = strOrNull(body.imageUrl, 2048)

  // Tableaux → JSON.stringify côté API
  const eligibleZonesRaw = Array.isArray(body.eligibleZones)
    ? body.eligibleZones.filter((z): z is string => typeof z === 'string')
    : []
  const triggerIncidentTypesRaw = Array.isArray(body.triggerIncidentTypes)
    ? body.triggerIncidentTypes.filter((z): z is string => typeof z === 'string')
    : []
  const eligibleZones = JSON.stringify(eligibleZonesRaw)
  const triggerIncidentTypes = JSON.stringify(triggerIncidentTypesRaw)

  const maxPerDay = Math.max(1, intOr(body.maxPerDay, 50))
  const maxTotal = Math.max(1, intOr(body.maxTotal, 500))
  const codeValidityHours = Math.max(1, intOr(body.codeValidityHours, 24))
  const pricePerCodeFcfa = Math.max(0, intOr(body.pricePerCodeFcfa, 500))

  const activeFrom = str(body.activeFrom, 5) || '08:00'
  const activeTo = str(body.activeTo, 5) || '22:00'

  const statusRaw = str(body.status, 20)
  const status = VALID_STATUSES.has(statusRaw) ? statusRaw : 'active'

  let endDate: Date | null = null
  if (typeof body.endDate === 'string' && body.endDate.trim()) {
    const d = new Date(body.endDate)
    if (!isNaN(d.getTime())) endDate = d
  }

  const campaign = await db.flashRewardCampaign.create({
    data: {
      advertiserId,
      title,
      rewardType,
      rewardValue,
      description,
      imageUrl,
      eligibleZones,
      triggerIncidentTypes,
      maxPerDay,
      maxTotal,
      codeValidityHours,
      activeFrom,
      activeTo,
      pricePerCodeFcfa,
      status,
      endDate,
    },
    include: { advertiser: { select: { companyName: true } } },
  })

  return ok({ campaign: serializeCampaign(campaign) }, 201)
}
