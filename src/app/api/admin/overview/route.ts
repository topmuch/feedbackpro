// ============================================================
// API Superadmin - Vue d'ensemble de la plateforme
// GET /api/admin/overview
// → { totalPros, prosActifs, mrr, commandesEnCours, croissance30j,
//     repartitionPlans, top10Pros }
// - prosActifs : Pros avec au moins 1 retour sur les 30 derniers jours
// - mrr : Σ des prix PLANS des Pros actifs non suspendus (29/99/249 €)
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { PLANS } from "@/lib/constants"
import { getModulesActifs } from "@/lib/modules"

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const ilYA30j = new Date(Date.now() - 30 * 24 * 3600 * 1000)

    const [pros, retours30j, commandes] = await Promise.all([
      db.pro.findMany({ select: { id: true, plan: true, suspendu: true, createdAt: true, nomEtablissement: true, proId: true } }),
      db.retour.groupBy({
        by: ["proId"],
        where: { createdAt: { gte: ilYA30j } },
        _count: { _all: true },
      }),
      db.commande.findMany({ select: { statut: true, prixEuros: true } }),
    ])

    // ---------- Répartition des plans ----------
    const repartitionPlans = { STARTER: 0, PRO: 0, ENTERPRISE: 0, FRANCHISE: 0 }
    for (const p of pros) {
      if (p.plan in repartitionPlans) {
        repartitionPlans[p.plan as keyof typeof repartitionPlans] += 1
      }
    }

    // ---------- Pros actifs (≥ 1 retour sur 30 j) ----------
    const proIdsActifs = new Set(retours30j.map((r) => r.proId))
    const prosActifs = pros.filter((p) => proIdsActifs.has(p.id)).length

    // ---------- MRR : plans actifs non suspendus (29 € / 99 € / 249 €) ----------
    const mrr = pros
      .filter((p) => !p.suspendu)
      .reduce((s, p) => s + (PLANS[p.plan as keyof typeof PLANS]?.price ?? 0), 0)

    // ---------- Module abonnement_multi_sites : revenu multi-sites ----------
    // On somme le prix du plan de chaque Pro qui a un proId non-null (enfant
    // d'un groupe multi-établissements). Renvoyé au superadmin pour afficher
    // un KPI dédié dans la vue d'ensemble (visible seulement si le module est
    // activé, mais le calcul est toujours fait — léger).
    const revenuMultiSites = pros
      .filter((p) => !p.suspendu && p.proId)
      .reduce((s, p) => s + (PLANS[p.plan as keyof typeof PLANS]?.price ?? 0), 0)

    // ---------- Commandes ----------
    const commandesEnCours = commandes.filter((c) => c.statut !== "LIVRE").length

    // ---------- Croissance : nouvelles inscriptions par jour (30 j) ----------
    const croissance30j: { jour: string; nouveaux: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      const suivant = new Date(d)
      suivant.setDate(d.getDate() + 1)
      croissance30j.push({
        jour: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        nouveaux: pros.filter((p) => p.createdAt >= d && p.createdAt < suivant).length,
      })
    }

    // ---------- Top 10 des Pros par nombre de retours ----------
    const totalParPro = await db.retour.groupBy({ by: ["proId"], _count: { _all: true } })
    const top10Pros = pros
      .map((p) => ({
        id: p.id,
        nomEtablissement: p.nomEtablissement,
        plan: p.plan,
        retours: totalParPro.find((r) => r.proId === p.id)?._count._all ?? 0,
      }))
      .sort((a, b) => b.retours - a.retours)
      .slice(0, 10)

    return ok({
      totalPros: pros.length,
      prosActifs,
      mrr,
      commandesEnCours,
      chiffreAffairesSupports: commandes.reduce((s, c) => s + c.prixEuros, 0),
      croissance30j,
      repartitionPlans,
      top10Pros,
      // Module abonnement_multi_sites : KPI revenu multi-sites (somme des
      // prix de plan des Pros avec proId non-null). Affiché en superadmin
      // seulement si le module est actif.
      revenuMultiSites,
      // Liste des modules actifs (pour que la vue d'ensemble puisse
      // afficher/masquer les KPI conditionnels sans réclamer une seconde
      // requête /api/admin/modules).
      modulesActifs: await getModulesActifs(),
    })
  } catch (e) {
    console.error("admin overview error", e)
    return fail("Erreur serveur", 500)
  }
}
