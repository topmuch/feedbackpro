// ============================================================
// API Superadmin - Module commandes de supports physiques
// GET   /api/admin/commandes?statut=
// PATCH /api/admin/commandes { id, statut, numeroSuivi? }
//   → le numéro de suivi est EXIGÉ lors du passage au statut EXPEDIE
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requireAdmin, unauthorized } from "@/lib/guards"
import { STATUT_COMMANDE_ORDRE } from "@/lib/constants"
import { adminCommandePatchSchema, firstError } from "@/lib/validation"

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return unauthorized()

    const statut = req.nextUrl.searchParams.get("statut") || ""

    const commandes = await db.commande.findMany({
      include: {
        pro: {
          include: {
            user: { select: { email: true } },
            // Zones du Pro : pour fournir un qrToken de scan imprimable
            // sur le bon / la planche (pro.qrToken = 1re zone, défaut Accueil)
            zones: { select: { id: true, nom: true, qrToken: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const filtered = statut ? commandes.filter((c) => c.statut === statut) : commandes

    return ok({
      commandes: filtered.map((c) => {
        // Zone dédiée si la commande y est rattachée, sinon 1re zone du Pro
        const zone = c.zoneId
          ? (c.pro.zones.find((z) => z.id === c.zoneId) ?? c.pro.zones[0] ?? null)
          : (c.pro.zones[0] ?? null)
        return {
          id: c.id,
          typeSupport: c.typeSupport,
          quantite: c.quantite,
          prixEuros: c.prixEuros,
          adresseLivraison: c.adresseLivraison,
          statut: c.statut,
          numeroSuivi: c.numeroSuivi,
          zoneId: c.zoneId,
          createdAt: c.createdAt,
          pro: {
            id: c.pro.id,
            nomEtablissement: c.pro.nomEtablissement,
            ville: c.pro.ville,
            email: c.pro.user.email,
            // Token de la zone par défaut : sert à générer le QR de vérification
            qrToken: zone?.qrToken ?? null,
          },
          zone: zone ? { id: zone.id, nom: zone.nom, qrToken: zone.qrToken } : null,
        }
      }),
      stats: {
        total: commandes.length,
        aImprimer: commandes.filter((c) => c.statut === "A_IMPRIMER").length,
        enCours: commandes.filter((c) => c.statut !== "LIVRE").length,
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

    const parse = adminCommandePatchSchema.safeParse(await req.json().catch(() => null))
    if (!parse.success) return fail(firstError(parse.error), 400)
    const body = parse.data

    if (!STATUT_COMMANDE_ORDRE.includes(body.statut)) return fail("Statut invalide", 400)
    const existing = await db.commande.findUnique({ where: { id: body.id } })
    if (!existing) return fail("Commande introuvable", 404)

    // Le passage à EXPEDIE exige un numéro de suivi (spécification Session 5)
    if (body.statut === "EXPEDIE" && !body.numeroSuivi?.trim() && !existing.numeroSuivi) {
      return fail("Le numéro de suivi est requis pour expédier une commande", 400)
    }

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
