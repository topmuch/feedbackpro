// ============================================================
// FeedbackPro - Générateur d'affiche QR code (design original)
// ------------------------------------------------------------
// Utilise l'affiche originale FeedbackPro comme image de fond
// et insère le QR code dans la zone blanche prévue à cet effet.
// Export PNG (canvas.toDataURL).
// ============================================================

import QRCode from "qrcode"

const BLEU = "#002e85"
const BLANC = "#FFFFFF"

type OptionsPoster = {
  qrDataUrl: string // data URL du QR code (généré par qrcode.toDataURL)
  nomEtablissement: string
  zoneNom?: string
  format: "A4" | "A5"
}

/**
 * Charge une image depuis un URL et retourne un HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Dessine l'affiche complète sur un canvas en utilisant l'image originale
 * comme fond, et insère le QR code dans la zone blanche.
 * Retourne le data URL PNG.
 */
export async function genererAffichePng(opts: OptionsPoster): Promise<string> {
  const { qrDataUrl, nomEtablissement, zoneNom, format } = opts

  // Dimensions du canvas : on utilise le ratio de l'image originale (2:3)
  // A4 = 1000×1500, A5 = 700×1050
  const largeur = format === "A4" ? 1000 : 700
  const hauteur = format === "A4" ? 1500 : 1050

  const canvas = document.createElement("canvas")
  canvas.width = largeur
  canvas.height = hauteur
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas non supporté")

  // ---------- 1. Dessiner l'image originale comme fond ----------
  const templateImg = await loadImage("/affiche-template.png")
  ctx.drawImage(templateImg, 0, 0, largeur, hauteur)

  // ---------- 2. Insérer le QR code dans la zone blanche ----------
  // La zone blanche du QR est approximativement centrée horizontalement
  // et située à ~55% de la hauteur. Sa taille est ~40% de la largeur.
  const qrSize = largeur * 0.36
  const qrX = (largeur - qrSize) / 2
  const qrY = hauteur * 0.50

  // Dessiner un fond blanc pour assurer la lisibilité
  ctx.fillStyle = BLANC
  ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10)

  // Dessiner le QR code
  const qrImg = await loadImage(qrDataUrl)
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // ---------- 3. Nom établissement + zone sous le QR ----------
  const texteY = qrY + qrSize + 30
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = BLEU
  ctx.font = `bold ${format === "A4" ? 20 : 16}px Inter, sans-serif`
  ctx.fillText(nomEtablissement, largeur / 2, texteY)

  if (zoneNom) {
    ctx.font = `${format === "A4" ? 14 : 11}px Inter, sans-serif`
    ctx.fillStyle = "#666"
    ctx.fillText(`Zone : ${zoneNom}`, largeur / 2, texteY + 25)
  }

  return canvas.toDataURL("image/png")
}

/**
 * Génère le data URL du QR code via la lib qrcode.
 */
export async function genererQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 800,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: BLEU, light: BLANC },
  })
}
