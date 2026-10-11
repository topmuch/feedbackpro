// ============================================================
// API Superadmin - Gestion des commerçants
// GET   /api/admin/pros?plan=&ville=&q=
// PATCH /api/admin/pros
//   { proId, plan? }                        → changement de plan (compat historique)
//   { proId, action: "changerPlan", plan }  → changement de plan
//   { proId, action: "suspendre" }          → suspendu: true
//   { proId, action: "reactiver" }          → suspendu: false
//   { proId, action: "supprimer" }          → suppression définitive (cascade)
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { PLANS } from "@/lib/constants"
import { firstError } from "@/lib/validation"

const patchSchema = z.object({
  proId: z.string().trim().min(1, "proId manquant"),
  action: z.enum(["changerPlan", "suspendre", "reactiver", "supprimer"]).optional(),
  plan: z.string().optional(),
  onboardingDone: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const sp = req.nextUrl.searchParams
    const plan = sp.get("plan") || ""
    const ville = sp.get("ville")?.trim().toLowerCase() || ""
    const q = sp.get("q")?.trim().toLowerCase() || ""

    const pros = await db.pro.findMany({
      include: {
        user: { select: { email: true } },
        boutiques: { select: { _count: { select: { retours: true } } } },
        commandes: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    let liste = pros
    if (plan) liste = liste.filter((p) => p.plan === plan)
    if (ville) liste = liste.filter((p) => p.ville.toLowerCase().includes(ville))
    if (q) {
      liste = liste.filter(
        (p) => p.nomCommerce.toLowerCase().includes(q) || p.user.email.toLowerCase().includes(q)
      )
    }

    return ok({
      pros: liste.map((p) => ({
        id: p.id,
        nomCommerce: p.nomCommerce,
        categorie: p.categorie,
        ville: p.ville,
        email: p.user.email,
        plan: p.plan,
        suspendu: p.suspendu,
        onboardingDone: p.onboardingDone,
        createdAt: p.createdAt,
        qrToken: p.qrToken,
        nbRetours: p.boutiques.reduce((s, b) => s + b._count.retours, 0),
        nbCommandes: p.commandes.length,
        mrr: PLANS[p.plan as keyof typeof PLANS]?.price ?? 0,
      })),
      villes: [...new Set(pros.map((p) => p.ville).filter(Boolean))].sort(),
    })
  } catch (e) {
    console.error("admin pros error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const parse = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const body = parse.data

    const pro = await db.pro.findUnique({
      where: { id: body.proId },
      include: { user: { select: { id: true, role: true, email: true } } },
    })
    if (!pro) return fail("Commerçant introuvable", 404)

    // Détermine l'action : explicite, ou changement de plan si un plan est fourni
    // sans action (compatibilité avec l'ancien contrat { proId, plan })
    const action = body.action ?? (body.plan ? "changerPlan" : null)
    if (!action) return fail("Action manquante", 400)

    // Le superadmin ne peut jamais être suspendu ni supprimé
    if ((action === "supprimer" || action === "suspendre") && pro.user.role === "SUPERADMIN") {
      return fail("Impossible de supprimer ou suspendre un compte superadmin", 403)
    }

    switch (action) {
      case "changerPlan": {
        if (!body.plan || !PLANS[body.plan as keyof typeof PLANS]) return fail("Plan invalide", 400)
        const updated = await db.pro.update({ where: { id: pro.id }, data: { plan: body.plan } })
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
        // Suppression du User : cascade Prisma → Pro → Boutiques → Retours /
        // Employés → Alertes → Commandes + Sessions (onDelete: Cascade partout)
        await db.$transaction([
          db.alerte.deleteMany({ where: { proId: pro.id } }),
          db.boutique.deleteMany({ where: { proId: pro.id } }),
          db.commande.deleteMany({ where: { proId: pro.id } }),
          db.pro.delete({ where: { id: pro.id } }),
          db.user.delete({ where: { id: pro.userId } }),
        ])
        return ok({ id: pro.id, supprime: true })
      }
    }
  } catch (e) {
    console.error("admin pros PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
