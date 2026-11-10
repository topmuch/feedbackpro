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
import { analyserEtRouterReport } from '@/lib/airport-vlm'

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
    flightNumber?: string
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
  // Validation numéro de vol (optionnel, format libre mais on normalise)
  let flightNumber: string | null = null
  if (b.flightNumber && typeof b.flightNumber === 'string') {
    const fn = b.flightNumber.trim().toUpperCase().replace(/\s+/g, '')
    // Format attendu : 2 lettres + 1-4 chiffres (ex: AF123, DL6049, BA049)
    if (/^[A-Z0-9]{2}[0-9]{1,4}$/.test(fn)) {
      flightNumber = fn
    } else if (fn.length >= 2 && fn.length <= 8) {
      // Accepter formats laxistes (compagnie + numéro collés)
      flightNumber = fn.slice(0, 8)
    } else {
      return fail('Numéro de vol invalide (format attendu : AF123, DL6049…)', 400)
    }
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
      flightNumber,
      whatsappOptin: optin,
      whatsappPhone: phone,
      statut: 'EN_ATTENTE',
      whatsappPayload: whatsappMessage,
    },
  })

  // --- Analyse VLM asynchrone (non bloquante) ---
  // Si une photo est jointe, on lance l'analyse en arrière-plan.
  // Le VLM catégorise la photo et route le signalement vers la bonne
  // équipe ops (nettoyage / maintenance / securite / logistique…).
  // L'utilisateur ne attend pas cette analyse (peut prendre 5-15s).
  if (b.photoUrl) {
    // fire-and-forget : pas d'await, on logge juste les erreurs
    analyserEtRouterReport(report.id, b.photoUrl).catch((err) => {
      console.warn('[airport-report] VLM async error:', err instanceof Error ? err.message : String(err))
    })
    console.log(`[airport-report] VLM analysis queued for report ${report.id}`)
  }

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
      flightNumber: report.flightNumber,
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
    // Indique au client qu'une analyse VLM est en cours (pour affichage
    // d'un badge « analyse IA en cours » sur l'écran de confirmation).
    vlmPending: Boolean(b.photoUrl),
  })
}
