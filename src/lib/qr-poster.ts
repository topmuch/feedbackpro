// ============================================================
// FeedbackPro - Générateur d'affiche QR code (style FeedbackPro)
// ------------------------------------------------------------
// Dessine une affiche portrait sur <canvas> avec :
//   1. Titre "# VOTRE AVIS COMPTE !" (bandeau bleu)
//   2. Logo FeedbackPro
//   3. 4 icônes (plats, personnel, service, dysfonctionnements)
//   4. Phrase d'appel
//   5. QR code centré (contour bleu arrondi)
//   6. CTA "SCANNER POUR DONNER MON AVIS"
//   7. Vague bleue + liseré jaune en bas
//
// Export PNG (canvas.toDataURL) et PDF (jspdf).
// ============================================================

import QRCode from "qrcode"
import jsPDF from "jspdf"

const BLEU = "#002e85"
const JAUNE = "#F5B301"
const BLANC = "#FFFFFF"
const GRIS_BLEU = "#E3E8F5"

type OptionsPoster = {
  qrDataUrl: string // data URL du QR code (généré par qrcode.toDataURL)
  nomEtablissement: string
  zoneNom?: string
  format: "A4" | "A5"
}

/**
 * Dessine l'affiche complète sur un canvas et retourne le data URL PNG.
 */
export async function genererAffichePng(opts: OptionsPoster): Promise<string> {
  const { qrDataUrl, nomEtablissement, zoneNom, format } = opts

  // Dimensions du canvas (haute résolution pour impression)
  const largeur = format === "A4" ? 1240 : 874 // ~297mm à 150dpi / ~210mm
  const hauteur = format === "A4" ? 1754 : 1238 // ~420mm / ~297mm

  const canvas = document.createElement("canvas")
  canvas.width = largeur
  canvas.height = hauteur
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas non supporté")

  // ---------- Fond blanc ----------
  ctx.fillStyle = BLANC
  ctx.fillRect(0, 0, largeur, hauteur)

  // ---------- 1. Titre "# VOTRE AVIS COMPTE !" ----------
  const titreY = 80
  const titreH = 70
  const titreW = largeur * 0.7
  const titreX = (largeur - titreW) / 2

  // Bandeau bleu arrondi (pill)
  ctx.fillStyle = BLEU
  roundRect(ctx, titreX, titreY, titreW, titreH, titreH / 2)
  ctx.fill()

  // Texte "# VOTRE AVIS" (blanc) + "COMPTE !" (jaune)
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `italic bold ${format === "A4" ? 32 : 24}px Inter, sans-serif`
  const cy = titreY + titreH / 2
  const cx = largeur / 2

  // Mesurer pour positionner les deux parties
  const part1 = "# VOTRE AVIS "
  const part2 = "COMPTE !"
  const w1 = ctx.measureText(part1).width
  const w2 = ctx.measureText(part2).width
  const totalW = w1 + w2
  const startX = cx - totalW / 2

  ctx.textAlign = "left"
  ctx.fillStyle = BLANC
  ctx.fillText(part1, startX, cy)
  ctx.fillStyle = JAUNE
  ctx.fillText(part2, startX + w1, cy)

  // Arc jaune sous le titre
  ctx.strokeStyle = JAUNE
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy + titreH / 2 + 10, 60, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.stroke()

  // ---------- 2. Logo FeedbackPro ----------
  const logoY = titreY + titreH + 50
  ctx.textAlign = "center"
  ctx.fillStyle = BLEU
  ctx.font = `bold ${format === "A4" ? 36 : 28}px Inter, sans-serif`
  ctx.fillText("FeedbackPro", cx, logoY)

  // Swoosh bleu sous le logo
  ctx.strokeStyle = BLEU
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, logoY + 15, 80, 0.1 * Math.PI, 0.9 * Math.PI)
  ctx.stroke()

  // ---------- 3. 4 icônes en ligne ----------
  const iconY = logoY + 60
  const iconSize = format === "A4" ? 60 : 48
  const iconSpacing = largeur * 0.18
  const iconStartX = cx - iconSpacing * 1.5
  const labels = ["Plats", "Personnel", "Service", "Dysfonct."]

  for (let i = 0; i < 4; i++) {
    const ix = iconStartX + i * iconSpacing

    // Cercle bleu dégradé
    const grad = ctx.createRadialGradient(ix, iconY, 5, ix, iconY, iconSize / 2)
    grad.addColorStop(0, "#1a4ba8")
    grad.addColorStop(1, BLEU)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(ix, iconY, iconSize / 2, 0, 2 * Math.PI)
    ctx.fill()

    // Icône (emoji simple pour rester léger)
    ctx.font = `${iconSize * 0.5}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = BLANC
    const emojis = ["🍽️", "👥", "👍", "⚠️"]
    ctx.fillText(emojis[i], ix, iconY)

    // Label sous l'icône
    ctx.font = `${format === "A4" ? 14 : 11}px Inter, sans-serif`
    ctx.fillStyle = BLEU
    ctx.fillText(labels[i], ix, iconY + iconSize / 2 + 20)

    // Séparateur vertical
    if (i < 3) {
      ctx.strokeStyle = BLEU
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ix + iconSpacing / 2, iconY - iconSize / 2)
      ctx.lineTo(ix + iconSpacing / 2, iconY + iconSize / 2)
      ctx.stroke()
    }
  }

  // ---------- 4. Phrase d'appel ----------
  const phraseY = iconY + iconSize / 2 + 70
  ctx.font = `bold ${format === "A4" ? 26 : 20}px Inter, sans-serif`
  ctx.fillStyle = BLEU
  ctx.textAlign = "center"
  ctx.fillText("Scannez et contribuez à", cx, phraseY)
  ctx.fillText("améliorer votre expérience.", cx, phraseY + 35)

  // Arc jaune sous la phrase
  ctx.strokeStyle = JAUNE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, phraseY + 55, 50, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.stroke()

  // ---------- 5. QR code centré ----------
  const qrSize = format === "A4" ? 400 : 300
  const qrX = (largeur - qrSize) / 2
  const qrY = phraseY + 80

  // Contour bleu arrondi
  const padding = 15
  ctx.fillStyle = BLEU
  roundRect(ctx, qrX - padding, qrY - padding, qrSize + padding * 2, qrSize + padding * 2, 30)
  ctx.fill()

  // Fond blanc intérieur
  ctx.fillStyle = BLANC
  roundRect(ctx, qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 20)
  ctx.fill()

  // Dessiner le QR code
  const qrImg = new Image()
  qrImg.src = qrDataUrl
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve()
    qrImg.onerror = reject
  })
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // Nom établissement + zone sous le QR
  ctx.font = `bold ${format === "A4" ? 18 : 14}px Inter, sans-serif`
  ctx.fillStyle = BLEU
  ctx.textAlign = "center"
  ctx.fillText(nomEtablissement, cx, qrY + qrSize + 35)
  if (zoneNom) {
    ctx.font = `${format === "A4" ? 14 : 11}px Inter, sans-serif`
    ctx.fillStyle = "#666"
    ctx.fillText(`Zone : ${zoneNom}`, cx, qrY + qrSize + 55)
  }

  // ---------- 6. CTA "SCANNER POUR DONNER MON AVIS" ----------
  const ctaY = qrY + qrSize + 90
  const ctaH = 55
  const ctaW = largeur * 0.6
  const ctaX = (largeur - ctaW) / 2

  ctx.fillStyle = BLEU
  roundRect(ctx, ctaX, ctaY, ctaW, ctaH, ctaH / 2)
  ctx.fill()

  // Icône smartphone (emoji)
  ctx.font = `${ctaH * 0.5}px sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("📱", ctaX + 40, ctaY + ctaH / 2)

  // Séparateur vertical jaune
  ctx.strokeStyle = JAUNE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ctaX + 70, ctaY + 15)
  ctx.lineTo(ctaX + 70, ctaY + ctaH - 15)
  ctx.stroke()

  // Texte CTA
  ctx.font = `italic bold ${format === "A4" ? 16 : 13}px Inter, sans-serif`
  ctx.fillStyle = BLANC
  ctx.fillText("SCANNER POUR", ctaX + ctaW / 2 + 15, ctaY + ctaH / 2 - 10)
  ctx.fillStyle = JAUNE
  ctx.fillText("DONNER MON AVIS", ctaX + ctaW / 2 + 15, ctaY + ctaH / 2 + 12)

  // ---------- 7. Vague bleue + liseré jaune en bas ----------
  const vagueY = hauteur - 150

  // Liseré jaune ondulé
  ctx.strokeStyle = JAUNE
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(0, vagueY - 10)
  for (let x = 0; x <= largeur; x += 20) {
    const y = vagueY - 10 + Math.sin(x / 80) * 8
    ctx.lineTo(x, y)
  }
  ctx.stroke()

  // Vague bleue (remplissage)
  ctx.fillStyle = BLEU
  ctx.beginPath()
  ctx.moveTo(0, vagueY)
  for (let x = 0; x <= largeur; x += 20) {
    const y = vagueY + Math.sin(x / 80) * 12
    ctx.lineTo(x, y)
  }
  ctx.lineTo(largeur, hauteur)
  ctx.lineTo(0, hauteur)
  ctx.closePath()
  ctx.fill()

  // "Merci pour votre confiance !" (blanc, style script)
  ctx.font = `italic ${format === "A4" ? 22 : 18}px Georgia, serif`
  ctx.fillStyle = BLANC
  ctx.textAlign = "center"
  ctx.fillText("Merci pour votre confiance !", cx, hauteur - 60)

  // Petit trait jaune sous "confiance"
  ctx.strokeStyle = JAUNE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 60, hauteur - 45)
  ctx.lineTo(cx + 60, hauteur - 45)
  ctx.stroke()

  return canvas.toDataURL("image/png")
}

/**
 * Génère un PDF (A4 ou A5) contenant l'affiche.
 */
export async function genererAffichePdf(opts: OptionsPoster): Promise<void> {
  const pngDataUrl = await genererAffichePng(opts)
  const { format } = opts

  const orientation = "portrait"
  const pdf = new jsPDF({ orientation, unit: "mm", format: format.toLowerCase() as "a4" | "a5" })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  pdf.addImage(pngDataUrl, "PNG", 0, 0, pageW, pageH)
  pdf.save(`affiche-feedbackpro-${opts.zoneNom ?? "qr"}-${format}.pdf`)
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

// ---------- Utilitaire : rectangle arrondi ----------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}
