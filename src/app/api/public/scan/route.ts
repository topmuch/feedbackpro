// ============================================================
// API publique - Infos de la ZONE pour la page de scan
// POST /api/public/scan  { qrToken }
// → { zone: { nom, description }, pro: { nomEtablissement, logoUrl, recompense, whatsapp },
//     tagsPositifs: string[], tagsNegatifs: string[] }
// 404 si le token est inconnu.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { scanSchema, firstError } from "@/lib/validation"
import { parseJsonArray } from "@/lib/ia"

export async function POST(req: NextRequest) {
  try {
    const parsed = scanSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail(firstError(parsed.error), 400)
    const { qrToken } = parsed.data

    // Résolution de la zone scannée + établissement propriétaire
    const zone = await db.zone.findUnique({
      where: { qrToken },
      include: { pro: true },
    })

    if (!zone) return fail("QR code invalide ou expiré", 404)

    return ok({
      zone: { nom: zone.nom, description: zone.description },
      pro: {
        nomEtablissement: zone.pro.nomEtablissement,
        logoUrl: zone.pro.logoUrl,
        recompense: zone.pro.recompense,
        // Numéro utilisé par la page de scan pour construire le lien
        // « Envoyer via WhatsApp » (canalChoisi = "whatsapp")
        whatsapp: zone.pro.whatsapp,
      },
      tagsPositifs: parseJsonArray(zone.tagsPositifs),
      tagsNegatifs: parseJsonArray(zone.tagsNegatifs),
    })
  } catch (e) {
    console.error("scan error", e)
    return fail("Erreur serveur", 500)
  }
}
