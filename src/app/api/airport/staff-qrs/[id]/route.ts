// ============================================================
// /api/airport/staff-qrs/[id]
// ------------------------------------------------------------
// DELETE → supprime un QR staff persisté (par id). Le QR lui-même
//          n'est pas invalide (il peut toujours être régénéré depuis
//          le tag), mais il n'apparaîtra plus dans la liste sauvegardée.
//
// NOTE (Task Z1) : raw SQL pour contourner le PrismaClient en cache.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'

type RawStaffQr = {
  id: string
  tag: string
  label: string
  zoneCode: string | null
  createdAt: Date
  updatedAt: Date
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  if (!id) return fail('ID manquant', 400)

  const existing = await db.$queryRaw<RawStaffQr[]>`
    SELECT id, tag, label, zoneCode, createdAt, updatedAt
    FROM AirportStaffQr
    WHERE id = ${id}
    LIMIT 1
  `
  if (existing.length === 0) {
    return fail('QR staff introuvable', 404)
  }

  await db.$executeRaw`DELETE FROM AirportStaffQr WHERE id = ${id}`

  console.log(`[airport-staff-qrs] QR staff ${existing[0].tag} supprimé (id=${id})`)

  return ok({ deleted: true, id, tag: existing[0].tag })
}
