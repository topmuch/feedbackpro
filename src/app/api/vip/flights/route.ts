// ============================================================
// /api/vip/flights — Module 7 (Débarrassage Proactif)
// ------------------------------------------------------------
// Suivi des vols et embarquements dans le salon VIP.
// Permet au module turnover de générer automatiquement les
// tâches de débarassage quand un vol passe en "boarding".
//
// GET  : liste des vols (FlightEvent).
//        Filtre optionnel : ?status=boarding (vol en cours
//        d'embarquement actif).
//        Tri : boardingAt ASC (prochain embarquement d'abord).
//
// POST : crée ou met à jour (upsert by flightNo) un vol.
//        Body : { flightNo, boardingAt?, status? }
//        - flightNo requis (ex: "AF123")
//        - boardingAt optionnel (ISO string ou null)
//        - status optionnel : scheduled | boarding | departed | delayed
//
// AUTO-SEED : si la table FlightEvent est vide, on insère 3 vols
// de démonstration (un en boarding maintenant, deux scheduled
// dans 45 min et 90 min).
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = new Set([
  'scheduled',
  'boarding',
  'departed',
  'delayed',
])

// Seed initial : 3 vols de démo (1 en boarding, 2 scheduled).
// Lancé idempotentiquement si la table FlightEvent est vide.
const SEED_FLIGHTS = [
  {
    flightNo: 'AF123',
    boardingAt: new Date(Date.now() + 12 * 60_000), // +12 min
    status: 'boarding',
  },
  {
    flightNo: 'DL456',
    boardingAt: new Date(Date.now() + 45 * 60_000), // +45 min
    status: 'scheduled',
  },
  {
    flightNo: 'EK789',
    boardingAt: new Date(Date.now() + 90 * 60_000), // +90 min
    status: 'scheduled',
  },
]

async function ensureSeeded(): Promise<void> {
  const count = await db.flightEvent.count()
  if (count > 0) return
  await db.flightEvent.createMany({
    // `createMany` ne supporte pas les `Date` object directement pour
    // SQLite via Prisma ? — si, Prisma accepte Date pour les champs
    // DateTime même en createMany (conversion ISO gérée par le driver).
    data: SEED_FLIGHTS.map((f) => ({
      flightNo: f.flightNo,
      boardingAt: f.boardingAt,
      status: f.status,
    })),
  })
}

interface SerializedFlight {
  id: string
  flightNo: string
  boardingAt: string | null
  status: string
  createdAt: string
  updatedAt: string
}

function serialize(f: {
  id: string
  flightNo: string
  boardingAt: Date | null
  status: string
  createdAt: Date
  updatedAt: Date
}): SerializedFlight {
  return {
    id: f.id,
    flightNo: f.flightNo,
    boardingAt: f.boardingAt ? f.boardingAt.toISOString() : null,
    status: f.status,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }
}

// GET /api/vip/flights
export async function GET(req: NextRequest) {
  await ensureSeeded()

  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const where: { status?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status

  // Tri boardingAt ASC : les vols sans boardingAt remontent en premier
  // (NULLS FIRST en SQLite). Pour une UX "prochain embarquement d'abord",
  // c'est acceptable : on veut surtout que AF123 (12 min) apparaisse
  // avant DL456 (45 min).
  const flights = await db.flightEvent.findMany({
    where,
    orderBy: { boardingAt: 'asc' },
  })

  return ok(flights.map(serialize))
}

// POST /api/vip/flights — upsert by flightNo
export async function POST(req: NextRequest) {
  await ensureSeeded()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // flightNo requis
  if (typeof body.flightNo !== 'string' || !body.flightNo.trim()) {
    return fail('flightNo requis', 400)
  }
  const flightNo = body.flightNo.trim().slice(0, 16).toUpperCase()

  // status optionnel (validation)
  const status =
    typeof body.status === 'string' && VALID_STATUSES.has(body.status)
      ? body.status
      : null

  // boardingAt optionnel : accepte ISO string ou null.
  // Si fourni mais invalide → 400.
  let boardingAt: Date | null | undefined = undefined
  if (body.boardingAt !== undefined && body.boardingAt !== null) {
    if (typeof body.boardingAt === 'string') {
      const parsed = new Date(body.boardingAt)
      if (Number.isNaN(parsed.getTime())) {
        return fail('boardingAt invalide (ISO string attendu)', 400)
      }
      boardingAt = parsed
    } else {
      return fail('boardingAt invalide (ISO string attendu)', 400)
    }
  } else if (body.boardingAt === null) {
    boardingAt = null
  }

  // Recherche d'un vol existant avec ce flightNo (non @unique en schema,
  // donc on prend le premier). On upsert manuellement.
  const existing = await db.flightEvent.findFirst({
    where: { flightNo },
    orderBy: { createdAt: 'desc' },
  })

  // Construction de la payload (uniquement les champs fournis)
  const data: {
    flightNo?: string
    boardingAt?: Date | null
    status?: string
  } = {}
  // flightNo est forcément présent, mais on ne l'écrase que si l'enregistrement est nouveau
  if (!existing) data.flightNo = flightNo
  if (boardingAt !== undefined) data.boardingAt = boardingAt
  if (status) data.status = status

  let saved
  if (existing) {
    saved = await db.flightEvent.update({
      where: { id: existing.id },
      data,
    })
  } else {
    saved = await db.flightEvent.create({
      data: {
        flightNo,
        boardingAt: boardingAt === undefined ? null : boardingAt,
        status: status ?? 'scheduled',
      },
    })
  }

  return ok(serialize(saved), existing ? 200 : 201)
}
