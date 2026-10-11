// ============================================================
// API Superadmin - Module commandes de supports physiques
// GET   /api/admin/commandes?statut=
// PATCH /api/admin/commandes { id, statut }
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { STATUT_COMMANDE_ORDRE } from "@/lib/constants"

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

    const body = await req.json()
    const id = String(body.id || "")
    const statut = String(body.statut || "")

    if (!STATUT_COMMANDE_ORDRE.includes(statut)) return fail("Statut invalide", 400)
    const existing = await db.commande.findUnique({ where: { id } })
    if (!existing) return fail("Commande introuvable", 404)

    const updated = await db.commande.update({ where: { id }, data: { statut } })
    return ok({ id: updated.id, statut: updated.statut })
  } catch (e) {
    console.error("admin commandes PATCH error", e)
    return fail("Erreur serveur", 500)
  }
}
