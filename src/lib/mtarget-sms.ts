// ============================================================
// mtarget-sms.ts — Intégration SMS Mtarget (Sénégal / Afrique de l'Ouest)
// ------------------------------------------------------------
// Task N1 — Helper serveur pour envoyer des SMS via l'API Mtarget.
//
// Mtarget est un agrégateur SMS opérant en Afrique de l'Ouest. Leur API
// REST accepte un POST JSON avec authentification par login/password
// (Basic Auth) et permet de personnaliser le sender ID.
//
// Documentation : https://docs.mtarget.sn/
// Endpoint par défaut : https://api.mtarget.sn/v1/sms/send
//
// Configuration attendue (JSON stocké dans NotificationSetting.config) :
//   {
//     "endpoint": "https://api.mtarget.sn/v1/sms/send",
//     "login": "...",
//     "password": "...",
//     "senderId": "FBKPRO"
//   }
//
// Mode démo : si login/password manquants, le SMS est simulé (log serveur)
// et la fonction renvoie ok=true — jamais d'exception qui casse le flux
// métier (le moteur de notifications reste résilient).
// ============================================================

export interface MtargetConfig {
  /** URL complète de l'API Mtarget (POST). */
  endpoint?: string
  /** Identifiant de compte Mtarget. */
  login?: string
  /** Mot de passe du compte Mtarget. */
  password?: string
  /** Sender ID affiché sur le téléphone du destinataire (ex: "FBKPRO"). */
  senderId?: string
  /** Indicatif international par défaut si le numéro est local (ex: "221"). */
  defaultCountryCode?: string
  /** Autorisation explicite à contourner la validation TLS (dev only). */
  allowInsecure?: boolean
}

export interface MtargetResult {
  ok: boolean
  /** Identifiant du SMS côté Mtarget (pour suivi). */
  messageId?: string
  /** Coût unitaire estimé (FCFA) — utilisé pour le logging. */
  cost?: number
  /** Message d'erreur en clair (ok=false). */
  error?: string
}

/**
 * Normalise un numéro de téléphone au format international sans "+".
 * - Supprime espaces, tirets, parenthèses
 * - Si le numéro commence par 0 et qu'un defaultCountryCode est fourni,
 *   on remplace le 0 par l'indicatif (ex: 06 12 34 56 78 → 33612345678
 *   si defaultCountryCode=33, ou 77 123 45 67 → 221771234567 si 221).
 * - Si le numéro commence déjà par un indicatif international, on le garde.
 */
function normalizePhone(raw: string, defaultCountryCode?: string): string {
  if (!raw) return ''
  let cleaned = raw.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1)
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2)
  // Cas : numéro local commençant par 0 → on remplace par l'indicatif
  if (cleaned.startsWith('0') && defaultCountryCode) {
    cleaned = defaultCountryCode + cleaned.slice(1)
  }
  return cleaned
}

/**
 * Envoie un SMS via l'API Mtarget.
 *
 * @param phone  Numéro du destinataire (format international accepté).
 * @param message Contenu du SMS (max 160 caractères pour 1 SMS standard).
 * @param config Configuration Mtarget lue depuis NotificationSetting.
 * @returns { ok, messageId?, cost?, error? }
 *
 * Comportement :
 *  - Mode démo (login/password absents) → log serveur, ok=true, cost=0
 *  - Succès (HTTP 200 + JSON de succès) → ok=true, messageId extrait
 *  - Échec HTTP → ok=false avec message d'erreur lisible
 *  - Timeout réseau → ok=false (ne lève jamais, fire-and-forget safe)
 *
 * Le coût est estimé à 25 FCFA par SMS (tarif indicatif Mtarget Sénégal).
 * Pour les messages > 160 caractères (SMS concaténés), le coût est multiplié.
 */
export async function sendSmsMtarget(
  phone: string,
  message: string,
  config: MtargetConfig,
): Promise<MtargetResult> {
  try {
    // --- Validation minimale ---
    if (!phone || !message) {
      return { ok: false, error: 'Numéro ou message manquant' }
    }

    const normalizedPhone = normalizePhone(phone, config.defaultCountryCode)
    if (!/^\d{8,15}$/.test(normalizedPhone)) {
      return { ok: false, error: `Numéro invalide après normalisation: ${normalizedPhone}` }
    }

    // --- Mode démo : pas de credentials ---
    if (!config.login || !config.password) {
      console.log(
        `[mtarget-sms] MODE DÉMO — SMS simulé → ${normalizedPhone} : "${message.slice(0, 60)}${message.length > 60 ? '…' : ''}"`,
      )
      return { ok: true, messageId: `demo-${Date.now()}`, cost: 0 }
    }

    const endpoint =
      config.endpoint && config.endpoint.trim().length > 0
        ? config.endpoint
        : 'https://api.mtarget.sn/v1/sms/send'

    const senderId = config.senderId || 'FBKPRO'

    // --- Authentification Basic (login:password base64) ---
    const basicAuth = Buffer.from(`${config.login}:${config.password}`).toString('base64')

    // --- Payload Mtarget (format documenté) ---
    // Mtarget accepte plusieurs schémas — on envoie le plus standard :
    // { msisdn: "...", text: "...", sender: "...", allow_insecure: true }
    const payload = {
      msisdn: normalizedPhone,
      text: message,
      sender: senderId,
      // Autorise le fallback HTTPS→HTTP en dev (sandbox Mtarget)
      allow_insecure: config.allowInsecure === true,
    }

    // --- Appel HTTP ---
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s max
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const responseText = await res.text().catch(() => '')
      let responseJson: Record<string, unknown> = {}
      try {
        responseJson = responseText ? JSON.parse(responseText) : {}
      } catch {
        /* pas du JSON — on garde responseText brut */
      }

      if (!res.ok) {
        const errMsg =
          (responseJson['message'] as string) ||
          (responseJson['error'] as string) ||
          responseText.slice(0, 200) ||
          `HTTP ${res.status}`
        console.warn(`[mtarget-sms] Échec HTTP ${res.status} → ${normalizedPhone}: ${errMsg}`)
        return { ok: false, error: `Mtarget API: ${errMsg}` }
      }

      // --- Succès : on extrait le messageId et on estime le coût ---
      const messageId =
        (responseJson['messageId'] as string) ||
        (responseJson['id'] as string) ||
        (responseJson['smsId'] as string) ||
        `mtarget-${Date.now()}`

      // Estimation du coût : 25 FCFA par segment de 160 caractères
      const segments = Math.max(1, Math.ceil(message.length / 160))
      const cost = segments * 25

      console.log(
        `[mtarget-sms] SMS envoyé → ${normalizedPhone} (id=${messageId}, cost=${cost} FCFA, segments=${segments})`,
      )
      return { ok: true, messageId, cost }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    // Timeout, DNS, connexion refusée — ne lève jamais
    const errMsg = err instanceof Error ? err.message : String(err)
    if (errMsg.includes('abort')) {
      console.warn(`[mtarget-sms] Timeout (10s) → ${phone}`)
      return { ok: false, error: 'Timeout: Mtarget API injoignable (10s)' }
    }
    console.warn(`[mtarget-sms] Erreur réseau:`, errMsg)
    return { ok: false, error: `Erreur réseau: ${errMsg}` }
  }
}

/**
 * Raccourci : parse une config JSON stockée en base (NotificationSetting.config)
 * vers un objet MtargetConfig typé. Tolérant aux erreurs de parsing.
 */
export function parseMtargetConfig(json: string): MtargetConfig {
  if (!json) return {}
  try {
    return JSON.parse(json) as MtargetConfig
  } catch {
    return {}
  }
}
