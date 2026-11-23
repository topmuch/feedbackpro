import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/city/plates/generate-batch
// Body: { count, prefix?, startNumber? }
// Génère un lot de plaques QR avec tokens uniques (sans lieu assigné)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 500)
  const prefix = typeof body.prefix === 'string' ? body.prefix.slice(0, 5) : '#'
  const startNumber = Math.max(parseInt(body.startNumber, 10) || 1, 1)

  // Trouver le numéro de départ le plus élevé existant
  const existingPlates = await db.cityPlate.findMany({
    select: { plateNumber: true },
    orderBy: { plateNumber: 'desc' },
    take: 1,
  })

  let nextNum = startNumber
  if (existingPlates.length > 0) {
    // Extraire le numéro de la dernière plaque (ex: "#0023" → 23)
    const match = existingPlates[0].plateNumber.match(/(\d+)$/)
    if (match) {
      nextNum = Math.max(startNumber, parseInt(match[1], 10) + 1)
    }
  }

  const created = []
  for (let i = 0; i < count; i++) {
    const num = nextNum + i
    const plateNumber = `${prefix}${String(num).padStart(4, '0')}`
    const qrToken = crypto.randomBytes(12).toString('hex')

    const plate = await db.cityPlate.create({
      data: {
        plateNumber,
        qrToken,
        label: 'Plaque non assignée',
        status: 'pending', // pending = générée mais pas encore posée
      },
    })
    created.push({
      id: plate.id,
      plateNumber: plate.plateNumber,
      qrToken: plate.qrToken,
      status: plate.status,
    })
  }

  return ok({
    generated: created.length,
    plates: created,
    range: `${created[0]?.plateNumber} → ${created[created.length - 1]?.plateNumber}`,
  }, 201)
}
