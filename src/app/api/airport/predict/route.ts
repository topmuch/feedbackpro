// ============================================================
// GET /api/airport/predict
// ------------------------------------------------------------
// "Radar Prédiction" — Analyse des motifs temporels pour
// anticiper les pics de plaintes voyageurs dans les ~20 min.
// Affiché sur le wallboard ops room sous forme de widget
// "RADAR PRÉDICTION" coloré par niveau de gravité.
//
// On charge les AirportReport des dernières 6h (avec zone join)
// puis on calcule pour chacune des 5 zones aéroport un score de
// risque 0-100 à partir de :
//   - densité des signalements sur fenêtres 5 / 15 / 30 min
//   - ratio de tendance (last 30 min vs prev 30 min, 30→60 min)
//   - accumulation de tickets en attente (EN_ATTENTE / EN_COURS)
//   - burst de récurrence (>= 2 signalements en 5 min)
//
// Le score est mappé sur 5 niveaux de gravité :
//   CALME → VIGILANCE → TENDU → CRITIQUE → IMMINENT
//
// À partir de CRITIQUE (score >= 60), on estime `minutesToBurst`
// (temps restant avant "explosion" / pic de plaintes). Une zone
// IMMINENT (>= 80) déclenche une alerte pulsée sur le wallboard.
//
// Route publique (wallboard ops room, URL partagée à l'équipe).
// runtime = nodejs + force-dynamic → jamais mis en cache CDN.
//
// Sortie (enveloppe ok/data) :
//   {
//     ok: true,
//     data: {
//       generatedAt: ISO timestamp,
//       globalRiskScore: number,        // moyenne des zones
//       globalRiskLevel: 'CALME'|...|'IMMINENT',
//       zones: [{ code, nom, emoji, countLast5Min,
//                 countLast15Min, countLast30Min, countPrev30Min,
//                 trendRatio, pendingCount, riskScore, riskLevel,
//                 minutesToBurst, recommendation }],
//       alerts: [{ code, nom, emoji, riskScore, riskLevel,
//                  minutesToBurst, message }]   // zones >= CRITIQUE
//     }
//   }
//
// Stratégie : agrégation côté JS (comme le wallboard). Plus
// simple et plus portable que groupBy Prisma sur SQLite.
// ============================================================

import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RiskLevel = 'CALME' | 'VIGILANCE' | 'TENDU' | 'CRITIQUE' | 'IMMINENT'

// Recommandations pré-calculées par code zone (cahier des charges).
const RECOMMENDATIONS: Record<string, string> = {
  bagages: "Vérifier tapis bagages — possible pic d'attente",
  sanitaires: 'Renforcer équipe nettoyage — risque de propreté',
  files_attente: "Ouvrir guichets supplémentaires — pic d'attente",
  embarquement: 'Vérifier portes et bornes recharge — plaintes à venir',
  restauration: 'Anticiper pic restauration — vérifier disponibilités',
}

const MS_5MIN = 5 * 60 * 1000
const MS_15MIN = 15 * 60 * 1000
const MS_30MIN = 30 * 60 * 1000
const MS_60MIN = 60 * 60 * 1000
const MS_6H = 6 * 60 * 60 * 1000

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 80) return 'IMMINENT'
  if (score >= 60) return 'CRITIQUE'
  if (score >= 40) return 'TENDU'
  if (score >= 20) return 'VIGILANCE'
  return 'CALME'
}

function levelMessage(level: RiskLevel, minutesToBurst: number | null): string {
  switch (level) {
    case 'IMMINENT':
      return 'EXPLOSION IMMINENTE'
    case 'CRITIQUE':
      return minutesToBurst !== null
        ? `Ça va péter dans ~${minutesToBurst} min`
        : 'Ça va péter dans ~20 min'
    case 'TENDU':
      return 'Tension en hausse — surveiller'
    case 'VIGILANCE':
      return 'Vigilance — premiers signaux'
    case 'CALME':
      return 'Zone calme'
  }
}

type ZoneAgg = {
  code: string
  nom: string
  emoji: string
  countLast5Min: number
  countLast15Min: number
  countLast30Min: number
  countPrev30Min: number
  pendingCount: number
}

type ZoneResult = {
  code: string
  nom: string
  emoji: string
  countLast5Min: number
  countLast15Min: number
  countLast30Min: number
  countPrev30Min: number
  trendRatio: number
  pendingCount: number
  riskScore: number
  riskLevel: RiskLevel
  minutesToBurst: number | null
  recommendation: string
}

type AlertItem = {
  code: string
  nom: string
  emoji: string
  riskScore: number
  riskLevel: RiskLevel
  minutesToBurst: number | null
  message: string
}

export async function GET() {
  const now = Date.now()
  const since6h = new Date(now - MS_6H)

  // --- Charge tous les reports des dernières 6h (+ zone join) ---
  const reports = await db.airportReport.findMany({
    where: { createdAt: { gte: since6h } },
    orderBy: { createdAt: 'desc' },
    include: {
      zone: { select: { code: true, nom: true, emoji: true } },
    },
  })

  // --- Index zone metadata par code (fallback config si zone absente en BDD) ---
  const zoneMetaByCode = new Map<string, { code: string; nom: string; emoji: string }>()
  for (const z of AIRPORT_ZONES) {
    zoneMetaByCode.set(z.code, { code: z.code, nom: z.nom, emoji: z.emoji })
  }

  // --- Buckets par zone (initialisés depuis la config) ---
  const aggByCode = new Map<string, ZoneAgg>()
  for (const z of AIRPORT_ZONES) {
    aggByCode.set(z.code, {
      code: z.code,
      nom: z.nom,
      emoji: z.emoji,
      countLast5Min: 0,
      countLast15Min: 0,
      countLast30Min: 0,
      countPrev30Min: 0,
      pendingCount: 0,
    })
  }

  // Bornes temporelles (ms epoch)
  const t5 = now - MS_5MIN
  const t15 = now - MS_15MIN
  const t30 = now - MS_30MIN
  const t60 = now - MS_60MIN

  for (const r of reports) {
    const c = r.createdAt.getTime()
    const code = r.zone?.code ?? 'restauration' // fallback : ne crash jamais
    const meta = zoneMetaByCode.get(code) ?? zoneMetaByCode.get('restauration')!

    // Robustesse : si la zone n'est pas dans la config, on crée une entrée.
    let agg = aggByCode.get(code)
    if (!agg) {
      agg = {
        code,
        nom: r.zone?.nom ?? meta.nom,
        emoji: r.zone?.emoji ?? meta.emoji,
        countLast5Min: 0,
        countLast15Min: 0,
        countLast30Min: 0,
        countPrev30Min: 0,
        pendingCount: 0,
      }
      aggByCode.set(code, agg)
    }

    // Compte par fenêtre temporelle (exclusives : prev30 ne chevauche pas last30)
    if (c >= t5) agg.countLast5Min++
    if (c >= t15) agg.countLast15Min++
    if (c >= t30) agg.countLast30Min++
    else if (c >= t60) agg.countPrev30Min++

    // Pending = EN_ATTENTE / EN_COURS (peu importe la fenêtre : un ticket
    // ouvert il y a 5h pèse toujours sur la charge ops courante).
    const statut = r.statut
    if (statut === 'EN_ATTENTE' || statut === 'EN_COURS') {
      agg.pendingCount++
    }
  }

  // --- Calcul du score de risque + niveau par zone ---
  const zones: ZoneResult[] = []
  for (const z of AIRPORT_ZONES) {
    const agg = aggByCode.get(z.code)!

    // trendRatio : last30 / max(prev30, 1) — évite la division par zéro.
    const trendRatio = agg.countLast30Min / Math.max(agg.countPrev30Min, 1)

    // --- Score heuristique 0-100 ---
    let score = agg.countLast30Min * 12 // base : 12 pts par signalement récent

    // Bonus d'accélération (tendance haussière)
    if (trendRatio >= 1.5) score += 25
    if (trendRatio >= 2.0) score += 15 // bonus cumulatif si très forte accélération

    // Bonus d'accumulation des tickets en attente
    if (agg.pendingCount >= 3) score += 15
    if (agg.pendingCount >= 5) score += 15 // bonus cumulatif si backlog lourd

    // Burst de récurrence (>= 2 signalements en 5 min)
    if (agg.countLast5Min >= 2) score += 20

    // Plafonnement à 100 (et plancher 0 par sécurité)
    score = Math.min(100, Math.max(0, Math.round(score)))

    const level = riskLevelFromScore(score)

    // minutesToBurst : estimé seulement si score >= 60 (CRITIQUE ou IMMINENT).
    // Formule : max(5, 20 - (score - 60) / 2) → plus le score est élevé,
    // moins il reste de temps avant le pic.
    const minutesToBurst =
      score >= 60 ? Math.max(5, Math.round(20 - (score - 60) / 2)) : null

    zones.push({
      code: agg.code,
      nom: agg.nom,
      emoji: agg.emoji,
      countLast5Min: agg.countLast5Min,
      countLast15Min: agg.countLast15Min,
      countLast30Min: agg.countLast30Min,
      countPrev30Min: agg.countPrev30Min,
      trendRatio,
      pendingCount: agg.pendingCount,
      riskScore: score,
      riskLevel: level,
      minutesToBurst,
      recommendation: RECOMMENDATIONS[z.code] ?? 'Surveiller la zone',
    })
  }

  // --- Score global (moyenne des zones, arrondi) ---
  const globalRiskScore =
    zones.length > 0
      ? Math.round(zones.reduce((s, z) => s + z.riskScore, 0) / zones.length)
      : 0
  const globalRiskLevel = riskLevelFromScore(globalRiskScore)

  // --- Alertes : zones >= CRITIQUE, triées par score décroissant ---
  const alerts: AlertItem[] = zones
    .filter((z) => z.riskLevel === 'CRITIQUE' || z.riskLevel === 'IMMINENT')
    .sort((a, b) => b.riskScore - a.riskScore)
    .map((z) => ({
      code: z.code,
      nom: z.nom,
      emoji: z.emoji,
      riskScore: z.riskScore,
      riskLevel: z.riskLevel,
      minutesToBurst: z.minutesToBurst,
      message: levelMessage(z.riskLevel, z.minutesToBurst),
    }))

  return ok({
    generatedAt: new Date(now).toISOString(),
    globalRiskScore,
    globalRiskLevel,
    zones,
    alerts,
  })
}
