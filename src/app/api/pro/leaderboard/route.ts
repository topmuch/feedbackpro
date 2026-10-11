// ============================================================
// API Pro - Leaderboard & gamification de l'équipe
// GET /api/pro/leaderboard?jours=30 (défaut : 30 derniers jours)
// → { top: [{ employeId, nom, poste, positifs, negatifs, noteMoy, badge }] }
// Règles de gestion (Session 1) :
//  - plus de 20 retours positifs → badge « Employé du mois »
//  - plus de 10 retours négatifs → badge « Entretien recommandé »
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"

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
          select: { note: true },
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

    return ok({ top, jours })
  } catch (e) {
    console.error("leaderboard error", e)
    return fail("Erreur serveur", 500)
  }
}
