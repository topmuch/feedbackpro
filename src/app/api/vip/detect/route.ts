// ============================================================
// /api/vip/detect — Détection VIP au scan / à la saisie réception
// ------------------------------------------------------------
// POST { name?, deviceId?, boardingPassId?, phone?, tableNumber?, canal? }
//   → match dans la Base Clients VIP :
//     - trouvé  : visite enregistrée + alerte Maître d'Hôtel (visuelle,
//       nom + photo) + renvoi du profil complet (préférences, allergies)
//     - inconnu : { matched: false } — pas d'alerte, pas de profil
// Canal : scan (QR table client) | reception (saisie réception) | session
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import {
  trouverVipPourDetection,
  enregistrerDetectionVip,
  parseStringArray,
} from '@/lib/vip-clients'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('Body JSON invalide', 400)

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : null
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 100) : null
  const boardingPassId = typeof body.boardingPassId === 'string' ? body.boardingPassId.trim().slice(0, 80) : null
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : null
  const tableNumber = typeof body.tableNumber === 'string' ? body.tableNumber.trim().slice(0, 40) : null
  const canal = ['scan', 'reception', 'session'].includes(body.canal) ? body.canal : 'reception'

  if (!name && !deviceId && !boardingPassId) {
    return fail('Au moins un critère requis (name, deviceId ou boardingPassId)', 400)
  }

  const match = await trouverVipPourDetection({ name, deviceId, boardingPassId, phone })
  if (!match) {
    return ok({ matched: false })
  }

  const result = await enregistrerDetectionVip({
    client: {
      id: match.client.id,
      name: match.client.name,
      photo: match.client.photo,
      vipLevel: match.client.vipLevel,
      airline: match.client.airline,
    },
    input: {
      name,
      deviceId,
      boardingPassId,
      tableNumber,
      canal,
      detection: match.critere,
    },
  })

  // Lie la session Nathalie du device au client reconnu (reprise future par device)
  if (deviceId) {
    await db.clientSession.updateMany({
      where: { deviceId, expiresAt: { gte: new Date() } },
      data: { vipClientId: match.client.id },
    })
  }

  // Attache le nom reconnu à la table si fournie
  if (tableNumber) {
    await db.vipTable.updateMany({
      where: { tableNumber },
      data: { clientName: match.client.name, clientVipLevel: match.client.vipLevel },
    })
  }

  return ok({
    matched: true,
    critere: match.critere,
    alerte: result.alerte,
    client: {
      id: match.client.id,
      name: match.client.name,
      photo: match.client.photo,
      vipLevel: match.client.vipLevel,
      airline: match.client.airline,
      preferences: parseStringArray(match.client.preferences),
      allergies: parseStringArray(match.client.allergies),
      visitCount: match.client.visitCount + 1,
      consentPhoto: match.client.consentPhoto,
    },
  })
}
