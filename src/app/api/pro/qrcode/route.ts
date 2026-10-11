// ============================================================
// API Pro - QR Code d'une ZONE
// GET /api/pro/qrcode?zoneId=xxx[&taille=apercu]
// → { zone, urlScan: `${APP_URL}/r/<qrToken>`, pngDataUrl }
// PNG 1000×1000 (ou 320×320 si taille=apercu, pour les vignettes des
// cartes de l'onglet QR Codes), avec le logo de l'établissement composé
// au centre (sharp côté serveur ; tolérance d'erreur H du QR).
// ============================================================

import { NextRequest } from "next/server"
import QRCode from "qrcode"
import sharp from "sharp"
import { db } from "@/lib/db"
import { ok, fail } from "@/lib/session"
import { requirePro, unauthorized } from "@/lib/guards"
import { serialiserZone } from "@/lib/serialise"

const TAILLE_QR = 1000
const TAILLE_APERCU = 320 // vignette pour les cartes de l'onglet QR Codes
const BOITE_LOGO = 240 // ~24 % de la surface : marge sous la limite de 30 %
const MARGE_BLANCHE = 14

/** Charge le logo (data URL ou https) en buffer ; null si indisponible */
async function chargerLogo(logoUrl: string | null | undefined): Promise<Buffer | null> {
  if (!logoUrl) return null
  try {
    if (logoUrl.startsWith("data:")) {
      const base64 = logoUrl.split(",")[1] ?? ""
      return base64 ? Buffer.from(base64, "base64") : null
    }
    if (/^https:\/\//.test(logoUrl)) {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    }
    return null
  } catch {
    return null
  }
}

/** Compose le logo arrondi sur fond blanc au centre du QR (repli : QR brut) */
async function composerAvecLogo(qrDataUrl: string, logoBuf: Buffer): Promise<string> {
  const base64 = qrDataUrl.split(",")[1] ?? ""
  const qr = Buffer.from(base64, "base64")

  // Logo redimensionné puis masqué avec coins arrondis (alpha via dest-in)
  const masque = Buffer.from(
    `<svg width="${BOITE_LOGO}" height="${BOITE_LOGO}"><rect width="100%" height="100%" rx="20" fill="#ffffff"/></svg>`
  )
  const logoArrondi = await sharp(logoBuf)
    .resize(BOITE_LOGO, BOITE_LOGO, { fit: "cover" })
    .composite([{ input: masque, blend: "dest-in" }])
    .png()
    .toBuffer()

  // Fond blanc arrondi légèrement plus grand : respiration autour du logo
  const cote = BOITE_LOGO + MARGE_BLANCHE * 2
  const fond = Buffer.from(
    `<svg width="${cote}" height="${cote}"><rect width="100%" height="100%" rx="26" fill="#ffffff"/></svg>`
  )
  const final = await sharp(qr)
    .composite([
      { input: fond, left: Math.round((TAILLE_QR - cote) / 2), top: Math.round((TAILLE_QR - cote) / 2) },
      { input: logoArrondi, left: Math.round((TAILLE_QR - BOITE_LOGO) / 2), top: Math.round((TAILLE_QR - BOITE_LOGO) / 2) },
    ])
    .png()
    .toBuffer()

  return `data:image/png;base64,${final.toString("base64")}`
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePro(req)
    if (!ctx) return unauthorized()

    const zoneId = req.nextUrl.searchParams.get("zoneId")
    if (!zoneId) return fail("zoneId manquant", 400)

    const zone = await db.zone.findFirst({ where: { id: zoneId, proId: ctx.pro.id } })
    if (!zone) return fail("Zone introuvable", 404)

    // URL publique de scan : forme courte /r/<qrToken> (rewritée par next.config)
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "")
    const urlScan = `${appUrl}/r/${zone.qrToken}`

    // PNG 1000×1000, tolérance H (compatible logo central)
    const dataUrl = await QRCode.toDataURL(urlScan, {
      width: TAILLE_QR,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0f172a", light: "#ffffff" },
    })

    // Composition du logo côté serveur ; en cas d'échec on livre le QR brut
    let pngDataUrl = dataUrl
    try {
      const logo = await chargerLogo(ctx.pro.logoUrl)
      if (logo) pngDataUrl = await composerAvecLogo(dataUrl, logo)
    } catch (e) {
      console.warn("Composition du logo sur le QR impossible (QR livré sans logo)", e)
    }

    // Vignette 320×320 pour les aperçus de cartes (Session 3) :
    // noyau "nearest" → bords de modules nets (pas d'anti-aliasing),
    // PNG bicolore léger (~8 Ko) et scannable même en petit
    if (req.nextUrl.searchParams.get("taille") === "apercu") {
      try {
        const base64 = pngDataUrl.split(",")[1] ?? ""
        const petit = await sharp(Buffer.from(base64, "base64"))
          .resize(TAILLE_APERCU, TAILLE_APERCU, { kernel: "nearest" })
          .png()
          .toBuffer()
        pngDataUrl = `data:image/png;base64,${petit.toString("base64")}`
      } catch (e) {
        console.warn("Redimensionnement de l'aperçu impossible (QR livré en 1000px)", e)
      }
    }

    return ok({ zone: serialiserZone(zone), urlScan, pngDataUrl })
  } catch (e) {
    console.error("qrcode error", e)
    return fail("Erreur lors de la génération du QR code", 500)
  }
}
