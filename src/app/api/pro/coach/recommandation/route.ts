// ============================================================
// API Pro - Coach IA — Recommandation ciblée pour un retour
// ------------------------------------------------------------
// POST /api/pro/coach/recommandation
//   Body: {
//     retourId?: string                  // si fourni, on charge le retour depuis la DB
//     retour?: {                          // sinon, on prend les données envoyées par le client
//       note: number
//       tags: string[]
//       commentaire?: string | null
//       zone?: string | null
//       employeNom?: string | null
//       createdAt: string
//     },
//     recurrence?: { count: number; libelleTag: string | null }  // contexte (récurrence 30j)
//   }
//
//   Réponse: {
//     ok: true,
//     data: {
//       source: "ia" | "fallback",
//       niveau: "crise" | "mitige" | "positif",
//       diagnostic: string,
//       actions: string[],
//       impact: string,
//       pointsPositifs: string[]
//     }
//   }
//
// Le Coach IA génère une recommandation ciblée pour UN retour précis :
//   - appelle le LLM via z-ai-web-dev-sdk (backend uniquement)
//   - fallback heuristique déterministe en cas d'échec LLM
//   - ne renvoie JAMAIS d'erreur 500 brute
//
// Utilisée par la page détail retour (src/components/feedbackpro/retours-tab.tsx)
// pour la card IA "Recommandation du Coach IA".
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import {
  genererRecommandationPourRetour,
  type DonneesRecommandation,
} from "@/lib/ia"
import { tagLabel } from "@/lib/constants"
import type { Retour } from "@prisma/client"

/** Parse le tableau JSON des tags du retour (champ STRING JSON du schéma SQLite). */
function parseTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Calcule le score global du Pro sur 30 jours (note moyenne × 20, arrondi à /100). */
async function calculerScoreGlobal30j(proId: string): Promise<number> {
  const ilYA30j = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const retours = await db.retour.findMany({
    where: { proId, createdAt: { gte: ilYA30j } },
    select: { note: true },
  })
  if (retours.length === 0) return 0
  const moy = retours.reduce((s, r) => s + r.note, 0) / retours.length
  return Math.round(moy * 20)
}

/**
 * Calcule la récurrence d'un motif sur 30 jours pour un retour donné :
 * compte les retours des 30 derniers jours partageant au moins un tag avec
 * le retour courant, et identifie le tag le plus fréquent.
 */
async function calculerRecurrence(
  proId: string,
  retourId: string,
  tags: string[]
): Promise<{ count: number; libelleTag: string | null }> {
  if (tags.length === 0) return { count: 0, libelleTag: null }
  const ilYA30j = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const retours = await db.retour.findMany({
    where: { proId, createdAt: { gte: ilYA30j } },
    select: { id: true, tags: true },
  })
  const memesTags = new Set(tags)
  const occ = new Map<string, number>()
  let count = 0
  for (const r of retours) {
    if (r.id === retourId) continue
    const rTags = parseTags(r.tags)
    const partage = rTags.some((t) => memesTags.has(t))
    if (!partage) continue
    count++
    for (const t of rTags) {
      if (memesTags.has(t)) occ.set(t, (occ.get(t) ?? 0) + 1)
    }
  }
  // Le retour courant compte aussi (1er signalement)
  count += 1
  let tagFrequent: string | null = null
  let maxOcc = -1
  for (const [tag, n] of occ) {
    if (n > maxOcc) {
      maxOcc = n
      tagFrequent = tag
    }
  }
  return {
    count,
    libelleTag: tagFrequent ? tagLabel(tagFrequent) : null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    const { pro } = ctx

    const body = await req.json().catch(() => ({}))
    const retourId: string | undefined = typeof body?.retourId === "string" ? body.retourId : undefined

    // ---------- Résolution du retour (DB ou payload client) ----------
    let retourData: DonneesRecommandation["retour"]
    let recurrence: { count: number; libelleTag: string | null } = { count: 0, libelleTag: null }

    if (retourId) {
      // Charger depuis la DB (source de vérité)
      const retour = (await db.retour.findUnique({
        where: { id: retourId, proId: pro.id },
        include: { zone: { select: { nom: true } }, employe: { select: { nom: true } } },
      })) as
        | (Retour & {
            zone: { nom: string } | null
            employe: { nom: string } | null
          })
        | null
      if (!retour) {
        return fail("Retour introuvable", 404)
      }
      const tags = parseTags(retour.tags)
      retourData = {
        note: retour.note,
        tags,
        commentaire: retour.commentaire,
        zone: retour.zone?.nom ?? null,
        employeNom: retour.employe?.nom ?? retour.personnelMentionne ?? null,
        createdAt: retour.createdAt.toISOString(),
      }
      // Récurrence calculée côté serveur (plus fiable que le cache client)
      recurrence = await calculerRecurrence(pro.id, retour.id, tags)
    } else if (body?.retour && typeof body.retour === "object") {
      // Données envoyées par le client (le retour n'est peut-être pas encore en DB)
      const r = body.retour as {
        note: number
        tags?: unknown
        commentaire?: string | null
        zone?: string | null
        employeNom?: string | null
        createdAt: string
      }
      const tags: string[] = Array.isArray(r.tags) ? r.tags.map(String) : []
      retourData = {
        note: Number(r.note) || 0,
        tags,
        commentaire: typeof r.commentaire === "string" ? r.commentaire : null,
        zone: typeof r.zone === "string" ? r.zone : null,
        employeNom: typeof r.employeNom === "string" ? r.employeNom : null,
        createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
      }
      // Récurrence fournie par le client (calculée côté client à partir de la liste chargée)
      if (body.recurrence && typeof body.recurrence === "object") {
        const rec = body.recurrence as { count?: number; libelleTag?: string | null }
        recurrence = {
          count: Number(rec.count) || 0,
          libelleTag: typeof rec.libelleTag === "string" ? rec.libelleTag : null,
        }
      }
    } else {
      return fail("Payload invalide : fournir retourId ou retour", 400)
    }

    // ---------- Contexte établissement ----------
    const scoreGlobal = await calculerScoreGlobal30j(pro.id).catch(() => 0)
    const secteur = pro.typeEtablissement || "Restaurant"
    const frequence = pro.frequenceRapport || "quotidien"

    const donnees: DonneesRecommandation = {
      secteur,
      nomEtablissement: pro.nomEtablissement,
      retour: retourData,
      scoreGlobal,
      frequence,
      recurrence,
    }

    // ---------- Génération LLM (+ fallback heuristique) ----------
    const recommandation = await genererRecommandationPourRetour(donnees)

    return ok(recommandation)
  } catch (e) {
    console.error("coach/recommandation POST error", e)
    return fail("Impossible de générer la recommandation pour le moment", 500)
  }
}
