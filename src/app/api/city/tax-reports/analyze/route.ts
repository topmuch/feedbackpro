// ============================================================
// /api/city/tax-reports/analyze
// ------------------------------------------------------------
// Ville Connectée — Analyse VLM d'une photo de dépôt sauvage
// (camion benne, conteneur, gravats, véhicule, chantier, déchet vert).
//
// POST → AI photo analysis using z-ai-web-dev-sdk VLM.
//         Body : { photoDataUrl: string }
//         Analyse la photo via createVision et retourne :
//           { depositType, hasVehicle, vehiclePlate, description }
//         Si le SDK échoue ou n'est pas configuré → fallback gracieux :
//           { depositType: "unknown", hasVehicle: false,
//             vehiclePlate: null, description: "Analyse indisponible" }
//
// Retourne { ok: true, data: { analysis: {...} } }
//
// NOTE: z-ai-web-dev-sdk est backend only. On l'importe dynamiquement
// dans le handler (pas d'import statique au top du fichier) pour
// éviter tout bundling côté client et supporter l'échec gracieux.
// ============================================================

import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------
// Fallback par défaut (VLM indisponible ou échec)
// ---------------------------------------------------------------

const FALLBACK_ANALYSIS = {
  depositType: 'unknown',
  hasVehicle: false,
  vehiclePlate: null,
  description: 'Analyse indisponible',
} as const

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Extrait le JSON de la réponse VLM.
 * Gère plusieurs cas :
 *   - JSON pur
 *   - JSON dans bloc markdown ```json ... ```
 *   - JSON noyé dans du texte (premier { ... dernier })
 */
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null

  // 1. JSON.parse direct
  try {
    return JSON.parse(text)
  } catch {
    // continue
  }

  // 2. Bloc markdown ```json ... ``` ou ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {
      // continue
    }
  }

  // 3. Première sous-chaîne { ... } (greedy sur le dernier })
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      // continue
    }
  }

  return null
}

/**
 * Valide et normalise le résultat du VLM.
 * On accepte des valeurs partielles : si un champ manque, on prend
 * la valeur de fallback.
 */
function normalizeAnalysis(
  parsed: Record<string, unknown>,
): {
  depositType: string
  hasVehicle: boolean
  vehiclePlate: string | null
  description: string
} {
  // depositType : chaîne non vide
  const depositType =
    typeof parsed.depositType === 'string' &&
    parsed.depositType.trim().length > 0
      ? parsed.depositType.trim().slice(0, 60)
      : 'unknown'

  // hasVehicle : booléen (on accepte aussi "true"/"false" strings)
  let hasVehicle = false
  if (typeof parsed.hasVehicle === 'boolean') {
    hasVehicle = parsed.hasVehicle
  } else if (typeof parsed.hasVehicle === 'string') {
    hasVehicle = parsed.hasVehicle.toLowerCase() === 'true'
  }

  // vehiclePlate : chaîne ou null
  const vehiclePlate =
    typeof parsed.vehiclePlate === 'string' &&
    parsed.vehiclePlate.trim().length > 0
      ? parsed.vehiclePlate.trim().slice(0, 30)
      : null

  // description : chaîne (max 500)
  const description =
    typeof parsed.description === 'string'
      ? parsed.description.trim().slice(0, 500)
      : 'Analyse indisponible'

  return { depositType, hasVehicle, vehiclePlate, description }
}

// ---------------------------------------------------------------
// POST — AI photo analysis using z-ai-web-dev-sdk VLM
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('Payload JSON invalide', 400)
  }

  const b = body as { photoDataUrl?: string }

  // --- photoDataUrl (obligatoire) ---
  if (
    typeof b.photoDataUrl !== 'string' ||
    b.photoDataUrl.trim().length === 0
  ) {
    console.log('[city-tax-analyze] photoDataUrl manquant')
    return fail('photoDataUrl requis (data URL base64)', 400)
  }

  const photoDataUrl = b.photoDataUrl.trim()

  // On accepte les data URLs (data:image/...) ET les URLs HTTP(S)
  // pour permettre l'analyse d'une photo déjà uploadée.
  if (
    !photoDataUrl.startsWith('data:') &&
    !photoDataUrl.startsWith('http')
  ) {
    return fail(
      'photoDataUrl invalide (doit être une data URL ou une URL HTTP)',
      400,
    )
  }

  // ---------------------------------------------------------------
  // Appel au VLM — on importe dynamiquement le SDK dans le handler
  // pour garantir un échec gracieux si le SDK n'est pas installé ou
  // si la clé API n'est pas configurée.
  // ---------------------------------------------------------------
  try {
    const ZAIModule = (await import('z-ai-web-dev-sdk')) as {
      default: typeof import('z-ai-web-dev-sdk').default
    }
    const ZAI = ZAIModule.default

    const zai = await ZAI.create()

    const prompt =
      'Analyse cette photo. Identifie: 1) le type de dépôt (conteneur, gravats, véhicule, chantier, déchet vert, autre), ' +
      '2) si un véhicule est visible avec sa plaque d\'immatriculation, ' +
      '3) une description courte. ' +
      'Réponds en JSON: {"depositType":"...","hasVehicle":true/false,"vehiclePlate":"...","description":"..."}'

    // Le SDK z-ai-web-dev-sdk expose createVision ; les types TS peuvent
    // être imprécis — on cast en unknown puis en any pour la friction.
    const visionBody = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: photoDataUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    } as unknown as Parameters<typeof zai.chat.completions.createVision>[0]

    const response = (await zai.chat.completions.createVision(visionBody)) as {
      choices?: { message?: { content?: string } }[]
    }

    const rawText = response?.choices?.[0]?.message?.content ?? ''
    const parsed = extractJson(rawText)

    if (!parsed) {
      console.log(
        '[city-tax-analyze] VLM a répondu sans JSON exploitable — fallback',
      )
      return ok({ analysis: { ...FALLBACK_ANALYSIS } })
    }

    const analysis = normalizeAnalysis(parsed)
    console.log(
      `[city-tax-analyze] VLM OK — depositType=${analysis.depositType}, hasVehicle=${analysis.hasVehicle}` +
        (analysis.vehiclePlate ? `, plate=${analysis.vehiclePlate}` : ''),
    )

    return ok({ analysis })
  } catch (err) {
    // Échec gracieux — le SDK n'est pas configuré, la clé API est
    // manquante, le réseau est coupé, ou la photo est inutilisable.
    // On ne casse pas l'UX : on retourne le fallback par défaut.
    const msg = err instanceof Error ? err.message : String(err)
    console.log(
      `[city-tax-analyze] VLM indisponible ou échec — fallback activé: ${msg.slice(0, 120)}`,
    )
    return ok({ analysis: { ...FALLBACK_ANALYSIS } })
  }
}
