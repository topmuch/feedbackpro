// ============================================================
// API publique - Infos du commerce pour la page de scan
// GET /api/public/scan?token=xxxx
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")
    if (!token) return fail("Token manquant", 400)

    const pro = await db.pro.findUnique({
      where: { qrToken: token },
      include: {
        boutiques: {
          orderBy: { createdAt: "asc" },
          include: { employes: { where: { actif: true }, select: { id: true, nom: true, poste: true } } },
        },
      },
    })

    if (!pro) return fail("QR code invalide ou expiré", 404)

    return ok({
      nomCommerce: pro.nomCommerce,
      categorie: pro.categorie,
      ville: pro.ville,
      logoUrl: pro.logoUrl,
      googleUrl: pro.googleUrl,
      whatsapp: pro.whatsapp,
      messageWhatsapp: pro.messageWhatsapp,
      employes: pro.boutiques[0]?.employes ?? [],
    })
  } catch (e) {
    console.error("scan error", e)
    return fail("Erreur serveur", 500)
  }
}
