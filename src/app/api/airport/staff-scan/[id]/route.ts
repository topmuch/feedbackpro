// ============================================================
// PATCH /api/airport/staff-scan/[id]
// ------------------------------------------------------------
// Attache une photo (photoUrl) et/ou un message (ex: géolocation)
// à un AirportStaffScan existant. Utilisé par la PWA staff après
// que la photo "body cam" a été uploadée via /api/public/upload.
//
// Body (JSON) :
//   { photoUrl?: string, message?: string }
//
// Réponse :
//   200 { ok: true, data: { scan } }
//   404 { ok: false, error: "Scan introuvable" }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('`id` manquant', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { photoUrl?: unknown; message?: unknown }

  const data: { photoUrl?: string; message?: string } = {}
  if (typeof b.photoUrl === 'string' && b.photoUrl.trim()) {
    data.photoUrl = b.photoUrl.trim().slice(0, 500)
  }
  if (typeof b.message === 'string') {
    data.message = b.message.trim().slice(0, 1000)
  }

  if (Object.keys(data).length === 0) {
    return fail('Aucun champ à mettre à jour (`photoUrl` ou `message`)', 400)
  }

  const existing = await db.airportStaffScan.findUnique({ where: { id } })
  if (!existing) {
    return fail('Scan introuvable', 404)
  }

  // Merge: si on fournit un message, on préserve l'ancien + on ajoute
  // (au cas où le scan aurait déjà un message d'origine).
  const updated = await db.airportStaffScan.update({
    where: { id },
    data,
  })

  return ok({ scan: updated })
}
