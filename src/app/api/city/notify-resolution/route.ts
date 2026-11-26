// ============================================================
// POST /api/city/notify-resolution
// ------------------------------------------------------------
// Feature #1 — Notification WhatsApp au citoyen lors de la
// résolution de son signalement.
//
// La mairie clique « Résolu » sur un incident dans le dashboard.
// Si le signalement contient un numéro de téléphone (soit dans
// la description, soit saisi manuellement par l'agent), on génère
// un lien wa.me pré-rempli avec un message de résolution.
//
// Approche V1 (zéro coût API) : on renvoie une URL wa.me que le
// navigateur ouvre dans un nouvel onglet. L'agent (ou un bot
// WhatsApp Business futur) clique/envoie manuellement. Pas
// d'appel payant à l'API WhatsApp Cloud — juste un deep link.
//
// Payload attendu (JSON) :
//   {
//     incidentId: string,   // ID de l'incident résolu
//     phone: string         // numéro du citoyen (format intl ou local)
//   }
//
// Réponse (200) : { ok: true, data: { whatsappUrl, message, incidentId } }
// Réponse (4xx) : { ok: false, error }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return fail('Payload invalide', 400)

  const { incidentId, phone } = body as { incidentId?: string; phone?: string }

  if (!incidentId || typeof incidentId !== 'string') {
    return fail('incidentId requis', 400)
  }
  if (!phone || typeof phone !== 'string') {
    return fail('phone requis', 400)
  }

  // Récupère l'incident pour construire un message contextuel
  const incident = await db.cityIncident.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      type: true,
      category: true,
      assignedTo: true,
      staffName: true,
      resolvedAt: true,
      description: true,
    },
  })
  if (!incident) return fail('Incident introuvable', 404)

  // Normalisation du numéro pour wa.me :
  //   - on supprime tout sauf les chiffres
  //   - wa.me attend le format international SANS le « + » ni espaces.
  //   - ex: "+221 77 123 45 67" → "221771234567"
  const digitsOnly = phone.replace(/[^\d]/g, '')
  if (digitsOnly.length < 8) {
    return fail('Numéro de téléphone invalide', 400)
  }

  // Libellé court du type d'incident pour le message
  const categoryLabel = incident.category || incident.type

  // Message pré-rempli (encodé pour URL). Ton citoyen, positif,
  // remercie le citoyen pour sa contribution.
  const msg = `Bonjour, votre signalement « ${categoryLabel} » a été résolu par ${incident.assignedTo || incident.staffName || 'la Mairie'}. Merci pour votre contribution citoyenne !`
  const waUrl = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(msg)}`

  console.log(
    `[city-notify] Résolution notifiée — incident #${incident.id.slice(-6)} → ${digitsOnly}`,
  )

  return ok({
    incidentId: incident.id,
    whatsappUrl: waUrl,
    message: msg,
    resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
  })
}
