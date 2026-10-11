// ============================================================
// API Pro - Leaderboard & gamification (plan Pro+)
// GET /api/pro/leaderboard?jours=30   (jours absent = tout l'historique)
// Calcule scores, classement et recommandations automatiques
// Règles de gestion (spec Session 4) :
//  - plus de 10 mentions négatives → alerte « Entretien recommandé »
//  - plus de 20 mentions positives → badge « Employé du mois »
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { NEGATIVE_TAGS } from "@/lib/constants"

// Libellés des tags négatifs : source unique = constants.ts (même wording que la page de scan)
const LABELS_NEG: Record<string, string> = Object.fromEntries(NEGATIVE_TAGS.map((t) => [t.id, t.label]))

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // Période optionnelle (jours) : ex. ?jours=30 pour le « Top du mois »
    const jours = Number(req.nextUrl.searchParams.get("jours") || 0)
    const depuis = jours > 0 ? new Date(Date.now() - jours * 24 * 3600 * 1000) : null

    const employes = await db.employe.findMany({
      where: { boutiqueId: ctx.boutique.id },
      include: {
        retours: {
          where: depuis ? { createdAt: { gte: depuis } } : undefined,
          select: { note: true, tags: true },
        },
      },
    })

    const lignes = employes.map((e) => {
      const nb = e.retours.length
      const avg = nb ? e.retours.reduce((s, r) => s + r.note, 0) / nb : 0

      // Fréquence des tags négatifs par employé
      const negFreq: Record<string, number> = {}
      let pos = 0
      let neg = 0
      for (const r of e.retours) {
        const tags = JSON.parse(r.tags) as string[]
        if (r.note >= 4) pos += tags.length
        else {
          neg += tags.length
          for (const t of tags) {
            if (LABELS_NEG[t]) negFreq[t] = (negFreq[t] || 0) + 1
          }
        }
      }
      const topNeg = Object.entries(negFreq).sort((a, b) => b[1] - a[1])

      // Recommandations automatiques (gamification / management)
      const recommandations: string[] = []
      // Seuils métier Session 4 : >10 mentions négatives / >20 positives
      const alerteEntretien = neg > 10
      const employeDuMois = pos > 20
      if (alerteEntretien) {
        recommandations.unshift(`Entretien recommandé — ${neg} mentions négatives sur la période`)
      }
      if (employeDuMois) {
        recommandations.unshift(`Employé du mois — ${pos} mentions positives, félicitations !`)
      }
      for (const [tag, n] of topNeg) {
        if (n >= 3) {
          recommandations.push(`${n} signalements "${LABELS_NEG[tag]}" → ${n >= 5 ? "entretien recommandé" : "point à faire en équipe"}`)
        }
      }
      if (nb >= 5 && avg >= 4.5) recommandations.push("★ Excellente performance — pensez à le/la féliciter publiquement")
      if (nb >= 10 && avg >= 4) recommandations.push("Valeur sûre de l'équipe")

      return {
        id: e.id,
        nom: e.nom,
        poste: e.poste,
        actif: e.actif,
        nbRetours: nb,
        noteMoyenne: Number(avg.toFixed(2)),
        mentionsPositives: pos,
        mentionsNegatives: neg,
        topTagsNegatifs: topNeg.slice(0, 3).map(([t, n]) => ({ tag: LABELS_NEG[t], count: n })),
        alerteEntretien,
        employeDuMois,
        recommandations,
      }
    })

    // Classement : par note moyenne puis volume (min. 3 retours pour être classé)
    const classement = [...lignes].sort((a, b) => {
      if (a.nbRetours >= 3 && b.nbRetours < 3) return -1
      if (b.nbRetours >= 3 && a.nbRetours < 3) return 1
      if (b.noteMoyenne !== a.noteMoyenne) return b.noteMoyenne - a.noteMoyenne
      return b.mentionsPositives - a.mentionsPositives
    })

    return ok({ classement, plan: ctx.pro.plan })
  } catch (e) {
    console.error("leaderboard error", e)
    return fail("Erreur serveur", 500)
  }
}
