// ============================================================
// PUT /api/airport/sla/[zoneCode]
// ------------------------------------------------------------
// Met à jour l'objectif SLA d'une zone (targetMinutes).
// Crée l'enregistrement AirportSla s'il n'existe pas encore (upsert).
//
// Payload JSON :
//   { targetMinutes: number }   // entier 1..1440 (minutes)
//
// Le code zone doit être l'un des 5 codes canoniques (bagages,
// sanitaires, files_attente, embarquement, restauration).
//
// Réponse :
//   { ok: true, data: { sla: { zoneCode, targetMinutes, active, updatedAt } } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { getZoneParCode } from '@/lib/airport-config'

export const runtime = 'nodejs'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ zoneCode: string }> }) {
  const { zoneCode } = await ctx.params
  if (!zoneCode) return fail('Code de zone manquant', 400)

  const config = getZoneParCode(zoneCode)
  if (!config) {
    return fail(
      `Code de zone inconnu : ${zoneCode}. Codes valides : bagages, sanitaires, files_attente, embarquement, restauration.`,
      404,
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }
  const b = body as { targetMinutes?: unknown }

  if (b.targetMinutes === undefined || b.targetMinutes === null) {
    return fail('Champ `targetMinutes` manquant', 400)
  }
  if (typeof b.targetMinutes !== 'number' || !Number.isFinite(b.targetMinutes)) {
    return fail('`targetMinutes` doit être un nombre', 400)
  }
  const targetMinutes = Math.round(b.targetMinutes)
  if (targetMinutes < 1 || targetMinutes > 1440) {
    return fail('`targetMinutes` doit être compris entre 1 et 1440 minutes (24h)', 400)
  }

  const sla = await db.airportSla.upsert({
    where: { zoneCode: config.code },
    create: { zoneCode: config.code, targetMinutes, active: true },
    update: { targetMinutes },
  })

  console.log(`[airport-sla] SLA zone ${config.code} → ${targetMinutes} min`)

  return ok({
    sla: {
      zoneCode: sla.zoneCode,
      targetMinutes: sla.targetMinutes,
      active: sla.active,
      updatedAt: sla.updatedAt.toISOString(),
    },
  })
}
