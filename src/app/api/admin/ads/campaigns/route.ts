// ============================================================
// GET / POST  /api/admin/ads/campaigns
// ------------------------------------------------------------
// Gestion des campagnes publicitaires (Régie Pub — Task AD1).
//
// GET  → liste toutes les campagnes avec annonceur + stats agrégées.
// POST → crée une nouvelle campagne.
//        *** TRIPLE VERROU #2 (BACKEND) ***
//        Vérifie isAdEligible de la zone ciblée. Si false (ex: SOS),
//        renvoie 403 + log console.warn de la tentative.
//
// Réponse enveloppe { ok, data } | { ok: false, error }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { getZoneByCode, isZoneAdEligibleByCode } from '@/lib/sector-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CampaignPublic = {
  id: string
  advertiserId: string
  advertiserName: string
  title: string
  imageUrl: string | null
  landingUrl: string | null
  zoneCode: string
  priority: number
  startDate: string
  endDate: string | null
  dailyBudgetViews: number | null
  status: string
  priceMonthlyFcfa: number | null
  createdAt: string
  updatedAt: string
  impressions: number
  clicks: number
}

// ---------- GET : liste toutes les campagnes ----------
export async function GET() {
  const campaigns = await db.campaign.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      advertiser: { select: { companyName: true } },
      stats: { select: { impressions: true, clicks: true } },
    },
  })

  const data: CampaignPublic[] = campaigns.map((c) => ({
    id: c.id,
    advertiserId: c.advertiserId,
    advertiserName: c.advertiser.companyName,
    title: c.title,
    imageUrl: c.imageUrl,
    landingUrl: c.landingUrl,
    zoneCode: c.zoneCode,
    priority: c.priority,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate ? c.endDate.toISOString() : null,
    dailyBudgetViews: c.dailyBudgetViews,
    status: c.status,
    priceMonthlyFcfa: c.priceMonthlyFcfa,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    impressions: c.stats.reduce((s, x) => s + x.impressions, 0),
    clicks: c.stats.reduce((s, x) => s + x.clicks, 0),
  }))

  return ok({ campaigns: data })
}

// ---------- POST : création d'une campagne (avec triple verrou #2) ----------
type CreateCampaignBody = {
  advertiserId?: unknown
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

export async function POST(req: NextRequest) {
  let body: CreateCampaignBody
  try {
    body = (await req.json()) as CreateCampaignBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const advertiserId =
    typeof body.advertiserId === 'string' ? body.advertiserId.trim() : ''
  if (!advertiserId) {
    return fail('Annonceur requis', 400)
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return fail('Le titre de la campagne est requis', 400)
  }
  if (title.length > 200) {
    return fail('Titre trop long (200 caractères max)', 400)
  }

  const zoneCode = typeof body.zoneCode === 'string' ? body.zoneCode.trim() : ''
  if (!zoneCode) {
    return fail('Zone cible requise', 400)
  }

  // *** TRIPLE VERROU #2 (BACKEND) — Task AD1 ***
  // Avant de créer la campagne, on vérifie que la zone ciblée est
  // éligible à la publicité (isAdEligible !== false). Si la zone est
  // protégée (ex: urg_sos), on refuse avec 403 + log de la tentative.
  const zoneCfg = getZoneByCode(zoneCode)
  const zoneNom = zoneCfg?.nom ?? zoneCode
  if (!isZoneAdEligibleByCode(zoneCode)) {
    // Log structuré de la tentative — traçabilité sécurité publique.
    console.warn(
      `[AD1-VERROU] Tentative de création de campagne sur zone interdite : ` +
        `zoneCode=${zoneCode} (${zoneNom}), advertiserId=${advertiserId}, ` +
        `title="${title}". Refus 403 (règle FeedbackPro : jamais sur urgence).`,
    )
    return fail(
      `Zone ${zoneNom} interdite à la publicité. Règle FeedbackPro : jamais sur urgence.`,
      403,
    )
  }

  // Vérifie que l'annonceur existe
  const advertiser = await db.advertiser.findUnique({
    where: { id: advertiserId },
    select: { id: true },
  })
  if (!advertiser) {
    return fail('Annonceur introuvable', 404)
  }

  // startDate requis (ISO string)
  const startDateStr = typeof body.startDate === 'string' ? body.startDate.trim() : ''
  if (!startDateStr) {
    return fail('Date de début requise', 400)
  }
  const startDate = new Date(startDateStr)
  if (Number.isNaN(startDate.getTime())) {
    return fail('Date de début invalide', 400)
  }

  // endDate optionnel
  let endDate: Date | null = null
  if (typeof body.endDate === 'string' && body.endDate.trim()) {
    const ed = new Date(body.endDate.trim())
    if (Number.isNaN(ed.getTime())) {
      return fail('Date de fin invalide', 400)
    }
    endDate = ed
  }

  // Validation URL (imageUrl + landingUrl) — accepte chemins relatifs
  // et URL absolues https://
  const validateUrl = (v: unknown, field: string): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    if (!t) return null
    const s = t.slice(0, 2048)
    const isRelative = s.startsWith('/')
    const isData = s.startsWith('data:')
    if (!isRelative && !isData) {
      try {
        new URL(s)
      } catch {
        throw new Error(`${field} n'est pas une URL valide`)
      }
    }
    return s
  }

  let imageUrl: string | null
  let landingUrl: string | null
  try {
    imageUrl = validateUrl(body.imageUrl, 'imageUrl')
    landingUrl = validateUrl(body.landingUrl, 'landingUrl')
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'URL invalide', 400)
  }

  // priority (1-10, défaut 1)
  const priorityRaw =
    typeof body.priority === 'number'
      ? body.priority
      : typeof body.priority === 'string'
        ? Number(body.priority)
        : 1
  const priority = Number.isFinite(priorityRaw)
    ? Math.max(1, Math.min(10, Math.floor(priorityRaw)))
    : 1

  // dailyBudgetViews (int positif optionnel)
  let dailyBudgetViews: number | null = null
  if (typeof body.dailyBudgetViews === 'number' && body.dailyBudgetViews > 0) {
    dailyBudgetViews = Math.floor(body.dailyBudgetViews)
  } else if (
    typeof body.dailyBudgetViews === 'string' &&
    /^\d+$/.test(body.dailyBudgetViews.trim())
  ) {
    dailyBudgetViews = Math.floor(Number(body.dailyBudgetViews.trim()))
  }

  // priceMonthlyFcfa (int positif optionnel)
  let priceMonthlyFcfa: number | null = null
  if (typeof body.priceMonthlyFcfa === 'number' && body.priceMonthlyFcfa >= 0) {
    priceMonthlyFcfa = Math.floor(body.priceMonthlyFcfa)
  } else if (
    typeof body.priceMonthlyFcfa === 'string' &&
    /^\d+$/.test(body.priceMonthlyFcfa.trim())
  ) {
    priceMonthlyFcfa = Math.floor(Number(body.priceMonthlyFcfa.trim()))
  }

  // status : draft | active | paused (default draft)
  const statusRaw = typeof body.status === 'string' ? body.status.trim() : 'draft'
  const status = ['draft', 'active', 'paused', 'completed'].includes(statusRaw)
    ? statusRaw
    : 'draft'

  const campaign = await db.campaign.create({
    data: {
      advertiserId,
      title,
      imageUrl,
      landingUrl,
      zoneCode,
      priority,
      startDate,
      endDate,
      dailyBudgetViews,
      priceMonthlyFcfa,
      status,
    },
  })

  return ok(
    {
      campaign: {
        id: campaign.id,
        advertiserId: campaign.advertiserId,
        title: campaign.title,
        imageUrl: campaign.imageUrl,
        landingUrl: campaign.landingUrl,
        zoneCode: campaign.zoneCode,
        priority: campaign.priority,
        startDate: campaign.startDate.toISOString(),
        endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
        dailyBudgetViews: campaign.dailyBudgetViews,
        status: campaign.status,
        priceMonthlyFcfa: campaign.priceMonthlyFcfa,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      },
    },
    201,
  )
}
