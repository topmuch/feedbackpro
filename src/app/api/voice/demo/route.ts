// ============================================================
// API publique — Démo vocale « Nathalie » du landing (vraie voix TTS)
// ------------------------------------------------------------
// POST /api/voice/demo   (runtime nodejs)
//   Body: { context: "vip" | "airport" | "restaurant" | "hotel" }
//   → audio/wav binaire (24 kHz mono 16 bits) — lu par <audio>.
//   En cas d'échec → JSON { ok:false, error } (le client retombe alors
//   sur la Web Speech API du navigateur, comportement historique).
//
// Pourquoi cette route : la Web Speech API du navigateur est silencieuse
// dans de nombreux contextes réels (aucune voix FR installée, iOS en
// mode silencieux, navigateurs exotiques) — l'audio du landing paraissait
// « bloqué » en prod. La voix est donc générée CÔTÉ SERVEUR via le SDK
// z-ai-web-dev-sdk (config Z_AI_CONFIG chargée au boot par
// src/instrumentation.ts), avec repli navigateur intact côté client.
//
// Garde-fous :
//   · AUCUN texte libre : seuls les 4 identifiants fixes de
//     src/lib/voix-demo.ts sont acceptés (zod) — pas de proxy TTS ouvert.
//   · Rate limit par IP + plafond global (src/lib/rate-limit.ts).
//   · Cache mémoire par contexte (globalThis, même pattern que le store
//     du rate limiter et le client Prisma) : le WAV d'un contexte n'est
//     synthétisé qu'UNE fois par vie du process — les écoutes suivantes
//     répondent instantanément et ne consomment aucun crédit TTS.
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { limiteTaux } from "@/lib/rate-limit"
import { fail } from "@/lib/session"
import { journalErreur } from "@/lib/error-log"
import { ANNONCES_DEMO, IDS_CONTEXTE_VOCAL, type ContexteVocalId } from "@/lib/voix-demo"

export const runtime = "nodejs"

// ---------- Constantes ----------

/** Voix féminine chaleureuse de l'API TTS (la plus proche de « Nathalie »). */
const VOIX_TTS = "tongtong"

/** Fréquence d'échantillonnage du flux PCM du TTS (recommandation API). */
const FREQUENCE_TTS = 24_000

/** Limite SDK TTS : 1024 caractères par appel → marge de sécurité. */
const TAILLE_SEGMENT_TTS = 950

/** Budget total de synthèse (cold start SDK + TTS variable, 8-30 s
 * observés) avant erreur 502 — marge large pour éviter les faux positifs. */
const TIMEOUT_SYNTHESE_MS = 50_000

// ---------- Schéma d'entrée ----------

const bodySchema = z.object({
  context: z.enum(IDS_CONTEXTE_VOCAL as [ContexteVocalId, ...ContexteVocalId[]]),
})

// ---------- Cache mémoire ----------

const CLE_CACHE_GLOBAL = "__fv_tts_demo_cache__"

function cache(): Map<string, Buffer> {
  const g = globalThis as { [CLE_CACHE_GLOBAL]?: Map<string, Buffer> }
  if (!g[CLE_CACHE_GLOBAL]) g[CLE_CACHE_GLOBAL] = new Map()
  return g[CLE_CACHE_GLOBAL]
}

// ---------- Synthèse (PCM → WAV) ----------

/** Découpe un texte en segments ≤ TAILLE_SEGMENT_TTS sur les fins de phrase. */
function decouperSegments(texte: string): string[] {
  if (texte.length <= TAILLE_SEGMENT_TTS) return [texte]
  const phrases = texte.match(/[^.!?…]+[.!?…]*/g) ?? [texte]
  const segments: string[] = []
  let courant = ""
  for (const phrase of phrases) {
    if ((courant + phrase).length <= TAILLE_SEGMENT_TTS) {
      courant += phrase
    } else {
      if (courant.trim()) segments.push(courant.trim())
      courant = phrase
    }
  }
  if (courant.trim()) segments.push(courant.trim())
  return segments.length > 0 ? segments : [texte.slice(0, TAILLE_SEGMENT_TTS)]
}

/** Enveloppe un flux PCM brut (s16le mono) dans un conteneur WAV valide. */
function envelopperWav(pcm: Buffer, frequence = FREQUENCE_TTS): Buffer {
  const bitsParEchantillon = 16
  const blockAlign = 1 * (bitsParEchantillon / 8)
  const byteRate = frequence * blockAlign
  const entete = Buffer.alloc(44)
  entete.write("RIFF", 0, "ascii")
  entete.writeUInt32LE(36 + pcm.length, 4)
  entete.write("WAVE", 8, "ascii")
  entete.write("fmt ", 12, "ascii")
  entete.writeUInt32LE(16, 16)
  entete.writeUInt16LE(1, 20) // format PCM (non compressé)
  entete.writeUInt16LE(1, 22) // mono
  entete.writeUInt32LE(frequence, 24)
  entete.writeUInt32LE(byteRate, 28)
  entete.writeUInt16LE(blockAlign, 32)
  entete.writeUInt16LE(bitsParEchantillon, 34)
  entete.write("data", 36, "ascii")
  entete.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([entete, pcm])
}

/**
 * Génère l'audio du texte via l'API TTS du SDK : découpage en segments,
 * concaténation du PCM pur puis enveloppement dans un WAV unique.
 * Jette une Error si aucun audio n'a pu être produit ou si le budget
 * temps est dépassé.
 */
async function synthetiserWav(texte: string, vitesse: number): Promise<Buffer> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default
  const zai = await ZAI.create()

  const parties: Buffer[] = []
  for (const segment of decouperSegments(texte)) {
    const reponse = await zai.audio.tts.create({
      input: segment,
      voice: VOIX_TTS,
      speed: vitesse,
      response_format: "pcm",
      stream: false,
    })
    const tampon = Buffer.from(new Uint8Array(await reponse.arrayBuffer()))
    if (tampon.length === 0) throw new Error("Segment audio vide renvoyé par le TTS")
    parties.push(tampon)
  }
  return envelopperWav(Buffer.concat(parties))
}

/** Variante avec budget temps strict (Promise.race). */
function avecTimeout(p: Promise<Buffer>, ms: number): Promise<Buffer> {
  return Promise.race([
    p,
    new Promise<Buffer>((_, rejeter) =>
      setTimeout(() => rejeter(new Error("Timeout de synthèse vocale")), ms)
    ),
  ])
}

// ---------- Route ----------

export async function POST(req: NextRequest) {
  try {
    // ---------- Rate limit (route publique : sans authentification) ----------
    const bloque = limiteTaux(req, "voice-demo", { max: 12, fenetreMs: 60_000 })
    if (bloque) return bloque

    // ---------- Entrée : identifiant de contexte fixe uniquement ----------
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return fail("Contexte de démonstration invalide", 400)
    }
    const contexteId = parsed.data.context
    const annonce = ANNONCES_DEMO[contexteId]

    // ---------- Cache mémoire : synthèse une seule fois par process ----------
    const memoire = cache()
    const dejaGenere = memoire.get(contexteId)
    if (dejaGenere) {
      return repondreAudio(dejaGenere)
    }

    // ---------- Synthèse vocale serveur (voix réelle Nathalie) ----------
    const audio = await avecTimeout(
      synthetiserWav(annonce.texte, annonce.vitesse),
      TIMEOUT_SYNTHESE_MS
    )
    if (audio.length === 0) throw new Error("Audio vide renvoyé par le TTS")

    memoire.set(contexteId, audio)
    return repondreAudio(audio)
  } catch (e) {
    journalErreur({
      source: "api:voice/demo",
      message: `Échec TTS démo vocale Nathalie : ${e instanceof Error ? e.message : "erreur inconnue"}`,
      stack: e instanceof Error ? e.stack : undefined,
    })
    return fail(
      "La voix de Nathalie n'est pas disponible pour le moment. Réessayez dans quelques instants.",
      502
    )
  }
}

/** Réponse binaire WAV (cache navigateur désactivé : POST non stockable). */
function repondreAudio(wav: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      "Cache-Control": "no-store",
    },
  })
}
