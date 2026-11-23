// ============================================================
// /api/vip/requests — VipTableRequest (TENANT-3 — VIP Lounge Phase 1)
// ------------------------------------------------------------
// GET  : liste des demandes, avec info table jointe.
//        Filtre optionnel : ?status=pending|in_progress|done
//        Filtre optionnel : ?type=refreshment|menu|shower|charger|concierge|problem|rating|cleanup
// POST : crée une nouvelle demande (body: tableId, type, message?).
//
// L'API est publique côté POST car elle est appelée par le client
// depuis son smartphone après scan du QR de la table. On accepte
// un qrToken en alternative à tableId pour le flux client public.
//
// QR_ROUTING — DEUX COMPORTEMENTS SELON LE QR SCANNÉ :
//   1. CLIENT_ZONE  (QR de table)   : qrToken OU tableId requis →
//      la demande est rattachée à la table scannée (comportement
//      historique, inchangé).
//   2. CLIENT_GLOBAL (QR d'entrée)  : ni tableId ni qrToken — le
//      client a indiqué son emplacement via la modale Nathalie
//      ("Zone Buffet", "Fauteuil 12"…) → on enregistre la demande
//      SANS table, avec contextZone renseigné.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, getSessionUser } from '@/lib/session'
import { routerIncident } from '@/lib/routing-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES_VALIDES = new Set([
  'refreshment',
  'menu',
  'shower',
  'charger',
  'concierge',
  'problem',
  'rating',
  'cleanup',
])
const STATUS_VALIDES = new Set(['pending', 'in_progress', 'done'])

// Préfixes pour les numéros de suivi par type de demande
const TRACKING_PREFIX: Record<string, string> = {
  refreshment: 'CMD',
  menu: 'MNU',
  shower: 'DOU',
  charger: 'CHG',
  concierge: 'CON',
  problem: 'SIG',
  rating: 'NOT',
  cleanup: 'CLE',
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return fail('Non authentifié', 401)

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const type = url.searchParams.get('type')

  const where: { status?: string; type?: string } = {}
  if (status && STATUS_VALIDES.has(status)) where.status = status
  if (type && TYPES_VALIDES.has(type)) where.type = type

  const requests = await db.vipTableRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      table: {
        select: {
          id: true,
          tableNumber: true,
          zone: true,
          clientName: true,
          clientVipLevel: true,
        },
      },
    },
  })

  return ok(
    requests.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      // CLIENT_GLOBAL : table null, contextZone renseigné à la place
      table: r.table,
      contextZone: r.contextZone ?? null,
      type: r.type,
      message: r.message ?? null,
      metadata: r.metadata ?? '{}',
      trackingNumber: r.trackingNumber ?? null,
      status: r.status,
      staffName: r.staffName ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  )
}

export async function POST(req: NextRequest) {
  // POST est public : le client final (smartphone) crée une demande
  // depuis son scan QR. Pas de getSessionUser ici — on valide via
  // tableId ou qrToken.
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return fail('Body JSON invalide', 400)
  }

  // ----------------------------------------------------------
  // Résolution de l'EMPLACEMENT : deux chemins possibles.
  //
  // Chemin A (CLIENT_ZONE, historique) : tableId ou qrToken fourni
  //   → on résout la table réelle scannée.
  // Chemin B (CLIENT_GLOBAL, QR d'entrée) : AUCUNE table — le
  //   client a déclaré son emplacement via la modale Nathalie →
  //   contextZone obligatoire (sinon le staff ne saurait où
  //   intervenir → on refuse proprement).
  // ----------------------------------------------------------
  let table: Awaited<ReturnType<typeof db.vipTable.findUnique>> = null
  if (typeof body.tableId === 'string' && body.tableId.trim()) {
    table = await db.vipTable.findUnique({ where: { id: body.tableId } })
  } else if (typeof body.qrToken === 'string' && body.qrToken.trim()) {
    table = await db.vipTable.findUnique({ where: { qrToken: body.qrToken.trim() } })
  }

  // contextZone : emplacement libre déclaré (mode CLIENT_GLOBAL)
  const contextZone =
    typeof body.contextZone === 'string' && body.contextZone.trim()
      ? body.contextZone.trim().slice(0, 80)
      : null

  if (!table && !contextZone) {
    // Exception QR_ROUTING : 'rating' (simple avis) n'a pas besoin
    // d'emplacement — le staff n'intervient nulle part. Tout le
    // reste exige table (CLIENT_ZONE) ou contextZone (CLIENT_GLOBAL).
    if (body.type !== 'rating') {
      return fail(
        'Emplacement introuvable : fournissez tableId/qrToken (QR de table) ou contextZone (QR d\'entrée)',
        404,
      )
    }
  }

  if (typeof body.type !== 'string' || !TYPES_VALIDES.has(body.type)) {
    return fail(
      `Type invalide. Types acceptés : refreshment, menu, shower, charger, concierge, problem, rating, cleanup`,
      400,
    )
  }

  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 500)
      : null

  // Métadonnées riches (JSON string) — tags problème, items commande, etc.
  const metadata =
    typeof body.metadata === 'string' && body.metadata.trim()
      ? body.metadata.trim().slice(0, 2000)
      : '{}'

  // Génération du numéro de suivi unique (ex: CMD-2026-0847)
  const prefix = TRACKING_PREFIX[body.type] || 'REQ'
  const year = new Date().getFullYear()
  // Boucle anti-collision (très peu probable mais @unique)
  let trackingNumber: string = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = String(Math.floor(Math.random() * 9000) + 1000)
    trackingNumber = `${prefix}-${year}-${seq}`
    const exists = await db.vipTableRequest.findUnique({ where: { trackingNumber }, select: { id: true } })
    if (!exists) break
  }

  const created = await db.vipTableRequest.create({
    data: {
      // CLIENT_ZONE → table résolue ; CLIENT_GLOBAL → tableId null
      tableId: table?.id ?? null,
      contextZone: table ? null : contextZone,
      type: body.type,
      message,
      metadata,
      trackingNumber,
    },
  })

  // Incrémenter le compteur actif sur la table (dénormalisé pour perf)
  // Uniquement en mode CLIENT_ZONE — pas de table en mode global.
  if (table) {
    await db.vipTable.update({
      where: { id: table.id },
      data: { activeRequests: { increment: 1 } },
    })
  }

  // --- MOTEUR DE ROUTAGE INTELLIGENT ---
  // Chaque demande client (commande, signalement, conciergerie…) est
  // routée automatiquement vers le bon employé (QUI, OÙ, POURQUOI).
  // Fire-and-forget : ne bloque JAMAIS la réponse au client et ne
  // peut pas faire échouer la création.
  const metaRoutage = (() => {
    try {
      return JSON.parse(metadata) as { tags?: string[]; description?: string }
    } catch {
      return {}
    }
  })()
  routerIncident({
    tenantKey: 'vip_lounge',
    incidentKind: 'vip_request',
    incidentId: created.id,
    incidentLabel: trackingNumber
      ? `${trackingNumber} — ${body.type === 'problem' ? (metaRoutage.description || (metaRoutage.tags ?? []).join(', ') || 'Signalement') : body.type}`
      : undefined,
    zone: table?.zone ?? contextZone ?? null,
    signalType: body.type === 'problem' ? (metaRoutage.tags?.[0] ?? null) : body.type,
    priority: null,
  }).catch((err) => {
    console.warn('[vip-requests] Routage auto échoué (non bloquant):', err instanceof Error ? err.message : String(err))
  })

  return ok(
    {
      id: created.id,
      tableId: created.tableId,
      contextZone: created.contextZone,
      type: created.type,
      message: created.message,
      metadata: created.metadata,
      trackingNumber: created.trackingNumber,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      table: table
        ? {
            id: table.id,
            tableNumber: table.tableNumber,
            zone: table.zone,
          }
        : null,
    },
    201,
  )
}
