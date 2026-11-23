// ============================================================
// /api/city/tax-reports/[id]
// ------------------------------------------------------------
// Ville Connectée — Traitement d'un signalement fiscal par un
// agent municipal : vérification, encaissement de la taxe,
// déclenchement de la récompense citoyenne.
//
// PATCH → transitions de statut + récompense automatique :
//   • verified       → verifiedAt = now, agentName
//   • tax_collected  → resolvedAt = now, taxAmount, agentName
//   • rewarded       → rewardedAt = now, création CityReward
//                      (500 FCFA dump / 1000 FCFA véhicule avec plaque),
//                      status='sent', transactionRef unique.
//                      Le signalement passe aussi à status='rewarded'
//                      et rewardAmount est persisté.
//
// Body : { status, agentName?, taxAmount?, rewardMethod?, citizenPhone? }
// ============================================================

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

// Type d'un CityTaxReport avec la relation `plate` incluse.
type TaxReportWithPlate = Prisma.CityTaxReportGetPayload<{
  include: {
    plate: {
      select: { id: true; plateNumber: true; label: true; district: true }
    }
  }
}>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Constantes & helpers
// ---------------------------------------------------------------

const VALID_STATUSES = new Set(['verified', 'tax_collected', 'rewarded'])

const VALID_REWARD_METHODS = new Set([
  'wave',
  'orange_money',
  'internet_pass',
  'points',
])

/** Récompense en FCFA selon la nature du signalement. */
const REWARD_DUMP = 500 // dump sauvage (sans plaque véhicule)
const REWARD_VEHICLE = 1000 // véhicule identifié par plaque

/** Génère une référence de transaction unique : RWD-<ts>-<hex4>. */
function generateTransactionRef(): string {
  const random4 = crypto.randomBytes(2).toString('hex') // 4 chars hex
  return `RWD-${Date.now()}-${random4}`
}

/** Sérialise un CityTaxReport (+ plaque liée) pour la réponse API. */
function serializeReport(r: TaxReportWithPlate | null) {
  if (!r) return null
  return {
    id: r.id,
    plateId: r.plateId,
    plate: r.plate
      ? {
          id: r.plate.id,
          plateNumber: r.plate.plateNumber,
          label: r.plate.label,
          district: r.plate.district,
        }
      : null,
    qrToken: r.qrToken,
    photoUrl: r.photoUrl,
    vehiclePlate: r.vehiclePlate,
    description: r.description,
    gpsLat: r.gpsLat,
    gpsLng: r.gpsLng,
    status: r.status,
    taxAmount: r.taxAmount,
    rewardAmount: r.rewardAmount,
    rewardMethod: r.rewardMethod,
    citizenPhone: r.citizenPhone,
    agentName: r.agentName,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------
// PATCH — transition de statut + récompense
// ---------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return fail('ID manquant', 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  const b = body as {
    status?: string
    agentName?: string
    taxAmount?: number
    rewardMethod?: string
    citizenPhone?: string
  }

  // status obligatoire
  if (typeof b.status !== 'string' || !VALID_STATUSES.has(b.status)) {
    return fail(
      'status invalide : doit être verified, tax_collected ou rewarded',
      400,
    )
  }
  const status = b.status as 'verified' | 'tax_collected' | 'rewarded'

  // Récupération du signalement courant
  const current = await db.cityTaxReport.findUnique({
    where: { id },
    include: {
      plate: {
        select: {
          id: true,
          plateNumber: true,
          label: true,
          district: true,
        },
      },
    },
  })
  if (!current) return fail('Signalement fiscal introuvable', 404)

  // agentName optionnel (max 60)
  let agentName: string | null | undefined = undefined
  if (b.agentName !== undefined && b.agentName !== null) {
    if (typeof b.agentName !== 'string') {
      return fail('agentName invalide', 400)
    }
    const trimmed = b.agentName.trim()
    if (trimmed.length > 60) {
      return fail('agentName trop long (max. 60 caractères)', 400)
    }
    agentName = trimmed || null
  }

  // taxAmount optionnel (FCFA, entier positif)
  let taxAmount: number | undefined
  if (b.taxAmount !== undefined && b.taxAmount !== null) {
    const parsed =
      typeof b.taxAmount === 'number' ? b.taxAmount : parseInt(String(b.taxAmount), 10)
    if (Number.isNaN(parsed) || parsed < 0) {
      return fail('taxAmount invalide (entier positif attendu)', 400)
    }
    taxAmount = parsed
  }

  // ---------------------------------------------------------------
  // Branche 1 — verified
  // ---------------------------------------------------------------
  if (status === 'verified') {
    const updated = await db.cityTaxReport.update({
      where: { id },
      data: {
        status: 'verified',
        verifiedAt: new Date(),
        ...(agentName !== undefined ? { agentName } : {}),
      },
      include: {
        plate: {
          select: { id: true, plateNumber: true, label: true, district: true },
        },
      },
    })

    console.log(
      `[city-tax-reports] ✅ Signalement #${id.slice(-6)} vérifié` +
        (updated.agentName ? ` par ${updated.agentName}` : ''),
    )

    return ok({ report: serializeReport(updated) })
  }

  // ---------------------------------------------------------------
  // Branche 2 — tax_collected
  // ---------------------------------------------------------------
  if (status === 'tax_collected') {
    if (taxAmount === undefined) {
      // taxAmount par défaut à 0 si non fourni (signal sans estimation)
      taxAmount = 0
    }
    const updated = await db.cityTaxReport.update({
      where: { id },
      data: {
        status: 'tax_collected',
        resolvedAt: new Date(),
        taxAmount,
        ...(agentName !== undefined ? { agentName } : {}),
      },
      include: {
        plate: {
          select: { id: true, plateNumber: true, label: true, district: true },
        },
      },
    })

    console.log(
      `[city-tax-reports] 💰 Taxe ${taxAmount} FCFA encaissée — signalement #${id.slice(-6)}`,
    )

    return ok({ report: serializeReport(updated) })
  }

  // ---------------------------------------------------------------
  // Branche 3 — rewarded
  // Calcule la récompense, crée CityReward (status='sent'),
  // met à jour le signalement (status='rewarded', rewardAmount,
  // rewardMethod, rewardedAt). Transaction atomique.
  // ---------------------------------------------------------------

  // rewardMethod optionnel (défaut 'wave' ou valeur héritée du signalement)
  let rewardMethod: string = current.rewardMethod ?? 'wave'
  if (b.rewardMethod !== undefined && b.rewardMethod !== null) {
    if (
      typeof b.rewardMethod !== 'string' ||
      !VALID_REWARD_METHODS.has(b.rewardMethod)
    ) {
      return fail(
        'rewardMethod invalide : wave, orange_money, internet_pass ou points',
        400,
      )
    }
    rewardMethod = b.rewardMethod
  }

  // citizenPhone optionnel : on hérite du signalement si non fourni.
  let citizenPhone: string | null = current.citizenPhone ?? null
  if (b.citizenPhone !== undefined && b.citizenPhone !== null) {
    if (typeof b.citizenPhone !== 'string') {
      return fail('citizenPhone invalide', 400)
    }
    const trimmed = b.citizenPhone.trim()
    if (trimmed.length > 30) {
      return fail('citizenPhone trop long (max. 30 caractères)', 400)
    }
    if (trimmed) citizenPhone = trimmed
  }

  // Le téléphone est obligatoire pour envoyer la récompense.
  if (!citizenPhone) {
    return fail(
      'citizenPhone requis pour la récompense (fournir dans le body ou lors du signalement)',
      400,
    )
  }

  // Calcul du montant : 1000 si véhicule identifié, 500 sinon (dump).
  const rewardAmount =
    current.vehiclePlate && current.vehiclePlate.trim().length > 0
      ? REWARD_VEHICLE
      : REWARD_DUMP

  const transactionRef = generateTransactionRef()

  // Transaction atomique : création reward + maj signalement.
  const { report, reward } = await db.$transaction(async (tx) => {
    // 3a. CityReward — récompense envoyée immédiatement (status='sent').
    const newReward = await tx.cityReward.create({
      data: {
        taxReportId: id,
        citizenPhone,
        amount: rewardAmount,
        method: rewardMethod,
        reason: 'tax_report',
        status: 'sent',
        transactionRef,
        sentAt: new Date(),
      },
    })

    // 3b. CityTaxReport — passage à 'rewarded' + persistance rewardAmount.
    const updatedReport = await tx.cityTaxReport.update({
      where: { id },
      data: {
        status: 'rewarded',
        rewardedAt: new Date(),
        rewardAmount,
        rewardMethod,
        citizenPhone,
        ...(agentName !== undefined ? { agentName } : {}),
      },
      include: {
        plate: {
          select: { id: true, plateNumber: true, label: true, district: true },
        },
      },
    })

    return { report: updatedReport, reward: newReward }
  })

  console.log(
    `[city-tax-reports] 🎁 Récompense ${rewardAmount} FCFA envoyée à ${citizenPhone}` +
      ` (ref ${transactionRef}) — signalement #${id.slice(-6)}`,
  )

  return ok({
    report: serializeReport(report),
    reward: {
      id: reward.id,
      amount: reward.amount,
      method: reward.method,
      transactionRef: reward.transactionRef,
    },
  })
}
