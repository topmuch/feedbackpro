// ============================================================
// API Publique - Loterie (Scratch & Win) — module "loterie"
// ------------------------------------------------------------
// POST /api/public/loterie
//   body: { qrToken, retourId }
//   → { gagne: boolean, gain: string, code: string | null }
//
// Comportement :
//   1. Vérifie que le module "loterie" est actif côté serveur
//      (sinon 404 — la loterie ne doit pas être accessible).
//   2. Résout le Pro via le qrToken de la zone scannée.
//   3. Exige que le Pro ait une récompense active (recompenseActive)
//      — sinon on renvoie gagne=false sans erreur (le client ne gagne
//      pas, mais son retour est bien enregistré).
//   4. Tire au sort avec une probabilité de gain = config.tauxGain
//      (défaut 30 %). Si gagne, on tire un gain dans config.gains.
//   5. Crée un enregistrement GagnantLoterie (audit) et marque le
//      Retour.recompenseUtilisee = true.
//
// Pas d'authentification : la route est publique (le client mystère
// vient de scanner un QR). On se fie au retourId + qrToken pour
// éviter qu'un même retour déclenche plusieurs tirages.
// ============================================================

import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { getModuleActif, getModuleConfig, MODULE_KEYS } from "@/lib/modules"
import { z } from "zod"

const bodySchema = z.object({
  qrToken: z.string().trim().min(1),
  retourId: z.string().trim().min(1),
})

/** Type de la config du module loterie. */
type CfgLoterie = {
  tauxGain?: number
  gains?: string[]
}

/** Génère un code promo court et lisible (ex : FP-X4K2). */
function genererCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  let out = "FP-"
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    // ---------- 1. Vérifie que le module est actif ----------
    const moduleActif = await getModuleActif(MODULE_KEYS.LOTERIE)
    if (!moduleActif) {
      return fail("Loterie désactivée", 404)
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return fail("Paramètres invalides", 400)
    const { qrToken, retourId } = parsed.data

    // ---------- 2. Résolution Pro via qrToken ----------
    const zone = await db.zone.findUnique({
      where: { qrToken },
      select: { id: true, proId: true },
    })
    if (!zone) return fail("QR code invalide", 404)

    // ---------- 3. Vérifie que le retour existe et appartient au Pro ----------
    const retour = await db.retour.findUnique({
      where: { id: retourId },
      select: { id: true, proId: true, recompenseUtilisee: true },
    })
    if (!retour || retour.proId !== zone.proId) {
      return fail("Retour introuvable pour cette zone", 404)
    }

    // ---------- 4. Évite un double-tirage sur le même retour ----------
    const dejaGagnant = await db.gagnantLoterie.findFirst({
      where: { retourId: retour.id },
      select: { id: true, gain: true, code: true },
    })
    if (dejaGagnant) {
      // Retourne le même résultat (idempotence) — pas de second tirage
      return ok({
        gagne: true,
        gain: dejaGagnant.gain,
        code: dejaGagnant.code,
        dejaTire: true,
      })
    }
    if (retour.recompenseUtilisee) {
      // Le retour a déjà été utilisé pour une récompense — on renvoie perdant
      return ok({ gagne: false, gain: "", code: null, dejaTire: true })
    }

    // ---------- 5. Charge le Pro + config du module ----------
    const pro = await db.pro.findUnique({
      where: { id: zone.proId },
      select: { id: true, recompenseActive: true, recompense: true, recompenseCode: true },
    })
    if (!pro) return fail("Établissement introuvable", 404)

    // Si le Pro n'a PAS de récompense configurée → pas de loterie (perdant)
    if (!pro.recompenseActive || !pro.recompense) {
      return ok({ gagne: false, gain: "", code: null })
    }

    const cfg = await getModuleConfig<CfgLoterie>(MODULE_KEYS.LOTERIE)
    const tauxGain = typeof cfg?.tauxGain === "number" && cfg.tauxGain >= 0 && cfg.tauxGain <= 100
      ? cfg.tauxGain
      : 30
    const gainsPossibles = Array.isArray(cfg?.gains) && cfg.gains.length > 0
      ? (cfg!.gains as string[])
      : ["☕ Café offert", " dessert offert", "10 % de réduction", "Bon d'achat 5 €"]

    // ---------- 6. Tirage aléatoire ----------
    const tirage = Math.random() * 100
    const gagne = tirage < tauxGain

    // Marque le retour comme ayant utilisé sa récompense (anti double-tirage)
    await db.retour.update({
      where: { id: retour.id },
      data: { recompenseUtilisee: true },
    })

    if (!gagne) {
      return ok({ gagne: false, gain: "", code: null })
    }

    // ---------- 7. Gagnant : choisit un gain + génère un code ----------
    const gainTire = gainsPossibles[Math.floor(Math.random() * gainsPossibles.length)]
    // Si le Pro a déjà un code promo configuré, on l'utilise ; sinon on génère
    const code = pro.recompenseCode?.trim() || genererCode()

    await db.gagnantLoterie.create({
      data: {
        proId: pro.id,
        retourId: retour.id,
        gain: gainTire,
        code,
      },
    })

    return ok({
      gagne: true,
      gain: gainTire,
      code,
      dejaTire: false,
    })
  } catch (e) {
    console.error("loterie error", e)
    return fail("Erreur serveur", 500)
  }
}
