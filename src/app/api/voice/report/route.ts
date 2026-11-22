// ============================================================
// API Pro — Briefing audio mensuel « Nathalie » (vraie voix TTS)
// ------------------------------------------------------------
// POST /api/voice/report  (runtime nodejs)
//   Body: { mois?: "YYYY-MM" }   (défaut = mois courant UTC,
//          borné aux 12 derniers mois)
//   → { ok: true, data: { audioBase64, mimeType, texte, dureeEstimee,
//         source: "ia" | "fallback", kpis } }
//
// Chaîne de génération (100 % backend, z-ai-web-dev-sdk jamais importé
// côté client) :
//   1. Agrégation des VRAIES données du Pro connecté (modèle Retour,
//      filtrées par ctx.pro.id — aucune donnée inter-tenant possible).
//      Conventions de dates identiques à /api/cron/rapports-mensuels-vip :
//      bornes de mois en UTC, requête createdAt { gte: debut, lt: fin }.
//   2. Rédaction du texte de briefing par le LLM (voix « Nathalie »,
//      ton chaleureux et professionnel, 120-180 mots). En cas d'échec
//      LLM → fallback déterministe sur template avec les chiffres réels
//      (même philosophie que src/lib/ia.ts).
//   3. Synthèse vocale TTS (voix féminine « tongtong », format mp3).
//      Limite SDK : 1024 caractères par appel → découpage en segments
//      de phrases puis concaténation des flux mp3 (les frames mp3 étant
//      indépendantes, la concaténation est jouable telle quelle).
//
// Contrainte taille : l'audio est plafonné à ~4 Mo (base64 inclus) ;
// au-delà → erreur 413 claire, jamais de payload géant.
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { limiteTaux } from "@/lib/rate-limit"
import { parseJsonArray } from "@/lib/ia"
import { tagLabel } from "@/lib/constants"

export const runtime = "nodejs"

// ---------- Constantes ----------

/** Plafond de taille de l'audio brut (≈ 4 Mo avant encodage base64). */
const MAX_AUDIO_OCTETS = 4_000_000

/** Limite SDK TTS : 1024 caractères par appel → marge de sécurité. */
const TAILLE_SEGMENT_TTS = 950

/** Timeout du LLM pour la rédaction du texte (le TTS a son propre budget). */
const TIMEOUT_LLM_MS = 20_000

/** Voix féminine chaleureuse de l'API TTS (la plus proche de « Nathalie »). */
const VOIX_TTS = "tongtong"

// ---------- Validation de l'entrée ----------

const bodySchema = z.object({
  mois: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format de mois invalide (attendu YYYY-MM)")
    .optional(),
})

// ---------- Helpers de mois (conventions UTC = cron mensuel VIP) ----------

/** Clé « YYYY-MM » d'une date, en UTC. */
function cleMoisUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Bornes d'un mois clé « YYYY-MM » : [1er jour 00h00 UTC, 1er jour du mois suivant[. */
function bornesMois(mois: string): { debut: Date; fin: Date } {
  const [annee, moisNum] = mois.split("-").map(Number)
  const debut = new Date(Date.UTC(annee, moisNum - 1, 1, 0, 0, 0))
  const fin = new Date(Date.UTC(annee, moisNum, 1, 0, 0, 0))
  return { debut, fin }
}

/** Libellé français d'un mois clé (« février 2026 »), calculé en UTC. */
function libelleMois(mois: string): string {
  const { debut } = bornesMois(mois)
  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(debut)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Borne la clé mois demandée à la fenêtre [mois courant - 11 … mois courant]. */
function bornerMois(mois: string): string {
  const courant = cleMoisUTC(new Date())
  const [ca, cm] = courant.split("-").map(Number)
  const [ma, mm] = mois.split("-").map(Number)
  const indiceDemande = ma * 12 + (mm - 1)
  const indiceCourant = ca * 12 + (cm - 1)
  const indiceBorne = Math.min(Math.max(indiceDemande, indiceCourant - 11), indiceCourant)
  const annee = Math.floor(indiceBorne / 12)
  const moisNum = (indiceBorne % 12) + 1
  return `${annee}-${String(moisNum).padStart(2, "0")}`
}

// ---------- Types de sortie ----------

type KpisMois = {
  mois: string
  libelleMois: string
  totalRetours: number
  noteMoyenne: number
  repartitionEtoiles: { note: number; count: number }[]
  topTags: { tag: string; count: number }[]
  alertes: number
  recompenses: number
}

// ---------- Agrégation Prisma (données réelles, tenant isolé) ----------

/**
 * Agrège les retours du Pro pour le mois demandé — mêmes conventions que
 * les autres agrégations du Coach IA (src/lib/ia.ts) : tags sectoriels
 * uniquement (les tags employés « emp_ » sont exclus des top tags),
 * labels humains via tagLabel(), alertes = retours ≤ 2★.
 */
async function agregerKpisMois(proId: string, mois: string): Promise<KpisMois> {
  const { debut, fin } = bornesMois(mois)

  const retours = await db.retour.findMany({
    where: { proId, createdAt: { gte: debut, lt: fin } },
    select: { note: true, tags: true, recompenseUtilisee: true },
  })

  const total = retours.length
  const somme = retours.reduce((s, r) => s + r.note, 0)
  const noteMoyenne = total ? Number((somme / total).toFixed(2)) : 0

  const repartitionEtoiles = [1, 2, 3, 4, 5].map((note) => ({
    note,
    count: retours.filter((r) => r.note === note).length,
  }))

  // Top tags sectoriels (les tags employés sont gérés à part, cf. ia.ts)
  const occurences = new Map<string, number>()
  for (const r of retours) {
    const tags = parseJsonArray(r.tags).filter((t) => !t.startsWith("emp_"))
    for (const t of tags) occurences.set(t, (occurences.get(t) ?? 0) + 1)
  }
  const topTags = [...occurences.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag: tagLabel(tag), count }))

  return {
    mois,
    libelleMois: libelleMois(mois),
    totalRetours: total,
    noteMoyenne,
    repartitionEtoiles,
    topTags,
    alertes: retours.filter((r) => r.note <= 2).length,
    recompenses: retours.filter((r) => r.recompenseUtilisee).length,
  }
}

// ---------- Rédaction du texte « Nathalie » ----------

/** Nettoie un texte pour la voix : markdown, symboles et espaces superflus. */
function nettoyerPourVoix(texte: string): string {
  return texte
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/** Nombre de mots d'un texte. */
function nbMots(texte: string): number {
  return texte.split(/\s+/).filter(Boolean).length
}

const PROMPT_SYSTEM_NATHALIE = `Tu es Nathalie, la coach qualité vocale de FeedVoice. Tu rédiges le TEXTE d'un briefing audio parlé, en français, destiné au gérant d'un établissement, qui sera ensuite lu par une voix de synthèse.

STYLE :
- Ton chaleureux, positif et professionnel. Tu t'adresses directement au gérant (« vous »).
- Texte PARLÉ : phrases courtes et naturelles. AUCUN markdown, AUCUNE liste, AUCUN emoji, AUCUNE parenthèse, AUCUN symbole.
- Ne commence PAS par « Voici le briefing » : ouvre par une salutation naturelle qui annonce le bilan du mois.
- Déroulé fluide : salutation et annonce du mois → volume de retours et note moyenne → ce qui fonctionne bien → points de vigilance (alertes et motifs récurrents) → récompenses offertes → conclusion encourageante avec UNE action concrète simple.
- N'utilise QUE les chiffres fournis dans le message. N'invente aucune donnée, aucune zone, aucun employé, aucune comparaison.
- Si le mois n'a aucun retour, reste brève et encourage le gérant à collecter ses premiers avis.
- Longueur STRICTE : entre 120 et 180 mots.
- Termine par une phrase complète finissant par un point.

RÉPONSE : UNIQUEMENT le texte du briefing, sans guillemets ni explications autour.`

/**
 * Demande au LLM la rédaction du briefing (voix Nathalie). Retourne null
 * en cas d'échec / timeout / sortie inexploitable → l'appelant retombe
 * sur le template déterministe (jamais d'erreur 500 brute).
 */
async function redigerBriefingLLM(kpis: KpisMois, nomEtablissement: string): Promise<string | null> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default
    const zai = await ZAI.create()

    const messageUtilisateur = JSON.stringify({
      etablissement: nomEtablissement,
      periode: kpis.libelleMois,
      kpis: {
        totalRetours: kpis.totalRetours,
        noteMoyenneSur5: kpis.noteMoyenne,
        repartitionEtoiles: kpis.repartitionEtoiles,
        topTags: kpis.topTags.map((t) => t.tag),
        alertesDeuxEtoilesOuMoins: kpis.alertes,
        recompensesUtilisees: kpis.recompenses,
      },
    })

    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: PROMPT_SYSTEM_NATHALIE },
          { role: "user", content: messageUtilisateur },
        ],
        thinking: { type: "disabled" },
      }),
      new Promise((_, rejeter) =>
        setTimeout(() => rejeter(new Error("Timeout rédaction Nathalie")), TIMEOUT_LLM_MS)
      ),
    ])) as { choices?: { message?: { content?: string } }[] }

    const brut = completion?.choices?.[0]?.message?.content ?? ""
    const texte = nettoyerPourVoix(brut.replace(/^["«»\s]+|["«»\s]+$/g, ""))
    if (!texte || nbMots(texte) < 80 || nbMots(texte) > 260) return null
    return texte
  } catch (e) {
    console.warn("[voice/report] Échec LLM Nathalie → template déterministe", e)
    return null
  }
}

/**
 * Fallback déterministe : briefing sur template avec les chiffres réels.
 * Aucune donnée inventée — si le mois est vide, le texte le dit.
 */
function redigerBriefingFallback(kpis: KpisMois, nomEtablissement: string): string {
  const morceaux: string[] = [
    `Bonjour, ici Nathalie, votre coach qualité. Faisons le point sur ${kpis.libelleMois} pour ${nomEtablissement}.`,
  ]

  if (kpis.totalRetours === 0) {
    morceaux.push(
      `Ce mois-ci, aucun retour client n'a été collecté. Pas d'inquiétude : c'est le bon moment pour afficher vos QR codes aux points de contact et inviter vos clients à donner leur avis. Dès les premiers retours, je serai là pour vous en faire une analyse détaillée. À très bientôt.`
    )
  } else {
    morceaux.push(
      `Vous avez reçu ${kpis.totalRetours} retours clients, avec une note moyenne de ${kpis.noteMoyenne.toFixed(2).replace(".", ",")} sur 5.`
    )

    const quatreOuPlus = kpis.repartitionEtoiles
      .filter((r) => r.note >= 4)
      .reduce((s, r) => s + r.count, 0)
    if (quatreOuPlus > 0) {
      morceaux.push(
        `Bonne nouvelle : ${quatreOuPlus} retours à 4 ou 5 étoiles. Vos clients apprécient l'expérience que vous leur offrez.`
      )
    }

    if (kpis.alertes > 0) {
      morceaux.push(
        `Côté vigilance : ${kpis.alertes} alerte${kpis.alertes > 1 ? "s" : ""} d'une à deux étoiles à rattraper.`
      )
      const motifs = kpis.topTags.slice(0, 2).map((t) => t.tag)
      if (motifs.length > 0) {
        morceaux.push(`Les motifs les plus cités ce mois-ci sont ${motifs.join(" et ")}.`)
      }
    } else {
      morceaux.push(`Et bonne nouvelle encore : aucune alerte d'une à deux étoiles ce mois-ci.`)
    }

    if (kpis.recompenses > 0) {
      morceaux.push(
        `${kpis.recompenses} récompense${kpis.recompenses > 1 ? "s ont été utilisées" : " a été utilisée"} par vos clients. Continuez à valoriser ces gestes, ils fidélisent.`
      )
    }

    morceaux.push(
      kpis.noteMoyenne >= 4
        ? `Le cap est bon : gardez vos routines gagnantes et continuez à écouter vos clients.`
        : `Mon conseil : relisez les commentaires de ce mois-ci et agissez d'abord sur le motif le plus cité. De petits ajustements suffisent souvent à faire remonter la note.`
    )
    morceaux.push(`Je vous retrouve très bientôt pour un nouveau bilan. À très bientôt.`)
  }

  return morceaux.join(" ")
}

// ---------- Synthèse vocale (TTS) ----------

/**
 * Découpe un texte en segments ≤ maxLen caractères, sur les frontières de
 * phrases (convention TTS : limite SDK 1024 caractères par appel).
 */
function decouperSegments(texte: string, maxLen = TAILLE_SEGMENT_TTS): string[] {
  const phrases = texte.match(/[^.!?]+[.!?]+["»]?\s*/g) ?? [texte]
  const segments: string[] = []
  let courant = ""
  for (const phrase of phrases) {
    if ((courant + phrase).length <= maxLen) {
      courant += phrase
    } else {
      if (courant.trim()) segments.push(courant.trim())
      // Phrase individuelle plus longue que maxLen : coupe brut
      if (phrase.length > maxLen) {
        for (let i = 0; i < phrase.length; i += maxLen) {
          segments.push(phrase.slice(i, i + maxLen).trim())
        }
        courant = ""
      } else {
        courant = phrase
      }
    }
  }
  if (courant.trim()) segments.push(courant.trim())
  return segments.filter(Boolean)
}

/**
 * Génère l'audio mp3 du texte via l'API TTS du SDK (voix féminine), en
 * concaténant les segments si le texte dépasse la limite du SDK.
 * Jette une Error si aucun audio n'a pu être produit.
 */
async function synthetiserAudio(texte: string): Promise<Buffer> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default
  const zai = await ZAI.create()

  const segments = decouperSegments(texte)
  const parties: Buffer[] = []
  for (const segment of segments) {
    const reponse = await zai.audio.tts.create({
      input: segment,
      voice: VOIX_TTS,
      speed: 1.0,
      response_format: "mp3",
      stream: false,
    })
    const tampon = Buffer.from(new Uint8Array(await reponse.arrayBuffer()))
    if (tampon.length === 0) throw new Error("Segment audio vide renvoyé par le TTS")
    parties.push(tampon)
  }
  return Buffer.concat(parties)
}

// ---------- Route ----------

export async function POST(req: NextRequest) {
  try {
    // ---------- Auth + rate limit ----------
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    const bloque = limiteTaux(req, "voice-report", { max: 6, fenetreMs: 60_000 })
    if (bloque) return bloque

    // ---------- Entrée : mois optionnel, borné aux 12 derniers mois ----------
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Requête invalide", 400)
    const mois = bornerMois(parsed.data.mois ?? cleMoisUTC(new Date()))

    // ---------- KPIs réels du tenant (isolation par ctx.pro.id) ----------
    const kpis = await agregerKpisMois(ctx.pro.id, mois)

    // ---------- Texte du briefing (LLM Nathalie, fallback déterministe) ----------
    const texteLLM = await redigerBriefingLLM(kpis, ctx.pro.nomEtablissement)
    const texte = texteLLM ?? redigerBriefingFallback(kpis, ctx.pro.nomEtablissement)
    const source = texteLLM ? "ia" : "fallback"

    // ---------- Synthèse vocale ----------
    let audio: Buffer
    try {
      audio = await synthetiserAudio(texte)
    } catch (e) {
      console.error("[voice/report] Échec TTS", e)
      return fail(
        "La synthèse vocale n'est pas disponible pour le moment. Réessayez dans quelques instants.",
        502
      )
    }

    // ---------- Garde-fou taille (~4 Mo) ----------
    if (audio.length > MAX_AUDIO_OCTETS) {
      return fail(
        "Le briefing audio est trop volumineux pour être servi. Réessayez dans quelques instants.",
        413
      )
    }

    // ---------- Durée estimée (~2,5 mots par seconde à débit posé) ----------
    const dureeEstimee = Math.max(1, Math.round(nbMots(texte) / 2.5))

    return ok({
      audioBase64: audio.toString("base64"),
      mimeType: "audio/mpeg",
      texte,
      dureeEstimee,
      source,
      kpis,
    })
  } catch (e) {
    console.error("voice/report POST error", e)
    return fail("Impossible de générer le briefing audio pour le moment", 500)
  }
}
