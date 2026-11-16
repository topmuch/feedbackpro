// ============================================================
// POST /api/airport/flash-rewards/redeem
// ------------------------------------------------------------
// Endpoint du flux PASSAGER : après qu'un voyageur a signalé
// un incident, la PWA appelle ce endpoint pour savoir s'il
// est éligible à une carte à gratter Flash Reward. Si oui,
// un code unique est généré immédiatement et renvoyé.
//
// Body : { reportId, zoneCode, problemType, clientIp }
//
// Logique :
//   1. Filtrer les campagnes actives (status + fenêtre dates).
//   2. Fenêtre horaire : activeFrom / activeTo (HH:MM).
//   3. eligibleZones : JSON.parse, empty = toutes.
//   4. triggerIncidentTypes : JSON.parse, empty = tous.
//   5. Anti-abus : max 3 codes / jour / IP (skip si dépassé).
//   6. Limites campagne : maxPerDay (aujourd'hui) + maxTotal.
//   7. Si match → génère code FBK-XXXX-YYYY + crée FlashRewardCode.
//
// Réponse : { ok: true, data: { eligible: boolean, ...? } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CODES_PER_IP_PER_DAY = 10

// ---------- Helpers ----------
function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string')
  } catch {
    /* ignore */
  }
  return []
}

/**
 * Convertit "HH:MM" en minutes depuis minuit. Robuste face aux
 * formats partiels ("8:00", "08:00").
 */
function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/**
 * Génère un code unique format "FBK-XXXX-YYYY" où XXXX = 4 chars
 * alphanumériques (sans ambiguïtés: pas de 0/O, 1/I) et YYYY = année.
 */
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let rand = ''
  for (let i = 0; i < 4; i++) {
    rand += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  const year = new Date().getFullYear()
  return `FBK-${rand}-${year}`
}

type RedeemBody = {
  reportId?: unknown
  zoneCode?: unknown
  problemType?: unknown
  clientIp?: unknown
}

export async function POST(req: NextRequest) {
  let body: RedeemBody
  try {
    body = (await req.json()) as RedeemBody
  } catch {
    // Payload invalide → on ne crash pas la PWA, juste ineligible
    return ok({ eligible: false })
  }

  const reportId =
    typeof body.reportId === 'string' ? body.reportId.trim().slice(0, 100) : ''
  const zoneCode =
    typeof body.zoneCode === 'string' ? body.zoneCode.trim().slice(0, 80) : ''
  const problemType =
    typeof body.problemType === 'string' ? body.problemType.trim().slice(0, 200) : ''
  // clientIp peut venir directement du body (passé par la PWA) ou
  // être résolu par les headers X-Forwarded-For / x-real-ip.
  let clientIp =
    typeof body.clientIp === 'string' ? body.clientIp.trim().slice(0, 80) : ''
  if (!clientIp) {
    const xff = req.headers.get('x-forwarded-for')
    if (xff) {
      clientIp = xff.split(',')[0]!.trim().slice(0, 80)
    } else {
      const xreal = req.headers.get('x-real-ip')
      if (xreal) clientIp = xreal.trim().slice(0, 80)
    }
  }
  if (!clientIp) clientIp = 'unknown'

  const now = new Date()

  // 1. Campagnes actives (status + fenêtre dates)
  const campaigns = await db.flashRewardCampaign.findMany({
    where: {
      status: 'active',
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (campaigns.length === 0) {
    return ok({ eligible: false })
  }

  // Pré-calcule la fenêtre "aujourd'hui" pour les compteurs
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  // 5. Anti-abus global : 3 codes / jour / IP
  const ipCountToday = await db.flashRewardCode.count({
    where: {
      clientIp,
      createdAt: { gte: todayStart },
    },
  })
  if (ipCountToday >= MAX_CODES_PER_IP_PER_DAY) {
    return ok({ eligible: false })
  }

  // 2-4-6. Filtre chaque campagne éligible
  for (const campaign of campaigns) {
    // 2. Fenêtre horaire
    const fromMin = hhmmToMinutes(campaign.activeFrom)
    const toMin = hhmmToMinutes(campaign.activeTo)
    if (fromMin !== null && toMin !== null) {
      // Gestion du passage minuit (rare pour des horaires 08:00→22:00)
      if (fromMin <= toMin) {
        if (currentMinutes < fromMin || currentMinutes > toMin) continue
      } else {
        if (currentMinutes > toMin && currentMinutes < fromMin) continue
      }
    }

    // 3. eligibleZones
    const zones = parseStringArray(campaign.eligibleZones)
    if (zones.length > 0 && !zones.includes(zoneCode)) continue

    // 4. triggerIncidentTypes
    const types = parseStringArray(campaign.triggerIncidentTypes)
    if (types.length > 0 && !types.includes(problemType)) continue

    // 6. Limites campagne
    const codesToday = await db.flashRewardCode.count({
      where: {
        campaignId: campaign.id,
        createdAt: { gte: todayStart },
      },
    })
    if (codesToday >= campaign.maxPerDay) continue

    const totalCodes = await db.flashRewardCode.count({
      where: { campaignId: campaign.id },
    })
    if (totalCodes >= campaign.maxTotal) continue

    // 7. Match → générer un code unique
    // On essaie 5 fois si collision sur le code unique
    let createdCode: { id: string; code: string; expiresAt: Date } | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const codeStr = generateCode()
      const expiresAt = new Date(
        now.getTime() + campaign.codeValidityHours * 60 * 60 * 1000,
      )
      try {
        createdCode = await db.flashRewardCode.create({
          data: {
            campaignId: campaign.id,
            code: codeStr,
            status: 'unused',
            reportId: reportId || null,
            zoneCode: zoneCode || null,
            clientIp,
            expiresAt,
          },
          select: { id: true, code: true, expiresAt: true },
        })
        break
      } catch {
        // code unique déjà pris → retry
        continue
      }
    }

    if (!createdCode) {
      // Échec création (collision) → on n'a pas de code à renvoyer
      return ok({ eligible: false })
    }

    return ok({
      eligible: true,
      campaign: {
        id: campaign.id,
        title: campaign.title,
        rewardType: campaign.rewardType,
        rewardValue: campaign.rewardValue,
        description: campaign.description,
        imageUrl: campaign.imageUrl,
        codeValidityHours: campaign.codeValidityHours,
        activeFrom: campaign.activeFrom,
        activeTo: campaign.activeTo,
      },
      code: {
        id: createdCode.id,
        code: createdCode.code,
        expiresAt: createdCode.expiresAt.toISOString(),
      },
    })
  }

  // Aucune campagne ne matche
  return ok({ eligible: false })
}
