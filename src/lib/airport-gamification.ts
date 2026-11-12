// ============================================================
// Lib : Score Agent + Black Box Audit Trail
// ------------------------------------------------------------
// Fonctions partagées pour la gamification et l'audit immuable.
// ============================================================

import { db } from '@/lib/db'

// --- Score Agent ---

/**
 * Attribution des points selon la vitesse de résolution.
 * < 5min = +20pts, < 10min = +10pts, < 20min = +5pts, sinon +2pts.
 */
export function pointsForResolution(elapsedMinutes: number): number {
  if (elapsedMinutes < 5) return 20
  if (elapsedMinutes < 10) return 10
  if (elapsedMinutes < 20) return 5
  return 2
}

/**
 * Met à jour (ou crée) le score d'un agent après une résolution.
 * Idempotent : si l'agent n'existe pas pour ce mois, on le crée.
 */
export async function updateAgentScore(
  staffName: string,
  staffPhone: string | null,
  elapsedMinutes: number,
  resolvedAt: Date,
): Promise<{ points: number; total: number; resolutions: number }> {
  const month = `${resolvedAt.getFullYear()}-${String(resolvedAt.getMonth() + 1).padStart(2, '0')}`
  const pts = pointsForResolution(elapsedMinutes)

  const existing = await db.airportAgentScore.findUnique({
    where: { staffName_month: { staffName, month } },
  })

  if (existing) {
    const updated = await db.airportAgentScore.update({
      where: { id: existing.id },
      data: {
        points: { increment: pts },
        resolutions: { increment: 1 },
        totalMinutes: { increment: elapsedMinutes },
        avgMinutes: Math.round((existing.totalMinutes + elapsedMinutes) / (existing.resolutions + 1)),
        lastResolvedAt: resolvedAt,
        staffPhone: staffPhone ?? existing.staffPhone,
      },
    })
    return { points: pts, total: updated.points, resolutions: updated.resolutions }
  }

  const created = await db.airportAgentScore.create({
    data: {
      staffName,
      staffPhone,
      points: pts,
      resolutions: 1,
      totalMinutes: elapsedMinutes,
      avgMinutes: elapsedMinutes,
      month,
      lastResolvedAt: resolvedAt,
    },
  })
  return { points: pts, total: created.points, resolutions: created.resolutions }
}

// --- Black Box Audit Trail ---

/**
 * Enregistre une entrée immuable dans l'audit trail.
 * Impossible à effacer (pas d'API DELETE sur cette table).
 */
export async function logAuditEntry(params: {
  reportId: string
  action: 'CREATED' | 'TAKE_CHARGE' | 'RESOLVED' | 'ASSIGNED' | 'ALERT_TRIGGERED'
  actor: string
  fromStatut?: string | null
  toStatut: string
  photoUrl?: string | null
  note?: string | null
}): Promise<void> {
  try {
    // Calculer le temps écoulé depuis la création du report
    let elapsedMin: number | null = null
    const report = await db.airportReport.findUnique({
      where: { id: params.reportId },
      select: { createdAt: true },
    })
    if (report) {
      elapsedMin = Math.round((Date.now() - report.createdAt.getTime()) / 60000)
    }

    await db.airportAuditTrail.create({
      data: {
        reportId: params.reportId,
        action: params.action,
        actor: params.actor,
        fromStatut: params.fromStatut ?? null,
        toStatut: params.toStatut,
        elapsedMin,
        photoUrl: params.photoUrl ?? null,
        note: params.note ?? null,
      },
    })
    console.log(`[blackbox] ${params.action} — report ${params.reportId} → ${params.toStatut} par ${params.actor}`)
  } catch (err) {
    console.warn(`[blackbox] Erreur audit entry:`, err)
  }
}
