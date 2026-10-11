// ============================================================
// API Superadmin - Revenus de la plateforme
// GET /api/admin/revenus
// → CA abonnements (MRR recalculé depuis les plans actifs), CA supports
//   physiques (répartition par type) et évolution sur les 12 derniers mois
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { PLANS, SUPPORTS, TypeSupportId } from "@/lib/constants"

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    // ---------- Agrégations Prisma ----------
    // CA supports : total + répartition par type de support (group by SQL)
    const [totalSupports, parType, pros, commandesEvol] = await Promise.all([
      db.commande.aggregate({ _sum: { prixEuros: true } }),
      db.commande.groupBy({ by: ["typeSupport"], _sum: { prixEuros: true }, _count: { _all: true } }),
      db.pro.findMany({ select: { plan: true, createdAt: true, suspendu: true } }),
      db.commande.findMany({ select: { prixEuros: true, createdAt: true } }),
    ])

    // MRR abonnements : recalculé côté serveur à partir des plans des Pro actifs non suspendus (29 € / 99 € / 249 €)
    const caAbonnementsMensuel = pros
      .filter((p) => !p.suspendu)
      .reduce((s, p) => s + (PLANS[p.plan as keyof typeof PLANS]?.price ?? 0), 0)

    // Répartition par type (les 3 types du catalogue, 0 si aucune commande)
    const caSupportsParType: Record<TypeSupportId, number> = {
      STICKERS_50: 0,
      CHEVALET_ACRYLIQUE: 0,
      AFFICHE_A4: 0,
    }
    for (const ligne of parType) {
      if (ligne.typeSupport in caSupportsParType) {
        caSupportsParType[ligne.typeSupport as TypeSupportId] = ligne._sum.prixEuros ?? 0
      }
    }

    // ---------- Évolution mensuelle (12 derniers mois) ----------
    // bornes : 11 mois complets écoulés + le mois courant
    const debut = new Date()
    debut.setDate(1)
    debut.setHours(0, 0, 0, 0)
    debut.setMonth(debut.getMonth() - 11)

    const moisCle = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

    // MRR estimé du mois m = somme des plans des commerçants inscrits avant la fin de m
    // (proxy : pas d'historique de facturation, cf. worklog)
    const prosTries = [...pros]
      .filter((p) => !p.suspendu)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const evolution: { mois: string; abonnements: number; supports: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const finMois = new Date(debut)
      finMois.setMonth(finMois.getMonth() + (12 - i))
      const mrrMois = prosTries
        .filter((p) => p.createdAt < finMois)
        .reduce((s, p) => s + (PLANS[p.plan as keyof typeof PLANS]?.price ?? 0), 0)
      evolution.push({ mois: moisCle(finMois), abonnements: mrrMois, supports: 0 })
    }
    for (const c of commandesEvol) {
      const cle = moisCle(c.createdAt)
      const ligne = evolution.find((e) => e.mois === cle)
      if (ligne) ligne.supports += c.prixEuros
    }

    return ok({
      caAbonnementsMensuel,
      caSupportsTotal: totalSupports._sum.prixEuros ?? 0,
      caSupportsParType,
      caSupportsParTypeDetail: parType.map((t) => ({
        type: t.typeSupport,
        label: SUPPORTS[t.typeSupport as TypeSupportId]?.label ?? t.typeSupport,
        ca: t._sum.prixEuros ?? 0,
        commandes: t._count._all,
      })),
      evolutionMensuelle: evolution,
    })
  } catch (e) {
    console.error("admin revenus error", e)
    return fail("Erreur serveur", 500)
  }
}
