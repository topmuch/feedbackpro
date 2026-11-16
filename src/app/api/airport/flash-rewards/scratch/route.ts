// ============================================================
// POST /api/airport/flash-rewards/scratch
// ------------------------------------------------------------
// Marque un code comme "gratté" (la carte a été grattée par le
// voyageur — révélation de la récompense). Incrémente aussi
// le compteur quotidien FlashRewardStat du jour (champ scratches).
//
// Body : { codeId }
//
// Réponse : { ok: true } | { ok: false, error }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ScratchBody = {
  codeId?: unknown
}

export async function POST(req: NextRequest) {
  let body: ScratchBody
  try {
    body = (await req.json()) as ScratchBody
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const codeId =
    typeof body.codeId === 'string' ? body.codeId.trim().slice(0, 100) : ''
  if (!codeId) {
    return fail('codeId est requis', 400)
  }

  const code = await db.flashRewardCode.findUnique({
    where: { id: codeId },
    select: { id: true, campaignId: true, status: true },
  })
  if (!code) {
    return fail('Code introuvable', 404)
  }

  // Si déjà gratté, on n'incrémente pas une 2e fois (idempotent)
  if (code.status === 'unused') {
    await db.flashRewardCode.update({
      where: { id: codeId },
      data: { status: 'scratched', scratchedAt: new Date() },
    })

    // Incrémente la stat du jour pour la campagne
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const statId = `${code.campaignId}-${todayStart.toISOString().slice(0, 10)}`
    try {
      await db.flashRewardStat.upsert({
        where: { id: statId },
        create: {
          id: statId,
          campaignId: code.campaignId,
          statDate: todayStart,
          scratches: 1,
        },
        update: {
          scratches: { increment: 1 },
        },
      })
    } catch {
      // Fallback : stat existe déjà avec un ID différent ou autre erreur
      // → on crée une ligne brute
      try {
        await db.flashRewardStat.create({
          data: {
            campaignId: code.campaignId,
            statDate: todayStart,
            scratches: 1,
          },
        })
      } catch {
        /* non bloquant — le scratch reste enregistré sur le code */
      }
    }
  }

  return ok({ ok: true })
}
