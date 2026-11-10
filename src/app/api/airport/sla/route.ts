// ============================================================
// GET /api/airport/sla
// ------------------------------------------------------------
// Liste tous les objectifs SLA (model AirportSla — un par zone).
// Complété côté serveur avec les 5 zones canoniques : si une zone
// n'a pas encore d'enregistrement AirportSla, on renvoie une entrée
// "fantôme" avec targetMinutes = null (l'UI affiche alors "Non défini").
//
// Réponse :
//   {
//     ok: true,
//     data: {
//       slas: Array<{
//         zoneCode: string,
//         zoneNom: string,
//         zoneEmoji: string,
//         targetMinutes: number | null,
//         active: boolean,
//         id: string | null,
//         updatedAt: string | null
//       }>,
//       count: number
//     }
//   }
//
// Public (pas d'auth) — cohérent avec les autres endpoints aéroport.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SlaRow = {
  zoneCode: string
  zoneNom: string
  zoneEmoji: string
  targetMinutes: number | null
  active: boolean
  id: string | null
  updatedAt: string | null
}

export async function GET(_req: NextRequest) {
  const rows = await db.airportSla.findMany()
  const byCode = new Map(rows.map((r) => [r.zoneCode, r]))

  const slas: SlaRow[] = AIRPORT_ZONES.map((z) => {
    const r = byCode.get(z.code)
    return {
      zoneCode: z.code,
      zoneNom: z.nom,
      zoneEmoji: z.emoji,
      targetMinutes: r?.targetMinutes ?? null,
      active: r?.active ?? true,
      id: r?.id ?? null,
      updatedAt: r?.updatedAt ? r.updatedAt.toISOString() : null,
    }
  })

  return ok({ slas, count: slas.length })
}
