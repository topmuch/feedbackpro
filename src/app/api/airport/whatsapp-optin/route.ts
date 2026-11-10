// ============================================================
// POST /api/airport/whatsapp-optin
// ------------------------------------------------------------
// Permet au voyageur d'enregistrer son numéro WhatsApp APRÈS
// avoir validé son signalement (depuis l'écran de confirmation),
// pour être notifié quand le problème sera résolu.
//
// Payload : { reportId: string, whatsappPhone: string }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d]/g, '')
  return /^\d{8,15}$/.test(cleaned) ? cleaned : null
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }
  const b = body as { reportId?: string; whatsappPhone?: string }
  if (!b.reportId || typeof b.reportId !== 'string') {
    return fail('reportId manquant', 400)
  }
  const phone = normalizePhone(b.whatsappPhone ?? '')
  if (!phone) {
    return fail('Numéro WhatsApp invalide (format attendu : international sans +, ex: 33612345678)', 400)
  }

  const existing = await db.airportReport.findUnique({ where: { id: b.reportId } })
  if (!existing) {
    return fail('Signalement introuvable', 404)
  }

  const updated = await db.airportReport.update({
    where: { id: b.reportId },
    data: { whatsappOptin: true, whatsappPhone: phone },
  })

  return ok({
    reportId: updated.id,
    whatsappOptin: updated.whatsappOptin,
    whatsappPhone: updated.whatsappPhone,
  })
}
