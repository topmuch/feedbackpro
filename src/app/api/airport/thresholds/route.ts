// ============================================================
// GET  /api/airport/thresholds
// POST /api/airport/thresholds
// ------------------------------------------------------------
// Seuils d'alerte configurables pour le module aéroport.
//
// GET : retourne tous les AirportAlertThreshold (triés par zone puis type).
// POST : crée un nouveau seuil. Body { zoneCode, type, threshold, active? }.
//
// Types acceptés (enum) :
//   SPIKE_15MIN | SPIKE_30MIN | SPIKE_1H | PENDING_COUNT | NO_RESOLUTION_HOURS
//
// zoneCode : code zone parmi les 5 + "ALL" (toutes zones).
//
// Public pour l'instant (le dashboard aéroport sera protégé plus tard).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const THRESHOLD_TYPES = [
  'SPIKE_15MIN',
  'SPIKE_30MIN',
  'SPIKE_1H',
  'PENDING_COUNT',
  'NO_RESOLUTION_HOURS',
] as const
export type ThresholdType = (typeof THRESHOLD_TYPES)[number]

const ZONE_CODES = ['ALL', ...AIRPORT_ZONES.map((z) => z.code)]

function isThresholdType(s: string): s is ThresholdType {
  return (THRESHOLD_TYPES as readonly string[]).includes(s)
}

function serialize(t: {
  id: string
  zoneCode: string
  type: string
  threshold: number
  active: boolean
  lastTriggeredAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: t.id,
    zoneCode: t.zoneCode,
    type: t.type as ThresholdType,
    threshold: t.threshold,
    active: t.active,
    lastTriggeredAt: t.lastTriggeredAt ? t.lastTriggeredAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------
// GET — liste tous les seuils
// ---------------------------------------------------------------
export async function GET(_req: NextRequest) {
  const thresholds = await db.airportAlertThreshold.findMany({
    orderBy: [{ zoneCode: 'asc' }, { type: 'asc' }],
  })

  return ok({
    thresholds: thresholds.map(serialize),
    count: thresholds.length,
    // Métadonnées utiles pour le frontend (listes fermées)
    zones: ZONE_CODES,
    types: THRESHOLD_TYPES,
  })
}

// ---------------------------------------------------------------
// POST — crée un seuil
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    zoneCode?: string
    type?: string
    threshold?: number
    active?: boolean
  }

  if (!b.zoneCode || typeof b.zoneCode !== 'string') {
    return fail('zoneCode manquant', 400)
  }
  if (!ZONE_CODES.includes(b.zoneCode)) {
    return fail(
      `zoneCode invalide : ${b.zoneCode}. Valeurs acceptées : ${ZONE_CODES.join(', ')}`,
      400,
    )
  }

  if (!b.type || typeof b.type !== 'string' || !isThresholdType(b.type)) {
    return fail(
      `type invalide. Valeurs acceptées : ${THRESHOLD_TYPES.join(', ')}`,
      400,
    )
  }

  const thresholdNum =
    typeof b.threshold === 'string' ? parseInt(b.threshold, 10) : b.threshold
  if (typeof thresholdNum !== 'number' || !Number.isFinite(thresholdNum)) {
    return fail('threshold doit être un nombre', 400)
  }
  if (thresholdNum < 1 || thresholdNum > 1000) {
    return fail('threshold doit être compris entre 1 et 1000', 400)
  }

  const active = b.active !== false // défaut true

  const created = await db.airportAlertThreshold.create({
    data: {
      zoneCode: b.zoneCode,
      type: b.type,
      threshold: Math.round(thresholdNum),
      active,
    },
  })

  console.log(
    `[airport-thresholds] POST — seuil créé ${created.id} (${b.zoneCode} / ${b.type} / ${created.threshold})`,
  )

  return ok({ threshold: serialize(created) }, 201)
}
