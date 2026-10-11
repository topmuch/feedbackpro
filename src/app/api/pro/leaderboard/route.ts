// ============================================================
// API Pro - Leaderboard & gamification de l'équipe
// GET /api/pro/leaderboard?jours=30 (défaut : 30 derniers jours)
// → {
//     top: [{ employeId, nom, poste, positifs, negatifs, noteMoy, badge }],
//     recommandations: [{ employeId, nom, texte, gravite }]  (Session 4, §6)
//   }
// Règles de gestion (Session 1) :
//  - plus de 20 retours positifs → badge « Employé du mois »
//  - plus de 10 retours négatifs → badge « Entretien recommandé »
// Recommandations Session 4 : phrases motivées avec données réelles
// (« Thomas a 12 signalements "Impoli" → entretien recommandé »).
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { tagLabel } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // Période optionnelle : ?jours=30 par défaut (« Employé du mois »)
    const jours = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("jours") || 30)))
    const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000)

    const employes = await db.employe.findMany({
      where: { proId: ctx.pro.id, actif: true },
      include: {
        retours: {
          where: { createdAt: { gte: depuis } },
          // Tags inclus pour construire les recommandations motivées (Session 4)
          select: { note: true, tags: true },
        },
      },
    })

    const top = employes
      .map((e) => {
        const positifs = e.retours.filter((r) => r.note >= 4).length
        const negatifs = e.retours.filter((r) => r.note <= 3).length
        const noteMoy = e.retours.length
          ? Number((e.retours.reduce((s, r) => s + r.note, 0) / e.retours.length).toFixed(2))
          : 0
        // Badge : priorité à la reconnaissance positive
        const badge =
          positifs > 20 ? "Employé du mois" : negatifs > 10 ? "Entretien recommandé" : null
        return { employeId: e.id, nom: e.nom, poste: e.poste, positifs, negatifs, noteMoy, badge }
      })
      // Classement : meilleure note moyenne d'abord, puis volume positif
      .sort((a, b) => {
        if (b.noteMoy !== a.noteMoy) return b.noteMoy - a.noteMoy
        return b.positifs - a.positifs
      })

    // ---------- Recommandations IA détaillées (Session 4, §6) ----------
    // Phrases motivées basées sur les données réelles : tag négatif dominant,
    // volume de signalements, mentions positives à valoriser.
    type Recommandation = { employeId: string; nom: string; texte: string; gravite: "attention" | "positif" }
    const recommandations: Recommandation[] = []

    for (const e of employes) {
      const retoursNeg = e.retours.filter((r) => r.note <= 3)
      const retoursPos = e.retours.filter((r) => r.note >= 4)

      // Signalements répétés d'un même motif → entretien / accompagnement
      if (retoursNeg.length >= 3) {
        const compteTags = new Map<string, number>()
        for (const r of retoursNeg) {
          for (const t of parseJsonArray(r.tags)) compteTags.set(t, (compteTags.get(t) ?? 0) + 1)
        }
        const [tagDominant, count] = [...compteTags.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
        if (tagDominant && count && count >= 2) {
          recommandations.push({
            employeId: e.id,
            nom: e.nom,
            texte: `${e.nom} a ${count} signalement(s) « ${tagLabel(tagDominant)} » sur les ${jours} derniers jours → entretien recommandé`,
            gravite: "attention",
          })
          continue
        }
        recommandations.push({
          employeId: e.id,
          nom: e.nom,
          texte: `${e.nom} cumule ${retoursNeg.length} retours négatifs sur ${jours} jours → accompagnement managérial conseillé`,
          gravite: "attention",
        })
        continue
      }

      // Excellence à valoriser
      if (retoursPos.length >= 5) {
        recommandations.push({
          employeId: e.id,
          nom: e.nom,
          texte: `${e.nom} a ${retoursPos.length} mentions positives sur ${jours} jours → félicitations à partager en briefing`,
          gravite: "positif",
        })
      }
    }

    // Priorité aux signalements d'attention, limité à 5 pour rester lisible
    recommandations.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === "attention" ? -1 : 1))

    return ok({ top, recommandations: recommandations.slice(0, 5), jours })
  } catch (e) {
    console.error("leaderboard error", e)
    return fail("Erreur serveur", 500)
  }
}
