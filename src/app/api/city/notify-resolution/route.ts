// ============================================================
// POST /api/city/notify-resolution
// ------------------------------------------------------------
// Feature #1 — Notification WhatsApp au citoyen lors de la
// résolution de son signalement.
//
// La mairie clique « Résolu » sur un incident dans le dashboard.
// Si le signalement contient un numéro de téléphone (soit dans
// la description, soit saisi manuellement par l'agent), on génère
// un lien wa.me pré-rempli avec un message de résolution DÉTAILLÉ.
//
// Approche V1 (zéro coût API) : on renvoie une URL wa.me que le
// navigateur ouvre dans un nouvel onglet. L'agent (ou un bot
// WhatsApp Business futur) clique/envoie manuellement. Pas
// d'appel payant à l'API WhatsApp Cloud — juste un deep link.
//
// Payload attendu (JSON) :
//   {
//     incidentId: string,             // ID de l'incident résolu
//     phone: string,                  // numéro du citoyen (intl ou local)
//     resolutionComment?: string      // commentaire de résolution (optionnel)
//   }
//
// Réponse (200) : { ok: true, data: { whatsappUrl, message, incidentId, resolvedAt } }
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

  const { incidentId, phone, resolutionComment } = body as {
    incidentId?: string
    phone?: string
    resolutionComment?: string
  }

  if (!incidentId || typeof incidentId !== 'string') {
    return fail('incidentId requis', 400)
  }
  if (!phone || typeof phone !== 'string') {
    return fail('phone requis', 400)
  }

  // resolutionComment optionnel (max 500) : note laissée par l'agent
  // décrivant l'intervention réalisée. Incluse dans le message WhatsApp
  // au citoyen pour transparence.
  let comment: string | null = null
  if (resolutionComment !== undefined && resolutionComment !== null) {
    if (typeof resolutionComment !== 'string') {
      return fail('resolutionComment invalide', 400)
    }
    const trimmed = resolutionComment.trim()
    if (trimmed.length > 500) {
      return fail('resolutionComment trop long (max. 500 caractères)', 400)
    }
    comment = trimmed || null
  }

  // Récupère l'incident pour construire un message contextuel détaillé.
  // On sélectionne aussi plaque + GPS pour pouvoir rappeler le contexte
  // si besoin (non inclus dans le message de résolution par défaut, mais
  // disponibles pour une future extension).
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
  //   - numéro local sénégalais (9 chiffres, commence par 7/8/9) → préfixé 221
  const digitsRaw = phone.replace(/[^\d]/g, '')
  let digitsOnly = digitsRaw
  if (digitsRaw.length === 9 && /^[7-9]/.test(digitsRaw)) {
    digitsOnly = `221${digitsRaw}`
  } else if (digitsRaw.length === 13 && digitsRaw.startsWith('00221')) {
    digitsOnly = digitsRaw.slice(2)
  }
  if (digitsOnly.length < 8) {
    return fail('Numéro de téléphone invalide', 400)
  }

  // Sujet lisible du signalement : catégorie si présente, sinon le type.
  const sujet = incident.category || incident.type
  // Service ou agent qui a résolu : assignedTo (Police/Senelec/ONAS/Mairie)
  // en priorité, sinon staffName (agent nommé), fallback « la Mairie ».
  const resolvedBy = incident.assignedTo || incident.staffName || 'la Mairie'
  // Référence courte (#xxxxxx) pour que le citoyen puisse rapprocher la
  // notif de son signalement original.
  const shortRef = incident.id.slice(-6)

  // Message pré-rempli DÉTAILLÉ (encodé pour URL). Ton citoyen, positif,
  // structure en blocs lisibles sur WhatsApp :
  //   ✅ RÉSOLUTION CONFIRMÉE
  //   Votre signalement "{sujet}" (réf #{shortRef}) a été résolu par {resolvedBy}.
  //   {comment si fourni}
  //   Merci pour votre contribution citoyenne !
  const lines: string[] = ['✅ RÉSOLUTION CONFIRMÉE']
  lines.push(`Votre signalement "${sujet}" (réf #${shortRef}) a été résolu par ${resolvedBy}.`)
  if (comment) {
    lines.push(comment)
  }
  lines.push('Merci pour votre contribution citoyenne !')
  const msg = lines.join('\n')
  const waUrl = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(msg)}`

  console.log(
    `[city-notify] Résolution notifiée — incident #${shortRef} → ${digitsOnly}` +
      (comment ? ` (commentaire inclus)` : ''),
  )

  return ok({
    incidentId: incident.id,
    whatsappUrl: waUrl,
    message: msg,
    resolutionComment: comment,
    resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
  })
}
