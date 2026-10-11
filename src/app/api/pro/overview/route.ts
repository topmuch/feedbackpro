// ============================================================
// API Pro - Vue d'ensemble (KPIs du dashboard)
// GET /api/pro/overview
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    const { pro, boutique } = ctx

    // Récupération des retours (volume raisonnable : calcul en mémoire)
    const retours = await db.retour.findMany({
      where: { boutiqueId: boutique.id },
      orderBy: { createdAt: "desc" },
    })

    const now = new Date()
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1)
    const debutMoisPrecedent = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const total = retours.length
    const scoreGlobal = total ? retours.reduce((s, r) => s + r.note, 0) / total : 0

    const ceMois = retours.filter((r) => r.createdAt >= debutMois)
    const moisPrecedent = retours.filter((r) => r.createdAt >= debutMoisPrecedent && r.createdAt < debutMois)
    const scoreMois = ceMois.length ? ceMois.reduce((s, r) => s + r.note, 0) / ceMois.length : 0
    const scoreMoisPrecedent = moisPrecedent.length ? moisPrecedent.reduce((s, r) => s + r.note, 0) / moisPrecedent.length : 0

    // Taux d'interception : % des mécontents (≤3) traités en interne (statut != NEW)
    const negatifs = retours.filter((r) => r.note <= 3)
    const negatifsTraites = negatifs.filter((r) => r.statut !== "NEW")
    const tauxInterception = negatifs.length ? Math.round((negatifsTraites.length / negatifs.length) * 100) : 0

    const alertesNonLues = await db.alerte.count({ where: { proId: pro.id, lu: false } })
    const retoursNonLus = retours.filter((r) => !r.lu).length

    // Évolution jour par jour sur 30 jours
    const evolution: { date: string; note: number; count: number }[] = []
    for (let d = 29; d >= 0; d--) {
      const jour = new Date(now)
      jour.setHours(0, 0, 0, 0)
      jour.setDate(jour.getDate() - d)
      const lendemain = new Date(jour)
      lendemain.setDate(lendemain.getDate() + 1)
      const duJour = retours.filter((r) => r.createdAt >= jour && r.createdAt < lendemain)
      evolution.push({
        date: jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        note: duJour.length ? Number((duJour.reduce((s, r) => s + r.note, 0) / duJour.length).toFixed(2)) : 0,
        count: duJour.length,
      })
    }

    // Répartition des notes
    const repartitionNotes = [1, 2, 3, 4, 5].map((n) => ({
      note: n,
      count: retours.filter((r) => r.note === n).length,
    }))

    // 5 derniers retours (spec Session 4)
    const recent = retours.slice(0, 5).map((r) => ({
      id: r.id,
      note: r.note,
      tags: JSON.parse(r.tags) as string[],
      commentaire: r.commentaire,
      statut: r.statut,
      lu: r.lu,
      createdAt: r.createdAt,
    }))

    // Alertes récentes (non lues d'abord)
    const alertes = await db.alerte.findMany({
      where: { proId: pro.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    })

    return ok({
      nomCommerce: pro.nomCommerce,
      plan: pro.plan,
      kpis: {
        scoreGlobal: Number(scoreGlobal.toFixed(2)),
        totalRetours: total,
        retoursCeMois: ceMois.length,
        retoursMoisPrecedent: moisPrecedent.length,
        scoreMois: Number(scoreMois.toFixed(2)),
        scoreMoisPrecedent: Number(scoreMoisPrecedent.toFixed(2)),
        tauxInterception,
        retoursNonLus,
        alertesNonLues,
      },
      evolution,
      repartitionNotes,
      recentRetours: recent,
      alertes,
    })
  } catch (e) {
    console.error("overview error", e)
    return fail("Erreur serveur", 500)
  }
}
