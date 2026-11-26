// ============================================================
// GET /api/city/wallboard
// ------------------------------------------------------------
// Ville Connectée — Centre de Supervision Urbain (Dakar)
// Agrège les données temps-réel pour le wallboard TV de la
// salle de supervision municipale (page /city-wallboard).
//
// Route publique (l'URL est partagée à l'équipe de supervision
// municipale). Aucune auth. runtime = nodejs + force-dynamic
// → jamais mis en cache CDN.
//
// Sortie (enveloppe ok/data) :
//   {
//     ok: true,
//     data: {
//       stats: {
//         totalIncidents24h,        // tous types confondus (24h)
//         pendingEmergencies,       // type=emergency non résolus
//         pendingReports,           // type=report en attente
//         resolvedToday,            // status=resolved depuis minuit
//         platesCount,              // CityPlate total
//         activeArtisans,           // CityArtisan active=true
//         avgSatisfaction,          // mock 4.6
//         revenueTotal,             // mock 18.4M FCFA
//       },
//       recentIncidents: CityIncident[]  // 10 derniers (avec plaque)
//     }
//   }
//
// Notes :
//   - satisfaction et revenueTotal sont des mocks pour la V1
//     (collecte réelle pas encore câblée côté citoyen).
//   - Les incidents "emergency" sont créés directement en
//     status="assigned" par /api/city/incidents → on compte les
//     urgences non résolues (assigned + in_progress) plutôt que
//     uniquement "pending".
// ============================================================

import { db } from '@/lib/db'
import { ok } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Taux de monétisation : FCFA par mise en relation citoyen→commerce
const RATE_PER_CONTACT = 5000

export async function GET() {
  const now = Date.now()
  const MS_24H = 24 * 3600 * 1000
  const since24 = new Date(now - MS_24H)

  // Début de journée locale pour "résolus aujourd'hui".
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // --- Compteurs parallélisables ---
  const [
    totalIncidents24h,
    pendingEmergencies,
    pendingReports,
    resolvedToday,
    platesCount,
    artisanData,
    recentRaw,
  ] = await Promise.all([
    db.cityIncident.count({ where: { createdAt: { gte: since24 } } }),
    db.cityIncident.count({
      where: {
        type: 'emergency',
        status: { in: ['assigned', 'in_progress', 'pending'] },
      },
    }),
    db.cityIncident.count({
      where: { type: 'report', status: 'pending' },
    }),
    db.cityIncident.count({
      where: { status: 'resolved', resolvedAt: { gte: startOfToday } },
    }),
    db.cityPlate.count(),
    // Fetch artisans with rating + contactCount for real satisfaction + revenue
    db.cityArtisan.findMany({
      where: { active: true },
      select: { rating: true, contactCount: true },
    }),
    db.cityIncident.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
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
    }),
  ])

  // --- Calculs réels (plus de mocks) ---
  const activeArtisans = artisanData.length
  const avgSatisfaction = activeArtisans > 0
    ? Math.round((artisanData.reduce((s, a) => s + a.rating, 0) / activeArtisans) * 10) / 10
    : 0
  const revenueTotal = artisanData.reduce((s, a) => s + a.contactCount * RATE_PER_CONTACT, 0)

  // --- Sérialisation des incidents récents ---
  // Même shape que /api/city/incidents (cohérence avec le type
  // CityIncident du city-dashboard).
  const recentIncidents = recentRaw.map((i) => ({
    id: i.id,
    plateId: i.plateId,
    plate: i.plate
      ? {
          id: i.plate.id,
          plateNumber: i.plate.plateNumber,
          label: i.plate.label,
          district: i.plate.district,
        }
      : null,
    qrToken: i.qrToken,
    type: i.type,
    category: i.category,
    description: i.description,
    gpsLat: i.gpsLat,
    gpsLng: i.gpsLng,
    status: i.status,
    assignedTo: i.assignedTo,
    staffName: i.staffName,
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }))

  return ok({
    stats: {
      totalIncidents24h,
      pendingEmergencies,
      pendingReports,
      resolvedToday,
      platesCount,
      activeArtisans,
      avgSatisfaction: avgSatisfaction,
      revenueTotal: revenueTotal,
    },
    recentIncidents,
  })
}
