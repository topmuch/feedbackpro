// ============================================================
// GET / POST  /api/admin/ads/advertisers
// ------------------------------------------------------------
// Gestion des annonceurs publicitaires (Régie Pub — Task AD1).
//
// GET  → liste tous les annonceurs avec le nombre de campagnes.
// POST → crée un nouvel annonceur (companyName requis).
//
// Réponse enveloppe { ok, data } | { ok: false, error }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AdvertiserPublic = {
  id: string
  companyName: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  billingAddress: string | null
  logoUrl: string | null
  createdAt: string
  campaignCount: number
}

// ---------- GET : liste tous les annonceurs ----------
export async function GET() {
  const advertisers = await db.advertiser.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { campaigns: true } } },
  })

  const data: AdvertiserPublic[] = advertisers.map((a) => ({
    id: a.id,
    companyName: a.companyName,
    contactName: a.contactName,
    contactPhone: a.contactPhone,
    contactEmail: a.contactEmail,
    billingAddress: a.billingAddress,
    logoUrl: a.logoUrl,
    createdAt: a.createdAt.toISOString(),
    campaignCount: a._count.campaigns,
  }))

  return ok({ advertisers: data })
}

// ---------- POST : création d'un annonceur ----------
type CreateAdvertiserBody = {
  companyName?: unknown
  contactName?: unknown
  contactPhone?: unknown
  contactEmail?: unknown
  billingAddress?: unknown
  logoUrl?: unknown
}

export async function POST(req: NextRequest) {
  let body: CreateAdvertiserBody
  try {
    body = (await req.json()) as CreateAdvertiserBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const companyName =
    typeof body.companyName === 'string' ? body.companyName.trim() : ''
  if (!companyName) {
    return fail("Le nom de l'entreprise est requis", 400)
  }
  if (companyName.length > 200) {
    return fail("Le nom de l'entreprise est trop long (200 caractères max)", 400)
  }

  const strField = (v: unknown, max: number): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    if (!t) return null
    return t.slice(0, max)
  }

  const contactName = strField(body.contactName, 120)
  const contactPhone = strField(body.contactPhone, 40)
  const contactEmail = strField(body.contactEmail, 200)
  const billingAddress = strField(body.billingAddress, 500)
  const logoUrl = strField(body.logoUrl, 2048)

  // Validation basique email si fourni
  if (contactEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return fail("L'email du contact n'est pas valide", 400)
    }
  }

  // Validation URL logo si fourni
  if (logoUrl) {
    const isRelative = logoUrl.startsWith('/')
    const isData = logoUrl.startsWith('data:')
    if (!isRelative && !isData) {
      try {
        new URL(logoUrl)
      } catch {
        return fail("L'URL du logo n'est pas valide", 400)
      }
    }
  }

  const advertiser = await db.advertiser.create({
    data: {
      companyName,
      contactName,
      contactPhone,
      contactEmail,
      billingAddress,
      logoUrl,
    },
  })

  return ok(
    {
      advertiser: {
        id: advertiser.id,
        companyName: advertiser.companyName,
        contactName: advertiser.contactName,
        contactPhone: advertiser.contactPhone,
        contactEmail: advertiser.contactEmail,
        billingAddress: advertiser.billingAddress,
        logoUrl: advertiser.logoUrl,
        createdAt: advertiser.createdAt.toISOString(),
      },
    },
    201,
  )
}
