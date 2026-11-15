// ============================================================
// POST /api/airport/translate
// ------------------------------------------------------------
// Traducteur universel "Denise" (Task WAHOO-1).
// Prend un texte saisi par un voyageur dans sa langue (français,
// anglais, chinois, arabe, wolof, espagnol, allemand, portugais,
// italien, russe, japonais — ou auto-détecté) et le traduit en
// FRANÇAIS — langue de travail des équipes ops de l'aéroport.
//
// Le texte traduit est ensuite affiché au voyageur dans la PWA
// (validation visuelle avant envoi) puis soumis à /api/airport/report
// dans le champ `commentaire` (version FR) afin que Denise l'annonce
// en français au staff via le wallboard et la PWA staff.
//
// Flow :
//   1. Client POST JSON { text, sourceLang }
//   2. Serveur valide (text non vide, < 1000 caractères)
//   3. Si sourceLang === 'fr' OU texte vide → renvoie le texte tel quel
//      (pas d'appel LLM inutile — optimisation coût/latence)
//   4. Appel z-ai-web-dev-sdk : zai.chat.completions.create(...)
//      avec un system prompt précis + thinking: { type: "disabled" }
//   5. Le LLM renvoie UNIQUEMENT la traduction française (pas de
//      citation, pas d'explication)
//   6. Retourne { ok: true, data: { original, translated, sourceLang } }
//
// runtime = nodejs + force-dynamic : jamais mis en cache CDN, exécution
// serveur à chaque requête (le SDK z-ai-web-dev-sdk est backend only).
// ============================================================

import { NextRequest } from "next/server"
import { ok, fail } from "@/lib/session"
import ZAI from "z-ai-web-dev-sdk"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Cohérent avec le champ commentaire de /api/airport/report
// (plafonné à 1000 caractères côté API).
const MAX_TEXT_CHARS = 1000

// Langues supportées par le sélecteur de la PWA (LanguagePicker).
// On tolère aussi "auto" pour la détection automatique côté LLM.
const SUPPORTED_LANGS = [
  "fr", "en", "zh", "ar", "es", "de", "pt", "it", "ru", "ja", "wo", "auto",
] as const
type SupportedLang = (typeof SUPPORTED_LANGS)[number]

const SYSTEM_PROMPT =
  "You are a professional translator. Translate the following text to French. Preserve the meaning and urgency. Respond with ONLY the translated French text, no explanations."

// Typage minimal du résultat LLM retourné par z-ai-web-dev-sdk.
// Même convention défensive que dans src/lib/ia.ts et src/lib/audit-matin.ts.
type ChatCompletion = { choices?: { message?: { content?: string } }[] }

/**
 * Construit le message utilisateur à envoyer au LLM.
 * Quand la langue source est explicite (et différente de 'fr'), on
 * l'indique au modèle pour fiabiliser la traduction. Quand sourceLang
 * vaut 'auto', on demande au modèle de détecter lui-même la langue.
 */
function buildUserMessage(text: string, sourceLang: SupportedLang): string {
  if (sourceLang === "auto") {
    return `Please translate the following text (auto-detect the source language) to French:\n\n${text}`
  }
  const labels: Record<Exclude<SupportedLang, "auto" | "fr">, string> = {
    en: "English",
    zh: "Chinese",
    ar: "Arabic",
    es: "Spanish",
    de: "German",
    pt: "Portuguese",
    it: "Italian",
    ru: "Russian",
    ja: "Japanese",
    wo: "Wolof",
  }
  if (sourceLang === "fr") {
    return `The following text is already in French. Return it unchanged:\n\n${text}`
  }
  return `Source language: ${labels[sourceLang]}. Translate to French:\n\n${text}`
}

export async function POST(req: NextRequest) {
  // --- Lecture JSON ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail("Payload JSON invalide", 400)
  }

  const b = body as { text?: unknown; sourceLang?: unknown }

  // --- Validation ---
  if (typeof b.text !== "string" || b.text.trim().length === 0) {
    // Texte vide → on renvoie tel quel (pas d'erreur, pas d'appel LLM).
    return ok({
      original: "",
      translated: "",
      sourceLang: typeof b.sourceLang === "string" ? b.sourceLang : "fr",
    })
  }
  if (b.text.length > MAX_TEXT_CHARS) {
    return fail(
      `Texte trop long (${b.text.length} caractères, max ${MAX_TEXT_CHARS})`,
      400,
    )
  }

  let sourceLang: SupportedLang = "auto"
  if (
    typeof b.sourceLang === "string" &&
    (SUPPORTED_LANGS as readonly string[]).includes(b.sourceLang)
  ) {
    sourceLang = b.sourceLang as SupportedLang
  } else if (b.sourceLang !== undefined) {
    // Si sourceLang est fourni mais invalide, on dégrade vers 'auto'
    // plutôt que de rejeter (robustesse UX voyageur).
    sourceLang = "auto"
  }

  const original = b.text.trim()

  // --- Cas court : sourceLang === 'fr' → pas de traduction nécessaire ---
  if (sourceLang === "fr") {
    return ok({ original, translated: original, sourceLang: "fr" })
  }

  // --- Appel LLM (z-ai-web-dev-sdk, backend only) ---
  try {
    const zai = await ZAI.create()
    const completion = (await zai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(original, sourceLang) },
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
        "[airport-translate] LLM retour vide — fallback vers l'original",
      )
      translated = original
    }

    return ok({ original, translated, sourceLang })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[airport-translate] LLM error:", message)
    return fail(`Erreur de traduction: ${message}`, 500)
  }
}
