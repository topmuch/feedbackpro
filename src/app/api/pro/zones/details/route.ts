// ============================================================
// API Pro - DÉTAIL d'une zone (Session 4, §4 — modal « Voir détails »)
// GET /api/pro/zones/details?id=<zoneId>
// → {
//     zone: { id, nom, noteMoy, total, tendance, tendanceDelta },
//     evolution: [{ date "JJ/MM", score 0-100, retours }] (30 jours),
//     tagsFrequents: [{ id, label, count, type: "positif"|"negatif"|"libre" }],
//     derniersRetours: RetourDetail[] (6 derniers),
//     recommandations: string[] (Coach IA spécifiques à la zone)
//   }
// Les recommandations sont calculées de façon déterministe depuis les
// données réelles de la zone (rapides, fiables, sans dépendance LLM).
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserRetour } from "@/lib/serialise"
import { POSITIVE_TAGS, NEGATIVE_TAGS, tagLabel } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const zoneId = req.nextUrl.searchParams.get("id")
    if (!zoneId) return fail("ID de zone manquant", 400)

    const zone = await db.zone.findFirst({ where: { id: zoneId, proId: ctx.pro.id } })
    if (!zone) return fail("Zone introuvable", 404)

    const now = new Date()
    const debut7j = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
    const debut14j = new Date(now.getTime() - 14 * 24 * 3600 * 1000)
    const debut30j = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

    const retours = await db.retour.findMany({
      where: { zoneId: zone.id, createdAt: { gte: debut30j } },
      include: {
        zone: { select: { nom: true } },
        employe: { select: { nom: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    // ---------- Stats globales de la zone ----------
    const total = retours.length
    const noteMoy = total ? Number((retours.reduce((s, r) => s + r.note, 0) / total).toFixed(2)) : 0

    const notes7j = retours.filter((r) => r.createdAt >= debut7j).map((r) => r.note)
    const notesAvant = retours
      .filter((r) => r.createdAt < debut7j && r.createdAt >= debut14j)
      .map((r) => r.note)
    const moy7 = notes7j.length ? notes7j.reduce((s, n) => s + n, 0) / notes7j.length : 0
    const moyAvant = notesAvant.length ? notesAvant.reduce((s, n) => s + n, 0) / notesAvant.length : 0
    let tendance: "hausse" | "baisse" | "stable" = "stable"
    let tendanceDelta: number | null = null
    if (notes7j.length > 0 && notesAvant.length > 0) {
      tendanceDelta = Number((moy7 - moyAvant).toFixed(2))
      if (Math.abs(tendanceDelta) >= 0.05) tendance = tendanceDelta > 0 ? "hausse" : "baisse"
    }

    // ---------- Évolution 30 jours (score /100 par jour) ----------
    const evolution: { date: string; score: number; retours: number }[] = []
    for (let d = 29; d >= 0; d--) {
      const jour = new Date(now)
      jour.setHours(0, 0, 0, 0)
      jour.setDate(jour.getDate() - d)
      const lendemain = new Date(jour)
      lendemain.setDate(lendemain.getDate() + 1)
      const duJour = retours.filter((r) => r.createdAt >= jour && r.createdAt < lendemain)
      evolution.push({
        date: jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        score: duJour.length
          ? Math.round((duJour.reduce((s, r) => s + r.note, 0) / duJour.length) * 20)
          : 0,
        retours: duJour.length,
      })
    }

    // ---------- Tags les plus fréquents (30 jours) ----------
    const idsPositifs = new Set(POSITIVE_TAGS.map((t) => t.id))
    const idsNegatifs = new Set(NEGATIVE_TAGS.map((t) => t.id))
    const compteTags = new Map<string, number>()
    for (const r of retours) {
      for (const t of parseJsonArray(r.tags)) compteTags.set(t, (compteTags.get(t) ?? 0) + 1)
    }
    const tagsFrequents = [...compteTags.entries()]
      .map(([id, count]) => ({
        id,
        label: tagLabel(id),
        count,
        type: idsPositifs.has(id) ? "positif" : idsNegatifs.has(id) ? "negatif" : "libre",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    // ---------- Recommandations IA spécifiques à la zone (déterministes) ----------
    const recommandations: string[] = []
    const tagsNegatifs = tagsFrequents.filter((t) => t.type === "negatif")

    if (total === 0) {
      recommandations.push(
        "Aucun retour collecté sur 30 jours : déplacez le QR code à hauteur des yeux, près du point de contact le plus fréquenté de la zone."
      )
    } else {
      if (tagsNegatifs[0] && tagsNegatifs[0].count >= 2) {
        const t = tagsNegatifs[0]
        recommandations.push(
          `Le motif « ${t.label} » revient ${t.count} fois en 30 jours : faites-en l'action prioritaire de votre prochaine réunion d'équipe.`
        )
      }
      if (noteMoy < 3.5 && total >= 3) {
        recommandations.push(
          `Moyenne de ${noteMoy.toFixed(2).replace(".", ",")}/5 : réalisez un audit surprise de la zone avec un référent qualité cette semaine.`
        )
      }
      if (tendance === "baisse" && tendanceDelta !== null) {
        recommandations.push(
          `Tendance en baisse (${tendanceDelta.toFixed(2).replace(".", ",")} pt sur 7 jours) : comparez les plannings de la semaine passée pour identifier le changement.`
        )
      }
      if (tendance === "hausse") {
        recommandations.push(
          "Tendance en hausse : consolidez les pratiques récentes de l'équipe en les notant comme standard de la zone."
        )
      }
      if (noteMoy >= 4.5 && total >= 5) {
        recommandations.push(
          "Zone excellente : basez le standard des autres zones sur vos pratiques ici et valorisez l'équipe en place."
        )
      }
      const reclamations = retours.filter((r) => r.note <= 3)
      const nonTraitees = reclamations.filter((r) => r.statut === "NEW")
      if (nonTraitees.length > 0) {
        recommandations.push(
          `${nonTraitees.length} réclamation(s) encore sans réponse : traitez-les depuis l'onglet Retours pour rétablir la confiance.`
        )
      }
      if (recommandations.length === 0) {
        recommandations.push(
          "Aucun irritant dominant sur la période : maintenez vos standards et continuez à collecter des retours."
        )
      }
    }

    return ok({
      zone: {
        id: zone.id,
        nom: zone.nom,
        noteMoy,
        total,
        tendance,
        tendanceDelta,
      },
      evolution,
      tagsFrequents,
      derniersRetours: retours.slice(0, 6).map(serialiserRetour),
      recommandations,
    })
  } catch (e) {
    console.error("zones/details GET error", e)
    return fail("Erreur serveur", 500)
  }
}
