// ============================================================
// POST /api/airport/staff-location
// GET  /api/airport/staff-location
// ------------------------------------------------------------
// Enregistre la position GPS d'un employé aéroport (Body Cam Task F3).
// Au moment de la prise en charge ET de la résolution d'un incident,
// la PWA staff appelle navigator.geolocation.getCurrentPosition() et
// envoie la position ici. Le wallboard peut récupérer toutes les
// positions actives (dernières 10 min par employé) pour affichage
// sur la carte de l'aéroport.
//
// POST body :
//   { staffName: string, lat: number, lng: number, timestamp?: string }
//
// GET response :
//   { ok: true, data: { positions: [{ staffName, lat, lng, createdAt }] } }
//   — uniquement les positions les plus récentes par employé (< 10 min)
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIVE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

export async function GET(_req: NextRequest) {
  // Récupère les positions des 10 dernières minutes
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS)
  const all = await db.airportStaffLocation.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  // Déduplique par staffName : on ne garde que la position la plus
  // récente par employé (la requête est triée desc donc le 1er est le bon).
  const byStaff = new Map<
    string,
    { staffName: string; lat: number; lng: number; createdAt: string }
  >()
  for (const r of all) {
    if (!byStaff.has(r.staffName)) {
      byStaff.set(r.staffName, {
        staffName: r.staffName,
        lat: r.lat,
        lng: r.lng,
        createdAt: r.createdAt.toISOString(),
      })
    }
  }

  return ok({
    positions: [...byStaff.values()],
    window: '10min',
    generatedAt: new Date().toISOString(),
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    staffName?: unknown
    lat?: unknown
    lng?: unknown
    timestamp?: unknown
  }

  const staffName =
    typeof b.staffName === 'string' ? b.staffName.trim().slice(0, 80) : ''
  if (!staffName) {
    return fail('`staffName` est requis', 400)
  }

  const lat = typeof b.lat === 'number' ? b.lat : NaN
  const lng = typeof b.lng === 'number' ? b.lng : NaN
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail('`lat` et `lng` doivent être des nombres valides', 400)
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return fail('Coordonnées GPS hors limites valides', 400)
  }

  const created = await db.airportStaffLocation.create({
    data: { staffName, lat, lng },
  })

  return ok(
    {
      id: created.id,
      staffName: created.staffName,
      lat: created.lat,
      lng: created.lng,
      createdAt: created.createdAt.toISOString(),
    },
    201,
  )
}
