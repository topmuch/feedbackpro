// ============================================================
// API Pro - Vue d'ensemble (KPIs du dashboard)
// GET /api/pro/overview
// → score global 30j, évolution, retours du mois, taux d'interception,
//   alertes non lues, courbe 30 jours et derniers retours détaillés
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserRetour } from "@/lib/serialise"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    const { pro } = ctx

    const now = new Date()
    const ilYA30j = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
    const ilYA60j = new Date(now.getTime() - 60 * 24 * 3600 * 1000)
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1)

    // Fenêtre 60 jours : couvre la courbe 30j + la comparaison d'évolution
    const retours = await db.retour.findMany({
      where: { proId: pro.id, createdAt: { gte: ilYA60j } },
      orderBy: { createdAt: "desc" },
      include: {
        zone: { select: { nom: true } },
        employe: { select: { nom: true } },
      },
    })

    // ---------- Scores (note moyenne /5 → score /100) ----------
    const moyenne = (liste: typeof retours) =>
      liste.length ? liste.reduce((s, r) => s + r.note, 0) / liste.length : 0

    const fenetre30j = retours.filter((r) => r.createdAt >= ilYA30j)
    const fenetrePrecedente = retours.filter(
      (r) => r.createdAt >= ilYA60j && r.createdAt < ilYA30j
    )
    const note30j = moyenne(fenetre30j)
    const notePrecedente = moyenne(fenetrePrecedente)

    const scoreGlobal30j = note30j > 0 ? Math.round(note30j * 20) : 0
    const evolutionPct =
      notePrecedente > 0 && note30j > 0
        ? Math.round(((note30j - notePrecedente) / notePrecedente) * 100)
        : 0

    // ---------- Retours du mois ----------
    const retoursMois = fenetre30j.filter((r) => r.createdAt >= debutMois).length

    // ---------- Taux d'interception (30j) ----------
    // % des réclamations (1-3★) prises en charge (statut != NEW)
    const reclamations = fenetre30j.filter((r) => r.note <= 3)
    const interceptees = reclamations.filter((r) => r.statut !== "NEW")
    const tauxInterception = reclamations.length
      ? Math.round((interceptees.length / reclamations.length) * 100)
      : 0

    const alertesNonLues = await db.alerte.count({ where: { proId: pro.id, lu: false } })

    // ---------- Courbe 30 jours : { date, score, retours } ----------
    const courbe30j: { date: string; score: number; retours: number }[] = []
    for (let d = 29; d >= 0; d--) {
      const jour = new Date(now)
      jour.setHours(0, 0, 0, 0)
      jour.setDate(jour.getDate() - d)
      const lendemain = new Date(jour)
      lendemain.setDate(lendemain.getDate() + 1)
      const duJour = retours.filter((r) => r.createdAt >= jour && r.createdAt < lendemain)
      const noteJour = moyenne(duJour)
      courbe30j.push({
        date: jour.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        score: duJour.length ? Math.round(noteJour * 20) : 0,
        retours: duJour.length,
      })
    }

    // ---------- Derniers retours détaillés ----------
    const derniersRetours = retours.slice(0, 8).map(serialiserRetour)

    return ok({
      scoreGlobal30j,
      evolutionPct,
      retoursMois,
      tauxInterception,
      alertesNonLues,
      courbe30j,
      derniersRetours,
    })
  } catch (e) {
    console.error("overview error", e)
    return fail("Erreur serveur", 500)
  }
}
