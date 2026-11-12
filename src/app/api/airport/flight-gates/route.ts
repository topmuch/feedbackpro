// ============================================================
// /api/airport/flight-gates — QR Dynamique Vol (Task D Phase 3)
// ------------------------------------------------------------
// GET  → liste toutes les assignations porte ↔ vol (actives +
//        historiques récentes), triées par updatedAt desc.
// POST → crée ou met à jour une assignation (upsert sur gateTag).
//        Valide le numéro de vol (2 lettres + 1-4 chiffres, MAJ).
//        Force active=true + status='BOARDING' à la création.
//
// Réponse enveloppe ok/data via les helpers de session.ts.
// runtime = nodejs + force-dynamic → jamais mis en cache CDN.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FLIGHT_NUMBER_RE = /^[A-Z0-9]{2}[0-9]{1,4}$/

function normalizeFlightNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

function isValidFlightNumber(raw: string): boolean {
  if (!raw) return false
  return FLIGHT_NUMBER_RE.test(raw)
}

export async function GET() {
  const gates = await db.airportFlightGate.findMany({
    orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
  })
  return ok({ gates })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return fail('JSON invalide', 400)
  }

  const gateTag = typeof body.gateTag === 'string' ? body.gateTag.trim() : ''
  if (!gateTag) {
    return fail('gateTag manquant', 400)
  }

  const flightNumberRaw =
    typeof body.flightNumber === 'string' ? body.flightNumber.trim() : ''
  if (!isValidFlightNumber(flightNumberRaw)) {
    return fail(
      'flightNumber invalide — format attendu : 2 lettres + 1-4 chiffres (ex: AF123)',
      400,
    )
  }
  const flightNumber = normalizeFlightNumber(flightNumberRaw)

  const airline =
    typeof body.airline === 'string' && body.airline.trim()
      ? body.airline.trim()
      : null
  const destination =
    typeof body.destination === 'string' && body.destination.trim()
      ? body.destination.trim()
      : null
  const scheduledDeparture =
    typeof body.scheduledDeparture === 'string' &&
    /^\d{2}:\d{2}$/.test(body.scheduledDeparture.trim())
      ? body.scheduledDeparture.trim()
      : null
  const notes =
    typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim()
      : null

  const gate = await db.airportFlightGate.upsert({
    where: { gateTag },
    create: {
      gateTag,
      flightNumber,
      airline,
      destination,
      scheduledDeparture,
      notes,
      status: 'BOARDING',
      active: true,
    },
    update: {
      flightNumber,
      airline,
      destination,
      scheduledDeparture,
      notes,
      status: 'BOARDING',
      active: true,
    },
  })

  return ok({ gate })
}
