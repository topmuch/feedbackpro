// ============================================================
// API Pro - Gestion des ZONES (points de contact avec QR code)
// GET    /api/pro/zones → { zones: [...] } (nbRetours + noteMoyenne)
// POST   /api/pro/zones { nom, description?, tagsPositifs?, tagsNegatifs? }
//        → 403 si la limite de zones du plan est atteinte
// PATCH  /api/pro/zones { id, nom?, description?, tagsPositifs?, tagsNegatifs? }
// DELETE /api/pro/zones?id=xxx
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserZone } from "@/lib/serialise"
import { PLAN_LIMITS, type PlanId } from "@/lib/constants"
import { zoneCreateSchema, zoneUpdateSchema, firstError } from "@/lib/validation"
import type { Prisma } from "@prisma/client"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const zones = await db.zone.findMany({
      where: { proId: ctx.pro.id },
      orderBy: { createdAt: "asc" },
      include: { retours: { select: { note: true } } },
    })

    return ok({
      zones: zones.map((z) => ({
        ...serialiserZone(z),
        nbRetours: z.retours.length,
        noteMoyenne: z.retours.length
          ? Number((z.retours.reduce((s, r) => s + r.note, 0) / z.retours.length).toFixed(2))
          : 0,
      })),
    })
  } catch (e) {
    console.error("zones GET error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = zoneCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)

    // Limite du plan : PLAN_LIMITS[plan].zones
    const limite = PLAN_LIMITS[(ctx.pro.plan as PlanId) ?? "STARTER"].zones
    const nbZones = await db.zone.count({ where: { proId: ctx.pro.id } })
    if (nbZones >= limite) {
      return fail(
        `Votre plan ${ctx.pro.plan} est limité à ${limite} zone(s). Passez au plan supérieur pour auditer davantage de points de contact.`,
        403
      )
    }

    const zone = await db.zone.create({
      data: {
        proId: ctx.pro.id,
        nom: parsed.data.nom,
        description: parsed.data.description || null,
        // Tags par défaut : ceux de la demande, sinon le catalogue complet
        tagsPositifs: JSON.stringify(parsed.data.tagsPositifs ?? []),
        tagsNegatifs: JSON.stringify(parsed.data.tagsNegatifs ?? []),
      },
    })

    return ok({ zone: serialiserZone(zone) }, 201)
  } catch (e) {
    console.error("zones POST error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const parsed = zoneUpdateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { id, ...champs } = parsed.data

    const zone = await db.zone.findFirst({ where: { id, proId: ctx.pro.id } })
    if (!zone) return fail("Zone introuvable", 404)

    const data: Prisma.ZoneUpdateInput = {}
    if (champs.nom !== undefined) data.nom = champs.nom
    if (champs.description !== undefined) data.description = champs.description || null
    if (champs.tagsPositifs !== undefined) data.tagsPositifs = JSON.stringify(champs.tagsPositifs)
    if (champs.tagsNegatifs !== undefined) data.tagsNegatifs = JSON.stringify(champs.tagsNegatifs)

    const updated = await db.zone.update({ where: { id }, data })
    return ok({ zone: serialiserZone(updated) })
  } catch (e) {
    console.error("zones PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const id = req.nextUrl.searchParams.get("id")
    if (!id) return fail("ID manquant", 400)

    const zone = await db.zone.findFirst({ where: { id, proId: ctx.pro.id } })
    if (!zone) return fail("Zone introuvable", 404)

    // Suppression en cascade : les retours de la zone sont supprimés
    // avec elle (onDelete: Cascade) — ils n'ont plus de sens sans elle.
    await db.zone.delete({ where: { id } })
    return ok({ deleted: true })
  } catch (e) {
    console.error("zones DELETE error", e)
    return fail("Erreur serveur", 500)
  }
}
