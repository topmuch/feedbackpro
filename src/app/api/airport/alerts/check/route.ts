// ============================================================
// GET /api/airport/alerts/check
// ------------------------------------------------------------
// Cœur de la détection de pics : lit tous les seuils actifs,
// interroge AirportReport sur les fenêtres temporelles
// pertinentes, et renvoie la liste des alertes déclenchées.
//
// Anti-spam : si threshold.lastTriggeredAt est dans les 30
// dernières minutes, l'alerte est TOUJOURS renvoyée (pour que
// le wallboard l'affiche) MAIS lastTriggeredAt n'est pas
// rafraîchi. Sinon on met à jour lastTriggeredAt = now().
//
// Sévérité :
//   - "critical" si currentValue >= threshold * 2
//   - "warning" sinon
//
// Logique par type :
//   SPIKE_15MIN/30MIN/1H : compte des AirportReport créés dans
//     les N dernières minutes, groupés par zoneCode. Si zoneCode
//     threshold = "ALL", on déclenche pour TOUTE zone dont le
//     count >= threshold.
//   PENDING_COUNT : compte des reports statut="EN_ATTENTE". Si
//     zoneCode="ALL", on compte sur toutes les zones.
//   NO_RESOLUTION_HOURS : âge en heures du plus ancien report
//     "EN_ATTENTE" (par zone si zoneCode != "ALL", sinon global).
//
// Réponse :
//   { ok: true, data: { alerts: [...], lastCheckedAt: ISO } }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok } from '@/lib/session'
import { AIRPORT_ZONES } from '@/lib/airport-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ThresholdType =
  | 'SPIKE_15MIN'
  | 'SPIKE_30MIN'
  | 'SPIKE_1H'
  | 'PENDING_COUNT'
  | 'NO_RESOLUTION_HOURS'

type Severity = 'warning' | 'critical'

type TriggeredAlert = {
  thresholdId: string
  type: ThresholdType
  zoneCode: string // "ALL" ou code zone métier
  currentValue: number
  threshold: number
  severity: Severity
  message: string
  triggeredAt: string
  /** true si l'alerte est en fenêtre anti-spam (≤30 min) */
  suppressed: boolean
}

const SPIKE_WINDOW_MS: Record<string, number> = {
  SPIKE_15MIN: 15 * 60 * 1000,
  SPIKE_30MIN: 30 * 60 * 1000,
  SPIKE_1H: 60 * 60 * 1000,
}

const SPIKE_LABEL: Record<string, string> = {
  SPIKE_15MIN: '15 min',
  SPIKE_30MIN: '30 min',
  SPIKE_1H: '1 h',
}

const ANTI_SPAM_MS = 30 * 60 * 1000

const ZONE_LABEL: Record<string, string> = Object.fromEntries(
  AIRPORT_ZONES.map((z) => [z.code, z.nom]),
)

function zoneLabel(code: string): string {
  if (code === 'ALL') return 'Toutes zones'
  return ZONE_LABEL[code] ?? code
}

function buildMessage(
  type: ThresholdType,
  zoneCode: string,
  current: number,
  threshold: number,
): string {
  if (type === 'PENDING_COUNT') {
    return `File d'attente cumulée sur ${zoneLabel(zoneCode)} : ${current} signalements en attente (seuil : ${threshold})`
  }
  if (type === 'NO_RESOLUTION_HOURS') {
    return `Sans résolution sur ${zoneLabel(zoneCode)} : ${current} h depuis le plus ancien signalement en attente (seuil : ${threshold} h)`
  }
  const label = SPIKE_LABEL[type] ?? type
  return `Pic détecté sur ${zoneLabel(zoneCode)} : ${current} signalements en ${label} (seuil : ${threshold})`
}

function severity(current: number, threshold: number): Severity {
  return current >= threshold * 2 ? 'critical' : 'warning'
}

/**
 * Récupère les numéros ops actifs — pour l'instant tous les
 * AirportOpsContact actifs. Quand les shifts (Feature 4) seront
 * en place, on appellera getActiveShiftPhones() qui filtre par
 * créneau horaire.
 */
async function getActiveOpsPhones(): Promise<string[]> {
  const contacts = await db.airportOpsContact.findMany({
    where: { actif: true },
    select: { phone: true },
  })
  return contacts.map((c) => c.phone)
}

// ---------------------------------------------------------------
// Handlers de détection par type
// ---------------------------------------------------------------

/**
 * Pour SPIKE_*, compte des reports créés dans la fenêtre N,
 * groupés par zoneCode. Renvoie une alerte par zone dont le
 * count >= threshold (si zoneCode="ALL") ou juste pour la zone
 * ciblée sinon.
 */
async function detectSpike(
  t: {
    id: string
    zoneCode: string
    type: string
    threshold: number
    lastTriggeredAt: Date | null
  },
  windowMs: number,
  now: Date,
): Promise<TriggeredAlert[]> {
  const since = new Date(now.getTime() - windowMs)
  const rows = await db.airportReport.findMany({
    where: { createdAt: { gte: since } },
    select: { zone: { select: { code: true } } },
  })

  // Comptage par code zone
  const counts = new Map<string, number>()
  for (const r of rows) {
    const code = r.zone?.code ?? 'INCONNU'
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }

  const out: TriggeredAlert[] = []
  if (t.zoneCode === 'ALL') {
    // Déclenche pour chaque zone qui dépasse le seuil
    for (const [code, count] of counts) {
      if (count >= t.threshold) {
        out.push(makeAlert(t, code, count, now))
      }
    }
  } else {
    const count = counts.get(t.zoneCode) ?? 0
    if (count >= t.threshold) {
      out.push(makeAlert(t, t.zoneCode, count, now))
    }
  }
  return out
}

/**
 * PENDING_COUNT : compte des reports EN_ATTENTE.
 * Si zoneCode="ALL", on compte sur toutes zones et on déclenche
 * une seule alerte (zoneCode="ALL" dans la réponse).
 */
async function detectPendingCount(
  t: {
    id: string
    zoneCode: string
    type: string
    threshold: number
    lastTriggeredAt: Date | null
  },
  now: Date,
): Promise<TriggeredAlert[]> {
  const where: { statut: string; zone?: { code: string } } = {
    statut: 'EN_ATTENTE',
  }
  if (t.zoneCode !== 'ALL') {
    where.zone = { code: t.zoneCode }
  }
  const count = await db.airportReport.count({ where })
  if (count >= t.threshold) {
    return [makeAlert(t, t.zoneCode, count, now)]
  }
  return []
}

/**
 * NO_RESOLUTION_HOURS : âge (heures) du plus vieux report
 * EN_ATTENTE. Si zoneCode="ALL", on prend le plus vieux toutes
 * zones confondues.
 */
async function detectNoResolution(
  t: {
    id: string
    zoneCode: string
    type: string
    threshold: number
    lastTriggeredAt: Date | null
  },
  now: Date,
): Promise<TriggeredAlert[]> {
  const where: { statut: string; zone?: { code: string } } = {
    statut: 'EN_ATTENTE',
  }
  if (t.zoneCode !== 'ALL') {
    where.zone = { code: t.zoneCode }
  }
  // Tri par createdAt asc pour récupérer le plus ancien
  const oldest = await db.airportReport.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  if (!oldest) return []

  const ageMs = now.getTime() - oldest.createdAt.getTime()
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000))
  if (ageHours >= t.threshold) {
    return [makeAlert(t, t.zoneCode, ageHours, now)]
  }
  return []
}

function makeAlert(
  t: {
    id: string
    zoneCode: string
    type: string
    threshold: number
    lastTriggeredAt: Date | null
  },
  triggeredZoneCode: string,
  currentValue: number,
  now: Date,
): TriggeredAlert {
  const type = t.type as ThresholdType
  const suppressed =
    !!t.lastTriggeredAt &&
    now.getTime() - t.lastTriggeredAt.getTime() < ANTI_SPAM_MS

  return {
    thresholdId: t.id,
    type,
    zoneCode: triggeredZoneCode,
    currentValue,
    threshold: t.threshold,
    severity: severity(currentValue, t.threshold),
    message: buildMessage(type, triggeredZoneCode, currentValue, t.threshold),
    triggeredAt: now.toISOString(),
    suppressed,
  }
}

// ---------------------------------------------------------------
// GET — détection principale
// ---------------------------------------------------------------
export async function GET(_req: NextRequest) {
  const now = new Date()

  const thresholds = await db.airportAlertThreshold.findMany({
    where: { active: true },
    orderBy: [{ zoneCode: 'asc' }, { type: 'asc' }],
  })

  const alerts: TriggeredAlert[] = []

  for (const t of thresholds) {
    let triggered: TriggeredAlert[] = []
    if (t.type === 'SPIKE_15MIN' || t.type === 'SPIKE_30MIN' || t.type === 'SPIKE_1H') {
      triggered = await detectSpike(t, SPIKE_WINDOW_MS[t.type], now)
    } else if (t.type === 'PENDING_COUNT') {
      triggered = await detectPendingCount(t, now)
    } else if (t.type === 'NO_RESOLUTION_HOURS') {
      triggered = await detectNoResolution(t, now)
    }
    alerts.push(...triggered)
  }

  // --- Anti-spam : on met à jour lastTriggeredAt uniquement
  // pour les alertes NON supprimées (hors fenêtre 30 min).
  // Les alertes supprimées sont quand même retournées (le
  // wallboard les affiche toujours) pour ne pas faire clignoter
  // la bannière toutes les 30s.
  const toUpdate = alerts.filter((a) => !a.suppressed)
  if (toUpdate.length > 0) {
    const uniqueThresholdIds = Array.from(
      new Set(toUpdate.map((a) => a.thresholdId)),
    )
    await Promise.all(
      uniqueThresholdIds.map((id) =>
        db.airportAlertThreshold.update({
          where: { id },
          data: { lastTriggeredAt: now },
        }),
      ),
    )
  }

  // --- Log WhatsApp (mode démo) ---
  // En production : envoyer un WhatsApp aux ops actifs pour
  // chaque nouvelle alerte (non supprimée).
  if (toUpdate.length > 0) {
    const opsPhones = await getActiveOpsPhones()
    for (const a of toUpdate) {
      console.log(
        `[airport-alerts] 🚨 ${a.severity.toUpperCase()} — ${a.message} (ops: ${opsPhones.length} actif(s))`,
      )
    }
  }

  return ok({
    alerts: alerts.sort((a, b) => {
      // Critical d'abord, puis par valeur décroissante
      if (a.severity !== b.severity) {
        return a.severity === 'critical' ? -1 : 1
      }
      return b.currentValue - a.currentValue
    }),
    lastCheckedAt: now.toISOString(),
    stats: {
      totalActive: thresholds.length,
      triggered: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
    },
  })
}
