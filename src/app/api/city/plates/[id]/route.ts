import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/city/plates/[id] — Met à jour une plaque (géolocalisation, label, statut)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Body JSON invalide', 400)

  const current = await db.cityPlate.findUnique({ where: { id } })
  if (!current) return fail('Plaque introuvable', 404)

  const data: Record<string, unknown> = {}

  if (typeof body.label === 'string') {
    data.label = body.label.trim().slice(0, 200) || current.label
  }
  if (typeof body.district === 'string') {
    data.district = body.district.trim().slice(0, 80) || null
  }
  if (typeof body.address === 'string') {
    data.address = body.address.trim().slice(0, 300) || null
  }
  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    data.lat = body.lat
    data.lng = body.lng
    // Si on géolocalise, on passe automatiquement à "active"
    if (current.status === 'pending') {
      data.status = 'active'
    }
  }
  if (typeof body.status === 'string' && ['pending', 'active', 'maintenance', 'offline'].includes(body.status)) {
    data.status = body.status
  }

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour', 400)
  }

  const updated = await db.cityPlate.update({ where: { id }, data })
  return ok({
    id: updated.id,
    plateNumber: updated.plateNumber,
    label: updated.label,
    district: updated.district,
    address: updated.address,
    lat: updated.lat,
    lng: updated.lng,
    status: updated.status,
    qrToken: updated.qrToken,
  })
}
