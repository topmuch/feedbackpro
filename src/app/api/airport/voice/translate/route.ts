// ============================================================
// POST /api/airport/voice/translate
// ------------------------------------------------------------
// Route de traduction LLM pour la PWA voyageur.
// Prend le texte transcrit par /api/airport/voice/transcribe (qui peut
// être en Wolof, Français ou Anglais) et le traduit en FRANÇAIS —
// langue de travail des équipes ops de l'aéroport de Dakar.
//
// Le texte traduit est ensuite injecté par le client dans le champ
// `commentaire` du formulaire de signalement (/api/airport/report).
//
// Flow :
//   1. Client POST JSON { text, source? }
//   2. Serveur valide (text non vide, < 1000 caractères)
//   3. Appel z-ai-web-dev-sdk : zai.chat.completions.create(...)
//      avec un system prompt précis + thinking: { type: "disabled" }
//   4. Le LLM renvoie UNIQUEMENT la traduction française (pas de
//      citation, pas d'explication)
//   5. Retourne { original, translated, detectedSource? }
//
// Payload (JSON) :
//   {
//     text: string,                                  // max 1000 caractères
//     source?: 'auto' | 'wolof' | 'fr' | 'en'        // défaut 'auto'
//   }
//
// Réponse (200) : { ok: true, data: { original, translated, detectedSource? } }
//   - detectedSource = source fournie si explicite (wolof/fr/en),
//     sinon résultat d'une heuristique de détection côté serveur
//     (utile pour afficher au voyageur la langue détectée).
// Réponse (4xx/5xx) : { ok: false, error: string }
//
// runtime = nodejs + force-dynamic : jamais mis en cache CDN, exécution
// serveur à chaque requête (le SDK z-ai-web-dev-sdk est backend only).
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import ZAI from "z-ai-web-dev-sdk"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Limite stricte côté serveur (cohérent avec le champ commentaire
// de /api/airport/report qui est lui aussi plafonné à 1000 caractères).
const MAX_TEXT_CHARS = 1000

type Source = "auto" | "wolof" | "fr" | "en"
const SOURCES: readonly Source[] = ["auto", "wolof", "fr", "en"] as const

const SYSTEM_PROMPT = `You are a precise translator for airport passenger feedback in Senegal. Translate the user message into FRENCH. Source language may be Wolof, French, or English (auto-detect if source=auto). Reply with ONLY the French translation, no explanation, no quotes. If the text is already in French, return it unchanged. Keep it concise and natural.`

// Typage minimal du résultat LLM retourné par z-ai-web-dev-sdk.
// Même convention défensive que dans src/lib/ia.ts et src/lib/audit-matin.ts.
type ChatCompletion = { choices?: { message?: { content?: string } }[] }

/**
 * Détection heuristique de la langue source quand source='auto'.
 * Approximative mais utile pour l'ops (badge « détecté : Wolof » sur
 * le wallboard). On privilégie la détection Wolof d'abord car c'est la
 * langue la plus probable à l'aéroport de Dakar, puis Français (accents),
 * puis Anglais.
 */
function detectLanguageHeuristic(text: string): Source {
  const lower = text.toLowerCase()

  // Mots-outils Wolof fréquents dans un signalement aéroport
  const wolofMarkers = [
    "na", "woon", "laata", "rekk", "naka", "jëf", "jënd", "daw",
    "xam", "xamle", "def", "bëgg", "dafa", "da", "ci", "nga",
    "ñu", "bu", "amul", "amna", "gën", "gëna", "wacc",
  ]
  const wolofHits = wolofMarkers.filter((w) =>
    new RegExp(`\\b${w}\\b`).test(lower),
  ).length

  // Mots-outils Français fréquents
  const frenchMarkers = [
    "le", "la", "les", "un", "une", "et", "est", "pas", "avec",
    "pour", "dans", "sur", "qui", "que", "ne", "plus", "très",
    "marche", "casse", "sale", "problème", "merci",
  ]
  const frenchHits = frenchMarkers.filter((w) =>
    new RegExp(`\\b${w}\\b`).test(lower),
  ).length
  const hasFrenchAccents = /[éèêëàâçùûîôïœÉÈÊËÀÂÇÙÛÎÔ]/.test(text)

  // Mots-outils Anglais fréquents
  const englishMarkers = [
    "the", "is", "are", "and", "with", "for", "in", "on", "to",
    "not", "broken", "dirty", "no", "missing", "please", "thanks",
  ]
  const englishHits = englishMarkers.filter((w) =>
    new RegExp(`\\b${w}\\b`).test(lower),
  ).length

  // Décision : Wolof > Français (accents) > Anglais > défaut Wolof
  if (wolofHits >= 2 && wolofHits > frenchHits && wolofHits > englishHits) {
    return "wolof"
  }
  if (hasFrenchAccents || frenchHits >= 2) {
    return "fr"
  }
  if (englishHits > frenchHits) {
    return "en"
  }
  // Fallback : à l'aéroport de Dakar, en cas d'ambiguïté c'est probablement
  // du Wolof ou du mélange Wolof/Français — on garde Wolof.
  return "wolof"
}

/**
 * Construit le message utilisateur à envoyer au LLM.
 * Quand la source est explicite, on l'indique au modèle pour fiabiliser
 * la traduction ; quand source='auto', on demande au modèle de détecter.
 */
function buildUserMessage(text: string, source: Source): string {
  if (source === "auto") {
    return `Texte à traduire (auto-détectez la langue source):\n\n${text}`
  }
  const labels: Record<Exclude<Source, "auto">, string> = {
    wolof: "Wolof",
    fr: "Français",
    en: "Anglais",
  }
  return `Langue source connue: ${labels[source]}.\nTexte à traduire:\n\n${text}`
}

export async function POST(req: NextRequest) {
  // --- Lecture JSON ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail("Payload JSON invalide", 400)
  }

  const b = body as { text?: unknown; source?: unknown }

  // --- Validation ---
  if (typeof b.text !== "string" || b.text.trim().length === 0) {
    return fail("Champ 'text' manquant ou vide", 400)
  }
  if (b.text.length > MAX_TEXT_CHARS) {
    return fail(
      `Texte trop long (${b.text.length} caractères, max ${MAX_TEXT_CHARS})`,
      400,
    )
  }

  let source: Source = "auto"
  if (typeof b.source === "string" && SOURCES.includes(b.source as Source)) {
    source = b.source as Source
  } else if (b.source !== undefined) {
    return fail(
      `Source invalide (attendu: auto | wolof | fr | en)`,
      400,
    )
  }

  const original = b.text.trim()

  // --- Appel LLM (z-ai-web-dev-sdk, backend only) ---
  try {
    const zai = await ZAI.create()
    const completion = (await zai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(original, source) },
      ],
      thinking: { type: "disabled" },
    })) as ChatCompletion

    const translatedRaw = completion?.choices?.[0]?.message?.content ?? ""
    // Nettoyage léger : le LLM est censé renvoyer UNIQUEMENT la traduction
    // (sans guillemets ni explication). Au cas où, on retire les
    // guillemets enveloppants et les espaces superflus.
    let translated = translatedRaw.trim()
    if (
      (translated.startsWith('"') && translated.endsWith('"')) ||
      (translated.startsWith("'") && translated.endsWith("'")) ||
      (translated.startsWith("«") && translated.endsWith("»"))
    ) {
      translated = translated.slice(1, -1).trim()
    }

    if (translated.length === 0) {
      // Le LLM n'a rien produit — on dégrade en renvoyant l'original
      // (mieux que de planter l'UX voyageur : le commentaire reste
      // rempli avec le texte source non traduit).
      console.warn(
        "[airport-voice-translate] LLM retour vide — fallback vers l'original",
      )
      translated = original
    }

    // detectedSource : si la source était explicite, on la renvoie telle
    // quelle ; si source='auto', on applique l'heuristique de détection
    // (le LLM est censé répondre en français uniquement, on ne peut pas
    // extraire la langue détectée de sa réponse).
    const detectedSource: Source =
      source === "auto" ? detectLanguageHeuristic(original) : source

    return ok({ original, translated, detectedSource })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[airport-voice-translate] LLM error:", message)
    return fail(`Erreur de traduction: ${message}`, 500)
  }
}
