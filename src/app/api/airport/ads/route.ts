// ============================================================
// GET / POST  /api/airport/ads
// ------------------------------------------------------------
// Gestion des publicités affichées sur l'écran de confirmation
// de la PWA aéroport (avant que le voyageur ne quitte l'app).
//
// GET  → renvoie UNE publicité active au hasard (et incrémente
//        ses impressions). Si aucune pub active : ok(null).
// POST → crée une nouvelle publicité (superadmin). Pas
//        d'auth check ici — le dashboard admin est déjà protégé.
//
// Réponse enveloppe { ok, data } | { ok: false, error }.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AdPublic = {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  ctaText: string
}

function serializeAd(a: {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  ctaText: string
}): AdPublic {
  return {
    id: a.id,
    title: a.title,
    subtitle: a.subtitle,
    imageUrl: a.imageUrl,
    linkUrl: a.linkUrl,
    ctaText: a.ctaText,
  }
}

// ---------- GET : une publicité active au hasard (PWA) OU liste complète (admin) ----------
// Sans query param : renvoie UNE pub active au hasard (pour la PWA).
//   → cherche d'abord dans les Campaigns (nouveau système Régie Pub)
//   → si aucune Campaign active, fallback sur AirportAd (legacy)
// ?all=true : renvoie TOUTES les pubs AirportAd (pour le dashboard admin).
// ?zone=<code> : filtre les Campaigns par zone code.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const all = url.searchParams.get('all') === 'true'
  const zone = url.searchParams.get('zone')

  // Mode admin : liste complète avec stats (AirportAd legacy)
  if (all) {
    const ads = await db.airportAd.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ok({
      ads: ads.map((a) => ({
        id: a.id,
        title: a.title,
        subtitle: a.subtitle,
        imageUrl: a.imageUrl,
        linkUrl: a.linkUrl,
        ctaText: a.ctaText,
        active: a.active,
        clicks: a.clicks,
        impressions: a.impressions,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    })
  }

  // Mode PWA : chercher d'abord les Campaigns actives (nouveau système Régie Pub)
  try {
    const now = new Date()
    const campaignWhere: Record<string, unknown> = {
      status: 'active',
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    }
    if (zone) {
      campaignWhere.zoneCode = zone
    }

    const campaigns = await db.campaign.findMany({
      where: campaignWhere,
      select: { id: true, title: true, imageUrl: true, landingUrl: true, zoneCode: true },
    })

    if (campaigns.length > 0) {
      const idx = Math.floor(Math.random() * campaigns.length)
      const picked = campaigns[idx]

      // Incrémenter les stats d'impression (AdStat)
      try {
        const hour = now.getHours()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        await db.adStat.upsert({
          where: {
            // Pas d'unique constraint sur (campaignId, viewDate, viewHour, zoneCode)
            // → on utilise create + fallback
            id: `${picked.id}-${todayStart.toISOString().slice(0,10)}-${hour}`,
          },
          create: {
            campaignId: picked.id,
            zoneCode: picked.zoneCode,
            viewDate: todayStart,
            viewHour: hour,
            impressions: 1,
          },
          update: {
            impressions: { increment: 1 },
          },
        }).catch(() => {
          // Fallback si l'upsert échoue (ID trop long ou autre), on crée juste une ligne
          db.adStat.create({
            data: {
              campaignId: picked.id,
              zoneCode: picked.zoneCode,
              viewDate: todayStart,
              viewHour: hour,
              impressions: 1,
            },
          }).catch(() => undefined)
        })
      } catch {
        /* non bloquant */
      }

      // Retourner au format AirportAd (compatibilité PWA)
      return ok({
        ad: {
          id: picked.id,
          title: picked.title,
          subtitle: null,
          imageUrl: picked.imageUrl,
          linkUrl: picked.landingUrl,
          ctaText: 'En savoir plus',
        } satisfies AdPublic,
      })
    }
  } catch (err) {
    // Si la table Campaign n'existe pas encore ou autre erreur → fallback AirportAd
    console.warn('[ads] Campaign query failed, falling back to AirportAd:', err instanceof Error ? err.message : String(err))
  }

  // Fallback : AirportAd (système legacy)
  const actifs = await db.airportAd.findMany({
    where: { active: true },
    select: { id: true },
  })

  if (actifs.length === 0) {
    return ok({ ad: null })
  }

  const idx = Math.floor(Math.random() * actifs.length)
  const picked = await db.airportAd.findUnique({
    where: { id: actifs[idx].id },
  })

  if (!picked) {
    return ok({ ad: null })
  }

  // Incrémente les impressions (best-effort, non bloquant)
  try {
    await db.airportAd.update({
      where: { id: picked.id },
      data: { impressions: { increment: 1 } },
    })
  } catch {
    /* non bloquant */
  }

  return ok({ ad: serializeAd(picked) })
}

// ---------- POST : création d'une publicité ----------
type CreateAdBody = {
  title?: unknown
  subtitle?: unknown
  imageUrl?: unknown
  linkUrl?: unknown
  ctaText?: unknown
  active?: unknown
}

export async function POST(req: NextRequest) {
  let body: CreateAdBody
  try {
    body = (await req.json()) as CreateAdBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return fail('Le titre est requis', 400)
  }
  if (title.length > 120) {
    return fail('Le titre est trop long (120 caractères max)', 400)
  }

  const subtitle =
    typeof body.subtitle === 'string' ? body.subtitle.trim().slice(0, 200) : null
  const imageUrl =
    typeof body.imageUrl === 'string' && body.imageUrl.trim()
      ? body.imageUrl.trim().slice(0, 2048)
      : null
  const linkUrl =
    typeof body.linkUrl === 'string' && body.linkUrl.trim()
      ? body.linkUrl.trim().slice(0, 2048)
      : null
  const ctaText =
    typeof body.ctaText === 'string' && body.ctaText.trim()
      ? body.ctaText.trim().slice(0, 40)
      : 'En savoir plus'
  const active = typeof body.active === 'boolean' ? body.active : true

  // Validation des URL — accepte les chemins relatifs (/api/uploads/...)
  // ET les URL complètes (https://...) ET les data: URLs
  for (const [champ, url] of [
    ['imageUrl', imageUrl],
    ['linkUrl', linkUrl],
  ] as const) {
    if (url) {
      const isRelative = url.startsWith('/')
      const isData = url.startsWith('data:')
      if (!isRelative && !isData) {
        try {
          new URL(url)
        } catch {
          return fail(`${champ} n'est pas une URL valide`, 400)
        }
      }
    }
  }

  const ad = await db.airportAd.create({
    data: {
      title,
      subtitle,
      imageUrl,
      linkUrl,
      ctaText,
      active,
    },
  })

  return ok({ ad: serializeAd(ad) }, 201)
}
