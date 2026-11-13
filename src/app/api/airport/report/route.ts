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
import { sendEmail } from '@/lib/email'
import { triggerPushNotification } from '@/lib/push-notifier'
import { dispatchNotification } from '@/lib/notification-engine'

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

  // Auto-création de la zone en BDD si elle n'existe pas encore.
  // Sur un déploiement frais (sans seed), les zones aéroport n'existent
  // pas en base — on les crée à la volée depuis la config statique
  // (src/lib/airport-config.ts) pour que la PWA fonctionne immédiatement
  // sans intervention manuelle.
  let zone = await db.airportZone.findUnique({ where: { code: config.code } })
  if (!zone) {
    console.log(`[airport-report] Auto-création zone ${config.code} depuis config statique`)
    zone = await db.airportZone.create({
      data: {
        code: config.code,
        nom: config.nom,
        emoji: config.emoji,
        description: config.description ?? null,
        tags: JSON.stringify(config.tags),
        problemes: JSON.stringify([...config.problemes]),
      },
    })
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

  // --- Email notification au manager (non bloquant) ---
  // Envoie un email à tous les Pros "Aéroport" pour les informer
  // du nouveau signalement. Fire-and-forget (ne bloque pas la réponse
  // au voyageur). En mode démo (pas de RESEND_API_KEY), logge seulement.
  notifierManagersEmail(report, zone, b.tag, b.commentaire ?? null, flightNumber, createdAt).catch((err) => {
    console.warn('[airport-report] Email notification error:', err instanceof Error ? err.message : String(err))
  })

  // --- Push notification au staff terrain (Task P1 — always-on) ---
  // Fire-and-forget : envoie une notification Web Push à tous les
  // appareils staff abonnés (AirportPushSubscription). Le SW réveille
  // le navigateur — même PWA fermée — et affiche une notif système
  // avec actions "Voir l'incident" / "Ignorer".
  // URL cible : "/?staff=1&report=<id>" pour que le clic ouvre la PWA
  // staff directement sur l'incident concerné.
  triggerPushNotification({
    title: 'Nouvel incident',
    body: `${zone.nom} — ${b.problemType}`,
    url: `/?staff=1&report=${report.id}`,
    tag: `incident-${report.id}`,
  }).catch((err) => {
    console.warn('[airport-report] Push notification error:', err instanceof Error ? err.message : String(err))
  })

  // --- Task N1 — Centre de Notifications : dispatch unifié ---
  // Fire-and-forget : délègue au moteur de notifications central qui
  // consulte les NotificationTemplate + NotificationSetting en base et
  // envoie sur tous les canaux actifs (push / sms_mtarget / whatsapp /
  // email) configurés pour le déclencheur "new_incident". Le moteur logge
  // chaque envoi dans NotificationLog pour audit. Ne lève jamais.
  const incidentLink = `${process.env.NEXT_PUBLIC_APP_URL || ''}/?staff=1&report=${report.id}`
  dispatchNotification('new_incident', {
    incidentId: report.id,
    zone: `${zone.emoji} ${zone.nom}`,
    type: b.problemType,
    link: incidentLink,
    // Pas de staffName à ce stade : l'incident vient d'être créé, il n'est
    // pas encore assigné. Le template "new_incident" broadcast au staff.
  }).catch((err) => {
    console.warn('[airport-report] Notification dispatch error:', err instanceof Error ? err.message : String(err))
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

// ============================================================
// Email notification au manager aéroport
// ------------------------------------------------------------
// Envoie un email à tous les Pros "Aéroport" pour les informer
// d'un nouveau signalement. Non bloquant (fire-and-forget).
// ============================================================

type ZoneInfo = { code: string; nom: string; emoji: string }
type ReportInfo = { id: string; problemType: string; tagScanne: string }

async function notifierManagersEmail(
  report: ReportInfo,
  zone: ZoneInfo,
  tag: string,
  commentaire: string | null,
  flightNumber: string | null,
  createdAt: Date,
): Promise<void> {
  // Trouve tous les Pros "Aéroport" avec leur email User
  const pros = await db.pro.findMany({
    where: { typeEtablissement: 'Aéroport', suspendu: false },
    include: { user: { select: { email: true } } },
  })

  if (pros.length === 0) {
    console.log('[airport-email] Aucun Pro Aéroport trouvé — email non envoyé')
    return
  }

  const heure = createdAt.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const sujet = `🚨 Nouveau signalement — ${zone.emoji} ${zone.nom} — ${report.problemType}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 32px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 32px;">✈️</div>
          <div>
            <h1 style="color: #fbbf24; font-size: 20px; font-weight: 800; margin: 0;">Nouveau signalement aéroport</h1>
            <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0;">FeedbackPro — Système de signalement voyageur</p>
          </div>
        </div>
      </div>

      <!-- Corps -->
      <div style="padding: 24px 32px;">
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 14px; color: #78350f;">
            <strong>⚠ Action requise :</strong> Un voyageur vient de signaler un problème. Veuillez intervenir rapidement.
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-weight: 600; width: 140px;">Zone</td>
            <td style="padding: 10px 0; color: #0f172a;">${zone.emoji} ${zone.nom}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Emplacement</td>
            <td style="padding: 10px 0; color: #0f172a; font-family: monospace;">${tag}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Problème</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 700;">${report.problemType}</td>
          </tr>
          ${flightNumber ? `
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Vol</td>
            <td style="padding: 10px 0; color: #0f172a; font-family: monospace; font-weight: 700;">✈️ ${flightNumber}</td>
          </tr>` : ''}
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Heure</td>
            <td style="padding: 10px 0; color: #0f172a;">${heure}</td>
          </tr>
          ${commentaire ? `
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 600; vertical-align: top;">Précision</td>
            <td style="padding: 10px 0; color: #0f172a; font-style: italic;">« ${commentaire} »</td>
          </tr>` : ''}
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Signalement #</td>
            <td style="padding: 10px 0; color: #64748b; font-family: monospace; font-size: 12px;">${report.id}</td>
          </tr>
        </table>

        <!-- CTA -->
        <div style="margin-top: 24px; text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/airport-dashboard?tab=signalements"
             style="display: inline-block; background: #0f172a; color: #fbbf24; font-weight: 700; font-size: 14px; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
            Voir sur le dashboard ops →
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #0f172a; padding: 16px 32px; text-align: center;">
        <p style="color: #475569; font-size: 11px; margin: 0;">
          Cet email a été envoyé automatiquement par FeedbackPro — Système de signalement aéroport.
        </p>
      </div>
    </div>
  `

  // Envoie à chaque Pro aéroport
  for (const pro of pros) {
    const email = pro.user?.email
    if (!email) continue
    try {
      await sendEmail(email, sujet, html)
      console.log(`[airport-email] Notification envoyée à ${email}`)
    } catch (err) {
      console.warn(`[airport-email] Échec envoi à ${email}:`, err instanceof Error ? err.message : String(err))
    }
  }
}
