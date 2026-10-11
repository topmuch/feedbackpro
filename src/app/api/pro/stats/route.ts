// ============================================================
// API Pro - Statistiques avancées (graphiques + heatmap)
// GET /api/pro/stats?jours=30
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { TAG_CATEGORIES } from "@/lib/constants"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const jours = Math.min(90, Math.max(15, Number(req.nextUrl.searchParams.get("jours") || 30)))
    const debut = new Date()
    debut.setHours(0, 0, 0, 0)
    debut.setDate(debut.getDate() - jours + 1)

    const retours = await db.retour.findMany({
      where: { boutiqueId: ctx.boutique.id, createdAt: { gte: debut } },
      orderBy: { createdAt: "asc" },
    })

    // ---------- Évolution jour par jour ----------
    const evolution: { date: string; note: number; count: number }[] = []
    for (let d = 0; d < jours; d++) {
      const jour = new Date(debut)
      jour.setDate(jour.getDate() + d)
      const lendemain = new Date(jour)
      lendemain.setDate(lendemain.getDate() + 1)
      const duJour = retours.filter((r) => r.createdAt >= jour && r.createdAt < lendemain)
      evolution.push({
        date: jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        note: duJour.length ? Number((duJour.reduce((s, r) => s + r.note, 0) / duJour.length).toFixed(2)) : 0,
        count: duJour.length,
      })
    }

    // ---------- Répartition par catégorie (mapping tags) ----------
    const catCounts: Record<string, number> = { "Accueil": 0, "Rapidité": 0, "Compétence": 0, "Qualité": 0 }
    for (const r of retours) {
      for (const t of JSON.parse(r.tags) as string[]) {
        const cat = TAG_CATEGORIES[t]
        if (cat) catCounts[cat]++
      }
    }
    const categories = Object.entries(catCounts).map(([categorie, count]) => ({ categorie, count }))

    // ---------- Répartition des notes ----------
    const repartitionNotes = [1, 2, 3, 4, 5].map((n) => ({
      note: `${n} ★`,
      count: retours.filter((r) => r.note === n).length,
    }))

    // ---------- Heatmap : jour x créneau horaire (retours et alertes ≤2) ----------
    const creneaux = ["6h-10h", "10h-14h", "14h-18h", "18h-22h", "22h-6h"]
    const joursSemaine = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
    const heatmap: { jour: string; creneau: string; total: number; alertes: number }[] = []
    for (let j = 0; j < 7; j++) {
      for (let c = 0; c < creneaux.length; c++) {
        const inCreneau = (d: Date) => {
          const h = d.getHours()
          if (c === 0) return h >= 6 && h < 10
          if (c === 1) return h >= 10 && h < 14
          if (c === 2) return h >= 14 && h < 18
          if (c === 3) return h >= 18 && h < 22
          return h >= 22 || h < 6
        }
        const cell = retours.filter((r) => r.createdAt.getDay() === (j + 1) % 7 && inCreneau(r.createdAt))
        heatmap.push({
          jour: joursSemaine[j],
          creneau: creneaux[c],
          total: cell.length,
          alertes: cell.filter((r) => r.note <= 2).length,
        })
      }
    }

    // ---------- Totaux ----------
    const total = retours.length
    const avg = total ? retours.reduce((s, r) => s + r.note, 0) / total : 0

    return ok({
      jours,
      evolution,
      categories,
      repartitionNotes,
      heatmap,
      total,
      noteMoyenne: Number(avg.toFixed(2)),
    })
  } catch (e) {
    console.error("stats error", e)
    return fail("Erreur serveur", 500)
  }
}
