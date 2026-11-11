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

// ---------- GET : une publicité active au hasard ----------
export async function GET() {
  // Compte les pubs actives puis en sélectionne une au hasard via
  // SKIP aléatoire (SQLite ne supporte pas nativement RANDOM() dans
  // Prisma). On récupère les ids actifs, on tire un index, on fetch.
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
    // Cas très rare (suppression concurrente) : on dégrade gracieusement
    return ok({ ad: null })
  }

  // Incrémente les impressions (best-effort, non bloquant)
  try {
    await db.airportAd.update({
      where: { id: picked.id },
      data: { impressions: { increment: 1 } },
    })
  } catch {
    /* non bloquant — on renvoie quand même la pub */
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

  // Validation basique des URL
  for (const [champ, url] of [
    ['imageUrl', imageUrl],
    ['linkUrl', linkUrl],
  ] as const) {
    if (url) {
      try {
        new URL(url)
      } catch {
        return fail(`${champ} n'est pas une URL valide`, 400)
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
