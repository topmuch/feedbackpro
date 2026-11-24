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

// Mock KPIs (V1) — remplacés par collecte réelle quand le tunnel
// citoyen de notation + le module monétisation artisans seront live.
const MOCK_SATISFACTION = 4.6
const MOCK_REVENUE_FCFA = 18_400_000

export async function GET() {
  const now = Date.now()
  const MS_24H = 24 * 3600 * 1000
  const since24 = new Date(now - MS_24H)

  // Début de journée locale pour "résolus aujourd'hui".
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // --- Compteurs parallélisables (4 requêtes courtes + 2 count +
  //     1 findMany pour les incidents récents). ---
  const [
    totalIncidents24h,
    pendingEmergencies,
    pendingReports,
    resolvedToday,
    platesCount,
    activeArtisans,
    recentRaw,
  ] = await Promise.all([
    // Total incidents sur 24h (tous types confondus)
    db.cityIncident.count({ where: { createdAt: { gte: since24 } } }),

    // Urgences non résolues (status=assigned|in_progress|pending).
    // Les emergencies démarrent en "assigned" (voir POST /api/city/incidents),
    // donc on ne filtre PAS sur "pending" seul.
    db.cityIncident.count({
      where: {
        type: 'emergency',
        status: { in: ['assigned', 'in_progress', 'pending'] },
      },
    }),

    // Signalements citoyens en attente de routage/traitement.
    db.cityIncident.count({
      where: { type: 'report', status: 'pending' },
    }),

    // Incidents résolus depuis minuit (aujourd'hui).
    db.cityIncident.count({
      where: { status: 'resolved', resolvedAt: { gte: startOfToday } },
    }),

    // Plaques QR installées (toutes, peu importe le status — l'UI
    // distinguera active vs maintenance si besoin).
    db.cityPlate.count(),

    // Artisans actifs (inscrits et non désactivés).
    db.cityArtisan.count({ where: { active: true } }),

    // 10 derniers incidents (avec plaque liée pour contexte quartier).
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
      avgSatisfaction: MOCK_SATISFACTION,
      revenueTotal: MOCK_REVENUE_FCFA,
    },
    recentIncidents,
  })
}
