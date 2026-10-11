// ============================================================
// API Pro - Gestion des employés (affectés à des zones)
// GET    /api/pro/employes → { employes: [...] } (zones + stats)
// POST   /api/pro/employes { nom, poste?, zoneIds? } → 403 si limite du plan
// PATCH  /api/pro/employes { id, nom?, poste?, zoneIds?, actif? }
// DELETE /api/pro/employes?id=xxx
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { PLAN_LIMITS, type PlanId } from "@/lib/constants"
import { parseJsonArray } from "@/lib/ia"
import { employeCreateSchema, employeUpdateSchema, firstError } from "@/lib/validation"

/** Liste complète : zones affectées + stats de performance par employé */
async function liste(proId: string) {
  const employes = await db.employe.findMany({
    where: { proId },
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
    include: {
      retours: { select: { note: true } },
    },
  })
  // Zones de l'établissement pour résoudre les ids → noms
  const zones = await db.zone.findMany({
    where: { proId },
    select: { id: true, nom: true },
    orderBy: { createdAt: "asc" },
  })

  return employes.map((e) => {
    const zoneIds = parseJsonArray(e.zoneIds)
    const positifs = e.retours.filter((r) => r.note >= 4).length
    const negatifs = e.retours.filter((r) => r.note <= 3).length
    const noteMoy = e.retours.length
      ? Number((e.retours.reduce((s, r) => s + r.note, 0) / e.retours.length).toFixed(2))
      : 0
    return {
      id: e.id,
      nom: e.nom,
      poste: e.poste,
      zoneIds,
      actif: e.actif,
      zones: zones.filter((z) => zoneIds.includes(z.id)).map((z) => ({ id: z.id, nom: z.nom })),
      stats: { positifs, negatifs, noteMoy },
    }
  })
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()
    return ok({ employes: await liste(ctx.pro.id) })
  } catch (e) {
    console.error("employes GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = employeCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)

    // Limite selon le plan
    const limite = PLAN_LIMITS[(ctx.pro.plan as PlanId) ?? "STARTER"].employes
    const nbActifs = await db.employe.count({ where: { proId: ctx.pro.id, actif: true } })
    if (nbActifs >= limite) {
      return fail(
        `Votre plan ${ctx.pro.plan} est limité à ${limite} employés actifs. Passez au plan supérieur pour gérer toute votre équipe.`,
        403
      )
    }

    // Les zones affectées doivent appartenir à l'établissement
    const zoneIds = parsed.data.zoneIds ?? []
    const zonesValides = await db.zone.count({ where: { proId: ctx.pro.id, id: { in: zoneIds } } })
    if (zonesValides !== zoneIds.length) return fail("Une des zones sélectionnées est invalide", 400)

    await db.employe.create({
      data: {
        proId: ctx.pro.id,
        nom: parsed.data.nom,
        poste: parsed.data.poste || null,
        zoneIds: JSON.stringify(zoneIds),
        actif: true,
      },
    })
    return ok({ employes: await liste(ctx.pro.id) }, 201)
  } catch (e) {
    console.error("employes POST error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = employeUpdateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { id, ...champs } = parsed.data

    const existing = await db.employe.findFirst({ where: { id, proId: ctx.pro.id } })
    if (!existing) return fail("Employé introuvable", 404)

    const data: { nom?: string; poste?: string | null; zoneIds?: string; actif?: boolean } = {}
    if (champs.nom !== undefined) data.nom = champs.nom
    if (champs.poste !== undefined) data.poste = champs.poste
    if (champs.actif !== undefined) data.actif = champs.actif
    if (champs.zoneIds !== undefined) {
      // Vérifie l'appartenance des zones
      const zonesValides = await db.zone.count({
        where: { proId: ctx.pro.id, id: { in: champs.zoneIds } },
      })
      if (zonesValides !== champs.zoneIds.length) return fail("Une des zones sélectionnées est invalide", 400)
      data.zoneIds = JSON.stringify(champs.zoneIds)
    }

    await db.employe.update({ where: { id }, data })
    return ok({ employes: await liste(ctx.pro.id) })
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
    const existing = await db.employe.findFirst({ where: { id, proId: ctx.pro.id } })
    if (!existing) return fail("Employé introuvable", 404)

    // Détache les retours avant suppression (conservation de l'historique)
    await db.retour.updateMany({ where: { employeId: id }, data: { employeId: null } })
    await db.employe.delete({ where: { id } })
    return ok({ employes: await liste(ctx.pro.id) })
  } catch (e) {
    console.error("employes DELETE error", e)
    return fail("Erreur serveur", 500)
  }
}
