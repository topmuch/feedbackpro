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
    })
  } catch (e) {
    console.error("admin overview error", e)
    return fail("Erreur serveur", 500)
  }
}
