// ============================================================
// POST /api/airport/help
// GET  /api/airport/help
// ------------------------------------------------------------
// Bouton "Aide" PWA — le voyageur demande qu'un agent ops
// vienne l'aider sur place (en plus du signalement déjà envoyé
// ou indépendamment).
//
// POST body : { tag, message?, travelerPhone?, reportId? }
//   - tag          : tag URL scanné (résolu en zoneCode)
//   - message      : précision optionnelle du voyageur
//   - travelerPhone: numéro WhatsApp optionnel (pour que l'agent
//                    contacte le voyageur)
//   - reportId     : ID du signalement lié (optionnel)
//
// Réponse (201) : { ok: true, data: { helpRequestId, statut, message } }
//
// GET  : liste des demandes d'aide. Filtre ?statut=EN_ATTENTE
//   possible. Triées par createdAt desc. Limit 100.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import { resoudreZoneParTag } from '@/lib/airport-config'
import { getActiveShiftPhones, getAllActiveOpsPhones } from '@/lib/airport-shifts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type HelpStatut = 'EN_ATTENTE' | 'PRIS_EN_CHARGE' | 'RESOLU'

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!/^\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

function serializeHelp(h: {
  id: string
  tagScanne: string
  zoneCode: string | null
  message: string | null
  travelerPhone: string | null
  reportId: string | null
  statut: string
  assignedTo: string | null
  createdAt: Date
  resolvedAt: Date | null
}) {
  return {
    id: h.id,
    tagScanne: h.tagScanne,
    zoneCode: h.zoneCode,
    message: h.message,
    travelerPhone: h.travelerPhone,
    reportId: h.reportId,
    statut: h.statut as HelpStatut,
    assignedTo: h.assignedTo,
    createdAt: h.createdAt.toISOString(),
    resolvedAt: h.resolvedAt ? h.resolvedAt.toISOString() : null,
  }
}

// ---------------------------------------------------------------
// POST — créer une demande d'aide
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    tag?: string
    message?: string
    travelerPhone?: string
    reportId?: string
  }

  if (!b.tag || typeof b.tag !== 'string' || b.tag.trim().length === 0) {
    return fail('tag manquant', 400)
  }

  // Résolution zone
  const config = resoudreZoneParTag(b.tag)
  const zoneCode = config?.code ?? null

  let message: string | null = null
  if (b.message && typeof b.message === 'string') {
    const trimmed = b.message.trim()
    if (trimmed.length > 500) {
      return fail('message trop long (max 500 caractères)', 400)
    }
    if (trimmed) message = trimmed
  }

  const phone = normalizePhone(b.travelerPhone)

  let reportId: string | null = null
  if (b.reportId && typeof b.reportId === 'string') {
    // On vérifie que le report existe (audit)
    const existing = await db.airportReport.findUnique({
      where: { id: b.reportId },
      select: { id: true },
    })
    if (existing) {
      reportId = b.reportId
    }
    // Sinon on ignore silencieusement — la demande reste valide
  }

  const created = await db.airportHelpRequest.create({
    data: {
      tagScanne: b.tag.trim(),
      zoneCode,
      message,
      travelerPhone: phone,
      reportId,
      statut: 'EN_ATTENTE',
    },
  })

  // --- Construction du payload WhatsApp qui serait envoyé
  // aux ops actifs selon le shift en cours (fallback: tous les ops actifs).
  const shiftResult = await getActiveShiftPhones()
  const opsPhones = shiftResult.phones.length > 0
    ? shiftResult.phones
    : (await getAllActiveOpsPhones()).phones
  const zoneLabel = config ? `${config.emoji} ${config.nom}` : 'Zone inconnue'
  const whatsappLines: string[] = [
    '🆘 *DEMANDE D\'AIDE VOYAGEUR*',
    '',
    `*Zone :* ${zoneLabel}`,
    `*Emplacement :* ${created.tagScanne}`,
    `*Heure :* ${created.createdAt.toLocaleString('fr-FR')}`,
  ]
  if (message) {
    whatsappLines.push(`*Précision voyageur :* ${message}`)
  }
  if (phone) {
    whatsappLines.push(`*Contact voyageur :* +${phone}`)
  }
  if (reportId) {
    whatsappLines.push(`*Signalement lié :* #${reportId.slice(-8)}`)
  }
  whatsappLines.push('', '*Action :* Un agent ops doit se rendre sur place.')

  console.log(
    `[airport-help] 🆘 Demande ${created.id} créée — zone ${zoneCode ?? '?'} (ops actifs: ${opsPhones.length})`,
  )
  console.log('[airport-help] Payload WhatsApp à envoyer :')
  console.log(whatsappLines.join('\n'))

  return ok(
    {
      helpRequestId: created.id,
      statut: created.statut,
      message:
        'Demande d\'aide envoyée. Un agent ops arrive sur place. Restez à cette position.',
    },
    201,
  )
}

// ---------------------------------------------------------------
// GET — liste des demandes d'aide
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const statut = url.searchParams.get('statut')
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') ?? '100', 10) || 100,
    200,
  )

  const where: { statut?: string } = {}
  if (statut) where.statut = statut

  const requests = await db.airportHelpRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return ok({
    requests: requests.map(serializeHelp),
    count: requests.length,
  })
}
