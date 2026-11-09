// ============================================================
// POST /api/airport/report
// ------------------------------------------------------------
// Reçoit un signalement de problème voyageur, l'enregistre en BDD
// (AirportReport) et génère le payload WhatsApp destiné aux équipes
// opérationnelles de l'aéroport (format ALERTE OPÉRA-AÉROPORT).
//
// Payload attendu (JSON) :
//   {
//     tag: string,                  // tag URL scanné (ex: "tapis_bagages_1")
//     problemType: string,          // libellé exact du bouton cliqué
//     commentaire?: string,         // précision optionnelle
//     photoUrl?: string,            // URL de photo uploadée (/api/public/upload)
//     whatsappOptin?: boolean,      // voyageur veut être notifié de la résolution
//     whatsappPhone?: string        // numéro international sans +
//   }
//
// Réponse (200) : { ok: true, data: { report, whatsapp: { message, link } } }
// Réponse (4xx) : { ok: false, error: string }
// ============================================================

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/session'
import {
  resoudreZoneParTag,
  buildAirportWhatsappMessage,
  buildAirportWhatsappLink,
  type AirportWhatsappPayload,
} from '@/lib/airport-config'

export const runtime = 'nodejs'

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null
  // Garde uniquement les chiffres, supprime le + et espaces
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!/^\d{8,15}$/.test(cleaned)) return null
  return cleaned
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as {
    tag?: string
    problemType?: string
    commentaire?: string
    photoUrl?: string
    whatsappOptin?: boolean
    whatsappPhone?: string
  }

  // --- Validation ---
  if (!b.tag || typeof b.tag !== 'string') {
    return fail('Tag de zone manquant', 400)
  }
  if (!b.problemType || typeof b.problemType !== 'string' || b.problemType.trim().length === 0) {
    return fail('Problématique manquante', 400)
  }
  if (b.commentaire && typeof b.commentaire !== 'string') {
    return fail('Commentaire invalide', 400)
  }
  if (b.commentaire && b.commentaire.length > 1000) {
    return fail('Commentaire trop long (max 1000 caractères)', 400)
  }
  if (b.photoUrl && typeof b.photoUrl !== 'string') {
    return fail('Photo invalide', 400)
  }

  // --- Résolution tag → zone ---
  const config = resoudreZoneParTag(b.tag)
  if (!config) {
    return fail(`Tag inconnu : ${b.tag}`, 404)
  }

  const zone = await db.airportZone.findUnique({ where: { code: config.code } })
  if (!zone) {
    return fail('Zone non configurée en base. Lancez `bun prisma/seed-airport.ts`.', 500)
  }

  // Valider que problemType fait bien partie des 4 problématiques de la zone
  const problemesAutorises = safeParse<string[]>(zone.problemes, [...config.problemes])
  if (!problemesAutorises.includes(b.problemType)) {
    return fail(
      `Problématique « ${b.problemType} » non reconnue pour la zone ${zone.nom}. Problématiques autorisées : ${problemesAutorises.join(', ')}.`,
      400,
    )
  }

  // --- Opt-in WhatsApp ---
  const optin = b.whatsappOptin === true
  const phone = optin ? normalizePhone(b.whatsappPhone) : null
  if (optin && !phone) {
    return fail('Numéro WhatsApp invalide (format attendu : international sans +, ex: 33612345678)', 400)
  }

  // --- Génération du payload WhatsApp (cahier des charges) ---
  const createdAt = new Date()
  const whatsappPayloadData: AirportWhatsappPayload = {
    zoneNom: zone.nom,
    zoneEmoji: zone.emoji,
    problemType: b.problemType,
    tagScanne: b.tag,
    commentaire: b.commentaire ?? null,
    photoUrl: b.photoUrl ?? null,
    createdAt,
  }
  const whatsappMessage = buildAirportWhatsappMessage(whatsappPayloadData)
  const whatsappLink = buildAirportWhatsappLink(whatsappPayloadData)

  // --- Persistance en BDD ---
  const report = await db.airportReport.create({
    data: {
      zoneId: zone.id,
      tagScanne: b.tag,
      problemType: b.problemType,
      commentaire: b.commentaire?.trim() || null,
      photoUrl: b.photoUrl ?? null,
      whatsappOptin: optin,
      whatsappPhone: phone,
      statut: 'EN_ATTENTE',
      whatsappPayload: whatsappMessage,
    },
  })

  // --- Logging serveur (mode démo WhatsApp) ---
  // En production, on brancherait ici l'API WhatsApp Business (Twilio)
  // pour envoyer le message aux équipes terrain automatiquement.
  // Sans clé Twilio configurée, on logge le payload pour audit.
  if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.AIRPORT_OPS_WHATSAPP) {
    // TODO: envoyer réellement via Twilio WhatsApp Business API
    // Pour l'instant, le deep link wa.me est ouvert côté client par la PWA.
    console.log('[airport] WhatsApp API disponible — payload généré pour report', report.id)
  } else {
    console.log('[airport] Mode démo WhatsApp — payload à envoyer manuellement :')
    console.log(whatsappMessage)
    console.log('[airport] Deep link :', whatsappLink.slice(0, 120) + '...')
  }

  return ok({
    report: {
      id: report.id,
      statut: report.statut,
      problemType: report.problemType,
      tagScanne: report.tagScanne,
      createdAt: report.createdAt,
    },
    whatsapp: {
      message: whatsappMessage,
      link: whatsappLink,
    },
    zone: {
      code: zone.code,
      nom: zone.nom,
      emoji: zone.emoji,
    },
  })
}
