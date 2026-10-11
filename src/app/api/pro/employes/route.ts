// ============================================================
// API Pro - Gestion des employés
// GET    /api/pro/employes          (liste + mini stats)
// POST   /api/pro/employes          { nom, poste? }
// PATCH  /api/pro/employes          { id, nom?, poste?, actif? }
// DELETE /api/pro/employes?id=xxx
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { PLAN_LIMITS, PlanId } from "@/lib/constants"

async function liste(ctx: NonNullable<Awaited<ReturnType<typeof requirePro>>>) {
  const employes = await db.employe.findMany({
    where: { boutiqueId: ctx.boutique.id },
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
    include: { retours: { select: { note: true, tags: true } } },
  })
  return employes.map((e) => {
    const nb = e.retours.length
    const avg = nb ? e.retours.reduce((s, r) => s + r.note, 0) / nb : 0
    let mentionsPositives = 0
    let mentionsNegatives = 0
    for (const r of e.retours) {
      const tags = JSON.parse(r.tags) as string[]
      if (r.note >= 4) mentionsPositives += tags.length
      else mentionsNegatives += tags.length
    }
    return {
      id: e.id,
      nom: e.nom,
      poste: e.poste,
      actif: e.actif,
      nbRetours: nb,
      noteMoyenne: Number(avg.toFixed(2)),
      mentionsPositives,
      mentionsNegatives,
    }
  })
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    return ok({ employes: await liste(ctx), plan: ctx.pro.plan })
  } catch (e) {
    console.error("employes GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json()
    const nom = String(body.nom || "").trim()
    const poste = body.poste ? String(body.poste).trim() : null
    if (nom.length < 2) return fail("Indiquez le nom de l'employé", 400)

    // Limite selon le plan
    const limite = PLAN_LIMITS[(ctx.pro.plan as PlanId) || "STARTER"].employes
    const nbActifs = await db.employe.count({ where: { boutiqueId: ctx.boutique.id, actif: true } })
    if (nbActifs >= limite) {
      return fail(
        `Votre plan ${ctx.pro.plan} est limité à ${limite} employés actifs. Passez au plan supérieur pour en ajouter.`,
        403
      )
    }

    await db.employe.create({ data: { boutiqueId: ctx.boutique.id, nom, poste, actif: true } })
    return ok({ employes: await liste(ctx) })
  } catch (e) {
    console.error("employes POST error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const body = await req.json()
    const id = String(body.id || "")
    const existing = await db.employe.findFirst({ where: { id, boutiqueId: ctx.boutique.id } })
    if (!existing) return fail("Employé introuvable", 404)

    const data: { nom?: string; poste?: string; actif?: boolean } = {}
    if (body.nom && String(body.nom).trim().length >= 2) data.nom = String(body.nom).trim()
    if (typeof body.poste === "string") data.poste = body.poste.trim() || null
    if (typeof body.actif === "boolean") data.actif = body.actif

    await db.employe.update({ where: { id }, data })
    return ok({ employes: await liste(ctx) })
  } catch (e) {
    console.error("employes PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const id = req.nextUrl.searchParams.get("id")
    if (!id) return fail("ID manquant", 400)
    const existing = await db.employe.findFirst({ where: { id, boutiqueId: ctx.boutique.id } })
    if (!existing) return fail("Employé introuvable", 404)

    // Détache les retours avant suppression (conservation de l'historique)
    await db.retour.updateMany({ where: { employeId: id }, data: { employeId: null } })
    await db.employe.delete({ where: { id } })
    return ok({ employes: await liste(ctx) })
  } catch (e) {
    console.error("employes DELETE error", e)
    return fail("Erreur serveur", 500)
  }
}
