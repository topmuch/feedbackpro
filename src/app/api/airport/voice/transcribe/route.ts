// ============================================================
// POST /api/airport/voice/transcribe
// ------------------------------------------------------------
// Route de reconnaissance vocale (ASR) pour la PWA voyageur.
// Un voyageur scanne un QR aéroport, appuie sur le micro, parle
// en Wolof / Français / Anglais, et cet endpoint transcrit l'audio
// (Blob MediaRecorder, typiquement webm/opus) en texte brut.
//
// Le texte transcrit est ensuite envoyé par le client vers
// /api/airport/voice/translate pour être traduit en français
// (langue de travail des équipes ops) et injecté dans le champ
// `commentaire` du formulaire de signalement.
//
// Flow :
//   1. Client enregistre l'audio via MediaRecorder → Blob webm/opus
//   2. POST multipart/form-data avec champ `audio` (Blob)
//   3. Serveur lit le fichier → Buffer → base64
//   4. Appel z-ai-web-dev-sdk : zai.audio.asr.create({ file_base64 })
//   5. Retourne { text, durationMs } dans l'enveloppe ok/data
//
// Payload (multipart/form-data) :
//   audio: Blob (webm/opus, wav, mp3…) — max 10 Mo
//
// Réponse (200) : { ok: true, data: { text: string, durationMs: number } }
//   - durationMs = durée de traitement de l'ASR (mesurée côté serveur),
//     pas la durée de l'audio (le conteneur webm/opus n'est pas parsé
//     ici — surdimensionnement évité).
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

// Limite stricte : 10 Mo (cahier des charges). Au-delà, on rejette
// côté serveur pour éviter de surcharger l'ASR et la mémoire.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024

// Typage minimal du résultat ASR retourné par z-ai-web-dev-sdk.
// Le SDK n'expose pas de types officiels fiables dans le projet, on
// caste donc défensivement comme pour les autres routes LLM (ia.ts,
// audit-matin.ts).
type AsrResponse = { text?: string }

export async function POST(req: NextRequest) {
  // --- Lecture multipart/form-data ---
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return fail("Payload multipart/form-data invalide", 400)
  }

  const file = formData.get("audio")

  // Le champ doit être un File (Blob + métadonnées). FormData peut
  // aussi contenir des string (champ texte) — on rejette ces cas.
  if (!file || !(file instanceof File)) {
    return fail("Champ 'audio' manquant ou n'est pas un fichier", 400)
  }

  // --- Validation taille ---
  if (file.size <= 0) {
    return fail("Fichier audio vide", 400)
  }
  if (file.size > MAX_AUDIO_BYTES) {
    const mo = (file.size / (1024 * 1024)).toFixed(1)
    return fail(`Fichier audio trop volumineux (${mo} Mo, max 10 Mo)`, 400)
  }

  // --- Lecture du fichier → Buffer → base64 ---
  let audioBuffer: Buffer
  try {
    const arrayBuffer = await file.arrayBuffer()
    audioBuffer = Buffer.from(arrayBuffer)
  } catch {
    return fail("Lecture du fichier audio impossible", 400)
  }
  const base64Audio = audioBuffer.toString("base64")

  // --- Appel ASR (z-ai-web-dev-sdk, backend only) ---
  const startMs = Date.now()
  try {
    const zai = await ZAI.create()
    const response = (await zai.audio.asr.create({
      file_base64: base64Audio,
    })) as AsrResponse
    const durationMs = Date.now() - startMs

    const text = (response?.text ?? "").trim()

    // On renvoie toujours un string (même vide si l'ASR n'a rien compris).
    // Le client peut décider d'afficher un message « je n'ai pas compris »
    // si text === "". On ne plante pas côté serveur pour autant.
    return ok({ text, durationMs })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[airport-voice-transcribe] ASR error:", message)
    return fail(`Erreur de transcription vocale: ${message}`, 500)
  }
}
