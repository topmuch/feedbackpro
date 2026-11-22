// ============================================================
// API publique — Démo vocale « Nathalie » du landing (vraie voix TTS)
// ------------------------------------------------------------
// POST /api/voice/demo   (runtime nodejs)
//   Body: { context: "vip" | "airport" | "restaurant" | "hotel" }
//   → audio binaire (MP3 Edge TTS ou WAV Z.ai) — lu par <audio>.
//   En cas d'échec → JSON { ok:false, error } (le client retombe alors
//   sur la Web Speech API du navigateur, comportement historique).
//
// Pourquoi cette route : la Web Speech API du navigateur est silencieuse
// dans de nombreux contextes réels (aucune voix FR installée, iOS en
// mode silencieux, navigateurs exotiques) — l'audio du landing paraissait
// « bloqué » en prod. La voix est générée CÔTÉ SERVEUR par la chaîne de
// src/lib/tts-nathalie.ts : Edge TTS (fiable depuis tout VPS) puis SDK
// Z.ai (repli, config Z_AI_CONFIG chargée au boot par instrumentation).
//
// Garde-fous :
//   · AUCUN texte libre : seuls les 4 identifiants fixes de
//     src/lib/voix-demo.ts sont acceptés (zod) — pas de proxy TTS ouvert.
//   · Rate limit par IP + plafond global (src/lib/rate-limit.ts).
//   · Cache mémoire par contexte (globalThis, même pattern que le store
//     du rate limiter et le client Prisma) : l'audio d'un contexte n'est
//     synthétisé qu'UNE fois par vie du process — les écoutes suivantes
//     répondent instantanément.
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { limiteTaux } from "@/lib/rate-limit"
import { fail } from "@/lib/session"
import { journalErreur } from "@/lib/error-log"
import { synthetiserNathalie } from "@/lib/tts-nathalie"
import { ANNONCES_DEMO, IDS_CONTEXTE_VOCAL, type ContexteVocalId } from "@/lib/voix-demo"

export const runtime = "nodejs"

// ---------- Schéma d'entrée ----------

const bodySchema = z.object({
  context: z.enum(IDS_CONTEXTE_VOCAL as [ContexteVocalId, ...ContexteVocalId[]]),
})

// ---------- Cache mémoire ----------

const CLE_CACHE_GLOBAL = "__fv_tts_demo_cache__"

interface AudioEnCache {
  audio: Buffer
  mime: string
}

function cache(): Map<string, AudioEnCache> {
  const g = globalThis as { [CLE_CACHE_GLOBAL]?: Map<string, AudioEnCache> }
  if (!g[CLE_CACHE_GLOBAL]) g[CLE_CACHE_GLOBAL] = new Map()
  return g[CLE_CACHE_GLOBAL]
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
    if (dejaGenere && Buffer.isBuffer(dejaGenere.audio) && typeof dejaGenere.mime === "string") {
      return repondreAudio(dejaGenere.audio, dejaGenere.mime)
    }
    // Entrée périmée ou format ancien (HMR / évolution du schéma) → régénérer.
    memoire.delete(contexteId)

    // ---------- Synthèse vocale serveur (voix réelle Nathalie) ----------
    const { audio, mime, moteur } = await synthetiserNathalie(annonce.texte, annonce.vitesse)
    if (audio.length === 0) throw new Error("Audio vide renvoyé par le moteur vocal")

    memoire.set(contexteId, { audio, mime })
    if (moteur === "zai") {
      // Diagnostic : le moteur principal (Edge) a échoué, c'est le signal
      // d'un réseau restreint — utile dans les logs Coolify.
      journalErreur({
        source: "api:voice/demo",
        message: "Démo vocale servie par le repli Z.ai (Edge indisponible)",
      })
    }
    return repondreAudio(audio, mime)
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

/** Réponse binaire audio (cache navigateur désactivé : POST non stockable). */
function repondreAudio(audio: Buffer, mime: string): NextResponse {
  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(audio.length),
      "Cache-Control": "no-store",
    },
  })
}
