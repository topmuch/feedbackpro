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

  // ---------- 2. Insérer le QR code dans le cadre bleu ----------
  // Coordonnées du cadre QR dans l'image originale (1024×1536) :
  //   Bordure intérieure : X 273-751, Y 561-997 (≈ 478×436px)
  // On convertit en proportions pour s'adapter à toute taille de canvas.
  const cadreX1 = 273 / 1024 // ~26.7%
  const cadreX2 = 751 / 1024 // ~73.3%
  const cadreY1 = 561 / 1536 // ~36.5%
  const cadreY2 = 997 / 1536 // ~64.9%

  const cadreW = (cadreX2 - cadreX1) * largeur // largeur du cadre en px
  const cadreH = (cadreY2 - cadreY1) * hauteur // hauteur du cadre en px

  // Le QR code est carré : on prend la plus petite dimension du cadre
  // avec une petite marge intérieure pour ne pas toucher les bords
  const marge = 8 // px de marge intérieure
  const qrSize = Math.min(cadreW, cadreH) - marge * 2
  const qrX = cadreX1 * largeur + (cadreW - qrSize) / 2
  const qrY = cadreY1 * hauteur + (cadreH - qrSize) / 2

  // Dessiner un fond blanc pour assurer la lisibilité
  ctx.fillStyle = BLANC
  ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10)

  // Dessiner le QR code
  const qrImg = await loadImage(qrDataUrl)
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // ---------- 3. Nom établissement + zone sous le cadre QR ----------
  // Le texte va juste sous le cadre bleu (à ~65% de la hauteur)
  const texteY = cadreY2 * hauteur + 25
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
