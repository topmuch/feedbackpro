// ============================================================
// FeedVoice - Synthèse vocale « Nathalie » (moteurs multiples)
// ------------------------------------------------------------
// PRODUIT UN AUDIO PARLÉ POUR LES ROUTES SERVEUR :
//   · POST /api/voice/demo  (démo vocale du landing)
//   · POST /api/voice/report (briefing audio mensuel du dashboard)
//
// CHAÎNE DE MOTEURS (le premier qui répond gagne) :
//   1. EDGE TTS (Microsoft) — voix neurale fr-FR-DeniseNeural, MP3
//      24 kHz 96 kbit/s. Gratuit, sans clé, joignable depuis n'importe
//      quel VPS (~1 s de synthèse). MOTEUR PRINCIPAL : c'est lui qui
//      rend l'audio fiable en PROD Coolify.
//   2. SDK z-ai-web-dev-sdk (voix tongtong, PCM → WAV) — REPLI : la
//      config Z_AI_CONFIG de prod pointe vers l'API interne de la
//      sandbox (internal-api.z.ai + JWT de session) qui n'est pas
//      joignable depuis le VPS (logs Coolify : « fetch failed ») ;
//      ce moteur reste utile en dev/sandbox et si un jour une config
//      publique valide est fournie.
//
// Les deux moteurs produisent un audio directement lisible par
// <audio> : MP3 (Edge) ou WAV (Z.ai) — le mime réel est renvoyé à la
// route pour l'en-tête Content-Type.
// ============================================================

import { journalErreur } from "@/lib/error-log"

export type AudioNathalie = {
  /** Conteneur audio complet (MP3 ou WAV), prêt à servir. */
  audio: Buffer
  /** Type MIME exact de l'audio produit ("audio/mpeg" | "audio/wav"). */
  mime: string
  /** Moteur ayant produit l'audio (diagnostic / journal). */
  moteur: "edge" | "zai"
}

// ---------- Constantes communes ----------

/** Voix neurale française chaleureuse (Microsoft Edge Read Aloud). */
const VOIX_EDGE = "fr-FR-DeniseNeural"

/** Voix féminine du SDK Z.ai (repli) — la plus proche de « Nathalie ». */
const VOIX_ZAI = "tongtong"

/** Fréquence du PCM renvoyé par l'API TTS Z.ai (recommandation API). */
const FREQUENCE_ZAI = 24_000

/** Limite SDK Z.ai : 1024 caractères par appel → marge de sécurité. */
const TAILLE_SEGMENT_ZAI = 950

/** Budget d'une synthèse Edge (connexion WS + flux). */
const TIMEOUT_EDGE_MS = 25_000

/** Budget d'une synthèse Z.ai (cold start SDK variable, 8-30 s). */
const TIMEOUT_ZAI_MS = 50_000

// ---------- Moteur 1 : Edge TTS ----------

/** Échappe les caractères XML/SSML (les textes du produit sont fixes,
 * mais on ne prend aucun risque avec un texte futur). */
function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Convertit une vitesse 0.5-2.0 en pourcentage SSML (« -12 % », « +5 % »). */
function vitesseEnPourcentage(vitesse: number): string {
  const bornée = Math.min(2, Math.max(0.5, vitesse))
  const pourcent = Math.round((bornée - 1) * 100)
  if (pourcent === 0) return "+0%"
  return pourcent > 0 ? `+${pourcent}%` : `${pourcent}%`
}

/** Synthèse Edge TTS : retourne un MP3 complet ou jette une Error. */
async function syntheseEdge(texte: string, vitesse: number): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts")
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 8_000,
    synthesisTimeoutMs: 20_000,
  })
  try {
    await tts.setMetadata(VOIX_EDGE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(echapperXml(texte), {
      rate: vitesseEnPourcentage(vitesse),
    })
    return await new Promise<Buffer>((resoudre, rejeter) => {
      const morceaux: Buffer[] = []
      audioStream.on("data", (c: Buffer) => morceaux.push(Buffer.from(c)))
      audioStream.on("close", () => {
        const mp3 = Buffer.concat(morceaux)
        if (mp3.length === 0) rejeter(new Error("Flux Edge TTS vide"))
        else resoudre(mp3)
      })
      audioStream.on("error", (e: Error) => rejeter(e))
    })
  } finally {
    try {
      tts.close()
    } catch {
      /* socket déjà fermé */
    }
  }
}

/** Variante Edge avec budget temps strict (Promise.race). */
function avecTimeout<T>(p: Promise<T>, ms: number, libelle: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rejeter) =>
      setTimeout(() => rejeter(new Error(`Timeout ${libelle}`)), ms)
    ),
  ])
}

// ---------- Moteur 2 : SDK Z.ai (repli) ----------

/** Découpe un texte en segments ≤ TAILLE_SEGMENT_ZAI sur les fins de phrase. */
function decouperSegmentsZai(texte: string): string[] {
  if (texte.length <= TAILLE_SEGMENT_ZAI) return [texte]
  const phrases = texte.match(/[^.!?…]+[.!?…]*/g) ?? [texte]
  const segments: string[] = []
  let courant = ""
  for (const phrase of phrases) {
    if ((courant + phrase).length <= TAILLE_SEGMENT_ZAI) {
      courant += phrase
    } else {
      if (courant.trim()) segments.push(courant.trim())
      courant = phrase
    }
  }
  if (courant.trim()) segments.push(courant.trim())
  return segments.length > 0 ? segments : [texte.slice(0, TAILLE_SEGMENT_ZAI)]
}

/** Enveloppe un flux PCM brut (s16le mono) dans un conteneur WAV valide. */
function envelopperWavZai(pcm: Buffer, frequence = FREQUENCE_ZAI): Buffer {
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

/** Synthèse via le SDK Z.ai : retourne un WAV complet ou jette une Error. */
async function syntheseZai(texte: string, vitesse: number): Promise<Buffer> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default
  const zai = await ZAI.create()

  const parties: Buffer[] = []
  for (const segment of decouperSegmentsZai(texte)) {
    const reponse = await zai.audio.tts.create({
      input: segment,
      voice: VOIX_ZAI,
      speed: Math.min(2, Math.max(0.5, vitesse)),
      response_format: "pcm",
      stream: false,
    })
    const tampon = Buffer.from(new Uint8Array(await reponse.arrayBuffer()))
    if (tampon.length === 0) throw new Error("Segment audio vide renvoyé par le TTS Z.ai")
    parties.push(tampon)
  }
  return envelopperWavZai(Buffer.concat(parties))
}

// ---------- Chaîne publique ----------

/**
 * Synthétise le texte avec la voix « Nathalie » : Edge TTS d'abord
 * (rapide, fiable en prod), SDK Z.ai en repli. Jette UNIQUEMENT si les
 * deux moteurs échouent — la route appelante répond alors 502 et le
 * client retombe sur la Web Speech API du navigateur.
 */
export async function synthetiserNathalie(
  texte: string,
  vitesse = 1.0
): Promise<AudioNathalie> {
  // ---------- 1. Edge TTS (moteur principal) ----------
  try {
    const mp3 = await avecTimeout(syntheseEdge(texte, vitesse), TIMEOUT_EDGE_MS, "Edge TTS")
    return { audio: mp3, mime: "audio/mpeg", moteur: "edge" }
  } catch (eEdge) {
    journalErreur({
      source: "lib:tts-nathalie",
      message: `Edge TTS indisponible, bascule sur le SDK Z.ai (${eEdge instanceof Error ? eEdge.message : "erreur inconnue"})`,
    })

    // ---------- 2. SDK Z.ai (repli) ----------
    try {
      const wav = await avecTimeout(syntheseZai(texte, vitesse), TIMEOUT_ZAI_MS, "TTS Z.ai")
      return { audio: wav, mime: "audio/wav", moteur: "zai" }
    } catch (eZai) {
      journalErreur({
        source: "lib:tts-nathalie",
        message: `TTS Z.ai indisponible lui aussi (${eZai instanceof Error ? eZai.message : "erreur inconnue"})`,
        stack: eZai instanceof Error ? eZai.stack : undefined,
      })
      throw new Error("Aucun moteur de synthèse vocale disponible")
    }
  }
}
