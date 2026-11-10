// ============================================================
// POST /api/airport/ops/resolve
// ------------------------------------------------------------
// Endpoint REST alternatif au bot WhatsApp : permet au wallboard
// ou au dashboard ops de marquer un signalement comme résolu.
//
// Payload (JSON) :
//   { reportId: string, phone?: string }
//     - reportId : ID complet (cuid) du signalement AirportReport
//     - phone    : numéro ops (audit) — optionnel
//
// Comportement :
//   - Passe AirportReport.statut à "RESOLU"
//   - Positionne AirportReport.resolvedAt = now()
//   - Si le signalement a whatsappOptin=true et whatsappPhone, on
//     logge le TODO de notification voyageur (en production, envoie
//     un WhatsApp via Twilio).
//
// Réponses :
//   200 { ok: true, data: { reportId, statut, resolvedAt } }
//   400 { ok: false, error: "..." }  (payload invalide)
//   404 { ok: false, error: "Signalement introuvable" }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { reportId?: string; phone?: string }
  if (!b.reportId || typeof b.reportId !== 'string' || b.reportId.trim().length === 0) {
    return fail('reportId manquant', 400)
  }

  // Audit : numéro ops optionnel (pour tracer qui a résolu)
  const phone = typeof b.phone === 'string' ? b.phone.replace(/[^0-9]/g, '') : null

  const existing = await db.airportReport.findUnique({
    where: { id: b.reportId },
    select: {
      id: true,
      statut: true,
      whatsappOptin: true,
      whatsappPhone: true,
      problemType: true,
      zoneId: true,
    },
  })
  if (!existing) {
    return fail('Signalement introuvable', 404)
  }

  const now = new Date()
  const updated = await db.airportReport.update({
    where: { id: b.reportId },
    data: { statut: 'RESOLU', resolvedAt: now },
    select: { id: true, statut: true, resolvedAt: true },
  })

  // --- Notification voyageur (TODO production) ---
  // Si le voyageur a opt-in pour être notifié, on doit lui envoyer
  // un WhatsApp lui indiquant que son signalement est résolu.
  // En production : appel à Twilio WhatsApp Business API.
  if (existing.whatsappOptin && existing.whatsappPhone) {
    console.log(
      `[airport] TODO: notify voyageur ${existing.whatsappPhone} that report ${existing.id} is resolved`,
    )
  }

  // Audit log
  console.log(
    `[airport] /ops/resolve — report ${updated.id} marqué RESOLU par ${phone ?? 'unknown'} à ${now.toISOString()}`,
  )

  return ok({
    reportId: updated.id,
    statut: updated.statut,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
  })
}
