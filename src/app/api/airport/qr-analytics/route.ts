// ============================================================
// GET /api/airport/qr-analytics
// ------------------------------------------------------------
// "Live QR Analytics" — Performance des QR codes aéroport en
// temps réel. Agrège par tagScanne (chaque QR physique) les
// métriques clés : scans today/7d/30d, incidents générés,
// resolution rate, performance score, last scan time.
//
// Route publique (dashboard admin/pro). runtime = nodejs +
// force-dynamic → jamais mis en cache CDN.
//
// Sortie (enveloppe ok/data) :
//   {
//     ok: true,
//     data: {
//       generatedAt: ISO timestamp,
//       totalScansToday: number,
//       zones: [
//         {
//           tag: string,              // ex: "tapis_bagages_1"
//           zoneCode: string,         // ex: "bagages"
//           zoneNom: string,
//           emoji: string,
//           scansToday: number,
//           scans7d: number,
//           scans30d: number,
//           totalScans: number,       // toutes fenêtres confondues
//           incidents: number,        // = scans (chaque scan = 1 incident)
//           activeIncidents: number,  // EN_ATTENTE + EN_COURS
//           resolvedCount: number,
//           resolutionRate: number,   // 0-100 (%)
//           performanceScore: number, // scans / (activeIncidents + 1)
//           lastScanAt: ISO | null,
//           adRevenueFcfa: number,    // ROI publicité (Campaign.priceMonthlyFcfa)
//           roi: { adRevenueFcfa: number, incidentsResolved: number }
//         }
//       ],
//       deadQrs: [...],               // tags 0 scans sur 30j
//       topPerformers: [...]         // top 5 scans30d
//     }
//   }
//
// Stratégie : on charge tous les AirportReport des dernières 30
// jours + toutes les campagnes publicitaires actives pour la zone.
// On agrège côté JS (cohérent avec wallboard et predict).
// ============================================================

import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Statut = 'EN_ATTENTE' | 'EN_COURS' | 'RESOLU'

const MS_DAY = 24 * 60 * 60 * 1000
const MS_30D = 30 * MS_DAY
const MS_7D = 7 * MS_DAY
const MS_24H = MS_DAY

// Index tag → { zoneCode, zoneNom, emoji } dérivé de la config statique.
type TagMeta = { zoneCode: string; zoneNom: string; emoji: string }
function buildTagIndex(): Map<string, TagMeta> {
  const map = new Map<string, TagMeta>()
  for (const z of AIRPORT_ZONES) {
    for (const t of z.tags) {
      map.set(t, { zoneCode: z.code, zoneNom: z.nom, emoji: z.emoji })
    }
  }
  return map
}

type ZoneAgg = {
  tag: string
  zoneCode: string
  zoneNom: string
  emoji: string
  scansToday: number
  scans7d: number
  scans30d: number
  totalScans: number
  activeIncidents: number
  resolvedCount: number
  lastScanMs: number | null
}

export async function GET() {
  const now = Date.now()
  const since30d = new Date(now - MS_30D)
  const since7d = new Date(now - MS_7D)
  const since24h = new Date(now - MS_24H)

  const tagIndex = buildTagIndex()
  const zoneMetaByCode = new Map<string, TagMeta>()
  for (const z of AIRPORT_ZONES) {
    zoneMetaByCode.set(z.code, { zoneCode: z.code, zoneNom: z.nom, emoji: z.emoji })
  }

  // --- Charge tous les reports des dernières 30 jours ---
  // (pas 24h seulement : on a besoin des scans7d, scans30d et des
  // résolutions historiques pour le ROI).
  const reports = await db.airportReport.findMany({
    where: { createdAt: { gte: since30d } },
    orderBy: { createdAt: 'desc' },
    select: {
      tagScanne: true,
      statut: true,
      zoneId: true,
      createdAt: true,
      resolvedAt: true,
      zone: { select: { code: true } },
    },
  })

  // --- Agrégation par tagScanne (initialisée depuis la config) ---
  const aggByTag = new Map<string, ZoneAgg>()
  for (const [tag, meta] of tagIndex.entries()) {
    aggByTag.set(tag, {
      tag,
      zoneCode: meta.zoneCode,
      zoneNom: meta.zoneNom,
      emoji: meta.emoji,
      scansToday: 0,
      scans7d: 0,
      scans30d: 0,
      totalScans: 0,
      activeIncidents: 0,
      resolvedCount: 0,
      lastScanMs: null,
    })
  }

  let totalScansToday = 0

  for (const r of reports) {
    const c = r.createdAt.getTime()
    const tag = r.tagScanne
    const meta = tagIndex.get(tag) ?? null
    // Si le tag n'est pas dans la config, on crée une entrée à la volée
    // (robustesse : ne jamais crasher sur un tag orphelin).
    let agg = aggByTag.get(tag)
    if (!agg) {
      const code = r.zone?.code ?? 'restauration'
      const zoneMeta = zoneMetaByCode.get(code) ?? zoneMetaByCode.get('restauration')!
      agg = {
        tag,
        zoneCode: code,
        zoneNom: zoneMeta.zoneNom,
        emoji: zoneMeta.emoji,
        scansToday: 0,
        scans7d: 0,
        scans30d: 0,
        totalScans: 0,
        activeIncidents: 0,
        resolvedCount: 0,
        lastScanMs: null,
      }
      aggByTag.set(tag, agg)
    }

    // Tous les reports sont dans la fenêtre 30d (filter Prisma).
    agg.scans30d++
    agg.totalScans++
    if (c >= since7d.getTime()) agg.scans7d++
    if (c >= since24h.getTime()) {
      agg.scansToday++
      totalScansToday++
    }
    if (agg.lastScanMs === null || c > agg.lastScanMs) {
      agg.lastScanMs = c
    }

    const statut = r.statut as Statut
    if (statut === 'EN_ATTENTE' || statut === 'EN_COURS') {
      agg.activeIncidents++
    } else if (statut === 'RESOLU') {
      agg.resolvedCount++
    }
  }

  // --- ROI publicitaire par zone : somme des Campaign.priceMonthlyFcfa
  // pour les campagnes actives sur cette zone (status='active' +
  // startDate dans le passé + endDate null ou futur).
  const adRevenueByZone = new Map<string, number>()
  const campaigns = await db.campaign.findMany({
    where: {
      status: 'active',
      startDate: { lte: new Date(now) },
    },
    select: { zoneCode: true, priceMonthlyFcfa: true, endDate: true },
  })
  for (const c of campaigns) {
    if (c.endDate && c.endDate.getTime() < now) continue
    const revenue = c.priceMonthlyFcfa ?? 0
    adRevenueByZone.set(c.zoneCode, (adRevenueByZone.get(c.zoneCode) ?? 0) + revenue)
  }

  // --- Assemblage final ---
  const zones = Array.from(aggByTag.values())
    .map((a) => {
      const incidents = a.totalScans
      const resolutionRate =
        a.totalScans > 0 ? Math.round((a.resolvedCount / a.totalScans) * 100) : 0
      // Performance score : scans / (active incidents + 1).
      // Plus d'incidents actifs = score plus bas (le QR pose problème).
      // Les QR sans scan ni incident ont un score de 0.
      const performanceScore = Math.round((a.scans30d / (a.activeIncidents + 1)) * 10) / 10
      const adRevenueFcfa = adRevenueByZone.get(a.zoneCode) ?? 0
      return {
        tag: a.tag,
        zoneCode: a.zoneCode,
        zoneNom: a.zoneNom,
        emoji: a.emoji,
        scansToday: a.scansToday,
        scans7d: a.scans7d,
        scans30d: a.scans30d,
        totalScans: a.totalScans,
        incidents,
        activeIncidents: a.activeIncidents,
        resolvedCount: a.resolvedCount,
        resolutionRate,
        performanceScore,
        lastScanAt: a.lastScanMs !== null ? new Date(a.lastScanMs).toISOString() : null,
        adRevenueFcfa,
        roi: {
          adRevenueFcfa,
          incidentsResolved: a.resolvedCount,
        },
      }
    })
    .sort((a, b) => b.scans30d - a.scans30d || b.scansToday - a.scansToday)

  // --- QR Morts : tags avec 0 scans sur les 30 derniers jours ---
  const deadQrs = zones
    .filter((z) => z.scans30d === 0)
    .map((z) => ({
      tag: z.tag,
      zoneCode: z.zoneCode,
      zoneNom: z.zoneNom,
      emoji: z.emoji,
      totalScans: z.totalScans,
      lastScanAt: z.lastScanAt,
    }))
    .sort((a, b) => a.zoneNom.localeCompare(b.zoneNom))

  // --- Top Performers : top 5 tags par scans30d ---
  const topPerformers = zones
    .filter((z) => z.scans30d > 0)
    .slice(0, 5)
    .map((z) => ({
      tag: z.tag,
      zoneCode: z.zoneCode,
      zoneNom: z.zoneNom,
      emoji: z.emoji,
      scans30d: z.scans30d,
      performanceScore: z.performanceScore,
      resolutionRate: z.resolutionRate,
    }))

  return ok({
    generatedAt: new Date(now).toISOString(),
    totalScansToday,
    zones,
    deadQrs,
    topPerformers,
  })
}
