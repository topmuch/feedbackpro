// ============================================================
// API Pro - QR Code du commerce
// GET /api/pro/qrcode
// Retourne l'URL de scan + le QR en dataURL PNG haute résolution
// ============================================================

import { NextRequest } from "next/server"
import QRCode from "qrcode"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    // URL publique de scan : forme courte /r/<qrToken> (rewritée vers la page unique)
    const origin = req.nextUrl.origin
    const scanUrl = `${origin}/r/${ctx.pro.qrToken}`

    const dataUrl = await QRCode.toDataURL(scanUrl, {
      width: 1000, // PNG haute résolution (1000x1000 px)
      margin: 2,
      errorCorrectionLevel: "H", // haute tolérance : compatible avec un logo central
      color: { dark: "#0f172a", light: "#ffffff" },
    })

    return ok({ scanUrl, dataUrl, qrToken: ctx.pro.qrToken })
  } catch (e) {
    console.error("qrcode error", e)
    return fail("Erreur lors de la génération du QR code", 500)
  }
}
