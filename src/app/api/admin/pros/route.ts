// ============================================================
// API Superadmin - Gestion des établissements (Pros)
// GET  /api/admin/pros?plan=&q=&statut=
//      → liste avec counts (zones / retours / employés) + filtres
// POST /api/admin/pros { action: "changerPlan"|"suspendre"|"reactiver"|"supprimer", id, plan? }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { PLANS } from "@/lib/constants"
import { adminProActionSchema, firstError } from "@/lib/validation"

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const sp = req.nextUrl.searchParams
    const plan = sp.get("plan") || ""
    const q = sp.get("q")?.trim().toLowerCase() || ""
    const statut = sp.get("statut") || "" // "suspendu" | "actif" | ""

    const pros = await db.pro.findMany({
      include: {
        user: { select: { email: true } },
        _count: { select: { zones: true, retours: true, employes: true, commandes: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    let liste = pros
    if (plan) liste = liste.filter((p) => p.plan === plan)
    if (statut === "suspendu") liste = liste.filter((p) => p.suspendu)
    if (statut === "actif") liste = liste.filter((p) => !p.suspendu)
    if (q) {
      liste = liste.filter(
        (p) =>
          p.nomEtablissement.toLowerCase().includes(q) ||
          p.ville.toLowerCase().includes(q) ||
          p.user.email.toLowerCase().includes(q)
      )
    }

    return ok({
      pros: liste.map((p) => ({
        id: p.id,
        nomEtablissement: p.nomEtablissement,
        typeEtablissement: p.typeEtablissement,
        ville: p.ville,
        email: p.user.email,
        plan: p.plan,
        suspendu: p.suspendu,
        onboardingDone: p.onboardingDone,
        frequenceRapport: p.frequenceRapport,
        createdAt: p.createdAt,
        // Compteurs (nbZones/nbRetours/nbEmployés) + alias courts
        // zones/retours/employés consommés par admin-dashboard.tsx
        nbZones: p._count.zones,
        nbRetours: p._count.retours,
        nbEmployes: p._count.employes,
        nbCommandes: p._count.commandes,
        zones: p._count.zones,
        retours: p._count.retours,
        employes: p._count.employes,
        mrr: PLANS[p.plan as keyof typeof PLANS]?.price ?? 0,
      })),
      total: pros.length,
    })
  } catch (e) {
    console.error("admin pros GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parse = adminProActionSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const { action, id, plan } = parse.data

    const pro = await db.pro.findUnique({
      where: { id },
      include: { user: { select: { id: true, role: true } } },
    })
    if (!pro) return fail("Établissement introuvable", 404)

    // Le superadmin ne peut jamais être suspendu ni supprimé
    if ((action === "supprimer" || action === "suspendre") && pro.user.role === "SUPERADMIN") {
      return fail("Impossible de supprimer ou suspendre un compte superadmin", 403)
    }

    switch (action) {
      case "changerPlan": {
        if (!plan || !PLANS[plan as keyof typeof PLANS]) return fail("Plan invalide", 400)
        const updated = await db.pro.update({ where: { id: pro.id }, data: { plan } })
        return ok({ id: updated.id, plan: updated.plan, suspendu: updated.suspendu })
      }

      case "suspendre": {
        const updated = await db.pro.update({ where: { id: pro.id }, data: { suspendu: true } })
        return ok({ id: updated.id, plan: updated.plan, suspendu: updated.suspendu })
      }

      case "reactiver": {
        const updated = await db.pro.update({ where: { id: pro.id }, data: { suspendu: false } })
        return ok({ id: updated.id, plan: updated.plan, suspendu: updated.suspendu })
      }

      case "supprimer": {
        // Détache d'abord les retours de leurs employés (cohérence SQLite),
        // puis suppression du User : cascade Prisma → Pro → Zones →
        // Retours / Employés / RapportsIA / Alertes / Commandes + Sessions.
        await db.retour.updateMany({ where: { proId: pro.id }, data: { employeId: null } })
        await db.user.delete({ where: { id: pro.userId } })
        return ok({ id: pro.id, supprime: true })
      }
    }
  } catch (e) {
    console.error("admin pros POST error", e)
    return fail("Erreur serveur", 500)
  }
}
