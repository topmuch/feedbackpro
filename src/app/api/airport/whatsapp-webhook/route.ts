// ============================================================
// POST /api/airport/whatsapp-webhook  (Twilio WhatsApp Business)
// GET  /api/airport/whatsapp-webhook  (health check)
// ------------------------------------------------------------
// Webhook appelé par Twilio quand un agent ops envoie un message
// WhatsApp au bot. Le contrat Twilio est le suivant :
//   - Content-Type: application/x-www-form-urlencoded
//   - Champs notables : From (whatsapp:+33612345678), Body, MessageSid
//   - Header X-Twilio-Signature : signature HMAC-SHA1 du payload
//     avec le Auth Token Twilio comme clé.
//
// Réponse : TwiML XML (Content-Type: text/xml) contenant un
// <Message> qui sera renvoyé à l'expéditeur.
//
// Sécurité :
//   - En production (TWILIO_TOKEN présent) : validation de la
//     signature X-Twilio-Signature.
//   - En mode démo (TWILIO_TOKEN absent) : on accepte tout et on
//     logge un warning.
//
// Robustesse : ne renvoie JAMAIS 500 — en cas d'erreur on renvoie
// un TwiML avec un message d'erreur convivial.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { handleAirportBotMessage } from '@/lib/airport-bot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ----------------------------------------------------------------
// Validation signature Twilio
// ----------------------------------------------------------------

/**
 * Vérifie la signature X-Twilio-Signature d'une requête Twilio.
 *
 * Algorithme Twilio :
 *   1. Construire l'URL de la requête (scheme + host + path + query).
 *      En production behind proxy, Twilio utilise l'URL publique :
 *      on prend donc les headers x-forwarded-proto / host.
 *   2. Concaténer l'URL + les paramètres POST triés par clé.
 *   3. Calculer HMAC-SHA1 avec le Auth Token Twilio comme clé.
 *   4. Comparer en base64 avec le header X-Twilio-Signature.
 */
function verifyTwilioSignature(
  req: NextRequest,
  rawBody: string,
  authToken: string,
): boolean {
  try {
    const sigHeader = req.headers.get('x-twilio-signature') ?? ''
    if (!sigHeader) return false

    // Reconstruire l'URL publique vue par Twilio
    const proto =
      req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
    if (!host) return false
    const url = `${proto}://${host}${req.nextUrl.pathname}`

    // Parser les params POST depuis le raw body (déjà form-urlencoded)
    const params = new URLSearchParams(rawBody)
    const sortedKeys = [...params.keys()].sort()
    let data = url
    for (const k of sortedKeys) {
      data += k + (params.get(k) ?? '')
    }

    const computed = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf8'))
      .digest('base64')

    // Comparaison timing-safe
    const a = Buffer.from(computed, 'base64')
    const b = Buffer.from(sigHeader, 'base64')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ----------------------------------------------------------------
// Helpers XML
// ----------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function twimlMessage(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${escapeXml(text)}</Message>\n</Response>`
}

function twimlResponse(text: string, status = 200): NextResponse {
  return new NextResponse(twimlMessage(text), {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

// ----------------------------------------------------------------
// Extraction du numéro : "whatsapp:+33612345678" → "33612345678"
// ----------------------------------------------------------------

function extractPhone(from: string): string | null {
  if (!from) return null
  // Supprime le préfixe "whatsapp:" puis le "+" et tout non-chiffre
  const cleaned = from.replace(/^whatsapp:/i, '').replace(/[^0-9]/g, '')
  return /^\d{8,15}$/.test(cleaned) ? cleaned : null
}

// ----------------------------------------------------------------
// GET — health check (uptime monitoring)
// ----------------------------------------------------------------

export async function GET() {
  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

// ----------------------------------------------------------------
// POST — webhook Twilio
// ----------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    // --- Validation signature (mode production uniquement) ---
    const twilioToken = process.env.TWILIO_TOKEN
    if (twilioToken) {
      const valid = verifyTwilioSignature(req, rawBody, twilioToken)
      if (!valid) {
        console.warn('[airport-webhook] Signature Twilio invalide — requête rejetée')
        // On renvoie quand même un TwiML valide (Twilio rejette les 500/403 en retry)
        return twimlResponse('⛔ Requête non authentifiée.', 403)
      }
    } else {
      console.warn(
        '[airport-webhook] ⚠ TWILIO_TOKEN absent — mode démo, signature non vérifiée',
      )
    }

    // --- Parsing form-urlencoded ---
    const params = new URLSearchParams(rawBody)
    const from = params.get('From') ?? ''
    const body = params.get('Body') ?? ''
    const messageSid = params.get('MessageSid') ?? ''

    const phone = extractPhone(from)
    if (!phone) {
      console.warn(`[airport-webhook] From invalide : "${from}"`)
      return twimlResponse('⚠️ Numéro d\'expéditeur invalide.')
    }

    console.log(
      `[airport-webhook] Message reçu de ${phone} (sid=${messageSid}) : "${body.slice(0, 80)}"`,
    )

    // --- Dispatch vers le bot ---
    const result = await handleAirportBotMessage(phone, body)

    if (result.shouldAlert) {
      console.log(
        `[airport-webhook] Action ops détectée de ${phone} — réponse: ${result.reply.slice(0, 80)}...`,
      )
    }

    return twimlResponse(result.reply)
  } catch (err) {
    console.error('[airport-webhook] Erreur inattendue :', err)
    // JAMAIS de 500 — TwiML d'erreur convivial
    return twimlResponse('⚠️ Erreur temporaire, réessayez.')
  }
}
