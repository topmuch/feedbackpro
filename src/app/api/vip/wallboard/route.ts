// ============================================================
// GET /api/vip/wallboard
// ------------------------------------------------------------
// Agrège les données temps-réel pour le wallboard VIP Salon
// (affichage TV en salle de supervision du salon VIP).
//
// Route publique (l'URL est partagée à l'équipe ops). Aucune auth.
// runtime = nodejs + force-dynamic → jamais mis en cache CDN.
// Le wallboard client interroge cet endpoint toutes les 5 secondes.
//
// Sortie (enveloppe ok/data) :
//   {
//     ok: true,
//     data: {
//       kpis: {
//         total_today, pending, in_progress, resolved_today,
//         avg_resolution_min, tables_occupied, tables_total,
//         satisfaction_score
//       },
//       active_incidents: [...],     // 20 dernières demandes actives
//       recently_resolved: [...],    // 10 dernières demandes résolues (5 min)
//       tables: [...]                // Toutes les tables VIP
//     }
//   }
//
// AUTO-SEED : si aucune VipTable n'existe en DB, on en crée 12
// automatiquement (T-01 à T-12) pour que le wallboard affiche
// quelque chose même sur une DB fraîchement resetée.
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// --- Libellés des types de demande (i18n FR) ----------------
const TYPE_LABELS: Record<string, string> = {
  refreshment: 'Commande rafraîchissement',
  menu: 'Demande menu',
  shower: 'Réservation douche',
  charger: 'Demande chargeur',
  concierge: 'Appel concierge',
  problem: 'Signalement problème',
  rating: 'Évaluation client',
  cleanup: 'Nettoyage table',
}

// --- Libellés des zones (i18n FR) --------------------------
const ZONE_LABELS: Record<string, string> = {
  main: 'Espace Principal',
  buffet: 'Buffet & Bar',
  relaxation: 'Espace Détente',
  meeting: 'Salles de Réunion',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

function zoneLabel(zone: string): string {
  return ZONE_LABELS[zone] ?? zone
}

// Seuil de retard pour les demandes actives (10 minutes).
const LATE_THRESHOLD_MIN = 10

// Auto-seed 12 tables (T-01 à T-12) si la DB est vide. Réplique
// la logique de /api/vip/tables/by-qr/[token] pour qu'un wallboard
// ouvert sur une DB fraîche affiche tout de suite des tables.
async function autoSeedTables() {
  const count = await db.vipTable.count()
  if (count > 0) return
  const zones = [
    'main', 'main', 'main', 'main', 'main',
    'buffet', 'buffet', 'buffet',
    'relaxation', 'relaxation',
    'meeting', 'meeting',
  ]
  for (let i = 1; i <= 12; i++) {
    await db.vipTable.create({
      data: {
        tableNumber: `T-${String(i).padStart(2, '0')}`,
        zone: zones[i - 1] || 'main',
        seats: i % 3 === 0 ? 6 : 4,
        qrToken: crypto.randomBytes(12).toString('hex'),
      },
    })
  }
}

// Renvoie le début de la journée courante (00:00:00 local → UTC
// approché via Date). Pour SQLite, on compare des ISO / Date objets.
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Parse le JSON metadata d'une VipTableRequest. Tolère les
// chaînes invalides (fallback {}). On extrait notamment les
// tags pour les problèmes, sinon on retombe sur le message.
function parseMetadata(raw: string | null | undefined): {
  tags?: string[]
  description?: string
  items?: Array<{ name?: string; qty?: number }>
  [k: string]: unknown
} {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown> as {
        tags?: string[]
        description?: string
        items?: Array<{ name?: string; qty?: number }>
        [k: string]: unknown
      }
    }
  } catch {
    /* ignore */
  }
  return {}
}

// Construit le libellé affiché sur le wallboard pour une demande :
// - type "problem" → tags (ex: "Bruit, Propreté") si présents,
//   sinon description, sinon message, sinon libellé du type.
// - autres types → message si présent, sinon libellé du type.
function buildMessage(
  type: string,
  message: string | null,
  metadata: ReturnType<typeof parseMetadata>,
): string {
  if (type === 'problem') {
    if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
      return metadata.tags.join(', ')
    }
    if (typeof metadata.description === 'string' && metadata.description.trim()) {
      return metadata.description.trim()
    }
  }
  if (message && message.trim()) return message.trim()
  return typeLabel(type)
}

export async function GET(_req: NextRequest) {
  try {
    // Auto-seed si DB vide (idempotent).
    await autoSeedTables()

    const now = Date.now()
    const todayStart = startOfToday()
    const fiveMinAgo = new Date(now - 5 * 60 * 1000)

    // --- KPIs : compteurs parallélisables ---------------------
    const [
      totalToday,
      pendingCount,
      inProgressCount,
      resolvedTodayCount,
      doneTodayForAvg,
      tablesOccupied,
      tablesTotal,
    ] = await Promise.all([
      // total_today : demandes créées aujourd'hui
      db.vipTableRequest.count({ where: { createdAt: { gte: todayStart } } }),
      // pending
      db.vipTableRequest.count({ where: { status: 'pending' } }),
      // in_progress
      db.vipTableRequest.count({ where: { status: 'in_progress' } }),
      // resolved_today : done + updatedAt aujourd'hui
      db.vipTableRequest.count({
        where: { status: 'done', updatedAt: { gte: todayStart } },
      }),
      // Récupère les done aujourd'hui pour calculer l'avg resolution
      db.vipTableRequest.findMany({
        where: { status: 'done', updatedAt: { gte: todayStart } },
        select: { createdAt: true, updatedAt: true },
      }),
      db.vipTable.count({ where: { status: 'occupied' } }),
      db.vipTable.count(),
    ])

    // avg_resolution_min : moyenne des minutes écoulées entre
    // createdAt et updatedAt pour les demandes résolues aujourd'hui.
    // 0 si aucun échantillon.
    let sumResolutionMs = 0
    let resolvedSamples = 0
    for (const d of doneTodayForAvg) {
      const ms = d.updatedAt.getTime() - d.createdAt.getTime()
      if (ms >= 0) {
        sumResolutionMs += ms
        resolvedSamples++
      }
    }
    const avgResolutionMin =
      resolvedSamples > 0
        ? Math.round(sumResolutionMs / resolvedSamples / 60000)
        : 0

    const kpis = {
      total_today: totalToday,
      pending: pendingCount,
      in_progress: inProgressCount,
      resolved_today: resolvedTodayCount,
      avg_resolution_min: avgResolutionMin,
      tables_occupied: tablesOccupied,
      tables_total: tablesTotal,
      satisfaction_score: 4.8, // mock — sera branché sur les ratings réels plus tard
    }

    // --- active_incidents : pending | in_progress, 20 derniers --
    const activeRequests = await db.vipTableRequest.findMany({
      where: { status: { in: ['pending', 'in_progress'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        table: {
          select: { tableNumber: true, zone: true },
        },
      },
    })

    const active_incidents = activeRequests.map((r) => {
      const metadata = parseMetadata(r.metadata)
      const elapsedMs = now - r.createdAt.getTime()
      const elapsedMin = Math.max(0, Math.floor(elapsedMs / 60000))
      return {
        id: r.id,
        trackingNumber: r.trackingNumber ?? null,
        type: r.type,
        typeLabel: typeLabel(r.type),
        message: buildMessage(r.type, r.message, metadata),
        status: r.status,
        tableNumber: r.table?.tableNumber ?? null,
        tableZone: r.table?.zone ?? null,
        zoneLabel: r.table?.zone ? zoneLabel(r.table.zone) : null,
        createdAt: r.createdAt.toISOString(),
        elapsedMin,
        isLate: elapsedMin >= LATE_THRESHOLD_MIN,
      }
    })

    // --- recently_resolved : done + updatedAt >= 5 min ago -----
    const recentlyResolvedRows = await db.vipTableRequest.findMany({
      where: { status: 'done', updatedAt: { gte: fiveMinAgo } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        table: {
          select: { tableNumber: true, zone: true },
        },
      },
    })

    const recently_resolved = recentlyResolvedRows.map((r) => {
      const metadata = parseMetadata(r.metadata)
      const resolvedMinAgo = Math.max(
        0,
        Math.floor((now - r.updatedAt.getTime()) / 60000),
      )
      return {
        id: r.id,
        trackingNumber: r.trackingNumber ?? null,
        type: r.type,
        typeLabel: typeLabel(r.type),
        message: buildMessage(r.type, r.message, metadata),
        tableNumber: r.table?.tableNumber ?? null,
        tableZone: r.table?.zone ?? null,
        zoneLabel: r.table?.zone ? zoneLabel(r.table.zone) : null,
        resolvedAt: r.updatedAt.toISOString(),
        resolvedMinAgo,
      }
    })

    // --- tables : toutes, triées par tableNumber --------------
    const tablesRows = await db.vipTable.findMany({
      orderBy: { tableNumber: 'asc' },
      select: {
        id: true,
        tableNumber: true,
        zone: true,
        seats: true,
        status: true,
        clientName: true,
        clientVipLevel: true,
        activeRequests: true,
      },
    })

    const tables = tablesRows.map((t) => ({
      id: t.id,
      tableNumber: t.tableNumber,
      zone: t.zone,
      zoneLabel: zoneLabel(t.zone),
      seats: t.seats,
      status: t.status,
      clientName: t.clientName ?? null,
      clientVipLevel: t.clientVipLevel ?? null,
      activeRequests: t.activeRequests,
    }))

    return ok({
      kpis,
      active_incidents,
      recently_resolved,
      tables,
    })
  } catch (err) {
    // Erreur inattendue (DB injoignable, schéma drift, etc.) →
    // on log côté serveur et on renvoie un 500 générique.
    console.error('[/api/vip/wallboard] error:', err)
    return fail('Erreur interne du wallboard VIP', 500)
  }
}
