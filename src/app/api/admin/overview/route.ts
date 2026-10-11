// ============================================================
// API Superadmin - Statistiques globales de la plateforme
// GET /api/admin/overview
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { PLANS } from "@/lib/constants"

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const ilYA30j = new Date(Date.now() - 30 * 24 * 3600 * 1000)

    const pros = await db.pro.findMany({ include: { user: { select: { email: true } } } })
    const retours = await db.retour.findMany({ select: { note: true, createdAt: true } })
    const commandes = await db.commande.findMany({ select: { prixEuros: true, statut: true } })
    const alertes = await db.alerte.count({ where: { createdAt: { gte: ilYA30j } } })

    const parPlan = { STARTER: 0, PRO: 0, ENTERPRISE: 0 }
    for (const p of pros) parPlan[p.plan as keyof typeof parPlan] = (parPlan[p.plan as keyof typeof parPlan] || 0) + 1

    // MRR estimé : somme des abonnements actifs
    const mrr = pros.reduce((s, p) => s + (PLANS[p.plan as keyof typeof PLANS]?.price ?? 0), 0)

    // Revenus supports physiques
    const revenusSupports = commandes.reduce((s, c) => s + c.prixEuros, 0)

    const retours30j = retours.filter((r) => r.createdAt >= ilYA30j).length
    const avgNote = retours.length ? retours.reduce((s, r) => s + r.note, 0) / retours.length : 0

    // Derniers commerçants inscrits
    const derniersPros = [...pros]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        nomCommerce: p.nomCommerce,
        ville: p.ville,
        plan: p.plan,
        email: p.user.email,
        createdAt: p.createdAt,
      }))

    // Croissance du nombre de Pros : nouveaux inscriptions par jour (30 derniers jours)
    const croissancePros: { jour: string; nouveaux: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const suivant = new Date(d)
      suivant.setDate(d.getDate() + 1)
      croissancePros.push({
        jour: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        nouveaux: pros.filter((p) => p.createdAt >= d && p.createdAt < suivant).length,
      })
    }

    // Top 10 des Pros par nombre de retours (via les boutiques)
    const retoursParBoutique = await db.retour.groupBy({ by: ["boutiqueId"], _count: { _all: true } })
    const boutiques = await db.boutique.findMany({ select: { id: true, nom: true, pro: { select: { nomCommerce: true } } } })
    const topPros = boutiques
      .map((b) => ({
        nomCommerce: b.pro.nomCommerce,
        boutique: b.nom,
        retours: retoursParBoutique.find((r) => r.boutiqueId === b.id)?._count._all ?? 0,
      }))
      .sort((a, b) => b.retours - a.retours)
      .slice(0, 10)

    return ok({
      kpis: {
        nbPros: pros.length,
        prosParPlan: parPlan,
        mrr,
        revenusSupports,
        totalRetours: retours.length,
        retours30j,
        noteMoyennePlateforme: Number(avgNote.toFixed(2)),
        commandesCount: commandes.length,
        commandesATraiter: commandes.filter((c) => c.statut === "A_IMPRIMER").length,
        alertes30j: alertes,
      },
      derniersPros,
      croissancePros,
      topPros,
    })
  } catch (e) {
    console.error("admin overview error", e)
    return fail("Erreur serveur", 500)
  }
}
