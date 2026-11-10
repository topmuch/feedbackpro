// ============================================================
// API publique (Session 3) - Infos de la ZONE par son QR token
// GET /api/zone/[qrToken]
// → { zone: { nom, description }, pro: { nomEtablissement, logoUrl,
//     recompense, whatsapp }, tagsPositifs: string[], tagsNegatifs: string[] }
// 404 si le token est inconnu.
//
// Contrat identique à POST /api/public/scan : la page de scan /r/<token>
// peut indifféremment utiliser l'un ou l'autre (GET = forme canonique
// demandée par la spec Session 3, POST = compatibilité historique).
// Aucune donnée sensible n'est exposée (pas d'email, pas d'identifiant Pro).
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { parseJsonArray } from "@/lib/ia"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ qrToken: string }> }
) {
  try {
    const { qrToken } = await params
    if (!qrToken || qrToken.length < 4) return fail("QR code invalide", 400)

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
        // Teaser de récompense (étape 3 du scan) — seulement si activée
        recompense: zone.pro.recompenseActive && zone.pro.recompense ? zone.pro.recompense : null,
        // Numéro utilisé pour le bouton « Envoyer via WhatsApp »
        whatsapp: zone.pro.whatsapp,
        // Signature personnalisée du pied de message WhatsApp du Pro
        messageWhatsapp: zone.pro.messageWhatsapp,
      },
      tagsPositifs: parseJsonArray(zone.tagsPositifs),
      tagsNegatifs: parseJsonArray(zone.tagsNegatifs),
    })
  } catch (e) {
    console.error("zone GET error", e)
    return fail("Erreur serveur", 500)
  }
}
