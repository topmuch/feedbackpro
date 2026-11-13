// ============================================================
// /api/airport/staff-qrs
// ------------------------------------------------------------
// GET  → liste tous les QR codes "Staff Only" persistés en BDD.
// POST → crée un nouveau QR staff (ou upsert si le tag existe déjà).
//        Body : { tag, label, zoneCode? }
//
// NOTE (Task Z1) : le modèle AirportStaffQr a été ajouté au schéma
// Prisma après le démarrage du serveur de dev. Le PrismaClient en
// cache dans globalThis ne connaît pas encore `db.airportStaffQr`,
// donc on utilise db.$queryRaw / db.$executeRaw pour contourner
// la validation du schéma. Au prochain redémarrage du serveur, on
// pourra basculer vers `db.airportStaffQr.findMany()` etc.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Tag staff : lettres minuscules, chiffres, _, -. 2 à 50 caractères.
const TAG_REGEX = /^[a-z0-9_-]{2,50}$/

type RawStaffQr = {
  id: string
  tag: string
  label: string
  zoneCode: string | null
  createdAt: Date
  updatedAt: Date
}

function serializeRow(r: RawStaffQr) {
  return {
    id: r.id,
    tag: r.tag,
    label: r.label,
    zoneCode: r.zoneCode,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  }
}

export async function GET(_req: NextRequest) {
  // Raw SQL — contourne le PrismaClient en cache qui ne connaît pas
  // encore le modèle AirportStaffQr.
  const rows = await db.$queryRaw<RawStaffQr[]>`
    SELECT id, tag, label, zoneCode, createdAt, updatedAt
    FROM AirportStaffQr
    ORDER BY createdAt DESC
  `

  const qrs = rows.map(serializeRow)
  return ok({ qrs, count: qrs.length })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }
  const b = body as {
    tag?: string
    label?: string
    zoneCode?: string | null
  }

  // Tag
  const rawTag = typeof b.tag === 'string' ? b.tag.trim().toLowerCase() : ''
  if (!rawTag) return fail('Tag manquant', 400)
  if (!TAG_REGEX.test(rawTag)) {
    return fail(
      'Tag invalide : lettres minuscules, chiffres, _ ou - uniquement (2-50 caractères)',
      400,
    )
  }

  // Label
  if (typeof b.label !== 'string' || b.label.trim().length === 0) {
    return fail('Label manquant', 400)
  }
  if (b.label.trim().length > 60) {
    return fail('Label trop long (60 caractères max)', 400)
  }
  const label = b.label.trim()

  // ZoneCode (optionnel)
  let zoneCode: string | null = null
  if (b.zoneCode !== undefined && b.zoneCode !== null && b.zoneCode !== '') {
    if (typeof b.zoneCode !== 'string') {
      return fail('zoneCode invalide', 400)
    }
    const zc = b.zoneCode.trim().toLowerCase()
    if (!/^[a-z0-9_]{2,40}$/.test(zc)) {
      return fail('zoneCode invalide (format attendu : 2-40 caractères alphanumériques)', 400)
    }
    zoneCode = zc
  }

  // Upsert manuel via raw SQL (le PrismaClient en cache ne connaît
  // pas db.airportStaffQr.upsert()). D'abord on regarde si une ligne
  // existe déjà pour ce tag, puis UPDATE ou INSERT.
  const existing = await db.$queryRaw<RawStaffQr[]>`
    SELECT id, tag, label, zoneCode, createdAt, updatedAt
    FROM AirportStaffQr
    WHERE tag = ${rawTag}
    LIMIT 1
  `

  let row: RawStaffQr
  if (existing.length > 0) {
    // UPDATE
    await db.$executeRaw`
      UPDATE AirportStaffQr
      SET label = ${label}, zoneCode = ${zoneCode}, updatedAt = CURRENT_TIMESTAMP
      WHERE tag = ${rawTag}
    `
    const refreshed = await db.$queryRaw<RawStaffQr[]>`
      SELECT id, tag, label, zoneCode, createdAt, updatedAt
      FROM AirportStaffQr
      WHERE tag = ${rawTag}
      LIMIT 1
    `
    row = refreshed[0]
  } else {
    // INSERT — génération de l'ID côté app (crypto.randomUUID())
    const id = randomUUID()
    await db.$executeRaw`
      INSERT INTO AirportStaffQr (id, tag, label, zoneCode, createdAt, updatedAt)
      VALUES (${id}, ${rawTag}, ${label}, ${zoneCode}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `
    const inserted = await db.$queryRaw<RawStaffQr[]>`
      SELECT id, tag, label, zoneCode, createdAt, updatedAt
      FROM AirportStaffQr
      WHERE id = ${id}
      LIMIT 1
    `
    row = inserted[0]
  }

  console.log(`[airport-staff-qrs] QR staff ${rawTag} sauvegardé (id=${row.id})`)

  return ok({ qr: serializeRow(row) })
}
