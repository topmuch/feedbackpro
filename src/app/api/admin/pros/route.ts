// ============================================================
// API Superadmin - Gestion des commerçants
// GET   /api/admin/pros?plan=&ville=&q=
// PATCH /api/admin/pros { proId, plan? }
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

    const body = await req.json()
    const proId = String(body.proId || "")
    if (!proId) return fail("proId manquant", 400)

    const data: { plan?: string; onboardingDone?: boolean } = {}
    if (body.plan) {
      if (!PLANS[body.plan as keyof typeof PLANS]) return fail("Plan invalide", 400)
      data.plan = body.plan
    }
    if (typeof body.onboardingDone === "boolean") data.onboardingDone = body.onboardingDone

    const updated = await db.pro.update({ where: { id: proId }, data })
    return ok({ id: updated.id, plan: updated.plan })
  } catch (e) {
    console.error("admin pros PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
