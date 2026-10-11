// ============================================================
// API Superadmin - Module commandes de supports physiques
// GET   /api/admin/commandes?statut=
// PATCH /api/admin/commandes { id, statut, numeroSuivi? }
//   numeroSuivi : enregistré uniquement lors du passage au statut EXPEDIE
// ============================================================

import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { STATUT_COMMANDE_ORDRE } from "@/lib/constants"
import { firstError } from "@/lib/validation"

const patchSchema = z.object({
  id: z.string().trim().min(1, "id manquant"),
  statut: z.string().trim().min(1, "Statut manquant"),
  numeroSuivi: z.string().trim().max(100, "Numéro de suivi trop long").optional(),
})

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const statut = req.nextUrl.searchParams.get("statut") || ""

    const commandes = await db.commande.findMany({
      include: { pro: { include: { user: { select: { email: true } } } } },
      orderBy: { createdAt: "desc" },
    })

    const filtered = statut ? commandes.filter((c) => c.statut === statut) : commandes

    return ok({
      commandes: filtered.map((c) => ({
        id: c.id,
        typeSupport: c.typeSupport,
        quantite: c.quantite,
        prixEuros: c.prixEuros,
        adresseLivraison: c.adresseLivraison,
        statut: c.statut,
        numeroSuivi: c.numeroSuivi,
        createdAt: c.createdAt,
        pro: {
          id: c.pro.id,
          nomCommerce: c.pro.nomCommerce,
          ville: c.pro.ville,
          email: c.pro.user.email,
          qrToken: c.pro.qrToken,
        },
      })),
      stats: {
        total: commandes.length,
        aImprimer: commandes.filter((c) => c.statut === "A_IMPRIMER").length,
        chiffreAffaires: commandes.reduce((s, c) => s + c.prixEuros, 0),
      },
    })
  } catch (e) {
    console.error("admin commandes GET error", e)
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

    if (!STATUT_COMMANDE_ORDRE.includes(body.statut)) return fail("Statut invalide", 400)
    const existing = await db.commande.findUnique({ where: { id: body.id } })
    if (!existing) return fail("Commande introuvable", 404)

    // Le numéro de suivi n'a de sens qu'à l'expédition : on l'enregistre (ou on
    // le conserve) uniquement lors du passage au statut EXPEDIE
    const data: { statut: string; numeroSuivi?: string | null } = { statut: body.statut }
    if (body.statut === "EXPEDIE") {
      data.numeroSuivi = body.numeroSuivi?.trim() || existing.numeroSuivi || null
    }

    const updated = await db.commande.update({ where: { id: body.id }, data })
    return ok({ id: updated.id, statut: updated.statut, numeroSuivi: updated.numeroSuivi })
  } catch (e) {
    console.error("admin commandes PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
