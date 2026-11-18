// ============================================================
// /api/vip/shower-reservations — Module 4 (Smart Shower Queue)
// ------------------------------------------------------------
// GET  : liste des réservations de douche (ShowerReservation).
//        Filtre optionnel : ?status=queued|ready|using|done|cancelled
//        Tri : createdAt desc.
//        Auto-seed : 4 ShowerStatus (showerNumber 1-4, status "free")
//        si la table ShowerStatus est vide.
// POST : crée une réservation de douche.
//        Body : { showerNumber, tableNumber?, clientName? }
//        - Valide showerNumber (1-4)
//        - Compte les réservations "queued" ou "ready" devant ce shower
//          → calcule ETA = count * (20 min usage + 10 min cleaning) = 30 min/slot
//        - Crée la réservation (status="queued")
//        - expiresAt = now + ETA + 10 min (fenêtre de 10 min après "ready")
//        - Renvoie { reservation, etaMinutes, queuePosition }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SHOWER_COUNT = 4
const SHOWER_USAGE_MIN = 20 // durée d'utilisation
const SHOWER_CLEANING_MIN = 10 // durée de nettoyage
const SLOT_MIN = SHOWER_USAGE_MIN + SHOWER_CLEANING_MIN // 30 min par créneau
const READY_WINDOW_MIN = 10 // fenêtre d'expiration une fois la douche "ready"

const VALID_STATUSES = new Set(['queued', 'ready', 'using', 'done', 'cancelled'])

// Auto-seed : 4 ShowerStatus libres si la table est vide
async function ensureShowerStatusSeeded(): Promise<void> {
  const count = await db.showerStatus.count()
  if (count > 0) return
  await db.showerStatus.createMany({
    data: Array.from({ length: SHOWER_COUNT }, (_, i) => ({
      showerNumber: i + 1,
      status: 'free',
    })),
  })
}

// GET /api/vip/shower-reservations
export async function GET(req: NextRequest) {
  await ensureShowerStatusSeeded()

  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  const where: { status?: string } = {}
  if (status && VALID_STATUSES.has(status)) where.status = status

  const reservations = await db.showerReservation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return ok(
    reservations.map((r) => ({
      id: r.id,
      showerNumber: r.showerNumber,
      tableNumber: r.tableNumber ?? null,
      clientName: r.clientName ?? null,
      status: r.status,
      reservedAt: r.reservedAt.toISOString(),
      readyAt: r.readyAt ? r.readyAt.toISOString() : null,
      usedAt: r.usedAt ? r.usedAt.toISOString() : null,
      cleanedAt: r.cleanedAt ? r.cleanedAt.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  )
}

// POST /api/vip/shower-reservations
export async function POST(req: NextRequest) {
  await ensureShowerStatusSeeded()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  const showerNumber =
    typeof body.showerNumber === 'number'
      ? body.showerNumber
      : Number(body.showerNumber)

  if (!Number.isInteger(showerNumber) || showerNumber < 1 || showerNumber > SHOWER_COUNT) {
    return fail(`showerNumber invalide (1-${SHOWER_COUNT})`, 400)
  }

  const tableNumber =
    typeof body.tableNumber === 'string' && body.tableNumber.trim()
      ? body.tableNumber.trim().slice(0, 20)
      : null
  const clientName =
    typeof body.clientName === 'string' && body.clientName.trim()
      ? body.clientName.trim().slice(0, 80)
      : null

  // Comptage des réservations "en attente" devant ce shower (FIFO)
  // On inclut queued + ready car elles occupent la file d'attente.
  const aheadCount = await db.showerReservation.count({
    where: {
      showerNumber,
      status: { in: ['queued', 'ready'] },
    },
  })

  const queuePosition = aheadCount + 1
  const etaMinutes = queuePosition * SLOT_MIN // 30 min par créneau devant
  const now = new Date()
  // La fenêtre de 10 min commence théoriquement quand la douche passe "ready".
  // On calcule expiresAt = now + ETA + 10 min (no-show auto-libération).
  const expiresAt = new Date(
    now.getTime() + (etaMinutes + READY_WINDOW_MIN) * 60_000,
  )

  const created = await db.showerReservation.create({
    data: {
      showerNumber,
      tableNumber,
      clientName,
      status: 'queued',
      reservedAt: now,
      expiresAt,
    },
  })

  return ok(
    {
      reservation: {
        id: created.id,
        showerNumber: created.showerNumber,
        tableNumber: created.tableNumber,
        clientName: created.clientName,
        status: created.status,
        reservedAt: created.reservedAt.toISOString(),
        expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      etaMinutes,
      queuePosition,
    },
    201,
  )
}
