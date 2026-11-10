// ============================================================
// GET /api/airport/shifts/active
// ------------------------------------------------------------
// Renvoie le quart actif à l'instant présent + les numéros ops à
// contacter pour le routage d'une alerte ou d'une demande d'aide.
//
// Stratégie :
//   1. Résoudre le quart actif via getActiveShiftPhones() (gere les
//      quarts de nuit, jours de semaine, etc.).
//   2. Si un quart est actif : activePhones = shift.opsPhones.
//   3. Si aucun quart actif : activePhones = [] et l'appelant peut
//      faire un fallback sur allPhones (tous les numéros ops actifs
//      en base, rôles ops/manager en priorité).
//
// Réponse :
//   {
//     ok: true,
//     data: {
//       shift: { id, name, startTime, endTime } | null,
//       activePhones: string[],
//       allPhones: string[],
//       now: string  // ISO timestamp — utile pour audit / débug
//     }
//   }
// ============================================================

import { NextRequest } from 'next/server'
import { ok } from '@/lib/session'
import { getActiveShiftPhones, getAllActiveOpsPhones } from '@/lib/airport-shifts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const now = new Date()
  const { shift, phones: activePhones } = await getActiveShiftPhones(now)
  const { phones: allPhones } = await getAllActiveOpsPhones()

  return ok({
    shift: shift
      ? {
          id: shift.id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
        }
      : null,
    activePhones,
    allPhones,
    now: now.toISOString(),
  })
}
